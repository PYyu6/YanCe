/**
 * som.ts — Set-of-Mark rendering (the only canvas-bound file in services/).
 *
 * Draws numbered badges over each candidate on a DOWNSCALED copy of the wall
 * photo, producing the image the VLM judges. Kept deliberately tiny and
 * logic-free: everything decidable (which candidates, what happens to
 * verdicts) lives in pure modules; this file only turns decisions into pixels.
 * It is exercised by e2e tests, not unit tests — asserting pixel output in
 * Node buys nothing.
 */

import { HoldCandidate, SoMMark } from './holdCandidates';

/** Long-side target for the image sent to the VLM (cost/latency budget). */
export const SOM_MAX_DIMENSION = 1024;

/**
 * Cap on marks per call. Beyond this, mark clutter measurably degrades VLM
 * accuracy (dense-wall caveat in DP-2 of the plan); candidates past the cap
 * are simply not verified — which fails open, per applyVerification.
 * Candidates are prioritized by confidence ascending? No — DESCENDING is
 * wrong here: the LOW-confidence candidates are the ones verification helps
 * most, but a partial audit of dubious marks with unverified confident ones is
 * still the best spend of a fixed budget... we take lowest-confidence first.
 */
export const SOM_MAX_MARKS = 60;

export function renderSetOfMarks(
  sourceCanvas: HTMLCanvasElement,
  candidates: HoldCandidate[],
): { dataUrl: string; marks: SoMMark[] } {
  // Downscale so the VLM sees a consistent, cheap resolution.
  const scale = Math.min(1, SOM_MAX_DIMENSION / Math.max(sourceCanvas.width, sourceCanvas.height));
  const w = Math.round(sourceCanvas.width * scale);
  const h = Math.round(sourceCanvas.height * scale);

  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const ctx = out.getContext('2d')!;
  ctx.drawImage(sourceCanvas, 0, 0, w, h);

  // Verification budget: lowest-confidence candidates first (they benefit most).
  const order = candidates
    .map((c, i) => ({ c, i }))
    .sort((a, b) => a.c.confidence - b.c.confidence)
    .slice(0, SOM_MAX_MARKS);

  const marks: SoMMark[] = [];
  let n = 1;
  for (const { c, i } of order) {
    const x = c.pixelCenter.x * scale;
    const y = c.pixelCenter.y * scale;

    // High-contrast badge: filled disc + white ring + number. Style matters
    // functionally here — the SoM paper's marks work because they are
    // unambiguous against any background.
    ctx.beginPath();
    ctx.arc(x, y, 11, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(20,20,20,0.85)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(n), x, y);

    marks.push({ n, candidateIndex: i });
    n++;
  }

  // JPEG (not PNG): photo content, ~5x smaller payload, badge legibility
  // survives 0.85 quality comfortably.
  return { dataUrl: out.toDataURL('image/jpeg', 0.85), marks };
}
