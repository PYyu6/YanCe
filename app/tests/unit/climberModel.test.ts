/**
 * Unit: climberModel — the measurement math the whole product claim rests on.
 * Hand-computed expected values; if a formula changes these MUST be revisited
 * consciously (they encode the same ratios the fixture-wall design assumes).
 */
import { describe, it, expect } from 'vitest';
import { computeMeasurements, classifyReach } from '../../src/engine/climberModel';
import { TALL_PROFILE, SHORT_PROFILE } from '../fixtures/wallSimple';

describe('computeMeasurements', () => {
  it('computes tall profile (190cm / 195 span) to hand-checked values', () => {
    const m = computeMeasurements(TALL_PROFILE);
    // standingReach = 190*1.25 + (195-190)*0.5 = 237.5 + 2.5
    expect(m.standingReach).toBeCloseTo(240, 5);
    // armLength = 195 * 0.44
    expect(m.armLength).toBeCloseTo(85.8, 5);
    expect(m.apeIndex).toBeCloseTo(195 / 190, 5);
  });

  it('computes short profile (160cm / 160 span) to hand-checked values', () => {
    const m = computeMeasurements(SHORT_PROFILE);
    expect(m.standingReach).toBeCloseTo(200, 5);
    expect(m.armLength).toBeCloseTo(70.4, 5);
    expect(m.apeIndex).toBeCloseTo(1, 5);
  });
});

describe('classifyReach — the boundaries the fixture wall is built on', () => {
  const tallArm = 85.8; // upward effective = 77.22 → moderate band < 57.9
  const shortArm = 70.4; // upward effective = 63.36 → moderate band < 47.5

  it('55cm upward straddles the class boundary between the two bodies', () => {
    // THE load-bearing fact for the two-profile difference test:
    expect(classifyReach(55, tallArm, true)).toBe('moderate');
    expect(classifyReach(55, shortArm, true)).toBe('limit');
  });

  it('single ladder hops (16.5cm) are easy for both bodies', () => {
    expect(classifyReach(16.5, tallArm, true)).toBe('easy');
    expect(classifyReach(16.5, shortArm, true)).toBe('easy');
  });

  it('a two-rung skip (33cm) straddles the EASY boundary — the fixture-wall mechanism', () => {
    // This asymmetry is what makes tall and short climbers take different
    // paths on the fixture: skipping is free for tall, taxed for short.
    expect(classifyReach(33, tallArm, true)).toBe('easy');      // 33/77.2 = 0.43
    expect(classifyReach(33, shortArm, true)).toBe('moderate'); // 33/63.4 = 0.52
  });

  it('marks truly impossible reaches unreachable for both', () => {
    expect(classifyReach(200, tallArm, true)).toBe('unreachable');
    expect(classifyReach(200, shortArm, true)).toBe('unreachable');
  });

  it('lateral reaches use the longer effective radius than upward', () => {
    // 80cm: upward for tall = 80/77.2 > 1 → dynamic; lateral = 80/94.4 → limit
    expect(classifyReach(80, tallArm, true)).toBe('dynamic');
    expect(classifyReach(80, tallArm, false)).toBe('limit');
  });
});
