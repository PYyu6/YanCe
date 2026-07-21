/**
 * demoSeed.test.ts — the `?demo=1` seed must reproduce the PROVEN wall.
 *
 * The load-bearing assertion is the last one: applying the seed to the real
 * zustand store must yield the same analysis the engine integration test
 * proves for the ladder fixture (tall 190/195 ⇒ a 4-move best beta). If the
 * seed drifts from the fixture geometry — wrong ppcm, wrong start flags, a
 * missed hold — that number breaks before any judge sees a wrong demo.
 */

import { describe, it, expect, afterEach } from 'vitest';
import {
  isDemoRequested,
  buildDemoSeed,
  applyDemoSeed,
  DEMO_BADGE_TEXT,
} from '../../src/services/demoSeed';
import { ladderWallSpec } from '../../src/services/syntheticWall';
import { useAppStore } from '../../src/store/useAppStore';

describe('isDemoRequested', () => {
  it('accepts exactly ?demo=1', () => {
    expect(isDemoRequested(new URLSearchParams('?demo=1'))).toBe(true);
  });

  it('rejects absent, 0, and non-1 values (no accidental demo)', () => {
    expect(isDemoRequested(new URLSearchParams(''))).toBe(false);
    expect(isDemoRequested(new URLSearchParams('?demo=0'))).toBe(false);
    expect(isDemoRequested(new URLSearchParams('?demo=true'))).toBe(false);
    expect(isDemoRequested(new URLSearchParams('?mode=classic'))).toBe(false);
  });
});

describe('buildDemoSeed', () => {
  const seed = buildDemoSeed();
  const spec = ladderWallSpec();

  it('uses the tall proven profile (the two-profile claim depends on it)', () => {
    expect(seed.profile.height).toBe(190);
    expect(seed.profile.armSpan).toBe(195);
  });

  it('calibration reproduces the spec taps exactly: 5 px/cm, manual method', () => {
    expect(seed.calibration.method).toBe('manual');
    expect(seed.calibration.pixelsPerCm).toBe(5);
    // Origin at the first tap point — same convention the manual calibration
    // UI produces, so seeded world coords match flow-derived ones.
    expect(seed.calibration.originPixel).toEqual(spec.calibration.p1);
  });

  it('seeds every non-distractor hold and no others', () => {
    const nonDistractor = spec.holds.filter((h) => h.role !== 'distractor');
    expect(seed.holds).toHaveLength(nonDistractor.length);
    // Distractor blue must never leak into the seeded route.
    expect(seed.holds.every((h) => h.color === nonDistractor[0].colorHex)).toBe(true);
  });

  it('replicates the CORRECTED e2e geometry: exactly one start, one top', () => {
    expect(seed.holds.filter((h) => h.isStart)).toHaveLength(1);
    expect(seed.holds.filter((h) => h.isTop)).toHaveLength(1);
  });

  it('world coordinates match the engine fixture via the detector transform', () => {
    // Spec pixel→world: x=(px−300)/5, y=(1000−py)/5, rounded to 0.1 —
    // identical to holdDetector. Spot-check the three fixture landmarks.
    const at = (wx: number, wy: number) =>
      seed.holds.find(
        (h) => Math.abs(h.worldCenter.x - wx) < 0.05 && Math.abs(h.worldCenter.y - wy) < 0.05,
      );
    expect(at(0, 0)?.isStart).toBe(true);      // start hold at the origin
    expect(at(0, 110)?.isTop).toBe(true);      // top at world y=110
    expect(at(0, 16.5)).toBeDefined();         // first rung
    expect(at(45, 55)).toBeDefined();          // decoy — real detection finds it too
  });

  it('exports non-empty disclosure copy for the analysis badge', () => {
    expect(DEMO_BADGE_TEXT.length).toBeGreaterThan(0);
    expect(DEMO_BADGE_TEXT.toLowerCase()).toContain('demo');
  });
});

describe('applyDemoSeed drives the REAL store to a genuine analysis', () => {
  afterEach(() => {
    useAppStore.getState().reset();
  });

  it('lands on analyze with the proven 4-move tall beta', () => {
    const fakeImage = 'data:image/png;base64,seeded'; // engine never reads pixels
    const seed = applyDemoSeed(useAppStore.getState(), fakeImage);

    const state = useAppStore.getState();
    expect(state.step).toBe('analyze');
    expect(state.capturedImage).toBe(fakeImage);
    expect(state.imageSize).toEqual({
      width: seed.wallSpec.widthPx,
      height: seed.wallSpec.heightPx,
    });

    // The genuine engine ran: betas exist and the best one is the fixture's
    // proven 4-move tall sequence (rung-skipping enabled by the 195 span).
    const analysis = state.analysis!;
    expect(analysis).not.toBeNull();
    expect(analysis.betas.length).toBeGreaterThan(0);
    expect(analysis.betas[0].moves).toHaveLength(4);

    // Reach map exists for every seeded hold — RouteView depends on it.
    for (const hold of analysis.holds) {
      expect(analysis.reachMap[hold.id]).toBeDefined();
    }
  });
});
