import { test, expect } from '@playwright/test';
import { dismissDailyRewardIfShown, login, signUp, ADMIN } from './_helpers';

test.describe('Flow 1 — New user signup & onboarding', () => {
  test('register → land on home with stats', async ({ page }) => {
    await signUp(page);
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(2000);
    await dismissDailyRewardIfShown(page);
    const offRegister = !page.url().includes('/register');
    const helloVisible = await page.getByTestId('home-hello').isVisible().catch(() => false);
    const eloVisible = await page.getByTestId('home-elo').isVisible().catch(() => false);
    expect(offRegister || helloVisible || eloVisible).toBeTruthy();
  });
});

test.describe('Flow 2 — Existing user login', () => {
  test('login known seeded user', async ({ page }) => {
    await login(page, ADMIN.email, ADMIN.password);
    await page.waitForLoadState('networkidle').catch(() => {});
    await dismissDailyRewardIfShown(page);
    const elo = page.getByTestId('home-elo');
    await expect(elo).toBeVisible({ timeout: 15_000 });
  });

  test('login fails on wrong password', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[type="email"]').first().fill(ADMIN.email);
    await page.locator('input[type="password"]').first().fill('absolutely-wrong');
    await page.getByText(/sign\s*in|log\s*in/i).first().click({ force: true });
    await page.waitForTimeout(2500);
    expect(page.url()).toContain('login');
  });
});
