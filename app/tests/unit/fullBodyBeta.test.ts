/**
 * fullBodyBeta.test.ts — the four-limb planner's product claims, pinned.
 *
 * Uses the SAME fixture ladder the classic engine is proven on, so the two
 * engines' behavior stays comparable. The tests encode the climbing rules
 * from the module header: one limb per move (R3), feet-before-long-reach
 * (R4), span feasibility, flexibility-gated high-steps, and the technique
 * preferences (static/flag/dyno) changing the plan in the promised way.
 */

import { describe, it, expect } from 'vitest';
import {
  spanLimits,
  initialStance,
  isTransitionFeasible,
  planFullBodyBeta,
  routeTechniqueOptions,
} from '../../src/engine/fullBodyBeta';
import { computeMeasurements } from '../../src/engine/climberModel';
import {
  FIXTURE_HOLDS,
  TALL_PROFILE,
  SHORT_PROFILE,
} from '../fixtures/wallSimple';
import { FullBodyBeta, Limb, PlannedStance } from '../../src/types';

const tallM = computeMeasurements(TALL_PROFILE);
const shortM = computeMeasurements(SHORT_PROFILE);

const LIMBS: Limb[] = ['leftHand', 'rightHand', 'leftFoot', 'rightFoot'];

function changedLimbs(a: PlannedStance, b: PlannedStance): Limb[] {
  return LIMBS.filter(
    (l) => JSON.stringify(a[l]) !== JSON.stringify(b[l]),
  );
}

function handMoves(beta: FullBodyBeta) {
  return beta.moves.filter((m) => m.limb === 'leftHand' || m.limb === 'rightHand');
}
function footMoves(beta: FullBodyBeta) {
  return beta.moves.filter((m) => m.limb === 'leftFoot' || m.limb === 'rightFoot');
}

describe('spanLimits — the person-derived feasibility numbers', () => {
  it('derives max and comfort span from standing reach', () => {
    const limits = spanLimits(tallM, 'medium');
    expect(limits.maxSpan).toBeCloseTo(tallM.standingReach * 0.95, 1);
    expect(limits.comfortSpan).toBeCloseTo(tallM.standingReach * 0.7, 1);
  });

  it('flexibility sets the high-step limit: splits ≈ 25cm, stiff ≈ 60cm', () => {
    expect(spanLimits(tallM, 'high').minSpan).toBe(25);
    expect(spanLimits(tallM, 'medium').minSpan).toBe(45);
    expect(spanLimits(tallM, 'low').minSpan).toBe(60);
  });
});

describe('initialStance', () => {
  it('matches both hands on a single start hold, with every contact explicit', () => {
    const stance = initialStance(FIXTURE_HOLDS, tallM);
    expect(stance.leftHand.holdId).toBe('hold-start');
    expect(stance.rightHand.holdId).toBe('hold-start');
    expect(stance.leftHand.kind).toBe('hold');
    expect(stance.rightHand.kind).toBe('hold');
    // Smear = honest "no foothold assigned", below the hands.
    expect(stance.leftFoot.holdId).toBeNull();
    expect(stance.rightFoot.holdId).toBeNull();
    expect(stance.leftFoot).toMatchObject({ kind: 'wall', mode: 'smear' });
    expect(stance.rightFoot).toMatchObject({ kind: 'wall', mode: 'smear' });
    expect(stance.leftFoot.y).toBeLessThan(stance.leftHand.y);
    expect(stance.leftHand.y - stance.leftFoot.y).toBeCloseTo(tallM.legReach * 0.6, 1);
  });
});

describe('transition feasibility', () => {
  it('rejects a foot teleport beyond this climber\'s leg reach', () => {
    const before = initialStance(FIXTURE_HOLDS, shortM);
    const after = structuredClone(before);
    after.leftFoot = { kind: 'hold', holdId: 'far-foot', x: 500, y: 20 };

    expect(
      isTransitionFeasible(before, after, 'leftFoot', shortM, false),
    ).toBe(false);
  });
});

