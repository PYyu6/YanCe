// ── Climber Profile ─────────────────────────────────────────────────────────

export interface ClimberProfile {
  height: number;         // cm
  armSpan: number;        // cm  (ape index = armSpan / height)
  grade: string;          // "V0"–"V10" or free text
  experience: Experience;
}

export type Experience = 'beginner' | 'intermediate' | 'advanced';

// Derived body measurements computed from the profile
export interface BodyMeasurements {
  standingReach: number;    // cm — how high hands reach while standing (≈ height × 1.25)
  armLength: number;        // cm — shoulder to fingertip (≈ armSpan × 0.44)
  legReach: number;         // cm — hip to toe (≈ height × 0.53)
  shoulderHeight: number;   // cm — ground to shoulder (≈ height × 0.82)
  hipHeight: number;        // cm — ground to hip (≈ height × 0.53)
  apeIndex: number;         // armSpan / height (>1 = long arms)
}

// ── Camera & Calibration ────────────────────────────────────────────────────

export interface CameraCheck {
  angle: CheckResult;       // perpendicular to wall
  level: CheckResult;       // not tilted sideways
  stability: CheckResult;   // not shaking
  blur: CheckResult;        // image sharp enough
  allGood: boolean;
}

export interface CheckResult {
  ok: boolean;
  value: number;            // measured value (degrees, variance, score)
  threshold: number;        // required threshold
  message: string;          // human-readable instruction
}

export type CalibrationMethod = 'a4paper' | 'body' | 'manual';

export interface CalibrationResult {
  method: CalibrationMethod;
  pixelsPerCm: number;           // conversion factor
  originPixel: { x: number; y: number }; // reference origin in image
  confidence: number;            // 0–1
}

// ── Hold Detection ──────────────────────────────────────────────────────────

/**
 * What the object is shaped like. This is intentionally separate from grip:
 * an edge is hold morphology, while full-crimp/open-hand describe how a person
 * chooses to use it. A single photograph can propose morphology; it cannot
 * reliably prove texture, incut depth, friction, or a particular climber's grip.
 */
export type HoldMorphology =
  | 'jug'
  | 'edge'
  | 'sloper'
  | 'pinch'
  | 'pocket'
  | 'volume'
  | 'foothold'
  | 'unknown';

/** Context-dependent ways a climber may use a detected shape. */
export type GripTechnique =
  | 'open_hand'
  | 'half_crimp'
  | 'full_crimp'
  | 'pinch'
  | 'pocket'
  | 'press'
  | 'unknown';

/**
 * Provenance is required product data. An unreviewed vision result must remain
 * visibly different from a person-confirmed label throughout planning and UI.
 */
export type HoldLabelSource =
  | 'fixture_proposal'
  | 'vision_proposal'
  | 'human_confirmed'
  | 'manual_unknown';

export interface HoldLabel {
  morphology: HoldMorphology;
  /** Possible uses, never an instruction to load fingers in a particular way. */
  compatibleGrips: GripTechnique[];
  /** 0–1 confidence in the visible-shape proposal, not in move safety. */
  confidence: number;
  source: HoldLabelSource;
  /** Important facts the image cannot establish, shown beside the proposal. */
  limitations: string[];
}

export interface DetectedHold {
  id: string;
  pixelCenter: Point;            // center in image coordinates
  worldCenter: Point;            // center in real-world cm (from bottom-left of wall)
  pixelRadius: number;           // approximate size in pixels
  color: string;                 // hex color of the hold
  routeColor: string;            // which route color group it belongs to
  isStart: boolean;
  isTop: boolean;
  manuallyAdded: boolean;        // user added/corrected this hold
  /** Optional because classic color segmentation cannot infer hold morphology. */
  holdLabel?: HoldLabel;
  /**
   * Optional route annotation kept separate from hold morphology. “Step 2”
   * describes a path position; “edge” describes visible shape. Conflating the
   * two produced the original ambiguous numbered markers in the video demo.
   */
  routeAnnotation?: RouteHoldAnnotation;
}

