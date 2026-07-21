/**
 * holdDetectionService.ts — Detection fusion: YOLO + color-seg + VLM verify.
 *
 * DESIGN RULES (from the execution plan, restated here because they shape every
 * signature in this file):
 *
 *  1. The VLM NEVER produces coordinates. Sources that can localize (YOLO,
 *     color segmentation) propose; the VLM only judges numbered marks.
 *  2. Every stage is optional and degradable. With useYolo=false and
 *     useVlmVerify=false this module reproduces today's color-seg-only
 *     behavior exactly — the safe-rollback path the demo can always fall to.
 *  3. All LOGIC is pure and canvas-free. Canvas work (running the color
 *     detector, rendering marks) enters only through injected functions, so
 *     the entire fusion pipeline unit/integration-tests in Node.
 *  4. Fused candidates feed the EXISTING confirm/edit UI unchanged; the human
 *     tap-to-correct pass is the permanent safety net, not a temporary hack.
 */

import { CalibrationResult, DetectedHold } from '../types';
import { HoldCandidate, HoldType, SoMMark, VlmVerifyResult } from './holdCandidates';
import { candidateTypeToHoldLabel } from './holdTaxonomy';

// ── Tunables ────────────────────────────────────────────────────────────────

/**
 * Color-seg candidates carry no learned confidence; this prior sits below any
 * decent YOLO score on purpose so that when we must rank-cut, learned evidence
 * outranks a color filter — but above the YOLO floor so seg-only mode still works.
 */
export const COLORSEG_CONFIDENCE_PRIOR = 0.5;

/** YOLO detections below this are dropped before merging (model noise floor). */
export const YOLO_MIN_CONFIDENCE = 0.4;

/**
 * Two candidates are "the same hold" when their centers are closer than
 * max(radiusA, radiusB, MIN_MATCH_RADIUS_PX). The max() matters: a big volume
 * detected by YOLO should absorb the small color blob at its center, and tiny
 * blobs shouldn't demand pixel-perfect agreement.
 */
export const MIN_MATCH_RADIUS_PX = 12;

// ── Pure fusion logic ───────────────────────────────────────────────────────

/**
 * Merge YOLO and color-seg candidates into a single de-duplicated list.
 *
 * Greedy nearest-match, one-to-one: each YOLO candidate claims at most one seg
 * candidate (its nearest within the match radius) and vice versa. Greedy is
 * sufficient here — holds are physically separated objects, so ambiguous
 * many-to-many matches only occur when detection is already garbage, and in
 * that regime the human correction pass is doing the real work anyway.
 *
 * Output ordering is deterministic (matched pairs, then unmatched YOLO, then
 * unmatched seg) so downstream ids and tests are stable.
 */
