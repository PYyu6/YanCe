/**
 * fullBodyBeta.ts — four-limb (hands AND feet) beta planning.
 *
 * WHAT THIS REPLACES: the classic beta engine walks a single cursor from hold
 * to hold, so its output is a hand sequence with foot support assumed. This
 * engine plans BODY STANCES — one hold (or wall smear) per limb — and emits
 * moves where exactly one limb changes at a time, so every step can answer
 * "which hand, which foot, and which moves first?".
 *
 * DESIGN PRECEDENT: BetaMove (Stanford CS230, arXiv:2102.01788) predicts
 * expert MoonBoard hand sequences by simulating candidate sequences under a
 * success score. We use the same simulate-and-score idea, but deterministic
 * and explainable (no trained model), extended to feet, and gated by the
 * climber's own measurements — because YanCe's product claim is body-aware
 * planning, not average-body prediction.
 *
 * CLIMBING RULES HONORED (each surfaced as a note in the output):
 *  R1 Same-color route: candidates come only from the already-filtered route
 *     holds; feet follow hands (same color) by default. Open-feet/foot-only
 *     gyms are a declared future rule, not silently assumed.
 *  R2 Three-contact support + lateral foot-base heuristic: a static hand move
 *     keeps the other hand and both feet explicit. Target X is compared with
 *     the foot base; this is not a center-of-mass or force calculation.
 *  R3 One limb at a time: no stance-to-stance change may move two limbs.
 *  R4 Feet before long reaches: when the next hand target would stretch the
 *     hand–foot span beyond the comfortable fraction of standing reach, foot
 *     moves are inserted FIRST ("drive from the legs" / lower the core).
 *
 * CONSERVATIVE GEOMETRY GATE (not physical certification, per stance):
 *  - hand–foot span ≤ 95% of estimated standing reach
 *  - foot may not rise closer to the hands than a flexibility-dependent
 *    minimum span (the high-step limit: near-splits flexibility allows feet
 *    far higher than stiff hips — self-reported, per The Climbing Doctor's
 *    high-step mobility challenge)
 *  - hands stay within a body-scaled two-arm span
 *  - each foot contact change stays within 105% of estimated leg reach
 *  - dynamic hand reaches require strength ≥ medium and non-beginner experience
 *
 * All geometry runs in calibrated world cm, so every threshold scales with
 * the person, not with pixels.
 */

import {
  AbilityLevel,
  BodyMeasurements,
  ClimberProfile,
  DetectedHold,
  FullBodyBeta,
  FullBodyMove,
  FullBodyPlanOptions,
  Limb,
  MoveOrderAssessment,
  PlannedContact,
  PlannedStance,
  ReachDifficulty,
  RouteTechniqueOption,
  TechniquePreference,
} from '../types';

/** Span thresholds derived from the person (cm). Exported for tests. */
export interface SpanLimits {
  /** Hard max hand-to-foot vertical span. */
  maxSpan: number;
  /** Above this, plan a foot move before the hand reach (R4). */
  comfortSpan: number;
  /** High-step limit: a foot may not come closer to the top hand than this. */
  minSpan: number;
  /** Maximum separation between the two hand contacts. */
  maxHandSpan: number;
  /** Maximum single foot contact change. */
  maxFootTravel: number;
}

/**
 * Compute the person's span limits. minSpan encodes flexibility:
 * high ≈ 25 cm (near-splits high-step), medium ≈ 45, low ≈ 60.
 */
export function spanLimits(
  measurements: BodyMeasurements,
  flexibility: AbilityLevel,
): SpanLimits {
  // Explicit MVP proxies in calibrated cm. They still need real-climber
  // validation and should never be presented as universal biomechanics.
  const MIN_SPAN: Record<AbilityLevel, number> = { high: 25, medium: 45, low: 60 };
  return {
    maxSpan: measurements.standingReach * 0.95,
    comfortSpan: measurements.standingReach * 0.7,
    minSpan: MIN_SPAN[flexibility],
    maxHandSpan: measurements.armLength * 2.15,
    maxFootTravel: measurements.legReach * 1.05,
  };
}

