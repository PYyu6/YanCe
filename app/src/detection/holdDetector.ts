/**
 * Hold Detection via Color Segmentation
 * ──────────────────────────────────────
 * Indoor climbing gyms color-code routes — all holds on one route share a color.
 * This module detects holds by:
 * 1. User picks the route color (taps a hold in the image)
 * 2. We filter the image for pixels matching that color in HSV space
 * 3. Connected component analysis finds individual hold blobs
 * 4. Each blob's center becomes a DetectedHold
 *
 * The user can then manually correct (add/remove holds).
 */

import { DetectedHold, Point, CalibrationResult } from '../types';

// ── Color conversion helpers ────────────────────────────────────────────────

interface HSV { h: number; s: number; v: number }

function rgbToHsv(r: number, g: number, b: number): HSV {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;

  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  const s = max === 0 ? 0 : d / max;
  return { h, s, v: max };
}

// ── Detection parameters ────────────────────────────────────────────────────

// How close a pixel's HSV must be to the target color to count as a match
const HUE_TOLERANCE = 20;           // degrees (out of 360)
const SATURATION_MIN = 0.15;        // minimum saturation to avoid gray/white
const VALUE_MIN = 0.1;              // minimum brightness to avoid black
const SATURATION_TOLERANCE = 0.3;   // how much saturation can differ from target
const VALUE_TOLERANCE = 0.35;       // how much brightness can differ from target

// Minimum blob size to count as a hold (as fraction of image area)
const MIN_HOLD_AREA_FRACTION = 0.0002;  // ~0.02% of image
const MAX_HOLD_AREA_FRACTION = 0.02;    // ~2% of image

/**
 * Get the dominant color at a point in the image (average of small neighborhood).
 */
export function sampleColor(
  canvas: HTMLCanvasElement,
  point: Point,
  radius: number = 5,
): string {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return '#888888';

  const x = Math.max(radius, Math.min(canvas.width - radius, Math.round(point.x)));
  const y = Math.max(radius, Math.min(canvas.height - radius, Math.round(point.y)));
  const imageData = ctx.getImageData(x - radius, y - radius, radius * 2, radius * 2);
  const data = imageData.data;

  let rSum = 0, gSum = 0, bSum = 0, count = 0;
  for (let i = 0; i < data.length; i += 4) {
    rSum += data[i];
    gSum += data[i + 1];
    bSum += data[i + 2];
    count++;
  }

  const r = Math.round(rSum / count);
  const g = Math.round(gSum / count);
  const b = Math.round(bSum / count);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * Parse hex color to RGB.
 */
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

/**
 * Detect holds matching a target color in the captured image.
 *
 * @param canvas - Canvas with the wall image
 * @param targetColor - Hex color of the route (from user tap)
 * @param calibration - Scale calibration result
 * @returns Array of detected holds
 */
export function detectHoldsByColor(
  canvas: HTMLCanvasElement,
  targetColor: string,
  calibration: CalibrationResult,
): DetectedHold[] {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [];

  const w = canvas.width;
  const h = canvas.height;
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  // Convert target color to HSV
  const [tr, tg, tb] = hexToRgb(targetColor);
  const targetHsv = rgbToHsv(tr, tg, tb);

  // Step 1: Create binary mask of pixels matching the target color
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < mask.length; i++) {
    const j = i * 4;
    const hsv = rgbToHsv(data[j], data[j + 1], data[j + 2]);

    // Check HSV proximity to target
    let hueDiff = Math.abs(hsv.h - targetHsv.h);
    if (hueDiff > 180) hueDiff = 360 - hueDiff; // wrap around

    const satOk = hsv.s >= SATURATION_MIN && Math.abs(hsv.s - targetHsv.s) < SATURATION_TOLERANCE;
    const valOk = hsv.v >= VALUE_MIN && Math.abs(hsv.v - targetHsv.v) < VALUE_TOLERANCE;
    const hueOk = hueDiff < HUE_TOLERANCE;

    mask[i] = (hueOk && satOk && valOk) ? 1 : 0;
  }

  // Step 2: Connected component labeling (BFS flood fill)
  const visited = new Uint8Array(w * h);
  const blobs: Point[][] = [];
  const imageArea = w * h;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (mask[idx] === 1 && !visited[idx]) {
        const blob: Point[] = [];
        const queue: number[] = [idx];
        visited[idx] = 1;

        while (queue.length > 0) {
          const ci = queue.pop()!;
          const cx = ci % w;
          const cy = Math.floor(ci / w);
          blob.push({ x: cx, y: cy });

          // 4-connected neighbors
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
              const ni = ny * w + nx;
              if (mask[ni] === 1 && !visited[ni]) {
                visited[ni] = 1;
                queue.push(ni);
              }
            }
          }
        }

        blobs.push(blob);
      }
    }
  }

  // Step 3: Filter blobs by size and convert to DetectedHold
  const holds: DetectedHold[] = [];
  let holdIndex = 0;

  for (const blob of blobs) {
    const areaFraction = blob.length / imageArea;
    if (areaFraction < MIN_HOLD_AREA_FRACTION || areaFraction > MAX_HOLD_AREA_FRACTION) continue;

    // Compute centroid
    let sumX = 0, sumY = 0;
    for (const p of blob) {
      sumX += p.x;
      sumY += p.y;
    }
    const cx = sumX / blob.length;
    const cy = sumY / blob.length;

    // Approximate radius
    const radius = Math.sqrt(blob.length / Math.PI);

    // Convert pixel position to world coordinates (cm from origin)
    const worldX = (cx - calibration.originPixel.x) / calibration.pixelsPerCm;
    // Y is inverted: image Y goes down, world Y goes up
    const worldY = (calibration.originPixel.y - cy) / calibration.pixelsPerCm;

    holds.push({
      id: `hold-${holdIndex++}`,
      pixelCenter: { x: Math.round(cx), y: Math.round(cy) },
      worldCenter: { x: Math.round(worldX * 10) / 10, y: Math.round(worldY * 10) / 10 },
      pixelRadius: Math.round(radius),
      color: targetColor,
      routeColor: targetColor,
      isStart: false,
      isTop: false,
      manuallyAdded: false,
    });
  }

  // Sort by vertical position (highest world Y = top of route)
  holds.sort((a, b) => b.worldCenter.y - a.worldCenter.y);

  // Auto-mark start (lowest) and top (highest) holds
  if (holds.length >= 2) {
    holds[holds.length - 1].isStart = true;  // lowest hold = start
    holds[holds.length - 2].isStart = true;  // second lowest = start (two hands)
    holds[0].isTop = true;                   // highest = top
  }

  return holds;
}

