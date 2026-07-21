/**
 * Body Height Calibration
 * ───────────────────────
 * User inputs their height and stands in frame next to the wall.
 * We detect their body height in pixels using simple heuristics
 * (top of head to feet on ground), then compute pixelsPerCm.
 *
 * For MVP we use a color-based person detection approach:
 * - Detect the tallest vertical blob that isn't wall-colored
 * - User stands with arms at sides for clean silhouette
 *
 * V2 will use MediaPipe Pose for precise joint detection.
 */

import { CalibrationResult, Point } from '../types';

/**
 * Calibrate using the user standing in frame.
 * The user's known height maps to their detected pixel height.
 *
 * For MVP, we use a simplified approach: the user taps their head
 * and feet positions on the captured image.
 *
 * @param headPoint - Pixel position of top of head (user taps)
 * @param feetPoint - Pixel position of feet on ground (user taps)
 * @param heightCm - User's real height in cm
 */
export function calibrateFromBody(
  headPoint: Point,
  feetPoint: Point,
  heightCm: number,
): CalibrationResult {
  // Compute pixel distance between head and feet
  const dx = feetPoint.x - headPoint.x;
  const dy = feetPoint.y - headPoint.y;
  const pixelHeight = Math.sqrt(dx * dx + dy * dy);

  const pixelsPerCm = pixelHeight / heightCm;

  return {
    method: 'body',
    pixelsPerCm,
    // Origin = feet position (ground level)
    originPixel: { x: feetPoint.x, y: feetPoint.y },
    // Lower confidence than A4 — manual tap introduces error
    confidence: 0.7,
  };
}

/**
 * Draw the body calibration overlay showing the height reference line.
 */
export function drawBodyCalibrationOverlay(
  ctx: CanvasRenderingContext2D,
  headPoint: Point,
  feetPoint: Point,
  heightCm: number,
): void {
  // Draw line from head to feet
  ctx.strokeStyle = '#3b82f6';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 3]);
  ctx.beginPath();
  ctx.moveTo(headPoint.x, headPoint.y);
  ctx.lineTo(feetPoint.x, feetPoint.y);
  ctx.stroke();
  ctx.setLineDash([]);

  // Draw head marker
  ctx.fillStyle = '#3b82f6';
  ctx.beginPath();
  ctx.arc(headPoint.x, headPoint.y, 6, 0, Math.PI * 2);
  ctx.fill();

  // Draw feet marker
  ctx.beginPath();
  ctx.arc(feetPoint.x, feetPoint.y, 6, 0, Math.PI * 2);
  ctx.fill();

  // Label
  ctx.fillStyle = '#3b82f6';
  ctx.font = '14px Inter, sans-serif';
  const midX = (headPoint.x + feetPoint.x) / 2 + 12;
  const midY = (headPoint.y + feetPoint.y) / 2;
  ctx.fillText(`${heightCm} cm`, midX, midY);
}

/**
 * Manual scale calibration: user specifies a known distance
 * between two points they tap on the image.
 */
export function calibrateFromManualDistance(
  point1: Point,
  point2: Point,
  distanceCm: number,
): CalibrationResult {
  const dx = point2.x - point1.x;
  const dy = point2.y - point1.y;
  const pixelDist = Math.sqrt(dx * dx + dy * dy);

  return {
    method: 'manual',
    pixelsPerCm: pixelDist / distanceCm,
    originPixel: {
      x: Math.min(point1.x, point2.x),
      y: Math.max(point1.y, point2.y),
    },
    confidence: 0.8,
  };
}
