/**
 * Pure climbing-intelligence rules for the MVP.
 *
 * This module deliberately consumes normalized, explainable evidence instead
 * of video pixels. A future MediaPipe/learned adapter can estimate the inputs,
 * but the product decision stays deterministic, testable, and inspectable.
 */
import {
  ClimbingIntelligenceEngine,
  CoachingObjective,
  DetectedHold,
  MoveCandidateEvidence,
  MovementPhaseExplanation,
  MovementPhaseObservation,
  RankedMoveCandidate,
  RouteMembershipDecision,
  RoutePathStep,
  RouteRuleSet,
} from '../types';

const LIMITATION =
  'This video-based proxy does not measure force, fatigue, or metabolic cost and is not a safety guarantee.';

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function roundScore(value: number): number {
  return Math.round(clamp(value) * 100) / 100;
}

function isVolume(hold: DetectedHold): boolean {
  return hold.holdLabel?.morphology === 'volume';
}

/** Apply only the route policy the gym/setter/person explicitly selected. */
export function evaluateRouteMembership(
  hold: DetectedHold,
  rules: RouteRuleSet,
): RouteMembershipDecision {
  if (isVolume(hold) && rules.volumePolicy === 'all_volumes') {
    return {
      holdId: hold.id,
      allowed: true,
      basis: 'This gym rule allows every wall volume.',
      needsConfirmation: false,
    };
  }

  if (isVolume(hold) && rules.volumePolicy === 'no_volumes') {
    return {
      holdId: hold.id,
      allowed: false,
      basis: 'This gym rule excludes volumes from the route.',
      needsConfirmation: false,
    };
  }

  if (rules.markingPolicy === 'same_color') {
    const allowed = hold.routeColor.trim().toLowerCase() === rules.routeColor.trim().toLowerCase();
    return {
      holdId: hold.id,
      allowed,
      basis: allowed
        ? 'The hold matches the declared route color.'
        : 'The hold does not match the declared route color.',
      needsConfirmation: false,
    };
  }

  const allowed = rules.allowedHoldIds.includes(hold.id);
  if (rules.markingPolicy === 'explicit_hold_ids') {
    return {
      holdId: hold.id,
      allowed,
      basis: allowed
        ? 'The setter or climber included this hold in the explicit route list.'
        : 'This hold is absent from the explicit route list.',
      needsConfirmation: false,
    };
  }

  return {
    holdId: hold.id,
    allowed,
    basis: allowed
      ? 'The declared route metadata marks this hold as usable.'
      : 'Tape/distinctive marking cannot be inferred reliably from this image alone.',
    needsConfirmation: !allowed,
  };
}

const ROLE_LABEL = {
  start: 'Start',
  move: 'Next',
  top: 'Top',
} as const;

/**
 * Build the visible route legend from explicit annotations. Marker order never
 * comes from array position or screen height, and optional/off-route examples
 * cannot leak into the main path.
 */
export function buildRoutePath(holds: DetectedHold[]): RoutePathStep[] {
  return holds
    .flatMap((hold): RoutePathStep[] => {
      const route = hold.routeAnnotation;
      if (
        !route?.onDeclaredPath ||
        route.order == null ||
        !['start', 'move', 'top'].includes(route.role)
      ) return [];

      const role = route.role as RoutePathStep['role'];
      const morphology = hold.holdLabel?.morphology ?? 'unknown';
      const verified =
        route.source === 'human_confirmed' &&
        hold.holdLabel?.source === 'human_confirmed';
      const morphologyName = morphology.charAt(0).toUpperCase() + morphology.slice(1);
      return [{
        holdId: hold.id,
        order: route.order,
        role,
        morphology,
        verified,
        displayLabel: `${route.order} · ${ROLE_LABEL[role]} · ${morphologyName} ${verified ? 'confirmed' : 'proposal'}`,
      }];
    })
    .sort((a, b) => a.order - b.order || a.holdId.localeCompare(b.holdId));
}

const MORPHOLOGY_EASE: Record<MoveCandidateEvidence['targetMorphology'], number> = {
  jug: 0.18,
  edge: 0.06,
  sloper: 0,
  pinch: 0.04,
  pocket: 0,
  volume: 0.08,
  foothold: 0.1,
  unknown: 0.02,
};

const MORPHOLOGY_CHALLENGE: Record<MoveCandidateEvidence['targetMorphology'], number> = {
  jug: 0,
  edge: 0.1,
  sloper: 0.08,
  pinch: 0.08,
  pocket: 0.08,
  volume: 0.05,
  foothold: 0.03,
  unknown: 0.02,
};

const MORPHOLOGY_POWER: Record<MoveCandidateEvidence['targetMorphology'], number> = {
  jug: 0.02,
  edge: 0.12,
  sloper: 0.18,
  pinch: 0.14,
  pocket: 0.12,
  volume: 0.1,
  foothold: 0.04,
  unknown: 0.04,
};

