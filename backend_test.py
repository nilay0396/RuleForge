"""
Backend tests for RuleForge Chess Retention endpoints.
Tests: daily reward, puzzles (daily/random/attempt/history/by-id).
"""
from __future__ import annotations

import asyncio
import os
import sys
from datetime import date
from typing import Any, Dict, List, Optional

import requests
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

# -----------------------------------------------------------------------------
# Config
# -----------------------------------------------------------------------------
load_dotenv("/app/frontend/.env")
load_dotenv("/app/backend/.env")

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/") + "/api"
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

EMAIL = "player1@ruleforge.app"
PASSWORD = "Player@1234"
NAME = "Test Player"

# Track pass/fail per test section
results: List[Dict[str, Any]] = []


def _rec(name: str, ok: bool, detail: str = ""):
    results.append({"name": name, "ok": ok, "detail": detail})
    icon = "PASS" if ok else "FAIL"
    print(f"[{icon}] {name}" + (f" — {detail}" if detail else ""))


# -----------------------------------------------------------------------------
# Reset test user so daily reward is available (clean state)
# -----------------------------------------------------------------------------
async def reset_user_state():
    c = AsyncIOMotorClient(MONGO_URL)
    db = c[DB_NAME]
    await db.users.update_one(
        {"email": EMAIL},
        {
            "$unset": {"last_login_date": "", "last_reward_date": ""},
            "$set": {"login_streak": 0, "puzzle_rating": 800},
        },
    )
    # Clear today's puzzle attempts so daily-complete state is reset.
    today = date.today().isoformat()
    user = await db.users.find_one({"email": EMAIL}, {"_id": 0})
    if user:
        await db.puzzle_attempts.delete_many({"user_id": user["id"], "date": today})
    # Also ensure daily_puzzles today exists only if already created (don't delete,
    # we want to verify idempotency in step 10). Actually remove to start clean.
    await db.daily_puzzles.delete_many({"date": today})
    c.close()


async def get_solution_for_puzzle(pid: str) -> Optional[List[str]]:
    c = AsyncIOMotorClient(MONGO_URL)
    db = c[DB_NAME]
    p = await db.puzzles.find_one({"id": pid}, {"_id": 0})
    c.close()
    return p.get("solution") if p else None


