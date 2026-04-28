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
  current_focus: []
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
    - agent: "main"
      message: |
        Iteration 4 (Retention) backend now complete:
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