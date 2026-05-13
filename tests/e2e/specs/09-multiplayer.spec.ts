import fs from 'node:fs';
import path from 'node:path';
import { expect, Page, test } from '@playwright/test';
import { dismissDailyRewardIfShown, signUp, uniqueEmail } from './_helpers';

async function createPlayer(page: Page, name: string) {
  await signUp(page, {
    name,
    email: uniqueEmail(name.toLowerCase().replace(/\s+/g, '-')),
    password: 'QaTest@1234',
  });
  await expect(page.getByTestId('home-elo')).toBeVisible({ timeout: 30_000 });
  await dismissDailyRewardIfShown(page);
}

async function openOnline(page: Page, opponentName: string) {
  const onlineResponse = page.waitForResponse(
    (r) => r.url().includes('/api/online') && r.status() === 200,
    { timeout: 20_000 },
  );
  await page.goto('/online', { waitUntil: 'domcontentloaded' });
  await onlineResponse.catch(() => {});
  await expect(page.getByTestId('online-find')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(opponentName, { exact: true })).toBeVisible({ timeout: 20_000 });
}

async function pairViaOnline(a: Page, b: Page) {
  await a.getByTestId('online-find').click();
  await expect(a.getByTestId('online-cancel')).toBeVisible({ timeout: 10_000 });

  await b.getByTestId('online-find').click();
  await Promise.all([
    a.waitForURL((url) => url.pathname.includes('/play_online'), { timeout: 30_000 }),
    b.waitForURL((url) => url.pathname.includes('/play_online'), { timeout: 30_000 }),
  ]);
  await Promise.all([
    expect(a.getByTestId('chessboard')).toBeVisible({ timeout: 20_000 }),
    expect(b.getByTestId('chessboard')).toBeVisible({ timeout: 20_000 }),
    expect(a.getByTestId('online-resign')).toBeVisible({ timeout: 20_000 }),
    expect(b.getByTestId('online-resign')).toBeVisible({ timeout: 20_000 }),
  ]);
}

async function currentTurnPage(a: Page, b: Page) {
  await expect
    .poll(
      async () => {
        const aTurn = await a.getByText(/your move/i).count();
        const bTurn = await b.getByText(/your move/i).count();
        return `${aTurn > 0 ? 'a' : ''}${bTurn > 0 ? 'b' : ''}`;
      },
      { timeout: 20_000 },
    )
    .toMatch(/^(a|b)$/);

  return (await a.getByText(/your move/i).count()) > 0 ? a : b;
}

async function gameIdFromUrl(page: Page) {
  const url = new URL(page.url());
  const gameId = url.searchParams.get('game_id');
  expect(gameId, `expected play_online URL to include game_id: ${page.url()}`).toBeTruthy();
  return gameId!;
}

async function playMoveFromCurrentTurn(a: Page, b: Page, from: string, to: string, san: string | RegExp) {
  const mover = await currentTurnPage(a, b);
  await mover.getByTestId(`sq-${from}`).click();
  await mover.getByTestId(`sq-${to}`).click();

  await Promise.all([
    expect(a.getByText(san, typeof san === 'string' ? { exact: true } : undefined)).toBeVisible({ timeout: 20_000 }),
    expect(b.getByText(san, typeof san === 'string' ? { exact: true } : undefined)).toBeVisible({ timeout: 20_000 }),
  ]);
}

async function playOpeningMoveFromCurrentTurn(a: Page, b: Page) {
  await playMoveFromCurrentTurn(a, b, 'e2', 'e4', 'e4');
}

async function rejoinActiveGame(disconnectingPage: Page, observingPage: Page) {
  const context = disconnectingPage.context();
  const gameId = await gameIdFromUrl(disconnectingPage);

  await disconnectingPage.close();
  await expect(observingPage.getByText(/disconnected/i)).toBeVisible({ timeout: 20_000 });

  const rejoined = await context.newPage();
  await rejoined.goto(`/play_online?game_id=${gameId}`, { waitUntil: 'domcontentloaded' });

  await Promise.all([
    expect(rejoined.getByTestId('chessboard')).toBeVisible({ timeout: 20_000 }),
    expect(rejoined.getByTestId('online-resign')).toBeVisible({ timeout: 20_000 }),
    expect(rejoined.getByText('e4', { exact: true })).toBeVisible({ timeout: 20_000 }),
  ]);
  await expect(observingPage.getByText(/disconnected/i)).toBeHidden({ timeout: 20_000 });

  return rejoined;
}

