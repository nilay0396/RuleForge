# RuleForge Chess — Release Readiness

## Definition of Done (DoD)
The build is **release-ready** ONLY when ALL the following pass:

| Gate | Required | Owned by |
|------|----------|----------|
| 0 blocker bugs (`/api/qa/bugs?severity=blocker`) | ✅ | QA |
| 0 critical bugs | ✅ | QA |
| Pytest suite (`make test-backend`) green | ✅ | Backend |
| API contract tests green | ✅ | Backend |
| E2E happy paths (Playwright) green — *manual sign-off until automated* | ⏱️ | QA |
| Performance targets met (see below) | ✅ | Backend |
| Load test thresholds met | ✅ | Backend |
| UAT checklist 100% ✅ | ⏱️ | QA |
| iOS build runs on a physical device | ⏱️ | Mobile |
| Android build runs on a physical device | ⏱️ | Mobile |

## Performance Targets
| Metric | Target | Measured how |
|--------|--------|--------------|
| Initial home screen load | < 2 s on 4G | Lighthouse / Expo dev menu |
| Board move UI update | < 100 ms | React profiler |
| API common requests p95 | < 300 ms | locust report |
| Multiplayer move broadcast | < 500 ms | Manual two-device timing |
| Puzzle load | < 400 ms p95 | locust report |
| Leaderboard query | < 300 ms p95 | locust report |

## Load Test Scenarios (Locust)
| Scenario | Users | RPS | Pass criterion |
|----------|-------|-----|----------------|
| Browse + leaderboards | 1000 | ~150 | err < 1%, p95 < 800 ms |
| Active games | 500 | ~80 | WS reconnect < 2s |
| Multiplayer rooms | 200 | ~50 | move broadcast < 500 ms |
| Puzzle solving | 100 | ~30 | p95 < 400 ms |
| Tournament leaderboard | 100 | ~50 | p95 < 300 ms |

Run:
```
make load-light    # 100 users / 60s smoke test
make load          # 500 users / 5min full sweep (manual)
```

## Status Snapshot
_Updated by `make status` (writes /app/test_reports/pytest_summary.json)._

| Item | Status |
|------|--------|
| Backend pytest | populated by `make test-backend` |
| Locust smoke   | populated by `make load-light` |
| QA bugs (blocker/critical) | live via `/api/qa/dashboard` |

## What Is Still Left
See "Open QA Items" section below — these are the remaining gaps before
the app is truly production-ready:

1. **E2E Playwright suite (FRONTEND)** — only one example flow exists. Need to author `tests/e2e/*.spec.ts` for Flows 1–10 in PRD.
2. **Frontend unit tests (Jest + RTL)** — zero coverage today. Recommend starting with `engine.ts`, `ai.ts`, and reducer-style helpers.
3. **Native device QA** — only web preview validated. Need iOS Simulator + Android Emulator passes.
4. **PWA install / offline mode** — not configured in `app.json` web settings.
5. **Admin tooling**: rule-editor and puzzle-uploader CRUD UIs are stubs.
6. **Privacy / GDPR**: no data-export or delete-account endpoints yet.
7. **Payment integration**: still mock; need Stripe/Razorpay key + webhook tests.
8. **Accessibility audit**: VoiceOver/TalkBack labels on board cells.
9. **Internationalisation (i18n)**: hard-coded English strings.
10. **Error tracking** (Sentry) is not wired.
11. **CI** (GitHub Actions) is not yet configured — the Makefile targets are local-runnable but not pipelined.

Until items 1–3 are complete, this build should be marked **⚠️ Pre-release**, not Production.
