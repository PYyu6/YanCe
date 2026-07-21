/**
 * ComparisonView.tsx — The demo money-shot: one wall, two bodies, two betas.
 *
 * DELIBERATELY DUMB COMPONENT. All decisions happen in computeBetaForProfile
 * (pure, tested); this file only lays out two columns and colors the moves
 * that differ. If you find yourself adding logic here, it belongs in
 * services/betaForProfile.ts where the integration test can see it.
 */

import { useMemo } from 'react';
import { CalibrationResult, ClimberProfile, DetectedHold } from '../types';
import {
  computeBetaForProfile,
  betaSequencesDiffer,
  ProfileBetaResult,
} from '../services/betaForProfile';
import { HoldType } from '../services/holdCandidates';

interface Props {
  holds: DetectedHold[];
  calibration: CalibrationResult; // reserved for the RouteView overlay integration
  profileA: ClimberProfile;
  profileB: ClimberProfile;
  holdTypes?: Record<string, HoldType>;
}

/** One profile's column: header stats + best-beta move list. */
function ProfileColumn({
  result,
  otherSeq,
  accent,
}: {
  result: ProfileBetaResult;
  /** The other climber's hold sequence, to highlight where THIS one diverges. */
  otherSeq: string[];
  accent: string;
}) {
  const best = result.betas[0];
  return (
    <div className="flex-1 min-w-0 rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-2">
        <div className="text-sm font-bold" style={{ color: accent }}>
          {result.profile.height} cm · span {result.profile.armSpan} cm · {result.profile.grade}
        </div>
        <div className="text-xs text-gray-500">
          reach {Math.round(result.measurements.standingReach)} cm · ape{' '}
          {result.measurements.apeIndex.toFixed(2)}
        </div>
      </div>

      {!best ? (
        // An unreachable route for this body IS a valid comparison result —
        // "this route doesn't go for a 150cm climber" is the product thesis
        // stated in its harshest form, so render it as information, not error.
        <div className="text-sm text-red-600">
          No feasible sequence for this body on this route.
        </div>
      ) : (
        <ol className="space-y-1">
          {best.moves.map((m, i) => {
            const diverges = otherSeq[i] !== m.toHoldId;
            return (
              <li
                key={m.step}
                className={`text-xs rounded px-2 py-1 ${
                  diverges ? 'font-semibold' : 'text-gray-600'
                }`}
                style={diverges ? { background: `${accent}22`, color: accent } : undefined}
              >
                {m.step}. {m.limb.replace(/([A-Z])/, ' $1').toLowerCase()} → {m.toHoldId}
                <span className="text-gray-400"> · {Math.round(m.reachDistance)} cm · {m.difficulty}</span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

export default function ComparisonView({ holds, profileA, profileB, holdTypes }: Props) {
  // useMemo, not useEffect+state: the pipeline is synchronous and pure, so the
  // render IS the computation. No loading states to get wrong on demo day.
  const { a, b, differ } = useMemo(() => {
    const a = computeBetaForProfile(holds, profileA, holdTypes);
    const b = computeBetaForProfile(holds, profileB, holdTypes);
    return { a, b, differ: betaSequencesDiffer(a, b) };
  }, [holds, profileA, profileB, holdTypes]);

  const seqA = a.betas[0]?.moves.map((m) => m.toHoldId) ?? [];
  const seqB = b.betas[0]?.moves.map((m) => m.toHoldId) ?? [];

  return (
    <div>
      <div
        className={`mb-3 rounded-lg px-3 py-2 text-sm font-medium ${
          differ ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-800'
        }`}
      >
        {differ
          ? 'Same wall — different beta. The sequence below is personalized to each body.'
          // Honesty over theater: if the route is body-insensitive, say so.
          // Faking a difference here would be exactly the decoration-AI trap
          // the whole project is built to avoid.
          : 'These two bodies get the same sequence on this route — try a route with bigger moves.'}
      </div>
      <div className="flex gap-3">
        <ProfileColumn result={a} otherSeq={seqB} accent="#3b5bdb" />
        <ProfileColumn result={b} otherSeq={seqA} accent="#1f9d55" />
      </div>
    </div>
  );
}
