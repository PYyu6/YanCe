/**
 * E2E — fused mode with intercepted model APIs.
 *
 * What this proves that vitest can't: the BROWSER-SIDE wiring — feature-flag
 * dispatch, the downscale/rescale path, real fetch calls leaving the app,
 * SoM mark rendering on a real canvas, and the stats badge in the DOM.
 * The model RESPONSES are route-intercepted fixtures (deterministic, free);
 * model QUALITY is explicitly out of scope here — that's the M1 live spike
 * on real gym photos.
 *
 * Scenario (mirrors tests/integration/pipeline.test.ts):
 *   YOLO agrees with color-seg on 2 rungs, and adds 1 false positive
 *   (a "chalk smudge" at a spot with no drawn hold). GPT-5.6 verification
 *   vetoes exactly the smudge. Net: 9 committed holds, badge says so.
 */
import { test, expect } from '@playwright/test';
import { ladderWallSpec, wallPngBuffer, tapImagePoint, setSlider } from './helpers';

test('fused mode: YOLO merge + GPT-5.6 veto, visible in stats badge', async ({ page }) => {
  const spec = ladderWallSpec();

  // The wall's long side (1100px) is under the 1280 API cap → scale factor 1,
  // so intercepted YOLO coordinates can be given in plain image pixels.
  const SMUDGE = { x: 150, y: 300 };

  await page.route('**/api/vlm-proxy', async (route) => {
    const body = route.request().postDataJSON() as { task: string; nMarks?: number };
    if (body.task === 'detect') {
      await route.fulfill({
        json: {
          predictions: [
            // Two boxes agreeing with drawn rungs (rung 1 & 2 pixel centers).
            { x: 300, y: 917.5, width: 40, height: 40, confidence: 0.9, class: 'jug' },
            { x: 300, y: 835, width: 40, height: 40, confidence: 0.9, class: 'crimp' },
            // The false positive only YOLO "sees".
            { x: SMUDGE.x, y: SMUDGE.y, width: 40, height: 40, confidence: 0.55, class: 'crimp' },
          ],
        },
      });
    } else if (body.task === 'verify') {
      // Mark numbering is deterministic: renderSetOfMarks orders candidates by
      // ascending confidence — 7 seg-only (0.5) get marks 1..7, the smudge
      // (0.55) gets mark 8, the two 'both' candidates (0.9) get 9..10.
      // Verdict: keep everything except mark 8. If the ordering contract in
      // som.ts changes, this test fails — which is exactly what we want.
      const n = body.nMarks ?? 0;
      await route.fulfill({
        json: {
          verdicts: Array.from({ length: n }, (_, i) => ({
            mark: i + 1,
            keep: i + 1 !== 8,
            holdType: 'unknown',
          })),
          missedCells: [],
        },
      });
    } else if (body.task === 'coach') {
      await route.fulfill({
        json: {
          coachings: [
            { step: 1, coaching: 'Keep your hips close, then move deliberately to the next target.' },
          ],
        },
      });
    } else {
      await route.fulfill({ status: 400, json: { error: 'unexpected task in e2e' } });
    }
  });

  // Drive to detection in fused mode (+dev=1 to render the stats badge).
  await page.goto('/?mode=fused&dev=1');
  await setSlider(page, 0, 190);
  await setSlider(page, 1, 195);
  await page.getByRole('button', { name: /Continue to wall photo/ }).click();
  const png = await wallPngBuffer(page, spec);
  await page.getByTestId('photo-upload-input').setInputFiles({
    name: 'wall.png', mimeType: 'image/png', buffer: png,
  });
  await page.getByText('Manual Distance').click();
  await tapImagePoint(page, 'canvas', spec, spec.calibration.p1.x, spec.calibration.p1.y);
  await tapImagePoint(page, 'canvas', spec, spec.calibration.p2.x, spec.calibration.p2.y);
  await page.locator('input[type="number"]').fill('100');
  await page.getByText('Calibrate', { exact: true }).click();
  await page.getByText('Next: Detect Holds').click();

  await page.locator('button[title="Red"]').click();

  // 9 red seg holds + smudge merged in, then vetoed → exactly 9 committed.
  await expect(page.getByRole('button', { name: /Analyze Route \(9 holds\)/ })).toBeVisible({
    timeout: 15_000,
  });

  // The judged story, on screen: 2 cross-confirmed, 1 vetoed by GPT-5.6.
  const badge = page.getByTestId('fusion-stats');
  await expect(badge).toContainText('2 confirmed by both');
  await expect(badge).toContainText('1 vetoed by GPT-5.6');

  // The second judged GPT-5.6 role is visible and user-triggered: explain the
  // deterministic beta without changing it.
  await page.getByRole('button', { name: /Analyze Route/ }).click();
  await page.getByTestId('gpt-coach-generate').click();
  await expect(page.getByTestId('gpt-coach-output')).toContainText('Keep your hips close');
});

test('fused mode degrades to classic when the proxy is down (fail-open)', async ({ page }) => {
  const spec = ladderWallSpec();
  // No route handler at all → real fetch to a dev server with no /api → 404s.
  // The runner must swallow both stage failures and still deliver seg holds.
  await page.goto('/?mode=fused');
  await setSlider(page, 0, 190);
  await setSlider(page, 1, 195);
  await page.getByRole('button', { name: /Continue to wall photo/ }).click();
  const png = await wallPngBuffer(page, spec);
  await page.getByTestId('photo-upload-input').setInputFiles({
    name: 'wall.png', mimeType: 'image/png', buffer: png,
  });
  await page.getByText('Manual Distance').click();
  await tapImagePoint(page, 'canvas', spec, spec.calibration.p1.x, spec.calibration.p1.y);
  await tapImagePoint(page, 'canvas', spec, spec.calibration.p2.x, spec.calibration.p2.y);
  await page.locator('input[type="number"]').fill('100');
  await page.getByText('Calibrate', { exact: true }).click();
  await page.getByText('Next: Detect Holds').click();
  await page.locator('button[title="Red"]').click();

  // Same 9 holds as pure classic — the demo can never blank on a dead backend.
  await expect(page.getByRole('button', { name: /Analyze Route \(9 holds\)/ })).toBeVisible({
    timeout: 15_000,
  });
});
