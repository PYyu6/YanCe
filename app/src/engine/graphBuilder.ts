/**
 * Route Graph Builder
 * ───────────────────
 * Converts detected holds into a directed graph where:
 * - Nodes = holds
 * - Edges = feasible moves (within reach, physically possible)
 *
 * Edge weights encode difficulty, allowing pathfinding to find
 * the easiest sequence from start to top.
 *
 * Inspired by Climbology's Neo4j graph model (holds as nodes, moves as edges).
 */

import { DetectedHold, BodyMeasurements, ReachDifficulty, Limb } from '../types';
import { classifyReach } from './climberModel';

export interface GraphEdge {
  fromId: string;
  toId: string;
  distanceCm: number;
  difficulty: ReachDifficulty;
  weight: number;           // lower = easier move (for pathfinding)
  suggestedLimb: Limb;      // which limb should make this move
  isUpward: boolean;
  isLateral: boolean;
}

export interface RouteGraph {
  nodes: Map<string, DetectedHold>;
  edges: Map<string, GraphEdge[]>;  // holdId → outgoing edges
  startIds: string[];
  topId: string | null;
}

// Weight mapping for pathfinding (lower = prefer)
const DIFFICULTY_WEIGHTS: Record<ReachDifficulty, number> = {
  easy: 1,
  moderate: 3,
  limit: 6,
  dynamic: 10,
  unreachable: Infinity,
};

/**
 * MVP FUSION EXTENSION — hold-type cost modifiers.
 *
 * When the detection pipeline knows what KIND of hold the target is (from the
 * YOLO classes / VLM verification), the reach-difficulty weight is multiplied
 * by this factor. Rationale: reach distance is only half of a move's cost —
 * latching a crimp at full extension is far harder than latching a jug at the
 * same distance. Keeping this as a MULTIPLIER on top of DIFFICULTY_WEIGHTS
 * (rather than a new weight table) preserves the existing engine's semantics:
 * with no type info everything multiplies by 1.0 and the graph is bit-for-bit
 * identical to the pre-fusion engine — the safe-rollback guarantee.
 *
 * Values are deliberately coarse (this is a sniff-test knob, tuned in M2
 * against routes the developer can personally climb, not a physics model).
 */
export const HOLD_TYPE_COST_MODIFIER: Record<string, number> = {
  jug: 0.8,     // easier to use at any distance
  crimp: 1.5,   // punishing at distance
  sloper: 1.4,  // friction-dependent
  pocket: 1.3,
  pinch: 1.2,
  volume: 1.0,  // varies too much to guess
  unknown: 1.0, // absence of information must not change behavior
};

/**
 * Build the route graph from detected holds and climber measurements.
 *
 * @param holdTypes optional map holdId → hold type from the fusion pipeline.
 *        OPTIONAL ON PURPOSE: every pre-existing caller compiles and behaves
 *        unchanged; only the fused path opts in.
 */
export function buildRouteGraph(
  holds: DetectedHold[],
  measurements: BodyMeasurements,
  holdTypes?: Record<string, string>,
): RouteGraph {
  const nodes = new Map<string, DetectedHold>();
  const edges = new Map<string, GraphEdge[]>();
  const startIds: string[] = [];
  let topId: string | null = null;

  // Populate nodes
  for (const hold of holds) {
    nodes.set(hold.id, hold);
    edges.set(hold.id, []);
    if (hold.isStart) startIds.push(hold.id);
    if (hold.isTop) topId = hold.id;
  }

  // Build edges: for each pair of holds, if the move is feasible, add an edge
  for (const from of holds) {
    for (const to of holds) {
      if (from.id === to.id) continue;

      const dx = to.worldCenter.x - from.worldCenter.x;
      const dy = to.worldCenter.y - from.worldCenter.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const isUpward = dy > Math.abs(dx);
      const isLateral = Math.abs(dx) > dy;

      const difficulty = classifyReach(dist, measurements.armLength, isUpward);
      if (difficulty === 'unreachable') continue; // skip impossible moves

      // Suggest which limb based on direction
      let suggestedLimb: Limb;
      if (isUpward) {
        // Upward moves: alternate hands, prefer same side as horizontal offset
        suggestedLimb = dx >= 0 ? 'rightHand' : 'leftHand';
      } else {
        // Lateral moves: use the hand on the direction of movement
        suggestedLimb = dx >= 0 ? 'rightHand' : 'leftHand';
      }

      // Foot moves: if the target is below the current position, it's a foot placement
      if (dy < -20) {
        suggestedLimb = dx >= 0 ? 'rightFoot' : 'leftFoot';
      }

      // Weight = reach difficulty × target-hold-type modifier. The modifier
      // applies to the TARGET hold only: the cost of a move is dominated by
      // what you have to latch at the end of it, not what you're leaving.
      const typeModifier = holdTypes
        ? HOLD_TYPE_COST_MODIFIER[holdTypes[to.id] ?? 'unknown'] ?? 1.0
        : 1.0;

      edges.get(from.id)!.push({
        fromId: from.id,
        toId: to.id,
        distanceCm: Math.round(dist * 10) / 10,
        difficulty,
        weight: DIFFICULTY_WEIGHTS[difficulty] * typeModifier,
        suggestedLimb,
        isUpward,
        isLateral,
      });
    }
  }

  return { nodes, edges, startIds, topId };
}

/**
 * Get the N easiest edges from a given hold (sorted by weight).
 */
export function getEasiestMoves(
  graph: RouteGraph,
  holdId: string,
  maxMoves: number = 5,
): GraphEdge[] {
  const holdEdges = graph.edges.get(holdId) ?? [];
  return holdEdges
    .filter((e) => e.weight < Infinity)
    .sort((a, b) => a.weight - b.weight)
    .slice(0, maxMoves);
}

/**
 * Get all holds reachable from a given position, classified by difficulty.
 */
export function getReachableHolds(
  graph: RouteGraph,
  holdId: string,
): Record<ReachDifficulty, DetectedHold[]> {
  const result: Record<ReachDifficulty, DetectedHold[]> = {
    easy: [],
    moderate: [],
    limit: [],
    dynamic: [],
    unreachable: [],
  };

  const holdEdges = graph.edges.get(holdId) ?? [];
  for (const edge of holdEdges) {
    const hold = graph.nodes.get(edge.toId);
    if (hold) {
      result[edge.difficulty].push(hold);
    }
  }

  return result;
}