# -----------------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------------
def register_or_login() -> str:
    """Return a JWT token for player1."""
    # Try login first
    r = requests.post(f"{BASE}/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=20)
    if r.status_code == 200:
        return r.json()["token"]
    # Else register
    r = requests.post(
        f"{BASE}/auth/register",
        json={"email": EMAIL, "password": PASSWORD, "name": NAME},
        timeout=20,
    )
    if r.status_code == 200:
        return r.json()["token"]
    if r.status_code == 400 and "already" in r.text.lower():
        r2 = requests.post(f"{BASE}/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=20)
        r2.raise_for_status()
        return r2.json()["token"]
    r.raise_for_status()
    return ""


def auth_headers(token: str) -> Dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


# -----------------------------------------------------------------------------
# Tests
# -----------------------------------------------------------------------------
def run():
    print(f"Base URL: {BASE}")
    asyncio.run(reset_user_state())
    print("Reset user state (cleared last_reward_date, last_login_date, login_streak=0, puzzle_rating=800)")

    # Login / register
    try:
        token = register_or_login()
        print(f"Got token: {token[:20]}...")
    except Exception as e:
        _rec("Auth login/register", False, f"Exception: {e}")
        return
    _rec("Auth login/register", True)

    H = auth_headers(token)

    # --- Step 1: GET /api/daily-reward/state ---
    r = requests.get(f"{BASE}/daily-reward/state", headers=H, timeout=20)
    ok = True
    detail = ""
    if r.status_code != 200:
        ok = False; detail = f"HTTP {r.status_code}: {r.text[:200]}"
    else:
        body = r.json()
        reward = body.get("reward", {})
        expected = {"available": True, "next_streak_if_claimed": 1,
                    "multiplier": 1.0, "coins": 50, "xp": 25}
        for k, v in expected.items():
            if reward.get(k) != v:
                ok = False
                detail += f" {k}={reward.get(k)} (want {v});"
    _rec("Step 1: GET /api/daily-reward/state (fresh)", ok, detail)

    # Capture initial user stats via /auth/me
    r = requests.get(f"{BASE}/auth/me", headers=H, timeout=20)
    me0 = r.json().get("user", {}) if r.status_code == 200 else {}
    xp0 = int(me0.get("xp", 0))
    coins0 = int(me0.get("coins", 0))

    # --- Step 2: POST /api/daily-reward/claim (first time) ---
    r = requests.post(f"{BASE}/daily-reward/claim", headers=H, timeout=20)
    ok = True; detail = ""
    claim_body: Dict[str, Any] = {}
    if r.status_code != 200:
        ok = False; detail = f"HTTP {r.status_code}: {r.text[:200]}"
    else:
        claim_body = r.json()
        checks = [
            ("claimed", True),
            ("coins", 50),
            ("xp", 25),
            ("multiplier", 1.0),
            ("streak", 1),
        ]
        for k, v in checks:
            if claim_body.get(k) != v:
                ok = False
                detail += f" {k}={claim_body.get(k)} (want {v});"
        u = claim_body.get("user", {})
        if u.get("coins") != coins0 + 50:
            ok = False; detail += f" user.coins={u.get('coins')} (want {coins0+50});"
        if u.get("xp") != xp0 + 25:
            ok = False; detail += f" user.xp={u.get('xp')} (want {xp0+25});"
        if u.get("login_streak") != 1:
            ok = False; detail += f" user.login_streak={u.get('login_streak')} (want 1);"
    _rec("Step 2: POST /api/daily-reward/claim first time", ok, detail)

    # --- Step 2b: Claim again same day ---
    r = requests.post(f"{BASE}/daily-reward/claim", headers=H, timeout=20)
    ok = True; detail = ""
    if r.status_code != 200:
        ok = False; detail = f"HTTP {r.status_code}: {r.text[:200]}"
    else:
        b = r.json()
        if not b.get("already_claimed"):
            ok = False; detail += f" already_claimed={b.get('already_claimed')};"
        if "reward" not in b:
            ok = False; detail += " missing reward;"
    # Also verify stats unchanged
    r2 = requests.get(f"{BASE}/auth/me", headers=H, timeout=20)
    if r2.status_code == 200:
        u = r2.json().get("user", {})
        if u.get("xp") != xp0 + 25 or u.get("coins") != coins0 + 50:
            ok = False
            detail += f" stats changed on 2nd claim: xp={u.get('xp')} coins={u.get('coins')};"
    _rec("Step 2b: second claim same day returns already_claimed", ok, detail)

    # --- Step 3: GET /api/auth/me after claim ---
    r = requests.get(f"{BASE}/auth/me", headers=H, timeout=20)
    ok = True; detail = ""
    if r.status_code != 200:
        ok = False; detail = f"HTTP {r.status_code}"
    else:
        u = r.json().get("user", {})
        today = date.today().isoformat()
        if u.get("login_streak") != 1: ok = False; detail += f" login_streak={u.get('login_streak')};"
        if u.get("daily_reward_available") is not False: ok = False; detail += f" daily_reward_available={u.get('daily_reward_available')};"
        if u.get("last_reward_date") != today: ok = False; detail += f" last_reward_date={u.get('last_reward_date')} (want {today});"
        if not isinstance(u.get("level"), int) or u.get("level") < 1: ok = False; detail += f" level={u.get('level')};"
        if not isinstance(u.get("level_progress"), int): ok = False; detail += f" level_progress={u.get('level_progress')};"
        if not isinstance(u.get("level_needed"), int): ok = False; detail += f" level_needed={u.get('level_needed')};"
        if not isinstance(u.get("puzzle_rating"), int): ok = False; detail += f" puzzle_rating={u.get('puzzle_rating')};"
    _rec("Step 3: GET /api/auth/me reflects retention fields", ok, detail)

    # --- Step 4: GET /api/puzzles/daily ---
    r = requests.get(f"{BASE}/puzzles/daily", headers=H, timeout=20)
    ok = True; detail = ""
    daily_puzzle_id = None
    if r.status_code != 200:
        ok = False; detail = f"HTTP {r.status_code}: {r.text[:200]}"
    else:
        b = r.json()
        for k in ("daily", "puzzle", "completed"):
            if k not in b: ok = False; detail += f" missing {k};"
        puzzle = b.get("puzzle") or {}
        if "solution" in puzzle: ok = False; detail += " puzzle leaks 'solution';"
        for k in ("id", "title", "theme", "rating", "fen", "hint", "solution_length"):
            if k not in puzzle: ok = False; detail += f" puzzle missing {k};"
        if puzzle.get("solution_length") != 1:
            ok = False; detail += f" solution_length={puzzle.get('solution_length')} (want 1);"
        if b.get("completed") is not False:
            ok = False; detail += f" completed={b.get('completed')} (want False);"
        daily_puzzle_id = puzzle.get("id")
    _rec("Step 4: GET /api/puzzles/daily", ok, detail)

    # --- Step 5: GET /api/puzzles/random ---
    r = requests.get(f"{BASE}/puzzles/random", headers=H, timeout=20)
    ok = True; detail = ""
    random_puzzle: Dict[str, Any] = {}
    if r.status_code != 200:
        ok = False; detail = f"HTTP {r.status_code}: {r.text[:200]}"
    else:
        random_puzzle = r.json().get("puzzle") or {}
        if "solution" in random_puzzle: ok = False; detail += " leaks 'solution';"
        if random_puzzle.get("solution_length") != 1:
            ok = False; detail += f" solution_length={random_puzzle.get('solution_length')} (want 1);"
        # rating within ±150 of 800 (user puzzle_rating is 800 default)
        pr = 800
        rr = random_puzzle.get("rating", 0)
        if not (pr - 150 <= rr <= pr + 150):
            # Main agent allows widening, so soft check
            detail += f" (Minor: rating={rr} outside ±150 of {pr}, tolerance expanded)"
    _rec("Step 5: GET /api/puzzles/random", ok, detail)

    # --- Step 6: POST /api/puzzles/{id}/attempt wrong move on a random puzzle ---
    # Use a different random puzzle id (not daily) to keep daily uncompleted.
    rand_id = random_puzzle.get("id")
    # If random happened to be same as daily, fetch another.
    tries = 0
    while rand_id == daily_puzzle_id and tries < 5:
        r = requests.get(f"{BASE}/puzzles/random", headers=H, timeout=20)
        if r.status_code == 200:
            random_puzzle = r.json().get("puzzle") or {}
            rand_id = random_puzzle.get("id")
        tries += 1

    # Pre-attempt user stats
    r = requests.get(f"{BASE}/auth/me", headers=H, timeout=20)
    pre_user = r.json().get("user", {}) if r.status_code == 200 else {}
    pre_xp = int(pre_user.get("xp", 0))
    pre_pr = int(pre_user.get("puzzle_rating", 800))

    payload = {"moves": ["a2a3"], "success": True, "time_taken_ms": 1234, "used_hint": False}
    r = requests.post(f"{BASE}/puzzles/{rand_id}/attempt", headers=H, json=payload, timeout=20)
    ok = True; detail = ""
    if r.status_code != 200:
        ok = False; detail = f"HTTP {r.status_code}: {r.text[:200]}"
    else:
        b = r.json()
        for k in ("attempt", "rating_before", "rating_after", "delta", "xp_gain", "coin_gain", "user", "solution"):
            if k not in b: ok = False; detail += f" missing {k};"
        if b.get("solution") is not None:
            ok = False; detail += f" solution leaked on fail: {b.get('solution')};"
        if b.get("xp_gain") != 5: ok = False; detail += f" xp_gain={b.get('xp_gain')} (want 5);"
        if b.get("coin_gain") != 0: ok = False; detail += f" coin_gain={b.get('coin_gain')} (want 0);"
        # delta should be <= 0 (or <=3 cushion) — enforce <= 0 per spec
        if b.get("delta", 0) > 0:
            ok = False; detail += f" delta={b.get('delta')} should be <=0;"
        # attempt.status should be 'failed'
        if b.get("attempt", {}).get("status") != "failed":
            ok = False; detail += f" attempt.status={b.get('attempt',{}).get('status')};"
        # user.xp should be pre_xp + 5
        if b.get("user", {}).get("xp") != pre_xp + 5:
            ok = False; detail += f" user.xp={b.get('user',{}).get('xp')} (want {pre_xp+5});"
    _rec("Step 6: POST attempt wrong-move treated as failed", ok, detail)

    # --- Step 7: Successful attempt on daily puzzle ---
    # Fetch daily puzzle details, get solution from Mongo, submit.
    r = requests.get(f"{BASE}/puzzles/daily", headers=H, timeout=20)
    if r.status_code != 200:
        _rec("Step 7: POST daily puzzle success", False, f"GET daily HTTP {r.status_code}")
    else:
        daily_puzzle = r.json().get("puzzle") or {}
        pid = daily_puzzle.get("id")
        daily_puzzle_id = pid
        solution = asyncio.run(get_solution_for_puzzle(pid))
        if not solution:
            _rec("Step 7: POST daily puzzle success", False, "no solution in db")
        else:
            # Capture pre
            r2 = requests.get(f"{BASE}/auth/me", headers=H, timeout=20)
            pre_user = r2.json().get("user", {})
            pre_xp = int(pre_user.get("xp", 0))
            pre_coins = int(pre_user.get("coins", 0))
            pre_pr = int(pre_user.get("puzzle_rating", 800))

            payload = {"moves": solution, "success": True, "time_taken_ms": 2500, "used_hint": False}
            r3 = requests.post(f"{BASE}/puzzles/{pid}/attempt", headers=H, json=payload, timeout=20)
            ok = True; detail = ""
            if r3.status_code != 200:
                ok = False; detail = f"HTTP {r3.status_code}: {r3.text[:200]}"
            else:
                b = r3.json()
                if b.get("solution") != solution:
                    ok = False; detail += f" solution={b.get('solution')} (want {solution});"
                if b.get("xp_gain") != 55:
                    ok = False; detail += f" xp_gain={b.get('xp_gain')} (want 55 = 30+25);"
                if b.get("coin_gain") != 18:
                    ok = False; detail += f" coin_gain={b.get('coin_gain')} (want 18 = 8+10);"
                if b.get("attempt", {}).get("status") != "solved":
                    ok = False; detail += f" attempt.status={b.get('attempt',{}).get('status')};"
                if b.get("user", {}).get("puzzle_rating", 0) <= pre_pr:
                    ok = False; detail += f" puzzle_rating did not increase ({pre_pr} → {b.get('user',{}).get('puzzle_rating')});"
                if b.get("user", {}).get("xp") != pre_xp + 55:
                    ok = False; detail += f" user.xp={b.get('user',{}).get('xp')} (want {pre_xp+55});"
                if b.get("user", {}).get("coins") != pre_coins + 18:
                    ok = False; detail += f" user.coins={b.get('user',{}).get('coins')} (want {pre_coins+18});"
            _rec("Step 7: POST daily puzzle success (bonus applied)", ok, detail)

    # --- Step 8: GET /api/puzzles/me/history ---
    r = requests.get(f"{BASE}/puzzles/me/history", headers=H, timeout=20)
    ok = True; detail = ""
    if r.status_code != 200:
        ok = False; detail = f"HTTP {r.status_code}"
    else:
        b = r.json()
        for k in ("history", "solved", "total"):
            if k not in b: ok = False; detail += f" missing {k};"
        if b.get("total", 0) < 2:
            ok = False; detail += f" total={b.get('total')} (want >=2 attempts from steps 6+7);"
        if b.get("solved", 0) < 1:
            ok = False; detail += f" solved={b.get('solved')} (want >=1);"
    _rec("Step 8: GET /api/puzzles/me/history", ok, detail)

    # --- Step 9: GET /api/puzzles/{id} ---
    # Use the random puzzle id
    r = requests.get(f"{BASE}/puzzles/{rand_id}", headers=H, timeout=20)
    ok = True; detail = ""
    if r.status_code != 200:
        ok = False; detail = f"HTTP {r.status_code}"
    else:
        p = r.json().get("puzzle", {})
        if "solution" in p: ok = False; detail += " leaks 'solution';"
        if "solution_length" not in p: ok = False; detail += " missing solution_length;"
        if "id" not in p: ok = False; detail += " missing id;"
    _rec("Step 9: GET /api/puzzles/{id} hides solution", ok, detail)

    # --- Step 10: Daily puzzle idempotency ---
    r1 = requests.get(f"{BASE}/puzzles/daily", headers=H, timeout=20)
    r2 = requests.get(f"{BASE}/puzzles/daily", headers=H, timeout=20)
    ok = True; detail = ""
    if r1.status_code != 200 or r2.status_code != 200:
        ok = False; detail = "HTTP error"
    else:
        d1 = r1.json().get("daily", {}).get("id")
        d2 = r2.json().get("daily", {}).get("id")
        p1 = r1.json().get("puzzle", {}).get("id")
        p2 = r2.json().get("puzzle", {}).get("id")
        if d1 != d2 or p1 != p2:
            ok = False; detail += f" mismatch daily_id {d1}≠{d2} or puzzle_id {p1}≠{p2};"
    # Also verify db has exactly 1 daily_puzzles doc for today
    async def check_daily_count():
        c = AsyncIOMotorClient(MONGO_URL)
        db = c[DB_NAME]
        cnt = await db.daily_puzzles.count_documents({"date": date.today().isoformat()})
        c.close()
        return cnt
    cnt = asyncio.run(check_daily_count())
    if cnt != 1:
        ok = False; detail += f" daily_puzzles count for today={cnt} (want 1);"
    _rec("Step 10: Daily puzzle is deterministic / idempotent", ok, detail)

    # --- Summary ---
    print("\n================ SUMMARY ================")
    passed = sum(1 for x in results if x["ok"])
    print(f"Passed {passed}/{len(results)}")
    for x in results:
        print(f"  [{'PASS' if x['ok'] else 'FAIL'}] {x['name']}" + (f" — {x['detail']}" if x["detail"] else ""))
    # Exit code
    if passed != len(results):
        sys.exit(1)


if __name__ == "__main__":
    run()
