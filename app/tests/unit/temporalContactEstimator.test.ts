/**
 * Contract tests for P1 temporal contact evidence.
 *
 * These tests are intentionally written before the estimator implementation.
 * They describe the smallest useful behavior: one frame cannot become a
 * contact; stable evidence on the same hold can become a proposal; fast motion
 * or a changed hold cannot inherit earlier dwell; loss of evidence releases a
 * candidate; and evaluation cannot hide weak feet behind strong hands.
 */
import { describe, expect, it } from 'vitest';
import { Limb } from '../../src/types';
import {
  DEFAULT_TEMPORAL_CONTACT_CONFIG,
  TimeBasedContactEstimator,
  evaluateContactPredictions,
} from '../../src/tracking/temporalContactEstimator';
import { runRecordedFootSwitchTrace } from '../../src/tracking/recordedContactTrace';

function frame(
  timestampMs: number,
  overrides: Partial<{
    limb: Limb;
    holdId: string | null;
    overlapRatio: number;
    speedPxPerSecond: number;
    visibility: number;
  }> = {},
) {
  return {
    timestampMs,
    limb: overrides.limb ?? ('leftFoot' as const),
    holdId: overrides.holdId === undefined ? 'hold-3' : overrides.holdId,
    overlapRatio: overrides.overlapRatio ?? 0.8,
    speedPxPerSecond: overrides.speedPxPerSecond ?? 20,
    visibility: overrides.visibility ?? 0.9,
  };
}

describe('time-based contact estimator', () => {
  it('does not propose from one frame or before the required dwell', () => {
    const estimator = new TimeBasedContactEstimator();
    expect(estimator.observe(frame(0)).decision).toBe('tracking');

    const beforeDwell = estimator.observe(frame(499));
    expect(beforeDwell.decision).toBe('tracking');
    expect(beforeDwell.dwellMs).toBe(499);
  });

  it('proposes after stable evidence stays on the same hold long enough', () => {
    const estimator = new TimeBasedContactEstimator();
    estimator.observe(frame(0));

    const estimate = estimator.observe(frame(520));
    expect(estimate.decision).toBe('propose');
    expect(estimate.holdId).toBe('hold-3');
    expect(estimate.dwellMs).toBe(520);
    expect(estimate.probability).toBeCloseTo(0.8617, 3);
    expect(estimate.estimator).toBe('time_based_baseline');
  });

  it('blocks fast motion and makes later stable evidence start over', () => {
    const estimator = new TimeBasedContactEstimator();
    estimator.observe(frame(0));
    estimator.observe(frame(300));

    const moving = estimator.observe(
      frame(480, {
        speedPxPerSecond: DEFAULT_TEMPORAL_CONTACT_CONFIG.maxSpeedPxPerSecond + 1,
      }),
    );
    expect(moving.decision).toBe('tracking');
    expect(moving.dwellMs).toBe(0);

    const restarted = estimator.observe(frame(600));
    expect(restarted.decision).toBe('tracking');
    expect(restarted.dwellMs).toBe(0);
  });

  it('does not carry dwell from one candidate hold to another', () => {
    const estimator = new TimeBasedContactEstimator();
    estimator.observe(frame(0));
    estimator.observe(frame(450));

    const changedHold = estimator.observe(frame(520, { holdId: 'hold-7' }));
    expect(changedHold.decision).toBe('tracking');
    expect(changedHold.holdId).toBe('hold-7');
    expect(changedHold.dwellMs).toBe(0);
  });

  it('allows a short visibility gap, then releases after the grace period', () => {
    const estimator = new TimeBasedContactEstimator();
    estimator.observe(frame(0));
    estimator.observe(frame(520));

    const shortGap = estimator.observe(frame(700, { holdId: null, visibility: 0 }));
    expect(shortGap.decision).toBe('tracking');
    expect(shortGap.holdId).toBe('hold-3');

    const released = estimator.observe(frame(771, { holdId: null, visibility: 0 }));
    expect(released.decision).toBe('release');
    expect(released.holdId).toBe('hold-3');
  });

  it('turns the recorded foot-switch trace into explainable evidence', () => {
    const estimate = runRecordedFootSwitchTrace('hold-fixture-target');
    expect(estimate).toMatchObject({
      limb: 'leftFoot',
      holdId: 'hold-fixture-target',
      dwellMs: 520,
      decision: 'propose',
      estimator: 'time_based_baseline',
    });
    expect(Math.round(estimate.probability * 100)).toBe(86);
  });
});

describe('contact estimator evaluation', () => {
  it('reports mistakes overall and separately for every limb', () => {
    const result = evaluateContactPredictions([
      { limb: 'leftHand', expectedContact: true, proposedContact: true },
      { limb: 'rightHand', expectedContact: true, proposedContact: false },
      { limb: 'leftFoot', expectedContact: false, proposedContact: true },
      { limb: 'rightFoot', expectedContact: false, proposedContact: false },
    ]);

    expect(result).toMatchObject({
      total: 4,
      truePositive: 1,
      falsePositive: 1,
      trueNegative: 1,
      falseNegative: 1,
      precision: 0.5,
      recall: 0.5,
      f1: 0.5,
    });
    expect(result.byLimb.leftHand.recall).toBe(1);
    expect(result.byLimb.rightHand.falseNegative).toBe(1);
    expect(result.byLimb.leftFoot.falsePositive).toBe(1);
    expect(result.byLimb.rightFoot.trueNegative).toBe(1);
  });
});