async function acceptDrawIfControlsExist(a: Page, b: Page) {
  const offer = a.getByTestId('online-offer-draw')
    .or(a.getByRole('button', { name: /offer draw/i }))
    .first();
  if (!(await offer.isVisible({ timeout: 1500 }).catch(() => false))) return false;

  await offer.click();
  const accept = b.getByTestId('online-accept-draw')
    .or(b.getByRole('button', { name: /accept draw/i }))
    .first();
  await expect(accept).toBeVisible({ timeout: 10_000 });
  await accept.click();

  await Promise.all([
    expect(a.getByText(/draw/i)).toBeVisible({ timeout: 20_000 }),
    expect(b.getByText(/draw/i)).toBeVisible({ timeout: 20_000 }),
    expect(a.getByTestId('online-find-again')).toBeVisible({ timeout: 20_000 }),
    expect(b.getByTestId('online-find-again')).toBeVisible({ timeout: 20_000 }),
  ]);
  return true;
}

async function resignFromCurrentTurn(a: Page, b: Page) {
  const resigner = await currentTurnPage(a, b);
  await resigner.getByTestId('online-resign').click();
  await expect(resigner.getByTestId('confirm-resign-yes')).toBeVisible({ timeout: 10_000 });
  await resigner.getByTestId('confirm-resign-yes').click();

  await Promise.all([
    expect(a.getByText(/victory|defeat/i)).toBeVisible({ timeout: 20_000 }),
    expect(b.getByText(/victory|defeat/i)).toBeVisible({ timeout: 20_000 }),
    expect(a.getByText('Resignation', { exact: true })).toBeVisible({ timeout: 20_000 }),
    expect(b.getByText('Resignation', { exact: true })).toBeVisible({ timeout: 20_000 }),
    expect(a.getByTestId('online-find-again')).toBeVisible({ timeout: 20_000 }),
    expect(b.getByTestId('online-find-again')).toBeVisible({ timeout: 20_000 }),
  ]);
}

test.describe('Flow 5 - real multiplayer', () => {
  test('online promotion and draw contracts stay explicit', async () => {
    const repoRoot = path.resolve(__dirname, '..', '..', '..');
    const playOnline = fs.readFileSync(path.join(repoRoot, 'frontend', 'app', 'play_online.tsx'), 'utf8');
    const realtime = fs.readFileSync(path.join(repoRoot, 'backend', 'realtime.py'), 'utf8');

    expect(playOnline).toContain("type: 'make_move'");
    expect(playOnline).toContain("(['q', 'r', 'b', 'n'] as const)");
    expect(playOnline).toContain('online-promote-${p}');
    expect(playOnline).toMatch(/\.\.\.\(promotion\s*\?\s*\{\s*promotion\s*\}/);
    expect(realtime).toContain('promo = msg.get("promotion") or "q"');
    expect(realtime).toContain('uci + promo');

    const frontendExposesDrawControls = /online-(offer|accept)-draw|Offer draw|Accept draw/i.test(playOnline);
    if (frontendExposesDrawControls) {
      expect(realtime).toMatch(/offer_draw|draw_offer/i);
      expect(realtime).toMatch(/accept_draw|draw_accept/i);
    }
  });

  test('two browsers pair, sync moves, rejoin an active game, and finish', async ({ browser }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'chrome-desktop',
      'Realtime pairing coverage runs once to keep CI runtime bounded.',
    );

    const ctxA = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const a = await ctxA.newPage();
    let b = await ctxB.newPage();

    const suffix = Date.now().toString(36);
    const nameA = `E2E Alpha ${suffix}`;
    const nameB = `E2E Beta ${suffix}`;

    try {
      await createPlayer(a, nameA);
      await createPlayer(b, nameB);

      await Promise.all([
        openOnline(a, nameB),
        openOnline(b, nameA),
      ]);

      await pairViaOnline(a, b);
      await playOpeningMoveFromCurrentTurn(a, b);
      b = await rejoinActiveGame(b, a);
      await playMoveFromCurrentTurn(a, b, 'e7', 'e5', 'e5');

      if (!(await acceptDrawIfControlsExist(a, b))) {
        await resignFromCurrentTurn(a, b);
      }
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });
});