export function mergeCandidates(
  yolo: HoldCandidate[],
  seg: HoldCandidate[],
): HoldCandidate[] {
  const usableYolo = yolo.filter((c) => c.confidence >= YOLO_MIN_CONFIDENCE);
  const segClaimed = new Set<number>();
  const merged: HoldCandidate[] = [];
  const unmatchedYolo: HoldCandidate[] = [];

  for (const y of usableYolo) {
    // Find nearest unclaimed seg candidate within the match radius.
    let bestIdx = -1;
    let bestDist = Infinity;
    for (let i = 0; i < seg.length; i++) {
      if (segClaimed.has(i)) continue;
      const s = seg[i];
      const dx = s.pixelCenter.x - y.pixelCenter.x;
      const dy = s.pixelCenter.y - y.pixelCenter.y;
      const dist = Math.hypot(dx, dy);
      const matchRadius = Math.max(y.pixelRadius, s.pixelRadius, MIN_MATCH_RADIUS_PX);
      if (dist < matchRadius && dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }

    if (bestIdx >= 0) {
      const s = seg[bestIdx];
      segClaimed.add(bestIdx);
      merged.push({
        // Seg centers come from actual pixel blobs of the hold's color, which
        // tend to be tighter than YOLO box centers — prefer them for position.
        pixelCenter: s.pixelCenter,
        pixelRadius: Math.max(s.pixelRadius, y.pixelRadius),
        source: 'both',
        // Agreement between independent detectors is evidence in itself.
        confidence: Math.max(s.confidence, y.confidence),
        // YOLO is the only source that knows hold types.
        holdType: y.holdType,
      });
    } else {
      unmatchedYolo.push(y);
    }
  }

  const unmatchedSeg = seg.filter((_, i) => !segClaimed.has(i));
  return [...merged, ...unmatchedYolo, ...unmatchedSeg];
}

/**
 * Apply a VLM verification result to a candidate list.
 *
 * Only ever REMOVES or RELABELS candidates — never adds. Missed-region hints
 * are returned separately for the UI to render as "look here" prompts; letting
 * the VLM's coarse grid hints mint holds directly would violate design rule 1
 * (a 4x4 cell is ~100px of ambiguity — a human tap resolves it in one second,
 * an automatic centroid guess poisons the graph engine silently).
 *
 * Marks the VLM didn't return a verdict for are KEPT (fail-open): a partial or
 * truncated model response must degrade to "no filtering", not "no holds".
 */
export function applyVerification(
  candidates: HoldCandidate[],
  marks: SoMMark[],
  result: VlmVerifyResult,
): { kept: HoldCandidate[]; rejectedCount: number } {
  const verdictByCandidate = new Map<number, { keep: boolean; holdType: HoldType }>();
  for (const v of result.verdicts) {
    const mark = marks.find((m) => m.n === v.mark);
    if (mark) verdictByCandidate.set(mark.candidateIndex, { keep: v.keep, holdType: v.holdType });
  }

  const kept: HoldCandidate[] = [];
  let rejectedCount = 0;
  candidates.forEach((c, i) => {
    const verdict = verdictByCandidate.get(i);
    if (!verdict) {
      kept.push(c); // fail-open
    } else if (verdict.keep) {
      // Trust the VLM's type over YOLO's only when YOLO didn't know:
      // YOLO was trained on hold crops; the VLM sees one downscaled overview.
      kept.push({
        ...c,
        holdType: c.holdType === 'unknown' ? verdict.holdType : c.holdType,
      });
    } else {
      rejectedCount++;
    }
  });
  return { kept, rejectedCount };
}

/**
 * Commit candidates into the app's domain type, assigning world coordinates.
 *
 * The pixel→world math intentionally REPLICATES detection/holdDetector.ts
 * exactly (same origin convention, same Y inversion, same 0.1cm rounding), so
 * fused holds and classic-mode holds are indistinguishable to the graph
 * engine — that equivalence is what makes ?mode=classic an honest baseline.
 */
export function toDetectedHolds(
  candidates: HoldCandidate[],
  calibration: CalibrationResult,
  routeColor: string,
): DetectedHold[] {
  const holds: DetectedHold[] = candidates.map((c, i) => {
    const worldX = (c.pixelCenter.x - calibration.originPixel.x) / calibration.pixelsPerCm;
    // Image Y grows downward, world Y grows upward — same inversion as holdDetector.
    const worldY = (calibration.originPixel.y - c.pixelCenter.y) / calibration.pixelsPerCm;
    return {
      id: `hold-f${i}`, // 'f' namespace so fused ids can't collide with classic 'hold-N' ids mid-session
      pixelCenter: { x: Math.round(c.pixelCenter.x), y: Math.round(c.pixelCenter.y) },
      worldCenter: { x: Math.round(worldX * 10) / 10, y: Math.round(worldY * 10) / 10 },
      pixelRadius: Math.round(c.pixelRadius),
      color: routeColor,
      routeColor,
      isStart: false, // set by the auto-mark block below, adjustable in the tap UI
      isTop: false,
      manuallyAdded: false,
      // Preserve the detector's proposal and its uncertainty at the commit
      // boundary. Previously this information was silently discarded here.
      holdLabel: candidateTypeToHoldLabel(c.holdType, c.confidence, c.source),
    };
  });
  // Same ordering contract as the classic detector (highest hold first).
  holds.sort((a, b) => b.worldCenter.y - a.worldCenter.y);

  // Same AUTO-MARK contract as the classic detector: two lowest holds are
  // starts (two hands), highest is top; the user re-toggles in the review UI.
  // This parity was originally missing and was CAUGHT BY E2E: classic mode
  // pre-marked holds while fused mode didn't, so identical walls behaved
  // differently across modes — exactly the kind of drift ?mode=classic
  // baselining is supposed to preclude. Keep in sync with holdDetector.ts.
  if (holds.length >= 2) {
    holds[holds.length - 1].isStart = true;
    holds[holds.length - 2].isStart = true;
    holds[0].isTop = true;
  }
  return holds;
}

// ── Orchestrator (dependency-injected) ──────────────────────────────────────

/**
 * Everything the orchestrator needs from the outside world, injected so tests
 * can run the full fusion path headless with recorded fixtures — and so the
 * production wiring in HoldDetectionStep stays a five-line change.
 */
export interface FusionDeps {
  /** Runs the existing color-seg detector (canvas-bound, lives in the component). */
  segDetect: () => DetectedHold[];
  /** Calls the Roboflow model via the proxy. */
  yoloDetect: () => Promise<HoldCandidate[]>;
  /** Renders numbered SoM marks onto a downscaled copy; canvas-bound. */
  renderMarks?: (candidates: HoldCandidate[]) => { dataUrl: string; marks: SoMMark[] };
  /** One GPT-5.6 vision call judging the marked image. */
  verify?: (dataUrl: string, marks: SoMMark[]) => Promise<VlmVerifyResult>;
}

export interface FusionOptions {
  useYolo: boolean;
  useVlmVerify: boolean;
}

export interface FusionOutcome {
  candidates: HoldCandidate[];
  /** UI hints only — never auto-committed (see applyVerification). */
  missedCells: Array<{ cellX: number; cellY: number }>;
  /** Telemetry for the eval table & the on-screen source badges. */
  stats: { fromYolo: number; fromSeg: number; matchedBoth: number; vlmRejected: number };
}

/** Convert the classic detector's output into fusion candidates. */
export function segToCandidates(segHolds: DetectedHold[]): HoldCandidate[] {
  return segHolds.map((h) => ({
    pixelCenter: h.pixelCenter,
    pixelRadius: h.pixelRadius,
    source: 'colorseg' as const,
    confidence: COLORSEG_CONFIDENCE_PRIOR,
    holdType: 'unknown' as const,
  }));
}

/**
 * The full fusion pipeline. Failure policy: any external stage that throws is
 * treated as absent (logged, skipped) — a network hiccup must degrade the
 * result toward classic behavior, never blank the screen mid-demo.
 */
export async function detectHoldsFused(
  deps: FusionDeps,
  opts: FusionOptions,
): Promise<FusionOutcome> {
  const seg = segToCandidates(deps.segDetect());

  let yolo: HoldCandidate[] = [];
  if (opts.useYolo) {
    try {
      yolo = await deps.yoloDetect();
    } catch (err) {
      console.warn('[fusion] YOLO stage failed, continuing seg-only:', err);
    }
  }

  let candidates = mergeCandidates(yolo, seg);
  const matchedBoth = candidates.filter((c) => c.source === 'both').length;

  let missedCells: FusionOutcome['missedCells'] = [];
  let vlmRejected = 0;
  if (opts.useVlmVerify && deps.renderMarks && deps.verify && candidates.length > 0) {
    try {
      const { dataUrl, marks } = deps.renderMarks(candidates);
      const result = await deps.verify(dataUrl, marks);
      const applied = applyVerification(candidates, marks, result);
      candidates = applied.kept;
      vlmRejected = applied.rejectedCount;
      missedCells = result.missedCells;
    } catch (err) {
      console.warn('[fusion] VLM verify failed, keeping unverified candidates:', err);
    }
  }

  return {
    candidates,
    missedCells,
    stats: {
      fromYolo: candidates.filter((c) => c.source === 'yolo').length,
      fromSeg: candidates.filter((c) => c.source === 'colorseg').length,
      matchedBoth,
      vlmRejected,
    },
  };
}
