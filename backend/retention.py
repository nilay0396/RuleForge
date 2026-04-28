"""Retention features: daily rewards, login streak, puzzles, daily puzzle.

Mounted under /api by server.py via include_router.
"""
from __future__ import annotations

import os
import uuid
import random
import math
from datetime import datetime, date, timezone, timedelta
from typing import Any, Dict, List, Optional

import chess as pychess
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

REWARD_BASE_COINS = 50
REWARD_BASE_XP = 25


def reward_multiplier(streak: int) -> float:
    if streak >= 7:
        return 2.0
    if streak >= 4:
        return 1.5
    return 1.0


def compute_level(xp: int) -> Dict[str, int]:
    """Level curve: each level requires +200 XP than the prior. Level 1 = 0 XP."""
    if xp < 0:
        xp = 0
    # XP needed for level n: 200 * n*(n-1)/2 → solve quadratic
    # n*(n-1) <= xp/100 → n = floor((1 + sqrt(1 + 4*xp/100)) / 2)
    n = int((1 + math.sqrt(1 + 4 * (xp / 100.0))) / 2.0)
    if n < 1:
        n = 1
    cur_floor = 200 * n * (n - 1) // 2  # XP at start of level n
    next_floor = 200 * n * (n + 1) // 2  # XP at start of level n+1
    return {
        "level": n,
        "xp": xp,
        "level_floor": cur_floor,
        "next_floor": next_floor,
        "progress": max(0, xp - cur_floor),
        "needed": max(1, next_floor - cur_floor),
    }


def _today() -> str:
    return date.today().isoformat()


def _yesterday() -> str:
    return (date.today() - timedelta(days=1)).isoformat()


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------


class PuzzleAttemptIn(BaseModel):
    moves: List[str] = Field(default_factory=list)  # UCI moves the user submitted
    success: bool
    time_taken_ms: int = 0
    used_hint: bool = False


# ---------------------------------------------------------------------------
# Seed puzzles (curated, well-known compositions and tactical positions)
# ---------------------------------------------------------------------------

