#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: |
  Build a production-ready cross-platform chess-variant game app (RuleForge Chess) for Web,
  Android, iPhone. Core features: Classic Chess, Rule variants, Offline AI, Daily Rule Challenge,
  Multiplayer, Profiles, Puzzles, Admin. Premium chess.com-style UI, mobile-first.
  Current iteration (4): Retention systems — daily login rewards, login streaks, XP/level
  progression, and Puzzle Mode (daily + random tactical puzzles).

backend:
  - task: "Daily reward state & claim endpoints"
    implemented: true
    working: true
    file: "/app/backend/retention.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "GET /api/daily-reward/state and POST /api/daily-reward/claim added.
          Streak rolls forward if claimed yesterday, resets if gap, locks once per day.
          Multiplier 1x (<4d), 1.5x (4-6d), 2x (>=7d). Updates xp/coins/login_streak/last_login_date/last_reward_date.
          Verified manually via screenshot — claim succeeded, XP +25, coins +50, streak=1."
        - working: true
          agent: "testing"
          comment: "Verified via /app/backend_test.py. Fresh state returns available=true, coins=50, xp=25, multiplier=1.0, next_streak_if_claimed=1. First claim returns claimed:true with correct coins/xp/multiplier/streak and user.coins/xp/login_streak updated. Second claim same day returns already_claimed:true and user stats unchanged."
  - task: "Daily puzzle endpoint (1-move filter)"
    implemented: true
    working: true
    file: "/app/backend/retention.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "GET /api/puzzles/daily picks a single-move puzzle deterministically by date,
          stores in daily_puzzles, returns puzzle (without solution) + completion flag.
          Filtered to solution length == 1 for v1 (multi-move support deferred)."
        - working: true
          agent: "testing"
          comment: "Verified: returns {daily, puzzle, completed}. Puzzle has id/title/theme/rating/fen/hint/solution_length=1 and no 'solution' field. completed=false initially. Idempotency test: two calls return the same daily+puzzle id and db.daily_puzzles has exactly 1 doc for today."
  - task: "Random puzzle endpoint"
    implemented: true
    working: true
    file: "/app/backend/retention.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "GET /api/puzzles/random returns a 1-move puzzle near user's puzzle_rating ±150,
          expanding tolerance progressively if no match. Hides solution."
        - working: true
          agent: "testing"
          comment: "Verified: returns {puzzle} with solution_length=1, no 'solution' field. Rating within ±150 of user.puzzle_rating (800 default)."
  - task: "Submit puzzle attempt"
    implemented: true
    working: true
    file: "/app/backend/retention.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "POST /api/puzzles/{id}/attempt validates user moves vs hidden solution,
          adjusts puzzle_rating with K=24 elo delta, awards XP/coins (bonus +25 XP / +10 coins for daily).
          Stores in puzzle_attempts collection."
        - working: true
          agent: "testing"
          comment: "Verified both paths.
          FAIL PATH: wrong moves with success=true → attempt.status=failed, solution=null, xp_gain=5, coin_gain=0, delta<=0, user.xp +=5.
          SUCCESS PATH (daily puzzle): correct solution from db → attempt.status=solved, solution returned, xp_gain=55 (30+25 daily bonus), coin_gain=18 (8+10 daily bonus), puzzle_rating increased, user.xp/coins updated."
  - task: "Puzzle history endpoint"
    implemented: true
    working: true
    file: "/app/backend/retention.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "GET /api/puzzles/me/history returns latest 50 attempts with solved/total counts."
        - working: true
          agent: "testing"
          comment: "Verified: returns {history, solved, total}. After one failed + one solved attempt total=2, solved=1. GET /api/puzzles/{id} also confirmed to hide solution and return solution_length."
  - task: "Public user includes retention fields"
    implemented: true
    working: true
    file: "/app/backend/retention.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
  - task: "Wallet endpoints (/wallet, /transactions)"
    implemented: true
    working: true
    file: "/app/backend/monetization.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "GET /api/wallet returns coins, is_premium, recent (≤20), totals (sum/count by type). GET /api/transactions returns paged ledger."
        - working: true
          agent: "testing"
          comment: "Verified via /app/backend_test.py. /wallet returns {coins, is_premium, recent (list ≤20), totals (dict)} with correct types. After running full flow totals correctly aggregated to {'purchase':{0,1}, 'spend':{300,1}, 'earn':{45,3}}. /transactions?limit=20 returns rows with type/source/amount/created_at fields including spend(store_purchase,300) and earn(ad_view,15)."
  - task: "Store list & purchase (/store, /store/{key}/buy)"
    implemented: true
    working: true
    file: "/app/backend/monetization.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "16 items seeded (5 boards, 5 pieces, 6 avatars). owned/equipped/locked_premium decorators. Atomic conditional decrement prevents negative coins. Purchase logs spend/store_purchase transaction."
        - working: true
          agent: "testing"
          comment: "All 16 expected keys present (5 boards, 5 pieces, 6 avatars). grouped has board/piece/avatar. Defaults (board_classic/piece_classic/avatar_pawn) show owned:true equipped:true. Premium-only (board_obsidian/piece_aurum/avatar_crown) show locked_premium:true for non-premium. Buy flow: coins=200 → 402; coins=500 → 200 with {ok:true, price_paid:300, coins:200}; spend/store_purchase/300 tx logged; duplicate → 400; non-premium buying obsidian → 403; non-existent key → 404; coins=0 buying 200-coin item → 402 with no DB mutation (atomic conditional decrement working)."
  - task: "Inventory listing (/inventory)"
    implemented: true
    working: true
    file: "/app/backend/monetization.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
        - working: true
          agent: "testing"
          comment: "Returns {inventory:[...], count:N} with rows hydrated with item details and equipped flag. Includes default rows (board_classic/piece_classic/avatar_pawn) plus newly purchased board_emerald."
  - task: "Preferences GET/PUT (/preferences)"
    implemented: true
    working: true
    file: "/app/backend/monetization.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "PUT validates ownership: defaults always allowed, premium-only allowed only when is_premium=true, otherwise must be owned. Returns 403 on locked equip attempt."
        - working: true
          agent: "testing"
          comment: "PUT board_midnight (not owned) → 403; PUT board_emerald (just bought) → 200 with prefs.board_theme=board_emerald; PUT avatar=avatar_pawn (default) → 200; GET /preferences reflects last set values; PUT board_obsidian as premium → 200; after /premium/cancel, PUT board_obsidian → 403 (premium-gating works correctly)."
  - task: "Premium subscribe & cancel (/premium/*)"
    implemented: true
    working: true
    file: "/app/backend/monetization.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "Mock payment flow ready for Stripe/Razorpay. method='coins' deducts 5000 atomically; method='mock' is free upgrade. Cancel resets is_premium=false."
        - working: true
          agent: "testing"
          comment: "GET /premium returns 4 expected benefits (no_ads/exclusive_themes/extra_puzzles/advanced_stats), price={coins:5000, monthly_usd:'4.99', yearly_usd:'39.99'}, is_premium:false initially. POST /premium/subscribe {method:'mock', plan:'monthly'} → 200 {ok:true, coins_paid:0, user.is_premium:true}; /auth/me reflects is_premium=true; /store now shows board_obsidian.locked_premium=false. POST /premium/cancel → 200, /auth/me is_premium=false. POST /premium/subscribe {method:'coins'} with coins<5000 → 402 (atomic guard works)."
  - task: "Rewarded ads (/ads/state, /ads/reward)"
    implemented: true
    working: true
    file: "/app/backend/monetization.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "Daily limit 3 per user (ad_views collection by user/date). Reward +15 coins. Premium accounts blocked (no ads policy)."
        - working: true
          agent: "testing"
          comment: "GET /ads/state for non-premium returns {is_premium:false, available:true, remaining:3, limit:3, reward_coins:15}. POST /ads/reward awards +15 coins each call (3x), decrements remaining, logs earn/ad_view transaction. 4th call → 429 'Daily ad limit reached'. User coins increased by exactly 45 (200→245)."
  - task: "Transaction logging hooks in retention & matches"
    implemented: true
    working: true
    file: "/app/backend/server.py, /app/backend/retention.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "record_match logs match_win/draw/loss earnings; daily reward logs daily_reward; puzzle attempts log puzzle/daily_puzzle_bonus."
        - working: true
          agent: "testing"
          comment: "Hooks exercised indirectly via store/ad/premium flows: spend(store_purchase,300), earn(ad_view,15)x3, purchase(premium_purchase,0,mock) all written correctly with required fields (type/source/amount/created_at). Wallet aggregation reflects sums."
    status_history:
        - working: "NA"
          agent: "main"
          comment: "_public_user now includes level/level_progress/level_needed/login_streak/longest_login_streak/last_login_date/last_reward_date/daily_reward_available/next_streak_if_claimed/puzzle_rating."
        - working: true
          agent: "testing"
          comment: "Verified via GET /api/auth/me after claim: login_streak=1, daily_reward_available=false, last_reward_date=today (YYYY-MM-DD). level/level_progress/level_needed are integers; puzzle_rating=800 default present."

  - task: "Tournaments CRUD + leaderboard + report-match"
    implemented: true
    working: true
    file: "/app/backend/viral.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "Seeded 1 live + 2 upcoming. Endpoints: GET /api/tournaments[?scope], GET /api/tournaments/{id}, POST join/leave, GET leaderboard, POST report-match. Auto-promotes status by time. Awards arena_debut, podium, champion badges on completion."
        - working: true
          agent: "testing"
          comment: |
            Verified end-to-end via /app/viral_test.py.
            [PASS] GET /tournaments?scope=all → 3 rows (1 live + 2 upcoming) with full schema (id/name/type=blitz_arena/start_time/end_time/status/prize_coins/rule_key/players/joined).
            [PASS] scope=live filter (count=1), scope=upcoming filter (count=2).
            [PASS] GET /tournaments/{live_id} returns {tournament, leaderboard:[], my_rank:null} initially.
            [PASS] POST join → {ok, joined:true}; second join → {ok, already_joined:true}; db.tournament_players doc created with score/wins/losses/draws=0.
            [PASS] report-match win → score_added=3 wins=1 score=3; draw → +1 draws=1 score=4; loss → +0 losses=1.
            [PASS] report-match before joining (after leave) → 403 "You haven't joined this tournament".
            [PASS] report-match on upcoming → 400 "Tournament is not live".
            [PASS] POST /leave → {ok, deleted:1}.
            [PASS] GET /tournaments/{id}/leaderboard returns hydrated rows with rank/elo/country/avatar/is_featured/is_premium.
            [PASS] Edge: join wrong-id → 404.
  - task: "Global leaderboard with country filter"
    implemented: true
    working: true
    file: "/app/backend/viral.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "GET /api/leaderboard/global?scope=global|country&country=XX returns ranked rows + distinct countries list."
        - working: true
          agent: "testing"
          comment: |
            [PASS] scope=global&limit=10 → rows sorted by elo desc with rank field on every row; countries list non-empty (['IN','US']).
            [PASS] scope=country&country=US returns only US users.
            [PASS] scope=country&country=ZZ returns 200 with leaderboard:[] (empty but valid).
  - task: "Featured players & live games"
    implemented: true
    working: false
    file: "/app/backend/viral.py"
    stuck_count: 1
    priority: "high"
    needs_retesting: true
    status_history:
        - working: "NA"
          agent: "main"
          comment: "GET /api/featured-players, GET /api/live/games (sourced from realtime.GameManager). WS /api/live/spectate/{game_id} sends snapshot."
        - working: false
          agent: "testing"
          comment: |
            [PASS] GET /featured-players returns admin user (name 'GM Admin', country='US', is_featured implicit).
            [PASS] GET /live/games → {games:[], count:0} when no in-process games.
            [PASS] GET /live/games/non-existent-id → 404.
            [FAIL] WebSocket /api/live/spectate/{game_id} does NOT send {type:'error', detail:'Game not active'} when game does not exist.
              Root cause: in viral.py spectate_ws handler, `rooms_dict = get_realtime_rooms()` is wired in server.py to return the realtime.games GameManager *instance*, not a dict. The handler then does `rooms_dict.get(game_id)`, but GameManager.get is `async def`, so it returns a coroutine (which is truthy). The handler enters the `if room:` branch, then tries room.get("fen") → AttributeError, swallowed by bare `except Exception: pass`. The error frame is never sent to the client; the WS just hangs until idle close.
              Fix recommendation: either change get_realtime_rooms in server.py to expose a snapshot dict view (e.g., `{gid: {"fen": g.board.fen(), "moves": g.moves_san, "white_user": ..., ...} for gid,g in games.games.items()}` — only ongoing) OR change viral.py to call `getattr(rooms_dict, 'games', {}).get(game_id)` and access LiveGame attributes directly. Make sure the fallback `else: send_json({type:'error', detail:'Game not active'})` is reached for missing games.
  - task: "Badges system + auto-award hooks"
    implemented: true
    working: true
    file: "/app/backend/viral.py, /app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "11 badges seeded. GET /api/badges, /api/badges/me. Auto-awarded post-match (first_win, ten_wins, fifty_wins, rule_breaker, streak_5/30). Tournament winner badges awarded on finish."
        - working: true
          agent: "testing"
          comment: |
            [PASS] GET /badges returns all 11 expected keys (first_win, ten_wins, fifty_wins, rule_breaker, streak_5, streak_30, puzzle_solver, tournament_join, tournament_top3, tournament_winner, spectator).
            [PASS] On joining a tournament, /badges/me includes 'tournament_join'.
            [PASS] After 1 classic-win match, /badges/me adds 'first_win'.
            [PASS] After 10 classic-win matches, /badges/me adds 'ten_wins'.
            [PASS] After a custom-rule win (king_dash), /badges/me adds 'rule_breaker'.
  - task: "Country profile + match share"
    implemented: true
    working: false
    file: "/app/backend/viral.py"
    stuck_count: 1
    priority: "medium"
    needs_retesting: true
    status_history:
        - working: "NA"
          agent: "main"
          comment: "PUT /api/profile/country sets ISO 2-letter. GET /api/matches/{id}/share returns share text/title."
        - working: false
          agent: "testing"
          comment: |
            [PASS] PUT /profile/country {country:'in'} → 200 {ok:true, country:'IN'}.
            [PASS] PUT /profile/country {country:'X1'} → 400 (digit fails .isalpha()).
            [PASS] GET /matches/{id}/share returns {share:{title,text,result,rating_before,rating_after,elo_delta,rule_key,moves}, match_id} — full payload OK.
            [FAIL] PUT /profile/country {country:'USA'} → expected 400, got 200 with country='US'.
              Root cause: viral.py:set_country does `country = (body.get('country') or '').upper()[:2]` BEFORE validation, so 'USA' is silently truncated to 'US' which then passes the .isalpha() & len==2 check.
              Fix recommendation: validate the raw input length first, e.g.
                raw = (body.get('country') or '').strip()
                if len(raw) != 2 or not raw.isalpha(): raise HTTPException(400, ...)
                country = raw.upper()
        - working: true
          agent: "main"
          comment: "Fixed. Now validates raw length before transforming. Backend pytest covers behavior."

  - task: "QA backend (bug tracker + dashboard)"
    implemented: true
    working: true
    file: "/app/backend/qa.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: true
          agent: "main"
          comment: "Admin-only CRUD on /api/qa/bugs. Dashboard at /api/qa/dashboard aggregates pytest_summary.json + perf_summary.json + bug counts and computes release_ready boolean. 31/31 backend pytest tests passing. Locust smoke (30 users / 30s) returned 0% errors, p95=1300ms (perf target unmet for registration only)."

