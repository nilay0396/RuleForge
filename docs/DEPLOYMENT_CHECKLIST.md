# RuleForge Chess — Web Deployment Checklist (v1.0.0)

## Pre-flight
- [ ] Production env vars set (`PRODUCTION_ENV_CHECKLIST.md`)
- [ ] Latest seed-test users **NOT** deployed to prod — only the admin user is intended
- [ ] Test reports refreshed within last 24h: `make qa-status` shows `release_ready: true`
- [ ] Locust full sweep run at 500 users for 5 minutes (no error spikes)
- [ ] `BCRYPT_THREAD_POOL_SIZE` matches expected concurrent registers (default 32)

## Backend deploy
1. Provision FastAPI host (uvicorn behind nginx/Caddy with TLS terminating at the proxy)
2. Mongo Atlas (or self-hosted replica set) with daily snapshot backups
3. Healthcheck: `GET /api/rules` returns 200 in < 100ms
4. Set systemd / supervisor restart policy: `RestartSec=2 Restart=always`
5. Worker count: `uvicorn server:app --workers $(nproc)` if CPU-bound; defaults are fine for this app
6. Add WebSocket route to your reverse proxy (`/api/ws*` and `/api/live/spectate/*`)
7. Confirm `/api/qa/dashboard` is admin-only (E2E `test_only_admin_can_create_bugs` covers this)

## Frontend deploy
1. `cd frontend && npx expo export --platform web` → produces static `dist/`
2. Upload `dist/` to CDN (Vercel/Netlify/CloudFront/S3)
3. Confirm `EXPO_PUBLIC_BACKEND_URL` baked into the build matches prod API
4. Set proper cache headers: HTML `no-cache`, JS/CSS `max-age=31536000` (hashed filenames)
5. Add `/_redirects` (Netlify) or equivalent to route SPA fallbacks to `index.html`

## DNS & TLS
- [ ] `chess.yourdomain.com` → frontend CDN
- [ ] `api.chess.yourdomain.com` → backend
- [ ] HSTS enabled, TLS 1.2+, modern cipher suite
- [ ] CSP header: allow only your own origin + analytics if used

## Smoke after deploy
- [ ] Login `admin@...` returns 200 with token
- [ ] `/api/qa/dashboard` returns `release_ready:true`
- [ ] Web `/login` loads in < 2s
- [ ] Sign up a fresh account and play one offline match
- [ ] Open `/store`, `/watch`, `/tournaments` — confirm data renders
- [ ] Two-device manual pair test (`MP-01..05` from UAT)