SEED_PUZZLES: List[Dict[str, Any]] = [
    # Mate in 1 — assorted
    {"theme": "mate_in_1", "rating": 600, "title": "Back-rank mate", "fen": "6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1", "solution": ["e1e8"], "hint": "The king has no escape on the back rank."},
    {"theme": "mate_in_1", "rating": 650, "title": "Queen smother", "fen": "6k1/5ppp/8/8/8/8/8/4Q1K1 w - - 0 1", "solution": ["e1e8"], "hint": "Place the queen on the 8th rank with check."},
    {"theme": "mate_in_1", "rating": 700, "title": "Knight wins", "fen": "r1bqkb1r/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 0 1", "solution": ["f3f7"], "hint": "Quickly target the f7 weakness."},
    {"theme": "mate_in_1", "rating": 750, "title": "Anastasia's pattern", "fen": "5rk1/p3R1pp/8/8/8/8/PP3PPP/6K1 w - - 0 1", "solution": ["e7e8"], "hint": "Use the open e-file."},
    {"theme": "mate_in_1", "rating": 800, "title": "Diagonal terror", "fen": "r1bqkbnr/pppp1Bpp/2n5/4p3/4P3/8/PPPP1PPP/RNBQK1NR w KQkq - 0 1", "solution": ["f7e8"], "hint": "There's a long diagonal that finishes the king."},
    {"theme": "mate_in_1", "rating": 850, "title": "Rook seal", "fen": "6k1/8/6K1/8/8/8/8/4R3 w - - 0 1", "solution": ["e1e8"], "hint": "Cut off the king on the 8th rank."},
    {"theme": "mate_in_1", "rating": 900, "title": "Two rooks ladder", "fen": "k7/8/1K6/R7/8/8/8/7R w - - 0 1", "solution": ["h1h8"], "hint": "The other rook supports — push the king into the corner."},
    {"theme": "mate_in_1", "rating": 950, "title": "Queen + king net", "fen": "k7/8/1K6/8/8/8/8/3Q4 w - - 0 1", "solution": ["d1a4"], "hint": "Bring the queen to a4 to remove every escape."},

    # Mate in 2
    {"theme": "mate_in_2", "rating": 1100, "title": "Queen sacrifice", "fen": "r1b1k2r/ppppnppp/2n5/4p1q1/2B1P3/5Q2/PPPP1PPP/RNB1K2R w KQkq - 0 1", "solution": ["f3f7", "e8d8"], "hint": "Sacrifice on f7 — the king must move."},
    {"theme": "mate_in_2", "rating": 1200, "title": "Smother prep", "fen": "6k1/5ppp/8/8/8/4Q3/5PPP/6K1 w - - 0 1", "solution": ["e3e8", "g8h8"], "hint": "Push the king into the corner first."},
    {"theme": "mate_in_2", "rating": 1300, "title": "Rook lift", "fen": "r5k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1", "solution": ["e1e8", "g8h7"], "hint": "Pin the king to the corner."},
    {"theme": "mate_in_2", "rating": 1400, "title": "Two-piece net", "fen": "6k1/8/4Q1K1/8/8/8/8/8 w - - 0 1", "solution": ["e6g6", "g8h8"], "hint": "Get the queen on the 6th rank to limit the king."},
    {"theme": "mate_in_2", "rating": 1500, "title": "Bishop assists", "fen": "5rk1/5ppp/8/8/8/8/3B4/4R1K1 w - - 0 1", "solution": ["e1e8", "f8e8"], "hint": "Trade rooks first; the bishop finishes."},

    # Tactical wins
    {"theme": "tactical", "rating": 950, "title": "Knight fork", "fen": "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/2N2N2/PPPP1PPP/R1BQKB1R w KQkq - 0 1", "solution": ["f3e5"], "hint": "Play Nxe5 — discover a fork on c6."},
    {"theme": "tactical", "rating": 1000, "title": "Pin & win", "fen": "rnbqkb1r/pppp1ppp/5n2/4p3/2B1P3/8/PPPP1PPP/RNBQK1NR w KQkq - 0 1", "solution": ["c4f7"], "hint": "Sacrifice on f7 to draw the king out."},
    {"theme": "tactical", "rating": 1050, "title": "Skewer the queen", "fen": "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 0 1", "solution": ["d2d4"], "hint": "Open lines toward the king."},
    {"theme": "tactical", "rating": 1100, "title": "Win the rook", "fen": "r3k2r/ppp1qppp/2n2n2/3p4/3P4/2N1PN2/PPPB1PPP/R2QK2R w KQkq - 0 1", "solution": ["c3b5"], "hint": "Knight to b5 forks queen and bishop."},
    {"theme": "tactical", "rating": 1150, "title": "Decoy", "fen": "r1bqk2r/ppp2ppp/2n1pn2/3p4/2BP4/2N1PN2/PPP2PPP/R1BQK2R w KQkq - 0 1", "solution": ["c4d5"], "hint": "Sacrifice the bishop to win material."},
    {"theme": "tactical", "rating": 1200, "title": "Discovered check", "fen": "r2qkb1r/pp1n1ppp/2p1pn2/3p4/3PP3/2N1BN2/PPPQ1PPP/R3K2R w KQkq - 0 1", "solution": ["e4d5"], "hint": "Discover a check that wins the queen."},
    {"theme": "tactical", "rating": 1250, "title": "Combine forces", "fen": "r1bq1rk1/pp1n1ppp/2pbpn2/3p4/2PP4/2NBPN2/PPQ2PPP/R1B2RK1 w - - 0 1", "solution": ["c4d5"], "hint": "Open the centre to expose the king."},
    {"theme": "tactical", "rating": 1300, "title": "Double attack", "fen": "r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQ1RK1 w kq - 0 1", "solution": ["f3e5"], "hint": "Knight take the centre pawn — wins material."},
    {"theme": "tactical", "rating": 1350, "title": "Open the file", "fen": "r1bq1rk1/pppp1ppp/2n2n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 w - - 0 1", "solution": ["c4f7"], "hint": "f7 sacrifice exposes the king."},
    {"theme": "tactical", "rating": 1400, "title": "Royal fork", "fen": "r3k2r/ppp1qppp/2n2n2/3p4/3P4/2N1PN2/PPPB1PPP/R2Q1RK1 w kq - 0 1", "solution": ["c3b5"], "hint": "Knight to b5 — both royals are in trouble."},
    {"theme": "tactical", "rating": 1450, "title": "Win a piece", "fen": "r1bqk2r/pppp1ppp/2n1pn2/8/1bPP4/2N1PN2/PP3PPP/R1BQKB1R w KQkq - 0 1", "solution": ["c3b5"], "hint": "Threaten c7 and lock the bishop out."},
]


