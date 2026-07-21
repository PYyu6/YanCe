/**
 * Climbing Technique Knowledge Base
 * ──────────────────────────────────
 * Sourced from xinlibrary.com (攀岩知识库), a trilingual climbing knowledge base
 * with 250+ technique entries. Each technique has:
 * - When the strategy engine should suggest it
 * - Minimum experience level
 * - How much extra reach or energy saving it provides
 *
 * The technique advisor uses these to match hold configurations → technique suggestions.
 */

import { Technique, Experience } from '../types';

// ── FOOTWORK (脚法) ────────────────────────────────────────────────────────

const footwork: Technique[] = [
  {
    id: 'edging',
    name: 'Edging',
    nameCn: '边踩',
    category: 'footwork',
    description:
      'Using the inside or outside edge of the climbing shoe to stand on footholds. ' +
      'Inside edging is most common; outside edging pairs with backstep and drop knee.',
    whenToUse: 'Small, defined footholds with a clear edge to stand on.',
    howTo: 'Place the ball of your foot (big toe area) precisely on the edge. Keep your heel slightly raised for maximum pressure on the hold.',
    minLevel: 'beginner',
    reachBenefit: 0.1,
    energySaving: 0.3,
    keywords: ['small foothold', 'edge', 'precise'],
  },
  {
    id: 'smearing',
    name: 'Smearing',
    nameCn: '摩擦踩',
    category: 'footwork',
    description:
      'Pressing the sole of the shoe against featureless rock using friction. ' +
      'Essential for slab climbing where there are no defined footholds.',
    whenToUse: 'No defined footholds available; slab terrain; smooth wall sections.',
    howTo: 'Press as much rubber as possible against the surface. Push your hips over your feet to maximize downward pressure. Trust the friction.',
    minLevel: 'beginner',
    reachBenefit: 0.0,
    energySaving: 0.2,
    keywords: ['slab', 'no foothold', 'smooth', 'friction'],
  },
  {
    id: 'toe_hook',
    name: 'Toe Hook',
    nameCn: '勾脚尖',
    category: 'footwork',
    description:
      'Hooking the top of the foot (instep/toe area) over or around holds. ' +
      'Creates pulling force with the foot, essential on overhangs to prevent barn-dooring.',
    whenToUse: 'Overhanging terrain; preventing swing; holds above or beside you that a foot can hook over.',
    howTo: 'Point your toe and hook the top of your foot over the hold. Engage your shin muscles to pull. Often used opposite to the pulling hand to create counter-tension.',
    minLevel: 'intermediate',
    reachBenefit: 0.15,
    energySaving: 0.5,
    keywords: ['overhang', 'barn door', 'swing', 'tension', 'roof'],
  },
  {
    id: 'heel_hook',
    name: 'Heel Hook',
    nameCn: '勾脚跟',
    category: 'footwork',
    description:
      'Placing the heel on a hold and pulling with the hamstring/glute. ' +
      'Power comes from hamstring/glute activation. Dramatically reduces arm load on overhangs.',
    whenToUse: 'Overhanging walls; lip of a roof; holds at or above hip height where heel can reach.',
    howTo: 'Place your heel firmly on the hold. Engage hamstring and glute to pull your body toward the hold. Keep your core tight. This transfers significant weight from your arms to your leg.',
    minLevel: 'intermediate',
    reachBenefit: 0.2,
    energySaving: 0.7,
    keywords: ['overhang', 'roof', 'lip', 'high hold', 'rest'],
  },
  {
    id: 'bicycle',
    name: 'Bicycle',
    nameCn: '自行车技术',
    category: 'footwork',
    description:
      'Clamping a hold between toe hook (top) and heel hook (bottom) simultaneously. ' +
      'Creates a hands-free lock point on overhangs.',
    whenToUse: 'Steep overhangs or roofs where you need to lock your body in place with your feet.',
    howTo: 'Place your heel on one side of a hold and your toe on the other, squeezing the hold between them. This clamps your leg to the hold and frees both hands.',
    minLevel: 'advanced',
    reachBenefit: 0.1,
    energySaving: 0.8,
    keywords: ['roof', 'overhang', 'clamp', 'lock'],
  },
  {
    id: 'backstep',
    name: 'Back Step',
    nameCn: '背步',
    category: 'footwork',
    description:
      'Stepping with the outside edge of the foot while the body is turned sideways to the wall. ' +
      'The hip closest to the wall turns in, extending reach on that side.',
    whenToUse: 'Side-pulling holds; when you need extra reach to one side; pairs naturally with drop knee.',
    howTo: 'Turn your body sideways to the wall. Place the outside edge of your back foot on a hold below. Let your inside hip press close to the wall.',
    minLevel: 'intermediate',
    reachBenefit: 0.25,
    energySaving: 0.4,
    keywords: ['side pull', 'reach', 'sideways', 'cross'],
  },
];