describe('planFullBodyBeta — rules R1–R4 on the proven ladder', () => {
  const tall = planFullBodyBeta(FIXTURE_HOLDS, tallM, TALL_PROFILE, 'auto');
  const short = planFullBodyBeta(FIXTURE_HOLDS, shortM, SHORT_PROFILE, 'auto');

  it('completes: both hands finish on the top hold', () => {
    for (const beta of [tall, short]) {
      expect(beta.complete).toBe(true);
      const last = beta.moves[beta.moves.length - 1].stanceAfter;
      expect(last.leftHand.holdId).toBe('hold-top');
      expect(last.rightHand.holdId).toBe('hold-top');
    }
  });

  it('R3: every move changes exactly one limb', () => {
    let prev = initialStance(FIXTURE_HOLDS, tallM);
    for (const move of tall.moves) {
      expect(move.stanceBefore).toEqual(prev);
      expect(move.from).toEqual(move.stanceBefore[move.limb]);
      expect(move.to).toEqual(move.stanceAfter[move.limb]);
      const changed = changedLimbs(move.stanceBefore, move.stanceAfter);
      expect(changed).toEqual([move.limb]);
      prev = move.stanceAfter;
    }
  });

  it('labels every move with a bounded, explainable geometry-order score', () => {
    for (const move of tall.moves) {
      expect(move.order.easeScore).toBeGreaterThanOrEqual(0);
      expect(move.order.easeScore).toBeLessThanOrEqual(100);
      expect(['preferred', 'workable', 'demanding']).toContain(move.order.label);
      expect(move.order.factors).toContain('three_contact_support');
      expect(move.reason.length).toBeGreaterThan(0);
    }
  });

  it('feet are genuinely planned: foot moves exist and name their target', () => {
    const feet = footMoves(tall);
    expect(feet.length).toBeGreaterThan(0);
    for (const f of feet) {
      // A foot goes to a named same-color hold (R1) — or an explicit smear.
      expect(f.toHoldId === null || f.toHoldId.startsWith('hold-')).toBe(true);
      expect(f.orderNote.length).toBeGreaterThan(0);
    }
  });

  it('R4: a foot-first move explains itself before the long reach', () => {
    expect(footMoves(tall).some((f) => /first|before/i.test(f.orderNote))).toBe(true);
  });

  it('feasibility invariant: every stance within the body limits', () => {
    const limits = spanLimits(tallM, 'medium');
    for (const move of tall.moves) {
      const s = move.stanceAfter;
      const topHand = Math.max(s.leftHand.y, s.rightHand.y);
      const lowFoot = Math.min(s.leftFoot.y, s.rightFoot.y);
      expect(topHand - lowFoot).toBeLessThanOrEqual(limits.maxSpan + 0.1);
      const handGap = Math.hypot(
        s.leftHand.x - s.rightHand.x,
        s.leftHand.y - s.rightHand.y,
      );
      expect(handGap).toBeLessThanOrEqual(TALL_PROFILE.armSpan * 0.95 + 0.1);
    }
  });

  it('never moves a foot farther than the body-scaled leg transition limit', () => {
    for (const move of footMoves(tall)) {
      expect(move.reachDistance).toBeLessThanOrEqual(tallM.legReach * 1.05 + 0.1);
      expect(
        isTransitionFeasible(
          move.stanceBefore,
          move.stanceAfter,
          move.limb,
          tallM,
          false,
        ),
      ).toBe(true);
    }
  });

  it('can plan forward from a confirmed current four-limb stance', () => {
    const confirmed = initialStance(FIXTURE_HOLDS, tallM);
    confirmed.leftFoot = {
      kind: 'wall',
      holdId: null,
      mode: 'smear',
      x: -10,
      y: -50,
    };
    const fromCurrent = planFullBodyBeta(
      FIXTURE_HOLDS,
      tallM,
      TALL_PROFILE,
      'auto',
      { startStance: confirmed },
    );

    expect(fromCurrent.moves[0].stanceBefore).toEqual(confirmed);
    expect(fromCurrent.complete).toBe(true);
  });

  it('every emitted hand and foot move passes the transition gate', () => {
    for (const move of tall.moves) {
      expect(
        isTransitionFeasible(
          move.stanceBefore,
          move.stanceAfter,
          move.limb,
          tallM,
          move.difficulty === 'dynamic',
        ),
      ).toBe(true);
    }
  });

  it('body-aware: tall and short hand sequences differ on the same wall', () => {
    const seq = (b: FullBodyBeta) => handMoves(b).map((m) => m.toHoldId);
    expect(seq(tall)).not.toEqual(seq(short));
    // The crisp claim: the tall body's first reach skips to the 33cm rung;
    // the short body starts with the 16.5cm single step.
    expect(seq(tall)[0]).toBe('hold-l2');
    expect(seq(short)[0]).toBe('hold-l1');
  });

  it('discloses its route-rule assumptions', () => {
    expect(tall.notes.join(' ')).toMatch(/same color|feet follow hands/i);
  });
});