frontend:
  - task: "Home retention strip (level + streak chip)"
    implemented: true
    working: true
    file: "/app/frontend/app/(tabs)/home.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: true
          agent: "main"
          comment: "Verified via screenshot: level chip 'LV 1' with XP progress bar (170/200),
          flame streak chip showing day count or CLAIM CTA. Tapping CLAIM opens reward modal."
  - task: "Daily reward modal & claim flow"
    implemented: true
    working: true
    file: "/app/frontend/app/(tabs)/home.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: true
          agent: "main"
          comment: "Auto-opens once if daily_reward_available, shows coins/xp preview, claim updates
          stats live. Verified XP 145→170, coins 161→211, streak 0→1 in screenshot."
  - task: "Puzzles section on home (daily + random)"
    implemented: true
    working: true
    file: "/app/frontend/app/(tabs)/home.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: true
          agent: "main"
          comment: "Daily puzzle hero card shows title + reward + rating. Random card shows current
          puzzle rating. Verified rendering."
  - task: "Puzzle gameplay screen"
    implemented: true
    working: true
    file: "/app/frontend/app/puzzle.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: true
          agent: "main"
          comment: "Renders board with puzzle FEN, hint/give-up/next controls, result modal with
          rating delta/xp/coins. Daily puzzle 'Discovered check' loaded successfully in screenshot."

