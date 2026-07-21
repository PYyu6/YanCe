/**
 * BetaReceiptPanel — privacy-minimal decision receipt and state replay.
 *
 * This component renders only the typed P1 receipt contract. It never reads the
 * current live session directly; replaying an older event therefore cannot
 * mutate tracking or planning state. The separation is important product UX:
 * “review what YanCe believed then” is different from “change what it believes
 * now.”
 */

import { useEffect, useState } from 'react';
import { BetaReceipt, Limb } from '../types';

interface Props {
  receipt: BetaReceipt;
}

const LIMBS: Limb[] = ['leftHand', 'rightHand', 'leftFoot', 'rightFoot'];
const LIMB_SHORT: Record<Limb, string> = {
  leftHand: 'LH',
  rightHand: 'RH',
  leftFoot: 'LF',
  rightFoot: 'RF',
};

function countLabel(value: number, singular: string, plural: string): string {
  return `${value} ${value === 1 ? singular : plural}`;
}

export default function BetaReceiptPanel({ receipt }: Props) {
  // New events select themselves so the receipt follows the live story. Once
  // the user presses Previous/Next, index changes are local replay state only.
  const [index, setIndex] = useState(Math.max(0, receipt.events.length - 1));
  useEffect(() => {
    setIndex(Math.max(0, receipt.events.length - 1));
  }, [receipt.events.length]);

  const event = receipt.events[index];
  if (!event) return null;

  return (
    <section
      data-testid="beta-receipt"
      className="mt-4 rounded-xl border border-violet-300/20 bg-violet-300/5 p-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-violet-200">
            P1 · Beta Receipt
          </div>
          <h3 className="mt-0.5 text-sm font-bold text-white">Decision replay</h3>
        </div>
        <div
          data-testid="beta-receipt-summary"
          className="text-right text-[10px] leading-relaxed text-violet-100"
        >
          <div>{countLabel(receipt.replanCount, 'replan', 'replans')}</div>
          <div>{countLabel(receipt.correctionCount, 'correction', 'corrections')}</div>
        </div>
      </div>

      <div
        data-testid="beta-receipt-privacy"
        className="mt-2 rounded-md border border-emerald-300/20 bg-emerald-300/10 px-2.5 py-1.5 text-[10px] text-emerald-100"
      >
        Structured state only · no video or audio stored
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          data-testid="beta-replay-prev"
          onClick={() => setIndex((value) => Math.max(0, value - 1))}
          disabled={index === 0}
          className="rounded-md border border-white/15 px-2 py-1 text-xs text-white disabled:opacity-30"
          aria-label="Previous receipt event"
        >
          ←
        </button>
        <div className="min-w-0 flex-1">
          <div className="h-1 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-violet-300 transition-all"
              style={{ width: `${((index + 1) / receipt.events.length) * 100}%` }}
            />
          </div>
        </div>
        <span data-testid="beta-replay-position" className="text-[10px] text-violet-100">
          {index + 1} / {receipt.events.length}
        </span>
        <button
          data-testid="beta-replay-next"
          onClick={() => setIndex((value) => Math.min(receipt.events.length - 1, value + 1))}
          disabled={index === receipt.events.length - 1}
          className="rounded-md border border-white/15 px-2 py-1 text-xs text-white disabled:opacity-30"
          aria-label="Next receipt event"
        >
          →
        </button>
      </div>

      <div className="mt-3 rounded-lg border border-white/10 bg-black/15 p-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div data-testid="beta-replay-title" className="text-sm font-semibold text-white">
              {event.title}
            </div>
            <div className="mt-0.5 text-[10px] text-violet-200">+{event.elapsedMs} ms</div>
          </div>
          {event.confidence !== undefined && (
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white">
              {Math.round(event.confidence * 100)}%
            </span>
          )}
        </div>
        <p className="mt-1 text-xs leading-relaxed text-rock-300">{event.detail}</p>

        <div data-testid="beta-replay-contacts" className="mt-3 grid grid-cols-4 gap-1.5">
          {LIMBS.map((limb) => {
            const item = event.snapshot.contacts[limb];
            return (
              <div
                key={limb}
                data-contact={limb}
                className="min-w-0 rounded-md bg-white/5 px-1.5 py-1.5 text-center"
              >
                <div className="text-[9px] font-bold text-violet-200">{LIMB_SHORT[limb]}</div>
                <div className="truncate text-[10px] text-white" title={item.holdId}>
                  {item.holdId}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-2 rounded-md bg-white/5 px-2 py-1.5 text-[10px] text-rock-300">
          Snapshot suggestion: {LIMB_SHORT[event.snapshot.suggestion.limb]} →{' '}
          {event.snapshot.suggestion.toHoldId}
        </div>
      </div>
    </section>
  );
}
