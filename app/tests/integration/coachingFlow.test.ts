/**
 * INTEGRATION: engine moves → coaching call (mocked GPT-5.6) → grounded output.
 * Exercises coachMoves end-to-end including the response filter, proving that
 * a hallucinating model CANNOT get an invented hold into the UI.
 */
import { describe, it, expect, vi } from 'vitest';
import { coachMoves } from '../../src/services/vlm';
import { computeBetaForProfile } from '../../src/services/betaForProfile';
import { FIXTURE_HOLDS, TALL_PROFILE } from '../fixtures/wallSimple';

function mockFetchReturning(body: unknown) {
  return vi.fn().mockResolvedValue({ ok: true, json: async () => body }) as unknown as typeof fetch;
}

describe('coaching flow over real engine output', () => {
  const { measurements, betas } = computeBetaForProfile(FIXTURE_HOLDS, TALL_PROFILE);
  const moves = betas[0].moves;

  it('returns coaching for real moves untouched', async () => {
    const wellBehaved = {
      coachings: moves.map((m) => ({
        step: m.step,
        coaching: `Move your ${m.limb} to ${m.toHoldId} with hips close to the wall.`,
      })),
    };
    const out = await coachMoves(moves, measurements, [], mockFetchReturning(wellBehaved));
    expect(out).toHaveLength(moves.length);
  });

  it('drops coaching that references a hold no move touches (hallucination gate)', async () => {
    const hallucinating = {
      coachings: [
        { step: moves[0].step, coaching: `Reach ${moves[0].toHoldId} smoothly.` }, // grounded
        { step: moves[1].step, coaching: 'Now heel hook on hold-999 and rest.' },  // fabricated
      ],
    };
    const out = await coachMoves(moves, measurements, [], mockFetchReturning(hallucinating));
    expect(out.map((c) => c.step)).toEqual([moves[0].step]); // only the grounded one survives
  });

  it('tolerates a malformed model response by returning [] (UI falls back to rule-based tips)', async () => {
    const out = await coachMoves(moves, measurements, [], mockFetchReturning({ garbage: 42 }));
    expect(out).toEqual([]);
  });

  it('sends the grounding contract to the model (prompt carries the move list)', async () => {
    const fetchMock = mockFetchReturning({ coachings: [] });
    await coachMoves(moves, measurements, [], fetchMock);
    const body = JSON.parse((fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].body as string);
    expect(body.task).toBe('coach');
    expect(body.system).toContain('Never invent');
    for (const m of moves) {
      expect(body.user).toContain(m.toHoldId);
    }
  });
});
