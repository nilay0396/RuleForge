# RuleForge Chess — v1.0.0 Launch Notes

Release date: 2026-05-06

## What’s included
### Gameplay
- Classic chess + 3 custom rule variants (King Dash, Power Pawns, Swap Move)
- Offline AI bot with adjustable strength (minimax)
- Real-time multiplayer (FastAPI WebSockets) with matchmaking
- Sound effects via expo-audio, optimistic UI, full move history
- Daily rule challenge (guided lessons)

### Retention & social
- Daily login rewards, streaks, XP/level progression
- Tactical puzzles: daily + random by rating, attempt history
- Friends: search, request/accept/reject, online presence, in-app challenges
- Notifications panel for friend events

### Monetization (mock)
- Wallet + transaction ledger
- In-app store: 5 boards · 5 piece sets · 6 avatars (3 premium-only)
- Inventory + preferences (equip your own theme)
- Premium subscription (mock checkout; ready for Stripe / Razorpay)
- Rewarded ads with daily cap (3/day, +15 coins)

### Viral / scale
- Tournaments (Blitz Arena) with live leaderboards and badges
- Global leaderboard with country filter
- Watch Live tab with featured players and spectator mode
- 11 default badges (first-win, ten-wins, podium, champion, streak…)
- Match-share endpoint (text card + result delta)

### Admin / QA
- Admin QA dashboard with bug tracker (CRUD)
- Release-readiness gate (auto from pytest + Playwright + perf JSON)
- Test-data seeder, performance harness, locust load suite
- 22 Playwright E2E specs across 4 viewports

## Quality gates at release
- pytest: **31 / 31** ✅
- Playwright E2E (iphone-12): **22 / 22** ✅
- /auth/register p95: **371ms** ✅ (target 800ms)
- Aggregate p95 under 100u/60s smoke: **190ms** ✅
- Load smoke error rate: **0%** ✅
- Bug tracker blockers / criticals: **0 / 0** ✅

## Known limitations (non-blocking for v1.0.0)
1. **Payments are MOCKED.** Subscribe and item purchases use simulated flows. The endpoint shape is Stripe/Razorpay-ready; real keys flip the switch.
2. **Rewarded ads are SIMULATED.** No real ad network is wired; `POST /api/ads/reward` directly grants coins.
3. **Live multiplayer pairing tests** are smoke-only in CI. Full two-physical-device run is a manual signoff (see UAT MP-01..05).
4. **WebKit / Firefox** Playwright projects exist but only chromium is installed in CI.
5. **Frontend Jest tests** not yet authored; engine.ts and ai.ts have no JS unit tests.
6. **i18n** — strings hard-coded English.
7. **Sentry / error tracking** not wired.
8. **GDPR endpoints** (data export, account delete) not yet implemented.
9. **Push notifications** — in-app only; no APNs/FCM yet.
10. **PWA service worker** — default Expo behaviour; not custom-tuned.

## Security
- bcrypt cost factor 10 (OWASP/passlib production default)
- JWT HS256 with rotatable `JWT_SECRET`
- Server-side validation on every wallet transaction (atomic conditional decrement prevents negative balances)
- Admin-only routes guarded via `role == 'admin'` check
- `.env` files **must** be removed from any deployed bundle

## Test credentials (DEV/STAGING ONLY)
**Production must remove or rotate these before launch.**
See `/app/memory/test_credentials.md`. Specifically:
- `admin@ruleforge.app` → rotate password, change email to your real ops account
- `player1@ruleforge.app`, `friend_*`, `tour_*`, `beginner@`, `premium@`, `celebrity@`, `highrating@` → **delete entirely** in prod

## Multiplayer status
- WebSocket server is in-process (`/api/ws` for matchmaking, `/api/live/spectate/{id}` for read-only spectator)
- Single-instance only — horizontal scale will require a Redis pub/sub or sticky-session ingress
- Documented in `/app/docs/RELEASE_READINESS.md`

## Payment status
- Mock only. To go live:
  1. Add `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` to backend env
  2. Replace the `method == 'mock'` branch in `monetization.premium_subscribe`
  3. Add a `/api/billing/webhook` endpoint and verify signatures
  4. Re-run E2E + load smoke before flipping the toggle
