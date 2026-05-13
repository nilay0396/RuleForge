# Realtime Multiplayer Production Roadmap

RuleForge currently has a working classic-chess multiplayer MVP. It is not yet production-ready for scaled, real-money, or public-ranked play.

## Production Target

The first production target is server-authoritative classic chess:

- reliable matchmaking and challenges
- exactly one active rated game per user
- server-authoritative move validation and finalization
- reconnect and rejoin without stale boards
- idempotent rating/stat updates
- live spectator updates
- automated two-player E2E coverage

Variant multiplayer should stay disabled until each variant has backend validation and persistence equivalent to classic chess.

## Workstreams

1. Backend realtime core
- Move active game state, matchmaking, and presence out of process-local memory or make deployment single-worker explicit.
- Add idempotent game finalization and one-active-game enforcement.
- Add clocks, timeout wins, draw offers, draw claims, and reconnect grace rules.

2. Frontend realtime UX
- Prevent silent WebSocket command drops.
- Resync game state after every reconnect.
- Surface illegal move, stale game, and connection errors.
- Add promotion selection and stronger spectator live updates.

3. QA automation
- Add two-browser E2E tests for pairing, legal move propagation, illegal turn rejection, resign, reconnect, abandonment, and spectating.
- Expand CI beyond the iPhone 12 project before GA.

4. Production platform
- Enforce exact CORS origins in production.
- Disable default seed accounts in production unless explicitly requested.
- Add rate limiting, request IDs, health checks, metrics, and error tracking.
- Add reproducible deployment artifacts and fresh release evidence gates.

## Release Policy

Until the target above is met, label releases as pre-release or controlled beta, not production GA.
