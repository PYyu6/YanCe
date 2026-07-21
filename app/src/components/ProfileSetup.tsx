/**
 * ProfileSetup — Step 1
 * ─────────────────────
 * Collects the climber's body measurements and experience level.
 * Computes ape index and shows derived measurements.
 */

import { useState } from 'react';
import { AbilityLevel, ClimberProfile, Experience } from '../types';
import { computeMeasurements } from '../engine/climberModel';
import { getHeightCategory } from '../knowledge/techniques';

interface Props {
  onSubmit: (profile: ClimberProfile) => void;
}

const GRADE_OPTIONS = [
  'V0', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7', 'V8', 'V9', 'V10',
];

export default function ProfileSetup({ onSubmit }: Props) {
  const [height, setHeight] = useState(170);
  const [armSpan, setArmSpan] = useState(170);
  const [grade, setGrade] = useState('V3');
  const [experience, setExperience] = useState<Experience>('intermediate');
  // Self-reported abilities for full-body planning. Anchored to concrete
  // tests so the answer means the same thing for everyone; default medium.
  const [flexibility, setFlexibility] = useState<AbilityLevel>('medium');
  const [strength, setStrength] = useState<AbilityLevel>('medium');

  const apeIndex = (armSpan / height).toFixed(2);
  const measurements = computeMeasurements({ height, armSpan, grade, experience });
  const heightCat = getHeightCategory(height);

  return (
    <div className="min-h-screen bg-[#101714] px-4 py-6 text-rock-100 sm:px-6 lg:grid lg:place-items-center">
      <div className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(420px,.85fr)]">
        <aside className="relative hidden min-h-[760px] overflow-hidden rounded-[2rem] border border-white/10 bg-rock-900 lg:block">
          <img
            src="/submission/yance-hero.jpg"
            alt="A solo indoor climber studying a bouldering wall with two possible route traces"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#101714] via-[#101714]/25 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-9">
            <div className="text-[11px] font-black uppercase tracking-[.2em] text-lime-300">
              Body-aware route reading
            </div>
            <h2 className="mt-3 max-w-lg text-5xl font-black leading-[.98] tracking-[-.045em] text-white">
              One wall.<br />Your body.<br />Your beta.
            </h2>
            <p className="mt-5 max-w-lg text-base leading-relaxed text-white/75">
              Photograph a route, correct the holds, and see a move sequence shaped by your real reach—not an imaginary average climber.
            </p>
            <div className="mt-6 grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-xl border border-white/15 bg-black/25 p-3 backdrop-blur"><b className="block text-white">1 · Photo</b><span className="text-white/60">Frame the route</span></div>
              <div className="rounded-xl border border-white/15 bg-black/25 p-3 backdrop-blur"><b className="block text-white">2 · Correct</b><span className="text-white/60">Keep control</span></div>
              <div className="rounded-xl border border-white/15 bg-black/25 p-3 backdrop-blur"><b className="block text-white">3 · Climb</b><span className="text-white/60">Try your beta</span></div>
            </div>
          </div>
        </aside>

        <main className="space-y-6 rounded-[2rem] border border-white/10 bg-rock-900/65 p-6 shadow-2xl shadow-black/20 sm:p-8">
      {/* Header */}
      <div>
        <div className="mb-3 inline-flex rounded-full border border-rock-400/35 bg-rock-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[.16em] text-rock-200">
          Start with your reach
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-rock-100">
          岩策 <span className="text-rock-400">YánCè</span>
        </h1>
        <p className="mt-2 text-rock-300">Set up your profile, then add one wall photo. You stay in control of every detected hold.</p>
      </div>

      {/* Height */}
      <div>
        <label className="block text-sm font-medium text-rock-200 mb-1">
          Height
          <span className="float-right text-rock-400">{height} cm</span>
        </label>
        <input
          type="range"
          min={140}
          max={210}
          value={height}
          onChange={(e) => setHeight(Number(e.target.value))}
          className="w-full accent-rock-400"
        />
        <div className="flex justify-between text-xs text-rock-500">
          <span>140cm</span>
          <span className="text-rock-300">
            {heightCat === 'short' ? 'Shorter range' : heightCat === 'tall' ? 'Taller range' : 'Average range'}
          </span>
          <span>210cm</span>
        </div>
      </div>

      {/* Arm Span */}
      <div>
        <label className="block text-sm font-medium text-rock-200 mb-1">
          Arm Span
          <span className="float-right text-rock-400">{armSpan} cm</span>
        </label>
        <input
          type="range"
          min={130}
          max={220}
          value={armSpan}
          onChange={(e) => setArmSpan(Number(e.target.value))}
          className="w-full accent-rock-400"
        />
        <div className="flex justify-between text-xs text-rock-500">
          <span>130cm</span>
          <span className={`font-medium ${Number(apeIndex) > 1.02 ? 'text-green-400' : Number(apeIndex) < 0.98 ? 'text-yellow-400' : 'text-rock-300'}`}>
            Ape Index: {apeIndex}
          </span>
          <span>220cm</span>
        </div>
      </div>

      {/* How to measure guide */}
      <div className="bg-rock-800/50 rounded-lg p-3 text-xs text-rock-300 space-y-1">
        <p className="font-medium text-rock-200">How to measure arm span:</p>
        <p>Stand against a wall with arms fully extended to the sides. Measure fingertip to fingertip. If arm span {'>'} height, you have a positive ape index (great for climbing!).</p>
      </div>

      {/* Grade */}
      <div>
        <label className="block text-sm font-medium text-rock-200 mb-2">
          Climbing Grade
        </label>
        <div className="flex flex-wrap gap-2">
          {GRADE_OPTIONS.map((g) => (
            <button
              key={g}
              onClick={() => {
                setGrade(g);
                const v = parseInt(g.replace('V', ''));
                if (v <= 2) setExperience('beginner');
                else if (v <= 5) setExperience('intermediate');
                else setExperience('advanced');
              }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                grade === g
                  ? 'bg-rock-400 text-white'
                  : 'bg-rock-800 text-rock-300 hover:bg-rock-700'
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      {/* Experience */}
      <div>
        <label className="block text-sm font-medium text-rock-200 mb-2">
          Experience Level
        </label>
        <div className="grid grid-cols-3 gap-2">
          {(['beginner', 'intermediate', 'advanced'] as Experience[]).map((exp) => (
            <button
              key={exp}
              onClick={() => setExperience(exp)}
              className={`py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
                experience === exp
                  ? 'bg-rock-400 text-white'
                  : 'bg-rock-800 text-rock-300 hover:bg-rock-700'
              }`}
            >
              {exp}
            </button>
          ))}
        </div>
      </div>

      {/* Optional abilities for full-body (hands + feet) planning */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-rock-200 mb-1">
            Flexibility <span className="text-rock-400 text-xs">柔软度</span>
          </label>
          <p className="text-[11px] text-rock-400 mb-2">High ≈ near-splits; sets your high-step limit</p>
          <div className="grid grid-cols-3 gap-1">
            {(['low', 'medium', 'high'] as AbilityLevel[]).map((v) => (
              <button
                key={v}
                data-testid={`flexibility-${v}`}
                onClick={() => setFlexibility(v)}
                className={`py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                  flexibility === v ? 'bg-rock-400 text-white' : 'bg-rock-800 text-rock-300 hover:bg-rock-700'
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-rock-200 mb-1">
            Pull strength <span className="text-rock-400 text-xs">力量</span>
          </label>
          <p className="text-[11px] text-rock-400 mb-2">High ≈ controlled lock-off; gates dynamic moves</p>
          <div className="grid grid-cols-3 gap-1">
            {(['low', 'medium', 'high'] as AbilityLevel[]).map((v) => (
              <button
                key={v}
                data-testid={`strength-${v}`}
                onClick={() => setStrength(v)}
                className={`py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                  strength === v ? 'bg-rock-400 text-white' : 'bg-rock-800 text-rock-300 hover:bg-rock-700'
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Derived Stats Preview */}
      <div className="bg-rock-800/50 rounded-lg p-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <div className="text-rock-400 text-xs">Arm Length</div>
          <div className="text-rock-100 font-medium">{Math.round(measurements.armLength)} cm</div>
        </div>
        <div>
          <div className="text-rock-400 text-xs">Standing Reach</div>
          <div className="text-rock-100 font-medium">{Math.round(measurements.standingReach)} cm</div>
        </div>
        <div>
          <div className="text-rock-400 text-xs">Leg Reach</div>
          <div className="text-rock-100 font-medium">{Math.round(measurements.legReach)} cm</div>
        </div>
        <div>
          <div className="text-rock-400 text-xs">Shoulder Height</div>
          <div className="text-rock-100 font-medium">{Math.round(measurements.shoulderHeight)} cm</div>
        </div>
      </div>

      {/* Submit */}
      <button
        onClick={() => onSubmit({ height, armSpan, grade, experience, flexibility, strength })}
        className="w-full rounded-xl bg-rock-400 py-3.5 text-lg font-semibold text-white transition-colors hover:bg-rock-500"
      >
        Continue to wall photo →
      </button>

        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-rock-400">
          <span>Photo → calibration → correctable beta</span>
          <span aria-hidden="true">·</span>
          <a href="/?sample=holds" className="hover:text-rock-200">Explore the interaction lab</a>
          <span aria-hidden="true">·</span>
          <span>No account required</span>
        </div>
        </main>
      </div>
    </div>
  );
}
