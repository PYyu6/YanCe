/**
 * vlm.ts — The one thin client for both GPT-5.6 uses: hold verification and
 * per-move coaching. One module so retry/caching/error policy live in one place.
 *
 * GROUNDING RULE (the load-bearing design decision of this file): the coaching
 * call receives STRUCTURED MOVE DATA, never the image and never free rein.
 * The model's job is to explain moves the deterministic engine already chose —
 * "elaborate, don't invent". validateCoachingGrounded() enforces this
 * mechanically after every call, because a hallucinated "heel hook on hold-9"
 * when hold-9 isn't in the sequence is worse than no coaching at all: climber
 * judges will spot it instantly and it poisons trust in the whole product.
 */

import { BodyMeasurements, Move } from '../types';
import { SoMMark, VlmVerifyResult, HoldType } from './holdCandidates';
import { TechniqueSuggestion } from '../engine/techniqueAdvisor';

// ── Verification call ───────────────────────────────────────────────────────

const VALID_HOLD_TYPES: HoldType[] = ['jug', 'crimp', 'sloper', 'pocket', 'pinch', 'volume', 'unknown'];

/**
 * Parse + sanitize a raw VLM verify response. Exported for tests.
 * Fail-open philosophy: anything malformed is dropped item-by-item rather than
 * rejecting the whole response — applyVerification() already treats missing
 * verdicts as "keep", so partial parses degrade safely.
 */
export function parseVerifyResponse(raw: unknown): VlmVerifyResult {
  const out: VlmVerifyResult = { verdicts: [], missedCells: [] };
  if (typeof raw !== 'object' || raw === null) return out;
  const obj = raw as Record<string, unknown>;

  if (Array.isArray(obj.verdicts)) {
    for (const v of obj.verdicts) {
      if (typeof v !== 'object' || v === null) continue;
      const { mark, keep, holdType } = v as Record<string, unknown>;
      if (typeof mark !== 'number' || typeof keep !== 'boolean') continue;
      out.verdicts.push({
        mark,
        keep,
        holdType: VALID_HOLD_TYPES.includes(holdType as HoldType) ? (holdType as HoldType) : 'unknown',
      });
    }
  }
  if (Array.isArray(obj.missedCells)) {
    for (const c of obj.missedCells) {
      if (typeof c !== 'object' || c === null) continue;
      const { cellX, cellY } = c as Record<string, unknown>;
      // 4x4 grid contract — out-of-range cells are model noise, drop them.
      if (typeof cellX === 'number' && typeof cellY === 'number'
          && cellX >= 0 && cellX <= 3 && cellY >= 0 && cellY <= 3) {
        out.missedCells.push({ cellX, cellY });
      }
    }
  }
  return out;
}

/** One GPT-5.6 vision call judging a Set-of-Mark image. */
export async function verifyHolds(
  markedImageDataUrl: string,
  marks: SoMMark[],
  fetchFn: typeof fetch = fetch,
): Promise<VlmVerifyResult> {
  const res = await fetchFn('/api/vlm-proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      task: 'verify',
      image: markedImageDataUrl,
      nMarks: marks.length,
    }),
  });
  if (!res.ok) throw new Error(`vlm verify: HTTP ${res.status}`);
  return parseVerifyResponse(await res.json());
}

// ── Coaching call ───────────────────────────────────────────────────────────

export interface CoachedMove {
  step: number;
  coaching: string;
}

/**
 * Build the coaching prompt. Pure and exported so tests can assert the
 * grounding contract WITHOUT any network: everything the model is allowed to
 * talk about must appear in this string, and nothing else.
 *
 * Why techniques are included: the deterministic techniqueAdvisor already
 * picked technique suggestions per move. Passing them in means the LLM's role
 * is squeezed to phrasing + biomechanical explanation — the strongest
 * anti-hallucination structure available short of not calling an LLM at all.
 */
