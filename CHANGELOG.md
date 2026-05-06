# RuleForge Chess — Changelog

## v1.0.0 — 2026-05-06 🚀 General Availability

First public release.

### Major surface
- Classic chess + 3 custom rule variants (King Dash, Power Pawns, Swap Move)
- Offline AI, real-time multiplayer, guided lessons
- Daily rewards, streaks, XP, tactical puzzles
- Friends, challenges, in-app notifications
- Tournaments, global leaderboards, spectator mode, badges, share cards
- Wallet, store (boards/pieces/avatars), inventory, preferences
- Premium subscription (mock), rewarded ads (capped 3/day)
- Admin QA dashboard with release-readiness gate

### Quality
- 31 backend pytest cases (unit + API)
- 22 Playwright E2E specs across 4 viewports
- Locust load suite (3 user classes)
- Targeted /auth/register perf harness
- Async bcrypt (rounds=10) + 32-thread executor pool
- p95 190ms aggregate / 371ms register / 0% errors

### Documentation
- `docs/UAT_CHECKLIST.md` (53 cases)
- `docs/UAT_RESULTS.md` (this release’s pass/fail)
- `docs/RELEASE_READINESS.md`
- `docs/PRODUCTION_ENV_CHECKLIST.md`
- `docs/DEPLOYMENT_CHECKLIST.md`
- `docs/PWA_MOBILE_CHECKLIST.md`
- `docs/LAUNCH_NOTES.md`
- `docs/ROLLBACK_PLAN.md`

### Known limitations (non-blocking)
See `LAUNCH_NOTES.md` § Known limitations.
