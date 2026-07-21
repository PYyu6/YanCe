/**
 * featureFlags.ts — URL-driven detection mode.
 *
 * WHY URL PARAMS (not env vars or UI toggles): the plan's honesty requirement
 * is that `?mode=classic` is always reachable as a baseline, and demo takes
 * need to pin a mode without rebuilding. A URL param is inspectable by judges,
 * linkable in the README, and — critically — controllable from Playwright by
 * just navigating, which keeps e2e tests free of test-only hooks in app code.
 *
 * DEFAULT IS CLASSIC until the proxy is deployed with real keys: fused mode
 * fails open (degrades to classic behavior on network failure), but each
 * failed stage costs a fetch timeout — a default that silently waits on a
 * missing backend would feel broken. Flip the default to fused when M1 passes.
 */

export interface DetectionFlags {
  /** Call the Roboflow pretrained detector through the proxy. */
  useYolo: boolean;
  /** One GPT-5.6 Set-of-Mark verification pass over merged candidates. */
  useVlmVerify: boolean;
  /** Dev affordances: label-export button, fusion stat badges. */
  dev: boolean;
}

export type DetectionMode = 'classic' | 'fused';

/** Parse once per call — cheap, and tests can vary location.search freely. */
export function getDetectionFlags(search: string = window.location.search): DetectionFlags {
  const params = new URLSearchParams(search);
  const mode = (params.get('mode') as DetectionMode) ?? 'classic';
  return {
    useYolo: mode === 'fused',
    useVlmVerify: mode === 'fused' && params.get('verify') !== 'off', // ?verify=off isolates YOLO-only for the eval table
    dev: params.get('dev') === '1',
  };
}
