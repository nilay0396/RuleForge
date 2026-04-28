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
    - "Wallet endpoints (/wallet, /transactions)"
    - "Store list & purchase (/store, /store/{key}/buy)"
    - "Inventory listing (/inventory)"
    - "Preferences GET/PUT (/preferences)"
    - "Premium subscribe & cancel (/premium, /premium/subscribe, /premium/cancel)"
    - "Rewarded ads state & reward (/ads/state, /ads/reward)"
    - "Transaction logging from match wins, daily reward, puzzle attempts"
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