export interface Point {
  x: number;
  y: number;
}

// ── Strategy Engine ─────────────────────────────────────────────────────────

export type Limb = 'leftHand' | 'rightHand' | 'leftFoot' | 'rightFoot';

export type ReachDifficulty = 'easy' | 'moderate' | 'limit' | 'dynamic' | 'unreachable';

export interface Move {
  step: number;
  limb: Limb;
  fromHoldId: string | null;     // null = starting position
  toHoldId: string;
  reachDistance: number;          // cm between current position and target
  difficulty: ReachDifficulty;
  technique: string | null;      // technique ID from knowledge base
  tip: string;                   // human-readable tip for this move
}

export interface Beta {
  id: string;
  name: string;                  // "Standard", "Tall Beta", "Power Beta"
  description: string;
  moves: Move[];
  overallDifficulty: number;     // 0–10
  suitability: number;           // 0–1 (how well it matches this climber)
  cruxSteps: number[];           // indices of hardest moves
  restSteps: number[];           // indices of rest opportunities
}

export interface RouteAnalysis {
  holds: DetectedHold[];
  calibration: CalibrationResult;
  climber: ClimberProfile;
  measurements: BodyMeasurements;
  betas: Beta[];
  reachMap: Record<string, ReachDifficulty>; // holdId → difficulty from start
}

// ── Climbing rules, body state, and objective-aware guidance ────────────────

/**
 * Route membership is a gym/competition rule, not a universal color law.
 * `same_color` supports common gym setting; the other modes require explicit
 * route metadata because pixels alone cannot know the setter's intended rules.
 */
export type RouteMarkingPolicy =
  | 'same_color'
  | 'tape_marked'
  | 'explicit_hold_ids'
  | 'competition_distinctive';

/** Wall policies differ on whether unmarked volumes are usable. */
export type VolumeUsePolicy =
  | 'all_volumes'
  | 'route_volumes_only'
  | 'no_volumes';

export interface RouteRuleSet {
  markingPolicy: RouteMarkingPolicy;
  routeColor: string;
  /** Setter-, gym-, or user-confirmed route membership. */
  allowedHoldIds: string[];
  volumePolicy: VolumeUsePolicy;
}

export interface RouteMembershipDecision {
  holdId: string;
  allowed: boolean;
  /** Plain-language evidence suitable for a correction screen or receipt. */
  basis: string;
  /** True when route metadata, tape meaning, or volume policy is unresolved. */
  needsConfirmation: boolean;
}

/** A hold can be on the main path, an optional feature, or explicitly off it. */
export type RouteHoldRole = 'start' | 'move' | 'top' | 'optional' | 'off_route';

/**
 * Route order is declared independently of detection. `order` is required only
 * for start/move/top holds. Fixture annotations must never be displayed as if
 * a vision model or coach verified them.
 */
export interface RouteHoldAnnotation {
  role: RouteHoldRole;
  order: number | null;
  onDeclaredPath: boolean;
  source: 'fixture_proposal' | 'vision_proposal' | 'human_confirmed';
  explanation: string;
}

/** Plain presentation record used by overlays, legends, and exported HTML. */
export interface RoutePathStep {
  holdId: string;
  order: number;
  role: Extract<RouteHoldRole, 'start' | 'move' | 'top'>;
  morphology: HoldMorphology;
  /** True only when both the route position and hold shape were confirmed. */
  verified: boolean;
  displayLabel: string;
}

/**
 * These names describe coaching intent without claiming video can measure
 * calories, tendon load, or injury risk. `conserve_forearms` is a proxy goal,
 * not a promise of the physiologically least-energy path.
 */
export type CoachingObjective =
  | 'conserve_forearms'
  | 'technique_practice'
  | 'power_training';

/**
 * Crouching is not automatically inefficient: it may be a useful loading phase
 * before leg drive. Phase lets coaching distinguish a stable rest from loading
 * and movement rather than scoring one frozen posture as universally good/bad.
 */
export type MovementPhase = 'stable' | 'loading' | 'moving';

