/**
 * Small deterministic trace used by the P1 interface and browser tests.
 *
 * The numbers describe a left foot staying over one hold for 520 ms with low
 * image-plane speed. They are synthetic acceptance data, not a captured person
 * and not evidence of real-camera accuracy. Keeping the trace in an adapter
 * makes that limitation explicit and lets a future camera adapter feed the
 * exact same estimator contract.
 */
import { ContactFrameObservation, TemporalContactEstimate } from '../types';
import { TimeBasedContactEstimator } from './temporalContactEstimator';

export function recordedFootSwitchTrace(targetHoldId: string): ContactFrameObservation[] {
  return [0, 160, 340, 520].map((timestampMs) => ({
    timestampMs,
    limb: 'leftFoot',
    holdId: targetHoldId,
    overlapRatio: 0.8,
    speedPxPerSecond: 20,
    visibility: 0.9,
  }));
}

export function runRecordedFootSwitchTrace(targetHoldId: string): TemporalContactEstimate {
  const estimator = new TimeBasedContactEstimator();
  let estimate: TemporalContactEstimate | undefined;
  for (const observation of recordedFootSwitchTrace(targetHoldId)) {
    estimate = estimator.observe(observation);
  }
  if (!estimate) throw new Error('Recorded foot-switch trace must contain at least one frame.');
  return estimate;
}
