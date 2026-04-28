# RuleForge Chess — Product Requirements Document (MVP)

## MVP Scope (Iteration 2 update)
### Gameplay upgrades (v2)
- **Proper ELO**: K=32; opponent rating per AI level (L1=600, L2=900, L3=1200, L4=1500); new users start at 800.
- **Rating history**: persisted per match in `rating_history`; exposed via `GET /api/rating/history`; rendered on profile as a trend strip.
- **Interactive Guided Scenarios**: replaces quiz — 3 scenarios per rule (king_dash, power_pawns, swap_move) with live chessboard validation, hint, retry, and "Next scenario" flow.
- **Board UX**: no blocking overlay during AI thinking (inline spinner in opponent strip); move history auto-scroll with current-move highlight; sound on move/capture/check/end via WebAudio on web.
- **Controls**: Undo only allowed between AI's reply and the player's next move; Abort only before first move (with confirmation); New-game always requires confirmation.
- **Game-over**: modal shows ELO delta with colored +/- alongside XP and coin rewards.

## Vision
A modern, premium chess app where every match feels familiar but every mode adds a fun twist. We combine timeless chess strategy with newly invented rule variants that are easy to learn and quick to play.

## Target Users
- Casual chess players who want fresh challenges beyond classic chess.
- Serious chess lovers who enjoy puzzles and rule experiments.
- Beginners who appreciate guided onboarding and visual learning.

## MVP Scope (Shipped — Iteration 1)
### Game modes
- **Classic Chess** vs AI bot (4 levels)
- **King Dash** — King may dash 2 squares once per game
- **Power Pawns** — Pawns on rank 5+ slide sideways
- **Swap Move** — Swap any 2 of your own non-king pieces, once per game
- **Daily Rule Challenge** — One auto-rotating rule each day, +50 XP and streak bonus

### Player progression
- ELO-style rating, XP, coins
- Streaks (current + longest), badges (first_win, ten_wins, rule_breaker, streak_3, streak_7, founder)
- Match history with per-match Elo delta

### UX
- Premium dark theme (Jewel & Luxury archetype) with gold accents
- Tap-to-select / tap-to-target chessboard with legal move highlights, last-move highlight, check overlay
- Rule explanation modal before every match
- Interactive "Learn This Rule" guide with quiz scoring
- Time controls: Casual / Rapid 10 / Blitz 5 / Bullet 1
- Captured-piece display per side, undo, new game
- Onboarding hero, login/register, guest play, guest→full upgrade

### Backend / data
- FastAPI + MongoDB (motor async)
- JWT email/password auth (Bearer header) + guest accounts
- Server-side move validator (python-chess) — `POST /api/move/validate`
- Rules / quizzes / daily / matches / users persisted
- Admin panel (web/native) with rules / quizzes / daily / users tabs
- Leaderboard (top 50 by Elo, non-guests)

## Architecture
- Mobile-first React Native (Expo SDK 54) for iOS / Android / Web
- Expo Router file-based routing
- Local game state (chess.js) with custom rule layer (`src/engine.ts`)
- Minimax AI with alpha-beta and per-level noise (`src/ai.ts`)
- Bearer token via AsyncStorage
- Backend designed to accept future WebSocket multiplayer (single source of truth for moves)

## Monetization (stubs in place)
- Coins balance per user, premium boolean flag, badge inventory
- Future: coin packs, board cosmetics, premium rule packs, subscription
- Free daily rule + casual play; premium will unlock advanced packs and AI levels

## Out of Scope (next iterations)
- Real-time multiplayer (WebSocket) — backend ready to extend
- Real payment integration (Stripe / Razorpay)
- Push / email notifications
- Friend invites & match links
- Fog Chess Lite / Capture Boost / Royal Guard
- Cosmetics store, board themes, avatars

## Test Credentials
See `/app/memory/test_credentials.md`.

## Endpoints (selected)
- Auth: `/api/auth/register|login|guest|upgrade|me|logout`
- Content: `/api/rules`, `/api/rules/{key}`
- Match: `/api/matches`, `/api/matches/me`
- Daily: `/api/daily`, `/api/daily/submit`
- Social: `/api/leaderboard`
- Validation: `/api/move/validate`
- Admin: `/api/admin/rules|daily|quizzes|users`