// ── BODY POSITIONING (身体定位) ────────────────────────────────────────────

const bodyPositioning: Technique[] = [
  {
    id: 'flagging',
    name: 'Flagging',
    nameCn: '旗帜步',
    category: 'body_position',
    description:
      'Extending a leg outward (not on a hold) for counterbalance. ' +
      'Three variants: inside flag (leg crosses behind standing leg), ' +
      'outside flag (leg extends to the side), backstep flag (leg extends behind while turned).' +
      ' One of the most important intermediate techniques.',
    whenToUse: 'When reaching to one side causes your body to swing (barn-door). No foothold available on the counterbalance side.',
    howTo: 'Extend the non-standing leg out to the opposite side of the reaching hand. Press the toe or side of your shoe against the wall for friction. This shifts your center of gravity and prevents rotation.',
    minLevel: 'beginner',
    reachBenefit: 0.15,
    energySaving: 0.5,
    keywords: ['barn door', 'balance', 'one foot', 'counterbalance', 'side reach'],
  },
  {
    id: 'drop_knee',
    name: 'Drop Knee / Egyptian',
    nameCn: '落膝',
    category: 'body_position',
    description:
      'Rotating the knee inward and downward while on a side hold. ' +
      'Dramatically extends reach (10-15cm extra) and reduces arm load. ' +
      'Named "Egyptian" because of the twisted torso posture.',
    whenToUse: 'Side-pulling holds; when you need significant extra reach upward; sustained sections where energy conservation matters.',
    howTo: 'Stand on the outside edge of one foot. Rotate that knee inward and downward, turning your hip into the wall. Your torso twists, bringing the opposite shoulder closer to the wall and extending the reaching arm significantly.',
    minLevel: 'intermediate',
    reachBenefit: 0.35,
    energySaving: 0.6,
    keywords: ['side pull', 'reach', 'extend', 'energy', 'twist', 'sustained'],
  },
  {
    id: 'twist_lock',
    name: 'Twist Lock',
    nameCn: '扭转锁定',
    category: 'body_position',
    description:
      'Rotating the torso and locking off one arm while reaching with the other. ' +
      'Uses hip rotation rather than pure arm strength to extend reach.',
    whenToUse: 'When the next hold is significantly higher; vertical or slightly overhanging terrain.',
    howTo: 'Turn your body so the reaching-side hip is against the wall. Lock off the holding arm close to your body. Reach up with the free hand. The rotation adds reach beyond your normal span.',
    minLevel: 'intermediate',
    reachBenefit: 0.3,
    energySaving: 0.4,
    keywords: ['high reach', 'lock off', 'rotation', 'extend'],
  },
  {
    id: 'stemming',
    name: 'Stemming',
    nameCn: '外撑/桥接',
    category: 'body_position',
    description:
      'Pressing feet against opposing walls or features, using opposing force to stay in place. ' +
      'Used in corners, dihedrals, and chimneys.',
    whenToUse: 'Corners or dihedral features; two opposing surfaces within leg-span distance.',
    howTo: 'Place each foot on an opposing surface. Push outward with both legs to create opposing force. This can be completely hands-free in wide enough corners.',
    minLevel: 'beginner',
    reachBenefit: 0.1,
    energySaving: 0.9,
    keywords: ['corner', 'dihedral', 'chimney', 'opposing', 'rest'],
  },
  {
    id: 'knee_bar',
    name: 'Knee Bar',
    nameCn: '膝顶',
    category: 'body_position',
    description:
      'Jamming the knee and foot against opposing surfaces to create a hands-free rest. ' +
      'Knee pushes up while foot pushes down, clamping the body in place.',
    whenToUse: 'Overhanging terrain with a feature above the knee and a foothold below; rest opportunities on steep routes.',
    howTo: 'Place your foot on a hold, then press your knee cap against a surface above (hold, tufa, roof lip). The opposing pressure locks you in place. You can shake out both arms.',
    minLevel: 'intermediate',
    reachBenefit: 0.0,
    energySaving: 1.0,
    keywords: ['rest', 'overhang', 'hands free', 'recovery', 'shake out'],
  },
  {
    id: 'high_step',
    name: 'High Step',
    nameCn: '高跨步',
    category: 'body_position',
    description:
      'Stepping foot very high (to chest level or above) and rocking body weight over it. ' +
      'Requires hip flexibility. Converts a pull into a push, saving arm energy.',
    whenToUse: 'Large moves upward; a good foothold exists at chest height or above; slab or vertical terrain.',
    howTo: 'Bring your foot up to a high hold (may need to turn hip out). Shift your weight over that foot by driving hips forward and up. Push down through the leg to stand up. Keep arms straight during the push.',
    minLevel: 'intermediate',
    reachBenefit: 0.4,
    energySaving: 0.5,
    keywords: ['high foot', 'slab', 'big move up', 'flexible', 'rock over'],
  },
  {
    id: 'layback',
    name: 'Layback',
    nameCn: '侧拉仰身',
    category: 'body_position',
    description:
      'Leaning away from a vertical edge or crack while feet push against the wall. ' +
      'Uses opposition between pulling hands and pushing feet.',
    whenToUse: 'Vertical crack or edge feature; arete climbing; no other hold options.',
    howTo: 'Grip the edge with both hands. Lean your body away from the wall. Place feet flat against the wall as high as possible. Walk feet up as you move hands up. Keep arms straight.',
    minLevel: 'intermediate',
    reachBenefit: 0.1,
    energySaving: 0.2,
    keywords: ['crack', 'edge', 'arete', 'opposition'],
  },
];

