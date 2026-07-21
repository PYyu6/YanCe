/**
 * P1 E2E contract written before the replay UI implementation.
 *
 * The browser test begins with the existing real photo→analysis spine and the
 * explicitly disclosed recorded contact fixture. It verifies that the user can
 * inspect the decision history and replay snapshots. It does NOT treat the
 * fixture as evidence of pose accuracy, which remains a real-person test gate.
 */
import { test, expect, Page } from '@playwright/test';
import { runFlowToAnalyze } from './helpers';

test.setTimeout(20_000);

async function openReceipt(page: Page) {
  await runFlowToAnalyze(page, { height: 190, armSpan: 195, query: '?mode=classic' });
  await page.getByTestId('live-coach-toggle').click();
  await expect(page.getByTestId('live-coach-source')).toContainText('Recorded fixture');
}

test('confirmed foot switch produces a private five-event receipt that can be replayed', async ({ page }, testInfo) => {
  await openReceipt(page);
  await page.getByTestId('replay-foot-switch').click();
  await page.getByTestId('confirm-contact').click();

  await expect(page.getByTestId('beta-receipt')).toBeVisible();
  await expect(page.getByTestId('beta-receipt-summary')).toContainText('1 replan');
  await expect(page.getByTestId('beta-receipt-summary')).toContainText('0 corrections');
  await expect(page.getByTestId('beta-receipt-privacy')).toContainText(
    'Structured state only · no video or audio stored',
  );
  await expect(page.getByTestId('beta-replay-position')).toHaveText('5 / 5');
  await expect(page.getByTestId('beta-replay-title')).toHaveText('New suggestion created');

  // Replay backward from the replacement to the confirmation snapshot.
  await page.getByTestId('beta-replay-prev').click();
  await page.getByTestId('beta-replay-prev').click();
  await expect(page.getByTestId('beta-replay-position')).toHaveText('3 / 5');
  await expect(page.getByTestId('beta-replay-title')).toHaveText('Contact confirmed');
  await expect(page.getByTestId('beta-replay-contacts').locator('[data-contact]')).toHaveCount(4);

  // Preserve one human-inspectable artifact of the P1 contract. Assertions
  // protect behavior; this screenshot catches hierarchy/overflow problems the
  // selector-level checks cannot express and lives only in Playwright output.
  await page.screenshot({
    path: testInfo.outputPath('beta-receipt-p1.png'),
    fullPage: true,
  });
});

test('rejected observation creates a correction receipt without a replan', async ({ page }) => {
  await openReceipt(page);
  await page.getByTestId('replay-foot-switch').click();
  await page.getByTestId('reject-contact').click();

  await expect(page.getByTestId('beta-receipt-summary')).toContainText('0 replans');
  await expect(page.getByTestId('beta-receipt-summary')).toContainText('1 correction');
  await expect(page.getByTestId('beta-replay-position')).toHaveText('3 / 3');
  await expect(page.getByTestId('beta-replay-title')).toHaveText('Observation rejected');
  await expect(page.getByTestId('new-suggestion')).toHaveCount(0);
});
