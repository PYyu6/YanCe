/** Translate legacy detector classes into the richer product taxonomy. */
import { HoldLabel } from '../types';
import { CandidateSource, HoldType } from './holdCandidates';

const LIMITATION_BY_TYPE: Record<HoldType, string> = {
  jug: 'The image cannot confirm depth, texture, direction, or how positive the hold feels.',
  crimp: 'The image cannot confirm edge depth or prescribe full-crimp loading.',
  sloper: 'The image cannot measure friction, wall angle, or usable pressure direction.',
  pocket: 'The image cannot confirm pocket depth, finger count, or internal shape.',
  pinch: 'The image cannot confirm pinch width, thumb purchase, or required force.',
  volume: 'The image cannot know whether this gym allows the volume on this route.',
  unknown: 'Visible shape is unresolved; a person should label it before type-aware coaching.',
};

/**
 * A classifier's “crimp” class becomes morphology `edge`: crimp is a grip and
 * the person may instead use that edge open-hand or half-crimp. Source remains
 * visible so downstream UI cannot present a model proposal as a confirmed fact.
 */
export function candidateTypeToHoldLabel(
  type: HoldType,
  confidence: number,
  source: CandidateSource,
): HoldLabel {
  const proposal = source === 'yolo' || source === 'both';
  const base = {
    confidence: proposal && type !== 'unknown' ? confidence : 0,
    source: proposal && type !== 'unknown' ? 'vision_proposal' as const : 'manual_unknown' as const,
    limitations: [LIMITATION_BY_TYPE[type]],
  };

  switch (type) {
    case 'jug':
      return { ...base, morphology: 'jug', compatibleGrips: ['open_hand'] };
    case 'crimp':
      return {
        ...base,
        morphology: 'edge',
        compatibleGrips: ['open_hand', 'half_crimp', 'full_crimp'],
      };
    case 'sloper':
      return { ...base, morphology: 'sloper', compatibleGrips: ['open_hand', 'press'] };
    case 'pocket':
      return { ...base, morphology: 'pocket', compatibleGrips: ['pocket'] };
    case 'pinch':
      return { ...base, morphology: 'pinch', compatibleGrips: ['pinch'] };
    case 'volume':
      return { ...base, morphology: 'volume', compatibleGrips: ['press', 'open_hand'] };
    default:
      return { ...base, morphology: 'unknown', compatibleGrips: ['unknown'] };
  }
}
