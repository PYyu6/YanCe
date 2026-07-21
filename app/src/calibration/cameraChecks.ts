/**
 * Camera Positioning Checks
 * ─────────────────────────
 * Uses Device Orientation API + image analysis to validate camera placement.
 * Each check returns ok/not-ok with a human-readable instruction.
 *
 * Checks:
 * 1. Angle — phone perpendicular to wall (< 5° off)
 * 2. Level — not tilted sideways (< 3° tilt)
 * 3. Stability — not shaking (low acceleration variance)
 * 4. Blur — image sharp enough (Laplacian variance > threshold)
 */

import { CameraCheck, CheckResult } from '../types';

// ── Thresholds ──────────────────────────────────────────────────────────────

const ANGLE_THRESHOLD = 8;      // degrees — phone should face wall within this tolerance
const LEVEL_THRESHOLD = 5;      // degrees — sideways tilt tolerance
const STABILITY_WINDOW = 20;    // number of motion samples to average
const STABILITY_THRESHOLD = 1.5; // m/s² variance — below this = steady enough
const BLUR_THRESHOLD = 50;      // Laplacian variance — above this = sharp enough

// ── Orientation tracking ────────────────────────────────────────────────────

// Stores recent device orientation readings
let orientationAlpha = 0;  // compass direction (not used for checks)
let orientationBeta = 0;   // front-back tilt: 0 = flat, 90 = vertical facing user
let orientationGamma = 0;  // left-right tilt: 0 = level

// Stores recent acceleration samples for stability check
let motionSamples: number[] = [];

/**
 * Start listening to device orientation events.
 * On iOS 13+, requires permission request first.
 */
export async function startOrientationTracking(): Promise<boolean> {
  // iOS 13+ requires explicit permission
  const doe = DeviceOrientationEvent as any;
  if (typeof doe.requestPermission === 'function') {
    try {
      const permission = await doe.requestPermission();
      if (permission !== 'granted') return false;
    } catch {
      return false;
    }
  }

  window.addEventListener('deviceorientation', handleOrientation, true);
  window.addEventListener('devicemotion', handleMotion, true);
  return true;
}

export function stopOrientationTracking(): void {
  window.removeEventListener('deviceorientation', handleOrientation, true);
  window.removeEventListener('devicemotion', handleMotion, true);
  motionSamples = [];
}

function handleOrientation(e: DeviceOrientationEvent): void {
  orientationAlpha = e.alpha ?? 0;
  orientationBeta = e.beta ?? 0;
  orientationGamma = e.gamma ?? 0;
}

function handleMotion(e: DeviceMotionEvent): void {
  const acc = e.accelerationIncludingGravity;
  if (!acc) return;
  // Magnitude of acceleration deviation from gravity
  const magnitude = Math.sqrt(
    (acc.x ?? 0) ** 2 + (acc.y ?? 0) ** 2 + (acc.z ?? 0) ** 2,
  );
  motionSamples.push(magnitude);
  if (motionSamples.length > STABILITY_WINDOW) {
    motionSamples.shift();
  }
}

// ── Check functions ─────────────────────────────────────────────────────────

/**
 * Check if phone is roughly perpendicular to wall.
 * When holding phone in portrait facing a wall:
 * - beta ≈ 90° means phone is vertical (good)
 * - beta ≈ 0° means phone is flat (bad)
 * We want beta close to 90°.
 */
function checkAngle(): CheckResult {
  // Beta: 0 = flat, 90 = vertical facing user, 180 = flat upside down
  // We want approximately 90° (phone vertical, camera facing forward)
  const deviation = Math.abs(orientationBeta - 90);
  const ok = deviation < ANGLE_THRESHOLD;
  let message = 'Camera facing wall — good!';
  if (!ok) {
    if (orientationBeta < 90 - ANGLE_THRESHOLD) {
      message = 'Tilt phone more upright — it\'s angled too far back';
    } else if (orientationBeta > 90 + ANGLE_THRESHOLD) {
      message = 'Tilt phone slightly back — it\'s angled too far forward';
    }
  }
  return { ok, value: deviation, threshold: ANGLE_THRESHOLD, message };
}

