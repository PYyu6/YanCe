/**
 * CalibrationStep — Step 3
 * ────────────────────────
 * User calibrates the scale by either:
 * A) Automatic A4 paper detection (tap "Detect A4")
 * B) Manual body height calibration (tap head + feet)
 * C) Manual distance (tap two points + enter distance)
 *
 * Shows the captured image with calibration overlay.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { CalibrationResult, CalibrationMethod, Point } from '../types';
import { calibrateFromA4 } from '../calibration/a4Calibrator';
import { calibrateFromBody, calibrateFromManualDistance } from '../calibration/bodyCalibrator';
import { useAppStore } from '../store/useAppStore';

interface Props {
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  onCalibrated: (cal: CalibrationResult) => void;
  onBack: () => void;
}

type CalibMode = 'choose' | 'a4' | 'body' | 'manual';
type TapPhase = 'head' | 'feet' | 'point1' | 'point2' | 'done';

export default function CalibrationStep({ imageUrl, imageWidth, imageHeight, onCalibrated, onBack }: Props) {
  const profile = useAppStore((s) => s.profile);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const [mode, setMode] = useState<CalibMode>('choose');
  const [tapPhase, setTapPhase] = useState<TapPhase>('head');
  const [headPoint, setHeadPoint] = useState<Point | null>(null);
  const [feetPoint, setFeetPoint] = useState<Point | null>(null);
  const [point1, setPoint1] = useState<Point | null>(null);
  const [point2, setPoint2] = useState<Point | null>(null);
  const [manualDist, setManualDist] = useState(100);
  const [result, setResult] = useState<CalibrationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load image into canvas
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      drawImage();
    };
    img.src = imageUrl;
  }, [imageUrl]);

  function drawImage() {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    // Scale to fit container
    const container = canvas.parentElement!;
    const scale = Math.min(container.clientWidth / imageWidth, (window.innerHeight * 0.55) / imageHeight);
    canvas.width = imageWidth * scale;
    canvas.height = imageHeight * scale;
    canvas.dataset.scale = String(scale);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  }

  // Get image-space coordinates from a tap on the canvas
  function getImagePoint(e: React.MouseEvent<HTMLCanvasElement>): Point {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scale = parseFloat(canvas.dataset.scale ?? '1');
    return {
      x: (e.clientX - rect.left) / scale,
      y: (e.clientY - rect.top) / scale,
    };
  }

  // Handle canvas tap for body/manual calibration
  const handleCanvasTap = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const point = getImagePoint(e);

    if (mode === 'body') {
      if (tapPhase === 'head') {
        setHeadPoint(point);
        setTapPhase('feet');
      } else if (tapPhase === 'feet') {
        setFeetPoint(point);
        setTapPhase('done');
        // Auto-calibrate
        const cal = calibrateFromBody(headPoint!, point, profile?.height ?? 170);
        setResult(cal);
      }
    } else if (mode === 'manual') {
      if (tapPhase === 'point1') {
        setPoint1(point);
        setTapPhase('point2');
      } else if (tapPhase === 'point2') {
        setPoint2(point);
        setTapPhase('done');
      }
    }
  }, [mode, tapPhase, headPoint, profile]);

  // Draw overlay markers
  useEffect(() => {
    drawImage();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const scale = parseFloat(canvas.dataset.scale ?? '1');

    function drawPoint(p: Point, color: string, label: string) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p.x * scale, p.y * scale, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 12px Inter, sans-serif';
      ctx.fillText(label, p.x * scale + 12, p.y * scale + 4);
    }

    if (headPoint) drawPoint(headPoint, '#3b82f6', 'Head');
    if (feetPoint) drawPoint(feetPoint, '#3b82f6', 'Feet');
    if (point1) drawPoint(point1, '#f59e0b', 'A');
    if (point2) drawPoint(point2, '#f59e0b', 'B');

    // Draw line between points
    if (headPoint && feetPoint) {
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 3]);
      ctx.beginPath();
      ctx.moveTo(headPoint.x * scale, headPoint.y * scale);
      ctx.lineTo(feetPoint.x * scale, feetPoint.y * scale);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (point1 && point2) {
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 3]);
      ctx.beginPath();
      ctx.moveTo(point1.x * scale, point1.y * scale);
      ctx.lineTo(point2.x * scale, point2.y * scale);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [headPoint, feetPoint, point1, point2]);

  // A4 auto-detection
  function handleA4Detect() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Draw full-res image for detection
    const offscreen = document.createElement('canvas');
    offscreen.width = imageWidth;
    offscreen.height = imageHeight;
    const ctx = offscreen.getContext('2d')!;
    ctx.drawImage(imgRef.current!, 0, 0);
    const cal = calibrateFromA4(offscreen);
    if (cal) {
      setResult(cal);
      setError(null);
    } else {
      setError('Could not detect A4 paper. Make sure it\'s visible and well-lit. Try manual calibration instead.');
    }
  }

  // Manual distance calibration
  function handleManualCalibrate() {
    if (!point1 || !point2) return;
    const cal = calibrateFromManualDistance(point1, point2, manualDist);
    setResult(cal);
  }

  return (
    <div className="flex flex-col h-screen bg-rock-900">
      {/* Image canvas */}
      <div className="flex-1 relative overflow-hidden flex items-center justify-center p-2">
        <canvas
          ref={canvasRef}
          onClick={handleCanvasTap}
          className={`max-w-full max-h-full ${
            mode === 'body' || mode === 'manual' ? 'cursor-crosshair' : ''
          }`}
        />
      </div>

      {/* Controls */}
      <div className="bg-rock-900/95 p-4 space-y-3">
        {mode === 'choose' && (
          <>
            <p className="text-rock-200 text-sm font-medium">Choose calibration method:</p>
            <div className="grid grid-cols-1 gap-2">
              <button
                onClick={() => { setMode('a4'); handleA4Detect(); }}
                className="p-3 bg-rock-800 hover:bg-rock-700 rounded-lg text-left transition-colors"
              >
                <div className="text-rock-100 font-medium">A4 Paper Detection</div>
                <div className="text-rock-400 text-xs mt-0.5">
                  Place a white A4 sheet on the wall — auto-detected for precise scale
                </div>
              </button>
              <button
                onClick={() => { setMode('body'); setTapPhase('head'); }}
                className="p-3 bg-rock-800 hover:bg-rock-700 rounded-lg text-left transition-colors"
              >
                <div className="text-rock-100 font-medium">Body Height Reference</div>
                <div className="text-rock-400 text-xs mt-0.5">
                  Tap your head and feet in the photo — uses your height ({profile?.height ?? 170}cm) for scale
                </div>
              </button>
              <button
                onClick={() => { setMode('manual'); setTapPhase('point1'); }}
                className="p-3 bg-rock-800 hover:bg-rock-700 rounded-lg text-left transition-colors"
              >
                <div className="text-rock-100 font-medium">Manual Distance</div>
                <div className="text-rock-400 text-xs mt-0.5">
                  Tap two points with a known distance between them
                </div>
              </button>
            </div>
          </>
        )}

        {mode === 'body' && !result && (
          <div className="text-center">
            <p className="text-rock-200 text-sm font-medium">
              {tapPhase === 'head'
                ? 'Tap the TOP of your head in the photo'
                : tapPhase === 'feet'
                ? 'Now tap your FEET (where they touch the ground)'
                : 'Calibrating...'}
            </p>
            <p className="text-rock-400 text-xs mt-1">
              Using your height: {profile?.height ?? 170}cm
            </p>
          </div>
        )}

        {mode === 'manual' && !result && (
          <div className="space-y-2">
            <p className="text-rock-200 text-sm font-medium">
              {tapPhase === 'point1'
                ? 'Tap the FIRST point'
                : tapPhase === 'point2'
                ? 'Tap the SECOND point'
                : 'Set the real distance between the two points:'}
            </p>
            {tapPhase === 'done' && (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={manualDist}
                  onChange={(e) => setManualDist(Number(e.target.value))}
                  className="w-24 px-3 py-2 bg-rock-800 border border-rock-700 rounded-lg text-rock-100"
                  min={1}
                />
                <span className="text-rock-400">cm</span>
                <button
                  onClick={handleManualCalibrate}
                  className="px-4 py-2 bg-rock-400 text-white rounded-lg hover:bg-rock-500"
                >
                  Calibrate
                </button>
              </div>
            )}
          </div>
        )}

        {mode === 'a4' && !result && !error && (
          <p className="text-rock-300 text-sm text-center">Searching for A4 paper...</p>
        )}

        {error && (
          <div className="bg-red-900/30 border border-red-700/50 rounded-lg p-3">
            <p className="text-red-300 text-sm">{error}</p>
            <button
              onClick={() => { setMode('choose'); setError(null); }}
              className="text-red-400 text-xs underline mt-1"
            >
              Try another method
            </button>
          </div>
        )}

        {result && (
          <div className="bg-green-900/20 border border-green-700/40 rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-green-400 text-lg">&#x2705;</span>
              <span className="text-green-300 font-medium">Calibrated!</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-rock-400">Scale:</span>
                <span className="text-rock-100 ml-1">{result.pixelsPerCm.toFixed(1)} px/cm</span>
              </div>
              <div>
                <span className="text-rock-400">Confidence:</span>
                <span className="text-rock-100 ml-1">{(result.confidence * 100).toFixed(0)}%</span>
              </div>
              <div>
                <span className="text-rock-400">Method:</span>
                <span className="text-rock-100 ml-1 capitalize">{result.method}</span>
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={() => {
              if (mode !== 'choose') {
                setMode('choose');
                setResult(null);
                setError(null);
                setHeadPoint(null);
                setFeetPoint(null);
                setPoint1(null);
                setPoint2(null);
                setTapPhase('head');
              } else {
                onBack();
              }
            }}
            className="px-4 py-2.5 bg-rock-800 text-rock-300 rounded-lg hover:bg-rock-700 transition-colors"
          >
            {mode !== 'choose' ? 'Reset' : 'Back'}
          </button>
          {result && (
            <button
              onClick={() => onCalibrated(result)}
              className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-colors"
            >
              Next: Detect Holds
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
