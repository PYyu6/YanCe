/**
 * E2E — THE PRODUCT CLAIM IN A REAL BROWSER.
 *
 * The vitest integration test already proves the engine gives a 190cm body 4
 * moves and a 160cm body 6 moves on the ladder wall. This spec proves the
 * same thing through every real layer on top of the engine: image upload,
 * canvas calibration taps, color-seg detection (which re-derives the world
 * coordinates from pixels — THE step the unit tests can't cover), and the
 * ComparisonView UI. If the two tests ever disagree, the bug is in the
 * pixel→world plumbing between them.
 */
import { test, expect } from '@playwright/test';
import { runFlowToAnalyze } from './helpers';

test('same wall, two bodies, two different betas — visible in the UI', async ({ page }) => {
  // Tall profile drives the main flow; ComparisonView contrasts with 160/160.
  await runFlowToAnalyze(page, { height: 190, armSpan: 195, query: '?mode=classic' });

  await page.getByTestId('compare-toggle').click();

  // The honest banner: it must say the sequences DIFFER (the wall was
  // designed to guarantee it). If the amber "same sequence" banner shows
  // instead, body-conditioning broke somewhere between canvas and engine.
  await expect(page.getByText('Same wall — different beta.')).toBeVisible();

  // Stronger than the banner: the actual move counts, straight from the
  // rendered columns. Tall (190/195) skips rungs → 4 moves; the contrast
  // body (160/160) can't afford skips → 6 moves. Numbers proven by the
  // engine-level integration test; re-asserted here through the full stack.
  const columns = page.locator('ol');
  await expect(columns.nth(0).locator('li')).toHaveCount(4);
  await expect(columns.nth(1).locator('li')).toHaveCount(6);
});
