/**
 * E2E — THE JUDGE PATH. `?demo=1` must reach genuine analysis in ONE page
 * load, disclose that it is seeded, and reproduce the proven two-body claim
 * (tall=4 / short=6 moves) without a single manual setup step.
 *
 * Also the first browser coverage for GptCoachPanel: the demo+fused URL is
 * the exact judge scenario (instant screen, then one click for a grounded
 * GPT-5.6 explanation), so the coach assertions live here rather than in a
 * separate flow-driving spec. The proxy is intercepted — same policy as
 * fused-mode.spec.ts: e2e proves plumbing and UI truthfully, never a live
 * model.
 */
import { test, expect } from '@playwright/test';

test('?demo=1 lands on genuine analysis with disclosure, no manual steps', async ({ page }) => {
  await page.goto('/?demo=1&mode=classic');

  // Analysis screen landmarks appear directly — no wizard, no calibration.
  await expect(page.getByText('岩策')).toBeVisible();

  // The honesty badge is not optional: seeded state must say so on screen.
  await expect(page.getByTestId('demo-badge')).toBeVisible();
  await expect(page.getByTestId('demo-badge')).toContainText('Seeded demo');

  // Genuine engine output is present: the stepper shows the tall body's
  // proven 4-move sequence ("1/4" — fixture-backed, not cosmetic).
  await expect(page.getByText(/^1\/4$/)).toBeVisible();
});

test('demo comparison shows the proven 4 vs 6 move difference', async ({ page }) => {
  await page.goto('/?demo=1&mode=classic');
  await expect(page.getByTestId('demo-badge')).toBeVisible();

  await page.getByTestId('compare-toggle').click();

  // Same assertions as comparison.spec.ts — the seed must not dilute the
  // product claim it exists to showcase.
  await expect(page.getByText('Same wall — different beta.')).toBeVisible();
  const columns = page.locator('ol');
  await expect(columns.nth(0).locator('li')).toHaveCount(4);
  await expect(columns.nth(1).locator('li')).toHaveCount(6);
});

test('demo + fused: GPT-5.6 panel generates grounded coaching via proxy', async ({ page }) => {
  // Intercept the coach task with a response whose steps exist in the seeded
  // beta (steps 1..4) but which ALSO includes one hallucinated-hold step —
  // the UI must show the grounded ones and never the dropped one.
  await page.route('**/api/vlm-proxy', async (route) => {
    const body = route.request().postDataJSON() as { task?: string };
    if (body?.task !== 'coach') {
      await route.fulfill({ status: 500, body: 'unexpected task in demo e2e' });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        coachings: [
          { step: 1, coaching: 'Keep hips close and reach with a straight arm.' },
          { step: 2, coaching: 'This mentions hold-zz-fake which no move touches.' },
        ],
      }),
    });
  });

  await page.goto('/?demo=1&mode=fused');
  await expect(page.getByTestId('demo-badge')).toBeVisible();

  const panel = page.getByTestId('gpt-coach-panel');
  await expect(panel).toBeVisible();
  await page.getByTestId('gpt-coach-generate').click();

  // Grounded output for the current (first) move renders…
  await expect(page.getByTestId('gpt-coach-output')).toContainText('straight arm');
  await expect(panel.getByText('Grounded')).toBeVisible();
  // …and the hallucinated-hold sentence was dropped by validation.
  await expect(panel).not.toContainText('hold-zz-fake');
});

test('demo coach panel fails open when the proxy is down', async ({ page }) => {
  await page.route('**/api/vlm-proxy', (route) => route.abort('connectionrefused'));

  await page.goto('/?demo=1&mode=fused');
  await page.getByTestId('gpt-coach-generate').click();

  // The outage message appears and the deterministic analysis stays intact.
  await expect(page.getByTestId('gpt-coach-panel')).toContainText('GPT-5.6 is unavailable');
  await expect(page.getByText(/^1\/4$/)).toBeVisible();
});