// ── DYNAMIC TECHNIQUES (动态技术) ──────────────────────────────────────────

const dynamic: Technique[] = [
  {
    id: 'deadpoint',
    name: 'Deadpoint',
    nameCn: '死点',
    category: 'dynamic',
    description:
      'Catching a hold at the apex of upward movement — the zero-gravity moment where ' +
      'you are momentarily weightless. Controlled and precise, not a full jump.',
    whenToUse: 'Next hold is just beyond static reach; you need a small upward burst to grab it.',
    howTo: 'Generate upward momentum by pushing with legs and pulling with arms. At the peak of your movement (the "dead point" where velocity = 0), latch the target hold. Timing is everything — practice the rhythm.',
    minLevel: 'intermediate',
    reachBenefit: 0.3,
    energySaving: 0.1,
    keywords: ['just out of reach', 'dynamic', 'momentum', 'controlled'],
  },
  {
    id: 'dyno',
    name: 'Dyno',
    nameCn: '飞跃',
    category: 'dynamic',
    description:
      'Full dynamic jump where both hands leave the wall. Requires explosive power ' +
      'and full commitment. The most dramatic climbing move.',
    whenToUse: 'Next hold is far beyond static or deadpoint reach; the only option is to jump.',
    howTo: 'Set your feet solidly. Compress your body down. Explode upward, driving through your legs. Release both hands and fully commit to catching the target. Land with slightly bent arms to absorb the catch.',
    minLevel: 'advanced',
    reachBenefit: 0.8,
    energySaving: 0.0,
    keywords: ['far hold', 'jump', 'explosive', 'unreachable', 'big move'],
  },
  {
    id: 'swing_momentum',
    name: 'Swing / Momentum',
    nameCn: '摆荡/惯性',
    category: 'dynamic',
    description:
      'Using body swing and pendulum momentum to reach holds. ' +
      'Generate swing from hips and time the catch at the swing apex.',
    whenToUse: 'Traversing on an overhang; holds are laterally far apart; after cutting feet.',
    howTo: 'Start a controlled swing by shifting your hips. Build momentum with core engagement. At the apex of the swing (when moving toward the target), reach and latch the hold.',
    minLevel: 'intermediate',
    reachBenefit: 0.4,
    energySaving: 0.1,
    keywords: ['traverse', 'overhang', 'swing', 'lateral', 'cut feet'],
  },
];

