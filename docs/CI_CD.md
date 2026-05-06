# RuleForge Chess — CI/CD Guide

This document explains the GitHub Actions setup that gates merges into the
main release branches. Workflows live in `.github/workflows/`.

## Pipelines

| Workflow | File | Triggers | What it does |
|----------|------|----------|--------------|
| Backend tests | `backend-tests.yml` | push / PR to `main`, `master`, `develop`; manual | Spins up MongoDB 6 service, installs Python deps, seeds users, starts FastAPI on `:8001`, runs `pytest unit + api`, builds `pytest_summary.json`, fails on any non-zero pytest result |
| Frontend tests | `frontend-tests.yml` | push / PR; manual | Installs frontend yarn deps, runs `expo lint`, runs `tsc --noEmit`, runs `yarn test` (skipped cleanly if Jest is not yet configured), runs `expo export --platform web` to ensure the web bundle still builds, uploads artifact `frontend-web-dist` |
| Playwright E2E | `e2e-tests.yml` | push / PR; manual (project selectable) | Boots Mongo + FastAPI + Expo web export served via `npx serve` on `:3000`, installs Playwright Chromium with `--with-deps`, runs the chosen project (`iphone-12` by default), uploads HTML report + traces on failure |
| Build / static check | `build-check.yml` | push / PR; manual | Lints backend with `ruff`, validates workflow YAML with `yamllint`, runs frontend `expo lint` (advisory), verifies that `VERSION`, `CHANGELOG.md`, and the launch docs are present and consistent |

All workflows declare `concurrency` so newer commits cancel older in-flight runs on the same ref, and they all expose `workflow_dispatch` for manual reruns from the Actions tab.

## Required environment variables

Nothing has to be configured in GitHub for the default workflows to pass. Each workflow sets its own ephemeral env via the `env:` block:

```
MONGO_URL=mongodb://localhost:27017
DB_NAME=ruleforge_ci
JWT_SECRET=ci-secret-do-not-use-in-prod
ADMIN_EMAIL=admin@ruleforge.app
ADMIN_PASSWORD=Admin@1234
FRONTEND_URL=http://localhost:3000
BCRYPT_ROUNDS=4               # rounds=4 keeps register fast under CI; production uses 10
BCRYPT_THREAD_POOL_SIZE=8
EXPO_PUBLIC_BACKEND_URL=http://localhost:8001
EXPO_PACKAGER_HOSTNAME=localhost
EXPO_PACKAGER_PROXY_URL=http://localhost:3000
E2E_BASE_URL=http://localhost:3000
```

> The CI bcrypt rounds are intentionally low (`4`) so the auth-heavy tests finish in seconds. Production uses `10` rounds — never reduce that in `backend/.env` for live deployments.

## Secrets checklist (Settings → Secrets and variables → Actions)

The default pipeline does **not** require any secrets. The list below is the forward-looking checklist for when later phases (payments, deployment, monitoring) are switched on:

| Secret | Used by | Status |
|--------|---------|--------|
| `STRIPE_SECRET_KEY` (test) | Phase 5 — payments | Optional, not yet wired |
| `STRIPE_WEBHOOK_SECRET` | Phase 5 — payments | Optional, not yet wired |
| `RAZORPAY_KEY_ID` (test) | Phase 5 — payments | Optional, not yet wired |
| `RAZORPAY_KEY_SECRET` (test) | Phase 5 — payments | Optional, not yet wired |
| `EXPO_TOKEN` | EAS preview deploys | Optional |
| `SENTRY_DSN` | error monitoring | Optional |
| `CODECOV_TOKEN` | coverage upload | Optional |
| `DEPLOY_SSH_KEY` / `DEPLOY_HOST` | host deploy | Optional |

Add these only when the corresponding phase is active. Workflows referencing them must guard with `if: ${{ secrets.X != '' }}` so forks/PRs without the secret still pass.

## Branch protection recommendation

In **Settings → Branches → Branch protection rules** for `main` (and any other release branch you protect), enable:

1. **Require a pull request before merging** — at least 1 approving review.
2. **Require status checks to pass before merging** — select all four:
   - `backend-tests / pytest (unit + api)`
   - `frontend-tests / lint · typecheck · web build`
   - `e2e-tests / Playwright E2E (iphone-12)`
   - `build-check / lint · YAML · workflow validation`
3. **Require branches to be up to date before merging** — keeps `main` linear.
4. **Require conversation resolution before merging**.
5. **Do not allow bypassing the above settings** — even for admins, until launch is stable.
6. **Restrict who can push to matching branches** — only release managers.
7. **Require signed commits** (optional but recommended once GA).
8. **Block force pushes** and **block deletions**.

For `develop`/feature branches, only require `build-check` so iteration stays fast.

## Local equivalents

All CI commands map to entries in the root `Makefile` so you can reproduce them on your laptop:

```bash
make test-backend     # what backend-tests.yml runs (without the seed step)
python scripts/seed_test_users.py
python scripts/build_qa_status.py    # produces pytest_summary.json + e2e_pass
make test-e2e         # iphone-12 Playwright project (frontend & backend must be up)
```

## Adding a new workflow

1. Drop the YAML in `.github/workflows/`.
2. Run `yamllint .github/workflows/your-file.yml` locally.
3. Push and watch the Actions tab; promote to required status only after it has stayed green for several runs.

## Known limitations

* Playwright E2E currently runs only the `iphone-12` project on CI; expand by passing `project: galaxy-s21` (etc.) via the `workflow_dispatch` input or by adding a matrix in `e2e-tests.yml`.
* Locust load tests are intentionally not in CI — they belong to a scheduled performance pipeline so they don't gate every PR.
* The Expo web export runs on every PR; a future optimisation is to cache `frontend/.expo` and `frontend/dist` between runs.