/** Exported for tests/adapters: is this stance within the current geometry proxy? */
export function isStanceFeasible(stance: PlannedStance, limits: SpanLimits): boolean {
  if (
    Object.values(stance).some(
      (contact) => !Number.isFinite(contact.x) || !Number.isFinite(contact.y),
    )
  ) return false;

  const topHand = Math.max(stance.leftHand.y, stance.rightHand.y);
  const feet = [stance.leftFoot, stance.rightFoot];
  for (const foot of feet) {
    if (foot.holdId !== null && topHand - foot.y < limits.minSpan) return false; // high-step beyond flexibility
  }
  const lowFoot = Math.min(stance.leftFoot.y, stance.rightFoot.y);
  if (topHand - lowFoot > limits.maxSpan) return false;

  const handGap = Math.hypot(
    stance.leftHand.x - stance.rightHand.x,
    stance.leftHand.y - stance.rightHand.y,
  );
  return handGap <= limits.maxHandSpan;
}

/**
 * A static step must change exactly the named limb, keep three supports, and
 * stay within that limb's body-scaled transition reach. `allowDynamic` only
 * extends a HAND reach; feet never teleport and a true multi-limb dyno is not
 * represented by this MVP interface.
 */
export function isTransitionFeasible(
  before: PlannedStance,
  after: PlannedStance,
  movedLimb: Limb,
  measurements: BodyMeasurements,
  allowDynamic: boolean,
): boolean {
  const limbs: Limb[] = ['leftHand', 'rightHand', 'leftFoot', 'rightFoot'];
  const changed = limbs.filter(
    (limb) => JSON.stringify(before[limb]) !== JSON.stringify(after[limb]),
  );
  if (changed.length !== 1 || changed[0] !== movedLimb) return false;

  const isHand = movedLimb === 'leftHand' || movedLimb === 'rightHand';
  if (isHand && after[movedLimb].kind !== 'hold') return false;

  const from = before[movedLimb];
  const to = after[movedLimb];
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const maxDistance = isHand
    ? measurements.armLength * 0.9 * (allowDynamic ? 1.4 : 1)
    : measurements.legReach * 1.05;
  return distance <= maxDistance + 0.1;
}

/**
 * The starting stance: both hands on the start hold(s) — matched on one
 * start, or split left/right across two — and both feet SMEARING at standing
 * height below the hands. Smear (holdId null) is the honest initial state:
 * bouldering starts rarely dictate footholds, and pretending we know them
 * would be invented data.
 */
export function initialStance(
  holds: DetectedHold[],
  measurements: BodyMeasurements,
): PlannedStance {
  const starts = holds.filter((h) => h.isStart).sort((a, b) => a.worldCenter.x - b.worldCenter.x);
  const left = starts[0];
  const right = starts.length > 1 ? starts[starts.length - 1] : starts[0];
  const handY = Math.max(left.worldCenter.y, right.worldCenter.y);
  // A conservative body-scaled start replaces the old hard-coded 100cm drop.
  // The exact smear point is still a proposal and remains visibly labeled.
  const smearY = handY - measurements.legReach * 0.6;
  const footOffset = Math.min(18, Math.max(10, measurements.legReach * 0.16));
  const contact = (h: DetectedHold): PlannedContact => ({
    kind: 'hold',
    holdId: h.id,
    x: h.worldCenter.x,
    y: h.worldCenter.y,
  });
  return {
    leftHand: contact(left),
    rightHand: contact(right),
    leftFoot: {
      kind: 'wall',
      holdId: null,
      mode: 'smear',
      x: left.worldCenter.x - footOffset,
      y: smearY,
    },
    rightFoot: {
      kind: 'wall',
      holdId: null,
      mode: 'smear',
      x: right.worldCenter.x + footOffset,
      y: smearY,
    },
  };
}

