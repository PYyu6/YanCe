/**
 * Public-media climbing sample used by `?sample=video`.
 *
 * The WebM is an unchanged CC BY-SA 3.0 work from Wikimedia Commons. The four
 * observations below are YanCe-authored acceptance data aligned to a visually
 * stable left-foot window near 21 seconds. They were NOT produced by a pose
 * model and were NOT supplied by the video creator. This sample therefore
 * proves playback → ordered evidence → estimator → explanation, not vision
 * accuracy. `groundTruthDataset` points to the larger research-grade next step.
 */
import {
  LicensedClimbingVideoSample,
  SampleContactRun,
  TemporalContactEstimate,
} from '../types';
import { TimeBasedContactEstimator } from '../tracking/temporalContactEstimator';

const SAMPLE_HOLD_ID = 'sample-left-foot-hold';
const SAMPLE_TIMESTAMPS_MS = [21_000, 21_160, 21_340, 21_520] as const;

export const ONLINE_CLIMBING_SAMPLE: LicensedClimbingVideoSample = {
  id: 'wikimedia-indoor-bouldering-v3',
  title: 'Indoor Bouldering V3 Rock Spot',
  mediaPath: '/samples/indoor-bouldering-v3-rock-spot.webm',
  durationMs: 46_000,
  dimensions: { width: 204, height: 360 },
  license: {
    name: 'CC BY-SA 3.0',
    url: 'https://creativecommons.org/licenses/by-sa/3.0/',
    creator: 'Cryptic C62',
    sourceUrl:
      'https://commons.wikimedia.org/wiki/File:Indoor_Bouldering_V3_Rock_Spot.webm',
    modified: false,
  },
  labels: [
    {
      limb: 'leftFoot',
      holdId: SAMPLE_HOLD_ID,
      startMs: SAMPLE_TIMESTAMPS_MS[0],
      endMs: SAMPLE_TIMESTAMPS_MS.at(-1)!,
      annotationKind: 'hand_authored_demo',
      note: 'YanCe-authored UI exercise label; not pixel-derived and not research ground truth.',
    },
  ],
  observations: SAMPLE_TIMESTAMPS_MS.map((timestampMs) => ({
    timestampMs,
    limb: 'leftFoot',
    holdId: SAMPLE_HOLD_ID,
    overlapRatio: 0.8,
    speedPxPerSecond: 20,
    visibility: 0.9,
  })),
  groundTruthDataset: {
    name: 'The Way Up hold-usage dataset',
    url: 'https://zenodo.org/records/15196867',
    note: '22 coach-annotated climbing videos with hold-use times and occlusions; full archive is 20.9 GB.',
  },
};

/** Run the published sample object through the same estimator used by Stuck Mode. */
export function runOnlineClimbingSampleTrace(): SampleContactRun {
  const estimator = new TimeBasedContactEstimator();
  const estimates: TemporalContactEstimate[] = ONLINE_CLIMBING_SAMPLE.observations.map(
    (observation) => estimator.observe(observation),
  );
  const finalEstimate = estimates.at(-1);
  if (!finalEstimate) throw new Error('Online climbing sample must contain observations.');
  return { sampleId: ONLINE_CLIMBING_SAMPLE.id, estimates, finalEstimate };
}