export function buildCoachPrompt(
  moves: Move[],
  measurements: BodyMeasurements,
  techniques: TechniqueSuggestion[] = [],
): { system: string; user: string } {
  const system = [
    'You are a climbing coach explaining a pre-computed move sequence.',
    'Rules:',
    '- Explain ONLY the moves given. Never invent moves, holds, or techniques.',
    '- Refer to holds ONLY by the ids that appear in the move list.',
    '- One coaching sentence per move: body position first, then the reach.',
    '- Ground advice in the climber measurements provided.',
    'Respond as JSON: {"coachings":[{"step":<number>,"coaching":"<string>"}]}',
  ].join('\n');

  const movesText = moves
    .map(
      (m) =>
        `step ${m.step}: ${m.limb} ${m.fromHoldId ?? 'start'} -> ${m.toHoldId}` +
        ` (${Math.round(m.reachDistance)}cm, ${m.difficulty}` +
        `${m.technique ? `, technique: ${m.technique}` : ''})`,
    )
    .join('\n');

  const techniqueText = techniques.length
    ? '\nSuggested techniques:\n' + techniques.map((t) => `- ${t.id}: ${t.name} — ${t.tip}`).join('\n')
    : '';

  const user =
    `Climber: standingReach ${Math.round(measurements.standingReach)}cm, ` +
    `armLength ${Math.round(measurements.armLength)}cm, apeIndex ${measurements.apeIndex.toFixed(2)}\n` +
    `Moves:\n${movesText}${techniqueText}`;

  return { system, user };
}

/**
 * Mechanical grounding check, run after EVERY coaching response.
 * Returns the list of violations (empty = grounded). Two rules:
 *  1. every returned step must exist in the move list;
 *  2. every "hold-…" id mentioned in coaching text must be a hold that the
 *     move list actually touches.
 * Deliberately does NOT try to judge advice quality — that's the human/eval
 * layer's job; this only catches fabrications a string check can catch.
 */
export function validateCoachingGrounded(
  coachings: CoachedMove[],
  moves: Move[],
): string[] {
  const violations: string[] = [];
  const validSteps = new Set(moves.map((m) => m.step));
  const validHoldIds = new Set<string>();
  for (const m of moves) {
    if (m.fromHoldId) validHoldIds.add(m.fromHoldId);
    validHoldIds.add(m.toHoldId);
  }

  for (const c of coachings) {
    if (!validSteps.has(c.step)) {
      violations.push(`coaching for step ${c.step} which is not in the move list`);
    }
    // Match both classic ids (hold-3) and fused ids (hold-f3).
    const mentioned = c.coaching.match(/hold-f?\d+/g) ?? [];
    for (const id of mentioned) {
      if (!validHoldIds.has(id)) {
        violations.push(`step ${c.step} mentions ${id} which no move touches`);
      }
    }
  }
  return violations;
}

/**
 * Coaching entry point. On grounding violations we DROP the offending items
 * and keep the clean ones (each move's fallback text is the existing
 * rule-based tip already stored on the Move, so the UI never shows a hole).
 */
export async function coachMoves(
  moves: Move[],
  measurements: BodyMeasurements,
  techniques: TechniqueSuggestion[] = [],
  fetchFn: typeof fetch = fetch,
): Promise<CoachedMove[]> {
  const prompt = buildCoachPrompt(moves, measurements, techniques);
  const res = await fetchFn('/api/vlm-proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task: 'coach', system: prompt.system, user: prompt.user }),
  });
  if (!res.ok) throw new Error(`vlm coach: HTTP ${res.status}`);

  const raw = (await res.json()) as { coachings?: unknown };
  const coachings: CoachedMove[] = Array.isArray(raw.coachings)
    ? (raw.coachings as unknown[])
        .filter(
          (c): c is CoachedMove =>
            typeof c === 'object' && c !== null &&
            typeof (c as CoachedMove).step === 'number' &&
            typeof (c as CoachedMove).coaching === 'string',
        )
    : [];

  const violations = validateCoachingGrounded(coachings, moves);
  if (violations.length > 0) {
    console.warn('[coach] dropping ungrounded coaching:', violations);
    const badSteps = new Set(
      violations.map((v) => Number(/step (\d+)/.exec(v)?.[1])).filter((n) => !Number.isNaN(n)),
    );
    return coachings.filter((c) => !badSteps.has(c.step));
  }
  return coachings;
}
