/**
 * Test-first contract for the public online video sample.
 *
 * The media and demo observations have different provenance. These checks
 * prevent the product from silently presenting a YanCe-authored trace as a
 * model result or as the publisher's ground truth.
 */
import { describe, expect, it } from 'vitest';
import {
  ONLINE_CLIMBING_SAMPLE,
  runOnlineClimbingSampleTrace,
} from '../../src/samples/onlineClimbingSample';

describe('online climbing sample', () => {
  it('contains reusable-media attribution and an explicit label limitation', () => {
    expect(ONLINE_CLIMBING_SAMPLE.license).toMatchObject({
      creator: 'Cryptic C62',
      name: 'CC BY-SA 3.0',
      modified: false,
    });
    expect(ONLINE_CLIMBING_SAMPLE.license.sourceUrl).toMatch(
      /^https:\/\/commons\.wikimedia\.org\//,
    );
    expect(ONLINE_CLIMBING_SAMPLE.license.url).toBe(
      'https://creativecommons.org/licenses/by-sa/3.0/',
    );
    expect(ONLINE_CLIMBING_SAMPLE.labels).toHaveLength(1);
    expect(ONLINE_CLIMBING_SAMPLE.labels[0].annotationKind).toBe('hand_authored_demo');
  });

  it('keeps every ordered observation inside the labeled video window', () => {
    const [label] = ONLINE_CLIMBING_SAMPLE.labels;
    const timestamps = ONLINE_CLIMBING_SAMPLE.observations.map((item) => item.timestampMs);

    expect(timestamps).toEqual([21_000, 21_160, 21_340, 21_520]);
    expect(timestamps).toEqual([...timestamps].sort((a, b) => a - b));
    expect(
      ONLINE_CLIMBING_SAMPLE.observations.every(
        (item) => item.timestampMs >= label.startMs && item.timestampMs <= label.endMs,
      ),
    ).toBe(true);
    expect(label.endMs).toBeLessThan(ONLINE_CLIMBING_SAMPLE.durationMs);
  });

  it('runs the four sample observations through the real time-based estimator', () => {
    const run = runOnlineClimbingSampleTrace();

    expect(run.sampleId).toBe(ONLINE_CLIMBING_SAMPLE.id);
    expect(run.estimates.map((item) => item.decision)).toEqual([
      'tracking',
      'tracking',
      'tracking',
      'propose',
    ]);
    expect(run.finalEstimate).toMatchObject({
      limb: 'leftFoot',
      holdId: 'sample-left-foot-hold',
      dwellMs: 520,
      decision: 'propose',
      estimator: 'time_based_baseline',
    });
    expect(Math.round(run.finalEstimate.probability * 100)).toBe(86);
  });

  it('links the real labeled research dataset without pretending it was downloaded', () => {
    expect(ONLINE_CLIMBING_SAMPLE.groundTruthDataset.name).toContain('The Way Up');
    expect(ONLINE_CLIMBING_SAMPLE.groundTruthDataset.url).toBe(
      'https://zenodo.org/records/15196867',
    );
    expect(ONLINE_CLIMBING_SAMPLE.groundTruthDataset.note).toContain('20.9 GB');
  });
});
