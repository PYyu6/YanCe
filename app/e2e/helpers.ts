/**
 * e2e/helpers.ts — Shared flow drivers for the Playwright suite.
 *
 * Selector philosophy: user-visible text and roles wherever possible (the
 * test then breaks when the UX breaks, which is what e2e is for), data-testid
 * only where text is unstable (upload input, stat badges).
 */

import { Page, expect } from '@playwright/test';
import { SyntheticWallSpec, ladderWallSpec } from '../src/services/syntheticWall';

export { ladderWallSpec };

/**
 * Render the synthetic wall spec to a PNG buffer INSIDE the browser page.
 *
 * Why in-page: Node has no canvas without native deps; the browser we're
 * already driving has a perfect one. The drawing logic is intentionally the
 * same trivial circles as drawSyntheticWall — duplicated here because the
 * page context can't import app modules, and injecting a script tag would
 * couple the test to the bundler. The SPEC (the part that must not drift)
 * comes from the single shared source.
 */
export async function wallPngBuffer(page: Page, spec: SyntheticWallSpec): Promise<Buffer> {
  const dataUrl = await page.evaluate((s) => {
    const canvas = document.createElement('canvas');
    canvas.width = s.widthPx;
    canvas.height = s.heightPx;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = s.bgColor;
    ctx.fillRect(0, 0, s.widthPx, s.heightPx);
    for (const h of s.holds) {
      ctx.beginPath();
      ctx.arc(h.xPx, h.yPx, h.rPx, 0, Math.PI * 2);
      ctx.fillStyle = h.colorHex;
      ctx.fill();
    }
    return canvas.toDataURL('image/png'); // PNG: lossless, so drawn hexes survive exactly
  }, spec);
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

/**
 * Set a React-controlled <input type="range"> to an exact value.
 *
 * Why not locator.fill(): Playwright refuses fill() on range inputs. Why not
 * keyboard arrows: 190−170 = 20 keypresses per slider is slow and brittle.
 * The reliable pattern for React-controlled inputs is the native value SETTER
 * (bypassing React's own descriptor) + a bubbling 'input' event, which React
 * picks up as onChange. Standard technique, but it lives in ONE helper so the
 * weirdness has exactly one home.
 */
export async function setSlider(page: Page, index: number, value: number): Promise<void> {
  await page.locator('input[type="range"]').nth(index).evaluate((el, v) => {
    const input = el as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, String(v));
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}

/** Click at an IMAGE-space coordinate on a (CSS-scaled) canvas element. */
export async function tapImagePoint(
  page: Page,
  canvasSelector: string,
  spec: SyntheticWallSpec,
  xImg: number,
  yImg: number,
): Promise<void> {
  const box = await page.locator(canvasSelector).boundingBox();
  if (!box) throw new Error(`canvas not found: ${canvasSelector}`);
  // The canvas is drawn at imageSize × scale with intact aspect ratio, so the
  // fraction-of-bounding-box mapping is exact.
  await page.mouse.click(
    box.x + (xImg / spec.widthPx) * box.width,
    box.y + (yImg / spec.heightPx) * box.height,
  );
}

export interface FlowOptions {
  height: number;
  armSpan: number;
  /** URL query, e.g. '?mode=classic' — the mode under test. */
  query: string;
}

/**
 * Drive the app from cold load to the analysis screen using the synthetic
 * ladder wall. Every step asserts its own landmark before proceeding, so a
 * failure names the exact step that broke.
 */
export async function runFlowToAnalyze(page: Page, opts: FlowOptions): Promise<void> {
  const spec = ladderWallSpec();

  // ── Step 1: profile (height & arm-span are range sliders) ──
  await page.goto('/' + opts.query);
  await expect(page.getByRole('button', { name: /Continue to wall photo/ })).toBeVisible();
  await setSlider(page, 0, opts.height);
  await setSlider(page, 1, opts.armSpan);
  // The label echoes the slider value — assert the set actually took effect
  // before moving on (a silent no-op here would corrupt every later assert).
  await expect(page.getByText(`${opts.height} cm`)).toBeVisible();
  await page.getByRole('button', { name: /Continue to wall photo/ }).click();

  // ── Step 2: photo (upload path — camera never involved) ──
  const png = await wallPngBuffer(page, spec);
  await page.getByTestId('photo-upload-input').setInputFiles({
    name: 'wall.png',
    mimeType: 'image/png',
    buffer: png,
  });

  // ── Step 3: manual calibration (deterministic by design) ──
  await page.getByText('Manual Distance').click();
  await expect(page.getByText('Tap the FIRST point')).toBeVisible();
  await tapImagePoint(page, 'canvas', spec, spec.calibration.p1.x, spec.calibration.p1.y);
  await expect(page.getByText('Tap the SECOND point')).toBeVisible();
  await tapImagePoint(page, 'canvas', spec, spec.calibration.p2.x, spec.calibration.p2.y);
  await page.locator('input[type="number"]').fill(String(spec.calibration.distanceCm));
  await page.getByText('Calibrate', { exact: true }).click();
  await expect(page.getByText('Calibrated!')).toBeVisible();
  await page.getByText('Next: Detect Holds').click();

  // ── Step 4: detect via the red color chip (matches ROUTE_RED exactly) ──
  // Role-based selectors: the review-mode instruction text ALSO contains
  // "mark start/top" and getByText matches case-insensitive substrings —
  // only the role narrows it to the actual buttons.
  await page.locator('button[title="Red"]').click();
  const markStart = page.getByRole('button', { name: 'Mark Start' });
  await expect(markStart).toBeVisible({ timeout: 15_000 });

  // The detector AUTO-MARKS the two lowest holds as starts and the highest as
  // top (discovered by this suite's first run — the original flow tapped the
  // pre-marked holds and toggled them OFF, silently disabling Analyze).
  await expect(page.getByText('2 starts | 1 top')).toBeVisible();

  // Exercise the mark UI in the direction a real user would here: remove the
  // second auto-start (rung l1, world y=16.5 → pixel y=917.5). This also
  // restores the single-start geometry that the engine fixture proves gives
  // tall=4 / short=6 moves — keeping vitest and e2e asserting the same wall.
  await markStart.click();
  await tapImagePoint(page, 'canvas.cursor-crosshair', spec, 300, 917.5);
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByText('1 start | 1 top')).toBeVisible();

  // ── Step 5: analyze ──
  const analyzeBtn = page.getByRole('button', { name: /Analyze Route/ });
  await expect(analyzeBtn).toBeEnabled();
  await analyzeBtn.click();
  await expect(page.getByText('岩策')).toBeVisible();
}
