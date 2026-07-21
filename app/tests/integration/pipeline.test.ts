/**
 * INTEGRATION: the full detection-fusion pipeline with recorded/mocked model
 * responses — photo-shaped input → fused candidates → committed holds →
 * graph → betas. No network, no canvas: the injected deps play the roles of
 * the color detector, Roboflow, and GPT-5.6, exactly as they would in prod.
 */
import { describe, it, expect } from 'vitest';
import {
  detectHoldsFused,
  toDetectedHolds,
  mergeCandidates,
  segToCandidates,
  FusionDeps,
} from '../../src/services/holdDetectionService';
import { HoldCandidate, SoMMark } from '../../src/services/holdCandidates';
import { computeBetaForProfile } from '../../src/services/betaForProfile';
import { FIXTURE_CALIBRATION, FIXTURE_HOLDS, TALL_PROFILE, worldToPixel } from '../fixtures/wallSimple';
import { DetectedHold } from '../../src/types';

/**
 * The "camera" scenario the fusion pipeline exists to handle:
 *  - seg sees every fixture hold (raw, unflagged);
 *  - YOLO agrees on one hold (M) and adds one FALSE POSITIVE (a chalk smudge);
 *  - the "recorded" GPT-5.6 verdict vetoes exactly the smudge.
 */
function makeScenario() {
  const smudge = worldToPixel(30, 60); // not a real hold

  const segHolds: DetectedHold[] = FIXTURE_HOLDS.map((h) => ({
    ...h,
    isStart: false, // raw detection carries no flags — humans mark them later
    isTop: false,
  }));

  const yoloCandidates: HoldCandidate[] = [
    // Agrees with seg on the M hold (world 0,55) — becomes source:'both'
    { pixelCenter: worldToPixel(0, 55), pixelRadius: 14, source: 'yolo', confidence: 0.9, holdType: 'jug' },
    // The false positive only YOLO sees
    { pixelCenter: smudge, pixelRadius: 10, source: 'yolo', confidence: 0.55, holdType: 'crimp' },
  ];

  // Precompute the merged order with the REAL merge function so the verify
  // stub can identify the smudge by candidate index — the same information a
  // real VLM gets from the numbered marks on the image.
  const merged = mergeCandidates(yoloCandidates, segToCandidates(segHolds));
  const smudgeIndex = merged.findIndex(
    (c) => Math.abs(c.pixelCenter.x - smudge.x) < 1 && Math.abs(c.pixelCenter.y - smudge.y) < 1,
  );

  const deps: FusionDeps = {
    segDetect: () => segHolds,
    yoloDetect: async () => yoloCandidates,
    renderMarks: (candidates) => ({
      dataUrl: 'data:image/jpeg;base64,recorded-fixture',
      marks: candidates.map((_, i): SoMMark => ({ n: i + 1, candidateIndex: i })),
    }),
    verify: async (_dataUrl, marks) => ({
      verdicts: marks.map((m) => ({
        mark: m.n,
        keep: m.candidateIndex !== smudgeIndex,
        holdType: 'unknown' as const,
      })),
      missedCells: [{ cellX: 1, cellY: 2 }],
    }),
  };

  return { deps, smudge };
}

describe('detection fusion pipeline (recorded responses)', () => {
  it('fuses seg+yolo, vetoes the false positive, and reports honest stats', async () => {
    const { deps, smudge } = makeScenario();
    const outcome = await detectHoldsFused(deps, { useYolo: true, useVlmVerify: true });

    // The smudge must be gone…
    const hasSmudge = outcome.candidates.some(
      (c) => Math.abs(c.pixelCenter.x - smudge.x) < 1 && Math.abs(c.pixelCenter.y - smudge.y) < 1,
    );
    expect(hasSmudge).toBe(false);
    expect(outcome.stats.vlmRejected).toBe(1);

    // …every real fixture hold must survive…
    expect(outcome.candidates.length).toBe(FIXTURE_HOLDS.length);

    // …the seg+yolo agreement on M must be recorded…
    expect(outcome.stats.matchedBoth).toBe(1);

    // …and missed-cell hints surface for the UI without minting holds.
    expect(outcome.missedCells).toEqual([{ cellX: 1, cellY: 2 }]);
  });

  it('degrades to seg-only behavior when both flags are off (the ?mode=classic guarantee)', async () => {
    const { deps } = makeScenario();
    const outcome = await detectHoldsFused(deps, { useYolo: false, useVlmVerify: false });
    expect(outcome.candidates).toHaveLength(FIXTURE_HOLDS.length);
    expect(outcome.candidates.every((c) => c.source === 'colorseg')).toBe(true);
  });

  it('survives a YOLO outage by continuing seg-only (network must never blank the demo)', async () => {
    const { deps } = makeScenario();
    deps.yoloDetect = async () => { throw new Error('roboflow 502'); };
    const outcome = await detectHoldsFused(deps, { useYolo: true, useVlmVerify: false });
    expect(outcome.candidates).toHaveLength(FIXTURE_HOLDS.length);
  });

  it('survives a VLM outage by keeping unverified candidates (fail-open)', async () => {
    const { deps } = makeScenario();
    deps.verify = async () => { throw new Error('openai 429'); };
    const outcome = await detectHoldsFused(deps, { useYolo: true, useVlmVerify: true });
    // Unverified means the smudge stays — that's the documented trade of
    // fail-open, and the human tap-to-correct layer is the answer to it.
    expect(outcome.candidates.length).toBe(FIXTURE_HOLDS.length + 1);
    expect(outcome.stats.vlmRejected).toBe(0);
  });

  it('carries fused output all the way into a beta (end-to-end shape check)', async () => {
    const { deps } = makeScenario();
    const outcome = await detectHoldsFused(deps, { useYolo: true, useVlmVerify: true });

    // Commit → re-mark start/top the way the human step would…
    const committed = toDetectedHolds(outcome.candidates, FIXTURE_CALIBRATION, '#e74c3c');
    const byY = [...committed].sort((a, b) => a.worldCenter.y - b.worldCenter.y);
    byY[0].isStart = true;
    byY[byY.length - 1].isTop = true;

    // …and the engine must produce at least one complete beta whose every
    // move references committed holds only.
    const { betas } = computeBetaForProfile(committed, TALL_PROFILE);
    expect(betas.length).toBeGreaterThan(0);
    const ids = new Set(committed.map((h) => h.id));
    for (const move of betas[0].moves) {
      expect(ids.has(move.toHoldId)).toBe(true);
    }
  });
});
