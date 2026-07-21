/**
 * Testable product slice for hold taxonomy, route rules, body phase, user
 * objectives, and contact-triggered replanning.
 *
 * The overlay uses disclosed fixture labels on the same licensed public video
 * as the sample lab. Nothing in this component claims the labels came from the
 * pixels. Its purpose is to make the desired interaction concrete while the
 * real pose/hold adapters remain replaceable behind typed interfaces.
 */
import { useMemo, useRef, useState } from 'react';
import {
  CoachingObjective,
  DetectedHold,
  HoldLabel,
  HoldMorphology,
  MoveCandidateEvidence,
  MovementPhase,
  RouteMarkingPolicy,
  RouteRuleSet,
} from '../types';
import {
  buildRoutePath,
  evaluateRouteMembership,
  explainMovementPhase,
  rankMoves,
} from '../engine/climbingIntelligence';

type DemoHold = DetectedHold & {
  /** 1–3 are route order; X and V are explicitly not route steps. */
  marker: '1' | '2' | '3' | 'X' | 'V';
  screen: { x: number; y: number };
};

const MORPHOLOGY_NAMES: Record<HoldMorphology, string> = {
  jug: 'Jug',
  edge: 'Edge',
  sloper: 'Sloper',
  pinch: 'Pinch',
  pocket: 'Pocket',
  volume: 'Volume',
  foothold: 'Foothold',
  unknown: 'Unknown',
};

const GRIPS: Record<HoldMorphology, HoldLabel['compatibleGrips']> = {
  jug: ['open_hand'],
  edge: ['open_hand', 'half_crimp', 'full_crimp'],
  sloper: ['open_hand', 'press'],
  pinch: ['pinch'],
  pocket: ['pocket'],
  volume: ['press', 'open_hand'],
  foothold: ['press'],
  unknown: ['unknown'],
};

const INITIAL_HOLDS: DemoHold[] = [
  {
    id: 'off-color', marker: 'X', screen: { x: 79, y: 53 },
    pixelCenter: { x: 174, y: 522 }, worldCenter: { x: 42, y: 128 }, pixelRadius: 22,
    color: '#f472b6', routeColor: '#f472b6', isStart: false, isTop: false, manuallyAdded: false,
    holdLabel: { morphology: 'unknown', compatibleGrips: ['unknown'], confidence: 0, source: 'manual_unknown', limitations: ['Fixture label is unresolved.'] },
    routeAnnotation: { role: 'off_route', order: null, onDeclaredPath: false, source: 'fixture_proposal', explanation: 'Off-route example used to test the selected gym rule.' },
  },
  {
    id: 'jug-4', marker: '1', screen: { x: 53, y: 61 },
    pixelCenter: { x: 348, y: 630 }, worldCenter: { x: 84, y: 92 }, pixelRadius: 25,
    color: '#2dd4bf', routeColor: '#2dd4bf', isStart: true, isTop: false, manuallyAdded: false,
    holdLabel: { morphology: 'jug', compatibleGrips: ['open_hand'], confidence: 0, source: 'fixture_proposal', limitations: ['Fixture proposal; depth and texture are unknown.'] },
    routeAnnotation: { role: 'start', order: 1, onDeclaredPath: true, source: 'fixture_proposal', explanation: 'Manually placed demonstration start; not extracted from the video.' },
  },
  {
    id: 'edge-7', marker: '2', screen: { x: 68, y: 45 },
    pixelCenter: { x: 384, y: 405 }, worldCenter: { x: 92, y: 170 }, pixelRadius: 18,
    color: '#2dd4bf', routeColor: '#2dd4bf', isStart: false, isTop: false, manuallyAdded: false,
    holdLabel: { morphology: 'edge', compatibleGrips: ['open_hand', 'half_crimp', 'full_crimp'], confidence: 0, source: 'fixture_proposal', limitations: ['Fixture proposal; edge depth is unknown.'] },
    routeAnnotation: { role: 'move', order: 2, onDeclaredPath: true, source: 'fixture_proposal', explanation: 'Manually placed demonstration move; not extracted from the video.' },
  },
  {
    id: 'sloper-9', marker: '3', screen: { x: 39, y: 40 },
    pixelCenter: { x: 252, y: 252 }, worldCenter: { x: 60, y: 228 }, pixelRadius: 29,
    color: '#2dd4bf', routeColor: '#2dd4bf', isStart: false, isTop: true, manuallyAdded: false,
    holdLabel: { morphology: 'sloper', compatibleGrips: ['open_hand', 'press'], confidence: 0, source: 'fixture_proposal', limitations: ['Fixture proposal; friction and direction are unknown.'] },
    routeAnnotation: { role: 'top', order: 3, onDeclaredPath: true, source: 'fixture_proposal', explanation: 'Manually placed demonstration top; not extracted from the video.' },
  },
  {
    id: 'volume-2', marker: 'V', screen: { x: 55, y: 18 },
    pixelCenter: { x: 432, y: 216 }, worldCenter: { x: 104, y: 240 }, pixelRadius: 48,
    color: '#94a3b8', routeColor: '#94a3b8', isStart: false, isTop: false, manuallyAdded: false,
    holdLabel: { morphology: 'volume', compatibleGrips: ['press', 'open_hand'], confidence: 0, source: 'fixture_proposal', limitations: ['Fixture proposal; gym volume rule is unknown.'] },
    routeAnnotation: { role: 'optional', order: null, onDeclaredPath: false, source: 'fixture_proposal', explanation: 'Optional volume example; the gym rule decides whether it is usable.' },
  },
];

