/**
 * LiveCoachPanel — interface-first prototype for contact-aware replanning.
 *
 * The panel is intentionally honest about its source. It replays a recorded
 * contact fixture so we can validate the information hierarchy, uncertainty
 * confirmation, and replan explanation before live pose tracking exists.
 * “Recorded fixture” is both visible copy and an E2E assertion; removing that
 * disclosure without connecting real perception should break the tests.
 */

import { useState } from 'react';
import { Beta, DetectedHold, Limb, LiveCoachSession, PlannerSuggestion } from '../types';
import {
  confirmRecordedContact,
  createRecordedLiveCoachSession,
  proposeRecordedFootSwitch,
  rejectRecordedContact,
} from '../services/liveCoachFixture';
import BetaReceiptPanel from './BetaReceiptPanel';

interface Props {
  holds: DetectedHold[];
  beta: Beta;
}

const LIMB_SHORT: Record<Limb, string> = {
  leftHand: 'LH',
  rightHand: 'RH',
  leftFoot: 'LF',
  rightFoot: 'RF',
};

const PHASE_LABEL: Record<LiveCoachSession['phase'], string> = {
  watching: 'Watching',
  uncertain: 'Contact uncertain — confirm?',
  replanned: 'Replanned',
};

function Suggestion({ suggestion }: { suggestion: PlannerSuggestion }) {
  return (
    <div className="rounded-lg border border-rock-600 bg-rock-800/80 p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-rock-400">
        Next suggestion
      </div>
      <div className="mt-1 text-sm font-semibold text-rock-100">
        {LIMB_SHORT[suggestion.limb]} → {suggestion.toHoldId}
      </div>
      <div className="mt-1 text-xs text-rock-300">
        {Math.round(suggestion.reachDistance)} cm · {Math.round(suggestion.confidence * 100)}% planner confidence
      </div>
      <p className="mt-1 text-xs leading-relaxed text-rock-400">{suggestion.reason}</p>
    </div>
  );
}

export default function LiveCoachPanel({ holds, beta }: Props) {
  const [session, setSession] = useState(() => createRecordedLiveCoachSession(holds, beta));

  const reset = () => setSession(createRecordedLiveCoachSession(holds, beta));

  return (
    <section
      data-testid="live-coach-panel"
      className="rounded-xl border border-blue-400/30 bg-gradient-to-br from-slate-950 to-blue-950/70 p-4 text-white shadow-lg"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.14em] text-blue-300">
            Contact-aware interface prototype
          </div>
          <h2 className="mt-1 text-lg font-bold">Stuck Mode</h2>
        </div>
        <span
          data-testid="live-coach-status"
          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
            session.phase === 'uncertain'
              ? 'bg-amber-400/20 text-amber-200'
              : session.phase === 'replanned'
              ? 'bg-emerald-400/20 text-emerald-200'
              : 'bg-blue-400/20 text-blue-200'
          }`}
        >
          {PHASE_LABEL[session.phase]}
        </span>
      </div>

      <div
        data-testid="live-coach-source"
        className="mt-3 rounded-lg border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-xs leading-relaxed text-amber-100"
      >
        <b>Recorded fixture.</b> This previews the interaction contract; live camera pose/contact is not connected yet.
      </div>

      <div className="mt-3 grid grid-cols-4 gap-2">
        {(Object.keys(session.contacts) as Limb[]).map((limb) => {
          const item = session.contacts[limb];
          return (
            <div
              key={limb}
              data-testid={`contact-chip-${limb}`}
              className="min-w-0 rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-center"
            >
              <div className="text-[10px] font-bold text-blue-300">{LIMB_SHORT[limb]}</div>
              <div className="truncate text-xs font-semibold text-white" title={item.holdId}>
                {item.holdId}
              </div>
              <div className="text-[10px] text-rock-400">{Math.round(item.confidence * 100)}%</div>
            </div>
          );
        })}
      </div>

      <p data-testid="live-coach-event" className="mt-3 text-xs text-blue-100">
        {session.eventLabel}
      </p>

      {session.phase === 'uncertain' && session.proposedContact ? (
        <div className="mt-3 rounded-lg border border-amber-300/30 bg-amber-200/10 p-3">
          <div className="text-sm font-semibold text-amber-100">
            LF: {session.proposedContact.fromHoldId} → {session.proposedContact.toHoldId}
          </div>
          <div className="mt-1 text-xs text-amber-200">
            {Math.round(session.proposedContact.confidence * 100)}% observation confidence · {session.proposedContact.dwellMs} ms dwell
          </div>
          <div
            data-testid="temporal-evidence"
            className="mt-2 rounded-md border border-amber-200/20 bg-black/15 px-2.5 py-2 text-[11px] leading-relaxed text-amber-100"
          >
            <div className="font-semibold">
              Time-based baseline · {session.proposedContact.dwellMs} ms steady ·{' '}
              {Math.round(session.proposedContact.confidence * 100)}% evidence score
            </div>
            <div className="mt-0.5 text-amber-200/80">
              {Math.round(session.proposedContact.evidence.overlapRatio * 100)}% hold overlap ·{' '}
              {Math.round(session.proposedContact.evidence.speedPxPerSecond)} px/s motion ·{' '}
              {Math.round(session.proposedContact.evidence.visibility * 100)}% visible
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              data-testid="confirm-contact"
              onClick={() => setSession(confirmRecordedContact(session, beta))}
              className="rounded-lg bg-emerald-500 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-400"
            >
              Confirm contact
            </button>
            <button
              data-testid="reject-contact"
              onClick={() => setSession(rejectRecordedContact(session))}
              className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-xs font-bold text-white hover:bg-white/10"
            >
              Keep current contacts
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3">
          {session.phase === 'replanned' && (
            <div
              data-testid="old-suggestion"
              className="mb-2 rounded-lg border border-red-300/20 bg-red-300/10 px-3 py-2 text-xs text-red-200 line-through"
            >
              Stale: {LIMB_SHORT[session.previousSuggestion.limb]} → {session.previousSuggestion.toHoldId}
            </div>
          )}
          <div data-testid={session.phase === 'replanned' ? 'new-suggestion' : 'current-suggestion'}>
            <Suggestion suggestion={session.activeSuggestion} />
          </div>
        </div>
      )}

      <div className="mt-3 flex gap-2">
        {session.phase === 'watching' && (
          <button
            data-testid="replay-foot-switch"
            onClick={() => setSession(proposeRecordedFootSwitch(session, holds))}
            className="flex-1 rounded-lg bg-blue-500 px-3 py-2 text-sm font-bold text-white hover:bg-blue-400"
          >
            Replay recorded foot switch
          </button>
        )}
        {session.phase === 'replanned' && (
          <button
            onClick={reset}
            className="flex-1 rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm font-bold text-white hover:bg-white/10"
          >
            Reset fixture
          </button>
        )}
      </div>

      {/* Receipt rendering is isolated from the live controls: navigating its
          snapshots must never change the confirmed contact/planner session. */}
      <BetaReceiptPanel receipt={session.receipt} />
    </section>
  );
}
