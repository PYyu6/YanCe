/**
 * Route Parser
 * ────────────
 * Takes detected holds and organizes them into a structured route:
 * - Identifies start holds (lowest, marked by user or auto-detected)
 * - Identifies top/finish hold (highest)
 * - Classifies holds as hand-holds vs foot-holds based on size
 * - Computes inter-hold distances for the strategy engine
 */

import { DetectedHold, CalibrationResult } from '../types';

export interface RouteInfo {
  holds: DetectedHold[];
  startHolds: DetectedHold[];        // 1-2 start holds (lowest)
  topHold: DetectedHold | null;      // highest hold
  wallHeightCm: number;              // vertical span of route
  wallWidthCm: number;               // horizontal span of route
  avgHoldSpacingCm: number;          // average distance between adjacent holds
  distanceMatrix: number[][];        // [i][j] = cm distance between hold i and hold j
}

/**
 * Parse detected holds into structured route info.
 */
export function parseRoute(
  holds: DetectedHold[],
  _calibration: CalibrationResult,
): RouteInfo {
  if (holds.length === 0) {
    return {
      holds: [],
      startHolds: [],
      topHold: null,
      wallHeightCm: 0,
      wallWidthCm: 0,
      avgHoldSpacingCm: 0,
      distanceMatrix: [],
    };
  }

  // Sort by world Y (ascending = bottom to top)
  const sorted = [...holds].sort((a, b) => a.worldCenter.y - b.worldCenter.y);

  // Start holds = those marked as start, or the 2 lowest
  const startHolds = sorted.filter((h) => h.isStart);
  if (startHolds.length === 0 && sorted.length >= 2) {
    sorted[0].isStart = true;
    sorted[1].isStart = true;
    startHolds.push(sorted[0], sorted[1]);
  } else if (startHolds.length === 0 && sorted.length === 1) {
    sorted[0].isStart = true;
    startHolds.push(sorted[0]);
  }

  // Top hold = marked as top, or the highest
  let topHold = sorted.find((h) => h.isTop) ?? null;
  if (!topHold) {
    sorted[sorted.length - 1].isTop = true;
    topHold = sorted[sorted.length - 1];
  }

  // Wall dimensions
  const xs = holds.map((h) => h.worldCenter.x);
  const ys = holds.map((h) => h.worldCenter.y);
  const wallWidthCm = Math.max(...xs) - Math.min(...xs);
  const wallHeightCm = Math.max(...ys) - Math.min(...ys);

  // Distance matrix
  const n = holds.length;
  const distanceMatrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = holds[i].worldCenter.x - holds[j].worldCenter.x;
      const dy = holds[i].worldCenter.y - holds[j].worldCenter.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      distanceMatrix[i][j] = Math.round(dist * 10) / 10;
      distanceMatrix[j][i] = distanceMatrix[i][j];
    }
  }

  // Average spacing: mean of distances to nearest neighbor
  let spacingSum = 0;
  for (let i = 0; i < n; i++) {
    let nearest = Infinity;
    for (let j = 0; j < n; j++) {
      if (i !== j && distanceMatrix[i][j] < nearest) {
        nearest = distanceMatrix[i][j];
      }
    }
    if (nearest < Infinity) spacingSum += nearest;
  }
  const avgHoldSpacingCm = n > 1 ? spacingSum / n : 0;

  return {
    holds: sorted,
    startHolds,
    topHold,
    wallHeightCm,
    wallWidthCm,
    avgHoldSpacingCm,
    distanceMatrix,
  };
}
