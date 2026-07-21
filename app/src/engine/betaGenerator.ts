/**
 * Beta Generator
 * ──────────────
 * Generates move-by-move climbing strategies (beta) from start to top.
 *
 * Uses a modified Dijkstra's algorithm on the route graph to find
 * the easiest path, then generates alternative strategies:
 * 1. "Standard" — lowest total difficulty
 * 2. "Static" — avoids dynamic moves, prefers easy reaches
 * 3. "Power" — more direct, fewer moves, may require dynamics
 *
 * Each beta is a sequence of Moves with technique suggestions.
 */

import { DetectedHold, BodyMeasurements, Move, Beta, Limb, Experience } from '../types';
import { RouteGraph, GraphEdge } from './graphBuilder';
import { suggestTechnique } from './techniqueAdvisor';

/**
 * Generate multiple beta strategies for the route.
 */
export function generateBetas(
  graph: RouteGraph,
  measurements: BodyMeasurements,
  experience: Experience,
): Beta[] {
  const betas: Beta[] = [];

  // Strategy 1: Standard — easiest overall path
  const standardPath = findEasiestPath(graph);
  if (standardPath) {
    betas.push(
      pathToBeta(standardPath, graph, measurements, experience, 'standard', 'Standard Beta', 'Easiest overall sequence — minimizes difficulty of each move'),
    );
  }

  // Strategy 2: Static — avoid dynamic moves entirely
  const staticPath = findEasiestPath(graph, { avoidDynamic: true });
  if (staticPath && standardPath && !samePath(staticPath, standardPath)) {
    betas.push(
      pathToBeta(staticPath, graph, measurements, experience, 'static', 'Static Beta', 'All static reaches — no dynos or deadpoints required'),
    );
  }

  // Strategy 3: Power/Direct — fewest moves possible
  const directPath = findDirectPath(graph);
  if (directPath && standardPath && !samePath(directPath, standardPath)) {
    betas.push(
      pathToBeta(directPath, graph, measurements, experience, 'power', 'Power Beta', 'Most direct line — fewer moves but harder reaches'),
    );
  }

  // Score suitability based on climber profile
  for (const beta of betas) {
    beta.suitability = scoreSuitability(beta, experience);
  }

  // Sort by suitability (best first)
  betas.sort((a, b) => b.suitability - a.suitability);

  return betas;
}

// ── Pathfinding ─────────────────────────────────────────────────────────────

interface PathOptions {
  avoidDynamic?: boolean;
}

/**
 * Dijkstra's shortest path from any start hold to the top hold.
 */
function findEasiestPath(
  graph: RouteGraph,
  options: PathOptions = {},
): GraphEdge[] | null {
  if (graph.startIds.length === 0 || !graph.topId) return null;

  const dist = new Map<string, number>();
  const prev = new Map<string, GraphEdge | null>();
  const visited = new Set<string>();

  // Initialize distances
  for (const id of graph.nodes.keys()) {
    dist.set(id, Infinity);
    prev.set(id, null);
  }

  // Start from all start holds with distance 0
  const queue: string[] = [];
  for (const startId of graph.startIds) {
    dist.set(startId, 0);
    queue.push(startId);
  }

  while (queue.length > 0) {
    // Find unvisited node with smallest distance
    queue.sort((a, b) => (dist.get(a) ?? Infinity) - (dist.get(b) ?? Infinity));
    const current = queue.shift()!;

    if (visited.has(current)) continue;
    visited.add(current);

    if (current === graph.topId) break;

    const edges = graph.edges.get(current) ?? [];
    for (const edge of edges) {
      if (visited.has(edge.toId)) continue;
      if (options.avoidDynamic && edge.difficulty === 'dynamic') continue;

      const newDist = (dist.get(current) ?? Infinity) + edge.weight;
      if (newDist < (dist.get(edge.toId) ?? Infinity)) {
        dist.set(edge.toId, newDist);
        prev.set(edge.toId, edge);
        queue.push(edge.toId);
      }
    }
  }

  // Reconstruct path
  if (!prev.has(graph.topId) || dist.get(graph.topId) === Infinity) return null;

  const path: GraphEdge[] = [];
  let current = graph.topId;
  while (prev.get(current)) {
    const edge = prev.get(current)!;
    path.unshift(edge);
    current = edge.fromId;
  }

  return path;
}

/**
 * Find most direct path: minimize number of moves (BFS on move count).
 */
