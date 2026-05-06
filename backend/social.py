"""Social layer: friends, challenges, notifications, user search."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from realtime import connection_manager, games, persist_game_record, notify_user, is_online


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------


class FriendRequestIn(BaseModel):
    friend_id: str


class ChallengeIn(BaseModel):
    receiver_id: str
    rule_key: str = "classic"
    time_control: Optional[str] = "casual"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _public_user(user: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": user["id"],
        "name": user.get("name", "Player"),
        "elo": int(user.get("elo", 800)),
        "is_guest": bool(user.get("is_guest", False)),
        "wins": user.get("wins", 0),
        "online": is_online(user["id"]),
    }


def _friendship_pair_query(a: str, b: str) -> Dict[str, Any]:
    return {
        "$or": [
            {"user_id": a, "friend_id": b},
            {"user_id": b, "friend_id": a},
        ]
    }


# ---------------------------------------------------------------------------
# Router (mounted in server.py inside /api)
# ---------------------------------------------------------------------------


def make_social_router(current_user_dep, db_getter):
    """Factory that wires the dependency from server.py without circular imports."""
    router = APIRouter()

    # ---------------- Users / online ------------------
    @router.get("/users/search")
    async def search_users(q: str = "", request: Request = None, _user=Depends(current_user_dep)):
        db = db_getter(request)
        q = q.strip()
        if len(q) < 2:
            return {"users": []}
        # Match name (case-insensitive substring) or exact email
        regex = {"$regex": q, "$options": "i"}
        cursor = db.users.find(
            {
                "$or": [
                    {"name": regex},
                    {"email": q.lower()},
                ],
                "is_guest": False,
                "id": {"$ne": _user["id"]},
            },
            {"_id": 0, "id": 1, "name": 1, "elo": 1, "is_guest": 1, "wins": 1},
        ).limit(20)
        rows = await cursor.to_list(20)
        return {"users": [_public_user(u) for u in rows]}

    @router.get("/online")
    async def online(_user=Depends(current_user_dep)):
        return {"online": connection_manager.online_meta()}

    # ---------------- Friends ------------------
    @router.post("/friends/request")
    async def friend_request(payload: FriendRequestIn, request: Request, user=Depends(current_user_dep)):
        db = db_getter(request)
        if payload.friend_id == user["id"]:
            raise HTTPException(400, "Cannot friend yourself")
        target = await db.users.find_one({"id": payload.friend_id}, {"_id": 0, "id": 1, "name": 1})
        if not target:
            raise HTTPException(404, "User not found")
        existing = await db.friends.find_one(_friendship_pair_query(user["id"], payload.friend_id))
        if existing:
            return {"friendship": _strip_id(existing)}
        doc = {
            "id": str(uuid.uuid4()),
            "user_id": user["id"],
            "friend_id": payload.friend_id,
            "status": "pending",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.friends.insert_one(dict(doc))
        await notify_user(
            db,
            payload.friend_id,
            "friend_request",
            f"{user.get('name', 'Someone')} sent you a friend request",
            {"friendship_id": doc["id"], "from": _public_user(user)},
        )
        return {"friendship": doc}

    @router.post("/friends/{fid}/accept")
    async def friend_accept(fid: str, request: Request, user=Depends(current_user_dep)):
        db = db_getter(request)
        f = await db.friends.find_one({"id": fid})
        if not f or f.get("friend_id") != user["id"]:
            raise HTTPException(404, "Request not found")
        if f.get("status") != "pending":
            raise HTTPException(400, f"Already {f.get('status')}")
        await db.friends.update_one(
            {"id": fid},
            {"$set": {"status": "accepted", "accepted_at": datetime.now(timezone.utc).isoformat()}},
        )
        # Notify requester
        await notify_user(
            db,
            f["user_id"],
            "friend_accepted",
            f"{user.get('name', 'Someone')} accepted your friend request",
            {"friend": _public_user(user)},
        )
        return {"ok": True}

    @router.post("/friends/{fid}/reject")
    async def friend_reject(fid: str, request: Request, user=Depends(current_user_dep)):
        db = db_getter(request)
        f = await db.friends.find_one({"id": fid})
        if not f or f.get("friend_id") != user["id"]:
            raise HTTPException(404, "Request not found")
        await db.friends.update_one({"id": fid}, {"$set": {"status": "rejected"}})
        return {"ok": True}

    @router.delete("/friends/{fid}")
    async def friend_delete(fid: str, request: Request, user=Depends(current_user_dep)):
        db = db_getter(request)
        res = await db.friends.delete_one({
            "id": fid,
            "$or": [{"user_id": user["id"]}, {"friend_id": user["id"]}],
        })
        return {"deleted": res.deleted_count}

    @router.get("/friends")
    async def list_friends(request: Request, user=Depends(current_user_dep)):
        db = db_getter(request)
        cursor = db.friends.find(
            {"$or": [{"user_id": user["id"]}, {"friend_id": user["id"]}]},
            {"_id": 0},
        )
        rows = await cursor.to_list(200)
        # Hydrate other side
        ids = set()
        for r in rows:
            other = r["friend_id"] if r["user_id"] == user["id"] else r["user_id"]
            ids.add(other)
        users_map: Dict[str, Dict[str, Any]] = {}
        if ids:
            cur2 = db.users.find({"id": {"$in": list(ids)}}, {"_id": 0, "password_hash": 0})
            async for u in cur2:
                users_map[u["id"]] = u
        accepted: List[Dict[str, Any]] = []
        incoming: List[Dict[str, Any]] = []
        outgoing: List[Dict[str, Any]] = []
        for r in rows:
            if r["status"] == "accepted":
                other = r["friend_id"] if r["user_id"] == user["id"] else r["user_id"]
                u = users_map.get(other)
                if u:
                    accepted.append({"friendship_id": r["id"], **_public_user(u)})
            elif r["status"] == "pending":
                if r["user_id"] == user["id"]:
                    u = users_map.get(r["friend_id"]) or {}
                    outgoing.append({"friendship_id": r["id"], **_public_user(u)} if u else {"friendship_id": r["id"]})
                else:
                    u = users_map.get(r["user_id"]) or {}
                    incoming.append({"friendship_id": r["id"], **_public_user(u)} if u else {"friendship_id": r["id"]})
        return {"accepted": accepted, "incoming": incoming, "outgoing": outgoing}

    # ---------------- Challenges ------------------
    @router.post("/challenges")
    async def create_challenge(payload: ChallengeIn, request: Request, user=Depends(current_user_dep)):
        db = db_getter(request)
        if payload.receiver_id == user["id"]:
            raise HTTPException(400, "Cannot challenge yourself")
        target = await db.users.find_one({"id": payload.receiver_id}, {"_id": 0, "id": 1, "name": 1})
        if not target:
            raise HTTPException(404, "User not found")
        doc = {
            "id": str(uuid.uuid4()),
            "sender_id": user["id"],
            "receiver_id": payload.receiver_id,
            "rule_key": payload.rule_key,
            "time_control": payload.time_control,
            "status": "pending",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat(),
        }
        await db.challenges.insert_one(dict(doc))
        await notify_user(
            db,
            payload.receiver_id,
            "challenge_received",
            f"{user.get('name', 'Someone')} challenged you ({payload.rule_key})",
            {"challenge_id": doc["id"], "from": _public_user(user), "rule_key": payload.rule_key, "time_control": payload.time_control},
        )
        return {"challenge": doc}

    @router.post("/challenges/{cid}/accept")
    async def accept_challenge(cid: str, request: Request, user=Depends(current_user_dep)):
        db = db_getter(request)
        c = await db.challenges.find_one({"id": cid})
        if not c or c.get("receiver_id") != user["id"]:
            raise HTTPException(404, "Challenge not found")
        if c.get("status") != "pending":
            raise HTTPException(400, f"Already {c.get('status')}")
        # Mark accepted
        await db.challenges.update_one(
            {"id": cid},
            {"$set": {"status": "accepted", "accepted_at": datetime.now(timezone.utc).isoformat()}},
        )
        # Create live game between sender (white) and receiver (black) — coin flip
        import random
        sender = await db.users.find_one({"id": c["sender_id"]}, {"_id": 0, "id": 1, "name": 1, "elo": 1})
        receiver = await db.users.find_one({"id": c["receiver_id"]}, {"_id": 0, "id": 1, "name": 1, "elo": 1})
        if not sender or not receiver:
            raise HTTPException(404, "Player missing")
        if random.random() < 0.5:
            white_id, black_id = sender["id"], receiver["id"]
            white_rating, black_rating = int(sender.get("elo", 800)), int(receiver.get("elo", 800))
        else:
            white_id, black_id = receiver["id"], sender["id"]
            white_rating, black_rating = int(receiver.get("elo", 800)), int(sender.get("elo", 800))
        game = await games.create(white_id, black_id, white_rating, black_rating, rule_key=c.get("rule_key", "classic"))
        await persist_game_record(db, game)

        white_user = await db.users.find_one({"id": white_id}, {"_id": 0, "id": 1, "name": 1, "elo": 1})
        black_user = await db.users.find_one({"id": black_id}, {"_id": 0, "id": 1, "name": 1, "elo": 1})
        base = {
            "type": "match_found",
            "game_id": game.id,
            "rule_key": c.get("rule_key", "classic"),
            "fen": game.board.fen(),
            "white": {"id": white_id, "name": white_user.get("name", "Player"), "elo": white_rating},
            "black": {"id": black_id, "name": black_user.get("name", "Player"), "elo": black_rating},
            "challenge_id": cid,
        }
        await connection_manager.send_to_user(white_id, {**base, "your_color": "w"})
        await connection_manager.send_to_user(black_id, {**base, "your_color": "b"})
        return {"ok": True, "game_id": game.id}

    @router.post("/challenges/{cid}/reject")
    async def reject_challenge(cid: str, request: Request, user=Depends(current_user_dep)):
        db = db_getter(request)
        c = await db.challenges.find_one({"id": cid})
        if not c or c.get("receiver_id") != user["id"]:
            raise HTTPException(404, "Challenge not found")
        await db.challenges.update_one({"id": cid}, {"$set": {"status": "rejected"}})
        await notify_user(
            db,
            c["sender_id"],
            "challenge_rejected",
            f"{user.get('name', 'Someone')} declined your challenge",
            {"challenge_id": cid},
        )
        return {"ok": True}

    @router.get("/challenges")
    async def list_challenges(request: Request, user=Depends(current_user_dep)):
        db = db_getter(request)
        incoming = await db.challenges.find(
            {"receiver_id": user["id"], "status": "pending"}, {"_id": 0}
        ).sort("created_at", -1).to_list(50)
        outgoing = await db.challenges.find(
            {"sender_id": user["id"], "status": "pending"}, {"_id": 0}
        ).sort("created_at", -1).to_list(50)
        # Hydrate sender/receiver names
        all_ids = set()
        for c in incoming + outgoing:
            all_ids.add(c["sender_id"])
            all_ids.add(c["receiver_id"])
        users_map: Dict[str, Dict[str, Any]] = {}
        if all_ids:
            cursor = db.users.find({"id": {"$in": list(all_ids)}}, {"_id": 0, "id": 1, "name": 1, "elo": 1, "is_guest": 1, "wins": 1})
            async for u in cursor:
                users_map[u["id"]] = u
        for c in incoming:
            c["sender"] = _public_user(users_map.get(c["sender_id"], {"id": c["sender_id"], "name": "?"}))
        for c in outgoing:
            c["receiver"] = _public_user(users_map.get(c["receiver_id"], {"id": c["receiver_id"], "name": "?"}))
        return {"incoming": incoming, "outgoing": outgoing}

    # ---------------- Notifications ------------------
    @router.get("/notifications")
    async def list_notifications(request: Request, user=Depends(current_user_dep)):
        db = db_getter(request)
        rows = await db.notifications.find(
            {"user_id": user["id"]}, {"_id": 0}
        ).sort("created_at", -1).to_list(100)
        unread = sum(1 for n in rows if not n.get("is_read"))
        return {"notifications": rows, "unread": unread}

    @router.post("/notifications/read-all")
    async def read_all(request: Request, user=Depends(current_user_dep)):
        db = db_getter(request)
        await db.notifications.update_many(
            {"user_id": user["id"], "is_read": False},
            {"$set": {"is_read": True}},
        )
        return {"ok": True}

    return router


def _strip_id(d: Dict[str, Any]) -> Dict[str, Any]:
    return {k: v for k, v in d.items() if k != "_id"}
