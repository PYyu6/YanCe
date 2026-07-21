/**
 * betaForProfile.ts — The one-call pipeline behind the comparison view.
 *
 * Deliberately a pure function over the EXISTING engine (computeMeasurements →
 * buildRouteGraph → generateBetas) with zero new algorithmic content. Two
 * reasons it exists as its own module instead of living inside ComparisonView:
 *
 *  1. The demo's core claim — "beta depends on YOUR body" — becomes a single
 *     testable assertion: computeBetaForProfile(holds, tall) must differ from
 *     computeBetaForProfile(holds, short) on a fixture wall. That integration
 *     test is the product claim, executable.
 *  2. The engine was already parameterized by BodyMeasurements; the comparison
 *     feature should PROVE that, not duplicate any of it. If this file ever
 *     grows engine logic, that's a design smell.
 */

import { Beta, BodyMeasurements, ClimberProfile, DetectedHold } from '../types';
import { computeMeasurements } from '../engine/climberModel';
import { buildRouteGraph } from '../engine/graphBuilder';
import { generateBetas } from '../engine/betaGenerator';
import { HoldType } from './holdCandidates';

export interface ProfileBetaResult {
  profile: ClimberProfile;
  measurements: BodyMeasurements;
  /** Sorted by suitability, best first (generateBetas' own ordering). */
  betas: Beta[];
}

export function computeBetaForProfile(
  holds: DetectedHold[],
  profile: ClimberProfile,
  /** Optional hold-type map from fusion; absent = neutral weights (see graphBuilder). */
  holdTypes?: Record<string, HoldType>,
): ProfileBetaResult {
  const measurements = computeMeasurements(profile);
  const graph = buildRouteGraph(holds, measurements, holdTypes);
  const betas = generateBetas(graph, measurements, profile.experience);
  return { profile, measurements, betas };
}

/**
 * Pick the demo counter-body for the comparison view: whichever archetype is
 * FARTHER from the user's own build (tall user → compare against 160/160,
 * short/average user → against 190/195). Grade/experience are kept identical
 * on purpose — the demo's claim is "the BODY changes the beta", so every other
 * variable must be held constant or the comparison proves nothing.
 */
export function contrastProfile(p: ClimberProfile): ClimberProfile {
  return p.height >= 175
    ? { height: 160, armSpan: 160, grade: p.grade, experience: p.experience }
    : { height: 190, armSpan: 195, grade: p.grade, experience: p.experience };
}

/**
 * The comparison view's headline: do two profiles get different sequences?
 * Compares the SEQUENCE OF HOLDS of each profile's best beta (limb assignment
 * may legitimately coincide; the hold path is the claim that matters).
 * Exported so the integration test asserts exactly what the UI displays.
 */
export function betaSequencesDiffer(a: ProfileBetaResult, b: ProfileBetaResult): boolean {
  const seqA = a.betas[0]?.moves.map((m) => m.toHoldId) ?? [];
  const seqB = b.betas[0]?.moves.map((m) => m.toHoldId) ?? [];
  if (seqA.length !== seqB.length) return true;
  return seqA.some((id, i) => id !== seqB[i]);
}