/**
 * Plan the full-body beta for one technique preference.
 * Deterministic greedy-with-rules (documented upgrade path: beam search):
 * repeatedly pick the next hand target under the preference, insert the foot
 * moves R4 requires, apply R2/R3 and the feasibility gate, and stop when both
 * hands control the top hold. Every emitted move carries its stanceAfter,
 * an orderNote ("set the foot first…"), and a reason naming the rule used.
 */
export function planFullBodyBeta(
  holds: DetectedHold[],
  measurements: BodyMeasurements,
  profile: ClimberProfile,
  preference: TechniquePreference,
  options: FullBodyPlanOptions = {},
): FullBodyBeta {
  const flexibility = profile.flexibility ?? 'medium';
  const strength = profile.strength ?? 'medium';
  const limits = spanLimits(measurements, flexibility);
  const top = holds.find((h) => h.isTop);
  const notes = [
    'Route rule assumed: same color, feet follow hands. Confirm open-feet or tape rules with your gym.',
    'Smear = press the sole on the wall where no foothold is assigned.',
    'Suggested order is scored from contact distance, span, foot crossing, and lateral foot-base geometry.',
    'Geometry cannot observe friction, wall angle, body pose, or load — this is not proof of the safest or easiest beta.',
  ];
  const empty: FullBodyBeta = { preference, moves: [], complete: false, notes };
  if (!top || !holds.some((h) => h.isStart)) return empty;

  // Dyno needs the pulling power to control the landing hold; without it the
  // preference silently degrades to 'auto' and the note says so.
  let effectivePref = preference;
  if (
    preference === 'dyno' &&
    (strength === 'low' || profile.experience === 'beginner')
  ) {
    effectivePref = 'auto';
    notes.push(
      'Dynamic reach preference needs medium+ pulling strength and non-beginner experience; planned statically instead.',
    );
  }

  // Reach thresholds per preference. classifyReach bands: easy<0.5,
  // moderate<0.75, limit<1.0, dynamic<1.4 of effective (upward) reach.
  const upReach = measurements.armLength * 0.9;
  const maxRatio = effectivePref === 'dyno' ? 1.4 : effectivePref === 'static' ? 1.0 : 1.0;

  const stance: PlannedStance = structuredClone(
    options.startStance ?? initialStance(holds, measurements),
  );
  const moves: FullBodyMove[] = [];

  const lowerHand = (): 'leftHand' | 'rightHand' =>
    stance.leftHand.y < stance.rightHand.y ? 'leftHand' : 'rightHand';
  const otherHand = (h: 'leftHand' | 'rightHand') =>
    h === 'leftHand' ? 'rightHand' : 'leftHand';
  const lowerFeet = (): Array<'leftFoot' | 'rightFoot'> => {
    const low = Math.min(stance.leftFoot.y, stance.rightFoot.y);
    return (['leftFoot', 'rightFoot'] as const).filter(
      (foot) => stance[foot].y <= low + 0.1,
    );
  };

  function assessOrder(
    before: PlannedStance,
    after: PlannedStance,
    limb: Limb,
    extraFactors: MoveOrderAssessment['factors'] = [],
  ): MoveOrderAssessment {
    const from = before[limb];
    const to = after[limb];
    const isHand = limb === 'leftHand' || limb === 'rightHand';
    const maxTravel = isHand ? upReach : limits.maxFootTravel;
    const travelRatio = Math.hypot(to.x - from.x, to.y - from.y) / maxTravel;
    const topHand = Math.max(after.leftHand.y, after.rightHand.y);
    const lowFoot = Math.min(after.leftFoot.y, after.rightFoot.y);
    const spanRatio = (topHand - lowFoot) / limits.comfortSpan;

    const footMinX = Math.min(after.leftFoot.x, after.rightFoot.x);
    const footMaxX = Math.max(after.leftFoot.x, after.rightFoot.x);
    const handMidX = (after.leftHand.x + after.rightHand.x) / 2;
    const baseMargin = measurements.legReach * 0.18;
    const outsideBase = Math.max(
      footMinX - baseMargin - handMidX,
      handMidX - (footMaxX + baseMargin),
      0,
    );
    const crossesFeet = after.leftFoot.x > after.rightFoot.x + measurements.legReach * 0.08;

    let score = 100;
    score -= Math.min(52, travelRatio * 48);
    if (spanRatio > 1) score -= Math.min(24, (spanRatio - 1) * 45);
    score -= Math.min(20, (outsideBase / measurements.legReach) * 45);
    if (crossesFeet) score -= 14;

    const factors: MoveOrderAssessment['factors'] = [
      'three_contact_support',
      ...extraFactors,
    ];
    if (spanRatio <= 1) factors.push('within_comfort_span');
    if (travelRatio <= 0.55) factors.push('short_contact_change');
    if (outsideBase === 0) factors.push('stable_foot_base');
    if (!crossesFeet) factors.push('avoids_foot_cross');

    const easeScore = Math.max(0, Math.min(100, Math.round(score)));
    return {
      easeScore,
      label: easeScore >= 75 ? 'preferred' : easeScore >= 50 ? 'workable' : 'demanding',
      factors: [...new Set(factors)],
    };
  }

  function push(
    limb: Limb,
    to: PlannedContact,
    difficulty: ReachDifficulty,
    orderNote: string,
    reason: string,
    technique: string | null,
    orderFactors: MoveOrderAssessment['factors'] = [],
  ): boolean {
    const stanceBefore = structuredClone(stance);
    const stanceAfter = structuredClone(stance);
    stanceAfter[limb] = to;
    const allowDynamic = difficulty === 'dynamic';
    if (
      !isTransitionFeasible(
        stanceBefore,
        stanceAfter,
        limb,
        measurements,
        allowDynamic,
      ) ||
      !isStanceFeasible(stanceAfter, limits)
    ) return false;

    const from = stanceBefore[limb];
    const order = assessOrder(stanceBefore, stanceAfter, limb, orderFactors);
    stance[limb] = to;
    moves.push({
      step: moves.length + 1,
      limb,
      from,
      to,
      toHoldId: to.holdId,
      reachDistance: Math.round(Math.hypot(to.x - from.x, to.y - from.y) * 10) / 10,
      difficulty,
      orderNote,
      order,
      reason,
      technique,
      stanceBefore,
      stanceAfter,
    });
    return true;
  }

  /** Best next hold for `hand` under the preference. */
  function pickHandTarget(hand: 'leftHand' | 'rightHand'): DetectedHold | null {
    const from = stance[hand];
    const other = stance[otherHand(hand)];
    const candidates = holds.filter((h) => {
      if (h.worldCenter.y <= from.y) return false;               // progress upward
      if (h.id === other.holdId && !h.isTop) return false;        // match only on top
      const dist = Math.hypot(h.worldCenter.x - from.x, h.worldCenter.y - from.y);
      if (dist / upReach >= maxRatio) return false;               // beyond this pref's reach
      const gap = Math.hypot(h.worldCenter.x - other.x, h.worldCenter.y - other.y);
      if (gap > profile.armSpan * 0.95) return false;             // hands can't split wider than the body
      return true;
    });
    if (candidates.length === 0) return null;
    if (effectivePref === 'dyno') {
      // Fewest moves: farthest reachable height gain.
      return candidates.sort((a, b) => b.worldCenter.y - a.worldCenter.y)[0];
    }
    // Cost-per-cm: prefer cheap difficulty, then bigger height gain. This is
    // what preserves the tall-skips/short-steps body difference.
    const score = (h: DetectedHold) => {
      const dist = Math.hypot(h.worldCenter.x - from.x, h.worldCenter.y - from.y);
      const difficulty = classify(dist);
      const w = { easy: 1, moderate: 3, limit: 6, dynamic: 10, unreachable: Infinity }[difficulty];
      return w / Math.max(h.worldCenter.y - from.y, 1);
    };
    return candidates.sort(
      (a, b) => score(a) - score(b) || b.worldCenter.y - a.worldCenter.y,
    )[0];
  }

  function classify(dist: number): ReachDifficulty {
    const r = dist / upReach;
    if (r < 0.5) return 'easy';
    if (r < 0.75) return 'moderate';
    if (r < 1.0) return 'limit';
    if (r < 1.4) return 'dynamic';
    return 'unreachable';
  }

  function classifyFoot(dist: number): ReachDifficulty {
    const r = dist / limits.maxFootTravel;
    if (r < 0.45) return 'easy';
    if (r < 0.7) return 'moderate';
    if (r <= 1) return 'limit';
    return 'unreachable';
  }

  function lateralExcess(targetX: number, candidate: PlannedStance = stance): number {
    const low = Math.min(candidate.leftFoot.x, candidate.rightFoot.x);
    const high = Math.max(candidate.leftFoot.x, candidate.rightFoot.x);
    const margin = measurements.legReach * 0.18;
    return Math.max(low - margin - targetX, targetX - (high + margin), 0);
  }

  /**
   * R4: score reachable foot transitions until the coming hand target fits
   * the comfortable vertical span and lateral foot-base heuristic. This is a
   * deterministic recommendation, not a center-of-mass or force simulation.
   */
  function prepareFeet(target: DetectedHold): { ok: boolean; flagged: boolean } {
    let flagged = false;
    let guard = 0;
    const span = () => target.worldCenter.y - Math.min(stance.leftFoot.y, stance.rightFoot.y);
    const needsPreparation = () =>
      span() > limits.comfortSpan || lateralExcess(target.worldCenter.x) > 0;

    while (needsPreparation() && guard++ < 8) {
      if (effectivePref === 'flag' && span() <= limits.maxSpan) {
        const reachRight = target.worldCenter.x >=
          (stance.leftHand.x + stance.rightHand.x) / 2;
        const foot: 'leftFoot' | 'rightFoot' = reachRight ? 'leftFoot' : 'rightFoot';
        const otherFoot = foot === 'leftFoot' ? 'rightFoot' : 'leftFoot';
        if (stance[foot].kind === 'wall' && stance[foot].mode === 'flag') {
          flagged = true;
          break;
        }
        const direction = reachRight ? -1 : 1;
        const flagContact: PlannedContact = {
          kind: 'wall',
          holdId: null,
          mode: 'flag',
          x: stance[otherFoot].x + direction * Math.min(35, measurements.legReach * 0.28),
          y: Math.min(stance[foot].y, stance[otherFoot].y),
        };
        flagged = push(
          foot,
          flagContact,
          classifyFoot(
            Math.hypot(
              flagContact.x - stance[foot].x,
              flagContact.y - stance[foot].y,
            ),
          ),
          `Place the ${foot === 'leftFoot' ? 'left' : 'right'} foot as a wall flag before the reach.`,
          'The flag is an explicit wall contact used as a lateral counterbalance heuristic.',
          'flagging',
          ['foot_before_reach', 'flag_counterbalance'],
        );
        if (!flagged) return { ok: false, flagged: false };
        break;
      }

      const candidates = lowerFeet().flatMap((foot) => {
        const otherFoot = foot === 'leftFoot' ? 'rightFoot' : 'leftFoot';
        return holds.flatMap((hold) => {
          if (
            hold.worldCenter.y <= stance[foot].y + 0.1 ||
            hold.id === stance[otherFoot].holdId ||
            hold.id === stance.leftHand.holdId ||
            hold.id === stance.rightHand.holdId ||
            target.worldCenter.y - hold.worldCenter.y < limits.minSpan ||
            hold.worldCenter.y >= Math.max(stance.leftHand.y, stance.rightHand.y)
          ) return [];

          const to: PlannedContact = {
            kind: 'hold',
            holdId: hold.id,
            x: hold.worldCenter.x,
            y: hold.worldCenter.y,
          };
          const after = structuredClone(stance);
          after[foot] = to;
          if (
            !isTransitionFeasible(stance, after, foot, measurements, false) ||
            !isStanceFeasible(after, limits)
          ) return [];

          const order = assessOrder(
            stance,
            after,
            foot,
            ['foot_before_reach'],
          );
          const supportBonus = Math.max(
            0,
            18 - (lateralExcess(target.worldCenter.x, after) / measurements.legReach) * 45,
          );
          return [{ foot, hold, to, order, score: order.easeScore + supportBonus }];
        });
      }).sort(
        (a, b) =>
          b.score - a.score ||
          a.hold.worldCenter.y - b.hold.worldCenter.y ||
          a.hold.id.localeCompare(b.hold.id),
      );

      if (candidates.length === 0) {
        // No usable foothold: the reach stands only if the hard limit allows it.
        return {
          ok: span() <= limits.maxSpan && lateralExcess(target.worldCenter.x) <= measurements.legReach * 0.3,
          flagged,
        };
      }
      const candidate = candidates[0];
      const distance = Math.hypot(
        candidate.to.x - stance[candidate.foot].x,
        candidate.to.y - stance[candidate.foot].y,
      );
      const added = push(
        candidate.foot,
        candidate.to,
        classifyFoot(distance),
        'Set this foot first — the next reach needs support from the legs.',
        `Reachable ${Math.round(distance)}cm foot change; improves the body-scaled span or lateral foot base.`,
        null,
        ['foot_before_reach'],
      );
      if (!added) return { ok: false, flagged };
      flagged = false;
    }
    return {
      ok: span() <= limits.maxSpan && lateralExcess(target.worldCenter.x) <= measurements.legReach * 0.3,
      flagged,
    };
  }

  let guard = 0;
  while (guard++ < 60) {
    const bothOnTop = stance.leftHand.holdId === top.id && stance.rightHand.holdId === top.id;
    if (bothOnTop) break;

    // Finish: one hand controls the top — match the second onto it.
    if (stance.leftHand.holdId === top.id || stance.rightHand.holdId === top.id) {
      const hand = stance.leftHand.holdId === top.id ? 'rightHand' : 'leftHand';
      const prep = prepareFeet(top);
      if (!prep.ok) break;
      const dist = Math.hypot(
        top.worldCenter.x - stance[hand].x,
        top.worldCenter.y - stance[hand].y,
      );
      const difficulty = classify(dist);
      if (difficulty === 'unreachable' || (difficulty === 'dynamic' && effectivePref !== 'dyno')) break;
      const added = push(
        hand,
        {
          kind: 'hold',
          holdId: top.id,
          x: top.worldCenter.x,
          y: top.worldCenter.y,
        },
        difficulty,
        'Match the second hand on the top hold to control the finish.',
        `${Math.round(dist)}cm top match is within the selected reach mode.`,
        null,
        ['finish_match'],
      );
      if (!added) break;
      continue;
    }

    const hand = lowerHand();
    const target = pickHandTarget(hand);
    if (!target) break;

    const prep = prepareFeet(target);
    if (!prep.ok) break;

    const dist = Math.hypot(
      target.worldCenter.x - stance[hand].x,
      target.worldCenter.y - stance[hand].y,
    );
    const difficulty = classify(dist);
    const added = push(
      hand,
      {
        kind: 'hold',
        holdId: target.id,
        x: target.worldCenter.x,
        y: target.worldCenter.y,
      },
      difficulty,
      prep.flagged
        ? 'The wall flag is set; keep the other three contacts and reach.'
        : 'Feet are set — drive up from the legs and reach.',
      difficulty === 'dynamic'
        ? `Beyond static reach (${Math.round(dist)}cm) — shown as a controlled dynamic reach, not a full dyno.`
        : `${Math.round(dist)}cm is within your ${difficulty} reach band.`,
      prep.flagged ? 'flagging' : difficulty === 'dynamic' ? 'dynamic-reach' : null,
      prep.flagged ? ['flag_counterbalance'] : [],
    );
    if (!added) break;
  }

  const complete =
    stance.leftHand.holdId === top.id && stance.rightHand.holdId === top.id;
  if (!complete) notes.push('The planner could not verify a complete legal sequence — treat this route as unconfirmed.');
  return { preference, moves, complete, notes };
}

