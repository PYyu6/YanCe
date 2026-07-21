import { useEffect, useState } from 'react';
import { Beta, BodyMeasurements } from '../types';
import { coachMoves, CoachedMove } from '../services/vlm';

interface Props {
  beta: Beta;
  measurements: BodyMeasurements;
  currentStep: number;
}

type Status = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

/**
 * Optional, user-triggered GPT-5.6 explanation for a deterministic beta.
 * The model never chooses holds here; coachMoves validates every returned
 * sentence against the existing move list before this component sees it.
 */
export default function GptCoachPanel({ beta, measurements, currentStep }: Props) {
  const [status, setStatus] = useState<Status>('idle');
  const [coachings, setCoachings] = useState<CoachedMove[]>([]);

  useEffect(() => {
    setStatus('idle');
    setCoachings([]);
  }, [beta]);

  const currentMove = beta.moves[currentStep];
  const currentCoaching = coachings.find((item) => item.step === currentMove?.step);

  async function generate() {
    setStatus('loading');
    try {
      const grounded = await coachMoves(beta.moves, measurements);
      setCoachings(grounded);
      setStatus(grounded.length > 0 ? 'ready' : 'empty');
    } catch (error) {
      console.warn('[coach] GPT-5.6 coaching unavailable; keeping rule-based tips:', error);
      setStatus('error');
    }
  }

  return (
    <section
      data-testid="gpt-coach-panel"
      className="rounded-xl border border-violet-400/30 bg-violet-950/30 p-4 text-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.16em] text-violet-300">
            GPT-5.6 · bounded explanation
          </div>
          <h2 className="mt-1 font-semibold text-rock-100">Explain this beta</h2>
        </div>
        {status === 'ready' && (
          <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-[10px] font-bold text-emerald-300">
            Grounded
          </span>
        )}
      </div>

      <p className="mt-2 text-xs leading-relaxed text-rock-300">
        Geometry chose the holds. GPT-5.6 may explain only those moves; invalid hold references are dropped.
      </p>

      {status === 'idle' && (
        <button
          data-testid="gpt-coach-generate"
          onClick={generate}
          className="mt-3 w-full rounded-lg bg-violet-600 px-3 py-2 font-semibold text-white hover:bg-violet-500"
        >
          Generate GPT-5.6 coaching
        </button>
      )}

      {status === 'loading' && (
        <p className="mt-3 animate-pulse rounded-lg bg-black/20 px-3 py-2 text-violet-200">
          Checking the fixed move sequence…
        </p>
      )}

      {status === 'ready' && (
        <div data-testid="gpt-coach-output" className="mt-3 rounded-lg bg-black/20 px-3 py-2">
          <div className="text-[10px] font-bold uppercase tracking-wide text-violet-300">
            Move {currentMove?.step ?? currentStep + 1}
          </div>
          <p className="mt-1 leading-relaxed text-rock-100">
            {currentCoaching?.coaching ?? 'The grounded response did not include this move; use the rule-based tip above.'}
          </p>
        </div>
      )}

      {(status === 'empty' || status === 'error') && (
        <div className="mt-3 rounded-lg border border-amber-400/20 bg-amber-900/20 px-3 py-2 text-xs text-amber-200">
          {status === 'empty'
            ? 'No grounded model coaching survived validation. Rule-based move tips remain active.'
            : 'GPT-5.6 is unavailable. The computed beta and rule-based tips are unchanged.'}
          <button onClick={generate} className="ml-2 underline underline-offset-2">Retry</button>
        </div>
      )}
    </section>
  );
}
