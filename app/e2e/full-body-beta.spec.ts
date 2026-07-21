/**
 * E2E — full-body (hands + feet) beta through the real UI.
 *
 * Rides the seeded demo path so the wall geometry is the proven ladder.
 * Asserts the four user-facing promises: feet are labeled per move, each
 * move is one clearly separated step with the full four-limb stance, the
 * order guidance ("set this foot first") is visible, and the technique
 * chooser lists only route-applicable options and re-plans on selection.
 */
import { test, expect } from '@playwright/test';

test('full-body beta: every separate move labels all four contacts and the mover', async ({ page }) => {
  await page.goto('/?demo=1&mode=classic');
  await expect(page.getByTestId('demo-badge')).toBeVisible();

  await page.getByTestId('full-body-toggle').click();
  const panel = page.getByTestId('full-body-panel');
  await expect(panel).toBeVisible();

  // Each numbered list item is one visually separate move card. Every card
  // identifies exactly one mover and the other three supporting contacts.
  const cards = panel.locator('[data-testid^="fb-step-"]');
  const count = await cards.count();
  expect(count).toBeGreaterThan(1);
  for (let index = 0; index < count; index += 1) {
    const step = index + 1;
    const card = page.getByTestId(`fb-step-${step}`);
    await expect(card).toBeVisible();
    await expect(card).toContainText(`Move ${step} of ${count}`);
    await expect(card.getByText('MOVED', { exact: true })).toHaveCount(1);
    await expect(card.getByText('SUPPORT', { exact: true })).toHaveCount(3);
    await expect(page.getByTestId(`fb-stance-${step}`)).toBeVisible();

    for (const limb of ['leftHand', 'rightHand', 'leftFoot', 'rightFoot']) {
      await expect(page.getByTestId(`fb-contact-${step}-${limb}`)).toBeVisible();
    }
    for (const label of ['Left hand', 'Right hand', 'Left foot', 'Right foot']) {
      await expect(card.getByText(new RegExp(label)).first()).toBeVisible();
    }
    await expect(page.getByTestId(`fb-order-${step}`)).toContainText(
      /Suggested order · (preferred|workable|demanding) \d+\/100/,
    );
    await expect(card).toContainText('Why now:');
  }

  // Feet are genuinely planned as their own numbered moves.
  await expect(
    panel.locator('[data-moving-limb="leftFoot"], [data-moving-limb="rightFoot"]').first(),
  ).toBeVisible();

  // The order coaching is on screen: feet set before the long reach.
  await expect(panel.getByText(/Set this foot first/).first()).toBeVisible();

  // Route-rule disclosure is not optional.
  await expect(panel.getByText(/feet follow hands/i)).toBeVisible();
  await expect(panel.getByText(/not proof of the safest or easiest beta/i)).toBeVisible();
});

test('technique chooser: selecting an available alternative changes the sequence', async ({ page }) => {
  await page.goto('/?demo=1&mode=classic');
  await page.getByTestId('full-body-toggle').click();
  const panel = page.getByTestId('full-body-panel');

  // The demo profile has default medium strength → dyno availability depends
  // on the route actually rewarding it; static must always be offered on the
  // ladder. Chips carry a difficulty label.
  const staticChip = page.getByTestId('technique-static');
  await expect(staticChip).toBeVisible();
  await expect(staticChip).toContainText(/easy|moderate|hard/);

  // Re-plan under static: no move may be labeled dynamic.
  await staticChip.click();
  await expect(panel.getByTestId('fb-step-1')).toBeVisible();
  await expect(panel.getByTestId('full-body-steps')).not.toContainText('dynamic');

  // The fixture offers a flag line. Clicking it must change actual move text,
  // not merely the chip styling.
  const before = await panel.locator('[data-testid^="fb-step-"]').allTextContents();
  const flagChip = page.getByTestId('technique-flag');
  await expect(flagChip).toContainText('旗式');
  await expect(flagChip).toBeEnabled();
  await flagChip.click();
  await expect(panel.getByText(/wall flag/i).first()).toBeVisible();
  const after = await panel.locator('[data-testid^="fb-step-"]').allTextContents();
  expect(after).not.toEqual(before);
});