/**
 * Which techniques does THIS route actually offer THIS person?
 * Plans the route under each preference and reports availability with a
 * plain-language reason and plan-derived difficulty. Dynamic reach is
 * unavailable to low-strength or beginner profiles; a preference whose plan
 * cannot complete is unavailable with that stated.
 */
export function routeTechniqueOptions(
  holds: DetectedHold[],
  measurements: BodyMeasurements,
  profile: ClimberProfile,
): RouteTechniqueOption[] {
  const strength = profile.strength ?? 'medium';
  const flexibility = profile.flexibility ?? 'medium';

  const attempt = (pref: TechniquePreference) =>
    planFullBodyBeta(holds, measurements, profile, pref);

  const difficultyOf = (beta: FullBodyBeta): RouteTechniqueOption['difficulty'] => {
    if (
      beta.moves.some(
        (move) =>
          move.difficulty === 'dynamic' ||
          move.difficulty === 'limit' ||
          move.order.label === 'demanding',
      )
    ) return 'hard';
    if (
      beta.moves.some(
        (move) => move.difficulty === 'moderate' || move.order.label === 'workable',
      )
    ) return 'moderate';
    return 'easy';
  };

  const options: RouteTechniqueOption[] = [];

  const auto = attempt('auto');
  options.push({
    preference: 'auto',
    name: 'Balanced (auto)',
    nameCn: '自动均衡',
    difficulty: difficultyOf(auto),
    available: auto.complete,
    reason: auto.complete
      ? 'Feet-first supported sequence within your comfortable reach.'
      : 'No complete sequence found on this route.',
  });

  const stat = attempt('static');
  options.push({
    preference: 'static',
    name: 'Static control',
    nameCn: '静态稳定',
    difficulty: difficultyOf(stat),
    available: stat.complete,
    reason: stat.complete
      ? 'Every reach stays below your static limit — no dynamic reach required.'
      : 'This route needs at least one reach beyond your static range.',
  });

  const flag = attempt('flag');
  const flagUsed = flag.moves.some((m) => m.technique === 'flagging');
  options.push({
    preference: 'flag',
    name: 'Flagging',
    nameCn: '旗式平衡',
    difficulty: flag.complete ? difficultyOf(flag) : flexibility === 'low' ? 'hard' : 'moderate',
    available: flag.complete && flagUsed,
    reason: flag.complete && flagUsed
      ? 'This variant uses an explicit trailing-foot wall flag before a long reach.'
      : 'No reach on this route benefits from a flag — feet placements already suffice.',
  });

  const strongEnough = strength !== 'low';
  const experiencedEnough = profile.experience !== 'beginner';
  const dyno = strongEnough && experiencedEnough ? attempt('dyno') : null;
  const dynoUseful =
    !!dyno && dyno.complete && dyno.moves.some((m) => m.difficulty === 'dynamic');
  options.push({
    preference: 'dyno',
    name: 'Dynamic reach line',
    nameCn: '动态伸展',
    difficulty: dyno ? difficultyOf(dyno) : 'hard',
    available: dynoUseful,
    reason: !strongEnough
      ? 'Needs medium+ pulling strength for the longer hand-contact change.'
      : !experiencedEnough
        ? 'Dynamic reach suggestions are hidden for beginner profiles.'
      : dynoUseful
        ? 'Skipping intermediate holds with controlled dynamic reaches shortens the sequence.'
        : 'No hold spacing on this route rewards a dynamic reach for your body.',
  });

  return options;
}