def _validate_solution_legal(fen: str, solution: List[str]) -> bool:
    try:
        b = pychess.Board(fen)
        for u in solution:
            mv = pychess.Move.from_uci(u)
            if mv not in b.legal_moves:
                return False
            b.push(mv)
        return True
    except Exception:
        return False


# ---------------------------------------------------------------------------
# Daily reward + streak helpers
# ---------------------------------------------------------------------------


def _maybe_reward_state(user: Dict[str, Any]) -> Dict[str, Any]:
    today = _today()
    last_reward = user.get("last_reward_date")
    next_streak = compute_next_login_streak(user)
    mult = reward_multiplier(next_streak)
    return {
        "available": last_reward != today,
        "next_streak_if_claimed": next_streak,
        "multiplier": mult,
        "coins": int(REWARD_BASE_COINS * mult),
        "xp": int(REWARD_BASE_XP * mult),
    }


def compute_next_login_streak(user: Dict[str, Any]) -> int:
    """If user claims today, what would their login_streak become?"""
    last_login = user.get("last_login_date")
    cur = int(user.get("login_streak", 0))
    today = _today()
    yest = _yesterday()
    if last_login == today:
        # Already logged in today — claiming today won't change streak
        return max(cur, 1)
    if last_login == yest:
        return cur + 1
    # Either first ever, or gap → reset to 1
    return 1


# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------