function scoreCandidate(
  candidate: MoveCandidateEvidence,
  objective: CoachingObjective,
): { score: number; reasons: string[] } {
  const reach = clamp(candidate.reachRatio);
  const elbow = clamp(candidate.elbowFlexion);
  const support = clamp(candidate.supportMargin);
  const legs = clamp(candidate.legDriveOpportunity);
  const novelty = clamp(candidate.techniqueNovelty);

  if (objective === 'conserve_forearms') {
    return {
      score:
        MORPHOLOGY_EASE[candidate.targetMorphology] +
        (1 - reach) * 0.25 +
        (1 - elbow) * 0.18 +
        support * 0.2 +
        legs * 0.15 +
        (candidate.dynamicRequired ? 0 : 0.04),
      reasons: [
        'Favors lower reach demand and a larger support margin.',
        'Rewards straighter-arm and leg-drive opportunities as coaching proxies.',
      ],
    };
  }

  if (objective === 'technique_practice') {
    const moderateReach = 1 - Math.abs(reach - 0.68);
    return {
      score:
        novelty * 0.42 +
        moderateReach * 0.2 +
        support * 0.18 +
        legs * 0.1 +
        MORPHOLOGY_CHALLENGE[candidate.targetMorphology] -
        (candidate.dynamicRequired ? 0.08 : 0),
      reasons: [
        'Favors a novel technique at a moderate reach demand.',
        'Keeps support and leg use in the score instead of maximizing difficulty alone.',
      ],
    };
  }

  return {
    score:
      reach * 0.25 +
      novelty * 0.12 +
      legs * 0.28 +
      MORPHOLOGY_POWER[candidate.targetMorphology] +
      (candidate.dynamicRequired ? 0.1 : 0) +
      (1 - support) * 0.05 -
      elbow * 0.05,
    reasons: [
      'Favors greater reach, leg-drive opportunity, and harder visible morphology.',
      candidate.dynamicRequired
        ? 'Dynamic movement is disclosed; the score is not a safety clearance.'
        : 'The move builds power without requiring a dynamic action in this fixture.',
    ],
  };
}

/** Rank feasible moves and retain rejected moves at the bottom for auditing. */
export function rankMoves(
  candidates: MoveCandidateEvidence[],
  objective: CoachingObjective,
): RankedMoveCandidate[] {
  return candidates
    .map((candidate): RankedMoveCandidate => {
      // This is a conservative demo bound, not a statement about a person's
      // maximum reach. A calibrated kinematic solver will replace this adapter.
      const rejected = candidate.reachRatio > 1 || candidate.supportMargin < 0.15;
      const scored = scoreCandidate(candidate, objective);
      return {
        ...candidate,
        objective,
        score: rejected ? 0 : roundScore(scored.score),
        reasons: rejected
          ? ['Outside the conservative MVP reach/support bound; ask for a correction or another move.']
          : scored.reasons,
        limitations: [LIMITATION],
        rejected,
      };
    })
    .sort((a, b) => Number(a.rejected) - Number(b.rejected) || b.score - a.score || a.id.localeCompare(b.id));
}

/** Explain posture inside the observed phase instead of judging one frame. */
export function explainMovementPhase(
  observation: MovementPhaseObservation,
): MovementPhaseExplanation {
  if (observation.phase === 'loading') {
    return {
      phase: observation.phase,
      headline: 'Loading: prepare force, then move',
      coachingCue: observation.kneeFlexion > 0.55
        ? 'A deep crouch can preload the legs; keep the intended foothold and push through the legs.'
        : 'Settle the feet and create leg tension before initiating the move.',
      caveat: 'A crouch is not automatically inefficient; its value depends on the next movement and available holds.',
    };
  }

  if (observation.phase === 'moving') {
    return {
      phase: observation.phase,
      headline: 'Moving: preserve the intended line',
      coachingCue: 'Track the target and avoid changing two contacts unless the planned move requires it.',
      caveat: 'A 2D camera cannot verify force, depth, friction, or fall safety.',
    };
  }

  return {
    phase: observation.phase,
    headline: 'Stable: review or recover',
    coachingCue: observation.elbowFlexion > 0.55
      ? 'If the holds permit it, test whether a straighter arm reduces sustained pulling.'
      : 'Use this stable moment to look ahead and confirm the next usable hold.',
    caveat: 'Center-of-mass position alone does not establish energetic cost; this cue is a movement option, not a physiological measurement.',
  };
}

/** Structural conformance keeps alternative implementations replaceable. */
export const climbingIntelligenceEngine: ClimbingIntelligenceEngine = {
  evaluateRouteMembership,
  rankMoves,
  explainMovementPhase,
  buildRoutePath,
};
