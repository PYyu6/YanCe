/**
 * syntheticWall.ts — Deterministic synthetic wall images for tests & demos.
 *
 * WHY SYNTHETIC (the data-sourcing decision, made explicit):
 *  - The e2e suite must be deterministic and self-contained: no downloads, no
 *    licenses, no gym. A generated wall gives PERFECT ground truth by
 *    construction — every hold's center is known, so "did detection find the
 *    holds" becomes an exact assertion instead of an eyeball.
 *  - The color-seg detector is deterministic math; synthetic images exercise
 *    every branch of it honestly (that's not true for the YOLO/VLM stages,
 *    whose realism can ONLY be tested on real photos — that's what the
 *    Roboflow Universe datasets and the user's own labeled gym photos are for;
 *    see eval/README.md. Synthetic tests plumbing; real photos test models.)
 *  - The geometry REUSES tests/fixtures/wallSimple.ts world coordinates, so
 *    the browser e2e exercises the exact wall the engine integration tests
 *    already prove produces different betas for different bodies. One wall,
 *    three test layers, zero drift.
 *
 * This module is browser-oriented (canvas drawing) but the SPEC is pure data,
 * importable from Node-side Playwright tests which then draw it in-page.
 */

import { ROUTE_COLORS } from '../utils/colors';

export interface SyntheticHoldSpec {
  /** Center in image pixels. */
  xPx: number;
  yPx: number;
  rPx: number;
  /** Fill color. Route holds MUST use an exact ROUTE_COLORS hex so the color
   *  chip in the UI matches the drawn pixels exactly (HSV tolerance is then
   *  irrelevant — we're testing plumbing, not tolerance tuning). */
  colorHex: string;
  /** Semantic tag; 'distractor' holds belong to another route (different color). */
  role: 'start' | 'rung' | 'top' | 'decoy' | 'distractor';
}

export interface SyntheticWallSpec {
  widthPx: number;
  heightPx: number;
  /** Low-saturation background so the HSV filter's SATURATION_MIN excludes it. */
  bgColor: string;
  holds: SyntheticHoldSpec[];
  /** Where the e2e should tap for manual calibration, and the true distance. */
  calibration: { p1: { x: number; y: number }; p2: { x: number; y: number }; distanceCm: number };
}

/** The red every route hold uses — index 0 of the app's own color chips. */
export const ROUTE_RED = ROUTE_COLORS[0].hex; // '#e53e3e'
const DISTRACTOR_BLUE = ROUTE_COLORS[1].hex;  // '#3182ce'

/**
 * The standard e2e wall: the wallSimple.ts ladder at 5 px/cm.
 *
 * World→pixel: x=0 at px 300 (horizontal center), y=0 at px 1000 (near the
 * bottom), 5 px per cm. So: rung k (world y=16.5k) → pixel y = 1000 − 82.5k;
 * top (0,110) → (300, 450); decoy M (45,55) → (525, 725).
 *
 * The calibration taps are two points 500px apart vertically declared as
 * 100cm — yielding exactly ppcm=5, which makes every world coordinate land on
 * the fixture's numbers (±0.1cm rounding). The engine then MUST reproduce the
 * proven result: tall skips rungs (4 moves), short takes each one (6 moves).
 */
export function ladderWallSpec(): SyntheticWallSpec {
  const PPCM = 5;
  const X0 = 300;
  const Y0 = 1000;
  const wx = (cm: number) => X0 + cm * PPCM;
  const wy = (cm: number) => Y0 - cm * PPCM;

  const holds: SyntheticHoldSpec[] = [
    { xPx: wx(0), yPx: wy(0), rPx: 20, colorHex: ROUTE_RED, role: 'start' },
    ...Array.from({ length: 6 }, (_, i) => ({
      xPx: wx(0),
      yPx: wy(16.5 * (i + 1)),
      rPx: 20,
      colorHex: ROUTE_RED,
      role: 'rung' as const,
    })),
    { xPx: wx(0), yPx: wy(110), rPx: 20, colorHex: ROUTE_RED, role: 'top' },
    { xPx: wx(45), yPx: wy(55), rPx: 20, colorHex: ROUTE_RED, role: 'decoy' },
    // Distractors prove the color filter actually filters: same shape, other
    // route's color — must NOT appear among detected holds.
    { xPx: wx(-40), yPx: wy(30), rPx: 18, colorHex: DISTRACTOR_BLUE, role: 'distractor' },
    { xPx: wx(-35), yPx: wy(80), rPx: 18, colorHex: DISTRACTOR_BLUE, role: 'distractor' },
  ];

  return {
    widthPx: 600,
    heightPx: 1100,
    bgColor: '#8a8a8a', // gray: saturation ≈ 0 → invisible to the HSV filter
    holds,
    calibration: { p1: { x: 300, y: 1000 }, p2: { x: 300, y: 500 }, distanceCm: 100 },
  };
}

/** Route-hold ground truth (what detection is expected to find). */
export function wallGroundTruth(spec: SyntheticWallSpec): Array<{ x: number; y: number; role: string }> {
  return spec.holds
    .filter((h) => h.role !== 'distractor')
    .map((h) => ({ x: h.xPx, y: h.yPx, role: h.role }));
}

/**
 * Draw the spec onto a canvas (browser only). Solid circles — deliberately
 * NOT photo-realistic: gradients/shadows would test the HSV tolerances, and
 * tolerance realism is the REAL-photo eval's job, not e2e's.
 */
export function drawSyntheticWall(spec: SyntheticWallSpec, canvas: HTMLCanvasElement): void {
  canvas.width = spec.widthPx;
  canvas.height = spec.heightPx;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = spec.bgColor;
  ctx.fillRect(0, 0, spec.widthPx, spec.heightPx);
  for (const h of spec.holds) {
    ctx.beginPath();
    ctx.arc(h.xPx, h.yPx, h.rPx, 0, Math.PI * 2);
    ctx.fillStyle = h.colorHex;
    ctx.fill();
  }
}
