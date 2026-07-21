/**
 * Contract tests for the first climbing-intelligence slice. The fixture values
 * are interpretable proxies, not biomechanical ground truth: they verify that
 * declared gym rules and user objectives change the product's decisions.
 */
import { describe, expect, it } from 'vitest';
import {
  buildRoutePath,
  evaluateRouteMembership,
  explainMovementPhase,
  rankMoves,
} from '../../src/engine/climbingIntelligence';
import {
  DetectedHold,
  HoldMorphology,
  MoveCandidateEvidence,
  RouteRuleSet,
} from '../../src/types';

function hold(
  id: string,
  color: string,
  morphology: HoldMorphology,
): DetectedHold {
  return {
    id,
    pixelCenter: { x: 100, y: 100 },
    worldCenter: { x: 50, y: 100 },
    pixelRadius: 18,
    color,
    routeColor: color,
    isStart: false,
    isTop: false,
    manuallyAdded: false,
    holdLabel: {
      morphology,
      compatibleGrips: ['unknown'],
      confidence: 0.8,
      source: 'vision_proposal',
      limitations: ['Image does not reveal texture.'],
    },
  };
}

const sameColorRules: RouteRuleSet = {
  markingPolicy: 'same_color',
  routeColor: '#2dd4bf',
  allowedHoldIds: [],
  volumePolicy: 'route_volumes_only',
};

describe('route membership', () => {
  it('uses the declared same-color policy instead of assuming every wall uses it', () => {
    expect(evaluateRouteMembership(hold('teal', '#2DD4BF', 'jug'), sameColorRules)).toMatchObject({
      allowed: true,
      needsConfirmation: false,
    });
    expect(evaluateRouteMembership(hold('pink', '#f472b6', 'jug'), sameColorRules)).toMatchObject({
      allowed: false,
      needsConfirmation: false,
    });
  });

  it('lets explicit setter metadata override visible color', () => {
    const rules: RouteRuleSet = {
      ...sameColorRules,
      markingPolicy: 'explicit_hold_ids',
      allowedHoldIds: ['pink'],
    };
    const decision = evaluateRouteMembership(hold('pink', '#f472b6', 'pinch'), rules);
    expect(decision.allowed).toBe(true);
    expect(decision.basis).toContain('explicit route list');
  });

  it('treats volume use as a configurable gym rule', () => {
    const volume = hold('volume-1', '#94a3b8', 'volume');
    expect(evaluateRouteMembership(volume, {
      ...sameColorRules,
      volumePolicy: 'all_volumes',
    }).allowed).toBe(true);
    expect(evaluateRouteMembership(volume, {
      ...sameColorRules,
      volumePolicy: 'no_volumes',
    }).allowed).toBe(false);
  });
});

describe('clear route labels', () => {
  it('keeps route order separate from hold shape and excludes optional/off-route markers', () => {
    const start = hold('start', '#2dd4bf', 'jug');
    start.routeAnnotation = {
      role: 'start', order: 1, onDeclaredPath: true,
      source: 'fixture_proposal', explanation: 'Demo start.',
    };
    const top = hold('top', '#2dd4bf', 'sloper');
    top.routeAnnotation = {
      role: 'top', order: 3, onDeclaredPath: true,
      source: 'fixture_proposal', explanation: 'Demo top.',
    };
    const middle = hold('middle', '#2dd4bf', 'edge');
    middle.routeAnnotation = {
      role: 'move', order: 2, onDeclaredPath: true,
      source: 'fixture_proposal', explanation: 'Demo move.',
    };
    const volume = hold('volume', '#94a3b8', 'volume');
    volume.routeAnnotation = {
      role: 'optional', order: null, onDeclaredPath: false,
      source: 'fixture_proposal', explanation: 'Gym rule decides.',
    };

    expect(buildRoutePath([top, volume, start, middle])).toEqual([
      expect.objectContaining({ holdId: 'start', order: 1, role: 'start', morphology: 'jug', verified: false, displayLabel: '1 · Start · Jug proposal' }),
      expect.objectContaining({ holdId: 'middle', order: 2, role: 'move', morphology: 'edge', verified: false, displayLabel: '2 · Next · Edge proposal' }),
      expect.objectContaining({ holdId: 'top', order: 3, role: 'top', morphology: 'sloper', verified: false, displayLabel: '3 · Top · Sloper proposal' }),
    ]);
  });
});

const candidates: MoveCandidateEvidence[] = [
  {
    id: 'quiet-jug',
    targetHoldId: 'jug-4',
    targetMorphology: 'jug',
    reachRatio: 0.52,
    elbowFlexion: 0.15,
    supportMargin: 0.88,
    legDriveOpportunity: 0.9,
    techniqueNovelty: 0.12,
    dynamicRequired: false,
  },
  {
    id: 'flag-edge',
    targetHoldId: 'edge-7',
    targetMorphology: 'edge',
    reachRatio: 0.68,
    elbowFlexion: 0.32,
    supportMargin: 0.72,
    legDriveOpportunity: 0.62,
    techniqueNovelty: 0.96,
    dynamicRequired: false,
  },
  {
    id: 'high-sloper',
    targetHoldId: 'sloper-9',
    targetMorphology: 'sloper',
    reachRatio: 0.88,
    elbowFlexion: 0.52,
    supportMargin: 0.58,
    legDriveOpportunity: 0.84,
    techniqueNovelty: 0.7,
    dynamicRequired: true,
  },
  {
    id: 'out-of-range',
    targetHoldId: 'edge-12',
    targetMorphology: 'edge',
    reachRatio: 1.08,
    elbowFlexion: 0.7,
    supportMargin: 0.2,
    legDriveOpportunity: 0.3,
    techniqueNovelty: 0.8,
    dynamicRequired: true,
  },
];

describe('objective-aware move ranking', () => {
  it('changes the top suggestion when the person changes their goal', () => {
    expect(rankMoves(candidates, 'conserve_forearms')[0].id).toBe('quiet-jug');
    expect(rankMoves(candidates, 'technique_practice')[0].id).toBe('flag-edge');
    expect(rankMoves(candidates, 'power_training')[0].id).toBe('high-sloper');
  });

  it('rejects a reach beyond the conservative MVP bound for every objective', () => {
    for (const objective of ['conserve_forearms', 'technique_practice', 'power_training'] as const) {
      const ranked = rankMoves(candidates, objective);
      expect(ranked.find((move) => move.id === 'out-of-range')).toMatchObject({
        rejected: true,
        score: 0,
      });
    }
  });

  it('keeps the scientific limitation attached to every recommendation', () => {
    expect(rankMoves(candidates, 'conserve_forearms')[0].limitations.join(' ')).toContain(
      'does not measure force, fatigue, or metabolic cost',
    );
  });
});

describe('movement phase', () => {
  it('explains a crouch as possible preparation rather than automatically bad form', () => {
    const result = explainMovementPhase({
      phase: 'loading',
      kneeFlexion: 0.8,
      elbowFlexion: 0.2,
      supportMargin: 0.75,
    });
    expect(result.headline).toContain('Loading');
    expect(result.coachingCue).toContain('legs');
    expect(result.caveat).toContain('not automatically inefficient');
  });
});
