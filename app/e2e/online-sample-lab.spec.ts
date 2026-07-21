/**
 * E2E acceptance for the immediately viewable public-video sample.
 *
 * This proves the bundled licensed media, disclosure, and real temporal
 * estimator are connected. It deliberately does not assert pose accuracy.
 */
import { test, expect } from '@playwright/test';

test('licensed climbing video and honest sample evidence are visible and runnable', async ({ page }) => {
  await page.goto('/?sample=video');

  await expect(page.getByTestId('online-sample-lab')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Try a real climbing video' })).toBeVisible();
  await expect(page.getByTestId('sample-license')).toContainText('CC BY-SA 3.0');
  await expect(page.getByTestId('sample-disclosure')).toContainText(
    'does not read the video pixels',
  );
  await expect(page.getByTestId('sample-video')).toHaveAttribute(
    'src',
    '/samples/indoor-bouldering-v3-rock-spot.webm',
  );

  await page.getByTestId('jump-sample-window').click();
  await expect
    .poll(() =>
      page.getByTestId('sample-video').evaluate((element) =>
        Math.round((element as HTMLVideoElement).currentTime),
      ),
    )
    .toBe(21);

  await page.getByTestId('run-online-sample').click();
  const result = page.getByTestId('online-sample-result');
  await expect(result).toContainText('Proposal ready');
  await expect(result).toContainText('left foot');
  await expect(result).toContainText('520 ms');
  await expect(result).toContainText('86%');
  await expect(page.getByRole('link', { name: /The Way Up/ })).toHaveAttribute(
    'href',
    'https://zenodo.org/records/15196867',
  );
});
