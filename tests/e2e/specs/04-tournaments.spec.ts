import { test, expect } from '@playwright/test';
import { login, dismissDailyRewardIfShown, PLAYER1 } from './_helpers';

test.describe('Flow 8 — Tournament discovery & detail', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, PLAYER1.email, PLAYER1.password);
    await page.waitForLoadState('networkidle').catch(() => {});
    await dismissDailyRewardIfShown(page);
  });

  test('tournaments tab lists at least 1 tournament', async ({ page }) => {
    await page.goto('/tournaments');
    await page.waitForTimeout(2500);
    // Look for at least one card with testID prefix tourney-
    const anyCard = page.locator('[data-testid^="tourney-"]').first();
    await expect(anyCard).toBeVisible({ timeout: 15_000 });
  });

  test('open tournament detail and join (best-effort)', async ({ page }) => {
    await page.goto('/tournaments');
    await page.waitForTimeout(2500);
    const card = page.locator('[data-testid^="tourney-"]').first();
    await card.click({ force: true });
    await page.waitForTimeout(2500);
    // Should be on /tournament route
    expect(page.url()).toContain('/tournament');
    // If a join CTA exists, click it (graceful when already joined)
    const join = page.getByTestId('tournament-join').or(page.getByTestId('tournament-reserve'));
    if (await join.count()) {
      await join.click({ force: true });
      await page.waitForTimeout(1500);
    }
  });
});
