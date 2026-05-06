# Rollback Plan — v1.0.0

## Trigger criteria
Initiate rollback if any of the following occur within the first 72h post-launch:
- Any blocker bug filed in `/api/qa/bugs` (severity=blocker)
- Crash rate > 1% across any platform
- p95 latency on any read endpoint > 1500ms for >5 minutes
- Backend 5xx error rate > 0.5% for >5 minutes
- Authentication failures spike > 10x baseline
- Mongo connection failures or replication lag > 30s

## Decision authority
- On-call engineer (Tier 1) initiates within 5 minutes of trigger
- Tech lead approves any data-mutating action (mongo restore)
- Customer comms (status page) within 15 minutes

## Steps
### 1. Backend
- Roll back to previous container image: `kubectl rollout undo deployment/ruleforge-backend` (or supervisorctl)
- Verify health: `GET /api/rules` returns 200 < 100ms
- Verify auth: `POST /api/auth/login` with admin credentials returns 200

### 2. Frontend
- Revert CDN to previous static bundle (Vercel/Netlify: “Instant Rollback”)
- Hard-refresh once a few users to confirm hash changes

### 3. Database
No schema migrations were executed in v1.0.0 — all collections were created additively
with uuid keys. Therefore:
- **No DB rollback required** for code rollback
- If a corrupting write was committed, restore the affected collection from the latest
  Mongo Atlas snapshot (RPO: 6h)

### 4. WebSocket clients
- Active games will reconnect automatically once backend is healthy
- If users complain, advise hard-refresh

### 5. Verification
- `make test-backend` against production base URL: 31 pass
- `make test-e2e E2E_BASE_URL=https://chess.yourdomain.com`: 22 pass
- `make load-light --host https://api.chess.yourdomain.com`: 0% errors
- Status page → “All systems operational”

## Communication
- Update status page within 15 min of trigger
- Post-incident review within 48h with root cause + new prevention items
- File post-mortem bug in `/api/qa/bugs` with severity=critical and status=fixed

## What we WILL NOT do
- Drop tables (additive schema; safe)
- Disable bcrypt to “recover” perf (compromises security)
- Disable admin auth checks (compromises trust)
