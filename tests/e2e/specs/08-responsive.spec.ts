import { test, expect, devices } from '@playwright/test';
import { login, dismissDailyRewardIfShown, ADMIN } from './_helpers';

const SCREENS = [
  { name: 'iPhone 12 portrait', width: 390, height: 844 },
  { name: 'Galaxy S21 portrait', width: 360, height: 800 },
  { name: 'iPad Mini portrait', width: 768, height: 1024 },
  { name: 'Desktop 1280', width: 1280, height: 800 },
];

test.describe('Mobile responsiveness — no horizontal overflow on key tabs', () => {
  for (const screen of SCREENS) {
    test(`${screen.name}: home, store, watch, tournaments do not overflow`, async ({ page }) => {
      await page.setViewportSize({ width: screen.width, height: screen.height });
      await login(page, ADMIN.email, ADMIN.password);
      await page.waitForLoadState('networkidle').catch(() => {});
      await dismissDailyRewardIfShown(page);

      const routes = ['/home', '/store', '/watch', '/tournaments'];
      for (const route of routes) {
        await page.goto(route).catch(() => {});
        await page.waitForTimeout(1800);
        const dims = await page.evaluate(() => ({
          scrollW: document.documentElement.scrollWidth,
          clientW: document.documentElement.clientWidth,
        }));
        // Allow a small tolerance for scrollbars
        expect(dims.scrollW - dims.clientW).toBeLessThanOrEqual(2);
      }
    });
  }
});
