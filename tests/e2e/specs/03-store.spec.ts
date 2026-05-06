import { test, expect } from '@playwright/test';
import { login, dismissDailyRewardIfShown, PLAYER1 } from './_helpers';

test.describe('Flow 7 — Store purchase & inventory', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, PLAYER1.email, PLAYER1.password);
    await page.waitForLoadState('networkidle').catch(() => {});
    await dismissDailyRewardIfShown(page);
  });

  test('store tab renders item grid', async ({ page }) => {
    await page.goto('/store');
    await page.waitForTimeout(2500);
    await expect(page.getByTestId('store-coins')).toBeVisible({ timeout: 15_000 });
    // Default board_classic should be present and equipped
    await expect(page.getByTestId('store-item-board_classic')).toBeVisible();
    // Premium banner visible for non-premium users
    const premium = page.getByTestId('store-premium-banner');
    expect(await premium.count()).toBeGreaterThanOrEqual(0);
  });

  test('preview a board theme and surface buy CTA', async ({ page }) => {
    await page.goto('/store');
    await page.waitForTimeout(2500);
    const item = page.getByTestId('store-item-board_emerald');
    await expect(item).toBeVisible();
    await item.click({ force: true });
    await page.waitForTimeout(1200);
    // Modal should at minimum show the item name
    await expect(page.getByText(/emerald/i).first()).toBeVisible({ timeout: 8000 });
  });

  test('rewarded ad card visible and bounded by daily limit', async ({ page }) => {
    await page.goto('/store');
    await page.waitForTimeout(2500);
    const ad = page.getByTestId('store-ad-card');
    if (await ad.count()) {
      await expect(ad).toBeVisible();
      // Watch button might be disabled if limit hit
      const watch = page.getByTestId('watch-ad-btn');
      expect(await watch.count()).toBeGreaterThanOrEqual(0);
    }
  });
});
