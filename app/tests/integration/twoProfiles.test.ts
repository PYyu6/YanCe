/**
 * INTEGRATION: THE PRODUCT CLAIM, EXECUTABLE.
 *
 * "Beta is body-relative" is YanCe's entire pitch. This test runs the real
 * engine (no mocks anywhere) over the designed fixture wall and asserts that
 * a 190cm and a 160cm climber receive DIFFERENT move sequences — and that
 * both sequences are complete, ordered, and physically consistent.
 *
 * If this test ever fails after an engine change, the demo's headline is
 * broken, whatever else still passes.
 */
import { describe, it, expect } from 'vitest';
import {
  computeBetaForProfile,
  betaSequencesDiffer,
} from '../../src/services/betaForProfile';
import { FIXTURE_HOLDS, TALL_PROFILE, SHORT_PROFILE } from '../fixtures/wallSimple';

describe('two bodies, one wall (the demo money-shot as a test)', () => {
  const tall = computeBetaForProfile(FIXTURE_HOLDS, TALL_PROFILE);
  const short = computeBetaForProfile(FIXTURE_HOLDS, SHORT_PROFILE);

  it('produces at least one complete beta for each body', () => {
    expect(tall.betas.length).toBeGreaterThan(0);
    expect(short.betas.length).toBeGreaterThan(0);
    // Both must actually reach the top hold.
    expect(tall.betas[0].moves.at(-1)?.toHoldId).toBe('hold-top');
    expect(short.betas[0].moves.at(-1)?.toHoldId).toBe('hold-top');
  });

  it('gives the two bodies DIFFERENT sequences — the product claim', () => {
    expect(betaSequencesDiffer(tall, short)).toBe(true);
  });

  it('lets the tall climber SKIP rungs — 4 bigger moves (33cm skips are easy for 195cm span)', () => {
    // Wall design guarantee: any 3-move path needs a >38.6cm hop (moderate for
    // tall), so 4 × easy skips is tall's unique-cost optimum (cost 4).
    expect(tall.betas[0].moves).toHaveLength(4);
  });

  it('forces the short climber onto single rungs — 6 small moves (skips cost 3× for 160cm span)', () => {
    // For the short body a 33cm rung-skip is 'moderate' (w3), so any skip
    // variant costs ≥7; the single-hop ladder is uniquely optimal at cost 6.
    // (l6 is skipped by EVERYONE: l5→top is 27.5cm — easy even for the short
    // body — so the last "rung" is geometrically redundant. First version of
    // this test expected 7 hops through l6; the engine found the cheaper 6 and
    // the engine was right.)
    const shortSeq = short.betas[0].moves.map((m) => m.toHoldId);
    expect(shortSeq).toEqual([
      'hold-l1', 'hold-l2', 'hold-l3', 'hold-l4', 'hold-l5', 'hold-top',
    ]);
  });

  it('prices the decoy straddle hold (M) out of both optimal paths', () => {
    // M-route = 2 moves: tall 3+3=6 > 4; short 6+6=12 > 7. If either climber
    // starts using M, the weight model changed — re-derive the fixture math.
    const tallSeq = tall.betas[0].moves.map((m) => m.toHoldId);
    const shortSeq = short.betas[0].moves.map((m) => m.toHoldId);
    expect(tallSeq).not.toContain('hold-M');
    expect(shortSeq).not.toContain('hold-M');
  });

  it('keeps every move within the moving body\'s classified reach (no unreachable moves)', () => {
    for (const result of [tall, short]) {
      for (const move of result.betas[0].moves) {
        expect(move.difficulty).not.toBe('unreachable');
      }
    }
  });

  it('numbers moves sequentially from 1 (UI stepper contract)', () => {
    for (const result of [tall, short]) {
      result.betas[0].moves.forEach((m, i) => expect(m.step).toBe(i + 1));
    }
  });
});
