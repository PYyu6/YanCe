/**
 * Deterministic P1 contact estimator and evaluation helpers.
 *
 * This is an explainable baseline, not a trained pose/contact model. The
 * upstream adapter supplies a limb, nearest hold, overlap, image-plane speed,
 * and visibility for each ordered frame. This module adds the missing temporal
 * rule: evidence must stay valid on the SAME hold for long enough before the
 * state machine is allowed to ask the user to confirm it.
 *
 * A later trained estimator can implement TemporalContactEstimator without
 * changing LiveCoachPanel, the four-contact state machine, or Beta Receipt.
 */
import {
  ContactEstimatorEvaluation,
  ContactEvaluationExample,
  ContactEvaluationMetrics,
  ContactFrameObservation,
  Limb,
  TemporalContactConfig,
  TemporalContactEstimate,
  TemporalContactEstimator,
} from '../types';

export const DEFAULT_TEMPORAL_CONTACT_CONFIG: Readonly<TemporalContactConfig> = {
  minOverlapRatio: 0.35,
  maxSpeedPxPerSecond: 120,
  minVisibility: 0.5,
  minDwellMs: 500,
  releaseGraceMs: 250,
  proposalProbability: 0.72,
};

interface LimbHistory {
  holdId: string;
  candidateStartedMs: number;
  lastValidMs: number;
}

const LIMBS: Limb[] = ['leftHand', 'rightHand', 'leftFoot', 'rightFoot'];

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Keep the score deliberately simple and inspectable for P1. Dwell gates the
 * proposal separately, so a strong-looking early frame still cannot propose.
 */
function scoreObservation(
  observation: ContactFrameObservation,
  dwellMs: number,
  config: TemporalContactConfig,
): number {
  const overlap = clamp01(observation.overlapRatio);
  const visibility = clamp01(observation.visibility);
  const lowSpeed = clamp01(1 - observation.speedPxPerSecond / config.maxSpeedPxPerSecond);
  const dwell = clamp01(dwellMs / config.minDwellMs);
  return clamp01(0.4 * overlap + 0.25 * visibility + 0.2 * lowSpeed + 0.15 * dwell);
}

function validateObservation(observation: ContactFrameObservation): void {
  if (!Number.isFinite(observation.timestampMs) || observation.timestampMs < 0) {
    throw new Error('Contact observation timestampMs must be a non-negative number.');
  }
  if (
    !Number.isFinite(observation.overlapRatio) ||
    !Number.isFinite(observation.visibility) ||
    observation.overlapRatio < 0 ||
    observation.overlapRatio > 1 ||
    observation.visibility < 0 ||
    observation.visibility > 1
  ) {
    throw new Error('Contact overlapRatio and visibility must be between 0 and 1.');
  }
  if (!Number.isFinite(observation.speedPxPerSecond) || observation.speedPxPerSecond < 0) {
    throw new Error('Contact speedPxPerSecond must be a non-negative number.');
  }
}

export class TimeBasedContactEstimator implements TemporalContactEstimator {
  private readonly histories = new Map<Limb, LimbHistory>();
  private readonly config: TemporalContactConfig;

  constructor(config: Partial<TemporalContactConfig> = {}) {
    this.config = { ...DEFAULT_TEMPORAL_CONTACT_CONFIG, ...config };
  }

  observe(observation: ContactFrameObservation): TemporalContactEstimate {
    validateObservation(observation);
    const previous = this.histories.get(observation.limb);
    if (previous && observation.timestampMs < previous.lastValidMs) {
      throw new Error('Contact observations for one limb must be time-ordered.');
    }

    const evidence = {
      overlapRatio: observation.overlapRatio,
      speedPxPerSecond: observation.speedPxPerSecond,
      visibility: observation.visibility,
    };

    // A missing candidate can be a brief occlusion. Preserve the last hold for
    // a short grace period, but do not add that missing time to its dwell.
    if (observation.holdId === null) {
      if (previous && observation.timestampMs - previous.lastValidMs > this.config.releaseGraceMs) {
        this.histories.delete(observation.limb);
        return {
          limb: observation.limb,
          holdId: previous.holdId,
          probability: 0,
          dwellMs: previous.lastValidMs - previous.candidateStartedMs,
          decision: 'release',
          estimator: 'time_based_baseline',
          evidence,
        };
      }
      return {
        limb: observation.limb,
        holdId: previous?.holdId ?? null,
        probability: 0,
        dwellMs: previous ? previous.lastValidMs - previous.candidateStartedMs : 0,
        decision: 'tracking',
        estimator: 'time_based_baseline',
        evidence,
      };
    }

    const valid =
      observation.overlapRatio >= this.config.minOverlapRatio &&
      observation.speedPxPerSecond <= this.config.maxSpeedPxPerSecond &&
      observation.visibility >= this.config.minVisibility;

    // Visible evidence that fails a spatial or motion gate is not an occlusion:
    // it breaks continuity immediately, so later frames must earn dwell again.
    if (!valid) {
      this.histories.delete(observation.limb);
      return {
        limb: observation.limb,
        holdId: observation.holdId,
        probability: 0,
        dwellMs: 0,
        decision: 'tracking',
        estimator: 'time_based_baseline',
        evidence,
      };
    }

    const history =
      previous?.holdId === observation.holdId
        ? { ...previous, lastValidMs: observation.timestampMs }
        : {
            holdId: observation.holdId,
            candidateStartedMs: observation.timestampMs,
            lastValidMs: observation.timestampMs,
          };
    this.histories.set(observation.limb, history);

    const dwellMs = history.lastValidMs - history.candidateStartedMs;
    const probability = scoreObservation(observation, dwellMs, this.config);
    const decision =
      dwellMs >= this.config.minDwellMs && probability >= this.config.proposalProbability
        ? 'propose'
        : 'tracking';

    return {
      limb: observation.limb,
      holdId: observation.holdId,
      probability,
      dwellMs,
      decision,
      estimator: 'time_based_baseline',
      evidence,
    };
  }

  reset(limb?: Limb): void {
    if (limb) this.histories.delete(limb);
    else this.histories.clear();
  }
}

function computeMetrics(examples: ContactEvaluationExample[]): ContactEvaluationMetrics {
  const counts = examples.reduce(
    (result, example) => {
      if (example.expectedContact && example.proposedContact) result.truePositive += 1;
      else if (!example.expectedContact && example.proposedContact) result.falsePositive += 1;
      else if (!example.expectedContact && !example.proposedContact) result.trueNegative += 1;
      else result.falseNegative += 1;
      return result;
    },
    { truePositive: 0, falsePositive: 0, trueNegative: 0, falseNegative: 0 },
  );
  const precisionDenominator = counts.truePositive + counts.falsePositive;
  const recallDenominator = counts.truePositive + counts.falseNegative;
  const precision = precisionDenominator === 0 ? 0 : counts.truePositive / precisionDenominator;
  const recall = recallDenominator === 0 ? 0 : counts.truePositive / recallDenominator;
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { total: examples.length, ...counts, precision, recall, f1 };
}

/** Pure labeled-data scorer for CI fixtures now and real gym traces later. */
export function evaluateContactPredictions(
  examples: ContactEvaluationExample[],
): ContactEstimatorEvaluation {
  const byLimb = LIMBS.reduce((result, limb) => {
    result[limb] = computeMetrics(examples.filter((example) => example.limb === limb));
    return result;
  }, {} as Record<Limb, ContactEvaluationMetrics>);
  return { ...computeMetrics(examples), byLimb };
}
