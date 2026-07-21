/**
 * Technique Advisor
 * ─────────────────
 * Given two holds (current position → target), the climber's body model,
 * and their experience level, recommend the best climbing technique.
 *
 * Uses spatial analysis of hold positions + the knowledge base from xinlibrary.
 */

import { DetectedHold, BodyMeasurements, Experience } from '../types';
import { TECHNIQUES, getHeightCategory, HEIGHT_TECHNIQUE_MAP } from '../knowledge/techniques';

export interface TechniqueSuggestion {
  id: string;
  name: string;
  nameCn: string;
  tip: string;
  reachBenefit: number;
}

/**
 * Suggest the best technique for moving from one hold to another.
 * Analyzes the spatial relationship and matches to known techniques.
 */
export function suggestTechnique(
  fromHold: DetectedHold,
  toHold: DetectedHold,
  measurements: BodyMeasurements,
  experience: Experience,
): TechniqueSuggestion | null {
  const dx = toHold.worldCenter.x - fromHold.worldCenter.x;
  const dy = toHold.worldCenter.y - fromHold.worldCenter.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx) * (180 / Math.PI); // degrees from horizontal

  // Collect context keywords based on spatial analysis
  const keywords: string[] = [];

  // Distance-based keywords
  const reachRatio = distance / measurements.armLength;
  if (reachRatio > 0.9) keywords.push('reach', 'extend');
  if (reachRatio > 1.2) keywords.push('dynamic', 'far hold');
  if (reachRatio < 0.5) keywords.push('close');

  // Direction-based keywords
  if (angle > 60 && angle < 120) keywords.push('high reach', 'big move up');
  if (Math.abs(angle) < 30) keywords.push('traverse', 'lateral');
  if (dx > 0 && Math.abs(dy) < distance * 0.5) keywords.push('side reach');
  if (dx < 0 && Math.abs(dy) < distance * 0.5) keywords.push('cross', 'side reach');

  // If the hold is far to one side, suggest techniques for lateral moves
  if (Math.abs(dx) > measurements.armLength * 0.6) {
    keywords.push('side pull', 'sideways');
  }

  // If the hold is high, suggest reach-extending techniques
  if (dy > measurements.armLength * 0.7) {
    keywords.push('high foot', 'extend', 'rock over');
  }

  // If it's a big reach and climber is short, prioritize reach-extending techniques
  const heightCat = getHeightCategory(measurements.shoulderHeight / 0.82); // derive height
  if (heightCat === 'short' && reachRatio > 0.75) {
    keywords.push('drop knee', 'twist', 'hip drive');
  }

  // Level-appropriate experience keywords
  const availableLevels: Experience[] = ['beginner', 'intermediate', 'advanced'];
  const levelIdx = availableLevels.indexOf(experience);

  // Find matching techniques from knowledge base
  const available = TECHNIQUES.filter(
    (t) => availableLevels.indexOf(t.minLevel) <= levelIdx,
  );

  // Score each technique by keyword match + spatial relevance
  let bestTech: typeof TECHNIQUES[0] | null = null;
  let bestScore = 0;

  for (const tech of available) {
    let score = 0;

    // Keyword matching
    for (const kw of keywords) {
      for (const tkw of tech.keywords) {
        if (tkw.includes(kw) || kw.includes(tkw)) {
          score += 1;
        }
      }
    }

    // Bonus for reach benefit when reach is tight
    if (reachRatio > 0.8) {
      score += tech.reachBenefit * 3;
    }

    // Bonus for energy saving on sustained climbing
    score += tech.energySaving * 0.5;

    // Bonus for height-category-specific techniques
    const heightTechs = HEIGHT_TECHNIQUE_MAP[heightCat] ?? [];
    if (heightTechs.includes(tech.id)) {
      score += 1.5;
    }

    if (score > bestScore) {
      bestScore = score;
      bestTech = tech;
    }
  }

  if (!bestTech || bestScore < 1) return null;

  // Generate a contextual tip
  const tip = generateTip(bestTech.id, dx, dy, distance, measurements);

  return {
    id: bestTech.id,
    name: bestTech.name,
    nameCn: bestTech.nameCn,
    tip,
    reachBenefit: bestTech.reachBenefit,
  };
}

/**
 * Generate a human-readable tip for a specific technique in context.
 */
function generateTip(
  techId: string,
  dx: number,
  dy: number,
  distance: number,
  measurements: BodyMeasurements,
): string {
  const dir = dx >= 0 ? 'right' : 'left';
  const distRound = Math.round(distance);

  switch (techId) {
    case 'drop_knee':
      return `Drop knee on ${dir} foot — turn hip into wall for +10-15cm reach (${distRound}cm move)`;
    case 'flagging':
      return `Flag ${dir === 'right' ? 'left' : 'right'} leg for counterbalance on this ${distRound}cm side reach`;
    case 'heel_hook':
      return `Heel hook to take weight off arms — pull with hamstring/glute`;
    case 'toe_hook':
      return `Toe hook to prevent barn-door — engage shin to create counter-tension`;
    case 'backstep':
      return `Backstep with outside edge facing ${dir} — rotate body for extra reach`;
    case 'twist_lock':
      return `Twist lock: rotate torso, lock off holding arm, reach with ${dir} hand (${distRound}cm)`;
    case 'high_step':
      return `High step onto the lower hold — rock weight over foot, push up with leg`;
    case 'deadpoint':
      return `Deadpoint: generate upward momentum, catch at the apex (${distRound}cm, just past static reach)`;
    case 'dyno':
      return `Dyno required — ${distRound}cm is beyond static reach. Commit fully, explode from legs!`;
    case 'straight_arms':
      return `Keep arms straight between moves — hang from skeleton, save energy for the ${distRound}cm reach`;
    case 'hip_drive':
      return `Drive hips toward wall first, then reach — let hip rotation carry you (Tomoa technique)`;
    case 'body_tension':
      return `Engage core and maintain body tension — prevent feet from cutting on this steep section`;
    case 'stemming':
      return `Stem between opposing features — great for resting`;
    case 'knee_bar':
      return `Knee bar opportunity — lock in and shake out both arms`;
    case 'layback':
      return `Layback the edge — lean away, walk feet up. Keep arms straight`;
    default:
      return `${distRound}cm reach to the ${dir} — use good body position`;
  }
}

/**
 * Get technique details by ID for display in technique cards.
 */
export function getTechniqueById(id: string) {
  return TECHNIQUES.find((t) => t.id === id) ?? null;
}
