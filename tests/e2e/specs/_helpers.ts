import { Page, expect } from '@playwright/test';

export const ADMIN = { email: 'admin@ruleforge.app', password: 'Admin@1234', name: 'GM Admin' };
export const PLAYER1 = { email: 'player1@ruleforge.app', password: 'Player@1234', name: 'Test Player' };
export const FRIEND_A = { email: 'friend_a@ruleforgeqa.app', password: 'QaTest@1234', name: 'Friend A' };
export const FRIEND_B = { email: 'friend_b@ruleforgeqa.app', password: 'QaTest@1234', name: 'Friend B' };

export function uniqueEmail(prefix = 'e2e') {
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}-${Date.now()}@ruleforgeqa.app`;
}

/** Sign up a brand-new user and return their email/password. */
export async function signUp(page: Page, opts?: { name?: string; email?: string; password?: string }) {
  const email = opts?.email || uniqueEmail();
  const password = opts?.password || 'QaTest@1234';
  const name = opts?.name || 'E2E User';
  await page.goto('/register', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  const nameInput = page.getByTestId('reg-name');
  if (await nameInput.count()) await nameInput.fill(name);
  await page.getByTestId('reg-email').fill(email);
  await page.getByTestId('reg-password').fill(password);
  await page.getByTestId('reg-submit').click({ force: true });
  await page.waitForURL((u) => !u.pathname.includes('register'), { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(2000);
  return { email, password, name };
}

export async function login(page: Page, email: string, password: string) {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"], input[placeholder*="Email" i]').first().fill(email);
  await page.locator('input[type="password"], input[placeholder*="Password" i]').first().fill(password);
  await page.getByText(/sign\s*in|log\s*in/i).first().click({ force: true });
  await page.waitForTimeout(2500);
}

export async function logout(page: Page) {
  // Best-effort: navigate to profile and tap logout if present
  await page.goto('/profile').catch(() => {});
  const btn = page.getByText(/log\s*out|sign\s*out/i).first();
  if (await btn.count()) await btn.click({ force: true }).catch(() => {});
  await page.waitForTimeout(800);
}

export async function dismissDailyRewardIfShown(page: Page) {
  const modal = page.getByTestId('daily-reward-modal');
  if (await modal.count().catch(() => 0)) {
    const claim = page.getByTestId('claim-reward-btn');
    if (await claim.count()) await claim.click({ force: true }).catch(() => {});
    await page.waitForTimeout(1500);
    const done = page.getByTestId('reward-done-btn');
    if (await done.count()) await done.click({ force: true }).catch(() => {});
    await page.waitForTimeout(800);
  }
}

export async function waitForApi(page: Page, urlSubstring: string, timeoutMs = 8000) {
  return page.waitForResponse((r) => r.url().includes(urlSubstring) && r.status() < 500, { timeout: timeoutMs });
}

export async function tapTab(page: Page, testId: string) {
  const t = page.getByTestId(testId);
  if (await t.count()) {
    await t.click({ force: true });
  }
}

export async function expectVisible(page: Page, testId: string, timeout = 8000) {
  await expect(page.getByTestId(testId)).toBeVisible({ timeout });
}
