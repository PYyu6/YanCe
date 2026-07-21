/**
 * CameraWizard — Step 2
 * ─────────────────────
 * Guides the user to position their camera correctly for wall capture.
 * Shows live camera feed with overlay checks:
 * - Angle (perpendicular to wall)
 * - Level (not tilted sideways)
 * - Stability (not shaking)
 * - Blur (image sharpness)
 *
 * On desktop (no gyroscope), angle/level checks are skipped.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { CameraCheck } from '../types';
import {
  runCameraChecks,
  startOrientationTracking,
  stopOrientationTracking,
  isOrientationSupported,
} from '../calibration/cameraChecks';
import BubbleLevel from './BubbleLevel';

interface Props {
  onCapture: (dataUrl: string, width: number, height: number) => void;
  onBack: () => void;
}

export default function CameraWizard({ onCapture, onBack }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);

  const [checks, setChecks] = useState<CameraCheck | null>(null);
  const [hasOrientation, setHasOrientation] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);

  // Start camera
  useEffect(() => {
    let mounted = true;
    async function init() {
      try {
        // Prefer rear camera for wall capture
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
        if (!mounted) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setCameraReady(true);
        }
      } catch (err) {
        console.error('Camera access denied:', err);
      }

      // Start orientation tracking (mobile only)
      if (isOrientationSupported()) {
        const ok = await startOrientationTracking();
        if (mounted) setHasOrientation(ok);
      }
    }
    init();
    return () => {
      mounted = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      stopOrientationTracking();
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Run checks on each frame
  useEffect(() => {
    if (!cameraReady) return;

    function loop() {
      if (videoRef.current && canvasRef.current) {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0);
          const result = runCameraChecks(canvas);
          setChecks(result);
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    }
    loop();
    return () => cancelAnimationFrame(rafRef.current);
  }, [cameraReady]);

  // Capture photo with countdown
  const handleCapture = useCallback(() => {
    setCountdown(3);
    let count = 3;
    const timer = setInterval(() => {
      count--;
      if (count === 0) {
        clearInterval(timer);
        setCountdown(null);
        // Capture from canvas
        if (canvasRef.current) {
          const dataUrl = canvasRef.current.toDataURL('image/jpeg', 0.92);
          const w = canvasRef.current.width;
          const h = canvasRef.current.height;
          // Stop camera
          streamRef.current?.getTracks().forEach((t) => t.stop());
          onCapture(dataUrl, w, h);
        }
      } else {
        setCountdown(count);
      }
    }, 1000);
  }, [onCapture]);

  const allGood = checks?.allGood || (!hasOrientation && checks?.blur.ok);

  return (
    <div className="relative w-full h-screen bg-black flex flex-col">
      {/* Camera feed */}
      <div className="relative flex-1 overflow-hidden">
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          playsInline
          muted
          autoPlay
        />
        {/* Hidden canvas for frame analysis */}
        <canvas ref={canvasRef} className="hidden" />

        {/* Overlay: frame guide */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-8 border-2 border-dashed border-white/30 rounded-lg" />
          <div className="absolute top-10 left-0 right-0 text-center text-white/60 text-sm">
            Fit the climbing route inside the frame
          </div>
        </div>

        {/* Bubble level (mobile only) */}
        {hasOrientation && (
          <div className="absolute top-16 right-4">
            <BubbleLevel
              angleOk={checks?.angle.ok ?? false}
              levelOk={checks?.level.ok ?? false}
            />
          </div>
        )}

        {/* Countdown overlay */}
        {countdown !== null && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <div className="text-8xl font-bold text-white animate-ping">
              {countdown}
            </div>
          </div>
        )}
      </div>

      {/* Check status panel */}
      <div className="bg-rock-900/95 p-4 space-y-2">
        {/* Positioning instructions */}
        <div className="bg-rock-800/60 rounded-lg p-3 mb-3">
          <p className="text-rock-200 text-sm font-medium mb-1">Camera Positioning Guide:</p>
          <ol className="text-rock-300 text-xs space-y-0.5 list-decimal list-inside">
            <li>Stand 2-4 meters from the wall</li>
            <li>Hold phone at chest height, facing straight at the wall</li>
            <li>Keep the phone level and steady</li>
            <li>Make sure the entire route fits in the frame</li>
          </ol>
        </div>

        {checks && (
          <div className="space-y-1.5">
            {hasOrientation && (
              <>
                <CheckRow
                  label="Angle"
                  ok={checks.angle.ok}
                  message={checks.angle.message}
                  value={`${checks.angle.value.toFixed(1)}°`}
                />
                <CheckRow
                  label="Level"
                  ok={checks.level.ok}
                  message={checks.level.message}
                  value={`${checks.level.value.toFixed(1)}°`}
                />
              </>
            )}
            <CheckRow
              label="Stability"
              ok={checks.stability.ok}
              message={checks.stability.message}
              value={`${checks.stability.value}`}
            />
            <CheckRow
              label="Sharpness"
              ok={checks.blur.ok}
              message={checks.blur.message}
              value={`${checks.blur.value}`}
            />
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button
            onClick={onBack}
            className="px-4 py-2.5 bg-rock-800 text-rock-300 rounded-lg hover:bg-rock-700 transition-colors"
          >
            Back
          </button>
          <button
            onClick={handleCapture}
            disabled={!cameraReady || countdown !== null}
            className={`flex-1 py-2.5 rounded-lg font-semibold transition-colors ${
              allGood
                ? 'bg-green-600 hover:bg-green-700 text-white'
                : 'bg-rock-400 hover:bg-rock-500 text-white'
            }`}
          >
            {allGood ? 'Capture Photo' : 'Capture Anyway'}
          </button>
        </div>

        {!hasOrientation && (
          <p className="text-rock-500 text-xs text-center">
            Gyroscope not available — angle/level checks skipped (desktop mode)
          </p>
        )}
      </div>
    </div>
  );
}

function CheckRow({ label, ok, message, value }: {
  label: string; ok: boolean; message: string; value: string;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className={`text-lg ${ok ? 'text-green-400' : 'text-yellow-400'}`}>
        {ok ? '\u2705' : '\u26A0\uFE0F'}
      </span>
      <span className="text-rock-200 font-medium w-20">{label}</span>
      <span className="text-rock-400 flex-1 text-xs">{message}</span>
      <span className="text-rock-500 text-xs font-mono">{value}</span>
    </div>
  );
}