const MOVE_CANDIDATES: MoveCandidateEvidence[] = [
  { id: 'quiet-jug', targetHoldId: 'jug-4', targetMorphology: 'jug', reachRatio: 0.52, elbowFlexion: 0.15, supportMargin: 0.88, legDriveOpportunity: 0.9, techniqueNovelty: 0.12, dynamicRequired: false },
  { id: 'flag-edge', targetHoldId: 'edge-7', targetMorphology: 'edge', reachRatio: 0.68, elbowFlexion: 0.32, supportMargin: 0.72, legDriveOpportunity: 0.62, techniqueNovelty: 0.96, dynamicRequired: false },
  { id: 'high-sloper', targetHoldId: 'sloper-9', targetMorphology: 'sloper', reachRatio: 0.88, elbowFlexion: 0.52, supportMargin: 0.58, legDriveOpportunity: 0.84, techniqueNovelty: 0.7, dynamicRequired: true },
  { id: 'out-of-range', targetHoldId: 'edge-12', targetMorphology: 'edge', reachRatio: 1.08, elbowFlexion: 0.7, supportMargin: 0.2, legDriveOpportunity: 0.3, techniqueNovelty: 0.8, dynamicRequired: true },
];

const MOVE_NAMES: Record<string, string> = {
  'quiet-jug': 'Quiet jug reset',
  'flag-edge': 'Flag-and-edge practice',
  'high-sloper': 'High sloper drive',
  'out-of-range': 'Out-of-range edge',
};

const OBJECTIVES: Array<{ id: CoachingObjective; name: string; description: string }> = [
  { id: 'conserve_forearms', name: 'Conserve forearms', description: 'Prefer lower reach, straighter-arm and leg-drive proxies.' },
  { id: 'technique_practice', name: 'Practice technique', description: 'Prefer novel movement with a moderate challenge.' },
  { id: 'power_training', name: 'Power session', description: 'Prefer demanding reach and leg drive, with dynamic moves disclosed.' },
];

const POLICIES: Array<{ id: RouteMarkingPolicy; name: string }> = [
  { id: 'same_color', name: 'Same color' },
  { id: 'explicit_hold_ids', name: 'Confirmed list' },
  { id: 'tape_marked', name: 'Tape marked' },
  { id: 'competition_distinctive', name: 'Competition marks' },
];