export interface MovementPhaseObservation {
  phase: MovementPhase;
  /** 0 = straight, 1 = deeply bent; upstream pose estimate may be uncertain. */
  kneeFlexion: number;
  /** 0 = arms extended, 1 = strongly bent. */
  elbowFlexion: number;
  /** 0–1 support-polygon proxy; it is not a fall-probability estimate. */
  supportMargin: number;
}

export interface MovementPhaseExplanation {
  phase: MovementPhase;
  headline: string;
  coachingCue: string;
  caveat: string;
}

/**
 * Model-independent evidence for one possible next move. All normalized values
 * must be clipped to 0–1 by adapters. `dynamicRequired` is a planning warning;
 * the engine never interprets it as proof that a move is safe to attempt.
 */
export interface MoveCandidateEvidence {
  id: string;
  targetHoldId: string;
  targetMorphology: HoldMorphology;
  reachRatio: number;
  elbowFlexion: number;
  supportMargin: number;
  legDriveOpportunity: number;
  techniqueNovelty: number;
  dynamicRequired: boolean;
}

export interface RankedMoveCandidate extends MoveCandidateEvidence {
  objective: CoachingObjective;
  score: number;
  reasons: string[];
  /** Scientific/product limits that must travel with the recommendation. */
  limitations: string[];
  rejected: boolean;
}

/**
 * Pure decision seam shared by recorded tests and a future multimodal adapter.
 * Camera/pose code supplies observations; this engine applies declared route
 * rules and user intent. Voice is only an output channel and must not own logic.
 */
export interface ClimbingIntelligenceEngine {
  evaluateRouteMembership(
    hold: DetectedHold,
    rules: RouteRuleSet,
  ): RouteMembershipDecision;
  rankMoves(
    candidates: MoveCandidateEvidence[],
    objective: CoachingObjective,
  ): RankedMoveCandidate[];
  explainMovementPhase(
    observation: MovementPhaseObservation,
  ): MovementPhaseExplanation;
  /** Returns only the declared path, sorted by explicit route order. */
  buildRoutePath(holds: DetectedHold[]): RoutePathStep[];
}

// ── Contact-aware live coaching contract ───────────────────────────────────

/**
 * The live-coach MVP reasons about a climber as four simultaneous contacts,
 * not as a single path cursor moving from hold to hold. Keeping the contact
 * contract in the shared types file makes an important architectural boundary
 * explicit: pose tracking may PROPOSE a contact, but only the state machine
 * may CONFIRM it and only the planner may turn it into a suggestion.
 */
export type ContactSource = 'recorded_fixture' | 'live_pose' | 'manual';

export interface LimbContact {
  limb: Limb;
  holdId: string;
  /** 0–1 confidence belongs to the observation, not to physical safety. */
  confidence: number;
  source: ContactSource;
}

/** One confirmed hold per limb. This is the planner's starting state. */
export type ContactState = Record<Limb, LimbContact>;

/**
 * A contact observation remains separate from ContactState until confirmed.
 * That separation prevents a momentary wrist/toe overlap from silently
 * poisoning every downstream recommendation.
 */
export interface ProposedContact {
  limb: Limb;
  fromHoldId: string;
  toHoldId: string;
  confidence: number;
  dwellMs: number;
  source: ContactSource;
  /** Identifies whether this came from the auditable baseline or a later model. */
  estimator: ContactEstimatorKind;
  /** Inputs shown to users so uncertainty is inspectable, not a mystery score. */
  evidence: TemporalContactEstimate['evidence'];
}

export interface PlannerSuggestion {
  limb: Limb;
  toHoldId: string;
  reachDistance: number;
  confidence: number;
  reason: string;
}

export type LiveCoachPhase = 'watching' | 'uncertain' | 'replanned';

// ── P1: temporal contact-estimation contract ─────────────────────────────

/**
 * This contract sits between pose/hold tracking and the live-coach state
 * machine. A single video frame is never enough to confirm contact: the same
 * limb must remain near the same hold, move slowly, and stay visible for a
 * minimum time. The estimator may only PROPOSE a contact. User confirmation
 * or a later, separately validated policy is still required to confirm it.
 */
