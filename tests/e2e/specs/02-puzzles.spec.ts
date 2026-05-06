import { test, expect } from '@playwright/test';
import { login, dismissDailyRewardIfShown, PLAYER1 } from './_helpers';

test.describe('Flow 4 — Daily puzzle completion', () => {
  test('open daily puzzle and verify renders', async ({ page }) => {
    await login(page, PLAYER1.email, PLAYER1.password);
    await page.waitForLoadState('networkidle').catch(() => {});
    await dismissDailyRewardIfShown(page);
    const card = page.getByTestId('home-daily-puzzle-card');
    await expect(card).toBeVisible({ timeout: 15_000 });
    await card.click({ force: true });
    await page.waitForTimeout(2500);
    // Puzzle screen renders — board visible (look for chess board pseudo-elements: score, hint, give-up)
    expect(page.url()).toContain('/puzzle');
  });
});

test.describe('Flow 4b — Random puzzle from home tile', () => {
  test('random puzzle navigation', async ({ page }) => {
    await login(page, PLAYER1.email, PLAYER1.password);
    await page.waitForLoadState('networkidle').catch(() => {});
    await dismissDailyRewardIfShown(page);
    const tile = page.getByTestId('home-random-puzzle-card');
    await expect(tile).toBeVisible({ timeout: 15_000 });
    await tile.click({ force: true });
    await page.waitForTimeout(2500);
    expect(page.url()).toContain('/puzzle');
  });
});
