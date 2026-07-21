/**
 * wallSimple.ts — Synthetic fixture wall, DESIGNED (not sampled) so that a
 * tall and a short climber provably take different best paths.
 *
 * The geometry exploits the engine's own thresholds (climberModel.classifyReach):
 *   upward effective reach = armLength × 0.9, armLength = armSpan × 0.44
 *   TALL  (195 span): armLength 85.8 → upward eff 77.2 → moderate band < 57.9 cm
 *   SHORT (160 span): armLength 70.4 → upward eff 63.4 → moderate band < 47.5 cm
 *
 * Layout (all on x=0, straight vertical line, distances in cm):
 *   START (y=0) · M (y=55) · TOP (y=110) · ladder l1..l6 at y = 16.5k
 *
 *   THE OPERATIVE MECHANISM — rung-skip granularity:
 *   Rung spacing is 16.5cm, so a TWO-RUNG SKIP is 33cm, which straddles the
 *   two bodies' 'easy' boundary (easy = distance < 0.5 × upward reach):
 *     tall:  33/77.2 = 0.43 → easy (w1)      — skipping is free
 *     short: 33/63.4 = 0.52 → moderate (w3)  — skipping costs 3× a single hop
 *   Single hops (16.5cm) are easy (w1) for both.
 *
 *   Cheapest path, tall : SKIP rungs — 4 moves, cost 4 (e.g. l2, l4, l6, TOP)
 *   Cheapest path, short: single rungs — l1..l5, TOP = 6 moves, cost 6
 *                         (l5→TOP is 27.5cm, easy even for the short body, so
 *                         l6 is redundant for everyone; any skip variant ≥ 7,
 *                         so short's 6-single path is uniquely optimal)
 *
 *   ⇒ tall takes 4 bigger moves, short takes 6 small ones: the sequences MUST
 *   differ (even their lengths differ). This is the product claim ("beta is
 *   body-relative") reduced to arithmetic — no model call, no image.
 *
 *   The M hold sits OFF-AXIS at (45, 55) as a decoy: reaching it from the
 *   start is 'limit' for tall (71.1/77.2 = 0.92) and 'dynamic' for short, and
 *   any transit through it costs ≥ 3+3 while replacing ≤ 2 ladder hops — so it
 *   can never enter an optimal path. (First fixture version had M on-axis at
 *   (0,55); the engine promptly found start→l2→M→l5→top for the tall body —
 *   a genuine 4-move path using M as a 22cm stepping stone. The engine was
 *   right and the fixture was wrong; hence the offset.)
 */

import { CalibrationResult, ClimberProfile, DetectedHold } from '../../src/types';

export const FIXTURE_CALIBRATION: CalibrationResult = {
  method: 'manual',
  pixelsPerCm: 2,
  originPixel: { x: 0, y: 1000 }, // world (0,0) sits at pixel (0,1000); Y inverts
  confidence: 1,
};

/** world cm → pixel, matching the app's inversion convention. */
export function worldToPixel(x: number, y: number): { x: number; y: number } {
  return {
    x: x * FIXTURE_CALIBRATION.pixelsPerCm,
    y: FIXTURE_CALIBRATION.originPixel.y - y * FIXTURE_CALIBRATION.pixelsPerCm,
  };
}

function hold(id: string, xCm: number, yCm: number, flags: Partial<DetectedHold> = {}): DetectedHold {
  return {
    id,
    pixelCenter: worldToPixel(xCm, yCm),
    worldCenter: { x: xCm, y: yCm },
    pixelRadius: 12,
    color: '#e74c3c',
    routeColor: '#e74c3c',
    isStart: false,
    isTop: false,
    manuallyAdded: false,
    ...flags,
  };
}

// 16.5cm: single hop easy for both; DOUBLE hop (33cm) easy only for tall —
// the boundary the whole two-profile difference rides on (see header math).
const LADDER_STEP = 16.5;

export const FIXTURE_HOLDS: DetectedHold[] = [
  hold('hold-start', 0, 0, { isStart: true }),
  hold('hold-M', 45, 55), // off-axis decoy — see header note
  hold('hold-top', 0, 110, { isTop: true }),
  ...Array.from({ length: 6 }, (_, i) =>
    hold(`hold-l${i + 1}`, 0, Math.round(LADDER_STEP * (i + 1) * 10) / 10),
  ),
];

export const TALL_PROFILE: ClimberProfile = {
  height: 190,
  armSpan: 195,
  grade: 'V4',
  experience: 'intermediate',
};

export const SHORT_PROFILE: ClimberProfile = {
  height: 160,
  armSpan: 160,
  grade: 'V4',
  experience: 'intermediate',
};
