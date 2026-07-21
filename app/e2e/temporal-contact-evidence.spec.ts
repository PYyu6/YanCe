/**
 * E2E acceptance test for the temporal-evidence seam.
 *
 * The test drives the real photo-to-beta flow, then replays a disclosed sample
 * trace. It does not claim camera accuracy. It proves the product waits for
 * multi-frame evidence and tells the user exactly why it asked for confirmation.
 */
import { test, expect } from '@playwright/test';
import { runFlowToAnalyze } from './helpers';

test('recorded contact proposal shows time, method, and evidence score', async ({ page }) => {
  await runFlowToAnalyze(page, { height: 190, armSpan: 195, query: '?mode=classic' });
  await page.getByTestId('live-coach-toggle').click();
  await expect(page.getByTestId('live-coach-source')).toContainText('Recorded fixture');

  await page.getByTestId('replay-foot-switch').click();

  const evidence = page.getByTestId('temporal-evidence');
  await expect(evidence).toBeVisible();
  await expect(evidence).toContainText('Time-based baseline');
  await expect(evidence).toContainText('520 ms');
  await expect(evidence).toContainText('86%');

  await page.getByTestId('confirm-contact').click();
  await expect(page.getByTestId('beta-replay-title')).toHaveText('New suggestion created');
});