describe('technique preferences change the plan as promised', () => {
  const auto = planFullBodyBeta(FIXTURE_HOLDS, tallM, TALL_PROFILE, 'auto');
  const stat = planFullBodyBeta(FIXTURE_HOLDS, tallM, TALL_PROFILE, 'static');
  const flag = planFullBodyBeta(FIXTURE_HOLDS, tallM, TALL_PROFILE, 'flag');
  const dyno = planFullBodyBeta(
    FIXTURE_HOLDS,
    tallM,
    { ...TALL_PROFILE, strength: 'high' },
    'dyno',
  );

  it('static: no dynamic reaches anywhere', () => {
    expect(stat.moves.every((m) => m.difficulty !== 'dynamic')).toBe(true);
  });

  it('dynamic reach (with the strength for it): fewer hand moves than static', () => {
    expect(handMoves(dyno).length).toBeLessThan(handMoves(stat).length);
    expect(dyno.moves.some((m) => m.difficulty === 'dynamic')).toBe(true);
  });

  it('flag: trades foot moves for a flagging annotation', () => {
    expect(footMoves(flag).length).toBeLessThanOrEqual(footMoves(auto).length);
    expect(flag.moves.some((m) => m.technique === 'flagging')).toBe(true);
  });
});

describe('routeTechniqueOptions — only what this route offers this person', () => {
  it('lists options with difficulty and Chinese names; dynamic reach gated on strength', () => {
    const weak = routeTechniqueOptions(FIXTURE_HOLDS, tallM, {
      ...TALL_PROFILE,
      strength: 'low',
    });
    const dynoOpt = weak.find((o) => o.preference === 'dyno')!;
    expect(dynoOpt.available).toBe(false);
    expect(dynoOpt.reason).toMatch(/strength/i);

    const strong = routeTechniqueOptions(FIXTURE_HOLDS, tallM, {
      ...TALL_PROFILE,
      strength: 'high',
    });
    expect(strong.find((o) => o.preference === 'dyno')!.available).toBe(true);

    for (const opt of strong) {
      expect(['easy', 'moderate', 'hard']).toContain(opt.difficulty);
      expect(opt.nameCn.length).toBeGreaterThan(0);
      expect(opt.reason.length).toBeGreaterThan(0);
    }
  });

  it('does not recommend dynamic reaches to a beginner profile', () => {
    const beginner = routeTechniqueOptions(FIXTURE_HOLDS, tallM, {
      ...TALL_PROFILE,
      experience: 'beginner',
      strength: 'high',
    });
    const dynamic = beginner.find((o) => o.preference === 'dyno')!;
    expect(dynamic.available).toBe(false);
    expect(dynamic.reason).toMatch(/experience|beginner/i);
  });
});
