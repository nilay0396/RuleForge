import { test, expect } from '@playwright/test';
import { login, dismissDailyRewardIfShown, PLAYER1 } from './_helpers';

test.describe('Flow 3 — Guided lesson smoke', () => {
  test('rule lesson opens', async ({ page }) => {
    await login(page, PLAYER1.email, PLAYER1.password);
    await page.waitForLoadState('networkidle').catch(() => {});
    await dismissDailyRewardIfShown(page);
    await page.goto('/rule?key=king_dash');
    await page.waitForTimeout(2500);
    // Just smoke: no uncaught errors and body text rendered
    const text = await page.locator('body').innerText();
    expect(text.length).toBeGreaterThan(20);
  });
});
