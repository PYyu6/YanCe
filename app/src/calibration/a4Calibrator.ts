/**
 * A4 Paper Calibration
 * ────────────────────
 * Detects a white A4 sheet (29.7 × 21.0 cm) placed on the climbing wall.
 * Uses the known real-world dimensions to compute pixels-per-cm scale factor.
 *
 * Detection pipeline:
 * 1. Convert frame to grayscale
 * 2. Adaptive threshold to find bright rectangles
 * 3. Find contours → filter by area + aspect ratio matching A4 proportions
 * 4. Compute scale from the detected rectangle dimensions
 *
 * This runs entirely on Canvas 2D — no OpenCV dependency.
 */

import { CalibrationResult, Point } from '../types';

// A4 paper dimensions in cm
const A4_WIDTH_CM = 21.0;
const A4_HEIGHT_CM = 29.7;
const A4_RATIO = A4_HEIGHT_CM / A4_WIDTH_CM; // ~1.414

// Detection tolerances
const MIN_RECT_AREA_RATIO = 0.005;  // rectangle must be at least 0.5% of image area
const MAX_RECT_AREA_RATIO = 0.25;   // and at most 25%
const ASPECT_RATIO_TOLERANCE = 0.25; // how close to A4 ratio the detected rect must be

/**
 * Attempt to detect an A4 paper in the given canvas and compute calibration.
 *
 * @param canvas - Canvas containing the captured wall image
 * @returns CalibrationResult if A4 detected, null otherwise
 */
export function calibrateFromA4(canvas: HTMLCanvasElement): CalibrationResult | null {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  const w = canvas.width;
  const h = canvas.height;
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  // Step 1: Convert to grayscale
  const gray = new Uint8Array(w * h);
  for (let i = 0; i < gray.length; i++) {
    const j = i * 4;
    gray[i] = Math.round(0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2]);
  }

  // Step 2: Adaptive threshold — find bright regions (paper is white)
  // Use a simple global threshold: pixels brighter than 85th percentile
  const sorted = Array.from(gray).sort((a, b) => a - b);
  const threshold = sorted[Math.floor(sorted.length * 0.80)];
  const binary = gray.map((v) => (v > threshold ? 255 : 0));

  // Step 3: Connected component labeling to find white blobs
  const visited = new Uint8Array(w * h);
  const blobs: Point[][] = [];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (binary[idx] === 255 && !visited[idx]) {
        // BFS flood fill
        const blob: Point[] = [];
        const queue: number[] = [idx];
        visited[idx] = 1;

        while (queue.length > 0) {
          const ci = queue.pop()!;
          const cx = ci % w;
          const cy = Math.floor(ci / w);
          blob.push({ x: cx, y: cy });

          // 4-connectivity neighbors
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
              const ni = ny * w + nx;
              if (binary[ni] === 255 && !visited[ni]) {
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

  // Step 4: Filter blobs by size and find the best A4-shaped rectangle
  const imageArea = w * h;
  let bestMatch: { rect: BoundingRect; score: number } | null = null;

  for (const blob of blobs) {
    const area = blob.length;
    const areaRatio = area / imageArea;
    if (areaRatio < MIN_RECT_AREA_RATIO || areaRatio > MAX_RECT_AREA_RATIO) continue;

    // Compute bounding box
    const rect = getBoundingRect(blob);

    // Check aspect ratio matches A4 (either orientation)
    const aspectRatio = Math.max(rect.width, rect.height) / Math.min(rect.width, rect.height);
    const ratioError = Math.abs(aspectRatio - A4_RATIO) / A4_RATIO;
    if (ratioError > ASPECT_RATIO_TOLERANCE) continue;

    // Check "rectangularity" — how much of the bounding box is filled
    const boxArea = rect.width * rect.height;
    const fillRatio = area / boxArea;
    if (fillRatio < 0.65) continue; // too irregular to be a rectangle

    // Score: closer aspect ratio + higher fill = better
    const score = (1 - ratioError) * fillRatio;
    if (!bestMatch || score > bestMatch.score) {
      bestMatch = { rect, score };
    }
  }

  if (!bestMatch) return null;

  // Step 5: Compute pixels-per-cm from the detected rectangle
  const { rect } = bestMatch;
  // Determine orientation: A4 can be portrait or landscape
  const longerPx = Math.max(rect.width, rect.height);
  const shorterPx = Math.min(rect.width, rect.height);
  const pxPerCmLong = longerPx / A4_HEIGHT_CM;
  const pxPerCmShort = shorterPx / A4_WIDTH_CM;
  const pixelsPerCm = (pxPerCmLong + pxPerCmShort) / 2;

  return {
    method: 'a4paper',
    pixelsPerCm,
    originPixel: { x: rect.x, y: rect.y + rect.height }, // bottom-left of paper
    confidence: bestMatch.score,
  };
}

interface BoundingRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function getBoundingRect(points: Point[]): BoundingRect {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Draw the detected A4 region on a canvas for user verification.
 */
export function drawA4Overlay(
  ctx: CanvasRenderingContext2D,
  calibration: CalibrationResult,
): void {
  const { pixelsPerCm, originPixel } = calibration;
  const widthPx = A4_WIDTH_CM * pixelsPerCm;
  const heightPx = A4_HEIGHT_CM * pixelsPerCm;

  ctx.strokeStyle = '#22c55e';
  ctx.lineWidth = 3;
  ctx.setLineDash([8, 4]);
  ctx.strokeRect(
    originPixel.x,
    originPixel.y - heightPx,
    widthPx,
    heightPx,
  );
  ctx.setLineDash([]);

  // Label
  ctx.fillStyle = '#22c55e';
  ctx.font = '14px Inter, sans-serif';
  ctx.fillText(
    `A4 detected — ${calibration.pixelsPerCm.toFixed(1)} px/cm`,
    originPixel.x,
    originPixel.y + 20,
  );
}