/**
 * Check if phone is level (not tilted sideways).
 * Gamma = left/right tilt. 0 = perfectly level.
 */
function checkLevel(): CheckResult {
  const tilt = Math.abs(orientationGamma);
  const ok = tilt < LEVEL_THRESHOLD;
  let message = 'Phone is level — good!';
  if (!ok) {
    message = orientationGamma > 0
      ? 'Tilt phone left to level it'
      : 'Tilt phone right to level it';
  }
  return { ok, value: tilt, threshold: LEVEL_THRESHOLD, message };
}

/**
 * Check if phone is steady enough for a clear photo.
 * Computes variance of recent acceleration samples.
 */
function checkStability(): CheckResult {
  if (motionSamples.length < 5) {
    return {
      ok: false,
      value: 999,
      threshold: STABILITY_THRESHOLD,
      message: 'Hold still — gathering stability data...',
    };
  }
  const mean = motionSamples.reduce((a, b) => a + b, 0) / motionSamples.length;
  const variance =
    motionSamples.reduce((sum, v) => sum + (v - mean) ** 2, 0) /
    motionSamples.length;
  const ok = variance < STABILITY_THRESHOLD;
  return {
    ok,
    value: Math.round(variance * 100) / 100,
    threshold: STABILITY_THRESHOLD,
    message: ok ? 'Holding steady — good!' : 'Hold the phone steadier',
  };
}

/**
 * Check if the current camera frame is sharp enough.
 * Uses Laplacian variance on a canvas context as a blur indicator.
 * Higher variance = sharper image.
 */
export function checkBlur(canvas: HTMLCanvasElement): CheckResult {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    return { ok: false, value: 0, threshold: BLUR_THRESHOLD, message: 'Cannot access image' };
  }

  const w = canvas.width;
  const h = canvas.height;
  // Downsample for speed: analyze a center 200x200 patch
  const patchSize = Math.min(200, w, h);
  const sx = Math.floor((w - patchSize) / 2);
  const sy = Math.floor((h - patchSize) / 2);
  const imageData = ctx.getImageData(sx, sy, patchSize, patchSize);
  const data = imageData.data;

  // Convert to grayscale
  const gray: number[] = [];
  for (let i = 0; i < data.length; i += 4) {
    gray.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  }

  // Apply 3x3 Laplacian kernel and compute variance
  // Kernel: [0 1 0; 1 -4 1; 0 1 0]
  let sum = 0;
  let sumSq = 0;
  let count = 0;
  for (let y = 1; y < patchSize - 1; y++) {
    for (let x = 1; x < patchSize - 1; x++) {
      const idx = y * patchSize + x;
      const lap =
        gray[idx - patchSize] +
        gray[idx - 1] +
        gray[idx + 1] +
        gray[idx + patchSize] -
        4 * gray[idx];
      sum += lap;
      sumSq += lap * lap;
      count++;
    }
  }
  const mean = sum / count;
  const variance = sumSq / count - mean * mean;
  const ok = variance > BLUR_THRESHOLD;

  return {
    ok,
    value: Math.round(variance),
    threshold: BLUR_THRESHOLD,
    message: ok ? 'Image is sharp — good!' : 'Image looks blurry — hold steadier or improve lighting',
  };
}

// ── Combined check ──────────────────────────────────────────────────────────

/**
 * Run all camera positioning checks and return combined result.
 * Call this on each animation frame during the camera wizard.
 */
export function runCameraChecks(canvas: HTMLCanvasElement | null): CameraCheck {
  const angle = checkAngle();
  const level = checkLevel();
  const stability = checkStability();
  const blur = canvas ? checkBlur(canvas) : {
    ok: false, value: 0, threshold: BLUR_THRESHOLD, message: 'Waiting for camera...',
  };

  return {
    angle,
    level,
    stability,
    blur,
    allGood: angle.ok && level.ok && stability.ok && blur.ok,
  };
}

/**
 * Check whether Device Orientation API is available.
 * Desktop browsers often don't support it, so we skip those checks.
 */
export function isOrientationSupported(): boolean {
  return 'DeviceOrientationEvent' in window;
}
