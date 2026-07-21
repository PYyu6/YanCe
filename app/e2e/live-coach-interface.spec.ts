/**
 * E2E — contact-aware interface contract over the real analysis flow.
 *
 * The wall/photo/calibration/detection/beta layers are real, driven by the
 * existing deterministic synthetic wall. Only the new contact event is a
 * recorded fixture, and the test ASSERTS that disclosure. This distinction is
 * intentional: CI verifies state/replan UX; a separate real-person protocol
 * must validate pose/contact accuracy.
 */
import { test, expect } from '@playwright/test';
import { runFlowToAnalyze } from './helpers';

async function openLiveCoach(page: Parameters<typeof runFlowToAnalyze>[0]) {
  await runFlowToAnalyze(page, { height: 190, armSpan: 195, query: '?mode=classic' });
  await page.getByTestId('live-coach-toggle').click();
  await expect(page.getByTestId('live-coach-panel')).toBeVisible();
  await expect(page.getByTestId('live-coach-source')).toContainText('Recorded fixture');
}

test('recorded foot switch requires confirmation and visibly replans', async ({ page }) => {
  await openLiveCoach(page);

  await expect(page.getByTestId('live-coach-status')).toHaveText('Watching');
  for (const limb of ['leftHand', 'rightHand', 'leftFoot', 'rightFoot']) {
    await expect(page.getByTestId(`contact-chip-${limb}`)).toBeVisible();
  }
  await expect(page.getByTestId('current-suggestion')).toBeVisible();

  await page.getByTestId('replay-foot-switch').click();
  await expect(page.getByTestId('live-coach-status')).toHaveText('Contact uncertain — confirm?');
  await expect(page.getByText(/86% observation confidence/)).toBeVisible();

  await page.getByTestId('confirm-contact').click();
  await expect(page.getByTestId('live-coach-status')).toHaveText('Replanned');
  await expect(page.getByTestId('old-suggestion')).toBeVisible();
  await expect(page.getByTestId('new-suggestion')).toBeVisible();
  await expect(page.getByTestId('live-coach-event')).toContainText('Stale suggestion invalidated');
});

test('rejecting an uncertain contact preserves the confirmed plan', async ({ page }) => {
  await openLiveCoach(page);
  await page.getByTestId('replay-foot-switch').click();
  await page.getByTestId('reject-contact').click();

  await expect(page.getByTestId('live-coach-status')).toHaveText('Watching');
  await expect(page.getByTestId('live-coach-event')).toContainText(
    'Confirmed contacts were not changed',
  );
  await expect(page.getByTestId('current-suggestion')).toBeVisible();
  await expect(page.getByTestId('new-suggestion')).toHaveCount(0);
});
