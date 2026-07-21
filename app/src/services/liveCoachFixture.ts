/**
 * liveCoachFixture.ts — deterministic interface contract for the next MVP.
 *
 * This is deliberately NOT a pose detector. The repository does not yet have
 * wall homography, body keypoints, contact dwell, or a four-contact planner.
 * The module provides a recorded-fixture state transition so product UI and
 * browser tests can agree on the contract BEFORE a camera/model is connected:
 *
 *   confirmed contacts → proposed foot switch → user confirm/reject → replan
 *
 * Why ship this seam first:
 *  - It prevents a future pose package from leaking model-specific shapes into
 *    React components or the planner.
 *  - It makes uncertainty and correction first-class, rather than adding them
 *    after an optimistic “live AI” demo has already hardened the wrong UX.
 *  - It gives Playwright a deterministic event source. CI can test product
 *    behavior without pretending a synthetic trace measures pose accuracy.
 *
 * Replace the fixture producer with a tracking adapter later; keep the session
 * and transition functions stable so the UI and E2E tests remain useful.
 */

import {
  Beta,
  BetaReceipt,
  BetaReceiptEvent,
  BetaReceiptEventType,
  BetaReceiptSnapshot,
  ContactState,
  DetectedHold,
  Limb,
  LimbContact,
  LiveCoachSession,
  PlannerSuggestion,
} from '../types';
import { runRecordedFootSwitchTrace } from '../tracking/recordedContactTrace';

const LIMBS: Limb[] = ['leftHand', 'rightHand', 'leftFoot', 'rightFoot'];

/** Select a stable, deterministic hold by index, wrapping for tiny routes. */
function holdAt(holds: DetectedHold[], index: number): DetectedHold {
  if (holds.length === 0) {
    throw new Error('Live coach fixture requires at least one detected hold.');
  }
  return holds[index % holds.length];
}

/**
 * Sort bottom-to-top and left-to-right so the fixture is independent of the
 * detector's candidate ordering. Real contact observations will arrive with
 * explicit hold IDs and will not need this fixture-only normalization.
 */
function orderedHolds(holds: DetectedHold[]): DetectedHold[] {
  return [...holds].sort(
    (a, b) => a.worldCenter.y - b.worldCenter.y || a.worldCenter.x - b.worldCenter.x,
  );
}

function contact(limb: Limb, holdId: string): LimbContact {
  return { limb, holdId, confidence: 0.96, source: 'recorded_fixture' };
}

/**
 * Receipt snapshots must survive later state transitions unchanged. All state
 * updates in this fixture are immutable already, but cloning here makes that
 * audit guarantee local and future-proof if a tracking adapter reuses objects.
 */
function cloneContacts(contacts: ContactState): ContactState {
  return LIMBS.reduce((copy, limb) => {
    copy[limb] = { ...contacts[limb] };
    return copy;
  }, {} as ContactState);
}

function cloneSuggestion(suggestion: PlannerSuggestion): PlannerSuggestion {
  return { ...suggestion };
}

function snapshot(
  contacts: ContactState,
  suggestion: PlannerSuggestion,
): BetaReceiptSnapshot {
  return {
    contacts: cloneContacts(contacts),
    suggestion: cloneSuggestion(suggestion),
  };
}

interface ReceiptEventDraft {
  type: BetaReceiptEventType;
  title: string;
  detail: string;
  elapsedMs: number;
  confidence?: number;
  snapshot: BetaReceiptSnapshot;
}

/** Append event drafts while assigning stable monotonic IDs and order. */
function appendReceiptEvents(
  receipt: BetaReceipt,
  drafts: ReceiptEventDraft[],
  counters?: { replans?: number; corrections?: number },
): BetaReceipt {
  const events: BetaReceiptEvent[] = drafts.map((draft, offset) => {
    const order = receipt.events.length + offset;
    return {
      ...draft,
      id: `${receipt.id}-event-${order}`,
      order,
    };
  });

  return {
    ...receipt,
    events: [...receipt.events, ...events],
    replanCount: receipt.replanCount + (counters?.replans ?? 0),
    correctionCount: receipt.correctionCount + (counters?.corrections ?? 0),
  };
}