const PHASES: MovementPhase[] = ['stable', 'loading', 'moving'];

function sourceName(label: HoldLabel): string {
  if (label.source === 'human_confirmed') return 'Human confirmed';
  if (label.source === 'fixture_proposal') return 'Fixture proposal · not a model score';
  if (label.source === 'vision_proposal') return `Vision proposal · ${Math.round(label.confidence * 100)}%`;
  return 'Needs a person';
}

function routeRoleName(hold: DemoHold): string {
  return hold.routeAnnotation?.role === 'start'
    ? 'Route start'
    : hold.routeAnnotation?.role === 'move'
      ? 'Next route hold'
      : hold.routeAnnotation?.role === 'top'
        ? 'Proposed top'
        : hold.routeAnnotation?.role === 'optional'
          ? 'Optional volume'
          : 'Off-route example';
}

export default function ClimbingIntelligenceLab() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [holds, setHolds] = useState(INITIAL_HOLDS);
  const [activeHoldId, setActiveHoldId] = useState('jug-4');
  // This particular public clip visibly uses tape/marking near holds, so tape
  // is a more honest default than pretending all route holds share one color.
  const [policy, setPolicy] = useState<RouteMarkingPolicy>('tape_marked');
  const [objective, setObjective] = useState<CoachingObjective>('conserve_forearms');
  const [phase, setPhase] = useState<MovementPhase>('stable');
  const [contactConfirmed, setContactConfirmed] = useState(false);

  const activeHold = holds.find((hold) => hold.id === activeHoldId) ?? holds[0];
  const rules: RouteRuleSet = {
    markingPolicy: policy,
    routeColor: '#2dd4bf',
    // Tape mode contains only the demonstrated path. Explicit-list mode adds X
    // to prove confirmed setter/person metadata can override a visual guess.
    allowedHoldIds: policy === 'explicit_hold_ids'
      ? ['off-color', 'jug-4', 'edge-7', 'sloper-9']
      : ['jug-4', 'edge-7', 'sloper-9'],
    volumePolicy: 'route_volumes_only',
  };
  const routeDecision = evaluateRouteMembership(activeHold, rules);
  const routePath = buildRoutePath(holds);
  const rankedMoves = useMemo(() => rankMoves(MOVE_CANDIDATES, objective), [objective]);
  const displayedMove = rankedMoves[contactConfirmed ? 1 : 0];
  const phaseExplanation = explainMovementPhase({
    phase,
    kneeFlexion: phase === 'loading' ? 0.8 : phase === 'moving' ? 0.48 : 0.28,
    elbowFlexion: phase === 'stable' ? 0.25 : 0.38,
    supportMargin: phase === 'moving' ? 0.48 : 0.76,
  });

  const jumpToSample = () => {
    if (!videoRef.current) return;
    videoRef.current.pause();
    videoRef.current.currentTime = 21;
  };

  const confirmMorphology = (morphology: HoldMorphology) => {
    setHolds((current) => current.map((hold) => hold.id === activeHoldId ? {
      ...hold,
      holdLabel: {
        morphology,
        compatibleGrips: GRIPS[morphology],
        confidence: 1,
        source: 'human_confirmed',
        limitations: ['Visual confirmation still cannot measure friction, depth, or force.'],
      },
    } : hold));
  };

  const activeRole = routeRoleName(activeHold);
  const routeDecisionTitle = routeDecision.allowed
    ? 'Allowed'
    : routeDecision.needsConfirmation
      ? 'Needs confirmation'
      : 'Not on route';

  return (
    <main data-testid="climbing-intelligence-lab" className="min-h-screen bg-rock-900 text-rock-100">
      <div data-testid="classic-style-lab" className="border-b border-rock-700 bg-rock-900">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-2xl font-bold text-rock-100">岩策 <span className="text-rock-400">YánCè</span></div>
              <p className="text-sm text-rock-300">Rock Climbing Strategy Assistant</p>
            </div>
            <a href="/?mode=classic" className="rounded-lg bg-rock-800 px-4 py-2 text-sm font-medium text-rock-200 hover:bg-rock-700">Back to classic setup</a>
          </div>
          <div className="mt-6 max-w-3xl">
            <div className="text-xs font-bold uppercase tracking-[0.15em] text-rock-400">Climbing intelligence preview</div>
            <h1 className="mt-1 text-3xl font-bold sm:text-4xl">Your climbing map</h1>
            <p className="mt-2 text-sm leading-relaxed text-rock-200">The marker tells you three separate things: <b>route order</b>, a <b>proposed visible shape</b>, and whether a person has <b>confirmed</b> it. The route and type are never hidden behind an unexplained number.</p>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-6xl gap-5 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(350px,.82fr)_minmax(520px,1.18fr)]">
        <section className="space-y-4">
          <div className="rounded-xl border border-rock-700 bg-rock-800/45 p-4 shadow-xl shadow-black/20">
            <div className="relative mx-auto max-w-[430px] overflow-hidden rounded-lg bg-black">
              <video ref={videoRef} src="/samples/indoor-bouldering-v3-rock-spot.webm" controls muted playsInline preload="metadata" onLoadedMetadata={jumpToSample} className="aspect-[9/16] max-h-[72vh] w-full object-contain" />
              <div className="absolute left-2 top-2 rounded bg-black/70 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-white/80">Manually placed demo labels</div>
              <div className="pointer-events-none absolute inset-0">
                {holds.map((hold) => (
                  <button
                    key={hold.id}
                    data-testid={`hold-marker-${hold.id}`}
                    aria-label={`Select ${routeRoleName(hold)} ${MORPHOLOGY_NAMES[hold.holdLabel?.morphology ?? 'unknown']}`}
                    onClick={() => setActiveHoldId(hold.id)}
                    className={`pointer-events-auto absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full border px-1.5 py-1 pr-2 text-left shadow-lg transition-transform hover:scale-105 ${activeHoldId === hold.id ? 'border-rock-200 bg-rock-400 text-white ring-4 ring-rock-300/35' : 'border-white/70 bg-black/75 text-white'}`}
                    style={{ left: `${hold.screen.x}%`, top: `${hold.screen.y}%` }}
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-black text-rock-900">{hold.marker}</span>
                    <span className="leading-none">
                      <span className="block text-[8px] font-bold uppercase tracking-wide text-white/65">
                        {hold.routeAnnotation?.role === 'start' ? 'Start' : hold.routeAnnotation?.role === 'move' ? 'Next' : hold.routeAnnotation?.role === 'top' ? 'Top' : hold.routeAnnotation?.role === 'optional' ? 'Optional' : 'Off route'}
                      </span>
                      <b className="text-[10px]">{MORPHOLOGY_NAMES[hold.holdLabel?.morphology ?? 'unknown']}*</b>
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div data-testid="route-path-legend" className="mt-3 grid grid-cols-3 gap-2">
              {routePath.map((step) => (
                <button key={step.holdId} onClick={() => setActiveHoldId(step.holdId)} className="rounded-lg bg-rock-900/45 p-2 text-left text-[10px] font-semibold leading-snug text-rock-100 hover:bg-rock-700">
                  {step.displayLabel}
                </button>
              ))}
            </div>
            <div data-testid="marker-key" className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-rock-300">
              <span><b>1–3</b> = proposed path order</span><span><b>X</b> = off-route example</span><span><b>V</b> = optional volume</span><span><b>*</b> = not verified from pixels</span>
            </div>
            <div data-testid="video-truth" className="mt-3 rounded-lg border border-yellow-600/40 bg-yellow-950/25 p-3 text-xs leading-relaxed text-yellow-100">
              <b>What is real:</b> this open Wikimedia video was <b>not generated by YanCe</b>. The route positions and hold types are transparent fixture data—manually placed product examples, not labels extracted from these pixels and not ground truth. A real model must propose them and a person must correct uncertain shapes.
            </div>
          </div>

          <div className="rounded-xl border border-rock-700 bg-rock-800/45 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.15em] text-rock-400">01 · Correct the visible shape</div>
                <h2 className="mt-1 text-xl font-bold">{activeHold.marker} · {activeRole}</h2>
              </div>
              <div data-testid="active-hold-label" className="rounded-lg bg-rock-900/45 px-3 py-2 text-right">
                <div className="font-bold text-rock-100">{MORPHOLOGY_NAMES[activeHold.holdLabel?.morphology ?? 'unknown']}</div>
                <div className="text-[11px] text-rock-300">{sourceName(activeHold.holdLabel!)}</div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-4 gap-2">
              {(['jug', 'edge', 'sloper', 'pinch', 'pocket', 'volume', 'foothold', 'unknown'] as HoldMorphology[]).map((morphology) => (
                <button key={morphology} data-testid={`label-${morphology}`} onClick={() => confirmMorphology(morphology)} className="rounded-lg bg-rock-800 px-2 py-2.5 text-xs font-medium text-rock-200 hover:bg-rock-700">
                  {MORPHOLOGY_NAMES[morphology]}
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs leading-relaxed text-rock-300">
              <b className="text-rock-100">Shape is not grip.</b> An edge may permit open hand, half crimp, or full crimp. This distant frame cannot verify depth, texture, or direction, so “Jug / Edge / Sloper” remains a proposal until someone confirms it.
            </p>
          </div>
        </section>

        <section className="space-y-4">
          <div className="rounded-xl border border-rock-700 bg-rock-800/45 p-5">
            <div className="text-xs font-bold uppercase tracking-[0.15em] text-rock-400">02 · Declare the route rule</div>
            <h2 className="mt-1 text-2xl font-bold">Color is one policy—not the law</h2>
            <p className="mt-2 text-xs leading-relaxed text-rock-300">This clip visibly uses colored tape/marking near holds, so <b className="text-rock-100">Tape marked</b> is the honest default. Same-color is available for gyms that actually use it. A setter-confirmed list can override appearance.</p>
            <div className="mt-4 grid gap-2 sm:grid-cols-4">
              {POLICIES.map((item) => (
                <button key={item.id} data-testid={`policy-${item.id}`} onClick={() => setPolicy(item.id)} className={`rounded-lg px-3 py-3 text-xs font-medium ${policy === item.id ? 'bg-rock-400 text-white' : 'bg-rock-800 text-rock-200 hover:bg-rock-700'}`}>
                  {item.name}
                </button>
              ))}
            </div>
            <div data-testid="route-decision" className={`mt-4 rounded-lg border p-4 ${routeDecision.allowed ? 'border-green-600/40 bg-green-950/25 text-green-100' : 'border-yellow-600/40 bg-yellow-950/25 text-yellow-100'}`}>
              <b>{routeDecisionTitle}</b> · {routeDecision.basis}
              {routeDecision.needsConfirmation && <div className="mt-1 text-xs">A person or setter must confirm the marking.</div>}
            </div>
          </div>

          <div className="rounded-xl border border-rock-700 bg-rock-800/45 p-5">
            <div className="text-xs font-bold uppercase tracking-[0.15em] text-rock-400">03 · Choose what “best” means</div>
            <h2 className="mt-1 text-2xl font-bold">One wall, three useful routes</h2>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {OBJECTIVES.map((item) => (
                <button key={item.id} data-testid={`objective-${item.id}`} onClick={() => { setObjective(item.id); setContactConfirmed(false); }} className={`rounded-lg p-3 text-left ${objective === item.id ? 'bg-rock-400 text-white' : 'bg-rock-800 text-rock-100 hover:bg-rock-700'}`}>
                  <div className="text-sm font-bold">{item.name}</div>
                  <div className={`mt-1 text-[11px] leading-relaxed ${objective === item.id ? 'text-rock-50' : 'text-rock-300'}`}>{item.description}</div>
                </button>
              ))}
            </div>
            <div className="mt-4 rounded-lg bg-rock-900/45 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs font-bold uppercase tracking-[0.14em] text-rock-400">Suggested next</div>
                  <div data-testid="top-move-name" className="mt-1 text-2xl font-bold">{MOVE_NAMES[displayedMove.id]}</div>
                </div>
                <div className="rounded-full bg-rock-400 px-3 py-1 text-sm font-bold text-white">{Math.round(displayedMove.score * 100)}</div>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-rock-200">{displayedMove.reasons[0]}</p>
              <p className="mt-2 text-[11px] leading-relaxed text-rock-400">{displayedMove.limitations[0]}</p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-rock-700 bg-rock-800/45 p-5">
              <div className="text-xs font-bold uppercase tracking-[0.15em] text-rock-400">04 · Read a sequence</div>
              <h2 className="mt-1 text-xl font-bold">Crouch, load, move</h2>
              <div className="mt-3 flex gap-2">
                {PHASES.map((item) => (
                  <button key={item} data-testid={`phase-${item}`} onClick={() => setPhase(item)} className={`flex-1 rounded-lg px-2 py-2 text-xs font-medium capitalize ${phase === item ? 'bg-rock-400 text-white' : 'bg-rock-800 text-rock-200 hover:bg-rock-700'}`}>{item}</button>
                ))}
              </div>
              <div data-testid="phase-explanation" className="mt-4 text-sm leading-relaxed text-rock-200">
                <b className="text-rock-100">{phaseExplanation.headline}</b>
                <p className="mt-1">{phaseExplanation.coachingCue}</p>
                <p className="mt-2 text-xs text-rock-400">{phaseExplanation.caveat}</p>
              </div>
            </div>

            <div className="rounded-xl border border-rock-700 bg-rock-800/45 p-5">
              <div className="text-xs font-bold uppercase tracking-[0.15em] text-rock-400">05 · Update after contact</div>
              <h2 className="mt-1 text-xl font-bold">Observe → confirm → replan</h2>
              <div data-testid="live-update" className="mt-4 min-h-[94px] rounded-lg bg-rock-900/45 p-3 text-sm leading-relaxed text-rock-200">
                {contactConfirmed ? (
                  <><b className="text-rock-100">Plan updated</b> after confirmed left-foot contact. The completed suggestion is archived; next is <b>{MOVE_NAMES[displayedMove.id]}</b>.</>
                ) : (
                  <>Temporal evidence proposes a left-foot contact. It has not changed the plan yet.</>
                )}
              </div>
              <button data-testid="confirm-contact" onClick={() => setContactConfirmed(true)} disabled={contactConfirmed} className="mt-3 w-full rounded-lg bg-rock-400 px-4 py-3 text-sm font-bold text-white hover:bg-rock-500 disabled:bg-rock-800 disabled:text-rock-400">
                {contactConfirmed ? 'Contact confirmed' : 'Confirm left-foot contact'}
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-rock-700 bg-rock-800/45 p-5">
            <div className="text-xs font-bold uppercase tracking-[0.15em] text-rock-400">MVP architecture</div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-center text-xs font-bold sm:grid-cols-5">
              {['Camera + calibration', 'Hold & pose proposals', 'Contact state', 'Rules + goal planner', 'Visual / voice cue'].map((item, index) => (
                <div key={item} className="relative rounded-lg bg-rock-900/45 px-2 py-3 text-rock-200">
                  <span className="mb-1 block text-[10px] text-rock-400">0{index + 1}</span>{item}
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs leading-relaxed text-rock-300">Voice is an output channel, not the brain. The multimodal loop combines calibrated video, pose/hold proposals, temporal contact state, declared route rules, body profile, and user intent. Low-confidence inputs trigger correction instead of confident coaching.</p>
          </div>

          <div className="rounded-lg bg-rock-400 px-5 py-4 text-center text-sm font-bold text-white">
            Correct the route first; then compare body-aware beta.
          </div>
        </section>
      </div>
    </main>
  );
}
