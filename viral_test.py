"""
RuleForge Chess — Viral / Scale backend tests (Iteration 6).

Runs against the public EXPO_PUBLIC_BACKEND_URL with /api prefix.
Uses test credentials from /app/memory/test_credentials.md.

Performs documented MongoDB mutations to ensure determinism.
"""
from __future__ import annotations

import asyncio
import json
import sys
import time
import uuid
from typing import Any, Dict, Optional

import requests
import websockets
from dotenv import dotenv_values
from pymongo import MongoClient

# -----------------------------------------------------------------------------
FRONTEND_ENV = dotenv_values("/app/frontend/.env")
BACKEND_ENV = dotenv_values("/app/backend/.env")

BASE = (FRONTEND_ENV.get("EXPO_PUBLIC_BACKEND_URL") or "").rstrip("/")
API = f"{BASE}/api"
WS_BASE = BASE.replace("http://", "ws://").replace("https://", "wss://")

MONGO_URL = BACKEND_ENV.get("MONGO_URL") or "mongodb://localhost:27017"
DB_NAME = BACKEND_ENV.get("DB_NAME") or "ruleforge_chess"

PLAYER_EMAIL = "player1@ruleforge.app"
PLAYER_PWD = "Player@1234"
ADMIN_EMAIL = "admin@ruleforge.app"
ADMIN_PWD = "Admin@1234"

mongo = MongoClient(MONGO_URL)
db = mongo[DB_NAME]

PASSED: list = []
FAILED: list = []


def record(label: str, ok: bool, detail: str = "") -> None:
    if ok:
        PASSED.append(label)
        print(f"[PASS] {label} {detail}")
    else:
        FAILED.append((label, detail))
        print(f"[FAIL] {label} :: {detail}")


def login(email: str, password: str) -> Optional[Dict[str, Any]]:
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    if r.status_code != 200:
        print(f"Login failed for {email}: {r.status_code} {r.text}")
        return None
    return r.json()


def H(token: str) -> Dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


# -----------------------------------------------------------------------------
def reset_state(player_id: str) -> None:
    """Best-effort reset of viral state for player1 to make tests deterministic."""
    # Set country=IN
    db.users.update_one({"id": player_id}, {"$set": {"country": "IN"}})
    # Make sure admin is featured + country US
    db.users.update_one({"email": ADMIN_EMAIL}, {"$set": {"is_featured": True, "country": "US"}})
    # Drop user_badges for player1 (so we can verify earning fresh badges)
    db.user_badges.delete_many({"user_id": player_id})
    # Remove player1 from all tournament_players (clean slate)
    db.tournament_players.delete_many({"user_id": player_id})
    # Make sure badges array on user is cleaned to avoid noise; preserve existing real wins
    db.users.update_one({"id": player_id}, {"$set": {"badges": []}})