// ── MOVEMENT PRINCIPLES (运动原理) ─────────────────────────────────────────
// These are not "techniques" per se but principles the engine uses to score moves.

const principles: Technique[] = [
  {
    id: 'straight_arms',
    name: 'Straight Arms',
    nameCn: '直臂原则',
    category: 'movement_principle',
    description:
      'Keeping arms straight to hang from skeleton rather than muscles. ' +
      'Described by xinlibrary as "10x more important than strength." ' +
      'Bent arms burn out biceps rapidly; straight arms use bone and tendon.',
    whenToUse: 'Always — the default position between moves. Especially on sustained routes.',
    howTo: 'Between every move, let your arms go fully straight. Hang from your skeleton. Only bend your arms during the actual reaching movement, then straighten again immediately.',
    minLevel: 'beginner',
    reachBenefit: 0.0,
    energySaving: 0.8,
    keywords: ['endurance', 'rest', 'sustained', 'tired', 'pump'],
  },
  {
    id: 'center_of_gravity',
    name: 'Center of Gravity Over Feet',
    nameCn: '重心在脚上',
    category: 'movement_principle',
    description:
      'Positioning your center of mass directly over your feet so legs bear most of the weight. ' +
      'Arms guide; legs drive. Most beginners hang from their arms — the fix is shifting COG to feet.',
    whenToUse: 'Always on vertical/slab terrain. The default body position.',
    howTo: 'Push your hips toward the wall. Keep your weight over your feet. Your arms are for balance and guidance, not for holding your body weight. If your arms get tired first, your COG is wrong.',
    minLevel: 'beginner',
    reachBenefit: 0.0,
    energySaving: 0.7,
    keywords: ['balance', 'weight', 'feet', 'tired arms', 'beginner'],
  },
  {
    id: 'hip_drive',
    name: 'Hip-Driven Movement',
    nameCn: '髋部驱动',
    category: 'movement_principle',
    description:
      'Initiating movements from the hips rather than pulling with arms. ' +
      'Tomoa Narasaki\'s principle: "Hip-driven dynamic beta requires less finger strength ' +
      'and explosive power." Turn hips into the wall to extend reach.',
    whenToUse: 'Dynamic moves; reaching high; any time you are pulling with arms instead of pushing with legs.',
    howTo: 'Before reaching for the next hold, drive your hips toward the wall and upward. Let the hip rotation carry your torso closer, then reach. The arm movement is the follow-through, not the driver.',
    minLevel: 'intermediate',
    reachBenefit: 0.2,
    energySaving: 0.5,
    keywords: ['efficient', 'power', 'rotation', 'dynamic'],
  },
  {
    id: 'diagonal_support',
    name: 'Diagonal Support',
    nameCn: '对角支撑',
    category: 'movement_principle',
    description:
      'Using opposing hand and foot in a diagonal line for balance. ' +
      'Left hand + right foot, or right hand + left foot. Creates stable triangle.',
    whenToUse: 'Moving one limb at a time; maintaining balance during transitions.',
    howTo: 'When reaching with your right hand, make sure your left foot is solidly placed (and vice versa). The diagonal pair provides a stable base. Avoid reaching with the hand and foot on the same side simultaneously.',
    minLevel: 'beginner',
    reachBenefit: 0.0,
    energySaving: 0.3,
    keywords: ['balance', 'stable', 'transition', 'moving'],
  },
  {
    id: 'body_tension',
    name: 'Body Tension',
    nameCn: '身体张力',
    category: 'movement_principle',
    description:
      'Maintaining a rigid body to transfer force from feet to hands on overhangs. ' +
      'Without tension, feet cut and all weight goes to arms.',
    whenToUse: 'Overhanging terrain; any time feet are on holds but body wants to sag.',
    howTo: 'Engage your core, glutes, and legs to maintain a plank-like tension between your hands and feet. Think of your body as a bridge — if the bridge sags, the connection breaks.',
    minLevel: 'intermediate',
    reachBenefit: 0.1,
    energySaving: 0.6,
    keywords: ['overhang', 'steep', 'core', 'feet cutting', 'sag'],
  },
];