function createReceipt(
  contacts: ContactState,
  suggestion: PlannerSuggestion,
): BetaReceipt {
  const id = 'beta-receipt-recorded-fixture';
  const firstEvent: BetaReceiptEvent = {
    id: `${id}-event-0`,
    order: 0,
    elapsedMs: 0,
    type: 'session_started',
    title: 'Session started',
    detail: 'Loaded a stable four-contact state from the recorded fixture.',
    snapshot: snapshot(contacts, suggestion),
  };
  return {
    id,
    source: 'recorded_fixture',
    events: [firstEvent],
    replanCount: 0,
    correctionCount: 0,
    privacy: { rawVideoStored: false, rawAudioStored: false },
  };
}

function suggestionFromMove(
  beta: Beta,
  moveIndex: number,
  fallbackHoldId: string,
  reason: string,
): PlannerSuggestion {
  const move = beta.moves[Math.min(moveIndex, Math.max(0, beta.moves.length - 1))];
  if (!move) {
    return {
      limb: 'rightHand',
      toHoldId: fallbackHoldId,
      reachDistance: 0,
      confidence: 0.55,
      reason,
    };
  }
  return {
    limb: move.limb,
    toHoldId: move.toHoldId,
    reachDistance: move.reachDistance,
    confidence: 0.84,
    reason,
  };
}

/** Build the initial confirmed state shown when the interface opens. */
export function createRecordedLiveCoachSession(
  holds: DetectedHold[],
  beta: Beta,
): LiveCoachSession {
  const ordered = orderedHolds(holds);
  const contacts = LIMBS.reduce((state, limb, index) => {
    // Feet use lower holds; hands use the next available holds. The mapping is
    // a UI fixture only—not a claim that these contacts came from perception.
    const fixtureIndex = limb.includes('Foot') ? index - 2 : index + 2;
    const normalizedIndex = Math.max(0, fixtureIndex);
    const hold = holdAt(ordered, normalizedIndex);
    state[limb] = contact(limb, hold.id);
    return state;
  }, {} as ContactState);

  const previousSuggestion = suggestionFromMove(
    beta,
    0,
    holdAt(ordered, ordered.length - 1).id,
    'Best next contact from the confirmed recorded state.',
  );

  return {
    phase: 'watching',
    source: 'recorded_fixture',
    contacts,
    proposedContact: null,
    previousSuggestion,
    activeSuggestion: previousSuggestion,
    eventLabel: 'Stable four-contact state loaded.',
    receipt: createReceipt(contacts, previousSuggestion),
  };
}

/**
 * Replay one ambiguous left-foot observation. A real tracker will call the
 * equivalent transition only after spatial overlap, low velocity, and dwell.
 */
export function proposeRecordedFootSwitch(
  session: LiveCoachSession,
  holds: DetectedHold[],
): LiveCoachSession {
  const ordered = orderedHolds(holds);
  const occupied = new Set(Object.values(session.contacts).map((c) => c.holdId));
  const target =
    ordered.find((hold, index) => index >= 2 && !occupied.has(hold.id)) ??
    holdAt(ordered, ordered.length - 1);

  const temporalEstimate = runRecordedFootSwitchTrace(target.id);
  if (temporalEstimate.decision !== 'propose' || temporalEstimate.holdId !== target.id) {
    throw new Error('Recorded foot-switch trace did not produce its expected proposal.');
  }

  const proposedContact = {
    limb: 'leftFoot' as const,
    fromHoldId: session.contacts.leftFoot.holdId,
    toHoldId: target.id,
    confidence: temporalEstimate.probability,
    dwellMs: temporalEstimate.dwellMs,
    source: 'recorded_fixture' as const,
    estimator: temporalEstimate.estimator,
    evidence: temporalEstimate.evidence,
  };
  const receipt = appendReceiptEvents(session.receipt, [
    {
      type: 'contact_observed',
      title: 'Possible contact observed',
      detail: `Left foot may have moved from ${proposedContact.fromHoldId} to ${proposedContact.toHoldId}; confirmation required.`,
      elapsedMs: proposedContact.dwellMs,
      confidence: proposedContact.confidence,
      snapshot: snapshot(session.contacts, session.activeSuggestion),
    },
  ]);

  return {
    ...session,
    phase: 'uncertain',
    proposedContact,
    eventLabel: 'Possible left-foot switch detected; confirmation required.',
    receipt,
  };
}

