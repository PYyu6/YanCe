import { defineConfig } from '@playwright/test';

/**
 * E2E config. The suite runs the REAL app against a real Vite dev server in
 * real Chromium — the only fakes anywhere are (a) the synthetic wall image
 * and (b) route-intercepted /api/vlm-proxy responses in the fused-mode spec.
 * Classic-mode specs have zero mocks of any kind: photo in → beta out.
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  // Detection math + engine are deterministic; retries would only hide test
  // bugs. Fail loud, fix the test.
  retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:5199',
    // 900-high viewport keeps the detection canvas (innerHeight*0.5 tall) big
    // enough that hold-tap coordinates survive rounding comfortably.
    viewport: { width: 1280, height: 900 },
    launchOptions: {
      // Fake camera so CameraWizard's getUserMedia neither blocks on a
      // permission dialog nor errors; the tests use the upload path anyway.
      args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
    },
  },
  webServer: {
    // Use the same Node executable that launched Playwright. This keeps E2E
    // runnable in clean/CI environments where a global `npx` is unavailable.
    command: `"${process.execPath}" node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5199 --strictPort`,
    url: 'http://127.0.0.1:5199',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
