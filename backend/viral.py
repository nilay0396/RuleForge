"""Viral / scale layer: tournaments, spectator mode, badges, featured players,
share cards. All collections are uuid-keyed; relies on retention.public_user
for user serialization.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Set

from fastapi import APIRouter, Depends, HTTPException, Request, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

BLITZ_DURATION_MIN = 10
TOURNAMENT_WIN_POINTS = 3
TOURNAMENT_DRAW_POINTS = 1
TOURNAMENT_LOSS_POINTS = 0


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _now_iso() -> str:
    return _now().isoformat()


# ---------------------------------------------------------------------------
# Default badges
# ---------------------------------------------------------------------------

SEED_BADGES: List[Dict[str, Any]] = [
    {"key": "first_win", "name": "First Blood", "description": "Win your first match.", "icon": "🩸"},
    {"key": "ten_wins", "name": "Ten Wins", "description": "Win 10 matches total.", "icon": "🏆"},
    {"key": "fifty_wins", "name": "Half-Century", "description": "Win 50 matches.", "icon": "⚔️"},
    {"key": "rule_breaker", "name": "Rule Breaker", "description": "Win in any custom rule variant.", "icon": "🧩"},
    {"key": "streak_5", "name": "Five-Day Flame", "description": "Login streak of 5 days.", "icon": "🔥"},
    {"key": "streak_30", "name": "Monthly Devotion", "description": "Login streak of 30 days.", "icon": "📆"},
    {"key": "puzzle_solver", "name": "Tactic Hunter", "description": "Solve 25 puzzles.", "icon": "🧠"},
    {"key": "tournament_join", "name": "Arena Debut", "description": "Join your first tournament.", "icon": "🎯"},
    {"key": "tournament_top3", "name": "Podium", "description": "Top 3 finish in any tournament.", "icon": "🥉"},
    {"key": "tournament_winner", "name": "Champion", "description": "Win a tournament.", "icon": "🥇"},
    {"key": "spectator", "name": "Connoisseur", "description": "Watch 5 live games.", "icon": "👁️"},
]


async def seed_badges(db) -> None:
    for b in SEED_BADGES:
        await db.badges.update_one(
            {"key": b["key"]},
            {"$setOnInsert": {**b, "id": str(uuid.uuid4()), "created_at": _now_iso()}},
            upsert=True,
        )


async def seed_demo_tournaments(db) -> None:
    """Ensure at least 1 live tournament + 2 upcoming exist for demo purposes."""
    now = _now()
    live_count = await db.tournaments.count_documents({"status": "live"})
    if live_count == 0:
        await db.tournaments.insert_one({
            "id": str(uuid.uuid4()),
            "name": "Daily Blitz Arena",
            "type": "blitz_arena",
            "description": "Open 10-min arena. Win matches to climb the live leaderboard.",
            "start_time": (now - timedelta(minutes=2)).isoformat(),
            "end_time": (now + timedelta(minutes=BLITZ_DURATION_MIN * 6)).isoformat(),
            "status": "live",
            "prize_coins": 500,
            "rule_key": "classic",
            "time_control_seconds": 180,
            "created_at": _now_iso(),
        })
    upcoming_count = await db.tournaments.count_documents({"status": "upcoming"})
    if upcoming_count < 2:
        for i, hours in enumerate([2, 6]):
            await db.tournaments.insert_one({
                "id": str(uuid.uuid4()),
                "name": ["Evening Power Pawns Cup", "Late-Night Swap Move Showdown"][i],
                "type": "blitz_arena",
                "description": ["Pawns can move 2 squares anytime. Tactics get wild.",
                                "Force your opponent to swap. Confusion guaranteed."][i],
                "start_time": (now + timedelta(hours=hours)).isoformat(),
                "end_time": (now + timedelta(hours=hours, minutes=BLITZ_DURATION_MIN * 4)).isoformat(),
                "status": "upcoming",
                "prize_coins": [300, 400][i],
                "rule_key": ["power_pawns", "swap_move"][i],
                "time_control_seconds": 180,
                "created_at": _now_iso(),
            })


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _award_badge(db, user_id: str, badge_key: str, push_fn=None) -> Optional[Dict[str, Any]]:
    badge = await db.badges.find_one({"key": badge_key}, {"_id": 0})
    if not badge:
        return None
    existing = await db.user_badges.find_one({"user_id": user_id, "badge_id": badge["id"]})
    if existing:
        return None
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "badge_id": badge["id"],
        "badge_key": badge["key"],
        "earned_at": _now_iso(),
    }
    await db.user_badges.insert_one(doc)
    # Mirror into users.badges array for legacy compatibility
    await db.users.update_one(
        {"id": user_id, "badges": {"$ne": badge["key"]}},
        {"$push": {"badges": badge["key"]}},
    )
    if push_fn:
        try:
            await push_fn(user_id, {
                "type": "badge_earned",
                "badge": badge,
            })
        except Exception:
            pass
    return badge


async def _refresh_tournament_status(db, tournament: Dict[str, Any]) -> Dict[str, Any]:
    now = _now()
    start = datetime.fromisoformat(tournament["start_time"])
    end = datetime.fromisoformat(tournament["end_time"])
    new_status = tournament["status"]
    if tournament["status"] == "upcoming" and now >= start:
        new_status = "live"
    if tournament["status"] in ("upcoming", "live") and now >= end:
        new_status = "finished"
    if new_status != tournament["status"]:
        await db.tournaments.update_one({"id": tournament["id"]}, {"$set": {"status": new_status}})
        tournament["status"] = new_status
    return tournament


async def _public_tournament(db, t: Dict[str, Any], user_id: Optional[str] = None) -> Dict[str, Any]:
    t = await _refresh_tournament_status(db, t)
    players = await db.tournament_players.count_documents({"tournament_id": t["id"]})
    joined = False
    if user_id:
        joined = bool(await db.tournament_players.find_one(
            {"tournament_id": t["id"], "user_id": user_id}
        ))
    out = {k: v for k, v in t.items() if k != "_id"}
    out["players"] = players
    out["joined"] = joined
    return out


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------


class TournamentMatchIn(BaseModel):
    opponent_id: str
    result: str = Field(..., pattern="^(win|loss|draw)$")


# ---------------------------------------------------------------------------
# Live games registry (in-process; backed by realtime.rooms)
# ---------------------------------------------------------------------------


class LiveRegistry:
    """Lightweight registry for spectators. Wired to realtime.rooms (game_id -> room).
    Stores spectator-only websocket sets keyed by game_id."""

    def __init__(self):
        self.spectators: Dict[str, Set[WebSocket]] = {}

    def add(self, game_id: str, ws: WebSocket):
        self.spectators.setdefault(game_id, set()).add(ws)

    def remove(self, game_id: str, ws: WebSocket):
        if game_id in self.spectators:
            self.spectators[game_id].discard(ws)
            if not self.spectators[game_id]:
                self.spectators.pop(game_id, None)

    def count(self, game_id: str) -> int:
        return len(self.spectators.get(game_id, set()))

    async def broadcast(self, game_id: str, message: Dict[str, Any]):
        ws_set = list(self.spectators.get(game_id, set()))
        for ws in ws_set:
            try:
                await ws.send_json(message)
            except Exception:
                self.remove(game_id, ws)


live_registry = LiveRegistry()


# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------


def make_viral_router(current_user_dep, db_getter, push_notification_fn=None,
                     get_realtime_rooms=None):
    """`get_realtime_rooms` is a callable returning the live `rooms` dict
    from realtime.py (game_id -> {white_user, black_user, fen, last_move, ...}).
    """
    router = APIRouter()

    # ---------------- Tournaments ----------------
    @router.get("/tournaments")
    async def list_tournaments(
        request: Request,
        scope: str = "all",  # all | live | upcoming | finished
        user: Dict[str, Any] = Depends(current_user_dep),
    ):
        db = db_getter(request)
        # Auto-promote statuses on read
        rows = await db.tournaments.find({}, {"_id": 0}).sort("start_time", 1).to_list(50)
        rows = [await _public_tournament(db, t, user["id"]) for t in rows]
        if scope != "all":
            rows = [t for t in rows if t["status"] == scope]
        return {"tournaments": rows}

    @router.get("/tournaments/{tid}")
    async def tournament_detail(
        tid: str,
        request: Request,
        user: Dict[str, Any] = Depends(current_user_dep),
    ):
        db = db_getter(request)
        t = await db.tournaments.find_one({"id": tid}, {"_id": 0})
        if not t:
            raise HTTPException(404, "Tournament not found")
        t = await _public_tournament(db, t, user["id"])
        leaders = await _tournament_leaderboard(db, tid, limit=20)
        my_rank = None
        for idx, row in enumerate(leaders):
            if row["user_id"] == user["id"]:
                my_rank = idx + 1
                break
        return {"tournament": t, "leaderboard": leaders, "my_rank": my_rank}

    @router.post("/tournaments/{tid}/join")
    async def join_tournament(
        tid: str,
        request: Request,
        user: Dict[str, Any] = Depends(current_user_dep),
    ):
        db = db_getter(request)
        t = await db.tournaments.find_one({"id": tid}, {"_id": 0})
        if not t:
            raise HTTPException(404, "Tournament not found")
        await _refresh_tournament_status(db, t)
        if t["status"] not in ("upcoming", "live"):
            raise HTTPException(400, "Tournament is not open for entries")
        existing = await db.tournament_players.find_one({"tournament_id": tid, "user_id": user["id"]})
        if existing:
            return {"ok": True, "already_joined": True}
        await db.tournament_players.insert_one({
            "id": str(uuid.uuid4()),
            "tournament_id": tid,
            "user_id": user["id"],
            "name": user.get("name", "Player"),
            "score": 0,
            "wins": 0,
            "losses": 0,
            "draws": 0,
            "joined_at": _now_iso(),
            "last_match_at": None,
        })
        await _award_badge(db, user["id"], "tournament_join", push_notification_fn)
        return {"ok": True, "joined": True}

    @router.post("/tournaments/{tid}/leave")
    async def leave_tournament(
        tid: str,
        request: Request,
        user: Dict[str, Any] = Depends(current_user_dep),
    ):
        db = db_getter(request)
        res = await db.tournament_players.delete_one({"tournament_id": tid, "user_id": user["id"]})
        return {"ok": True, "deleted": res.deleted_count}

    @router.get("/tournaments/{tid}/leaderboard")
    async def tournament_leaderboard(
        tid: str,
        request: Request,
        limit: int = 50,
        _: Dict[str, Any] = Depends(current_user_dep),
    ):
        db = db_getter(request)
        rows = await _tournament_leaderboard(db, tid, limit=limit)
        return {"leaderboard": rows}

    @router.post("/tournaments/{tid}/report-match")
    async def report_tournament_match(
        tid: str,
        payload: TournamentMatchIn,
        request: Request,
        user: Dict[str, Any] = Depends(current_user_dep),
    ):
        db = db_getter(request)
        t = await db.tournaments.find_one({"id": tid}, {"_id": 0})
        if not t:
            raise HTTPException(404, "Tournament not found")
        if t["status"] != "live":
            raise HTTPException(400, "Tournament is not live")
        tp = await db.tournament_players.find_one({"tournament_id": tid, "user_id": user["id"]})
        if not tp:
            raise HTTPException(403, "You haven't joined this tournament")

        pts = TOURNAMENT_WIN_POINTS if payload.result == "win" else (
            TOURNAMENT_DRAW_POINTS if payload.result == "draw" else TOURNAMENT_LOSS_POINTS
        )
        result_field = {"win": "wins", "loss": "losses", "draw": "draws"}[payload.result]
        await db.tournament_players.update_one(
            {"tournament_id": tid, "user_id": user["id"]},
            {
                "$inc": {"score": pts, result_field: 1},
                "$set": {"last_match_at": _now_iso()},
            },
        )
        # Check for winner badge if tournament has ended after this report
        await _refresh_tournament_status(db, t)
        if t["status"] == "finished":
            await _maybe_award_winner_badges(db, tid, push_notification_fn)
        updated = await db.tournament_players.find_one(
            {"tournament_id": tid, "user_id": user["id"]}, {"_id": 0}
        )
        return {"ok": True, "score_added": pts, "player": updated}

    # ---------------- Global Leaderboard (extended) ----------------
    @router.get("/leaderboard/global")
    async def global_leaderboard(
        request: Request,
        scope: str = "global",  # global | country
        country: Optional[str] = None,
        limit: int = 50,
    ):
        db = db_getter(request)
        filt: Dict[str, Any] = {"is_guest": {"$ne": True}}
        if scope == "country" and country:
            filt["country"] = country.upper()
        rows = await db.users.find(
            filt,
            {"_id": 0, "id": 1, "name": 1, "elo": 1, "wins": 1, "losses": 1, "draws": 1,
             "country": 1, "is_premium": 1, "is_featured": 1, "avatar": 1, "level": 1, "xp": 1},
        ).sort("elo", -1).limit(min(200, max(1, int(limit)))).to_list(200)
        # Add rank
        for i, r in enumerate(rows):
            r["rank"] = i + 1
        # Distinct countries (top 20 by activity)
        countries = await db.users.distinct("country", {"is_guest": {"$ne": True}, "country": {"$ne": None}})
        return {"leaderboard": rows, "countries": [c for c in countries if c]}

    # ---------------- Featured / Watch Live ----------------
    @router.get("/featured-players")
    async def featured_players(request: Request):
        db = db_getter(request)
        rows = await db.users.find(
            {"is_featured": True},
            {"_id": 0, "id": 1, "name": 1, "elo": 1, "country": 1, "avatar": 1,
             "wins": 1, "is_premium": 1},
        ).sort("elo", -1).to_list(50)
        return {"featured": rows}

    @router.get("/live/games")
    async def live_games(request: Request):
        """List currently active multiplayer games via realtime.GameManager."""
        db = db_getter(request)
        gm = get_realtime_rooms() if get_realtime_rooms else None
        out: List[Dict[str, Any]] = []
        if gm is not None:
            game_ids = list(getattr(gm, "games", {}).keys())
            # Hydrate user info in one query
            user_ids: Set[str] = set()
            for gid in game_ids:
                g = gm.games.get(gid)
                if g and g.status == "ongoing":
                    user_ids.add(g.players.get("w"))
                    user_ids.add(g.players.get("b"))
            users = await db.users.find(
                {"id": {"$in": list(user_ids)}},
                {"_id": 0, "id": 1, "name": 1, "elo": 1, "country": 1, "is_featured": 1, "avatar": 1},
            ).to_list(200)
            by_id = {u["id"]: u for u in users}
            for gid in game_ids:
                g = gm.games.get(gid)
                if not g or g.status != "ongoing":
                    continue
                w = by_id.get(g.players.get("w"), {})
                b = by_id.get(g.players.get("b"), {})
                if not w.get("id") or not b.get("id"):
                    continue
                featured = bool(w.get("is_featured") or b.get("is_featured"))
                out.append({
                    "game_id": gid,
                    "white": {"id": w.get("id"), "name": w.get("name", "Player"),
                              "elo": int(w.get("elo", 800)), "country": w.get("country"),
                              "is_featured": bool(w.get("is_featured", False))},
                    "black": {"id": b.get("id"), "name": b.get("name", "Player"),
                              "elo": int(b.get("elo", 800)), "country": b.get("country"),
                              "is_featured": bool(b.get("is_featured", False))},
                    "rule_key": g.rule_key,
                    "fen": g.board.fen(),
                    "moves": len(g.moves_san),
                    "started_at": g.created_at.isoformat(),
                    "spectators": live_registry.count(gid),
                    "featured": featured,
                })
        out.sort(key=lambda x: (not x.get("featured", False), -x.get("moves", 0)))
        return {"games": out, "count": len(out)}

    @router.get("/live/games/{game_id}")
    async def live_game_detail(game_id: str, request: Request):
        db = db_getter(request)
        gm = get_realtime_rooms() if get_realtime_rooms else None
        g = gm.games.get(game_id) if gm else None
        if not g or g.status != "ongoing":
            raise HTTPException(404, "Game not found or already finished")
        users = await db.users.find(
            {"id": {"$in": [g.players["w"], g.players["b"]]}},
            {"_id": 0, "id": 1, "name": 1, "elo": 1, "country": 1, "is_featured": 1},
        ).to_list(2)
        by_id = {u["id"]: u for u in users}
        w = by_id.get(g.players["w"], {})
        b = by_id.get(g.players["b"], {})
        return {
            "game_id": game_id,
            "white": {"id": w.get("id"), "name": w.get("name"), "elo": w.get("elo", 800)},
            "black": {"id": b.get("id"), "name": b.get("name"), "elo": b.get("elo", 800)},
            "rule_key": g.rule_key,
            "fen": g.board.fen(),
            "moves_san": g.moves_san,
            "spectators": live_registry.count(game_id),
        }

    # ---------------- Badges ----------------
    @router.get("/badges")
    async def list_badges(request: Request):
        db = db_getter(request)
        rows = await db.badges.find({}, {"_id": 0}).to_list(200)
        return {"badges": rows}

    @router.get("/badges/me")
    async def my_badges(request: Request, user: Dict[str, Any] = Depends(current_user_dep)):
        db = db_getter(request)
        earned = await db.user_badges.find({"user_id": user["id"]}, {"_id": 0}).to_list(200)
        # Hydrate badge details
        keys = [e["badge_id"] for e in earned]
        badges = await db.badges.find({"id": {"$in": keys}}, {"_id": 0}).to_list(200)
        by_id = {b["id"]: b for b in badges}
        rows = []
        for e in earned:
            b = by_id.get(e["badge_id"])
            if b:
                rows.append({**b, "earned_at": e["earned_at"]})
        return {"badges": rows, "count": len(rows)}

    # ---------------- Profile updates (country) ----------------
    @router.put("/profile/country")
    async def set_country(
        body: Dict[str, Any],
        request: Request,
        user: Dict[str, Any] = Depends(current_user_dep),
    ):
        db = db_getter(request)
        country = (body.get("country") or "").upper()[:2]
        if not country.isalpha() or len(country) != 2:
            raise HTTPException(400, "country must be a 2-letter ISO code")
        await db.users.update_one({"id": user["id"]}, {"$set": {"country": country}})
        return {"ok": True, "country": country}

    # ---------------- Share card ----------------
    @router.get("/matches/{match_id}/share")
    async def match_share(match_id: str, request: Request, user: Dict[str, Any] = Depends(current_user_dep)):
        db = db_getter(request)
        m = await db.matches.find_one({"id": match_id, "user_id": user["id"]}, {"_id": 0})
        if not m:
            raise HTTPException(404, "Match not found")
        result_text = {"win": "won", "loss": "lost", "draw": "drew"}.get(m["result"], "played")
        delta = m.get("elo_delta", 0)
        delta_str = f"+{delta}" if delta >= 0 else str(delta)
        text = (
            f"I just {result_text} a {m.get('rule_key','classic').replace('_',' ').title()} match on "
            f"RuleForge Chess. Rating: {m.get('rating_after','?')} ({delta_str}). "
            f"#RuleForgeChess #Chess"
        )
        share = {
            "title": f"RuleForge Chess — {result_text.title()}!",
            "text": text,
            "result": m["result"],
            "rating_before": m.get("rating_before"),
            "rating_after": m.get("rating_after"),
            "elo_delta": m.get("elo_delta"),
            "rule_key": m.get("rule_key"),
            "moves": len(m.get("moves_san") or []),
        }
        return {"share": share, "match_id": match_id}

    # ---------------- Spectator websocket ----------------
    @router.websocket("/live/spectate/{game_id}")
    async def spectate_ws(websocket: WebSocket, game_id: str):
        await websocket.accept()
        live_registry.add(game_id, websocket)
        try:
            rooms_dict = get_realtime_rooms() if get_realtime_rooms else {}
            room = rooms_dict.get(game_id)
            if room:
                await websocket.send_json({
                    "type": "snapshot",
                    "fen": room.get("fen"),
                    "moves": room.get("moves") or [],
                    "white": room.get("white_user"),
                    "black": room.get("black_user"),
                    "rule_key": room.get("rule_key", "classic"),
                })
            else:
                await websocket.send_json({"type": "error", "detail": "Game not active"})
            # Receive loop just to keep connection alive; no client→server messages used
            while True:
                msg = await websocket.receive_text()
                if msg == "ping":
                    await websocket.send_json({"type": "pong"})
        except WebSocketDisconnect:
            pass
        except Exception:
            pass
        finally:
            live_registry.remove(game_id, websocket)

    return router


# ---------------------------------------------------------------------------
# Tournament leaderboard helper
# ---------------------------------------------------------------------------


async def _tournament_leaderboard(db, tid: str, limit: int = 50) -> List[Dict[str, Any]]:
    rows = await db.tournament_players.find(
        {"tournament_id": tid}, {"_id": 0}
    ).sort([("score", -1), ("wins", -1), ("last_match_at", 1)]).limit(min(200, limit)).to_list(200)
    # Hydrate with user info (elo, country)
    user_ids = [r["user_id"] for r in rows]
    users = await db.users.find(
        {"id": {"$in": user_ids}},
        {"_id": 0, "id": 1, "name": 1, "elo": 1, "country": 1, "avatar": 1,
         "is_featured": 1, "is_premium": 1},
    ).to_list(200)
    by_id = {u["id"]: u for u in users}
    out = []
    for i, r in enumerate(rows):
        u = by_id.get(r["user_id"], {})
        out.append({
            **r,
            "rank": i + 1,
            "elo": u.get("elo", 800),
            "country": u.get("country"),
            "avatar": u.get("avatar"),
            "is_featured": bool(u.get("is_featured", False)),
            "is_premium": bool(u.get("is_premium", False)),
        })
    return out


async def _maybe_award_winner_badges(db, tid: str, push_fn) -> None:
    leaderboard = await _tournament_leaderboard(db, tid, limit=3)
    for idx, row in enumerate(leaderboard):
        if row.get("score", 0) <= 0:
            continue
        if idx == 0:
            await _award_badge(db, row["user_id"], "tournament_winner", push_fn)
        if idx < 3:
            await _award_badge(db, row["user_id"], "tournament_top3", push_fn)


# ---------------------------------------------------------------------------
# Hooks for other modules to award badges incrementally
# ---------------------------------------------------------------------------


async def check_post_match_badges(db, user: Dict[str, Any], push_fn=None) -> List[Dict[str, Any]]:
    """Called after a match is recorded. Awards 10/50 win badges, rule_breaker, streak_5/30
    based on current user stats (caller passes the freshly fetched user)."""
    awarded = []
    wins = int(user.get("wins", 0))
    if wins >= 1:
        b = await _award_badge(db, user["id"], "first_win", push_fn);  b and awarded.append(b)
    if wins >= 10:
        b = await _award_badge(db, user["id"], "ten_wins", push_fn);  b and awarded.append(b)
    if wins >= 50:
        b = await _award_badge(db, user["id"], "fifty_wins", push_fn);  b and awarded.append(b)
    streak = int(user.get("login_streak", 0))
    if streak >= 5:
        b = await _award_badge(db, user["id"], "streak_5", push_fn);  b and awarded.append(b)
    if streak >= 30:
        b = await _award_badge(db, user["id"], "streak_30", push_fn);  b and awarded.append(b)
    return awarded
