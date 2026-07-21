/**
 * FullBodyPanel — four-limb beta viewer with a route-technique chooser.
 *
 * Product rules this panel enforces visually:
 *  - The technique chips show ONLY what this route offers this person
 *    (routeTechniqueOptions); unavailable ones are visible but disabled with
 *    their reason, so "why can't I dyno?" is answered on screen.
 *  - Choosing a chip RE-PLANS the route under that preference.
 *  - Each step card is one move (one limb), visually separated, with the
 *    complete four-limb stance after the move — LH/RH/LF/RF chips — so
 *    "where is my left foot at step 3?" is always answered.
 *  - orderNote carries the sequencing coaching ("set this foot first…"),
 *    which is the explicit answer to "hand or foot first?".
 */

import { useMemo, useState } from 'react';
import {
  BodyMeasurements,
  ClimberProfile,
  DetectedHold,
  FullBodyMove,
  Limb,
  PlannedContact,
  TechniquePreference,
} from '../types';
import {
  planFullBodyBeta,
  routeTechniqueOptions,
} from '../engine/fullBodyBeta';

interface Props {
  holds: DetectedHold[];
  measurements: BodyMeasurements;
  profile: ClimberProfile;
}

const LIMB_SHORT: Record<Limb, string> = {
  leftHand: 'LH',
  rightHand: 'RH',
  leftFoot: 'LF',
  rightFoot: 'RF',
};

const LIMB_LABEL: Record<Limb, string> = {
  leftHand: 'Left hand',
  rightHand: 'Right hand',
  leftFoot: 'Left foot',
  rightFoot: 'Right foot',
};

const DIFF_BADGE: Record<string, string> = {
  easy: 'bg-emerald-500/15 text-emerald-300',
  moderate: 'bg-amber-500/15 text-amber-300',
  limit: 'bg-orange-500/20 text-orange-300',
  dynamic: 'bg-red-500/20 text-red-300',
};

function contactLabel(holds: DetectedHold[], contact: PlannedContact): string {
  if (contact.kind === 'wall') {
    return contact.mode === 'flag' ? 'wall flag' : 'wall smear';
  }
  const idx = holds.findIndex((h) => h.id === contact.holdId);
  const hold = holds[idx];
  if (!hold) return contact.holdId;
  if (hold.isTop) return 'TOP';
  if (hold.isStart) return 'START';
  return `Hold ${idx + 1}`;
}

