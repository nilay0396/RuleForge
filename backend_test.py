"""
RuleForge Chess — Monetization backend tests (Iteration 5).

Runs against the public EXPO_PUBLIC_BACKEND_URL with /api prefix.
Uses test credentials from /app/memory/test_credentials.md.
Performs a few direct MongoDB mutations (documented) to make tests
deterministic (premium reset, coin top-up, ad-views reset).
"""
from __future__ import annotations

import os
import sys
import json
from datetime import date
from typing import Any, Dict, Optional, Tuple

import requests
from pymongo import MongoClient
from dotenv import dotenv_values


# ----------------------------------------------------------------------------
# Setup
# ----------------------------------------------------------------------------
FRONTEND_ENV = dotenv_values("/app/frontend/.env")
BACKEND_ENV = dotenv_values("/app/backend/.env")

BASE = (FRONTEND_ENV.get("EXPO_PUBLIC_BACKEND_URL") or "").rstrip("/")
API = f"{BASE}/api"

MONGO_URL = BACKEND_ENV.get("MONGO_URL") or "mongodb://localhost:27017"
DB_NAME = BACKEND_ENV.get("DB_NAME") or "ruleforge_chess"

EMAIL = "player1@ruleforge.app"
PASSWORD = "Player@1234"

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


def hdr(token: str) -> Dict[str, str]:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def login_or_register():
    r = requests.post(f"{API}/auth/login",
                      json={"email": EMAIL, "password": PASSWORD}, timeout=15)
    if r.status_code in (400, 401):
        r = requests.post(f"{API}/auth/register",
                          json={"email": EMAIL, "password": PASSWORD,
                                "name": "Player One"}, timeout=15)
    r.raise_for_status()
    data = r.json()
    return data["token"], data["user"]


def reset_user_state(user_id: str, coins: int = 1000) -> None:
    db.users.update_one(
        {"id": user_id},
        {"$set": {
            "is_premium": False,
            "premium": False,
            "coins": coins,
        },
        "$unset": {
            "premium_since": "",
            "premium_method": "",
            "premium_plan": "",
            "premium_renews_at": "",
        }},
    )
    db.user_inventory.delete_many({
        "user_id": user_id,
        "acquired_via": {"$ne": "default"},
    })
    db.user_preferences.update_one(
        {"user_id": user_id},
        {"$set": {
            "board_theme": "board_classic",
            "piece_style": "piece_classic",
            "avatar": "avatar_pawn",
        }},
        upsert=True,
    )
    db.ad_views.delete_many({"user_id": user_id})
    db.transactions.delete_many({"user_id": user_id})


def set_coins(user_id: str, coins: int) -> None:
    db.users.update_one({"id": user_id}, {"$set": {"coins": coins}})


