/**
 * holdCandidates.ts — Shared types for the detection-fusion pipeline.
 *
 * WHY A SEPARATE "CANDIDATE" TYPE (instead of reusing DetectedHold):
 * DetectedHold is the app's *committed* domain object — it already has world
 * coordinates, a route color, start/top flags, and an id that the graph engine
 * keys on. During fusion we are still negotiating between three unreliable
 * sources (YOLO, color segmentation, VLM verification), none of which should
 * be allowed to mint committed ids or world coordinates yet. Keeping a thin
 * pre-commitment type makes the merge logic pure, testable, and impossible to
 * accidentally leak half-verified holds into the engine.
 */

import { Point } from '../types';

/**
 * Hold type taxonomy. Matches the classes of the Roboflow community models
 * (Blackcreed "Climbing Holds and Volumes") so YOLO output maps 1:1.
 * 'unknown' is the safe default — the difficulty modifier for 'unknown' is 1.0,
 * i.e. hold-type information can only ever refine the engine, never break it
 * when absent (graceful-degradation rule from the execution plan).
 */
export type HoldType =
  | 'jug'      // big positive grip — easier
  | 'crimp'    // small edge — harder, especially for beginners
  | 'sloper'   // rounded, friction-dependent — harder
  | 'pocket'   // finger holes
  | 'pinch'    // thumb-opposition grip
  | 'volume'   // large feature bolted to the wall
  | 'unknown';

/** Where a candidate came from. 'both' = matched across sources → highest trust. */
export type CandidateSource = 'yolo' | 'colorseg' | 'both';

export interface HoldCandidate {
  /** Center in IMAGE pixel space. World conversion happens only at commit time. */
  pixelCenter: Point;
  /** Approximate radius in pixels (blob radius or half the YOLO box diagonal). */
  pixelRadius: number;
  source: CandidateSource;
  /**
   * 0..1. Color-seg candidates get a fixed prior (they passed a color filter but
   * carry no learned confidence); YOLO candidates carry the model's own score;
   * merged candidates take the max — agreement between independent detectors is
   * itself evidence, which is the entire point of fusing.
   */
  confidence: number;
  holdType: HoldType;
}

/** A numbered mark placed on the image for Set-of-Mark VLM verification. */
export interface SoMMark {
  /** 1-based mark number drawn on the image and referenced by the VLM. */
  n: number;
  /** Index into the candidate array this mark represents. */
  candidateIndex: number;
}

/**
 * The VLM's judgment of the marked image.
 * WHY verdict-per-mark and not coordinates: VLMs are unreliable at emitting
 * pixel coordinates but good at judging "is mark 7 a climbing hold, and what
 * kind?" (Set-of-Mark prompting, arXiv 2310.11441). The contract forbids the
 * model from localizing; it may only judge marks and coarsely flag missed
 * regions on a 4x4 grid, which the UI turns into "look here" hints for the
 * human tap-to-correct pass — never into auto-added holds.
 */
export interface VlmVerifyResult {
  verdicts: Array<{
    mark: number;
    keep: boolean;
    holdType: HoldType;
  }>;
  /** Cells of a 4x4 grid (0..3 each axis) where the VLM believes holds were missed. */
  missedCells: Array<{ cellX: number; cellY: number }>;
}
