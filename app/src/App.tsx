/**
 * App.tsx — Main application shell
 * ─────────────────────────────────
 * Orchestrates the 5-step user flow:
 * 1. Profile Setup    → Enter body measurements
 * 2. Camera Wizard    → Position camera, capture wall photo
 * 3. Calibration      → A4 paper or body-height scale calibration
 * 4. Hold Detection   → Color-pick route, detect + correct holds
 * 5. Analysis         → View beta strategies with visual overlay
 */

import { useEffect, useState } from 'react';
import { useAppStore } from './store/useAppStore';

import ProfileSetup from './components/ProfileSetup';
import CameraWizard from './components/CameraWizard';
import CalibrationStep from './components/CalibrationStep';
import HoldDetectionStep from './components/HoldDetectionStep';
import RouteView from './components/RouteView';
import MoveStepper from './components/MoveStepper';
import StrategyPanel from './components/StrategyPanel';
import PhotoUpload from './components/PhotoUpload';
import ComparisonView from './components/ComparisonView';
import LiveCoachPanel from './components/LiveCoachPanel';
import OnlineSampleLab from './components/OnlineSampleLab';
import ClimbingIntelligenceLab from './components/ClimbingIntelligenceLab';
import GptCoachPanel from './components/GptCoachPanel';
import FullBodyPanel from './components/FullBodyPanel';
import { contrastProfile } from './services/betaForProfile';
import { getDetectionFlags } from './services/featureFlags';
import {
  isDemoRequested,
  applyDemoSeed,
  buildDemoWallImage,
  buildDemoSeed,
  DEMO_BADGE_TEXT,
} from './services/demoSeed';

