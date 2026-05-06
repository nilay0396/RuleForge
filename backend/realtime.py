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
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set

import chess as pychess
import jwt
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status
from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger("ruleforge.realtime")

JWT_ALGORITHM = "HS256"

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
    """Simple in-memory queue keyed by rule_key.

    Each waiter is (user_id, rating, joined_at). On every find_match request
    we scan existing waiters and pair the first one within rating tolerance.
    Tolerance expands with wait time: ±200 base, +50 per extra second.
    """

    def __init__(self) -> None:
        self._waiters: Dict[str, List[Dict[str, Any]]] = {}
        self._lock = asyncio.Lock()

    @staticmethod
    def _now() -> datetime:
        return datetime.now(timezone.utc)

    @staticmethod
    def _tolerance(joined_at: datetime) -> int:
        elapsed = (MatchmakingQueue._now() - joined_at).total_seconds()
        return min(200 + int(elapsed) * 50, 800)

    async def add_or_pair(
        self, user_id: str, rating: int, rule_key: str
    ) -> Optional[Dict[str, Any]]:
        async with self._lock:
            queue = self._waiters.setdefault(rule_key, [])
            # Scan for an opponent
            for i, w in enumerate(queue):
                if w["user_id"] == user_id:
                    continue
                tol = max(self._tolerance(w["joined_at"]), 200)
                if abs(w["rating"] - rating) <= tol:
                    queue.pop(i)
                    return w
            # No opponent — add self
            # Remove any stale entry for this user, then append
            queue[:] = [w for w in queue if w["user_id"] != user_id]
            queue.append({"user_id": user_id, "rating": rating, "joined_at": self._now()})
            return None

    async def remove(self, user_id: str, rule_key: Optional[str] = None) -> None:
        async with self._lock:
            keys = [rule_key] if rule_key else list(self._waiters.keys())
            for k in keys:
                q = self._waiters.get(k)
                if not q:
                    continue
                q[:] = [w for w in q if w["user_id"] != user_id]


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
        self.time_control = time_control or "casual"
        self.board = pychess.Board()
        self.moves_san: List[str] = []
        self.status = "ongoing"  # 'ongoing' | 'finished' | 'abandoned'
        self.created_at = datetime.now(timezone.utc)
        self.last_activity = self.created_at
        # Disconnect tracking — user_id -> datetime of disconnect
        self.disconnected_at: Dict[str, datetime] = {}
        self.result: Optional[str] = None  # 'white' | 'black' | 'draw'
        self.reason: Optional[str] = None

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

    def to_dict(self) -> Dict[str, Any]:
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
            "status": self.status,
            "result": self.result,
            "reason": self.reason,
            "created_at": self.created_at.isoformat(),
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
            game_id = str(uuid.uuid4())
            g = LiveGame(game_id, white_id, black_id, white_rating, black_rating, rule_key, time_control)
            self.games[game_id] = g
            self.user_games.setdefault(white_id, set()).add(game_id)
            self.user_games.setdefault(black_id, set()).add(game_id)
            return g

    async def get(self, game_id: str) -> Optional[LiveGame]:
        return self.games.get(game_id)

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
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        },
        upsert=True,
    )


async def persist_move(db: AsyncIOMotorDatabase, game_id: str, player_id: str, san: str, fen: str) -> None:
    await db.online_moves.insert_one({
        "id": str(uuid.uuid4()),
        "game_id": game_id,
        "player_id": player_id,
        "san": san,
        "fen": fen,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })


async def finalize_game(
    db: AsyncIOMotorDatabase,
    game: LiveGame,
    result: str,  # 'white' | 'black' | 'draw'
    reason: str,
) -> Dict[str, Dict[str, int]]:
    """Mark game finished, update ELO of both users, write rating history.

    Returns rating change info: { white: {before, after, delta}, black: {...} }
    """
    game.status = "finished"
    game.result = result
    game.reason = reason

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
    await persist_game_record(db, game)

    return {
        "white": {"before": white_rating, "after": white_after, "delta": white_delta, "score": white_score},
        "black": {"before": black_rating, "after": black_after, "delta": black_delta, "score": black_score},
    }


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
    active = await games.active_for_user(user_id)
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
                    await matchmaking.remove(user_id)
                    await _send(websocket, {"type": "match_cancelled"})
                elif mtype == "make_move":
                    await _handle_make_move(db, user_id, msg, websocket)
                elif mtype == "resign":
                    await _handle_resign(db, user_id, msg, websocket)
                elif mtype == "request_game_state":
                    g = await games.get(msg.get("game_id", ""))
                    if g and user_id in g.players.values():
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
        await matchmaking.remove(user_id)
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
    rule_key = msg.get("rule_key", "classic")
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "name": 1, "elo": 1})
    if not user:
        await _send(ws, {"type": "error", "error": "user not found"})
        return
    rating = int(user.get("elo", 800))
    opp = await matchmaking.add_or_pair(user_id, rating, rule_key)
    if not opp:
        await _send(ws, {"type": "searching", "rule_key": rule_key})
        return
    # Pair found — randomly assign colors
    import random
    if random.random() < 0.5:
        white_id, black_id = user_id, opp["user_id"]
        white_rating, black_rating = rating, opp["rating"]
    else:
        white_id, black_id = opp["user_id"], user_id
        white_rating, black_rating = opp["rating"], rating
    game = await games.create(white_id, black_id, white_rating, black_rating, rule_key=rule_key)
    await persist_game_record(db, game)

    white_user = await db.users.find_one({"id": white_id}, {"_id": 0, "name": 1, "elo": 1})
    black_user = await db.users.find_one({"id": black_id}, {"_id": 0, "name": 1, "elo": 1})

    base = {
        "type": "match_found",
        "game_id": game.id,
        "rule_key": rule_key,
        "fen": game.board.fen(),
        "white": {"id": white_id, "name": white_user.get("name", "Player"), "elo": white_rating},
        "black": {"id": black_id, "name": black_user.get("name", "Player"), "elo": black_rating},
    }
    await connection_manager.send_to_user(white_id, {**base, "your_color": "w"})
    await connection_manager.send_to_user(black_id, {**base, "your_color": "b"})


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

    san = g.board.san(move)
    g.board.push(move)
    g.moves_san.append(san)
    g.last_activity = datetime.now(timezone.utc)
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

        ratings = await finalize_game(db, g, winner, reason)
        for color_key, uid in g.players.items():
            user_score = ratings["white" if color_key == "w" else "black"]
            await connection_manager.send_to_user(uid, {
                "type": "game_over",
                "game_id": g.id,
                "result": user_score["score"],  # 'win' | 'loss' | 'draw'
                "reason": reason,
                "rating_before": user_score["before"],
                "rating_after": user_score["after"],
                "delta": user_score["delta"],
            })
        await games.remove(g.id)


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
    winner = "black" if color == "w" else "white"
    ratings = await finalize_game(db, g, winner, "Resignation")
    for color_key, uid in g.players.items():
        user_score = ratings["white" if color_key == "w" else "black"]
        await connection_manager.send_to_user(uid, {
            "type": "game_over",
            "game_id": g.id,
            "result": user_score["score"],
            "reason": "Resignation",
            "rating_before": user_score["before"],
            "rating_after": user_score["after"],
            "delta": user_score["delta"],
        })
    await games.remove(g.id)


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
    ratings = await finalize_game(db, g, winner, "Opponent abandoned")
    for color_key, uid in g.players.items():
        user_score = ratings["white" if color_key == "w" else "black"]
        await connection_manager.send_to_user(uid, {
            "type": "game_over",
            "game_id": g.id,
            "result": user_score["score"],
            "reason": "Opponent abandoned",
            "rating_before": user_score["before"],
            "rating_after": user_score["after"],
            "delta": user_score["delta"],
        })
    await games.remove(g.id)


# ---------------------------------------------------------------------------
# REST helpers (used by social router for cross-module access)
# ---------------------------------------------------------------------------


def is_online(user_id: str) -> bool:
    return user_id in connection_manager._sockets and bool(connection_manager._sockets[user_id])


async def notify_user(db, user_id: str, ntype: str, message: str, data: Optional[Dict[str, Any]] = None):
    return await push_notification(db, user_id, ntype, message, data)