def main() -> int:
    print(f"BASE = {BASE}")
    if not BASE:
        print("[FATAL] EXPO_PUBLIC_BACKEND_URL not set"); return 1

    token, user = login_or_register()
    user_id = user["id"]
    print(f"Logged in as {user['email']} id={user_id}")

    reset_user_state(user_id, coins=1000)
    H = hdr(token)

    # 1) wallet
    r = requests.get(f"{API}/wallet", headers=H, timeout=15)
    ok = r.status_code == 200
    body = r.json() if ok else {}
    schema_ok = (
        ok and "coins" in body and "is_premium" in body
        and isinstance(body.get("recent"), list) and len(body["recent"]) <= 20
        and isinstance(body.get("totals"), dict)
        and body["is_premium"] is False and int(body["coins"]) == 1000
    )
    record("1. GET /api/wallet schema", schema_ok,
           f"status={r.status_code} body={body if not schema_ok else 'ok'}")

    # 2) store
    r = requests.get(f"{API}/store", headers=H, timeout=15)
    ok = r.status_code == 200
    body = r.json() if ok else {}
    items = body.get("items", [])
    grouped = body.get("grouped", {})
    expected_keys = {
        "board_classic", "board_emerald", "board_midnight", "board_rose", "board_obsidian",
        "piece_classic", "piece_serif", "piece_mono", "piece_neo", "piece_aurum",
        "avatar_pawn", "avatar_knight", "avatar_bishop", "avatar_rook",
        "avatar_queen", "avatar_crown",
    }
    keys_present = {it["key"] for it in items}
    by_key = {it["key"]: it for it in items}
    missing = expected_keys - keys_present
    grouped_ok = isinstance(grouped, dict) and {"board", "piece", "avatar"}.issubset(grouped.keys())
    defaults_ok = (
        by_key.get("board_classic", {}).get("owned") is True
        and by_key.get("board_classic", {}).get("equipped") is True
        and by_key.get("piece_classic", {}).get("owned") is True
        and by_key.get("piece_classic", {}).get("equipped") is True
        and by_key.get("avatar_pawn", {}).get("owned") is True
        and by_key.get("avatar_pawn", {}).get("equipped") is True
    )
    locked_ok = (
        by_key.get("board_obsidian", {}).get("locked_premium") is True
        and by_key.get("piece_aurum", {}).get("locked_premium") is True
        and by_key.get("avatar_crown", {}).get("locked_premium") is True
    )
    record("2. GET /api/store has 16 seeded items + grouped",
           ok and not missing and grouped_ok,
           f"missing={missing} status={r.status_code}")
    record("2b. /store defaults owned+equipped", defaults_ok,
           json.dumps({k: by_key.get(k, {}).get("equipped") for k in
                       ["board_classic", "piece_classic", "avatar_pawn"]}))
    record("2c. /store premium-only items locked for non-premium", locked_ok, "")

    # 3) buy
    set_coins(user_id, 200)
    r = requests.post(f"{API}/store/board_emerald/buy", headers=H, timeout=15)
    record("3a. buy board_emerald with 200 coins → 402",
           r.status_code == 402, f"got={r.status_code}")

    set_coins(user_id, 500)
    r = requests.post(f"{API}/store/board_emerald/buy", headers=H, timeout=15)
    ok = r.status_code == 200
    body = r.json() if ok else {}
    buy_ok = (ok and body.get("ok") is True
              and body.get("price_paid") == 300
              and body.get("coins") == 200)
    record("3b. buy board_emerald with 500 coins → 200 coins=200 price=300",
           buy_ok, f"status={r.status_code} body={body}")

    tx = db.transactions.find_one({
        "user_id": user_id, "type": "spend",
        "source": "store_purchase", "amount": 300,
    })
    record("3c. spend/store_purchase/300 transaction recorded",
           tx is not None, "")

    r = requests.post(f"{API}/store/board_emerald/buy", headers=H, timeout=15)
    record("3d. duplicate buy board_emerald → 400 Already owned",
           r.status_code == 400, f"got={r.status_code}")

    r = requests.post(f"{API}/store/board_obsidian/buy", headers=H, timeout=15)
    record("3e. buy board_obsidian as non-premium → 403",
           r.status_code == 403, f"got={r.status_code}")

    # 4) preferences
    r = requests.put(f"{API}/preferences", headers=H,
                     json={"board_theme": "board_midnight"}, timeout=15)
    record("4a. PUT prefs board_midnight (not owned) → 403",
           r.status_code == 403, f"got={r.status_code}")

    r = requests.put(f"{API}/preferences", headers=H,
                     json={"board_theme": "board_emerald"}, timeout=15)
    ok = r.status_code == 200
    body = r.json() if ok else {}
    record("4b. PUT prefs board_emerald → 200",
           ok and body.get("preferences", {}).get("board_theme") == "board_emerald",
           f"status={r.status_code}")

    r = requests.put(f"{API}/preferences", headers=H,
                     json={"avatar": "avatar_pawn"}, timeout=15)
    record("4c. PUT prefs avatar_pawn (default) → 200",
           r.status_code == 200, f"got={r.status_code}")

    r = requests.get(f"{API}/preferences", headers=H, timeout=15)
    body = r.json() if r.status_code == 200 else {}
    p = body.get("preferences", {})
    record("4d. GET /preferences reflects last set values",
           p.get("board_theme") == "board_emerald" and p.get("avatar") == "avatar_pawn",
           f"prefs={p}")

    # 5) inventory
    r = requests.get(f"{API}/inventory", headers=H, timeout=15)
    ok = r.status_code == 200
    body = r.json() if ok else {}
    inv = body.get("inventory", [])
    keys_in_inv = {row.get("item_key") for row in inv}
    needed = {"board_classic", "piece_classic", "avatar_pawn", "board_emerald"}
    record("5. GET /inventory has defaults + board_emerald + equipped flags + count",
           ok and needed.issubset(keys_in_inv)
           and all("equipped" in row for row in inv)
           and body.get("count") == len(inv),
           f"keys={keys_in_inv} count={body.get('count')}")

    # 6) premium
    r = requests.get(f"{API}/premium", headers=H, timeout=15)
    ok = r.status_code == 200
    body = r.json() if ok else {}
    bids = {b["id"] for b in body.get("benefits", [])}
    expected_bids = {"no_ads", "exclusive_themes", "extra_puzzles", "advanced_stats"}
    price = body.get("price", {})
    record("6. GET /premium benefits + price + is_premium=false",
           ok and bids == expected_bids and price.get("coins") == 5000
           and price.get("monthly_usd") and price.get("yearly_usd")
           and body.get("is_premium") is False,
           f"benefits={bids} price={price}")

    # 7) subscribe mock
    r = requests.post(f"{API}/premium/subscribe", headers=H,
                      json={"method": "mock", "plan": "monthly"}, timeout=15)
    ok = r.status_code == 200
    body = r.json() if ok else {}
    record("7a. POST /premium/subscribe mock → ok, coins_paid=0, user.is_premium=true",
           ok and body.get("ok") is True and body.get("coins_paid") == 0
           and body.get("user", {}).get("is_premium") is True,
           f"status={r.status_code} body={body}")

    r = requests.get(f"{API}/auth/me", headers=H, timeout=15)
    body = r.json() if r.status_code == 200 else {}
    me_premium = body.get("user", {}).get("is_premium") if "user" in body else body.get("is_premium")
    record("7b. /auth/me is_premium=true after subscribe",
           me_premium is True, f"me_premium={me_premium}")

    r = requests.get(f"{API}/store", headers=H, timeout=15)
    body = r.json() if r.status_code == 200 else {}
    obsidian = next((it for it in body.get("items", []) if it["key"] == "board_obsidian"), None)
    record("7c. /store board_obsidian.locked_premium=false now",
           obsidian is not None and obsidian.get("locked_premium") is False,
           f"obsidian.locked_premium={obsidian and obsidian.get('locked_premium')}")

    # 8) equip obsidian
    r = requests.put(f"{API}/preferences", headers=H,
                     json={"board_theme": "board_obsidian"}, timeout=15)
    body = r.json() if r.status_code == 200 else {}
    record("8. PUT prefs board_obsidian as premium → 200",
           r.status_code == 200
           and body.get("preferences", {}).get("board_theme") == "board_obsidian",
           f"status={r.status_code}")

    # 9) cancel + try equip
    r = requests.post(f"{API}/premium/cancel", headers=H, timeout=15)
    record("9a. /premium/cancel → 200", r.status_code == 200, f"status={r.status_code}")
    r = requests.get(f"{API}/auth/me", headers=H, timeout=15)
    body = r.json() if r.status_code == 200 else {}
    me_premium = body.get("user", {}).get("is_premium") if "user" in body else body.get("is_premium")
    record("9b. /auth/me is_premium=false after cancel",
           me_premium is False, f"me_premium={me_premium}")
    requests.put(f"{API}/preferences", headers=H,
                 json={"board_theme": "board_emerald"}, timeout=15)
    r = requests.put(f"{API}/preferences", headers=H,
                     json={"board_theme": "board_obsidian"}, timeout=15)
    record("9c. PUT prefs board_obsidian after cancel → 403",
           r.status_code == 403, f"got={r.status_code}")

    # 10) ads
    me_before = db.users.find_one({"id": user_id}) or {}
    coins_before = int(me_before.get("coins", 0))
    r = requests.get(f"{API}/ads/state", headers=H, timeout=15)
    body = r.json() if r.status_code == 200 else {}
    ads_ok = (
        body.get("is_premium") is False
        and body.get("available") is True
        and body.get("remaining") == 3
        and body.get("limit") == 3
        and body.get("reward_coins") == 15
    )
    record("10a. /ads/state non-premium initial",
           r.status_code == 200 and ads_ok, f"body={body}")

    for i in range(3):
        r = requests.post(f"{API}/ads/reward", headers=H, timeout=15)
        record(f"10b.{i+1} POST /ads/reward call {i+1}/3",
               r.status_code == 200, f"status={r.status_code} body={r.text[:200]}")

    r = requests.post(f"{API}/ads/reward", headers=H, timeout=15)
    record("10c. 4th /ads/reward → 429",
           r.status_code == 429, f"got={r.status_code}")

    ad_tx_count = db.transactions.count_documents({
        "user_id": user_id, "source": "ad_view", "type": "earn",
    })
    record("10d. 3 ad_view transactions logged",
           ad_tx_count == 3, f"count={ad_tx_count}")

    me_after = db.users.find_one({"id": user_id}) or {}
    coins_after = int(me_after.get("coins", 0))
    record("10e. coins increased by 45 from 3 ads",
           coins_after - coins_before == 45,
           f"before={coins_before} after={coins_after}")

    # 11) transactions
    r = requests.get(f"{API}/transactions?limit=20", headers=H, timeout=15)
    ok = r.status_code == 200
    body = r.json() if ok else {}
    rows = body.get("transactions", [])
    has_spend_300 = any(t.get("type") == "spend" and t.get("source") == "store_purchase"
                       and t.get("amount") == 300 for t in rows)
    has_earn_15 = any(t.get("type") == "earn" and t.get("source") == "ad_view"
                     and t.get("amount") == 15 for t in rows)
    fields_ok = all(all(k in t for k in ("type", "source", "amount", "created_at")) for t in rows)
    record("11. /transactions has spend(300) + earn(ad_view 15) and required fields",
           ok and has_spend_300 and has_earn_15 and fields_ok,
           f"len={len(rows)} spend300={has_spend_300} earn15={has_earn_15}")

    # 12) wallet totals
    r = requests.get(f"{API}/wallet", headers=H, timeout=15)
    body = r.json() if r.status_code == 200 else {}
    totals = body.get("totals", {})
    earn = totals.get("earn", {})
    spend = totals.get("spend", {})
    record("12. /wallet totals earn={45,3} spend>=300",
           earn.get("total") == 45 and earn.get("count") == 3
           and spend.get("total", 0) >= 300 and spend.get("count", 0) >= 1,
           f"totals={totals}")

    # Edge cases
    r = requests.post(f"{API}/store/non_existent/buy", headers=H, timeout=15)
    record("E1. /store/non_existent/buy → 404",
           r.status_code == 404, f"got={r.status_code}")

    set_coins(user_id, 100)
    r = requests.post(f"{API}/premium/subscribe", headers=H,
                      json={"method": "coins", "plan": "monthly"}, timeout=15)
    record("E2. /premium/subscribe coins (100<5000) → 402",
           r.status_code == 402, f"got={r.status_code}")

    db.user_inventory.delete_many({"user_id": user_id, "item_key": "avatar_knight"})
    set_coins(user_id, 0)
    pre_coins = int((db.users.find_one({"id": user_id}) or {}).get("coins", -1))
    r = requests.post(f"{API}/store/avatar_knight/buy", headers=H, timeout=15)
    post_coins = int((db.users.find_one({"id": user_id}) or {}).get("coins", -1))
    record("E3. coins=0 buy avatar_knight (200) → 402, no DB mutation",
           r.status_code == 402 and pre_coins == 0 and post_coins == 0,
           f"got={r.status_code} pre={pre_coins} post={post_coins}")

    print("\n========== SUMMARY ==========")
    print(f"PASSED: {len(PASSED)}")
    print(f"FAILED: {len(FAILED)}")
    for label, detail in FAILED:
        print(f"  ✗ {label} :: {detail}")
    return 0 if not FAILED else 1


if __name__ == "__main__":
    sys.exit(main())