export type ContactEstimatorKind = 'time_based_baseline' | 'trained_model';

/** Raw, model-independent evidence for one limb in one ordered frame. */
export interface ContactFrameObservation {
  /** Monotonic trace time. Wall-clock time must not be used for dwell. */
  timestampMs: number;
  limb: Limb;
  /** Nearest compatible hold, or null when no candidate is close enough. */
  holdId: string | null;
  /** Fraction of the limb contact zone overlapping the candidate hold, 0–1. */
  overlapRatio: number;
  /** Image-plane speed after smoothing; calibration is not assumed here. */
  speedPxPerSecond: number;
  /** Keypoint visibility supplied by the upstream pose adapter, 0–1. */
  visibility: number;
}

export type TemporalContactDecision = 'tracking' | 'propose' | 'release';

/**
 * Explainable output consumed by the state machine and receipt. Probability
 * is observation confidence only; it is never a claim that a move is safe.
 */
export interface TemporalContactEstimate {
  limb: Limb;
  holdId: string | null;
  probability: number;
  /** Continuous time spent on this same valid candidate hold. */
  dwellMs: number;
  decision: TemporalContactDecision;
  estimator: ContactEstimatorKind;
  evidence: Pick<
    ContactFrameObservation,
    'overlapRatio' | 'speedPxPerSecond' | 'visibility'
  >;
}

/** Thresholds are injected so tests, recorded traces, and later tuning agree. */
export interface TemporalContactConfig {
  minOverlapRatio: number;
  maxSpeedPxPerSecond: number;
  minVisibility: number;
  minDwellMs: number;
  /** Time without valid evidence before an existing candidate is released. */
  releaseGraceMs: number;
  proposalProbability: number;
}

/** Replaceable estimator seam: UI and planner must not depend on its internals. */
export interface TemporalContactEstimator {
  observe(observation: ContactFrameObservation): TemporalContactEstimate;
  /** Reset one limb after a cut/occlusion, or all limbs for a new session. */
  reset(limb?: Limb): void;
}

/** One labeled example for deterministic offline quality checks. */
export interface ContactEvaluationExample {
  limb: Limb;
  expectedContact: boolean;
  proposedContact: boolean;
}

export interface ContactEvaluationMetrics {
  total: number;
  truePositive: number;
  falsePositive: number;
  trueNegative: number;
  falseNegative: number;
  precision: number;
  recall: number;
  f1: number;
}

/**
 * Evaluation always includes per-limb results. Feet are commonly less visible
 * than hands, so one combined score could otherwise hide a broken foot model.
 */
export interface ContactEstimatorEvaluation extends ContactEvaluationMetrics {
  byLimb: Record<Limb, ContactEvaluationMetrics>;
}

// ── P1: Beta Receipt + Replay contract ─────────────────────────────────────

/**
 * The source of a label is part of the product data, not a footnote. A
 * hand-authored demo label can exercise YanCe's data flow but cannot measure
 * vision accuracy. Published ground truth may be used for accuracy only when
 * its annotation protocol and license are also recorded.
 */
export type SampleAnnotationKind = 'hand_authored_demo' | 'published_ground_truth';

export interface SampleMediaLicense {
  name: string;
  url: string;
  creator: string;
  sourceUrl: string;
  /** True only when the stored media bytes were edited or excerpted. */
  modified: boolean;
}

export interface SampleContactLabel {
  limb: Limb;
  holdId: string;
  startMs: number;
  endMs: number;
  annotationKind: SampleAnnotationKind;
  /** Human-readable limitation shown beside the video. */
  note: string;
}

/**
 * A locally reproducible public-media sample. `observations` are deliberately
 * separate from the media file: unless annotationKind is published ground
 * truth, implementations must never imply they were extracted by a model.
 */
export interface LicensedClimbingVideoSample {
  id: string;
  title: string;
  mediaPath: string;
  durationMs: number;
  dimensions: { width: number; height: number };
  license: SampleMediaLicense;
  labels: SampleContactLabel[];
  observations: ContactFrameObservation[];
  /** A larger research dataset suitable for later accuracy evaluation. */
  groundTruthDataset: {
    name: string;
    url: string;
    note: string;
  };
}

