/**
 * Unit: vlm — prompt building, response sanitizing, and the grounding
 * validator (the anti-hallucination contract, tested without any network).
 */
import { describe, it, expect } from 'vitest';
import {
  buildCoachPrompt,
  parseVerifyResponse,
  validateCoachingGrounded,
} from '../../src/services/vlm';
import { computeMeasurements } from '../../src/engine/climberModel';
import { TALL_PROFILE } from '../fixtures/wallSimple';
import { Move } from '../../src/types';

const MOVES: Move[] = [
  { step: 1, limb: 'rightHand', fromHoldId: null, toHoldId: 'hold-M', reachDistance: 55, difficulty: 'moderate', technique: null, tip: 'reach' },
  { step: 2, limb: 'leftHand', fromHoldId: 'hold-M', toHoldId: 'hold-top', reachDistance: 55, difficulty: 'moderate', technique: 'flag', tip: 'go' },
];

describe('buildCoachPrompt', () => {
  const m = computeMeasurements(TALL_PROFILE);
  const prompt = buildCoachPrompt(MOVES, m);

  it('includes every move and only hold ids the moves touch', () => {
    expect(prompt.user).toContain('hold-M');
    expect(prompt.user).toContain('hold-top');
    expect(prompt.user).toContain('step 1');
    expect(prompt.user).toContain('step 2');
  });

  it('states the grounding rules in the system prompt', () => {
    expect(prompt.system).toContain('Never invent');
    expect(prompt.system).toContain('ONLY');
  });

  it('includes the climber measurements the advice must be grounded in', () => {
    expect(prompt.user).toContain(`armLength ${Math.round(m.armLength)}cm`);
  });
});

describe('parseVerifyResponse', () => {
  it('sanitizes malformed items instead of rejecting the response (fail-open)', () => {
    const parsed = parseVerifyResponse({
      verdicts: [
        { mark: 1, keep: true, holdType: 'jug' },
        { mark: 'two', keep: true, holdType: 'jug' },      // bad mark → dropped
        { mark: 3, keep: false, holdType: 'flying-hold' }, // bad type → unknown
      ],
      missedCells: [
        { cellX: 2, cellY: 3 },
        { cellX: 9, cellY: 0 }, // outside 4x4 contract → dropped
      ],
    });
    expect(parsed.verdicts).toHaveLength(2);
    expect(parsed.verdicts[1].holdType).toBe('unknown');
    expect(parsed.missedCells).toEqual([{ cellX: 2, cellY: 3 }]);
  });

  it('returns an empty result for garbage input', () => {
    expect(parseVerifyResponse('not json at all')).toEqual({ verdicts: [], missedCells: [] });
    expect(parseVerifyResponse(null)).toEqual({ verdicts: [], missedCells: [] });
  });
});

describe('validateCoachingGrounded — the anti-hallucination gate', () => {
  it('passes coaching that references only real steps and holds', () => {
    const violations = validateCoachingGrounded(
      [
        { step: 1, coaching: 'Set your feet, then reach hold-M with control.' },
        { step: 2, coaching: 'Flag the left leg and go to hold-top.' },
      ],
      MOVES,
    );
    expect(violations).toEqual([]);
  });

  it('catches a fabricated hold id', () => {
    const violations = validateCoachingGrounded(
      [{ step: 1, coaching: 'Heel hook on hold-99 for stability.' }],
      MOVES,
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('hold-99');
  });

  it('catches coaching for a step that does not exist', () => {
    const violations = validateCoachingGrounded(
      [{ step: 7, coaching: 'Just believe.' }],
      MOVES,
    );
    expect(violations[0]).toContain('step 7');
  });

  it('recognizes fused-namespace ids (hold-f3) as valid mentions', () => {
    const fusedMoves: Move[] = [
      { ...MOVES[0], toHoldId: 'hold-f3' },
    ];
    const ok = validateCoachingGrounded(
      [{ step: 1, coaching: 'Reach hold-f3 steadily.' }],
      fusedMoves,
    );
    expect(ok).toEqual([]);
  });
});