/** Confirm the proposed contact and expose a different planner suggestion. */
export function confirmRecordedContact(
  session: LiveCoachSession,
  beta: Beta,
): LiveCoachSession {
  const proposal = session.proposedContact;
  if (!proposal) return session;

  const contacts: ContactState = {
    ...session.contacts,
    [proposal.limb]: {
      limb: proposal.limb,
      holdId: proposal.toHoldId,
      confidence: proposal.confidence,
      source: proposal.source,
    },
  };
  const nextSuggestion = suggestionFromMove(
    beta,
    1,
    proposal.toHoldId,
    'Confirmed foot support changed the reachable next-contact set.',
  );
  const lastElapsed = session.receipt.events.at(-1)?.elapsedMs ?? 0;
  const receipt = appendReceiptEvents(
    session.receipt,
    [
      {
        type: 'contact_confirmed',
        title: 'Contact confirmed',
        detail: `Left foot confirmed on ${proposal.toHoldId}.`,
        elapsedMs: lastElapsed + 80,
        confidence: proposal.confidence,
        snapshot: snapshot(contacts, session.activeSuggestion),
      },
      {
        type: 'suggestion_invalidated',
        title: 'Previous suggestion invalidated',
        detail: `${session.previousSuggestion.limb} → ${session.previousSuggestion.toHoldId} was based on the earlier support state.`,
        elapsedMs: lastElapsed + 90,
        snapshot: snapshot(contacts, session.previousSuggestion),
      },
      {
        type: 'suggestion_created',
        title: 'New suggestion created',
        detail: `${nextSuggestion.limb} → ${nextSuggestion.toHoldId} selected from the confirmed contact state.`,
        elapsedMs: lastElapsed + 100,
        confidence: nextSuggestion.confidence,
        snapshot: snapshot(contacts, nextSuggestion),
      },
    ],
    { replans: 1 },
  );

  return {
    ...session,
    phase: 'replanned',
    contacts,
    proposedContact: null,
    activeSuggestion: nextSuggestion,
    eventLabel: 'Foot switch confirmed. Stale suggestion invalidated and replanned.',
    receipt,
  };
}

/** Rejecting perception must preserve the last confirmed planner state. */
export function rejectRecordedContact(session: LiveCoachSession): LiveCoachSession {
  const proposal = session.proposedContact;
  const lastElapsed = session.receipt.events.at(-1)?.elapsedMs ?? 0;
  const receipt = appendReceiptEvents(
    session.receipt,
    [
      {
        type: 'contact_rejected',
        title: 'Observation rejected',
        detail: proposal
          ? `Kept left foot on ${proposal.fromHoldId}; proposed ${proposal.toHoldId} was not accepted.`
          : 'Kept the last confirmed contact state.',
        elapsedMs: lastElapsed + 80,
        snapshot: snapshot(session.contacts, session.previousSuggestion),
      },
    ],
    { corrections: 1 },
  );

  return {
    ...session,
    phase: 'watching',
    proposedContact: null,
    activeSuggestion: session.previousSuggestion,
    eventLabel: 'Observation rejected. Confirmed contacts were not changed.',
    receipt,
  };
}
