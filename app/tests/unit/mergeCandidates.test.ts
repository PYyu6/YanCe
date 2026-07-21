/**
 * Unit: mergeCandidates + applyVerification + toDetectedHolds — the pure core
 * of the fusion pipeline. These tests ARE the merge-rule spec.
 */
import { describe, it, expect } from 'vitest';
import {
  mergeCandidates,
  applyVerification,
  toDetectedHolds,
  segToCandidates,
  COLORSEG_CONFIDENCE_PRIOR,
  YOLO_MIN_CONFIDENCE,
} from '../../src/services/holdDetectionService';
import { HoldCandidate, SoMMark, VlmVerifyResult } from '../../src/services/holdCandidates';
import { FIXTURE_CALIBRATION } from '../fixtures/wallSimple';

function yolo(x: number, y: number, conf = 0.8, holdType: HoldCandidate['holdType'] = 'crimp'): HoldCandidate {
  return { pixelCenter: { x, y }, pixelRadius: 15, source: 'yolo', confidence: conf, holdType };
}
function seg(x: number, y: number, r = 10): HoldCandidate {
  return { pixelCenter: { x, y }, pixelRadius: r, source: 'colorseg', confidence: COLORSEG_CONFIDENCE_PRIOR, holdType: 'unknown' };
}

describe('mergeCandidates', () => {
  it('matches overlapping YOLO+seg into one "both" candidate keeping seg position and yolo type', () => {
    const merged = mergeCandidates([yolo(100, 100)], [seg(105, 103)]);
    expect(merged).toHaveLength(1);
    expect(merged[0].source).toBe('both');
    expect(merged[0].pixelCenter).toEqual({ x: 105, y: 103 }); // seg blob center preferred
    expect(merged[0].holdType).toBe('crimp'); // only YOLO knows types
    expect(merged[0].confidence).toBe(0.8); // max of the two
  });

  it('keeps distant candidates separate', () => {
    const merged = mergeCandidates([yolo(100, 100)], [seg(300, 300)]);
    expect(merged).toHaveLength(2);
    expect(merged.map((c) => c.source).sort()).toEqual(['colorseg', 'yolo']);
  });

  it('drops YOLO noise below the confidence floor but never drops seg candidates', () => {
    const merged = mergeCandidates([yolo(100, 100, YOLO_MIN_CONFIDENCE - 0.01)], [seg(300, 300)]);
    expect(merged).toHaveLength(1);
    expect(merged[0].source).toBe('colorseg');
  });

  it('is one-to-one: two YOLO boxes cannot both claim one seg blob', () => {
    const merged = mergeCandidates([yolo(100, 100), yolo(108, 100)], [seg(104, 100)]);
    const both = merged.filter((c) => c.source === 'both');
    expect(both).toHaveLength(1);
    expect(merged).toHaveLength(2); // matched pair + leftover yolo
  });
});

describe('applyVerification', () => {
  const candidates = [seg(10, 10), seg(50, 50), seg(90, 90)];
  const marks: SoMMark[] = [
    { n: 1, candidateIndex: 0 },
    { n: 2, candidateIndex: 1 },
    { n: 3, candidateIndex: 2 },
  ];

  it('removes rejected marks and relabels unknown types', () => {
    const result: VlmVerifyResult = {
      verdicts: [
        { mark: 1, keep: true, holdType: 'jug' },
        { mark: 2, keep: false, holdType: 'unknown' },
        { mark: 3, keep: true, holdType: 'sloper' },
      ],
      missedCells: [],
    };
    const { kept, rejectedCount } = applyVerification(candidates, marks, result);
    expect(kept).toHaveLength(2);
    expect(rejectedCount).toBe(1);
    expect(kept[0].holdType).toBe('jug'); // relabeled: was unknown
  });

  it('fails open: candidates without a verdict are kept', () => {
    const partial: VlmVerifyResult = {
      verdicts: [{ mark: 2, keep: false, holdType: 'unknown' }],
      missedCells: [],
    };
    const { kept } = applyVerification(candidates, marks, partial);
    expect(kept).toHaveLength(2); // marks 1 & 3 kept despite no verdict
  });

  it('never relabels a type YOLO already knew', () => {
    const withType = [{ ...seg(10, 10), holdType: 'crimp' as const }];
    const result: VlmVerifyResult = {
      verdicts: [{ mark: 1, keep: true, holdType: 'jug' }],
      missedCells: [],
    };
    const { kept } = applyVerification(withType, [{ n: 1, candidateIndex: 0 }], result);
    expect(kept[0].holdType).toBe('crimp');
  });
});

describe('toDetectedHolds — pixel→world commit', () => {
  it('replicates the classic detector world math exactly (incl. Y inversion + 0.1 rounding)', () => {
    // pixel (200, 890) with ppcm=2, origin (0,1000): world = (100, 55)
    const [h] = toDetectedHolds(
      [seg(200, 890)],
      FIXTURE_CALIBRATION,
      '#e74c3c',
    );
    expect(h.worldCenter).toEqual({ x: 100, y: 55 });
    expect(h.id).toMatch(/^hold-f/); // fused id namespace
  });

  it('sorts highest first AND auto-marks starts/top like the classic detector', () => {
    // Classic-parity contract (this divergence was caught by e2e): with ≥2
    // holds, the two lowest are starts, the highest is top.
    const holds = toDetectedHolds(
      [seg(0, 900), seg(0, 500), seg(0, 100)], // world y = 50, 250, 450
      FIXTURE_CALIBRATION,
      '#fff',
    );
    expect(holds[0].worldCenter.y).toBeGreaterThan(holds[1].worldCenter.y);
    expect(holds[0].isTop).toBe(true);        // highest
    expect(holds[2].isStart).toBe(true);      // lowest
    expect(holds[1].isStart).toBe(true);      // second lowest
    expect(holds[0].isStart).toBe(false);
  });

  it('does not auto-mark a single-hold detection (matches classic ≥2 guard)', () => {
    const [h] = toDetectedHolds([seg(0, 900)], FIXTURE_CALIBRATION, '#fff');
    expect(h.isStart).toBe(false);
    expect(h.isTop).toBe(false);
  });

  it('persists a detector proposal as morphology with visible provenance', () => {
    const [h] = toDetectedHolds(
      [yolo(100, 100, 0.84, 'crimp')],
      FIXTURE_CALIBRATION,
      '#fff',
    );
    expect(h.holdLabel).toMatchObject({
      morphology: 'edge',
      confidence: 0.84,
      source: 'vision_proposal',
    });
    expect(h.holdLabel?.compatibleGrips).toEqual(
      expect.arrayContaining(['open_hand', 'half_crimp', 'full_crimp']),
    );
  });

  it('keeps color-only holds explicitly unknown', () => {
    const [h] = toDetectedHolds([seg(100, 100)], FIXTURE_CALIBRATION, '#fff');
    expect(h.holdLabel).toMatchObject({
      morphology: 'unknown',
      source: 'manual_unknown',
    });
  });
});

describe('segToCandidates', () => {
  it('assigns the fixed prior and unknown type to color-seg holds', () => {
    const [c] = segToCandidates(
      toDetectedHolds([seg(10, 10)], FIXTURE_CALIBRATION, '#fff'),
    );
    expect(c.confidence).toBe(COLORSEG_CONFIDENCE_PRIOR);
    expect(c.holdType).toBe('unknown');
    expect(c.source).toBe('colorseg');
  });
});
