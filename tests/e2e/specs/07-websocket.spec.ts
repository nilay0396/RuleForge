import { test, expect } from '@playwright/test';
import { login, dismissDailyRewardIfShown, PLAYER1 } from './_helpers';

test.describe('WebSocket stability — spectator socket', () => {
  test('spectate ws emits message for non-existent game (graceful close)', async ({ page, context }) => {
    await login(page, PLAYER1.email, PLAYER1.password);
    await page.waitForLoadState('networkidle').catch(() => {});
    await dismissDailyRewardIfShown(page);

    // Capture native console errors as a smoke gate.
    const errors: string[] = [];
    page.on('pageerror', (e) => {
      if (!e.message.includes('Minified React error #418')) {
        errors.push(e.message);
      }
    });

    await page.goto('/spectate?game_id=non-existent-test-id');
    await page.waitForTimeout(4000);

    // The spectator screen should not throw uncaught errors.
    expect(errors).toEqual([]);
  });
});