def make_retention_router(current_user_dep, db_getter, push_notification_fn):
    router = APIRouter()

    # ---------------- Daily reward ----------------
    @router.get("/daily-reward/state")
    async def reward_state(user: Dict[str, Any] = Depends(current_user_dep)):
        return {"reward": _maybe_reward_state(user)}

    @router.post("/daily-reward/claim")
    async def claim_reward(request: Request, user: Dict[str, Any] = Depends(current_user_dep)):
        db = db_getter(request)
        today = _today()
        if user.get("last_reward_date") == today:
            return {"already_claimed": True, "reward": _maybe_reward_state(user)}
        new_streak = compute_next_login_streak(user)
        mult = reward_multiplier(new_streak)
        coins = int(REWARD_BASE_COINS * mult)
        xp = int(REWARD_BASE_XP * mult)
        longest = max(int(user.get("longest_login_streak", 0)), new_streak)
        await db.users.update_one(
            {"id": user["id"]},
            {
                "$inc": {"coins": coins, "xp": xp},
                "$set": {
                    "login_streak": new_streak,
                    "longest_login_streak": longest,
                    "last_login_date": today,
                    "last_reward_date": today,
                },
            },
        )
        # Wallet transaction log
        try:
            from monetization import log_transaction as _log_tx
            await _log_tx(
                db, user_id=user["id"], type="earn", amount=coins,
                source="daily_reward",
                metadata={"streak": new_streak, "multiplier": mult, "xp": xp},
            )
        except Exception:
            pass
        updated = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0})
        return {
            "claimed": True,
            "coins": coins,
            "xp": xp,
            "multiplier": mult,
            "streak": new_streak,
            "user": _public_user(updated),
        }

    # ---------------- Puzzles ----------------
    def _public_puzzle(p: Dict[str, Any]) -> Dict[str, Any]:
        sol = p.get("solution") or []
        out = {k: v for k, v in p.items() if k not in ("solution", "_id", "hint")}
        out["solution_length"] = len(sol)
        out["hint"] = p.get("hint", "")
        return out

    @router.get("/puzzles/daily")
    async def daily_puzzle(request: Request, user: Dict[str, Any] = Depends(current_user_dep)):
        db = db_getter(request)
        today = _today()
        dp = await db.daily_puzzles.find_one({"date": today}, {"_id": 0})
        if not dp:
            # MVP: only single-move puzzles supported by client UI
            single_count = await db.puzzles.count_documents({"$expr": {"$eq": [{"$size": "$solution"}, 1]}})
            if single_count == 0:
                # Fallback to any puzzle if filter empty
                any_count = await db.puzzles.count_documents({})
                if any_count == 0:
                    raise HTTPException(500, "No puzzles seeded")
                cursor = db.puzzles.find({}, {"_id": 0}).sort("rating", 1).skip(date.today().toordinal() % any_count).limit(1)
            else:
                idx = date.today().toordinal() % single_count
                cursor = db.puzzles.find(
                    {"$expr": {"$eq": [{"$size": "$solution"}, 1]}}, {"_id": 0}
                ).sort("rating", 1).skip(idx).limit(1)
            puzzle = (await cursor.to_list(1))[0]
            dp = {
                "id": str(uuid.uuid4()),
                "date": today,
                "puzzle_id": puzzle["id"],
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            await db.daily_puzzles.insert_one(dict(dp))
            dp.pop("_id", None)
        puzzle = await db.puzzles.find_one({"id": dp["puzzle_id"]}, {"_id": 0})
        attempt = await db.puzzle_attempts.find_one(
            {"user_id": user["id"], "puzzle_id": dp["puzzle_id"], "is_daily": True, "date": today},
            {"_id": 0},
        )
        return {
            "daily": dp,
            "puzzle": _public_puzzle(puzzle) if puzzle else None,
            "completed": bool(attempt and attempt.get("status") == "solved"),
        }

    @router.get("/puzzles/random")
    async def random_puzzle(request: Request, user: Dict[str, Any] = Depends(current_user_dep)):
        db = db_getter(request)
        rating = int(user.get("puzzle_rating", 800))
        # ±150 first, expand if needed. Restrict to 1-move puzzles for v1.
        single_filter = {"$expr": {"$eq": [{"$size": "$solution"}, 1]}}
        for tol in (150, 300, 600, 9999):
            cursor = db.puzzles.find(
                {**single_filter, "rating": {"$gte": rating - tol, "$lte": rating + tol}}, {"_id": 0}
            )
            rows = await cursor.to_list(200)
            if rows:
                pick = random.choice(rows)
                return {"puzzle": _public_puzzle(pick)}
        # Fallback: any single-move puzzle
        any_cursor = db.puzzles.find(single_filter, {"_id": 0})
        rows = await any_cursor.to_list(200)
        if rows:
            return {"puzzle": _public_puzzle(random.choice(rows))}
        raise HTTPException(404, "No puzzles available")

    @router.get("/puzzles/{pid}")
    async def get_puzzle(pid: str, request: Request, _: Dict[str, Any] = Depends(current_user_dep)):
        db = db_getter(request)
        p = await db.puzzles.find_one({"id": pid}, {"_id": 0})
        if not p:
            raise HTTPException(404, "Puzzle not found")
        return {"puzzle": _public_puzzle(p)}

    @router.post("/puzzles/{pid}/attempt")
    async def submit_attempt(
        pid: str,
        payload: PuzzleAttemptIn,
        request: Request,
        user: Dict[str, Any] = Depends(current_user_dep),
    ):
        db = db_getter(request)
        puzzle = await db.puzzles.find_one({"id": pid}, {"_id": 0})
        if not puzzle:
            raise HTTPException(404, "Puzzle not found")

        # Validate moves match the solution prefix (if claimed success)
        solution = puzzle.get("solution", [])
        actually_solved = payload.success and payload.moves == solution

        rating_before = int(user.get("puzzle_rating", 800))
        # Simple rating: K=24 against puzzle rating
        score = 1.0 if actually_solved else 0.0
        expected = 1.0 / (1.0 + 10 ** ((puzzle.get("rating", 800) - rating_before) / 400))
        delta = int(round(24 * (score - expected)))
        if not actually_solved and payload.used_hint:
            delta = max(delta, -3)  # cushion when player asked for hint
        rating_after = max(100, rating_before + delta)

        xp_gain = 30 if actually_solved else 5
        coin_gain = 8 if actually_solved else 0

        # Track daily flag if today's daily puzzle
        today = _today()
        dp = await db.daily_puzzles.find_one({"date": today, "puzzle_id": pid}, {"_id": 0})
        is_daily = bool(dp)
        if actually_solved and is_daily:
            xp_gain += 25
            coin_gain += 10

        attempt_doc = {
            "id": str(uuid.uuid4()),
            "user_id": user["id"],
            "puzzle_id": pid,
            "status": "solved" if actually_solved else "failed",
            "moves": payload.moves,
            "time_taken_ms": payload.time_taken_ms,
            "used_hint": payload.used_hint,
            "rating_before": rating_before,
            "rating_after": rating_after,
            "delta": delta,
            "xp_gain": xp_gain,
            "coin_gain": coin_gain,
            "is_daily": is_daily,
            "date": today,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.puzzle_attempts.insert_one(dict(attempt_doc))
        await db.users.update_one(
            {"id": user["id"]},
            {
                "$inc": {"xp": xp_gain, "coins": coin_gain},
                "$set": {"puzzle_rating": rating_after},
            },
        )
        # Wallet transaction log
        if coin_gain > 0:
            try:
                from monetization import log_transaction as _log_tx
                await _log_tx(
                    db, user_id=user["id"], type="earn", amount=coin_gain,
                    source="daily_puzzle_bonus" if (actually_solved and is_daily) else "puzzle",
                    metadata={"puzzle_id": pid, "is_daily": is_daily, "delta": delta},
                )
            except Exception:
                pass
        attempt_doc.pop("_id", None)
        updated = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0})
        return {
            "attempt": attempt_doc,
            "rating_before": rating_before,
            "rating_after": rating_after,
            "delta": delta,
            "xp_gain": xp_gain,
            "coin_gain": coin_gain,
            "user": _public_user(updated),
            "solution": solution if actually_solved else None,
        }

    @router.get("/puzzles/me/history")
    async def my_history(request: Request, user: Dict[str, Any] = Depends(current_user_dep)):
        db = db_getter(request)
        rows = await db.puzzle_attempts.find(
            {"user_id": user["id"]}, {"_id": 0}
        ).sort("created_at", -1).to_list(50)
        solved = sum(1 for r in rows if r.get("status") == "solved")
        return {"history": rows, "solved": solved, "total": len(rows)}

    return router