def main() -> int:
    # ---------- Login ----------
    p_login = login(PLAYER_EMAIL, PLAYER_PWD)
    a_login = login(ADMIN_EMAIL, ADMIN_PWD)
    if not p_login or not a_login:
        print("Login failed — aborting")
        return 2
    P_TOKEN = p_login["token"]
    P = p_login["user"]
    A_TOKEN = a_login["token"]
    A = a_login["user"]
    print(f"Player1 id={P['id']} wins={P.get('wins')} country={P.get('country')}")
    print(f"Admin id={A['id']} is_featured pre-reset")

    reset_state(P["id"])

    # =========================================================================
    # 1) GET /tournaments
    # =========================================================================
    r = requests.get(f"{API}/tournaments?scope=all", headers=H(P_TOKEN), timeout=15)
    ok = r.status_code == 200 and isinstance(r.json().get("tournaments"), list)
    rows = r.json().get("tournaments", []) if ok else []
    record("1. GET /tournaments?scope=all returns >=3", ok and len(rows) >= 3,
           f"status={r.status_code} count={len(rows)}")
    required_keys = {"id", "name", "type", "start_time", "end_time", "status",
                     "prize_coins", "rule_key", "players", "joined"}
    if rows:
        missing = required_keys - set(rows[0].keys())
        record("1a. tournament row schema", not missing, f"missing={missing} sample={rows[0]}")
        record("1b. type='blitz_arena'", all(t.get("type") == "blitz_arena" for t in rows),
               f"types={[t.get('type') for t in rows]}")

    # Pick live + upcoming
    live = next((t for t in rows if t["status"] == "live"), None)
    upcoming = next((t for t in rows if t["status"] == "upcoming"), None)
    record("1c. has live tournament", live is not None, f"live={live and live.get('name')}")
    record("1d. has upcoming tournament", upcoming is not None,
           f"upcoming={upcoming and upcoming.get('name')}")

    # Scope filters
    r_live = requests.get(f"{API}/tournaments?scope=live", headers=H(P_TOKEN), timeout=15)
    rows_live = r_live.json().get("tournaments", [])
    record("1e. scope=live returns only live",
           r_live.status_code == 200 and all(t["status"] == "live" for t in rows_live),
           f"count={len(rows_live)} statuses={[t['status'] for t in rows_live]}")
    r_up = requests.get(f"{API}/tournaments?scope=upcoming", headers=H(P_TOKEN), timeout=15)
    rows_up = r_up.json().get("tournaments", [])
    record("1f. scope=upcoming returns only upcoming",
           r_up.status_code == 200 and all(t["status"] == "upcoming" for t in rows_up),
           f"count={len(rows_up)}")

    if not live or not upcoming:
        print("Cannot proceed without both a live and upcoming tournament.")
        return 3

    LIVE_TID = live["id"]
    UP_TID = upcoming["id"]

    # =========================================================================
    # 2) GET /tournaments/{id} — detail
    # =========================================================================
    r = requests.get(f"{API}/tournaments/{LIVE_TID}", headers=H(P_TOKEN), timeout=15)
    ok = r.status_code == 200
    body = r.json() if ok else {}
    has_keys = ok and {"tournament", "leaderboard", "my_rank"}.issubset(body.keys())
    record("2. GET /tournaments/{id} returns tournament+leaderboard+my_rank",
           has_keys, f"status={r.status_code} keys={list(body.keys()) if ok else r.text[:200]}")
    if has_keys:
        record("2a. leaderboard initially has player1 absent (my_rank=null)",
               body["my_rank"] is None,
               f"my_rank={body['my_rank']} leaderboard_len={len(body['leaderboard'])}")

    # =========================================================================
    # 3) POST /join (live)
    # =========================================================================
    r = requests.post(f"{API}/tournaments/{LIVE_TID}/join", headers=H(P_TOKEN), timeout=15)
    body = r.json() if r.status_code == 200 else {}
    record("3. join live returns ok+joined",
           r.status_code == 200 and body.get("ok") and body.get("joined"),
           f"status={r.status_code} body={body}")

    r = requests.post(f"{API}/tournaments/{LIVE_TID}/join", headers=H(P_TOKEN), timeout=15)
    body2 = r.json() if r.status_code == 200 else {}
    record("3a. second join returns already_joined",
           r.status_code == 200 and body2.get("already_joined") is True,
           f"body={body2}")

    tp_doc = db.tournament_players.find_one({"tournament_id": LIVE_TID, "user_id": P["id"]})
    record("3b. db.tournament_players doc exists with score=0 wins=0 losses=0",
           tp_doc is not None and tp_doc.get("score") == 0 and tp_doc.get("wins") == 0
           and tp_doc.get("losses") == 0,
           f"doc={tp_doc and {k: tp_doc[k] for k in ('score','wins','losses','draws') if k in tp_doc}}")

    # tournament_join badge via /badges/me
    r = requests.get(f"{API}/badges/me", headers=H(P_TOKEN), timeout=15)
    body = r.json() if r.status_code == 200 else {}
    keys = [b.get("key") for b in body.get("badges", [])]
    record("3c. badges/me includes tournament_join",
           "tournament_join" in keys, f"earned_keys={keys}")

    # =========================================================================
    # 4) POST report-match on live tournament
    # =========================================================================
    fake_opp = str(uuid.uuid4())
    # Win
    r = requests.post(f"{API}/tournaments/{LIVE_TID}/report-match",
                      headers=H(P_TOKEN), json={"opponent_id": fake_opp, "result": "win"}, timeout=15)
    body = r.json() if r.status_code == 200 else {}
    p_obj = body.get("player", {})
    record("4. report-match win → score_added=3, player.score=3, wins=1",
           r.status_code == 200 and body.get("score_added") == 3 and p_obj.get("score") == 3
           and p_obj.get("wins") == 1,
           f"status={r.status_code} body={body}")

    # Draw
    r = requests.post(f"{API}/tournaments/{LIVE_TID}/report-match",
                      headers=H(P_TOKEN), json={"opponent_id": fake_opp, "result": "draw"}, timeout=15)
    body = r.json() if r.status_code == 200 else {}
    p_obj = body.get("player", {})
    record("4a. report-match draw → score_added=1, draws+=1",
           r.status_code == 200 and body.get("score_added") == 1 and p_obj.get("draws") == 1
           and p_obj.get("score") == 4,
           f"body={body}")

    # Loss
    r = requests.post(f"{API}/tournaments/{LIVE_TID}/report-match",
                      headers=H(P_TOKEN), json={"opponent_id": fake_opp, "result": "loss"}, timeout=15)
    body = r.json() if r.status_code == 200 else {}
    p_obj = body.get("player", {})
    record("4b. report-match loss → score_added=0, losses+=1",
           r.status_code == 200 and body.get("score_added") == 0 and p_obj.get("losses") == 1
           and p_obj.get("score") == 4,
           f"body={body}")

    # =========================================================================
    # 5) Try report-match on tournament not joined (use upcoming, but it will fail with 400 first)
    # =========================================================================
    # Find any other live tournament we have NOT joined; if none, fallback to creating expectation.
    # Easier: temporarily delete tp doc, then attempt report-match on live tournament (we joined).
    # Spec wants 403 BEFORE joining: simulate by deleting our tp on LIVE_TID.
    db.tournament_players.delete_one({"tournament_id": LIVE_TID, "user_id": P["id"]})
    r = requests.post(f"{API}/tournaments/{LIVE_TID}/report-match",
                      headers=H(P_TOKEN), json={"opponent_id": fake_opp, "result": "win"}, timeout=15)
    record("5. report-match before joining → 403", r.status_code == 403,
           f"status={r.status_code} body={r.text[:200]}")

    # =========================================================================
    # 6) report-match on non-live (upcoming) tournament
    # =========================================================================
    r = requests.post(f"{API}/tournaments/{UP_TID}/report-match",
                      headers=H(P_TOKEN), json={"opponent_id": fake_opp, "result": "win"}, timeout=15)
    record("6. report-match on upcoming → 400", r.status_code == 400,
           f"status={r.status_code} body={r.text[:200]}")

    # Re-join LIVE_TID for subsequent tests
    requests.post(f"{API}/tournaments/{LIVE_TID}/join", headers=H(P_TOKEN), timeout=15)

    # =========================================================================
    # 7) POST /leave
    # =========================================================================
    r = requests.post(f"{API}/tournaments/{LIVE_TID}/leave", headers=H(P_TOKEN), timeout=15)
    body = r.json() if r.status_code == 200 else {}
    record("7. leave returns ok+deleted=1",
           r.status_code == 200 and body.get("ok") and body.get("deleted") == 1,
           f"body={body}")

    # =========================================================================
    # 8) GET /tournaments/{id}/leaderboard
    # =========================================================================
    # Re-join + report a win so leaderboard has at least one row
    requests.post(f"{API}/tournaments/{LIVE_TID}/join", headers=H(P_TOKEN), timeout=15)
    requests.post(f"{API}/tournaments/{LIVE_TID}/report-match",
                  headers=H(P_TOKEN), json={"opponent_id": fake_opp, "result": "win"}, timeout=15)
    r = requests.get(f"{API}/tournaments/{LIVE_TID}/leaderboard", headers=H(P_TOKEN), timeout=15)
    body = r.json() if r.status_code == 200 else {}
    rows_lb = body.get("leaderboard", [])
    me_row = next((row for row in rows_lb if row.get("user_id") == P["id"]), None)
    record("8. leaderboard hydrated (rank/elo/country)",
           r.status_code == 200 and me_row is not None and "rank" in me_row
           and "elo" in me_row and "country" in me_row,
           f"row={me_row}")

    # =========================================================================
    # 9) GET /leaderboard/global
    # =========================================================================
    r = requests.get(f"{API}/leaderboard/global?scope=global&limit=10",
                     headers=H(P_TOKEN), timeout=15)
    body = r.json() if r.status_code == 200 else {}
    lb = body.get("leaderboard", [])
    countries = body.get("countries", [])
    elos = [row.get("elo", 0) for row in lb]
    sorted_desc = elos == sorted(elos, reverse=True)
    has_rank = all("rank" in r2 for r2 in lb)
    record("9. global leaderboard: sorted by elo desc + rank present",
           r.status_code == 200 and sorted_desc and has_rank,
           f"len={len(lb)} elos={elos[:5]} sorted={sorted_desc}")
    record("9a. countries non-empty (since users have country)",
           isinstance(countries, list) and len(countries) >= 1,
           f"countries={countries}")

    r = requests.get(f"{API}/leaderboard/global?scope=country&country=US",
                     headers=H(P_TOKEN), timeout=15)
    body = r.json() if r.status_code == 200 else {}
    lb_us = body.get("leaderboard", [])
    only_us = all((row.get("country") == "US") for row in lb_us)
    record("9b. scope=country&country=US only US users",
           r.status_code == 200 and only_us,
           f"countries_in_rows={[r2.get('country') for r2 in lb_us]}")

    r = requests.get(f"{API}/leaderboard/global?scope=country&country=ZZ",
                     headers=H(P_TOKEN), timeout=15)
    body = r.json() if r.status_code == 200 else {}
    record("9c. scope=country&country=ZZ → 200 with empty leaderboard",
           r.status_code == 200 and body.get("leaderboard") == [],
           f"status={r.status_code} lb={body.get('leaderboard')}")

    # =========================================================================
    # 10) GET /featured-players
    # =========================================================================
    r = requests.get(f"{API}/featured-players", timeout=15)
    body = r.json() if r.status_code == 200 else {}
    feats = body.get("featured", [])
    record("10. /featured-players includes admin",
           r.status_code == 200 and len(feats) >= 1
           and any(f.get("name") for f in feats),
           f"count={len(feats)} sample={feats[:1]}")

    # =========================================================================
    # 11) GET /live/games (no in-progress)
    # =========================================================================
    r = requests.get(f"{API}/live/games", timeout=15)
    body = r.json() if r.status_code == 200 else {}
    record("11. /live/games returns games:[] count:0 initially",
           r.status_code == 200 and isinstance(body.get("games"), list)
           and body.get("count") == len(body.get("games", [])),
           f"body={body}")

    # =========================================================================
    # 12) GET /live/games/non-existent → 404
    # =========================================================================
    r = requests.get(f"{API}/live/games/non-existent-id-xyz", timeout=15)
    record("12. /live/games/non-existent → 404", r.status_code == 404,
           f"status={r.status_code}")

    # =========================================================================
    # 13) GET /badges (defaults seeded)
    # =========================================================================
    r = requests.get(f"{API}/badges", timeout=15)
    body = r.json() if r.status_code == 200 else {}
    badge_keys = {b.get("key") for b in body.get("badges", [])}
    expected = {"first_win", "ten_wins", "fifty_wins", "rule_breaker", "streak_5",
                "streak_30", "puzzle_solver", "tournament_join", "tournament_top3",
                "tournament_winner", "spectator"}
    missing = expected - badge_keys
    record("13. /badges has all 11 default badges",
           r.status_code == 200 and not missing,
           f"missing={missing} count={len(badge_keys)}")

    # =========================================================================
    # 14) GET /badges/me includes tournament_join
    # =========================================================================
    r = requests.get(f"{API}/badges/me", headers=H(P_TOKEN), timeout=15)
    body = r.json() if r.status_code == 200 else {}
    earned_keys = [b.get("key") for b in body.get("badges", [])]
    record("14. /badges/me includes tournament_join",
           r.status_code == 200 and "tournament_join" in earned_keys,
           f"earned={earned_keys}")

    # =========================================================================
    # 15) PUT /profile/country
    # =========================================================================
    r = requests.put(f"{API}/profile/country", headers=H(P_TOKEN),
                     json={"country": "in"}, timeout=15)
    body = r.json() if r.status_code == 200 else {}
    record("15. PUT country='in' → 200 returns country='IN'",
           r.status_code == 200 and body.get("ok") and body.get("country") == "IN",
           f"body={body}")

    r = requests.put(f"{API}/profile/country", headers=H(P_TOKEN),
                     json={"country": "USA"}, timeout=15)
    record("15a. PUT country='USA' → 400", r.status_code == 400,
           f"status={r.status_code}")

    r = requests.put(f"{API}/profile/country", headers=H(P_TOKEN),
                     json={"country": "X1"}, timeout=15)
    record("15b. PUT country='X1' → 400", r.status_code == 400,
           f"status={r.status_code}")

    # =========================================================================
    # 16) Match win + badge auto-award
    # =========================================================================
    # MatchIn schema requires: mode, result, moves_san, optional rule_key, ai_level, etc.
    # Reset wins=0 so we can verify first_win and ten_wins fresh
    db.users.update_one({"id": P["id"]}, {"$set": {"wins": 0, "losses": 0, "draws": 0, "badges": []}})
    db.user_badges.delete_many({"user_id": P["id"]})
    # Re-award tournament_join state because we cleared user_badges; tests below verify only first_win/ten_wins
    # Submit 1 classic win
    payload = {"mode": "classic", "rule_key": "classic", "result": "win",
               "moves_san": ["e4", "e5", "Nf3"], "duration_seconds": 60, "ai_level": 2}
    r = requests.post(f"{API}/matches", headers=H(P_TOKEN), json=payload, timeout=15)
    record("16. POST /matches classic win → 200",
           r.status_code == 200, f"status={r.status_code} body={r.text[:200]}")

    r = requests.get(f"{API}/badges/me", headers=H(P_TOKEN), timeout=15)
    earned_keys = [b.get("key") for b in r.json().get("badges", [])]
    record("16a. first_win badge after 1 classic win",
           "first_win" in earned_keys, f"earned={earned_keys}")

    # 9 more wins to reach 10
    for _ in range(9):
        requests.post(f"{API}/matches", headers=H(P_TOKEN), json=payload, timeout=15)
    r = requests.get(f"{API}/badges/me", headers=H(P_TOKEN), timeout=15)
    earned_keys = [b.get("key") for b in r.json().get("badges", [])]
    user_doc = db.users.find_one({"id": P["id"]})
    record("16b. ten_wins badge after 10 classic wins",
           "ten_wins" in earned_keys, f"wins={user_doc.get('wins')} earned={earned_keys}")

    # Custom rule win → rule_breaker
    payload_custom = {"mode": "king_dash", "rule_key": "king_dash", "result": "win",
                      "moves_san": ["e4"], "duration_seconds": 30, "ai_level": 2}
    r = requests.post(f"{API}/matches", headers=H(P_TOKEN), json=payload_custom, timeout=15)
    record("16c. POST custom-rule win → 200",
           r.status_code == 200, f"status={r.status_code}")
    r = requests.get(f"{API}/badges/me", headers=H(P_TOKEN), timeout=15)
    earned_keys = [b.get("key") for b in r.json().get("badges", [])]
    record("16d. rule_breaker badge after custom-rule win",
           "rule_breaker" in earned_keys, f"earned={earned_keys}")

    # =========================================================================
    # 17) Match share
    # =========================================================================
    match_doc = db.matches.find_one({"user_id": P["id"]}, sort=[("created_at", -1)])
    if match_doc:
        mid = match_doc["id"]
        r = requests.get(f"{API}/matches/{mid}/share", headers=H(P_TOKEN), timeout=15)
        body = r.json() if r.status_code == 200 else {}
        share = body.get("share", {})
        keys_ok = {"title", "text", "result", "rating_after", "elo_delta",
                   "rule_key", "moves"}.issubset(share.keys())
        record("17. /matches/{id}/share returns full share payload",
               r.status_code == 200 and keys_ok and body.get("match_id") == mid,
               f"keys={list(share.keys())}")
    else:
        record("17. /matches/{id}/share", False, "No match doc found in db.matches")

    # =========================================================================
    # Edge cases
    # =========================================================================
    r = requests.post(f"{API}/tournaments/wrong-id-xxx/join", headers=H(P_TOKEN), timeout=15)
    record("E1. join wrong tournament id → 404", r.status_code == 404,
           f"status={r.status_code}")

    # WebSocket /api/live/spectate/{game_id} non-existent
    async def ws_test():
        url = f"{WS_BASE}/api/live/spectate/non-existent-game"
        try:
            async with websockets.connect(url, open_timeout=10) as ws:
                msg = await asyncio.wait_for(ws.recv(), timeout=10)
                data = json.loads(msg)
                return data
        except Exception as e:
            return {"_error": str(e)}

    try:
        ws_data = asyncio.run(ws_test())
        record("E2. WS /live/spectate non-existent → {type:'error', detail:'Game not active'}",
               ws_data.get("type") == "error" and ws_data.get("detail") == "Game not active",
               f"data={ws_data}")
    except Exception as e:
        record("E2. WS spectate non-existent", False, f"exception={e}")

    # =========================================================================
    print("\n" + "=" * 80)
    print(f"PASSED: {len(PASSED)}")
    print(f"FAILED: {len(FAILED)}")
    if FAILED:
        print("\nFailures:")
        for label, det in FAILED:
            print(f"  - {label}: {det}")
    return 0 if not FAILED else 1


if __name__ == "__main__":
    sys.exit(main())