function findDirectPath(graph: RouteGraph): GraphEdge[] | null {
  if (graph.startIds.length === 0 || !graph.topId) return null;

  const prev = new Map<string, GraphEdge | null>();
  const visited = new Set<string>();
  const queue: string[] = [...graph.startIds];

  for (const id of graph.startIds) {
    prev.set(id, null);
    visited.add(id);
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === graph.topId) break;

    // Sort edges by distance (prefer bigger jumps for fewer total moves)
    const edges = (graph.edges.get(current) ?? [])
      .filter((e) => !visited.has(e.toId) && e.weight < Infinity)
      .sort((a, b) => b.distanceCm - a.distanceCm);

    for (const edge of edges) {
      if (!visited.has(edge.toId)) {
        visited.add(edge.toId);
        prev.set(edge.toId, edge);
        queue.push(edge.toId);
      }
    }
  }

  if (!prev.has(graph.topId)) return null;

  const path: GraphEdge[] = [];
  let current = graph.topId;
  while (prev.get(current)) {
    const edge = prev.get(current)!;
    path.unshift(edge);
    current = edge.fromId;
  }

  return path;
}

// ── Path → Beta conversion ──────────────────────────────────────────────────

function pathToBeta(
  path: GraphEdge[],
  graph: RouteGraph,
  measurements: BodyMeasurements,
  experience: Experience,
  id: string,
  name: string,
  description: string,
): Beta {
  // Track which limb is on which hold to alternate hands
  let lastHandUsed: 'leftHand' | 'rightHand' = 'leftHand';

  const moves: Move[] = path.map((edge, i) => {
    // Alternate hands unless the graph strongly suggests otherwise
    let limb: Limb = edge.suggestedLimb;
    if (limb === 'leftHand' || limb === 'rightHand') {
      // Alternate hands for hand moves
      limb = lastHandUsed === 'leftHand' ? 'rightHand' : 'leftHand';
      lastHandUsed = limb;
    }

    const fromHold = graph.nodes.get(edge.fromId)!;
    const toHold = graph.nodes.get(edge.toId)!;

    // Get technique suggestion for this move
    const technique = suggestTechnique(fromHold, toHold, measurements, experience);

    return {
      step: i + 1,
      limb,
      fromHoldId: edge.fromId,
      toHoldId: edge.toId,
      reachDistance: edge.distanceCm,
      difficulty: edge.difficulty,
      technique: technique?.id ?? null,
      tip: technique?.tip ?? `Reach ${edge.distanceCm}cm to the ${edge.isUpward ? 'hold above' : 'next hold'}`,
    };
  });

  // Identify crux (hardest consecutive moves)
  const cruxSteps: number[] = [];
  let maxDiffSum = 0;
  for (let i = 0; i < moves.length; i++) {
    const diff = DIFF_SCORES[moves[i].difficulty] ?? 0;
    if (diff >= 6) cruxSteps.push(i);
    if (i > 0) {
      const twoMoveSum = diff + (DIFF_SCORES[moves[i - 1].difficulty] ?? 0);
      maxDiffSum = Math.max(maxDiffSum, twoMoveSum);
    }
  }

  // Identify rest positions (easy holds where you can recover)
  const restSteps = moves
    .filter((m) => m.difficulty === 'easy')
    .map((m) => m.step - 1);

  // Overall difficulty (average weight)
  const totalWeight = path.reduce((sum, e) => sum + e.weight, 0);
  const overallDifficulty = Math.min(10, totalWeight / Math.max(path.length, 1));

  return {
    id,
    name,
    description,
    moves,
    overallDifficulty: Math.round(overallDifficulty * 10) / 10,
    suitability: 0.5, // will be scored later
    cruxSteps,
    restSteps,
  };
}

const DIFF_SCORES: Record<string, number> = {
  easy: 1,
  moderate: 3,
  limit: 6,
  dynamic: 10,
};

function scoreSuitability(beta: Beta, experience: Experience): number {
  // Penalize betas that require techniques above the climber's level
  let score = 1.0;
  const dynamicMoves = beta.moves.filter((m) => m.difficulty === 'dynamic').length;
  const limitMoves = beta.moves.filter((m) => m.difficulty === 'limit').length;

  if (experience === 'beginner') {
    score -= dynamicMoves * 0.3;
    score -= limitMoves * 0.1;
  } else if (experience === 'intermediate') {
    score -= dynamicMoves * 0.15;
  }
  // Advanced climbers can handle anything

  // Prefer fewer moves
  score -= beta.moves.length * 0.02;

  return Math.max(0, Math.min(1, score));
}

function samePath(a: GraphEdge[], b: GraphEdge[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((e, i) => e.fromId === b[i].fromId && e.toId === b[i].toId);
}