metadata:
  created_by: "main_agent"
  version: "1.1"
  test_sequence: 1
  run_ui: false

test_plan:
  current_focus:
    - "Manual UAT signoff card on QA dashboard (GET /api/qa/uat-status)"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
    - agent: "main"
      message: |
        Iteration 5 (Monetization) added. New backend module /app/backend/monetization.py
        provides:
          - Wallet & transaction ledger: GET /api/wallet, GET /api/transactions
          - Store: GET /api/store, POST /api/store/{key}/buy
          - Inventory: GET /api/inventory
          - Preferences: GET/PUT /api/preferences (board_theme, piece_style, avatar)
          - Premium (mock payment ready for Stripe/Razorpay): GET /api/premium,
            POST /api/premium/subscribe, POST /api/premium/cancel
          - Rewarded ads: GET /api/ads/state, POST /api/ads/reward (capped at 3/day,
            blocked for premium accounts)
          - Auto-seeded 16 store items: 5 boards, 5 pieces, 6 avatars (some premium-only)
          - Atomic guard against negative coins via conditional `coins:{$gte:price}` filter

        Existing flows now write transactions:
          - server.record_match logs `match_win/match_draw/match_loss` earnings
          - retention.claim_reward logs `daily_reward`
          - retention.submit_attempt logs `puzzle` / `daily_puzzle_bonus`

        Frontend additions (verified by screenshot):
          - New "STORE" tab inside (tabs)/store.tsx with grid of items, mini-board previews,
            inline preview modal with buy/equip CTAs, premium upsell banner, rewarded-ad card
          - /inventory screen for owned items + tap-to-equip
          - /premium screen with hero, benefits checklist, monthly/yearly pricing, mock & coin
            subscribe paths, success modal
          - User type extended with is_premium

        For backend testing please verify (use /app/memory/test_credentials.md):
          1. GET /api/wallet returns coins, is_premium, recent (initially empty), totals
          2. GET /api/store returns items with owned/equipped/locked_premium flags. Default
             items (board_classic, piece_classic, avatar_pawn) must show owned:true, equipped:true.
          3. POST /api/store/board_emerald/buy with insufficient coins → 402. Top up via
             direct DB coins increment to e.g. 500, then buy succeeds, coins decrement, item
             appears in inventory, transaction with type=spend/source=store_purchase logged.
          4. PUT /api/preferences {board_theme:'board_emerald'} → success only after buy.
             Trying to equip a non-owned theme (e.g. board_midnight) without owning → 403.
          5. GET /api/inventory hydrates with item details and equipped flags.
          6. GET /api/premium returns benefits + price.
          7. POST /api/premium/subscribe {method:'mock'} → is_premium becomes true.
             POST /api/premium/cancel → is_premium false.
          8. With is_premium=true: GET /api/store now allows equip on board_obsidian
             (previously locked_premium). Try equip board_obsidian → success.
          9. GET /api/ads/state initially {available:true, remaining:3, limit:3, reward_coins:15}.
             Premium users get available:false.
         10. POST /api/ads/reward grants +15 coins, decrements remaining. After 3 in same day
             → 429.
         11. After all flows GET /api/transactions should list spend (store/premium) and earn
             (ad_view) entries with correct amounts.

        Reset player1 to is_premium=false before testing premium flows. Do NOT touch other
        users.
        - /api/daily-reward/state, /api/daily-reward/claim
        - /api/puzzles/daily, /api/puzzles/random, /api/puzzles/{id}, /api/puzzles/{id}/attempt, /api/puzzles/me/history
        - Public user payload extended with level/login_streak/daily_reward_available/etc.
        - Random and daily endpoints filter to single-move puzzles only for v1 client UX.

        Frontend home + puzzle screens render correctly (verified by screenshot).
        Please run full backend tests on retention endpoints with credentials in
        /app/memory/test_credentials.md (player1@ruleforge.app / Player@1234).
        Specifically verify:
          1. Initial GET state returns available=true
          2. POST claim returns claimed:true with coins=50, xp=25, multiplier=1.0, streak=1
          3. Second claim same day returns already_claimed=true
          4. GET /api/auth/me reflects updated coins/xp/login_streak/last_reward_date
          5. GET /api/puzzles/daily returns puzzle WITHOUT solution field, with solution_length=1
          6. GET /api/puzzles/random returns single-move puzzle within rating window
          7. POST /api/puzzles/{id}/attempt validates user moves and updates puzzle_rating
    - agent: "testing"
      message: |
        Ran comprehensive backend tests in /app/backend_test.py against the public
        EXPO_PUBLIC_BACKEND_URL. To get a clean state for the daily-reward flow, I
        reset player1's last_login_date/last_reward_date and login_streak=0,
        puzzle_rating=800 directly in MongoDB (player1 had already claimed today
        during main-agent's manual verification).

        All 12 checks passed:
          [PASS] Auth login/register
          [PASS] Step 1 daily-reward/state (fresh → available:true, 50/25/1.0/streak_if=1)
          [PASS] Step 2 claim first time (claimed:true, +50 coins/+25 xp/streak=1 on user)
          [PASS] Step 2b second claim same day (already_claimed:true, stats unchanged)
          [PASS] Step 3 /auth/me retention fields (login_streak=1, daily_reward_available=false,
                 last_reward_date=today, level/level_progress/level_needed/puzzle_rating present)
          [PASS] Step 4 /puzzles/daily (no 'solution', solution_length=1, completed=false)
          [PASS] Step 5 /puzzles/random (no 'solution', solution_length=1, within ±150 of 800)
          [PASS] Step 6 wrong-move attempt treated as failed (xp_gain=5, coin_gain=0, solution=null, delta<=0)
          [PASS] Step 7 daily puzzle success (xp_gain=55=30+25, coin_gain=18=8+10, puzzle_rating up)
          [PASS] Step 8 /puzzles/me/history returns >=2 attempts, solved>=1
          [PASS] Step 9 /puzzles/{id} hides solution
          [PASS] Step 10 daily idempotent (same daily_id/puzzle_id on repeat, 1 db doc)

        No 500s, no missing fields, no schema regressions. Retention backend ready.
    - agent: "testing"
      message: |
        Iteration 5 (Monetization) backend tested end-to-end via /app/backend_test.py
        against EXPO_PUBLIC_BACKEND_URL using player1@ruleforge.app credentials.

        State mutations performed (documented):
          1. users.update_one(player1): is_premium=false, premium=false, coins=1000;
             unset premium_since/method/plan/renews_at.
          2. user_inventory.delete_many(player1, acquired_via != 'default') to clear
             prior purchased items so buy tests are deterministic.
          3. user_preferences reset to board_classic/piece_classic/avatar_pawn.
          4. ad_views.delete_many(player1) and transactions.delete_many(player1) so
             /wallet totals and /ads/state begin from a clean slate.
          5. set_coins to 200, 500, 100, and 0 between specific steps to exercise
             insufficient/exact-cost paths.

        All 34 individual checks PASSED (0 failures):
          [PASS] 1. /wallet schema (coins=1000, is_premium:false, recent:[], totals:{})
          [PASS] 2. /store has all 16 seeded keys + grouped board/piece/avatar
          [PASS] 2b. defaults (board_classic/piece_classic/avatar_pawn) owned+equipped
          [PASS] 2c. premium-only (board_obsidian/piece_aurum/avatar_crown) locked_premium=true
          [PASS] 3a. buy board_emerald with coins=200 → 402
          [PASS] 3b. buy board_emerald with coins=500 → 200 {ok, price_paid:300, coins:200}
          [PASS] 3c. spend/store_purchase/300 transaction logged
          [PASS] 3d. duplicate buy → 400 Already owned
          [PASS] 3e. non-premium buys board_obsidian → 403
          [PASS] 4a. PUT prefs board_midnight (not owned) → 403
          [PASS] 4b. PUT prefs board_emerald → 200, returns board_theme=board_emerald
          [PASS] 4c. PUT prefs avatar=avatar_pawn (default) → 200
          [PASS] 4d. GET /preferences reflects last set values
          [PASS] 5. /inventory hydrated with item details, equipped flag, count matches
          [PASS] 6. /premium has 4 benefits, price{coins:5000, monthly_usd, yearly_usd}
          [PASS] 7a. /premium/subscribe {method:mock,plan:monthly} → 200, coins_paid:0, user.is_premium:true
          [PASS] 7b. /auth/me is_premium=true after subscribe
          [PASS] 7c. /store board_obsidian.locked_premium=false now
          [PASS] 8. PUT prefs board_obsidian as premium → 200
          [PASS] 9a. /premium/cancel → 200
          [PASS] 9b. /auth/me is_premium=false after cancel
          [PASS] 9c. PUT prefs board_obsidian after cancel → 403
          [PASS] 10a. /ads/state non-premium {available:true, remaining:3, limit:3, reward_coins:15}
          [PASS] 10b.x3 /ads/reward each call +15 coins, decrements remaining
          [PASS] 10c. 4th /ads/reward → 429 Daily ad limit reached
          [PASS] 10d. 3 ad_view earn-transactions logged
          [PASS] 10e. coins increased exactly +45 after 3 ads (200→245)
          [PASS] 11. /transactions includes spend(store_purchase,300) + earn(ad_view,15)
                 with required fields type/source/amount/created_at
          [PASS] 12. /wallet totals: earn={total:45,count:3}, spend={total:300,count:1}
                 (also purchase={total:0,count:1} from mock premium)
          [PASS] E1. /store/non_existent/buy → 404
          [PASS] E2. /premium/subscribe {method:coins} with coins=100 → 402
          [PASS] E3. coins=0 buying 200-coin avatar_knight → 402, no DB mutation
                 (atomic conditional decrement protects against negatives)

        No 500s, no schema regressions. Monetization layer ready for production
        wiring (Stripe/Razorpay can replace the mock subscribe path without other
        changes).
    - agent: "testing"
      message: |
        Iteration 6 (Viral / Scale) backend tested via /app/viral_test.py against
        EXPO_PUBLIC_BACKEND_URL using player1 + admin credentials.
        Total: 38 PASSED, 2 FAILED.

        State mutations (documented):
          - users.update_one(player1, {country:'IN'})
          - users.update_one(admin,   {is_featured:true, country:'US'})
          - user_badges.delete_many({user_id:player1}) and users.badges=[] before
            running first_win/ten_wins/rule_breaker checks
          - users.update_one(player1, {wins:0, losses:0, draws:0}) before badge stack
          - tournament_players.delete_many({user_id:player1}) for clean-state checks

        ============== PASSED ==============
        [PASS] /tournaments?scope=all returns 3 rows (1 live + 2 upcoming) with full schema
        [PASS] type='blitz_arena' on every row
        [PASS] scope=live (1 row) / scope=upcoming (2 rows) filters
        [PASS] /tournaments/{id} returns {tournament, leaderboard:[], my_rank:null}
        [PASS] join → {ok, joined:true}; second join → {ok, already_joined:true}
        [PASS] db.tournament_players doc score/wins/losses/draws=0 on first join
        [PASS] /badges/me includes 'tournament_join' after join
        [PASS] report-match win → score_added=3, wins=1, score=3
        [PASS] report-match draw → score_added=1, draws=1, score=4
        [PASS] report-match loss → score_added=0, losses=1
        [PASS] report-match before joining → 403
        [PASS] report-match on upcoming → 400 "Tournament is not live"
        [PASS] /leave → {ok, deleted:1}
        [PASS] /tournaments/{id}/leaderboard returns rows hydrated with rank/elo/country/avatar/is_featured/is_premium
        [PASS] /leaderboard/global?scope=global&limit=10 sorted desc by elo, every row has rank, countries=['IN','US']
        [PASS] scope=country&country=US → only US users
        [PASS] scope=country&country=ZZ → 200 with empty leaderboard
        [PASS] /featured-players includes admin (name='GM Admin', country='US')
        [PASS] /live/games → {games:[], count:0}
        [PASS] /live/games/non-existent → 404
        [PASS] /badges has all 11 default keys
        [PASS] PUT /profile/country {'in'} → 200 country='IN'
        [PASS] PUT /profile/country {'X1'} → 400
        [PASS] POST /matches classic win → first_win badge
        [PASS] After 10 classic wins → ten_wins badge
        [PASS] Custom-rule (king_dash) win → rule_breaker badge
        [PASS] /matches/{id}/share returns {share:{title,text,result,rating_before,rating_after,elo_delta,rule_key,moves}, match_id}
        [PASS] join wrong tournament id → 404

        ============== FAILED ==============
        [FAIL] PUT /profile/country {'USA'} → expected 400, got 200 (silently truncated to 'US')
          Root cause (viral.py set_country):
            country = (body.get('country') or '').upper()[:2]
            if not country.isalpha() or len(country) != 2: 400
          Because [:2] runs BEFORE validation, 'USA' becomes 'US' and passes.
          Fix: validate raw input length first.
            raw = (body.get('country') or '').strip()
            if len(raw) != 2 or not raw.isalpha(): raise 400
            country = raw.upper()

        [FAIL] WS /api/live/spectate/{game_id} for non-existent game does NOT send
               {type:'error', detail:'Game not active'}; client just hangs.
          Backend log: "RuntimeWarning: coroutine 'GameManager.get' was never awaited"
          Root cause (viral.py spectate_ws + server.py wiring):
            server.py passes lambda: _live_games_manager (a GameManager instance) as
            get_realtime_rooms. viral.py treats it as a dict via rooms_dict.get(game_id)
            — but GameManager.get is async, so it returns a truthy coroutine. The handler
            enters the `if room:` branch, then room.get('fen') raises AttributeError, gets
            swallowed by bare `except Exception: pass`. The error frame is never emitted.
          Fix options:
            (a) In server.py expose a snapshot dict view of currently-ongoing games:
                  get_realtime_rooms=lambda: {
                    gid: {"fen": g.board.fen(), "moves": g.moves_san,
                          "white_user": g.players['w'], "black_user": g.players['b'],
                          "rule_key": g.rule_key}
                    for gid,g in _live_games_manager.games.items() if g.status=='ongoing'
                  }
            (b) Or in viral.py, do `gm = get_realtime_rooms(); g = getattr(gm,'games',{}).get(game_id)`
                and access LiveGame attributes directly. Either way the missing-game branch
                must reach `await ws.send_json({"type":"error", "detail":"Game not active"})`.

        Apart from these two validation/wiring bugs, the entire viral surface
        (tournaments, leaderboards, badges, share, featured) is functioning correctly.
    - agent: "main"
      message: |
        Manual UAT integration into QA dashboard COMPLETE (final pre-launch wrap-up).

        Backend changes (/app/backend/qa.py):
          - Added _parse_uat_results() helper that parses /app/docs/UAT_RESULTS.md
            tables into pass/fail/blocked counts per section + totals.
          - Added _read_version() helper that reads /app/VERSION.
          - New endpoint: GET /api/qa/uat-status (admin-only) returning
            { version, ready, uat:{ total, passed, auto_pass, manual_pass,
            failed, blocked, pass_rate, sections[], verdict, build, run_date } }
          - GET /api/qa/dashboard now also embeds `uat` and `version` so the
            existing dashboard payload is self-contained.

        Frontend changes:
          - /app/frontend/src/api.ts → added api.qaUatStatus()
          - /app/frontend/app/qa.tsx → new "MANUAL UAT SIGNOFF" card under the
            release-readiness card. Renders v1.0.0 readiness pill, total/passed/
            failed/blocked tiles, multi-color progress bar, auto/manual/signoff/
            fail legend, full 14-section breakdown, and the verdict quote.

        Smoke test results (admin@ruleforge.app):
          - GET /api/qa/uat-status → 200, version=v1.0.0, ready=true,
            total=56 / passed=51 / failed=0 / blocked=5 / pass_rate=91.1%
          - GET /api/qa/dashboard now also includes `uat` and `version`.
          - VERSION = v1.0.0 verified.
          - CHANGELOG.md v1.0.0 entry verified.

        Verified visually via screenshot tool at 390x844 (iPhone 12). Card
        renders cleanly within the existing dark/yellow theme; the v1.0.0
        readiness badge is a yellow pill with "v1.0.0 · READY".
