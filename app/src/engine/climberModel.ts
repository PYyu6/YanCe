/**
 * Climber Body Model
 * ──────────────────
 * Derives body measurements from user profile (height, arm span).
 * These drive the reach analysis: which holds can this specific body reach?
 *
 * Anthropometric ratios based on climbing biomechanics research.
 * Ape index (arm span / height) varies from ~0.96 to ~1.06 in climbers.
 */

import { ClimberProfile, BodyMeasurements, ReachDifficulty } from '../types';

/**
 * Derive full body measurements from the user's profile.
 */
export function computeMeasurements(profile: ClimberProfile): BodyMeasurements {
  const { height, armSpan } = profile;
  return {
    // Standing reach: how high fingertips go with arm overhead
    // Average ratio: height × 1.25 (varies with arm length)
    standingReach: height * 1.25 + (armSpan - height) * 0.5,

    // Arm length: shoulder to fingertip ≈ 44% of arm span
    armLength: armSpan * 0.44,

    // Leg reach: hip to toe ≈ 53% of height
    legReach: height * 0.53,

    // Shoulder height: ground to shoulder ≈ 82% of height
    shoulderHeight: height * 0.82,

    // Hip height: ground to hip ≈ 53% of height
    hipHeight: height * 0.53,

    // Ape index
    apeIndex: armSpan / height,
  };
}

/**
 * Determine how difficult a reach is for this climber.
 *
 * @param distanceCm - Distance from current hand position to target hold
 * @param armLength - Climber's arm length in cm
 * @param isUpward - Whether the reach is primarily upward (harder) vs lateral
 * @returns Difficulty classification
 */
export function classifyReach(
  distanceCm: number,
  armLength: number,
  isUpward: boolean = false,
): ReachDifficulty {
  // Effective reach radius depends on direction:
  // - Lateral: can use full arm span + body lean ≈ arm length × 1.1
  // - Upward: limited by how high you can get shoulder ≈ arm length × 0.9
  const effectiveReach = isUpward ? armLength * 0.9 : armLength * 1.1;

  const ratio = distanceCm / effectiveReach;

  if (ratio < 0.5) return 'easy';        // well within reach
  if (ratio < 0.75) return 'moderate';    // comfortable reach
  if (ratio < 1.0) return 'limit';        // at the edge of static reach
  if (ratio < 1.4) return 'dynamic';      // needs a deadpoint or dyno
  return 'unreachable';                    // cannot reach even dynamically
}

/**
 * Compute the reach difficulty for every hold relative to every other hold.
 * Returns a map: "fromId->toId" → ReachDifficulty
 */
export function computeReachMap(
  holds: { id: string; worldCenter: { x: number; y: number } }[],
  measurements: BodyMeasurements,
): Record<string, ReachDifficulty> {
  const map: Record<string, ReachDifficulty> = {};

  for (const from of holds) {
    for (const to of holds) {
      if (from.id === to.id) continue;

      const dx = to.worldCenter.x - from.worldCenter.x;
      const dy = to.worldCenter.y - from.worldCenter.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const isUpward = dy > Math.abs(dx); // primarily vertical

      map[`${from.id}->${to.id}`] = classifyReach(dist, measurements.armLength, isUpward);
    }
  }

  return map;
}

/**
 * Get which V-grade number the climber's grade corresponds to.
 * Used for technique filtering and difficulty scoring.
 */
export function parseVGrade(grade: string): number {
  const match = grade.match(/V(\d+)/i);
  if (match) return parseInt(match[1], 10);
  // Fallback: try to parse as number
  const num = parseInt(grade, 10);
  return isNaN(num) ? 0 : num;
}
