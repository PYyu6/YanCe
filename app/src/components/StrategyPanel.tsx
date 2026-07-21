/**
 * StrategyPanel — Beta selector + route stats
 * ────────────────────────────────────────────
 * Shows available beta strategies, route statistics,
 * and lets user switch between strategies.
 */

import { Beta, RouteAnalysis, BodyMeasurements } from '../types';
import { DIFFICULTY_COLORS, DIFFICULTY_LABELS } from '../utils/colors';
import { getHeightCategory, HEIGHT_TECHNIQUE_MAP } from '../knowledge/techniques';

interface Props {
  analysis: RouteAnalysis;
  currentBetaIndex: number;
  onBetaChange: (index: number) => void;
}

export default function StrategyPanel({ analysis, currentBetaIndex, onBetaChange }: Props) {
  const { betas, holds, measurements, climber } = analysis;
  const heightCat = getHeightCategory(climber.height);
  const suggestedTechs = HEIGHT_TECHNIQUE_MAP[heightCat] ?? [];

  return (
    <div className="space-y-4">
      {/* Route Stats */}
      <div className="bg-rock-800/50 rounded-xl p-4">
        <h3 className="text-rock-200 text-sm font-medium mb-2">Route Overview</h3>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <div className="text-rock-100 text-xl font-bold">{holds.length}</div>
            <div className="text-rock-400 text-xs">Holds</div>
          </div>
          <div>
            <div className="text-rock-100 text-xl font-bold">
              {Math.round(Math.max(...holds.map((h) => h.worldCenter.y)) - Math.min(...holds.map((h) => h.worldCenter.y)))}cm
            </div>
            <div className="text-rock-400 text-xs">Height</div>
          </div>
          <div>
            <div className="text-rock-100 text-xl font-bold">{betas.length}</div>
            <div className="text-rock-400 text-xs">Strategies</div>
          </div>
        </div>
      </div>

      {/* Climber context */}
      <div className="bg-rock-800/50 rounded-xl p-4">
        <h3 className="text-rock-200 text-sm font-medium mb-2">Your Profile</h3>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="text-rock-400">
            Height: <span className="text-rock-200">{climber.height}cm</span>
            <span className="text-rock-500 ml-1">({heightCat})</span>
          </div>
          <div className="text-rock-400">
            Arm: <span className="text-rock-200">{Math.round(measurements.armLength)}cm</span>
          </div>
          <div className="text-rock-400">
            Ape: <span className="text-rock-200">{measurements.apeIndex.toFixed(2)}</span>
          </div>
          <div className="text-rock-400">
            Grade: <span className="text-rock-200">{climber.grade}</span>
          </div>
        </div>
        <div className="mt-2">
          <div className="text-rock-400 text-xs mb-1">Key techniques for your height:</div>
          <div className="flex flex-wrap gap-1">
            {suggestedTechs.slice(0, 3).map((t) => (
              <span key={t} className="px-2 py-0.5 bg-rock-700 text-rock-300 rounded text-xs">
                {t.replace('_', ' ')}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Beta selector */}
      <div>
        <h3 className="text-rock-200 text-sm font-medium mb-2">Strategies</h3>
        <div className="space-y-2">
          {betas.map((beta, i) => (
            <button
              key={beta.id}
              onClick={() => onBetaChange(i)}
              className={`w-full text-left rounded-xl p-3 transition-all ${
                i === currentBetaIndex
                  ? 'bg-rock-700 border border-rock-500'
                  : 'bg-rock-800/50 border border-transparent hover:border-rock-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-rock-100 font-medium text-sm">{beta.name}</div>
                  <div className="text-rock-400 text-xs mt-0.5">{beta.description}</div>
                </div>
                <div className="text-right">
                  <div className="text-rock-200 text-sm font-bold">
                    {beta.moves.length} moves
                  </div>
                  <div className="text-xs">
                    <span className="text-rock-400">Fit: </span>
                    <span
                      className={
                        beta.suitability > 0.7
                          ? 'text-green-400'
                          : beta.suitability > 0.4
                          ? 'text-yellow-400'
                          : 'text-red-400'
                      }
                    >
                      {(beta.suitability * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Difficulty bar */}
              <div className="flex gap-0.5 mt-2">
                {beta.moves.map((m, j) => (
                  <div
                    key={j}
                    className="h-1.5 flex-1 rounded-full"
                    style={{ backgroundColor: DIFFICULTY_COLORS[m.difficulty] }}
                    title={`Step ${j + 1}: ${DIFFICULTY_LABELS[m.difficulty]}`}
                  />
                ))}
              </div>

              {beta.cruxSteps.length > 0 && (
                <div className="text-xs text-red-400 mt-1">
                  Crux at step{beta.cruxSteps.length > 1 ? 's' : ''}{' '}
                  {beta.cruxSteps.map((s) => s + 1).join(', ')}
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Reach legend */}
      <div className="bg-rock-800/50 rounded-xl p-3">
        <div className="text-rock-400 text-xs mb-2">Reach Legend</div>
        <div className="grid grid-cols-2 gap-1.5">
          {Object.entries(DIFFICULTY_COLORS).map(([key, color]) => (
            <div key={key} className="flex items-center gap-2 text-xs">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
              <span className="text-rock-300">{DIFFICULTY_LABELS[key]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
