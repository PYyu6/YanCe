/**
 * roboflowClient.ts — Client for the pretrained climbing-hold detector.
 *
 * Talks to OUR proxy, not Roboflow directly: the Roboflow API key must live
 * server-side (public repo rule), and routing through one proxy gives us the
 * response cache that makes the filmed demo deterministic.
 *
 * Model choice (execution-plan DP-1): Roboflow Universe community models
 * ("climbing-holds-and-volumes" by Blackcreed classifies hold types). These
 * were trained on 50-200 images — transfer to any specific gym is unproven,
 * which is exactly why this client's output is only ever a CANDIDATE source
 * feeding mergeCandidates + VLM verify + human correction, never ground truth.
 */

import { HoldCandidate, HoldType } from './holdCandidates';

/** Shape of one prediction in Roboflow's hosted-inference response. */
export interface RoboflowPrediction {
  /** Box CENTER in pixels (Roboflow convention — not top-left). */
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  /** Model class label, e.g. "jug", "crimp", "hold", "volume". */
  class: string;
}

export interface RoboflowResponse {
  predictions: RoboflowPrediction[];
}

/**
 * Map a model class label onto our HoldType taxonomy.
 * Exported for tests. Unknown labels → 'unknown' (never throw on new labels:
 * community models rename classes between versions, and an unrecognized label
 * must not take down detection).
 */
export function classToHoldType(cls: string): HoldType {
  const c = cls.toLowerCase().trim();
  if (c.includes('jug')) return 'jug';
  if (c.includes('crimp')) return 'crimp';
  if (c.includes('sloper')) return 'sloper';
  if (c.includes('pocket')) return 'pocket';
  if (c.includes('pinch')) return 'pinch';
  if (c.includes('volume')) return 'volume';
  return 'unknown';
}

/** Convert raw predictions into fusion candidates. Pure; exported for tests. */
export function predictionsToCandidates(preds: RoboflowPrediction[]): HoldCandidate[] {
  return preds.map((p) => ({
    pixelCenter: { x: p.x, y: p.y },
    // Radius ≈ half the box's smaller side: hold blobs are roughly round, and
    // using the smaller side keeps elongated boxes (volumes) from claiming an
    // oversized match radius in mergeCandidates.
    pixelRadius: Math.min(p.width, p.height) / 2,
    source: 'yolo' as const,
    confidence: p.confidence,
    holdType: classToHoldType(p.class),
  }));
}

/**
 * Call the detector through the proxy.
 *
 * @param imageDataUrl JPEG/PNG data URL, ALREADY DOWNSCALED to ≤1280px on the
 *        long side by the caller (cost + latency rule from the plan — and the
 *        pixel coordinates that come back are in the downscaled space, so the
 *        caller owns the scale factor and the rescaling of results).
 * @param fetchFn injectable for tests; defaults to global fetch.
 */
export async function detectWithRoboflow(
  imageDataUrl: string,
  fetchFn: typeof fetch = fetch,
): Promise<HoldCandidate[]> {
  const res = await fetchFn('/api/vlm-proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task: 'detect', image: imageDataUrl }),
  });
  if (!res.ok) {
    throw new Error(`roboflow proxy: HTTP ${res.status}`);
  }
  const json = (await res.json()) as RoboflowResponse;
  if (!Array.isArray(json.predictions)) {
    // Malformed response degrades to "no YOLO candidates", not a crash —
    // detectHoldsFused treats a throw the same way, but returning [] here
    // keeps the distinction between "service broken" and "service saw nothing".
    return [];
  }
  return predictionsToCandidates(json.predictions);
}
