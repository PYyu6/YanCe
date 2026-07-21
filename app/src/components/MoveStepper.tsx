/**
 * MoveStepper — Step-by-step beta viewer
 * ───────────────────────────────────────
 * Shows the current move in the sequence with:
 * - Step number and limb indicator
 * - Reach distance and difficulty
 * - Technique suggestion and tip
 * - Navigation (prev/next/play)
 */

import { Move, Beta } from '../types';
import { DIFFICULTY_COLORS, DIFFICULTY_LABELS } from '../utils/colors';
import TechniqueCard from './TechniqueCard';

interface Props {
  beta: Beta;
  currentStep: number;
  onStepChange: (step: number) => void;
}

const LIMB_LABELS: Record<string, string> = {
  leftHand: 'Left Hand',
  rightHand: 'Right Hand',
  leftFoot: 'Left Foot',
  rightFoot: 'Right Foot',
};

const LIMB_ICONS: Record<string, string> = {
  leftHand: '\u270B',   // raised hand
  rightHand: '\u270B',
  leftFoot: '\u{1F9B6}', // foot
  rightFoot: '\u{1F9B6}',
};

export default function MoveStepper({ beta, currentStep, onStepChange }: Props) {
  const move = beta.moves[currentStep] ?? null;
  const totalMoves = beta.moves.length;
  const isCrux = beta.cruxSteps.includes(currentStep);
  const isRest = beta.restSteps.includes(currentStep);

  return (
    <div className="space-y-3">
      {/* Progress bar */}
      <div className="flex items-center gap-2">
        <span className="text-rock-400 text-xs">
          {currentStep + 1}/{totalMoves}
        </span>
        <div className="flex-1 h-1.5 bg-rock-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-rock-400 rounded-full transition-all duration-300"
            style={{ width: `${((currentStep + 1) / totalMoves) * 100}%` }}
          />
        </div>
      </div>

      {/* Current move card */}
      {move && (
        <div
          className="rounded-xl p-4 space-y-2"
          style={{
            background: `linear-gradient(135deg, ${DIFFICULTY_COLORS[move.difficulty]}15, ${DIFFICULTY_COLORS[move.difficulty]}05)`,
            border: `1px solid ${DIFFICULTY_COLORS[move.difficulty]}30`,
          }}
        >
          {/* Move header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-rock-100">
                #{move.step}
              </span>
              <div>
                <div className="text-rock-200 text-sm font-medium flex items-center gap-1">
                  <span>{LIMB_ICONS[move.limb]}</span>
                  <span>{LIMB_LABELS[move.limb]}</span>
                </div>
                <div
                  className="text-xs font-medium"
                  style={{ color: DIFFICULTY_COLORS[move.difficulty] }}
                >
                  {DIFFICULTY_LABELS[move.difficulty]}
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-rock-200 text-lg font-bold">
                {move.reachDistance}cm
              </div>
              {isCrux && (
                <span className="text-xs bg-red-600/30 text-red-300 px-2 py-0.5 rounded-full">
                  CRUX
                </span>
              )}
              {isRest && (
                <span className="text-xs bg-green-600/30 text-green-300 px-2 py-0.5 rounded-full">
                  REST
                </span>
              )}
            </div>
          </div>

          {/* Tip */}
          <p className="text-rock-300 text-sm leading-relaxed">
            {move.tip}
          </p>

          {/* Technique card */}
          {move.technique && <TechniqueCard techniqueId={move.technique} />}
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => onStepChange(Math.max(0, currentStep - 1))}
          disabled={currentStep === 0}
          className="px-4 py-2 bg-rock-800 text-rock-300 rounded-lg hover:bg-rock-700 disabled:opacity-30 transition-colors"
        >
          Prev
        </button>

        {/* Step dots */}
        <div className="flex-1 flex items-center justify-center gap-1 flex-wrap">
          {beta.moves.map((m, i) => (
            <button
              key={i}
              onClick={() => onStepChange(i)}
              className={`w-2.5 h-2.5 rounded-full transition-all ${
                i === currentStep
                  ? 'w-6 bg-rock-300'
                  : i < currentStep
                  ? 'bg-rock-500'
                  : 'bg-rock-700'
              } ${beta.cruxSteps.includes(i) ? 'ring-1 ring-red-500' : ''}`}
              style={
                i === currentStep
                  ? { backgroundColor: DIFFICULTY_COLORS[m.difficulty] }
                  : undefined
              }
            />
          ))}
        </div>

        <button
          onClick={() => onStepChange(Math.min(totalMoves - 1, currentStep + 1))}
          disabled={currentStep >= totalMoves - 1}
          className="px-4 py-2 bg-rock-800 text-rock-300 rounded-lg hover:bg-rock-700 disabled:opacity-30 transition-colors"
        >
          Next
        </button>
      </div>
    </div>
  );
}
