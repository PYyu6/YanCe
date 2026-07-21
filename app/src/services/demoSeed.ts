/**
 * demoSeed.ts — `?demo=1` judge-proof seeded demo path.
 *
 * WHY THIS EXISTS (the submission problem it solves):
 *  - The real product flow needs 5 manual steps (profile → photo → calibrate
 *    → correct holds → analyze) before anything impressive is on screen. A
 *    hackathon judge with five minutes and no climbing wall will bounce off
 *    step 2. `?demo=1` lands them on the analysis screen in one page load.
 *
 * HONESTY CONTRACT (same rule as the sample labs):
 *  - The seed injects INPUTS ONLY — profile, wall image, calibration, holds.
 *    The analysis itself is produced by the same `runAnalysis` store action a
 *    real user triggers: real reach graph, real path search, real betas.
 *    Nothing downstream is faked, so the seeded screen is genuine engine
 *    output on a synthetic wall — and the UI must disclose exactly that
 *    (see DEMO_BADGE_TEXT).
 *  - The wall is the SHARED ladder spec from syntheticWall.ts — the same
 *    geometry the engine integration test and the Playwright suite already
 *    prove gives a 190 cm body 4 moves and a 160 cm body 6 moves. One wall,
 *    four test layers (unit fixture, integration, e2e flow, seeded demo),
 *    zero drift.
 *  - Seeded holds replicate the CONFIRMED end-state of the e2e flow: exactly
 *    one start and one top (the auto-detector's two-start default is what the
 *    e2e manually corrects; we seed the corrected geometry so the demo shows
 *    the proven 4-vs-6 comparison, not an unproven variant).
 *
 * SEAMS (why the module is split this way):
 *  - Everything except image drawing is PURE data derived from the wall spec,
 *    so Node-side vitest can assert coordinates without a canvas.
 *  - Image drawing (`buildDemoWallImage`) is browser-only and delegated to
 *    the existing drawSyntheticWall; e2e owns its verification.
 *  - `applyDemoSeed` takes the store actions as an argument instead of
 *    importing the store, so unit tests can drive the REAL zustand store and
 *    assert the seeded analysis matches the proven fixture numbers.
 */

import {
  CalibrationResult,
  ClimberProfile,
  DetectedHold,
} from '../types';
import { SyntheticWallSpec, ladderWallSpec, drawSyntheticWall } from './syntheticWall';

/** Everything needed to reach the analysis screen without user input. */
export interface DemoSeedData {
  profile: ClimberProfile;
  wallSpec: SyntheticWallSpec;
  calibration: CalibrationResult;
  holds: DetectedHold[];
}

/**
 * The subset of store actions the seed drives, in the order a real user
 * would: profile → image → calibration → holds → analyze. Matching the
 * store's own action signatures means `useAppStore.getState()` satisfies
 * this interface directly.
 */
export interface DemoSeedActions {
  setProfile: (profile: ClimberProfile) => void;
  setCapturedImage: (dataUrl: string, width: number, height: number) => void;
  setCalibration: (cal: CalibrationResult) => void;
  setHolds: (holds: DetectedHold[]) => void;
  runAnalysis: () => void;
}

/** Disclosure copy the analysis screen must show whenever the seed ran. */
export const DEMO_BADGE_TEXT = 'Seeded demo · synthetic wall · real engine';

/**
 * True only for the explicit `?demo=1`. Any other value (absent, '0', 'true')
 * is rejected on purpose: the demo swaps out the entire manual flow, so it
 * must never trigger from a mistyped or half-remembered URL.
 */
export function isDemoRequested(params: URLSearchParams): boolean {
  return params.get('demo') === '1';
}

/**
 * Pure seed builder.
 *  - profile: 190 cm / 195 cm span, V3 intermediate — the tall body of the
 *    proven two-profile claim, so "Compare bodies" shows 4 vs 6 moves.
 *  - calibration: manual method reproducing the wall spec's declared taps
 *    (500 px / 100 cm ⇒ exactly 5 px per cm), origin at the spec's first tap
 *    point, confidence 1 (the distance is true by construction).
 *  - holds: every non-distractor spec hold, converted with the SAME
 *    pixel→world transform as holdDetector (origin-relative, y-inverted,
 *    rounded to 0.1 cm), start/top flags per the spec roles.
 */
export function buildDemoSeed(): DemoSeedData {
  const wallSpec = ladderWallSpec();
  const { p1, p2, distanceCm } = wallSpec.calibration;

  const pixelsPerCm =
    Math.hypot(p2.x - p1.x, p2.y - p1.y) / distanceCm;

  const calibration: CalibrationResult = {
    method: 'manual',
    pixelsPerCm,
    originPixel: { ...p1 },
    // The tap distance is true by construction on a synthetic wall.
    confidence: 1,
  };

  const holds: DetectedHold[] = wallSpec.holds
    .filter((h) => h.role !== 'distractor')
    .map((h, i) => ({
      id: `demo-${i}`,
      pixelCenter: { x: h.xPx, y: h.yPx },
      // Same transform as holdDetector: origin-relative, y-inverted, 0.1 cm.
      worldCenter: {
        x: Math.round(((h.xPx - calibration.originPixel.x) / pixelsPerCm) * 10) / 10,
        y: Math.round(((calibration.originPixel.y - h.yPx) / pixelsPerCm) * 10) / 10,
      },
      pixelRadius: h.rPx,
      color: h.colorHex,
      routeColor: h.colorHex,
      // The corrected single-start geometry the e2e flow ends with — NOT the
      // detector's two-start auto-mark. Fixture proof (tall=4/short=6 moves)
      // holds only for this configuration.
      isStart: h.role === 'start',
      isTop: h.role === 'top',
      manuallyAdded: false,
    }));

  return {
    profile: {
      height: 190,
      armSpan: 195,
      grade: 'V3',
      experience: 'intermediate',
    },
    wallSpec,
    calibration,
    holds,
  };
}

/**
 * Browser-only: render the seed's wall spec to a PNG data URL for the
 * RouteView backdrop. Not unit-testable in Node (no canvas) — the demo e2e
 * spec asserts the visible result instead.
 */
export function buildDemoWallImage(spec: SyntheticWallSpec): string {
  const canvas = document.createElement('canvas');
  drawSyntheticWall(spec, canvas);
  return canvas.toDataURL('image/png');
}

/**
 * Drive the store through the seed in user order, ending on the analysis
 * step. Returns the seed used, so callers (and tests) can cross-check what
 * was injected. Idempotence is the caller's job: only invoke while the app
 * is still on the profile step.
 */
export function applyDemoSeed(actions: DemoSeedActions, wallImageDataUrl: string): DemoSeedData {
  const seed = buildDemoSeed();
  actions.setProfile(seed.profile);
  actions.setCapturedImage(wallImageDataUrl, seed.wallSpec.widthPx, seed.wallSpec.heightPx);
  actions.setCalibration(seed.calibration);
  actions.setHolds(seed.holds);
  actions.runAnalysis();
  return seed;
}