export interface SampleContactRun {
  sampleId: string;
  estimates: TemporalContactEstimate[];
  finalEstimate: TemporalContactEstimate;
}

/**
 * Receipt events describe decisions, not raw sensor frames. This vocabulary is
 * deliberately small and product-facing: each event must answer “what changed
 * and why?” without exposing pose-library internals or pretending an
 * observation is already confirmed.
 */
export type BetaReceiptEventType =
  | 'session_started'
  | 'contact_observed'
  | 'contact_confirmed'
  | 'contact_rejected'
  | 'suggestion_invalidated'
  | 'suggestion_created';

/**
 * A replay frame is the exact structured state the user should be able to
 * inspect later. Contacts and suggestion are snapshotted at event creation;
 * implementations must never retain a mutable reference to the live session.
 */
export interface BetaReceiptSnapshot {
  contacts: ContactState;
  suggestion: PlannerSuggestion;
}

export interface BetaReceiptEvent {
  /** Stable within one receipt and suitable for React keys/export. */
  id: string;
  /** Zero-based monotonic order; the UI must not infer ordering from labels. */
  order: number;
  /** Deterministic session-relative time, not a wall-clock or video timestamp. */
  elapsedMs: number;
  type: BetaReceiptEventType;
  title: string;
  detail: string;
  /** Observation/planner confidence when meaningful; never “safety confidence.” */
  confidence?: number;
  snapshot: BetaReceiptSnapshot;
}

/**
 * The receipt is intentionally privacy-minimal. It records structured contacts
 * and decisions, while the explicit media flags let UI/tests prove that the
 * P1 fixture did not silently retain video or audio. A future real capture flow
 * may link separately consented media; it must not change these defaults.
 */
export interface BetaReceipt {
  id: string;
  source: ContactSource;
  events: BetaReceiptEvent[];
  replanCount: number;
  correctionCount: number;
  privacy: {
    rawVideoStored: false;
    rawAudioStored: false;
  };
}

export interface LiveCoachSession {
  phase: LiveCoachPhase;
  source: ContactSource;
  contacts: ContactState;
  proposedContact: ProposedContact | null;
  previousSuggestion: PlannerSuggestion;
  activeSuggestion: PlannerSuggestion;
  eventLabel: string;
  /** Immutable audit/replay history for the P1 Beta Receipt UI. */
  receipt: BetaReceipt;
}

// ── Technique Knowledge Base ────────────────────────────────────────────────

export type TechniqueCategory =
  | 'footwork'
  | 'handhold'
  | 'body_position'
  | 'dynamic'
  | 'movement_principle'
  | 'route_reading';

export interface Technique {
  id: string;
  name: string;                  // English name
  nameCn: string;                // Chinese name
  category: TechniqueCategory;
  description: string;           // what it is
  whenToUse: string;             // when the engine should suggest it
  howTo: string;                 // brief instruction
  minLevel: Experience;          // minimum experience to suggest
  reachBenefit: number;          // 0–1, how much extra reach it provides
  energySaving: number;          // 0–1, how much energy it saves
  keywords: string[];            // triggers for the advisor
}

// ── App State ───────────────────────────────────────────────────────────────

export type AppStep =
  | 'profile'        // 1. Enter body measurements
  | 'camera'         // 2. Position camera
  | 'calibrate'      // 3. Calibrate scale
  | 'detect'         // 4. Detect holds
  | 'analyze'        // 5. View analysis & beta
  ;

export interface AppState {
  step: AppStep;
  profile: ClimberProfile | null;
  capturedImage: string | null;    // data URL of wall photo
  imageSize: { width: number; height: number } | null;
  calibration: CalibrationResult | null;
  holds: DetectedHold[];
  selectedRouteColor: string | null;
  analysis: RouteAnalysis | null;
  currentBetaIndex: number;
  currentMoveStep: number;
}