// ── ROUTE READING (路线阅读) ───────────────────────────────────────────────

const routeReading: Technique[] = [
  {
    id: 'ground_reading',
    name: 'Ground Reading',
    nameCn: '地面阅读',
    category: 'route_reading',
    description:
      'Analyzing the route from the ground before climbing. Identify all holds, ' +
      'plan the sequence, find rest spots, and identify the crux before leaving the ground.',
    whenToUse: 'Before every climb attempt. Especially important on new routes.',
    howTo: 'Stand back and scan the entire route. Identify start/finish. Trace a path with your eyes. Identify the crux section. Plan hand sequences. Note rest positions. Mime the moves on the ground.',
    minLevel: 'beginner',
    reachBenefit: 0.0,
    energySaving: 0.3,
    keywords: ['planning', 'before climbing', 'visualize'],
  },
  {
    id: 'crux_analysis',
    name: 'Crux Analysis',
    nameCn: '难点分析',
    category: 'route_reading',
    description:
      'Identifying and strategizing for the hardest section of the route. ' +
      'Plan extra carefully for the crux — it is where most falls happen.',
    whenToUse: 'When analyzing a route with one or more significantly harder sections.',
    howTo: 'Find the section with the smallest holds, biggest moves, or worst angles. Plan this section in detail. Consider: can you rest before it? Which technique makes the crux move easier? Is there an alternative sequence?',
    minLevel: 'beginner',
    reachBenefit: 0.0,
    energySaving: 0.2,
    keywords: ['hard section', 'fall', 'difficult', 'crux'],
  },
];

// ── Combined knowledge base ────────────────────────────────────────────────

export const TECHNIQUES: Technique[] = [
  ...footwork,
  ...bodyPositioning,
  ...dynamic,
  ...principles,
  ...routeReading,
];

/**
 * Get techniques available at a given experience level.
 * A beginner-level technique is available to everyone.
 * An advanced technique is only available to advanced climbers.
 */
export function getTechniquesForLevel(level: Experience): Technique[] {
  const levelOrder: Experience[] = ['beginner', 'intermediate', 'advanced'];
  const levelIndex = levelOrder.indexOf(level);
  return TECHNIQUES.filter(
    (t) => levelOrder.indexOf(t.minLevel) <= levelIndex,
  );
}

/**
 * Find techniques that match a set of keywords (e.g., from hold configuration analysis).
 * Returns techniques sorted by relevance (number of keyword matches).
 */
export function findTechniquesByKeywords(
  keywords: string[],
  level: Experience,
): Technique[] {
  const available = getTechniquesForLevel(level);
  const scored = available.map((tech) => {
    const matches = keywords.filter((kw) =>
      tech.keywords.some((tk) => tk.includes(kw) || kw.includes(tk)),
    ).length;
    return { tech, matches };
  });
  return scored
    .filter((s) => s.matches > 0)
    .sort((a, b) => b.matches - a.matches)
    .map((s) => s.tech);
}

/**
 * Technique suggestions keyed by body type / height range.
 * Shorter climbers benefit more from certain techniques.
 */
export const HEIGHT_TECHNIQUE_MAP: Record<string, string[]> = {
  short: [
    'drop_knee',    // +10-15cm reach extension
    'high_step',    // turns height disadvantage into flexibility advantage
    'flagging',     // balance for off-center reaches
    'hip_drive',    // maximize reach through hip rotation
    'deadpoint',    // controlled dynamic for just-out-of-reach holds
  ],
  average: [
    'flagging',
    'drop_knee',
    'twist_lock',
    'straight_arms',
    'backstep',
  ],
  tall: [
    'straight_arms',  // long arms = more benefit from straight-arm rest
    'stemming',        // long legs = more stemming options
    'knee_bar',        // longer lever for knee bars
    'body_tension',    // longer body needs more tension on overhangs
    'backstep',
  ],
};

/**
 * Get height category based on climber height.
 * Based on global climbing population averages.
 */
export function getHeightCategory(heightCm: number): 'short' | 'average' | 'tall' {
  if (heightCm < 165) return 'short';
  if (heightCm > 180) return 'tall';
  return 'average';
}
