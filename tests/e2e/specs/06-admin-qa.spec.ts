import { test, expect } from '@playwright/test';
import { dismissDailyRewardIfShown, login, ADMIN } from './_helpers';

test.describe('Flow 10 — Admin QA dashboard', () => {
  test('admin can open QA dashboard and see metrics', async ({ page }) => {
    await login(page, ADMIN.email, ADMIN.password);
    // Confirm auth is hydrated by waiting for /api/auth/me to come back
    await page.waitForResponse((r) => r.url().includes('/api/auth/me') && r.status() === 200, { timeout: 15_000 }).catch(() => {});
    await dismissDailyRewardIfShown(page);
    await page.goto('/qa');
    await page.waitForResponse((r) => r.url().includes('/api/qa/dashboard'), { timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(2500);
    // Retry-friendly: bring page to front, wait again
    await expect(page.getByTestId('qa-release-card')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Pytest summary/i)).toBeVisible();
    await expect(page.getByText(/Bug tracker/i)).toBeVisible();
  });

  test('admin can file a bug and see it appear', async ({ page }) => {
    await login(page, ADMIN.email, ADMIN.password);
    await page.waitForResponse((r) => r.url().includes('/api/auth/me') && r.status() === 200, { timeout: 15_000 }).catch(() => {});
    await dismissDailyRewardIfShown(page);
    await page.goto('/qa');
    await page.waitForResponse((r) => r.url().includes('/api/qa/dashboard'), { timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(2500);
    const newBtn = page.getByTestId('qa-new-bug');
    await expect(newBtn).toBeVisible({ timeout: 30_000 });
    await newBtn.click({ force: true });
    await page.waitForTimeout(800);
    const title = `E2E auto-filed ${Date.now()}`;
    // Fill modal inputs by placeholder (RN web TextInput uses native input)
    const titleInput = page.locator('input[placeholder=\"Title\"]').first();
    await expect(titleInput).toBeVisible({ timeout: 10_000 });
    await titleInput.fill(title);
    await page.locator('input[placeholder^=\"Feature\"]').first().fill('e2e');
    const submit = page.getByTestId('qa-submit-bug');
    await submit.click({ force: true });
    await page.waitForResponse((r) => r.url().includes('/api/qa/bugs') && r.request().method() === 'POST', { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await expect(page.getByText(title)).toBeVisible({ timeout: 15_000 });
  });
});
