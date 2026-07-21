/**
 * detectionRunner.ts — The one entry point the UI calls to detect holds.
 *
 * Dispatches classic vs fused per feature flags and owns the two browser-side
 * concerns the pure fusion module deliberately doesn't know about:
 *
 *  1. DOWNSCALING for API calls. Model APIs get a ≤1280px image (cost/latency
 *     budget; the proxy hard-rejects oversized payloads). YOLO coordinates
 *     come back in DOWNSCALED space, so this module owns the scale factor and
 *     rescales candidates back to full-resolution pixel space before merging —
 *     the merge radius math only works if all sources share one space.
 *  2. WIRING real implementations into FusionDeps. Tests inject fakes; this
 *     is the only place the real ones meet.
 *
 * Failure policy is inherited from detectHoldsFused: any stage that throws is
 * skipped with a console.warn, so a missing proxy (keys not deployed yet)
 * silently degrades to classic behavior — the app never blanks.
 */

import { CalibrationResult, DetectedHold } from '../types';
import { detectHoldsByColor } from '../detection/holdDetector';
import {
  detectHoldsFused,
  toDetectedHolds,
  FusionOutcome,
} from './holdDetectionService';
import { HoldCandidate } from './holdCandidates';
import { detectWithRoboflow } from './roboflowClient';
import { renderSetOfMarks } from './som';
import { verifyHolds } from './vlm';
import { DetectionFlags } from './featureFlags';

/** Long-side cap for any image leaving the browser. Mirrors the proxy clamp. */
export const API_IMAGE_MAX_DIMENSION = 1280;

export interface DetectionRunResult {
  holds: DetectedHold[];
  /** Present only in fused mode — drives dev badges + "look here" hints. */
  fusion?: Pick<FusionOutcome, 'stats' | 'missedCells'>;
}

/** Downscale a canvas to the API cap; returns the JPEG and the scale used. */
export function toApiImage(canvas: HTMLCanvasElement): { dataUrl: string; scale: number } {
  const scale = Math.min(1, API_IMAGE_MAX_DIMENSION / Math.max(canvas.width, canvas.height));
  if (scale === 1) {
    return { dataUrl: canvas.toDataURL('image/jpeg', 0.85), scale };
  }
  const small = document.createElement('canvas');
  small.width = Math.round(canvas.width * scale);
  small.height = Math.round(canvas.height * scale);
  small.getContext('2d')!.drawImage(canvas, 0, 0, small.width, small.height);
  return { dataUrl: small.toDataURL('image/jpeg', 0.85), scale };
}

/** Rescale downscaled-space candidates back to full-resolution pixel space. */
export function rescaleCandidates(candidates: HoldCandidate[], scale: number): HoldCandidate[] {
  if (scale === 1) return candidates;
  return candidates.map((c) => ({
    ...c,
    pixelCenter: { x: c.pixelCenter.x / scale, y: c.pixelCenter.y / scale },
    pixelRadius: c.pixelRadius / scale,
  }));
}

/**
 * Detect holds on a full-resolution offscreen canvas of the wall photo.
 *
 * @param canvas   full-res offscreen canvas (the UI already builds this)
 * @param colorHex the tapped/chosen route color
 */
export async function runDetection(
  canvas: HTMLCanvasElement,
  colorHex: string,
  calibration: CalibrationResult,
  flags: DetectionFlags,
): Promise<DetectionRunResult> {
  // Classic mode: exactly the pre-fusion code path, untouched. This IS the
  // ?mode=classic baseline the eval table compares against.
  if (!flags.useYolo && !flags.useVlmVerify) {
    return { holds: detectHoldsByColor(canvas, colorHex, calibration) };
  }

  const { dataUrl, scale } = toApiImage(canvas);

  const outcome = await detectHoldsFused(
    {
      segDetect: () => detectHoldsByColor(canvas, colorHex, calibration),
      yoloDetect: async () => rescaleCandidates(await detectWithRoboflow(dataUrl), scale),
      renderMarks: (candidates) => renderSetOfMarks(canvas, candidates),
      verify: (markedDataUrl, marks) => verifyHolds(markedDataUrl, marks),
    },
    { useYolo: flags.useYolo, useVlmVerify: flags.useVlmVerify },
  );

  return {
    holds: toDetectedHolds(outcome.candidates, calibration, colorHex),
    fusion: { stats: outcome.stats, missedCells: outcome.missedCells },
  };
}