# ---------------------------------------------------------------------------
# Public user view (re-implemented here to add level + reward state)
# ---------------------------------------------------------------------------


def _public_user(user: Dict[str, Any]) -> Dict[str, Any]:
    if not user:
        return {}
    xp = int(user.get("xp", 0))
    lvl = compute_level(xp)
    return {
        "id": user["id"],
        "email": user.get("email"),
        "name": user.get("name", "Player"),
        "role": user.get("role", "user"),
        "is_guest": bool(user.get("is_guest", False)),
        "xp": xp,
        "level": lvl["level"],
        "level_progress": lvl["progress"],
        "level_needed": lvl["needed"],
        "coins": int(user.get("coins", 0)),
        "elo": int(user.get("elo", 800)),
        "puzzle_rating": int(user.get("puzzle_rating", 800)),
        "streak": int(user.get("streak", 0)),
        "longest_streak": int(user.get("longest_streak", 0)),
        "login_streak": int(user.get("login_streak", 0)),
        "longest_login_streak": int(user.get("longest_login_streak", 0)),
        "last_login_date": user.get("last_login_date"),
        "last_reward_date": user.get("last_reward_date"),
        "daily_reward_available": user.get("last_reward_date") != _today(),
        "next_streak_if_claimed": compute_next_login_streak(user),
        "badges": user.get("badges", []),
        "wins": int(user.get("wins", 0)),
        "losses": int(user.get("losses", 0)),
        "draws": int(user.get("draws", 0)),
        "premium": bool(user.get("premium", False)),
        "is_premium": bool(user.get("is_premium", user.get("premium", False))),
        "is_featured": bool(user.get("is_featured", False)),
        "country": user.get("country"),
        "avatar": user.get("avatar"),
        "created_at": user.get("created_at"),
    }


# ---------------------------------------------------------------------------
# Seeders (called from server.py startup)
# ---------------------------------------------------------------------------


async def seed_puzzles(db) -> None:
    if await db.puzzles.count_documents({}) > 0:
        return
    docs = []
    for p in SEED_PUZZLES:
        if not _validate_solution_legal(p["fen"], p["solution"]):
            # Skip invalid composition rather than crash
            continue
        docs.append({
            "id": str(uuid.uuid4()),
            "title": p.get("title", "Puzzle"),
            "theme": p["theme"],
            "rating": p["rating"],
            "fen": p["fen"],
            "solution": p["solution"],
            "hint": p.get("hint", ""),
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    if docs:
        await db.puzzles.insert_many(docs)
