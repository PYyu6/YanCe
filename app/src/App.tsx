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

import { useState } from 'react';
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
import { contrastProfile } from './services/betaForProfile';
import { getDetectionFlags } from './services/featureFlags';

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

  // Direct sample route for reviewers/users who want immediate proof without
  // completing the five-step wall setup. The page owns its disclosure and does
  // not mutate the normal app store or claim the demo trace came from pixels.
  const sample = new URLSearchParams(window.location.search).get('sample');
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
        {/* Route visualization (main area) */}
        <div className="flex-1 relative overflow-hidden">
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
