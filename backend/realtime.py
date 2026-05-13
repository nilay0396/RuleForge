"""Realtime layer for RuleForge Chess.

WebSocket gateway, matchmaking queue, live game manager, presence manager.
Multiplayer in v1 is restricted to classic chess so server-side validation
via python-chess is exact. Custom rule variants will be added later.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Set

import chess as pychess
import jwt
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ReturnDocument

logger = logging.getLogger("ruleforge.realtime")

JWT_ALGORITHM = "HS256"
CLASSIC_RULE_KEY = "classic"
DEFAULT_TIME_CONTROL = os.environ.get("ONLINE_DEFAULT_TIME_CONTROL", "10+0")
CLOCK_GRACE_MS = 250

# ---------------------------------------------------------------------------
# In-memory state
# ---------------------------------------------------------------------------


class ConnectionManager:
    def __init__(self) -> None:
        # user_id -> set of sockets (a user may have multiple tabs)
        self._sockets: Dict[str, Set[WebSocket]] = {}
        self._user_meta: Dict[str, Dict[str, Any]] = {}

    async def connect(self, user_id: str, ws: WebSocket, meta: Dict[str, Any]) -> bool:
        was_offline = user_id not in self._sockets or not self._sockets[user_id]
        self._sockets.setdefault(user_id, set()).add(ws)
        self._user_meta[user_id] = meta
        return was_offline

    def disconnect(self, user_id: str, ws: WebSocket) -> bool:
        s = self._sockets.get(user_id)
        if not s:
            return True
        s.discard(ws)
        if not s:
            self._sockets.pop(user_id, None)
            return True  # fully offline now
        return False

    def online_user_ids(self) -> List[str]:
        return [uid for uid, s in self._sockets.items() if s]

    def online_meta(self) -> List[Dict[str, Any]]:
        out = []
        for uid in self.online_user_ids():
            m = self._user_meta.get(uid, {})
            out.append({"id": uid, **m})
        return out

    async def send_to_user(self, user_id: str, message: Dict[str, Any]) -> None:
        sockets = list(self._sockets.get(user_id, set()))
        if not sockets:
            return
        text = json.dumps(message)
        dead: List[WebSocket] = []
        for ws in sockets:
            try:
                await ws.send_text(text)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(user_id, ws)

    async def broadcast(self, message: Dict[str, Any], exclude: Optional[Set[str]] = None) -> None:
        exclude = exclude or set()
        for uid in list(self._sockets.keys()):
            if uid in exclude:
                continue
            await self.send_to_user(uid, message)


connection_manager = ConnectionManager()


# ---------------------------------------------------------------------------
# Matchmaking
# ---------------------------------------------------------------------------


class MatchmakingQueue:
    """Mongo-backed queue keyed by rule_key and time_control.

    Each waiter is (user_id, rating, joined_at). On every find_match request
    we scan existing waiters and pair the first one within rating tolerance.
    Tolerance expands with wait time: ±200 base, +50 per extra second.
    """

    STALE_WAIT_SECONDS = 90
    STALE_CLAIM_SECONDS = 30

    def __init__(self) -> None:
        self._lock = asyncio.Lock()

    @staticmethod
    def _now() -> datetime:
        return datetime.now(timezone.utc)

    @staticmethod
    def _tolerance(joined_at: datetime) -> int:
        elapsed = (MatchmakingQueue._now() - joined_at).total_seconds()
        return min(200 + int(elapsed) * 50, 800)

    async def _cleanup(self, db: AsyncIOMotorDatabase, now: datetime) -> None:
        await db.online_matchmaking.delete_many(
            {
                "$or": [
                    {"status": "waiting", "expires_at": {"$lte": now}},
                    {
                        "status": {"$ne": "waiting"},
                        "updated_at": {"$lte": now - timedelta(seconds=self.STALE_CLAIM_SECONDS)},
                    },
                ]
            }
        )

    async def add_or_pair(
        self,
        db: AsyncIOMotorDatabase,
        user_id: str,
        rating: int,
        rule_key: str,
        time_control: str,
    ) -> Optional[Dict[str, Any]]:
        now = self._now()
        async with self._lock:
            await self._cleanup(db, now)
            await self.remove(db, user_id, rule_key)

            query = {
                "rule_key": rule_key,
                "time_control": time_control,
                "status": "waiting",
                "user_id": {"$ne": user_id},
            }
            cursor = db.online_matchmaking.find(query, {"_id": 0}).sort("joined_at", 1).limit(50)
            async for waiter in cursor:
                joined_at = _parse_dt(waiter.get("joined_at"), now)
                tolerance = max(self._tolerance(joined_at), 200)
                if abs(int(waiter.get("rating", 800)) - rating) > tolerance:
                    continue
                claimed = await db.online_matchmaking.find_one_and_update(
                    {"id": waiter["id"], "status": "waiting"},
                    {
                        "$set": {
                            "status": "paired",
                            "paired_by": user_id,
                            "updated_at": now,
                        }
                    },
                    projection={"_id": 0},
                    return_document=ReturnDocument.AFTER,
                )
                if claimed:
                    return claimed
            # No opponent, so publish this player for any backend worker.
            doc = {
                "id": f"{rule_key}:{time_control}:{user_id}",
                "user_id": user_id,
                "rating": rating,
                "rule_key": rule_key,
                "time_control": time_control,
                "status": "waiting",
                "joined_at": now,
                "updated_at": now,
                "expires_at": now + timedelta(seconds=self.STALE_WAIT_SECONDS),
            }
            await db.online_matchmaking.update_one(
                {"id": doc["id"]},
                {"$set": doc},
                upsert=True,
            )
            return None

    async def remove(
        self,
        db: AsyncIOMotorDatabase,
        user_id: str,
        rule_key: Optional[str] = None,
    ) -> None:
        query = {"user_id": user_id, "status": "waiting"}
        if rule_key:
            query["rule_key"] = rule_key
        await db.online_matchmaking.delete_many(query)


matchmaking = MatchmakingQueue()


# ---------------------------------------------------------------------------
# Live game manager
# ---------------------------------------------------------------------------


def _ai_opponent_rating_unused(_):  # pragma: no cover  # placeholder import alignment
    return 0


def _elo_delta(player_rating: int, opponent_rating: int, result: str, k: int = 32) -> int:
    score = {"win": 1.0, "draw": 0.5, "loss": 0.0}.get(result, 0.0)
    expected = 1.0 / (1.0 + 10 ** ((opponent_rating - player_rating) / 400))
    return int(round(k * (score - expected)))


def _parse_dt(value: Any, fallback: Optional[datetime] = None) -> datetime:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
        except Exception:
            pass
    return fallback or datetime.now(timezone.utc)


def _parse_time_control(value: Optional[str]) -> Dict[str, Any]:
    raw = (value or DEFAULT_TIME_CONTROL or "10+0").strip().lower()
    if raw in {"none", "untimed"}:
        return {"label": "untimed", "initial_ms": None, "increment_ms": 0}
    if raw == "casual":
        raw = DEFAULT_TIME_CONTROL or "10+0"

    presets = {
        "bullet": (60, 0),
        "blitz": (300, 0),
        "rapid": (600, 0),
        "classic": (900, 10),
    }
    if raw in presets:
        initial_seconds, increment_seconds = presets[raw]
        return {"label": raw, "initial_ms": initial_seconds * 1000, "increment_ms": increment_seconds * 1000}

    if "+" in raw:
        base, inc = raw.split("+", 1)
        base_num = float(base)
        inc_num = float(inc)
        initial_seconds = int(base_num * 60) if base_num <= 60 else int(base_num)
        return {
            "label": raw,
            "initial_ms": max(1, initial_seconds) * 1000,
            "increment_ms": max(0, int(inc_num * 1000)),
        }

    base_num = float(raw)
    initial_seconds = int(base_num * 60) if base_num <= 60 else int(base_num)
    return {"label": raw, "initial_ms": max(1, initial_seconds) * 1000, "increment_ms": 0}


def validate_time_control(value: Optional[str]) -> None:
    _parse_time_control(value)


class LiveGame:
    def __init__(
        self,
        game_id: str,
        white_id: str,
        black_id: str,
        white_rating: int,
        black_rating: int,
        rule_key: str = "classic",
        time_control: Optional[str] = None,
    ):
        self.id = game_id
        self.players = {"w": white_id, "b": black_id}
        self.player_rating = {"w": white_rating, "b": black_rating}
        self.rule_key = rule_key
        clock = _parse_time_control(time_control)
        self.time_control = clock["label"]
        self.clock_initial_ms: Optional[int] = clock["initial_ms"]
        self.clock_increment_ms: int = clock["increment_ms"]
        self.clock_remaining_ms: Dict[str, Optional[int]] = {
            "w": self.clock_initial_ms,
            "b": self.clock_initial_ms,
        }
        self.board = pychess.Board()
        self.moves_san: List[str] = []
        self.status = "ongoing"  # 'ongoing' | 'finished' | 'abandoned'
        self.created_at = datetime.now(timezone.utc)
        self.last_activity = self.created_at
        self.clock_updated_at = self.created_at
        # Disconnect tracking — user_id -> datetime of disconnect
        self.disconnected_at: Dict[str, datetime] = {}
        self.result: Optional[str] = None  # 'white' | 'black' | 'draw'
        self.reason: Optional[str] = None
        self.draw_offer_by: Optional[str] = None

    def opponent_id(self, user_id: str) -> Optional[str]:
        for c, uid in self.players.items():
            if uid != user_id:
                return uid
        return None

    def color_of(self, user_id: str) -> Optional[str]:
        for c, uid in self.players.items():
            if uid == user_id:
                return c
        return None

    @property
    def clocks_enabled(self) -> bool:
        return self.clock_initial_ms is not None

    def effective_clock_remaining_ms(self, now: Optional[datetime] = None) -> Dict[str, Optional[int]]:
        remaining = dict(self.clock_remaining_ms)
        if not self.clocks_enabled or self.status != "ongoing":
            return remaining
        now = now or datetime.now(timezone.utc)
        turn = "w" if self.board.turn else "b"
        current = remaining.get(turn)
        if current is None:
            return remaining
        elapsed_ms = max(0, int((now - self.clock_updated_at).total_seconds() * 1000))
        remaining[turn] = max(0, current - elapsed_ms)
        return remaining

    def flag_winner(self, now: Optional[datetime] = None) -> Optional[str]:
        if not self.clocks_enabled or self.status != "ongoing":
            return None
        turn = "w" if self.board.turn else "b"
        remaining = self.effective_clock_remaining_ms(now).get(turn)
        if remaining is not None and remaining <= 0:
            return "black" if turn == "w" else "white"
        return None

    def spend_turn_time(self, color: str, now: Optional[datetime] = None) -> bool:
        if not self.clocks_enabled:
            return True
        now = now or datetime.now(timezone.utc)
        remaining = self.effective_clock_remaining_ms(now)
        current = remaining.get(color)
        if current is None or current <= 0:
            self.clock_remaining_ms = remaining
            self.clock_updated_at = now
            return False
        remaining[color] = current + self.clock_increment_ms
        self.clock_remaining_ms = remaining
        self.clock_updated_at = now
        return True

    @classmethod
    def from_record(cls, record: Dict[str, Any]) -> "LiveGame":
        game = cls(
            str(record["id"]),
            str(record["white_id"]),
            str(record["black_id"]),
            int(record.get("white_rating", 800)),
            int(record.get("black_rating", 800)),
            record.get("rule_key", CLASSIC_RULE_KEY),
            record.get("time_control"),
        )
        game.moves_san = list(record.get("moves_san") or [])
        if game.moves_san:
            try:
                board = pychess.Board()
                for san in game.moves_san:
                    board.push_san(san)
                game.board = board
            except Exception:
                game.board = pychess.Board(record.get("fen") or pychess.STARTING_FEN)
        else:
            game.board = pychess.Board(record.get("fen") or pychess.STARTING_FEN)
        game.status = record.get("status", "ongoing")
        game.result = record.get("result")
        game.reason = record.get("reason")
        game.created_at = _parse_dt(record.get("created_at"), game.created_at)
        game.last_activity = _parse_dt(record.get("last_activity"), game.created_at)
        game.clock_updated_at = _parse_dt(record.get("clock_updated_at"), game.last_activity)
        game.clock_initial_ms = record.get("clock_initial_ms", game.clock_initial_ms)
        game.clock_increment_ms = int(record.get("clock_increment_ms", game.clock_increment_ms) or 0)
        clocks = record.get("clock_remaining_ms") or record.get("clocks_ms")
        if isinstance(clocks, dict):
            game.clock_remaining_ms = {
                "w": clocks.get("w") if clocks.get("w") is None else int(clocks.get("w")),
                "b": clocks.get("b") if clocks.get("b") is None else int(clocks.get("b")),
            }
        game.draw_offer_by = record.get("draw_offer_by")
        return game

    def to_dict(self) -> Dict[str, Any]:
        clocks = self.effective_clock_remaining_ms()
        draw_offer_color = self.color_of(self.draw_offer_by) if self.draw_offer_by else None
        return {
            "id": self.id,
            "white_id": self.players["w"],
            "black_id": self.players["b"],
            "white_rating": self.player_rating["w"],
            "black_rating": self.player_rating["b"],
            "fen": self.board.fen(),
            "turn": "w" if self.board.turn else "b",
            "moves_san": self.moves_san,
            "rule_key": self.rule_key,
            "time_control": self.time_control,
            "clock_initial_ms": self.clock_initial_ms,
            "clock_increment_ms": self.clock_increment_ms,
            "clock_remaining_ms": clocks,
            "clocks_ms": clocks,
            "clock_updated_at": self.clock_updated_at.isoformat(),
            "server_now": datetime.now(timezone.utc).isoformat(),
            "draw_offer_by": self.draw_offer_by,
            "draw_offer_color": draw_offer_color,
            "status": self.status,
            "result": self.result,
            "reason": self.reason,
            "created_at": self.created_at.isoformat(),
            "last_activity": self.last_activity.isoformat(),
        }


class GameManager:
    def __init__(self) -> None:
        self.games: Dict[str, LiveGame] = {}
        # user_id -> set of game_ids (a user may have at most 1 ongoing game in v1, but kept flexible)
        self.user_games: Dict[str, Set[str]] = {}
        self._lock = asyncio.Lock()

    async def create(
        self,
        white_id: str,
        black_id: str,
        white_rating: int,
        black_rating: int,
        rule_key: str = "classic",
        time_control: Optional[str] = None,
    ) -> LiveGame:
        async with self._lock:
            if white_id == black_id:
                raise ValueError("players must be different")
            for uid in (white_id, black_id):
                for gid in self.user_games.get(uid, set()):
                    g = self.games.get(gid)
                    if g and g.status == "ongoing":
                        raise ValueError("player already has an ongoing game")
            game_id = str(uuid.uuid4())
            g = LiveGame(game_id, white_id, black_id, white_rating, black_rating, rule_key, time_control)
            self.games[game_id] = g
            self.user_games.setdefault(white_id, set()).add(game_id)
            self.user_games.setdefault(black_id, set()).add(game_id)
            return g

    async def get(self, game_id: str) -> Optional[LiveGame]:
        return self.games.get(game_id)

    async def restore(self, game: LiveGame) -> LiveGame:
        async with self._lock:
            existing = self.games.get(game.id)
            if existing:
                return existing
            self.games[game.id] = game
            for uid in game.players.values():
                self.user_games.setdefault(uid, set()).add(game.id)
            return game

    async def remove(self, game_id: str) -> None:
        async with self._lock:
            g = self.games.pop(game_id, None)
            if not g:
                return
            for uid in g.players.values():
                ids = self.user_games.get(uid)
                if ids:
                    ids.discard(game_id)
                    if not ids:
                        self.user_games.pop(uid, None)

    async def active_for_user(self, user_id: str) -> Optional[LiveGame]:
        ids = self.user_games.get(user_id, set())
        for gid in ids:
            g = self.games.get(gid)
            if g and g.status == "ongoing":
                return g
        return None


games = GameManager()


# ---------------------------------------------------------------------------
# Persistence helpers
# ---------------------------------------------------------------------------


async def persist_game_record(db: AsyncIOMotorDatabase, game: LiveGame) -> None:
    await db.online_games.update_one(
        {"id": game.id},
        {
            "$set": {
                **game.to_dict(),
                "player_ids": [game.players["w"], game.players["b"]],
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        },
        upsert=True,
    )


async def has_ongoing_online_game(db: AsyncIOMotorDatabase, user_id: str) -> bool:
    if await games.active_for_user(user_id):
        return True
    existing = await db.online_games.find_one(
        {
            "status": "ongoing",
            "$or": [
                {"player_ids": user_id},
                {"white_id": user_id},
                {"black_id": user_id},
            ],
        },
        {"_id": 1},
    )
    return bool(existing)


async def persist_move(db: AsyncIOMotorDatabase, game_id: str, player_id: str, san: str, fen: str) -> None:
    await db.online_moves.insert_one({
        "id": str(uuid.uuid4()),
        "game_id": game_id,
        "player_id": player_id,
        "san": san,
        "fen": fen,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })


async def load_active_game_for_user(db: AsyncIOMotorDatabase, user_id: str) -> Optional[LiveGame]:
    active = await games.active_for_user(user_id)
    if active:
        return active
    record = await db.online_games.find_one(
        {
            "status": "ongoing",
            "$or": [
                {"player_ids": user_id},
                {"white_id": user_id},
                {"black_id": user_id},
            ],
        },
        {"_id": 0},
    )
    if not record:
        return None
    try:
        game = await games.restore(LiveGame.from_record(record))
    except Exception:
        logger.exception("failed to restore online game %s", record.get("id"))
        return None
    _schedule_clock_timeout(db, game)
    return game


async def load_game_by_id(db: AsyncIOMotorDatabase, game_id: str) -> Optional[LiveGame]:
    game = await games.get(game_id)
    if game:
        return game
    record = await db.online_games.find_one({"id": game_id, "status": "ongoing"}, {"_id": 0})
    if not record:
        return None
    try:
        game = await games.restore(LiveGame.from_record(record))
    except Exception:
        logger.exception("failed to restore online game %s", game_id)
        return None
    _schedule_clock_timeout(db, game)
    return game


async def finalize_game(
    db: AsyncIOMotorDatabase,
    game: LiveGame,
    result: str,  # 'white' | 'black' | 'draw'
    reason: str,
) -> Dict[str, Dict[str, int]]:
    """Mark game finished, update ELO of both users, write rating history.

    Returns rating change info: { white: {before, after, delta}, black: {...} }
    """
    white_id = game.players["w"]
    black_id = game.players["b"]
    white_rating = game.player_rating["w"]
    black_rating = game.player_rating["b"]

    if result == "white":
        white_score, black_score = "win", "loss"
    elif result == "black":
        white_score, black_score = "loss", "win"
    else:
        white_score = black_score = "draw"

    white_delta = _elo_delta(white_rating, black_rating, white_score)
    black_delta = _elo_delta(black_rating, white_rating, black_score)
    white_after = max(100, white_rating + white_delta)
    black_after = max(100, black_rating + black_delta)
    rating_changes = {
        "white": {"before": white_rating, "after": white_after, "delta": white_delta, "score": white_score},
        "black": {"before": black_rating, "after": black_after, "delta": black_delta, "score": black_score},
    }

    game.status = "finished"
    game.result = result
    game.reason = reason

    now_iso = datetime.now(timezone.utc).isoformat()
    claim = await db.online_games.update_one(
        {"id": game.id, "stats_finalized_at": {"$exists": False}},
        {
            "$set": {
                **game.to_dict(),
                "player_ids": [white_id, black_id],
                "rating_changes": rating_changes,
                "stats_finalized_at": now_iso,
                "updated_at": now_iso,
            }
        },
        upsert=False,
    )
    if claim.modified_count == 0:
        existing = await db.online_games.find_one({"id": game.id}, {"_id": 0, "rating_changes": 1})
        if existing and existing.get("rating_changes"):
            return existing["rating_changes"]
        if existing:
            return rating_changes
        try:
            await db.online_games.insert_one({
                **game.to_dict(),
                "player_ids": [white_id, black_id],
                "rating_changes": rating_changes,
                "stats_finalized_at": now_iso,
                "updated_at": now_iso,
            })
        except Exception:
            existing = await db.online_games.find_one({"id": game.id}, {"_id": 0, "rating_changes": 1})
            if existing and existing.get("rating_changes"):
                return existing["rating_changes"]
            return rating_changes

    # Update users
    async def _update(user_id: str, score: str, delta: int, before: int, after: int, opp_rating: int):
        result_field = {"win": "wins", "loss": "losses", "draw": "draws"}.get(score, "draws")
        xp = {"win": 35, "draw": 12, "loss": 5}.get(score, 0)
        coins = 15 if score == "win" else 3
        await db.users.update_one(
            {"id": user_id},
            {
                "$inc": {"xp": xp, "coins": coins, result_field: 1},
                "$set": {"elo": after},
            },
        )
        # Persist match doc compatible with profile screen
        match_id = str(uuid.uuid4())
        await db.matches.insert_one({
            "id": match_id,
            "user_id": user_id,
            "mode": "online",
            "rule_key": game.rule_key,
            "result": score,
            "moves_san": game.moves_san,
            "final_fen": game.board.fen(),
            "duration_seconds": int((datetime.now(timezone.utc) - game.created_at).total_seconds()),
            "ai_level": None,
            "xp_gain": xp,
            "coin_gain": coins,
            "elo_delta": delta,
            "rating_before": before,
            "rating_after": after,
            "opponent_rating": opp_rating,
            "online_game_id": game.id,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        await db.rating_history.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "match_id": match_id,
            "rating_before": before,
            "rating_after": after,
            "opponent_rating": opp_rating,
            "delta": delta,
            "result": score,
            "rule_key": game.rule_key,
            "online_game_id": game.id,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })

    await _update(white_id, white_score, white_delta, white_rating, white_after, black_rating)
    await _update(black_id, black_score, black_delta, black_rating, black_after, white_rating)

    return rating_changes


async def _broadcast_game_over(
    db: AsyncIOMotorDatabase,
    game: LiveGame,
    winner: str,
    reason: str,
) -> Dict[str, Dict[str, int]]:
    ratings = await finalize_game(db, game, winner, reason)
    for color_key, uid in game.players.items():
        user_score = ratings["white" if color_key == "w" else "black"]
        await connection_manager.send_to_user(uid, {
            "type": "game_over",
            "game_id": game.id,
            "result": user_score["score"],
            "reason": reason,
            "rating_before": user_score["before"],
            "rating_after": user_score["after"],
            "delta": user_score["delta"],
        })
    await games.remove(game.id)
    return ratings


async def _check_clock_timeout(db: AsyncIOMotorDatabase, game: LiveGame) -> bool:
    winner = game.flag_winner()
    if not winner:
        return False
    game.clock_remaining_ms = game.effective_clock_remaining_ms()
    game.clock_updated_at = datetime.now(timezone.utc)
    await _broadcast_game_over(db, game, winner, "Time forfeit")
    return True


def _schedule_clock_timeout(db: AsyncIOMotorDatabase, game: LiveGame) -> None:
    if not game.clocks_enabled or game.status != "ongoing":
        return
    turn = "w" if game.board.turn else "b"
    remaining = game.effective_clock_remaining_ms().get(turn)
    if remaining is None:
        return
    delay = max(0, remaining + CLOCK_GRACE_MS) / 1000
    asyncio.create_task(_clock_timeout_watch(db, game.id, delay))


def schedule_clock_timeout(db: AsyncIOMotorDatabase, game: LiveGame) -> None:
    _schedule_clock_timeout(db, game)


async def _clock_timeout_watch(db: AsyncIOMotorDatabase, game_id: str, delay: float) -> None:
    await asyncio.sleep(delay)
    game = await games.get(game_id)
    if not game or game.status != "ongoing":
        return
    await _check_clock_timeout(db, game)


# ---------------------------------------------------------------------------
# Notifications helper
# ---------------------------------------------------------------------------


async def push_notification(
    db: AsyncIOMotorDatabase,
    user_id: str,
    ntype: str,
    message: str,
    data: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "type": ntype,
        "message": message,
        "data": data or {},
        "is_read": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.notifications.insert_one(dict(doc))
    doc.pop("_id", None)
    # Live push if online
    await connection_manager.send_to_user(user_id, {"type": "notification", "notification": doc})
    return doc


# ---------------------------------------------------------------------------
# WebSocket router
# ---------------------------------------------------------------------------

ws_router = APIRouter()


def _decode_token(token: str) -> Optional[Dict[str, Any]]:
    try:
        return jwt.decode(token, os.environ["JWT_SECRET"], algorithms=[JWT_ALGORITHM])
    except Exception:
        return None


async def _send(ws: WebSocket, msg: Dict[str, Any]) -> None:
    try:
        await ws.send_text(json.dumps(msg))
    except Exception:
        pass


async def _broadcast_presence(db: AsyncIOMotorDatabase) -> None:
    """Broadcast minimal presence list to all connected clients."""
    online = connection_manager.online_meta()
    payload = {"type": "presence", "online": online}
    await connection_manager.broadcast(payload)


@ws_router.websocket("/api/ws")
async def ws_endpoint(websocket: WebSocket):
    # Extract token from query
    token = websocket.query_params.get("token")
    payload = _decode_token(token or "")
    if not payload:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    user_id: str = payload["sub"]
    db = websocket.app.state.db
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    if not user:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await websocket.accept()
    meta = {
        "id": user["id"],
        "name": user.get("name", "Player"),
        "elo": int(user.get("elo", 800)),
        "is_guest": bool(user.get("is_guest", False)),
    }
    became_online = await connection_manager.connect(user_id, websocket, meta)

    # If user has an active game and was disconnected — clear their disconnect timer & resync
    active = await load_active_game_for_user(db, user_id)
    if active and user_id in active.disconnected_at:
        active.disconnected_at.pop(user_id, None)
        opp = active.opponent_id(user_id)
        if opp:
            await connection_manager.send_to_user(opp, {
                "type": "opponent_reconnected",
                "game_id": active.id,
            })

    # Initial state
    await _send(websocket, {"type": "hello", "user": meta})
    if active:
        if await _check_clock_timeout(db, active):
            active = None
    if active:
        await _send(websocket, {
            "type": "game_state",
            "game": active.to_dict(),
            "your_color": active.color_of(user_id),
        })
    await _broadcast_presence(db)

    try:
        while True:
            try:
                raw = await websocket.receive_text()
            except WebSocketDisconnect:
                break
            try:
                msg = json.loads(raw)
            except Exception:
                await _send(websocket, {"type": "error", "error": "invalid json"})
                continue

            mtype = msg.get("type")
            try:
                if mtype == "ping":
                    await _send(websocket, {"type": "pong"})
                elif mtype == "find_match":
                    await _handle_find_match(db, user_id, msg, websocket)
                elif mtype == "cancel_match":
                    await matchmaking.remove(db, user_id)
                    await _send(websocket, {"type": "match_cancelled"})
                elif mtype == "make_move":
                    await _handle_make_move(db, user_id, msg, websocket)
                elif mtype == "resign":
                    await _handle_resign(db, user_id, msg, websocket)
                elif mtype in {"draw_offer", "offer_draw"}:
                    await _handle_draw_offer(db, user_id, msg, websocket)
                elif mtype in {"draw_accept", "accept_draw"}:
                    await _handle_draw_accept(db, user_id, msg, websocket)
                elif mtype in {"draw_decline", "decline_draw"}:
                    await _handle_draw_decline(db, user_id, msg, websocket)
                elif mtype == "request_game_state":
                    g = await load_game_by_id(db, msg.get("game_id", ""))
                    if g and user_id in g.players.values():
                        if await _check_clock_timeout(db, g):
                            continue
                        await _send(websocket, {
                            "type": "game_state",
                            "game": g.to_dict(),
                            "your_color": g.color_of(user_id),
                        })
                else:
                    await _send(websocket, {"type": "error", "error": f"unknown type: {mtype}"})
            except Exception as e:
                logger.exception("ws handler error")
                await _send(websocket, {"type": "error", "error": str(e)})
    finally:
        fully_offline = connection_manager.disconnect(user_id, websocket)
        await matchmaking.remove(db, user_id)
        if fully_offline:
            # Mark disconnect time on any active game; abandonment grace 30s
            g = await games.active_for_user(user_id)
            if g:
                g.disconnected_at[user_id] = datetime.now(timezone.utc)
                opp = g.opponent_id(user_id)
                if opp:
                    await connection_manager.send_to_user(opp, {
                        "type": "opponent_disconnected",
                        "game_id": g.id,
                        "grace_seconds": 30,
                    })
                # Schedule abandonment check
                asyncio.create_task(_abandonment_watch(db, g.id, user_id))
            await _broadcast_presence(db)


async def _handle_find_match(db, user_id: str, msg: Dict[str, Any], ws: WebSocket) -> None:
    rule_key = msg.get("rule_key", CLASSIC_RULE_KEY)
    if rule_key != CLASSIC_RULE_KEY:
        await _send(ws, {"type": "error", "error": "online multiplayer currently supports classic only"})
        return
    time_control = msg.get("time_control") or DEFAULT_TIME_CONTROL
    try:
        _parse_time_control(time_control)
    except Exception:
        await _send(ws, {"type": "error", "error": "invalid time control"})
        return
    if await has_ongoing_online_game(db, user_id):
        await matchmaking.remove(db, user_id)
        await _send(ws, {"type": "error", "error": "already in an ongoing game"})
        return
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "name": 1, "elo": 1})
    if not user:
        await _send(ws, {"type": "error", "error": "user not found"})
        return
    rating = int(user.get("elo", 800))
    opp = await matchmaking.add_or_pair(db, user_id, rating, rule_key, time_control)
    if not opp:
        await _send(ws, {"type": "searching", "rule_key": rule_key, "time_control": time_control})
        return
    if await has_ongoing_online_game(db, user_id) or await has_ongoing_online_game(db, opp["user_id"]):
        await matchmaking.remove(db, user_id)
        await matchmaking.remove(db, opp["user_id"])
        await _send(ws, {"type": "error", "error": "player already has an ongoing game"})
        return
    # Pair found — randomly assign colors
    import random
    if random.random() < 0.5:
        white_id, black_id = user_id, opp["user_id"]
        white_rating, black_rating = rating, opp["rating"]
    else:
        white_id, black_id = opp["user_id"], user_id
        white_rating, black_rating = opp["rating"], rating
    game = None
    try:
        game = await games.create(white_id, black_id, white_rating, black_rating, rule_key=rule_key, time_control=time_control)
        await persist_game_record(db, game)
    except Exception:
        if game:
            await games.remove(game.id)
        logger.exception("failed to create online match")
        await _send(ws, {"type": "error", "error": "player already has an ongoing game"})
        return

    white_user = await db.users.find_one({"id": white_id}, {"_id": 0, "name": 1, "elo": 1})
    black_user = await db.users.find_one({"id": black_id}, {"_id": 0, "name": 1, "elo": 1})

    base = {
        "type": "match_found",
        "game_id": game.id,
        "rule_key": rule_key,
        "time_control": game.time_control,
        "fen": game.board.fen(),
        "clock_initial_ms": game.clock_initial_ms,
        "clock_increment_ms": game.clock_increment_ms,
        "clock_remaining_ms": game.effective_clock_remaining_ms(),
        "white": {"id": white_id, "name": white_user.get("name", "Player"), "elo": white_rating},
        "black": {"id": black_id, "name": black_user.get("name", "Player"), "elo": black_rating},
    }
    await connection_manager.send_to_user(white_id, {**base, "your_color": "w"})
    await connection_manager.send_to_user(black_id, {**base, "your_color": "b"})
    _schedule_clock_timeout(db, game)


async def _handle_make_move(db, user_id: str, msg: Dict[str, Any], ws: WebSocket) -> None:
    game_id = msg.get("game_id")
    g = await games.get(game_id) if game_id else None
    if not g or g.status != "ongoing":
        await _send(ws, {"type": "error", "error": "no active game"})
        return
    color = g.color_of(user_id)
    if not color:
        await _send(ws, {"type": "error", "error": "you are not in this game"})
        return
    expected = "w" if g.board.turn else "b"
    if color != expected:
        await _send(ws, {"type": "error", "error": "not your turn"})
        return
    if await _check_clock_timeout(db, g):
        return

    from_sq = msg.get("from")
    to_sq = msg.get("to")
    promo = msg.get("promotion") or "q"
    if not from_sq or not to_sq:
        await _send(ws, {"type": "error", "error": "missing from/to"})
        return

    uci = f"{from_sq}{to_sq}"
    # Promotion uci has 5 chars
    try:
        # Try plain move first
        move = pychess.Move.from_uci(uci)
        if move not in g.board.legal_moves:
            move = pychess.Move.from_uci(uci + promo)
    except Exception:
        try:
            move = pychess.Move.from_uci(uci + promo)
        except Exception:
            move = None
    if move is None or move not in g.board.legal_moves:
        await _send(ws, {"type": "error", "error": "illegal move"})
        return

    if not g.spend_turn_time(color):
        await _broadcast_game_over(db, g, "black" if color == "w" else "white", "Time forfeit")
        return
    san = g.board.san(move)
    g.board.push(move)
    g.moves_san.append(san)
    g.last_activity = datetime.now(timezone.utc)
    if g.draw_offer_by and g.draw_offer_by != user_id:
        g.draw_offer_by = None
    await persist_move(db, g.id, user_id, san, g.board.fen())
    await persist_game_record(db, g)

    payload = {
        "type": "move",
        "game_id": g.id,
        "from": from_sq,
        "to": to_sq,
        "san": san,
        "fen": g.board.fen(),
        "moves_san": g.moves_san,
        "turn": "w" if g.board.turn else "b",
        "by": color,
        "is_check": g.board.is_check(),
        "clock_remaining_ms": g.effective_clock_remaining_ms(),
        "clocks_ms": g.effective_clock_remaining_ms(),
        "server_now": datetime.now(timezone.utc).isoformat(),
        "draw_offer_by": g.draw_offer_by,
        "draw_offer_color": g.color_of(g.draw_offer_by) if g.draw_offer_by else None,
    }
    for uid in g.players.values():
        await connection_manager.send_to_user(uid, payload)

    # Check terminal state
    if g.board.is_game_over():
        if g.board.is_checkmate():
            winner = "white" if not g.board.turn else "black"  # side to move is mated
            # Actually if it's white's turn and checkmate -> white was mated -> winner is black
            winner = "black" if g.board.turn else "white"
            reason = "Checkmate"
        elif g.board.is_stalemate():
            winner = "draw"
            reason = "Stalemate"
        elif g.board.is_insufficient_material():
            winner = "draw"
            reason = "Insufficient material"
        elif g.board.can_claim_threefold_repetition() or g.board.can_claim_fifty_moves():
            winner = "draw"
            reason = "Draw rule"
        else:
            winner = "draw"
            reason = "Draw"

        await _broadcast_game_over(db, g, winner, reason)
    else:
        _schedule_clock_timeout(db, g)


async def _handle_resign(db, user_id: str, msg: Dict[str, Any], ws: WebSocket) -> None:
    game_id = msg.get("game_id")
    g = await games.get(game_id) if game_id else None
    if not g or g.status != "ongoing":
        await _send(ws, {"type": "error", "error": "no active game"})
        return
    color = g.color_of(user_id)
    if not color:
        await _send(ws, {"type": "error", "error": "not in this game"})
        return
    if await _check_clock_timeout(db, g):
        return
    winner = "black" if color == "w" else "white"
    await _broadcast_game_over(db, g, winner, "Resignation")


async def _get_user_game_from_msg(db, user_id: str, msg: Dict[str, Any]) -> Optional[LiveGame]:
    game_id = msg.get("game_id")
    game = await load_game_by_id(db, game_id) if game_id else await load_active_game_for_user(db, user_id)
    if not game or game.status != "ongoing" or user_id not in game.players.values():
        return None
    return game


async def _handle_draw_offer(db, user_id: str, msg: Dict[str, Any], ws: WebSocket) -> None:
    g = await _get_user_game_from_msg(db, user_id, msg)
    if not g:
        await _send(ws, {"type": "error", "error": "no active game"})
        return
    if await _check_clock_timeout(db, g):
        return
    g.draw_offer_by = user_id
    g.last_activity = datetime.now(timezone.utc)
    await persist_game_record(db, g)
    payload = {
        "type": "draw_offered",
        "game_id": g.id,
        "by": g.color_of(user_id),
        "by_user_id": user_id,
        "game": g.to_dict(),
    }
    for uid in g.players.values():
        await connection_manager.send_to_user(uid, payload)


async def _handle_draw_accept(db, user_id: str, msg: Dict[str, Any], ws: WebSocket) -> None:
    g = await _get_user_game_from_msg(db, user_id, msg)
    if not g:
        await _send(ws, {"type": "error", "error": "no active game"})
        return
    if await _check_clock_timeout(db, g):
        return
    if not g.draw_offer_by:
        await _send(ws, {"type": "error", "error": "no draw offer pending"})
        return
    if g.draw_offer_by == user_id:
        await _send(ws, {"type": "error", "error": "cannot accept your own draw offer"})
        return
    g.draw_offer_by = None
    await _broadcast_game_over(db, g, "draw", "Draw agreed")


async def _handle_draw_decline(db, user_id: str, msg: Dict[str, Any], ws: WebSocket) -> None:
    g = await _get_user_game_from_msg(db, user_id, msg)
    if not g:
        await _send(ws, {"type": "error", "error": "no active game"})
        return
    if not g.draw_offer_by:
        await _send(ws, {"type": "error", "error": "no draw offer pending"})
        return
    if g.draw_offer_by == user_id:
        await _send(ws, {"type": "error", "error": "cannot decline your own draw offer"})
        return
    g.draw_offer_by = None
    g.last_activity = datetime.now(timezone.utc)
    await persist_game_record(db, g)
    payload = {
        "type": "draw_declined",
        "game_id": g.id,
        "by": g.color_of(user_id),
        "by_user_id": user_id,
        "game": g.to_dict(),
    }
    for uid in g.players.values():
        await connection_manager.send_to_user(uid, payload)


async def _abandonment_watch(db, game_id: str, user_id: str) -> None:
    """Wait 30 s; if user is still disconnected, abandon the game in opponent's favor."""
    await asyncio.sleep(30)
    g = await games.get(game_id)
    if not g or g.status != "ongoing":
        return
    if user_id not in g.disconnected_at:
        return  # reconnected
    # Opponent wins
    color = g.color_of(user_id)
    winner = "black" if color == "w" else "white"
    await _broadcast_game_over(db, g, winner, "Opponent abandoned")


# ---------------------------------------------------------------------------
# REST helpers (used by social router for cross-module access)
# ---------------------------------------------------------------------------


def is_online(user_id: str) -> bool:
    return user_id in connection_manager._sockets and bool(connection_manager._sockets[user_id])


async def notify_user(db, user_id: str, ntype: str, message: str, data: Optional[Dict[str, Any]] = None):
    return await push_notification(db, user_id, ntype, message, data)