export default function FullBodyPanel({ holds, measurements, profile }: Props) {
  const [preference, setPreference] = useState<TechniquePreference>('auto');

  const options = useMemo(
    () => routeTechniqueOptions(holds, measurements, profile),
    [holds, measurements, profile],
  );
  const beta = useMemo(
    () => planFullBodyBeta(holds, measurements, profile, preference),
    [holds, measurements, profile, preference],
  );

  return (
    <section
      data-testid="full-body-panel"
      className="rounded-xl border border-teal-400/25 bg-teal-950/25 p-4 text-sm"
    >
      <div className="text-[10px] font-black uppercase tracking-[0.16em] text-teal-300">
        Full-body beta · hands + feet
      </div>
      <h2 className="mt-1 font-semibold text-rock-100">
        One moving limb · all four contacts at every step
      </h2>

      {/* Technique chooser: only what this route + this body supports */}
      <div className="mt-3">
        <div className="text-xs font-semibold text-rock-300 mb-1.5">
          Techniques this route offers you
        </div>
        <div className="flex flex-wrap gap-1.5">
          {options.map((opt) => (
            <button
              type="button"
              key={opt.preference}
              data-testid={`technique-${opt.preference}`}
              disabled={!opt.available}
              title={opt.reason}
              onClick={() => opt.available && setPreference(opt.preference)}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${
                preference === opt.preference && opt.available
                  ? 'bg-teal-500 text-white'
                  : opt.available
                    ? 'bg-rock-800 text-teal-200 hover:bg-rock-700'
                    : 'bg-rock-800/40 text-rock-500 cursor-not-allowed line-through'
              }`}
            >
              {opt.name} <span className="opacity-70">{opt.nameCn}</span>
              <span className="ml-1 opacity-60">· {opt.difficulty}</span>
            </button>
          ))}
        </div>
        {options.some((o) => !o.available) && (
          <p className="mt-1.5 text-[11px] text-rock-400">
            {options
              .filter((o) => !o.available)
              .map((o) => `${o.name}: ${o.reason}`)
              .join(' ')}
          </p>
        )}
      </div>

      {/* Step cards: one card = one move, hard visual separation */}
      <ol data-testid="full-body-steps" className="mt-3 space-y-2 list-none p-0">
        {beta.moves.map((move: FullBodyMove) => (
          <li
            key={move.step}
            data-testid={`fb-step-${move.step}`}
            data-moving-limb={move.limb}
            aria-labelledby={`fb-step-title-${move.step}`}
            className="rounded-xl border border-rock-700 bg-rock-900/70 p-3.5 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.14em] text-teal-300">
                  Move {move.step} of {beta.moves.length} · moving limb
                </div>
                <div id={`fb-step-title-${move.step}`} className="mt-0.5 font-bold text-rock-100">
                  {LIMB_SHORT[move.limb]} · {LIMB_LABEL[move.limb]}
                </div>
                <div className="mt-0.5 text-xs text-rock-300">
                  {contactLabel(holds, move.from)} → {contactLabel(holds, move.to)}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${DIFF_BADGE[move.difficulty] ?? 'bg-rock-800 text-rock-300'}`}
                >
                  {move.reachDistance}cm · {move.difficulty}
                </span>
                <span
                  data-testid={`fb-order-${move.step}`}
                  className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-bold text-sky-200"
                  title="Geometry-only score; higher is easier under the visible contact model"
                >
                  Suggested order · {move.order.label} {move.order.easeScore}/100
                </span>
              </div>
            </div>
            <div className="mt-2 rounded-lg border border-sky-400/15 bg-sky-950/25 px-2.5 py-2 text-xs leading-relaxed text-rock-300">
              <span className="font-semibold text-sky-200">Why now: </span>
              {move.orderNote}
              <span className="mt-0.5 block text-[11px] text-rock-400">{move.reason}</span>
            </div>
            {move.technique && (
              <p className="mt-0.5 text-xs font-semibold text-violet-300">
                Technique: {move.technique}
              </p>
            )}
            {/* Complete stance after this move: the four-limb answer */}
            <div
              data-testid={`fb-stance-${move.step}`}
              className="mt-2 grid grid-cols-2 gap-1.5"
            >
              {(Object.keys(LIMB_SHORT) as Limb[]).map((limb) => (
                <div
                  key={limb}
                  data-testid={`fb-contact-${move.step}-${limb}`}
                  aria-label={`${LIMB_LABEL[limb]}: ${contactLabel(holds, move.stanceAfter[limb])}; ${limb === move.limb ? 'moved in this step' : 'supporting contact'}`}
                  className={`rounded-lg border px-2 py-1.5 text-[10px] ${
                    limb === move.limb
                      ? 'border-teal-400/35 bg-teal-500/20 text-teal-100 font-bold'
                      : 'border-rock-700 bg-rock-800/60 text-rock-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-black">{LIMB_SHORT[limb]} · {LIMB_LABEL[limb]}</span>
                    <span className={limb === move.limb ? 'text-teal-300' : 'text-rock-500'}>
                      {limb === move.limb ? 'MOVED' : 'SUPPORT'}
                    </span>
                  </div>
                  <div className="mt-0.5 truncate text-[11px]">
                    {contactLabel(holds, move.stanceAfter[limb])}
                  </div>
                </div>
              ))}
            </div>
          </li>
        ))}
      </ol>

      {!beta.complete && (
        <p className="mt-2 rounded-lg border border-amber-400/20 bg-amber-900/20 px-3 py-2 text-xs text-amber-200">
          No complete verified sequence under this preference.
        </p>
      )}

      {/* Rule and assumption disclosures — the honesty contract */}
      <ul className="mt-3 list-disc pl-4 text-[11px] leading-relaxed text-rock-400">
        {beta.notes.map((n, i) => (
          <li key={i}>{n}</li>
        ))}
      </ul>
    </section>
  );
}
