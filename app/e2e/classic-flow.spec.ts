/**
 * E2E — classic mode, ZERO mocks: synthetic photo in → personalized beta out.
 *
 * This is the MVP's spine test: real browser, real Vite build, real color
 * segmentation, real calibration math, real Dijkstra — the only synthetic
 * thing is the wall image itself (whose ground truth we constructed). If this
 * passes, every piece of plumbing between "user has a photo" and "user reads
 * a beta" works. No network is touched: ?mode=classic never calls any API.
 */
import { test, expect } from '@playwright/test';
import { ladderWallSpec, wallPngBuffer, tapImagePoint, setSlider } from './helpers';

test('photo → detected holds → calibrated → beta on screen (tall body)', async ({ page }) => {
  const spec = ladderWallSpec();

  // Fail the test on any console error — the demo must be clean, and silent
  // errors in canvas/detection code are exactly what e2e exists to surface.
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await page.goto('/?mode=classic');
  await expect(page.getByRole('button', { name: /Continue to wall photo/ })).toBeVisible();
  await setSlider(page, 0, 190); // height
  await setSlider(page, 1, 195); // arm span
  await expect(page.getByText('190 cm')).toBeVisible();
  await page.getByRole('button', { name: /Continue to wall photo/ }).click();

  // Upload the synthetic wall.
  const png = await wallPngBuffer(page, spec);
  await page.getByTestId('photo-upload-input').setInputFiles({
    name: 'wall.png',
    mimeType: 'image/png',
    buffer: png,
  });

  // Manual calibration: two taps 500px apart declared as 100cm → 5 px/cm.
  await page.getByText('Manual Distance').click();
  await tapImagePoint(page, 'canvas', spec, spec.calibration.p1.x, spec.calibration.p1.y);
  await tapImagePoint(page, 'canvas', spec, spec.calibration.p2.x, spec.calibration.p2.y);
  await page.locator('input[type="number"]').fill('100');
  await page.getByText('Calibrate', { exact: true }).click();
  // The scale the app derives must be exactly what the wall was drawn at.
  await expect(page.getByText('5.0 px/cm')).toBeVisible();
  await page.getByText('Next: Detect Holds').click();

  // Detect via the red chip. GROUND-TRUTH ASSERTION: the wall has exactly 9
  // red route holds (start + 6 rungs + top + decoy) and 2 blue distractors —
  // detection must find all 9 and ONLY the 9 (distractors filtered by color).
  await page.locator('button[title="Red"]').click();
  await expect(page.getByRole('button', { name: /Analyze Route \(9 holds\)/ })).toBeVisible({
    timeout: 15_000,
  });

  // The detector auto-marks 2 starts + 1 top (lowest two / highest holds) —
  // assert that contract through the UI counter, then exercise the mark UI by
  // removing the second auto-start (rung l1 at pixel y=917.5). Role selectors
  // because the instruction paragraph also contains "mark start/top" as text.
  await expect(page.getByText('2 starts | 1 top')).toBeVisible();
  await page.getByRole('button', { name: 'Mark Start' }).click();
  await tapImagePoint(page, 'canvas.cursor-crosshair', spec, 300, 917.5);
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByText('1 start | 1 top')).toBeVisible();

  const analyzeBtn = page.getByRole('button', { name: /Analyze Route/ });
  await expect(analyzeBtn).toBeEnabled();
  await analyzeBtn.click();

  // Analysis screen: a named beta with stepped moves is on screen.
  await expect(page.getByText('岩策')).toBeVisible();
  await expect(page.getByText(/Standard/)).toBeVisible();

  expect(consoleErrors).toEqual([]);
});
