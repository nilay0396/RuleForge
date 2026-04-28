"""Monetization layer: wallet, transactions, store, inventory, preferences,
premium subscription (mock), and rewarded ads.

Mounted under /api by server.py via include_router.
"""
from __future__ import annotations

import uuid
from datetime import datetime, date, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

MAX_AD_VIEWS_PER_DAY = 3
AD_REWARD_COINS = 15
PREMIUM_PRICE_COINS = 5000  # mock — players can also "subscribe" via mock payment

ALLOWED_TX_TYPES = {"earn", "spend", "purchase", "refund"}
ALLOWED_TX_SOURCES = {
    "puzzle", "daily_puzzle_bonus", "match_win", "match_draw", "match_loss",
    "daily_reward", "store_purchase", "premium_purchase", "ad_view",
    "signup_bonus", "admin_grant",
}


def _today() -> str:
    return date.today().isoformat()


# ---------------------------------------------------------------------------
# Standalone helpers (importable from other modules)
# ---------------------------------------------------------------------------

async def log_transaction(
    db,
    *,
    user_id: str,
    type: str,
    amount: int,
    source: str,
    metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Record a wallet transaction. Caller is responsible for the actual
    `users.coins` mutation (since most flows already do an atomic $inc).

    `amount` should be positive for both earn and spend (sign is implied by `type`).
    """
    if type not in ALLOWED_TX_TYPES:
        raise ValueError(f"Invalid transaction type: {type}")
    if source not in ALLOWED_TX_SOURCES:
        raise ValueError(f"Invalid transaction source: {source}")
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "type": type,
        "amount": int(amount),
        "source": source,
        "metadata": metadata or {},
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.transactions.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------


class PreferencesIn(BaseModel):
    board_theme: Optional[str] = None
    piece_style: Optional[str] = None
    avatar: Optional[str] = None


class PremiumSubscribeIn(BaseModel):
    method: str = Field(default="mock")  # "mock" | "coins"
    plan: str = Field(default="monthly")  # informational only for now


# ---------------------------------------------------------------------------
# Seed store
# ---------------------------------------------------------------------------


SEED_STORE_ITEMS: List[Dict[str, Any]] = [
    # Board themes
    {"key": "board_classic", "name": "Classic Walnut", "type": "board",
     "price_coins": 0, "premium_only": False,
     "preview": {"light": "#E8E1CF", "dark": "#7A6A4F"},
     "description": "The default warm walnut board.", "default": True},
    {"key": "board_emerald", "name": "Emerald", "type": "board",
     "price_coins": 300, "premium_only": False,
     "preview": {"light": "#D6EFD8", "dark": "#3A7D44"},
     "description": "Cool, focused emerald board for long studies."},
    {"key": "board_midnight", "name": "Midnight", "type": "board",
     "price_coins": 500, "premium_only": False,
     "preview": {"light": "#B7C0D6", "dark": "#293450"},
     "description": "Low-contrast theme that's easy on the eyes."},
    {"key": "board_rose", "name": "Rose Gold", "type": "board",
     "price_coins": 800, "premium_only": False,
     "preview": {"light": "#FBE6E5", "dark": "#B07477"},
     "description": "Warm, premium rose-gold accents."},
    {"key": "board_obsidian", "name": "Obsidian", "type": "board",
     "price_coins": 0, "premium_only": True,
     "preview": {"light": "#3F3F46", "dark": "#0B0B0E"},
     "description": "Stealth black on charcoal — premium exclusive."},

    # Piece styles
    {"key": "piece_classic", "name": "Glyph", "type": "piece",
     "price_coins": 0, "premium_only": False,
     "preview": {"glyph": "♚"},
     "description": "Crisp Unicode glyphs.", "default": True},
    {"key": "piece_serif", "name": "Royal Serif", "type": "piece",
     "price_coins": 250, "premium_only": False,
     "preview": {"glyph": "♔"},
     "description": "Classic serif silhouettes for purists."},
    {"key": "piece_mono", "name": "Monogram", "type": "piece",
     "price_coins": 400, "premium_only": False,
     "preview": {"glyph": "K"},
     "description": "Minimalist monogram letters (K Q R B N P)."},
    {"key": "piece_neo", "name": "Neo Noir", "type": "piece",
     "price_coins": 700, "premium_only": False,
     "preview": {"glyph": "♛"},
     "description": "Bold filled glyphs with strong contrast."},
    {"key": "piece_aurum", "name": "Aurum", "type": "piece",
     "price_coins": 0, "premium_only": True,
     "preview": {"glyph": "♕"},
     "description": "Hand-tuned gilded set — premium exclusive."},

    # Avatars (emoji-style identifiers; client renders large)
    {"key": "avatar_pawn", "name": "Pawn", "type": "avatar",
     "price_coins": 0, "premium_only": False,
     "preview": {"emoji": "♟"},
     "description": "Humble beginnings.", "default": True},
    {"key": "avatar_knight", "name": "Knight", "type": "avatar",
     "price_coins": 200, "premium_only": False,
     "preview": {"emoji": "♞"},
     "description": "L-shaped agility."},
    {"key": "avatar_bishop", "name": "Bishop", "type": "avatar",
     "price_coins": 200, "premium_only": False,
     "preview": {"emoji": "♝"},
     "description": "Long diagonals, sharper plans."},
    {"key": "avatar_rook", "name": "Rook", "type": "avatar",
     "price_coins": 350, "premium_only": False,
     "preview": {"emoji": "♜"},
     "description": "Files & ranks. Pure power."},
    {"key": "avatar_queen", "name": "Queen", "type": "avatar",
     "price_coins": 700, "premium_only": False,
     "preview": {"emoji": "♛"},
     "description": "The most flexible piece."},
    {"key": "avatar_crown", "name": "Crown", "type": "avatar",
     "price_coins": 0, "premium_only": True,
     "preview": {"emoji": "👑"},
     "description": "For champions only — premium exclusive."},
]


async def seed_store(db) -> None:
    if await db.store_items.count_documents({}) > 0:
        # Upsert any new keys (idempotent extension)
        for item in SEED_STORE_ITEMS:
            await db.store_items.update_one(
                {"key": item["key"]},
                {"$setOnInsert": {**item, "id": str(uuid.uuid4()),
                                  "created_at": datetime.now(timezone.utc).isoformat()}},
                upsert=True,
            )
        return
    for item in SEED_STORE_ITEMS:
        doc = {
            "id": str(uuid.uuid4()),
            "key": item["key"],
            "name": item["name"],
            "type": item["type"],
            "price_coins": int(item["price_coins"]),
            "premium_only": bool(item["premium_only"]),
            "preview": item.get("preview", {}),
            "description": item.get("description", ""),
            "default": bool(item.get("default", False)),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.store_items.insert_one(doc)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _strip_id(d: Dict[str, Any]) -> Dict[str, Any]:
    return {k: v for k, v in d.items() if k != "_id"}


async def _get_or_create_prefs(db, user_id: str) -> Dict[str, Any]:
    prefs = await db.user_preferences.find_one({"user_id": user_id}, {"_id": 0})
    if prefs:
        return prefs
    prefs = {
        "user_id": user_id,
        "board_theme": "board_classic",
        "piece_style": "piece_classic",
        "avatar": "avatar_pawn",
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.user_preferences.insert_one(dict(prefs))
    return prefs


async def _user_owns(db, user_id: str, item_key: str) -> bool:
    return bool(await db.user_inventory.find_one(
        {"user_id": user_id, "item_key": item_key}
    ))


async def _grant_default_inventory(db, user_id: str) -> None:
    """Ensure user owns all non-premium default items (free starter set)."""
    defaults = [i for i in SEED_STORE_ITEMS if i.get("default") and not i.get("premium_only")]
    for item in defaults:
        existing = await db.user_inventory.find_one(
            {"user_id": user_id, "item_key": item["key"]}
        )
        if existing:
            continue
        await db.user_inventory.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "item_key": item["key"],
            "type": item["type"],
            "acquired_via": "default",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })


# ---------------------------------------------------------------------------
# Router factory
# ---------------------------------------------------------------------------


def make_monetization_router(current_user_dep, db_getter):
    router = APIRouter()

    # ---------------- Wallet ----------------
    @router.get("/wallet")
    async def wallet(request: Request, user: Dict[str, Any] = Depends(current_user_dep)):
        db = db_getter(request)
        coins = int(user.get("coins", 0))
        recent = await db.transactions.find(
            {"user_id": user["id"]}, {"_id": 0}
        ).sort("created_at", -1).to_list(20)
        # Lifetime stats
        agg = await db.transactions.aggregate([
            {"$match": {"user_id": user["id"]}},
            {"$group": {
                "_id": "$type",
                "total": {"$sum": "$amount"},
                "count": {"$sum": 1},
            }},
        ]).to_list(10)
        totals = {row["_id"]: {"total": int(row["total"]), "count": row["count"]} for row in agg}
        return {
            "coins": coins,
            "is_premium": bool(user.get("is_premium", False)),
            "recent": recent,
            "totals": totals,
        }

    @router.get("/transactions")
    async def transactions(
        request: Request,
        limit: int = 50,
        user: Dict[str, Any] = Depends(current_user_dep),
    ):
        db = db_getter(request)
        limit = max(1, min(200, int(limit)))
        rows = await db.transactions.find(
            {"user_id": user["id"]}, {"_id": 0}
        ).sort("created_at", -1).to_list(limit)
        return {"transactions": rows, "count": len(rows)}

    # ---------------- Store ----------------
    @router.get("/store")
    async def list_store(
        request: Request,
        type: Optional[str] = None,
        user: Dict[str, Any] = Depends(current_user_dep),
    ):
        db = db_getter(request)
        await _grant_default_inventory(db, user["id"])
        prefs = await _get_or_create_prefs(db, user["id"])
        filt: Dict[str, Any] = {}
        if type:
            filt["type"] = type
        items = await db.store_items.find(filt, {"_id": 0}).to_list(200)
        # Decorate with ownership/equipped/locked
        owned_keys = {
            r["item_key"]
            for r in await db.user_inventory.find(
                {"user_id": user["id"]}, {"_id": 0, "item_key": 1}
            ).to_list(500)
        }
        is_premium = bool(user.get("is_premium", False))
        out: List[Dict[str, Any]] = []
        for it in items:
            owned = it["key"] in owned_keys
            equipped = (
                (it["type"] == "board" and prefs.get("board_theme") == it["key"]) or
                (it["type"] == "piece" and prefs.get("piece_style") == it["key"]) or
                (it["type"] == "avatar" and prefs.get("avatar") == it["key"])
            )
            it_out = {
                **it,
                "owned": owned or it.get("default", False) or (it.get("premium_only") and is_premium),
                "equipped": equipped,
                "locked_premium": bool(it.get("premium_only") and not is_premium and not owned),
            }
            out.append(it_out)
        # Group by type for convenience
        grouped = {"board": [], "piece": [], "avatar": []}
        for it in out:
            grouped.setdefault(it["type"], []).append(it)
        return {"items": out, "grouped": grouped}

    @router.post("/store/{item_key}/buy")
    async def buy_item(
        item_key: str,
        request: Request,
        user: Dict[str, Any] = Depends(current_user_dep),
    ):
        db = db_getter(request)
        item = await db.store_items.find_one({"key": item_key}, {"_id": 0})
        if not item:
            raise HTTPException(404, "Item not found")
        if item.get("premium_only") and not user.get("is_premium", False):
            raise HTTPException(403, "Premium-only item — upgrade to unlock")
        if await _user_owns(db, user["id"], item_key):
            raise HTTPException(400, "Already owned")
        price = int(item.get("price_coins", 0))
        coins = int(user.get("coins", 0))
        if coins < price:
            raise HTTPException(402, "Not enough coins")

        # Atomic conditional decrement to prevent negative coins under concurrency
        result = await db.users.update_one(
            {"id": user["id"], "coins": {"$gte": price}},
            {"$inc": {"coins": -price}},
        )
        if result.modified_count == 0:
            raise HTTPException(402, "Not enough coins")

        await db.user_inventory.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": user["id"],
            "item_key": item_key,
            "type": item["type"],
            "acquired_via": "purchase",
            "price_paid": price,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        await log_transaction(
            db, user_id=user["id"], type="spend", amount=price,
            source="store_purchase",
            metadata={"item_key": item_key, "item_type": item["type"]},
        )
        updated = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0})
        return {
            "ok": True,
            "item_key": item_key,
            "price_paid": price,
            "coins": int(updated.get("coins", 0)),
            "user": _safe_user(updated),
        }

    # ---------------- Inventory ----------------
    @router.get("/inventory")
    async def inventory(
        request: Request,
        user: Dict[str, Any] = Depends(current_user_dep),
    ):
        db = db_getter(request)
        await _grant_default_inventory(db, user["id"])
        rows = await db.user_inventory.find(
            {"user_id": user["id"]}, {"_id": 0}
        ).sort("created_at", -1).to_list(500)
        # Hydrate with item details
        keys = [r["item_key"] for r in rows]
        items = await db.store_items.find({"key": {"$in": keys}}, {"_id": 0}).to_list(500)
        by_key = {it["key"]: it for it in items}
        prefs = await _get_or_create_prefs(db, user["id"])
        hydrated = []
        for r in rows:
            it = by_key.get(r["item_key"])
            if not it:
                continue
            equipped = (
                (it["type"] == "board" and prefs.get("board_theme") == it["key"]) or
                (it["type"] == "piece" and prefs.get("piece_style") == it["key"]) or
                (it["type"] == "avatar" and prefs.get("avatar") == it["key"])
            )
            hydrated.append({**r, "item": it, "equipped": equipped})
        return {"inventory": hydrated, "count": len(hydrated)}

    # ---------------- Preferences ----------------
    @router.get("/preferences")
    async def get_prefs(
        request: Request,
        user: Dict[str, Any] = Depends(current_user_dep),
    ):
        db = db_getter(request)
        prefs = await _get_or_create_prefs(db, user["id"])
        return {"preferences": _strip_id(prefs)}

    @router.put("/preferences")
    async def set_prefs(
        payload: PreferencesIn,
        request: Request,
        user: Dict[str, Any] = Depends(current_user_dep),
    ):
        db = db_getter(request)
        await _grant_default_inventory(db, user["id"])
        # Validate every requested item is owned (or is default / premium owned)
        updates: Dict[str, Any] = {}
        type_map = {
            "board_theme": "board",
            "piece_style": "piece",
            "avatar": "avatar",
        }
        for field, item_type in type_map.items():
            new_val = getattr(payload, field, None)
            if not new_val:
                continue
            item = await db.store_items.find_one({"key": new_val, "type": item_type}, {"_id": 0})
            if not item:
                raise HTTPException(404, f"{item_type} '{new_val}' not found")
            owned = await _user_owns(db, user["id"], new_val)
            if not owned and not item.get("default") and not (
                item.get("premium_only") and user.get("is_premium")
            ):
                raise HTTPException(403, f"{item_type} '{new_val}' is locked — purchase first")
            updates[field] = new_val
        if not updates:
            raise HTTPException(400, "Nothing to update")
        updates["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.user_preferences.update_one(
            {"user_id": user["id"]}, {"$set": updates}, upsert=True,
        )
        prefs = await _get_or_create_prefs(db, user["id"])
        return {"preferences": _strip_id(prefs)}

    # ---------------- Premium ----------------
    @router.get("/premium")
    async def premium_status(
        user: Dict[str, Any] = Depends(current_user_dep),
    ):
        return {
            "is_premium": bool(user.get("is_premium", False)),
            "since": user.get("premium_since"),
            "renews_at": user.get("premium_renews_at"),
            "benefits": [
                {"id": "no_ads", "title": "No ads", "description": "Remove all rewarded-ad prompts."},
                {"id": "exclusive_themes", "title": "Exclusive themes", "description": "Unlock Obsidian board, Aurum pieces and Crown avatar."},
                {"id": "extra_puzzles", "title": "Extra puzzle packs", "description": "Access curated tactical packs (coming soon)."},
                {"id": "advanced_stats", "title": "Advanced stats", "description": "Deep ELO breakdowns, win-rate by rule (coming soon)."},
            ],
            "price": {
                "coins": PREMIUM_PRICE_COINS,
                "monthly_usd": "4.99",  # mock display
                "yearly_usd": "39.99",
            },
        }

    @router.post("/premium/subscribe")
    async def premium_subscribe(
        payload: PremiumSubscribeIn,
        request: Request,
        user: Dict[str, Any] = Depends(current_user_dep),
    ):
        db = db_getter(request)
        if user.get("is_premium"):
            return {"ok": True, "already_premium": True, "user": _safe_user(user)}
        method = (payload.method or "mock").lower()
        coins_paid = 0
        if method == "coins":
            if int(user.get("coins", 0)) < PREMIUM_PRICE_COINS:
                raise HTTPException(402, "Not enough coins")
            res = await db.users.update_one(
                {"id": user["id"], "coins": {"$gte": PREMIUM_PRICE_COINS}},
                {"$inc": {"coins": -PREMIUM_PRICE_COINS}},
            )
            if res.modified_count == 0:
                raise HTTPException(402, "Not enough coins")
            coins_paid = PREMIUM_PRICE_COINS
            await log_transaction(
                db, user_id=user["id"], type="spend",
                amount=PREMIUM_PRICE_COINS, source="premium_purchase",
                metadata={"method": "coins"},
            )
        else:
            # Mock external payment — no coin deduction. Hook for Stripe/Razorpay later.
            await log_transaction(
                db, user_id=user["id"], type="purchase",
                amount=0, source="premium_purchase",
                metadata={"method": method, "plan": payload.plan, "mock": True},
            )

        now = datetime.now(timezone.utc)
        await db.users.update_one(
            {"id": user["id"]},
            {"$set": {
                "is_premium": True,
                "premium": True,  # legacy field kept in sync
                "premium_since": now.isoformat(),
                "premium_method": method,
                "premium_plan": payload.plan,
            }},
        )
        updated = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0})
        return {"ok": True, "coins_paid": coins_paid, "user": _safe_user(updated)}

    @router.post("/premium/cancel")
    async def premium_cancel(
        request: Request,
        user: Dict[str, Any] = Depends(current_user_dep),
    ):
        db = db_getter(request)
        if not user.get("is_premium"):
            return {"ok": True, "already_inactive": True}
        await db.users.update_one(
            {"id": user["id"]},
            {"$set": {
                "is_premium": False,
                "premium": False,
            }},
        )
        return {"ok": True}

    # ---------------- Rewarded ads ----------------
    @router.get("/ads/state")
    async def ads_state(
        request: Request,
        user: Dict[str, Any] = Depends(current_user_dep),
    ):
        db = db_getter(request)
        if user.get("is_premium"):
            return {
                "is_premium": True,
                "available": False,
                "remaining": 0,
                "limit": MAX_AD_VIEWS_PER_DAY,
                "reward_coins": AD_REWARD_COINS,
                "reason": "Premium users see no ads.",
            }
        today = _today()
        count = await db.ad_views.count_documents({"user_id": user["id"], "date": today})
        remaining = max(0, MAX_AD_VIEWS_PER_DAY - count)
        return {
            "is_premium": False,
            "available": remaining > 0,
            "remaining": remaining,
            "limit": MAX_AD_VIEWS_PER_DAY,
            "reward_coins": AD_REWARD_COINS,
        }

    @router.post("/ads/reward")
    async def ads_reward(
        request: Request,
        user: Dict[str, Any] = Depends(current_user_dep),
    ):
        db = db_getter(request)
        if user.get("is_premium"):
            raise HTTPException(400, "Premium accounts have no ads")
        today = _today()
        count = await db.ad_views.count_documents({"user_id": user["id"], "date": today})
        if count >= MAX_AD_VIEWS_PER_DAY:
            raise HTTPException(429, f"Daily ad limit reached ({MAX_AD_VIEWS_PER_DAY})")
        await db.ad_views.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": user["id"],
            "date": today,
            "reward_coins": AD_REWARD_COINS,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        await db.users.update_one(
            {"id": user["id"]}, {"$inc": {"coins": AD_REWARD_COINS}},
        )
        await log_transaction(
            db, user_id=user["id"], type="earn",
            amount=AD_REWARD_COINS, source="ad_view",
        )
        updated = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0})
        remaining = max(0, MAX_AD_VIEWS_PER_DAY - (count + 1))
        return {
            "ok": True,
            "coins_earned": AD_REWARD_COINS,
            "remaining": remaining,
            "user": _safe_user(updated),
        }

    return router


def _safe_user(u: Dict[str, Any]) -> Dict[str, Any]:
    if not u:
        return {}
    return {
        "id": u["id"],
        "name": u.get("name"),
        "coins": int(u.get("coins", 0)),
        "xp": int(u.get("xp", 0)),
        "is_premium": bool(u.get("is_premium", False)),
    }
