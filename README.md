# RuleForge Chess

Chess. But forged with rules. A cross-platform chess-variant app with
classic chess plus King Dash, Power Pawns, and Swap Move variants,
real-time multiplayer, daily puzzles, tournaments, spectator mode, a
store, premium subscription, and an admin QA dashboard.

- **Frontend**: Expo Router (React Native + Web) — `/app/frontend`
- **Backend**: FastAPI + Mongo + WebSockets — `/app/backend`
- **Tests**: pytest (unit + API), Playwright E2E, Locust load — `/app/tests`
- **Docs / launch**: `/app/docs/*`
- **Release**: see `VERSION` and `CHANGELOG.md`

## Local quick-start

```bash
# Backend
cd backend && pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port 8001

# Frontend
cd frontend && yarn install
yarn web                       # or `expo start`

# Seed deterministic test users (admin@ruleforge.app / Admin@1234, etc.)
python scripts/seed_test_users.py
```

`/app/memory/test_credentials.md` contains the canonical seeded credentials
used by automated and manual UAT.

## Continuous Integration

Four GitHub Actions workflows live under `.github/workflows/` and run on
every push and pull-request to `main`, `master`, and `develop`:

| Workflow | Purpose |
|----------|---------|
| `backend-tests.yml` | MongoDB service + FastAPI on `:8001`, runs `pytest unit + api`, writes `pytest_summary.json` |
| `frontend-tests.yml` | `expo lint`, `tsc --noEmit`, `expo export --platform web` |
| `e2e-tests.yml` | Boots backend + Expo web export served on `:3000`, runs Playwright on the `iphone-12` project (Chromium with `--with-deps`) |
| `build-check.yml` | `ruff` + `yamllint` + verifies `VERSION`, `CHANGELOG.md`, and the launch docs are present and consistent |

All four are also `workflow_dispatch`-able from the Actions tab.

The full CI/CD playbook — including required secrets, branch protection
recommendation, and local equivalents — is in
[`docs/CI_CD.md`](docs/CI_CD.md).

### Local equivalents

```bash
make test-backend             # pytest unit + api
make test-e2e                 # Playwright (iphone-12 project, requires backend + web up)
python scripts/build_qa_status.py   # produce pytest_summary.json + e2e summary
ruff check backend tests scripts    # what build-check.yml runs
```

## Project layout

```
.
├── backend/                  FastAPI service
├── frontend/                 Expo Router app
├── tests/
│   ├── unit/                 pytest unit
│   ├── api/                  pytest API
│   ├── e2e/                  Playwright specs
│   ├── load/                 Locust
│   └── perf/                 targeted perf harnesses
├── scripts/
│   ├── seed_test_users.py
│   └── build_qa_status.py
├── docs/                     UAT, deployment, rollback, PWA, CI/CD docs
├── .github/workflows/        GitHub Actions pipelines
├── pyproject.toml            ruff config
├── Makefile                  dev / QA shortcuts
├── VERSION                   current release tag (v1.0.0)
└── CHANGELOG.md
```

## Release

The current release is tracked in `VERSION` and described in
`CHANGELOG.md`. The QA dashboard at `/qa` (admin-only) shows automated
test status, performance smoke metrics, the manual UAT signoff card,
and the overall release-ready gate.

See [`docs/LAUNCH_NOTES.md`](docs/LAUNCH_NOTES.md),
[`docs/DEPLOYMENT_CHECKLIST.md`](docs/DEPLOYMENT_CHECKLIST.md), and
[`docs/ROLLBACK_PLAN.md`](docs/ROLLBACK_PLAN.md) for launch operations.