export default function App() {
  const {
    step, profile, capturedImage, imageSize,
    calibration, holds, analysis,
    currentBetaIndex, currentMoveStep,
    setProfile, setCapturedImage, setCalibration,
    setHolds, runAnalysis, goBack,
    setCurrentBeta, setCurrentMove, reset,
  } = useAppStore();

  const [showReachCircles, setShowReachCircles] = useState(true);
  // Comparison is a toggled section (not a separate step): the demo beat is
  // "here's YOUR beta … now watch it change for a different body" — that beat
  // needs to happen on the analysis screen without losing context.
  const [showComparison, setShowComparison] = useState(false);
  // Interface-first live-coach preview. This is intentionally separate from
  // the current still-photo analysis: until a pose/contact adapter exists the
  // panel discloses that it replays a recorded fixture. Keeping it opt-in also
  // preserves the proven submission flow and its existing browser tests.
  const [showLiveCoach, setShowLiveCoach] = useState(false);
  // Four-limb planned beta (hands + feet + technique chooser). Opt-in toggle
  // for the same reason as comparison: it re-plans the route several times
  // (once per technique preference) when opened.
  const [showFullBody, setShowFullBody] = useState(false);

  // ?demo=1 — the judge path: seed the proven synthetic wall + tall profile
  // through the REAL store actions and land directly on analysis. Only inputs
  // are injected; runAnalysis computes genuine engine output, and the analyze
  // screen shows a disclosure badge whenever this ran (honesty contract in
  // demoSeed.ts). Guarded on the profile step so reloads or manual navigation
  // never clobber in-progress real sessions.
  const urlParams = new URLSearchParams(window.location.search);
  const demoRequested = isDemoRequested(urlParams);
  useEffect(() => {
    if (demoRequested && useAppStore.getState().step === 'profile') {
      const wallImage = buildDemoWallImage(buildDemoSeed().wallSpec);
      applyDemoSeed(useAppStore.getState(), wallImage);
    }
  }, [demoRequested]);

  // Direct sample route for reviewers/users who want immediate proof without
  // completing the five-step wall setup. The page owns its disclosure and does
  // not mutate the normal app store or claim the demo trace came from pixels.
  const sample = urlParams.get('sample');
  if (sample === 'holds') {
    return <ClimbingIntelligenceLab />;
  }
  if (sample === 'video') {
    return <OnlineSampleLab onBack={() => { window.location.href = '/?mode=classic'; }} />;
  }

  // ── Step 1: Profile ─────────────────────────────────────────────────────

  if (step === 'profile') {
    return <ProfileSetup onSubmit={setProfile} />;
  }

  // ── Step 2: Camera ──────────────────────────────────────────────────────

  if (step === 'camera') {
    return (
      // Wrapper instead of modifying CameraWizard: the wizard stays a pure
      // live-camera component; the upload alternative floats above it. If the
      // camera fails (no permission, no device — e.g. desktop or CI), the
      // upload path is unaffected because it never touches getUserMedia.
      <div className="relative h-screen">
        <CameraWizard
          onCapture={(dataUrl, w, h) => setCapturedImage(dataUrl, w, h)}
          onBack={goBack}
        />
        <div className="absolute top-3 left-3 z-50">
          <PhotoUpload onLoaded={(dataUrl, w, h) => setCapturedImage(dataUrl, w, h)} />
        </div>
      </div>
    );
  }

  // ── Step 3: Calibration ─────────────────────────────────────────────────

  if (step === 'calibrate' && capturedImage && imageSize) {
    return (
      <CalibrationStep
        imageUrl={capturedImage}
        imageWidth={imageSize.width}
        imageHeight={imageSize.height}
        onCalibrated={setCalibration}
        onBack={goBack}
      />
    );
  }

  // ── Step 4: Hold Detection ──────────────────────────────────────────────

  if (step === 'detect' && capturedImage && imageSize && calibration) {
    return (
      <HoldDetectionStep
        imageUrl={capturedImage}
        imageWidth={imageSize.width}
        imageHeight={imageSize.height}
        calibration={calibration}
        holds={holds}
        onHoldsChanged={setHolds}
        onDone={runAnalysis}
        onBack={goBack}
      />
    );
  }

  // ── Step 5: Analysis ────────────────────────────────────────────────────

  if (step === 'analyze' && analysis && capturedImage && imageSize) {
    const currentBeta = analysis.betas[currentBetaIndex];
    const currentMove = currentBeta?.moves[currentMoveStep] ?? null;
    const armLengthPx = analysis.measurements.armLength * analysis.calibration.pixelsPerCm;
    const fusedMode = getDetectionFlags().useVlmVerify;

    return (
      <div className="flex flex-col h-screen bg-rock-900 lg:flex-row">
        {/* Route visualization (main area). min-h keeps the wall visible in
            the stacked (sub-lg) layout — without it the side panel's
            intrinsic height swallows h-screen and this flex-1 area collapses
            to 0px, hiding the entire route view on phones. */}
        <div className="flex-1 relative overflow-hidden min-h-[45vh] lg:min-h-0">
          <RouteView
            imageUrl={capturedImage}
            imageWidth={imageSize.width}
            imageHeight={imageSize.height}
            holds={analysis.holds}
            currentMove={currentMove}
            reachMap={analysis.reachMap}
            showReachCircles={showReachCircles}
            armLengthPx={armLengthPx}
          />

          {/* Top bar */}
          <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-3 bg-gradient-to-b from-black/60 to-transparent">
            <button
              onClick={goBack}
              className="px-3 py-1.5 bg-black/40 backdrop-blur text-white/80 rounded-lg text-sm hover:bg-black/60"
            >
              &larr; Back
            </button>
            <h1 className="text-white font-bold text-lg">
              岩策 <span className="text-white/60 text-sm font-normal">YánCè</span>
            </h1>
            <div className="flex gap-2">
              <button
                onClick={() => setShowReachCircles(!showReachCircles)}
                className={`px-3 py-1.5 rounded-lg text-sm backdrop-blur ${
                  showReachCircles
                    ? 'bg-rock-400/40 text-white'
                    : 'bg-black/40 text-white/60'
                }`}
              >
                Reach
              </button>
              <button
                onClick={reset}
                className="px-3 py-1.5 bg-black/40 backdrop-blur text-white/60 rounded-lg text-sm hover:text-white"
              >
                New
              </button>
            </div>
          </div>
        </div>

        {/* Side panel: strategy + stepper */}
        <div className="lg:w-96 bg-rock-900 border-t lg:border-t-0 lg:border-l border-rock-800 overflow-y-auto">
          <div className="p-4 space-y-4">
            {demoRequested && (
              <div
                data-testid="demo-badge"
                className="rounded-lg border border-amber-400/30 bg-amber-900/20 px-3 py-2 text-center text-xs font-semibold text-amber-200"
              >
                {DEMO_BADGE_TEXT}
              </div>
            )}
            <button
              data-testid="live-coach-toggle"
              onClick={() => setShowLiveCoach(!showLiveCoach)}
              className={`w-full py-2.5 rounded-lg font-semibold transition-colors ${
                showLiveCoach
                  ? 'bg-blue-600 text-white'
                  : 'bg-rock-800 text-blue-200 hover:bg-rock-700'
              }`}
            >
              {showLiveCoach ? 'Hide live copilot preview' : '🧭 Live copilot preview'}
            </button>
            {showLiveCoach && currentBeta && (
              <LiveCoachPanel holds={analysis.holds} beta={currentBeta} />
            )}

            <button
              data-testid="full-body-toggle"
              onClick={() => setShowFullBody(!showFullBody)}
              className={`w-full py-2.5 rounded-lg font-semibold transition-colors ${
                showFullBody
                  ? 'bg-teal-600 text-white'
                  : 'bg-rock-800 text-teal-200 hover:bg-rock-700'
              }`}
            >
              {showFullBody ? 'Hide full-body beta' : '🦶 Full-body beta (hands + feet)'}
            </button>
            {showFullBody && profile && (
              <FullBodyPanel
                holds={analysis.holds}
                measurements={analysis.measurements}
                profile={profile}
              />
            )}

            {/* The demo money-shot: same wall, a different body, a different
                beta. Toggled, not always-on — its render cost is a full second
                engine run for the contrast profile. */}
            <button
              data-testid="compare-toggle"
              onClick={() => setShowComparison(!showComparison)}
              className={`w-full py-2.5 rounded-lg font-semibold transition-colors ${
                showComparison
                  ? 'bg-rock-400 text-white'
                  : 'bg-rock-800 text-rock-300 hover:bg-rock-700'
              }`}
            >
              {showComparison ? 'Hide comparison' : '🧍🧍 Compare bodies'}
            </button>
            {showComparison && profile && (
              <ComparisonView
                holds={analysis.holds}
                calibration={analysis.calibration}
                profileA={profile}
                profileB={contrastProfile(profile)}
              />
            )}

            {/* Beta stepper */}
            {currentBeta && (
              <MoveStepper
                beta={currentBeta}
                currentStep={currentMoveStep}
                onStepChange={setCurrentMove}
              />
            )}

            {fusedMode && currentBeta && (
              <GptCoachPanel
                beta={currentBeta}
                measurements={analysis.measurements}
                currentStep={currentMoveStep}
              />
            )}

            {/* Strategy panel */}
            <StrategyPanel
              analysis={analysis}
              currentBetaIndex={currentBetaIndex}
              onBetaChange={setCurrentBeta}
            />
          </div>
        </div>
      </div>
    );
  }

  // ── Fallback ────────────────────────────────────────────────────────────

  return (
    <div className="flex items-center justify-center h-screen">
      <div className="text-center space-y-4">
        <h1 className="text-3xl font-bold text-rock-100">岩策 YánCè</h1>
        <p className="text-rock-400">Something went wrong. Please start over.</p>
        <button
          onClick={reset}
          className="px-6 py-3 bg-rock-400 text-white rounded-lg hover:bg-rock-500"
        >
          Start Over
        </button>
      </div>
    </div>
  );
}
