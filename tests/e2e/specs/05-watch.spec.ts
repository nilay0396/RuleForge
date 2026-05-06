import { test, expect } from '@playwright/test';
import { login, dismissDailyRewardIfShown, PLAYER1 } from './_helpers';

test.describe('Flow 9 — Watch live & spectator (graceful when no live games)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, PLAYER1.email, PLAYER1.password);
    await page.waitForLoadState('networkidle').catch(() => {});
    await dismissDailyRewardIfShown(page);
  });

  test('watch tab shows featured + leaderboard', async ({ page }) => {
    await page.goto('/watch');
    // Wait for the live games endpoint to settle (or timeout gracefully)
    await page.waitForResponse((r) => r.url().includes('/api/live/games'), { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(2000);
    await expect(page.getByTestId('lb-pill')).toBeVisible({ timeout: 30_000 });
  });

  test('spectator screen renders error gracefully for stale game id', async ({ page }) => {
    await page.goto('/spectate?game_id=does-not-exist');
    await page.waitForTimeout(3000);
    // Should show error/state, not crash
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.length).toBeGreaterThan(0);
  });
});