/**
 * Create a manually-added hold at a given pixel position.
 */
export function createManualHold(
  pixelPos: Point,
  calibration: CalibrationResult,
  routeColor: string,
  existingHolds: DetectedHold[],
): DetectedHold {
  const worldX = (pixelPos.x - calibration.originPixel.x) / calibration.pixelsPerCm;
  const worldY = (calibration.originPixel.y - pixelPos.y) / calibration.pixelsPerCm;

  return {
    id: `hold-manual-${existingHolds.length}`,
    pixelCenter: pixelPos,
    worldCenter: { x: Math.round(worldX * 10) / 10, y: Math.round(worldY * 10) / 10 },
    pixelRadius: 15,
    color: routeColor,
    routeColor,
    isStart: false,
    isTop: false,
    manuallyAdded: true,
  };
}

/**
 * Draw detected holds on overlay canvas.
 */
export function drawHoldsOverlay(
  ctx: CanvasRenderingContext2D,
  holds: DetectedHold[],
  selectedId: string | null = null,
): void {
  for (const hold of holds) {
    const { x, y } = hold.pixelCenter;
    const r = Math.max(hold.pixelRadius, 12);

    // Circle around hold
    ctx.strokeStyle = hold.isStart ? '#22c55e' : hold.isTop ? '#ef4444' : '#ffffff';
    ctx.lineWidth = selectedId === hold.id ? 4 : 2;
    ctx.beginPath();
    ctx.arc(x, y, r + 4, 0, Math.PI * 2);
    ctx.stroke();

    // Label
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px Inter, sans-serif';
    ctx.textAlign = 'center';
    const label = hold.isStart ? 'S' : hold.isTop ? 'TOP' : hold.id.split('-').pop()!;
    ctx.fillText(label, x, y - r - 8);
    ctx.textAlign = 'left';
  }
}
