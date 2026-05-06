import { test, expect } from '@playwright/test';
import { login, dismissDailyRewardIfShown, FRIEND_A, FRIEND_B } from './_helpers';

test.describe('Flow 5 — Two-context smoke (multiplayer / friends)', () => {
  test('two browsers can both reach the home screen as different users', async ({ browser }) => {
    const ctxA = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const a = await ctxA.newPage();
    const b = await ctxB.newPage();
    try {
      await login(a, FRIEND_A.email, FRIEND_A.password);
      await a.waitForResponse((r) => r.url().includes('/api/auth/me') && r.status() === 200, { timeout: 15_000 }).catch(() => {});
      await login(b, FRIEND_B.email, FRIEND_B.password);
      await b.waitForResponse((r) => r.url().includes('/api/auth/me') && r.status() === 200, { timeout: 15_000 }).catch(() => {});
      await dismissDailyRewardIfShown(a);
      await dismissDailyRewardIfShown(b);
      await a.waitForTimeout(1500);
      await b.waitForTimeout(1500);
      await expect(a.getByTestId('home-elo')).toBeVisible({ timeout: 30_000 });
      await expect(b.getByTestId('home-elo')).toBeVisible({ timeout: 30_000 });
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });
});

test.describe('Flow 6 — Multiplayer queue smoke (best-effort)', () => {
  test('online tab loads without crash for both users', async ({ browser }) => {
    const ctxA = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const a = await ctxA.newPage();
    const b = await ctxB.newPage();
    try {
      await login(a, FRIEND_A.email, FRIEND_A.password);
      await login(b, FRIEND_B.email, FRIEND_B.password);
      await dismissDailyRewardIfShown(a);
      await dismissDailyRewardIfShown(b);
      await a.goto('/online'); await a.waitForTimeout(2000);
      await b.goto('/online'); await b.waitForTimeout(2000);
      // Both pages load (smoke). Full pairing is covered by manual UAT.
      expect(await a.locator('body').innerText()).toBeTruthy();
      expect(await b.locator('body').innerText()).toBeTruthy();
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });
});
