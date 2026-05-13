"""RuleForge Chess — FastAPI backend.

Auth (JWT email/password + guest), rule variants, daily challenges,
matches/XP/coins/elo/streaks/badges, leaderboard, quizzes, admin panel,
and server-side anti-cheat move validation using python-chess.
"""

from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import logging
import uuid
from datetime import datetime, timezone, timedelta, date
from typing import Any, Dict, List, Optional

import bcrypt
import chess as pychess
import jwt
from fastapi import APIRouter, Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field

# -----------------------------------------------------------------------------
# Config & logging
# -----------------------------------------------------------------------------
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_TTL_MIN = 60 * 24 * 7  # 7 days — keep simple for mobile
DAILY_XP_BONUS = 50
WIN_XP = 25
DRAW_XP = 10
LOSE_XP = 5

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s — %(message)s")
logger = logging.getLogger("ruleforge")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]


def jwt_secret() -> str:
    return os.environ["JWT_SECRET"]


# -----------------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------------
import asyncio

# bcrypt hashing is CPU-bound (~55ms at rounds=10 / ~220ms at rounds=12) and
# would block the FastAPI event loop if called synchronously. We offload to a
# default thread pool so the server can keep handling other requests during
# the hash. Rounds are tunable via BCRYPT_ROUNDS env (default 10, OWASP
# production-safe minimum used by Django/passlib).
BCRYPT_ROUNDS = int(os.environ.get("BCRYPT_ROUNDS", "10"))
_THREAD_POOL_SIZE = int(os.environ.get("BCRYPT_THREAD_POOL_SIZE", "32"))


def _ensure_thread_pool():
    try:
        loop = asyncio.get_event_loop()
        loop.set_default_executor(__import__("concurrent.futures").futures.ThreadPoolExecutor(max_workers=_THREAD_POOL_SIZE))
    except Exception:
        pass


def _hash_password_sync(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=BCRYPT_ROUNDS)).decode("utf-8")


def _verify_password_sync(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


async def hash_password_async(password: str) -> str:
    return await asyncio.to_thread(_hash_password_sync, password)


async def verify_password_async(plain: str, hashed: str) -> bool:
    return await asyncio.to_thread(_verify_password_sync, plain, hashed)


# Sync wrappers preserved for non-async callers (e.g. seeders).
def hash_password(password: str) -> str:
    return _hash_password_sync(password)


def verify_password(plain: str, hashed: str) -> bool:
    return _verify_password_sync(plain, hashed)


def create_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_TTL_MIN),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, jwt_secret(), algorithm=JWT_ALGORITHM)


def public_user(user: Dict[str, Any]) -> Dict[str, Any]:
    """Return a JSON-serializable view of a user, dropping mongo _id and password."""
    return {
        "id": user["id"],
        "email": user.get("email"),
        "name": user.get("name", "Player"),
        "role": user.get("role", "user"),
        "is_guest": user.get("is_guest", False),
        "xp": user.get("xp", 0),
        "coins": user.get("coins", 0),
        "elo": user.get("elo", 1000),
        "streak": user.get("streak", 0),
        "longest_streak": user.get("longest_streak", 0),
        "badges": user.get("badges", []),
        "wins": user.get("wins", 0),
        "losses": user.get("losses", 0),
        "draws": user.get("draws", 0),
        "premium": user.get("premium", False),
        "avatar": user.get("avatar"),
        "created_at": user.get("created_at"),
    }


# -----------------------------------------------------------------------------
# Models
# -----------------------------------------------------------------------------
class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
    name: str = Field(min_length=1, max_length=40)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class UpgradeIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
    name: str = Field(min_length=1, max_length=40)


class MatchIn(BaseModel):
    mode: str  # 'classic' | 'king_dash' | 'power_pawns' | 'swap_move' | 'daily'
    rule_key: Optional[str] = None
    result: str  # 'win' | 'loss' | 'draw'
    moves_san: List[str] = []
    final_fen: Optional[str] = None
    duration_seconds: int = 0
    ai_level: Optional[int] = None


class DailySubmitIn(BaseModel):
    moves_san: List[str]
    completed: bool


class RuleIn(BaseModel):
    key: str
    name: str
    description: str
    color: str = "#EAB308"
    icon: str = "crown"
    long_explanation: str = ""
    examples: List[str] = []
    premium: bool = False


class DailyChallengeIn(BaseModel):
    rule_key: str
    fen: str = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
    target: str = "Win or draw against the bot"
    description: str = ""


class QuizIn(BaseModel):
    rule_key: str
    question: str
    options: List[str]
    correct_index: int
    explanation: str = ""


class MoveValidateIn(BaseModel):
    fen: str
    uci: str  # like 'e2e4' or 'e7e8q'


# -----------------------------------------------------------------------------
# App + Router
# -----------------------------------------------------------------------------
app = FastAPI(title="RuleForge Chess API")
api = APIRouter(prefix="/api")


# CORS — frontend uses fetch with bearer tokens (no credentials), so wildcard works.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Wire DB onto app.state for realtime/social modules
app.state.db = db


def _db_getter(request: Request):  # used by social router factory
    return request.app.state.db


# -----------------------------------------------------------------------------
# Auth dependency
# -----------------------------------------------------------------------------
async def current_user(request: Request) -> Dict[str, Any]:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = auth[7:]
    try:
        payload = jwt.decode(token, jwt_secret(), algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


async def admin_user(user: Dict[str, Any] = Depends(current_user)) -> Dict[str, Any]:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return user


# -----------------------------------------------------------------------------
# Auth Endpoints
# -----------------------------------------------------------------------------
@api.post("/auth/register")
async def register(payload: RegisterIn):
    email = payload.email.lower().strip()
    existing = await db.users.find_one({"email": email}, {"_id": 1})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    # Run bcrypt off the event loop so other requests aren't blocked.
    password_hash = await hash_password_async(payload.password)
    user_id = str(uuid.uuid4())
    user_doc = {
        "id": user_id,
        "email": email,
        "password_hash": password_hash,
        "name": payload.name.strip(),
        "role": "user",
        "is_guest": False,
        "xp": 0,
        "coins": 100,
        "elo": 800,
        "streak": 0,
        "longest_streak": 0,
        "badges": [],
        "wins": 0,
        "losses": 0,
        "draws": 0,
        "premium": False,
        "avatar": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(user_doc)
    token = create_token(user_id, email, "user")
    return {"token": token, "user": public_user(user_doc)}


@api.post("/auth/login")
async def login(payload: LoginIn):
    email = payload.email.lower().strip()
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user or not user.get("password_hash"):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    ok = await verify_password_async(payload.password, user["password_hash"])
    if not ok:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_token(user["id"], email, user.get("role", "user"))
    return {"token": token, "user": public_user(user)}


@api.post("/auth/guest")
async def guest_login():
    user_id = str(uuid.uuid4())
    name = f"Guest-{user_id[:6].upper()}"
    # NOTE: intentionally omit the `email` field for guests. The unique index on
    # `email` uses a partial filter so documents without the field are ignored.
    user_doc = {
        "id": user_id,
        "password_hash": None,
        "name": name,
        "role": "user",
        "is_guest": True,
        "xp": 0,
        "coins": 50,
        "elo": 800,
        "streak": 0,
        "longest_streak": 0,
        "badges": [],
        "wins": 0,
        "losses": 0,
        "draws": 0,
        "premium": False,
        "avatar": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(user_doc)
    token = create_token(user_id, "", "user")
    return {"token": token, "user": public_user(user_doc)}


@api.post("/auth/upgrade")
async def upgrade_guest(payload: UpgradeIn, user: Dict[str, Any] = Depends(current_user)):
    if not user.get("is_guest"):
        raise HTTPException(status_code=400, detail="Account is already a full account")
    email = payload.email.lower().strip()
    if await db.users.find_one({"email": email}, {"_id": 1}):
        raise HTTPException(status_code=400, detail="Email already registered")
    password_hash = await hash_password_async(payload.password)
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {
            "email": email,
            "password_hash": password_hash,
            "name": payload.name.strip(),
            "is_guest": False,
        }},
    )
    updated = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    token = create_token(updated["id"], email, updated.get("role", "user"))
    return {"token": token, "user": public_user(updated)}


@api.get("/auth/me")
async def me(user: Dict[str, Any] = Depends(current_user)):
    return {"user": public_user(user)}


@api.post("/auth/logout")
async def logout(user: Dict[str, Any] = Depends(current_user)):
    return {"ok": True}


# -----------------------------------------------------------------------------
# Rules
# -----------------------------------------------------------------------------
@api.get("/rules")
async def list_rules():
    rules = await db.rules.find({}, {"_id": 0}).to_list(200)
    return {"rules": rules}


@api.get("/rules/{key}")
async def get_rule(key: str):
    rule = await db.rules.find_one({"key": key}, {"_id": 0})
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    quizzes = await db.quizzes.find({"rule_key": key}, {"_id": 0}).to_list(50)
    return {"rule": rule, "quizzes": quizzes}


# -----------------------------------------------------------------------------
# Matches & XP
# -----------------------------------------------------------------------------
def _award_for_result(result: str) -> int:
    return {"win": WIN_XP, "draw": DRAW_XP, "loss": LOSE_XP}.get(result, 0)


def _ai_opponent_rating(ai_level: Optional[int]) -> int:
    return {1: 600, 2: 900, 3: 1200, 4: 1500}.get(ai_level or 2, 900)


def _elo_delta(player_rating: int, opponent_rating: int, result: str, k: int = 32) -> int:
    score = {"win": 1.0, "draw": 0.5, "loss": 0.0}.get(result, 0.0)
    expected = 1.0 / (1.0 + 10 ** ((opponent_rating - player_rating) / 400))
    return int(round(k * (score - expected)))


@api.post("/matches")
async def record_match(payload: MatchIn, user: Dict[str, Any] = Depends(current_user)):
    match_id = str(uuid.uuid4())
    xp_gain = _award_for_result(payload.result)
    coin_gain = 10 if payload.result == "win" else 2
    rating_before = int(user.get("elo", 800))
    opponent_rating = _ai_opponent_rating(payload.ai_level)
    elo_delta = _elo_delta(rating_before, opponent_rating, payload.result)
    rating_after = max(100, rating_before + elo_delta)
    match_doc = {
        "id": match_id,
        "user_id": user["id"],
        "mode": payload.mode,
        "rule_key": payload.rule_key,
        "result": payload.result,
        "moves_san": payload.moves_san,
        "final_fen": payload.final_fen,
        "duration_seconds": payload.duration_seconds,
        "ai_level": payload.ai_level,
        "xp_gain": xp_gain,
        "coin_gain": coin_gain,
        "elo_delta": elo_delta,
        "rating_before": rating_before,
        "rating_after": rating_after,
        "opponent_rating": opponent_rating,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.matches.insert_one(match_doc)

    # Rating history entry
    await db.rating_history.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "match_id": match_id,
        "rating_before": rating_before,
        "rating_after": rating_after,
        "opponent_rating": opponent_rating,
        "delta": elo_delta,
        "result": payload.result,
        "rule_key": payload.rule_key,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    # Update user stats
    result_field = {"win": "wins", "loss": "losses", "draw": "draws"}.get(payload.result, "draws")
    await db.users.update_one(
        {"id": user["id"]},
        {
            "$inc": {"xp": xp_gain, "coins": coin_gain, result_field: 1},
            "$set": {"elo": rating_after},
        },
    )

    # Log wallet transaction (earnings from match)
    if coin_gain > 0:
        try:
            from monetization import log_transaction as _log_tx
            await _log_tx(
                db, user_id=user["id"], type="earn", amount=coin_gain,
                source=f"match_{payload.result}",
                metadata={"match_id": match_id, "rule_key": payload.rule_key,
                          "elo_delta": elo_delta},
            )
        except Exception as e:
            logger.warning("Match transaction log failed: %s", e)

    # Award badges (post-match)
    new_badges = []
    try:
        from viral import check_post_match_badges
        fresh = await db.users.find_one({"id": user["id"]}, {"_id": 0})
        if fresh:
            new_badges = await check_post_match_badges(db, fresh) or []
            # Rule breaker for any custom-rule win
            if payload.result == "win" and payload.rule_key not in ("classic", "", None):
                from viral import _award_badge as _aw
                rb = await _aw(db, user["id"], "rule_breaker")
                if rb:
                    new_badges.append(rb)
    except Exception as e:
        logger.warning("Badge check failed: %s", e)

    # Badge logic
    user2 = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    new_badges: List[str] = list(user2.get("badges", []))
    if user2.get("wins", 0) >= 1 and "first_win" not in new_badges:
        new_badges.append("first_win")
    if user2.get("wins", 0) >= 10 and "ten_wins" not in new_badges:
        new_badges.append("ten_wins")
    if payload.mode != "classic" and "rule_breaker" not in new_badges:
        new_badges.append("rule_breaker")
    if new_badges != user2.get("badges", []):
        await db.users.update_one({"id": user["id"]}, {"$set": {"badges": new_badges}})

    final_user = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    return {"match": {k: v for k, v in match_doc.items() if k != "_id"}, "user": public_user(final_user)}


@api.get("/matches/me")
async def my_matches(user: Dict[str, Any] = Depends(current_user)):
    matches = await db.matches.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(50)
    return {"matches": matches}


@api.get("/rating/history")
async def rating_history(user: Dict[str, Any] = Depends(current_user)):
    rows = await db.rating_history.find(
        {"user_id": user["id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    return {"history": rows}


# Guided scenarios per rule (board position + the one move the player must find).
SCENARIOS: Dict[str, List[Dict[str, Any]]] = {
    "king_dash": [
        {
            "id": "kd1",
            "title": "Escape the pin",
            "rule_key": "king_dash",
            "fen": "4k3/8/8/8/8/8/4r3/4K3 w - - 0 1",
            "expected_uci": "e1g1",
            "expected_type": "dash",
            "hint": "Your king is pinned by a rook on e2. Use Dash 2 squares sideways to escape.",
            "explanation": "King Dash lets the king sprint two squares — perfect for escaping a pin where one-square moves would still be attacked.",
        },
        {
            "id": "kd2",
            "title": "Activate the king",
            "rule_key": "king_dash",
            "fen": "8/8/8/8/8/8/4K3/4k3 w - - 0 1",
            "expected_uci": "e2e4",
            "expected_type": "dash",
            "hint": "Walking takes too long. Dash forward two ranks to enter the action.",
            "explanation": "In endgames, an active king wins. Dash brings yours into play in a single tempo.",
        },
        {
            "id": "kd3",
            "title": "Diagonal getaway",
            "rule_key": "king_dash",
            "fen": "8/8/8/8/8/3r4/4K3/8 w - - 0 1",
            "expected_uci": "e2g4",
            "expected_type": "dash",
            "hint": "The d-file is dangerous. Dash diagonally to safety on g4.",
            "explanation": "Dash also works diagonally — two squares in a straight line in any direction.",
        },
    ],
    "power_pawns": [
        {
            "id": "pp1",
            "title": "Slide to support",
            "rule_key": "power_pawns",
            "fen": "4k3/8/8/4P3/8/8/8/4K3 w - - 0 1",
            "expected_uci": "e5d5",
            "expected_type": "sideways",
            "hint": "Your pawn on e5 just gained sideways power. Slide it to d5 for a better route.",
            "explanation": "On rank 5+, white pawns may slide one square sideways to an empty square — non-capturing.",
        },
        {
            "id": "pp2",
            "title": "Sidestep the blocker",
            "rule_key": "power_pawns",
            "fen": "4k3/8/8/3pP3/8/8/8/4K3 w - - 0 1",
            "expected_uci": "e5f5",
            "expected_type": "sideways",
            "hint": "The pawn ahead of you blocks promotion. Slide to f5 and find a clear file.",
            "explanation": "Power Pawns let you reroute around blockades on the way to promotion.",
        },
        {
            "id": "pp3",
            "title": "Connect your pawns",
            "rule_key": "power_pawns",
            "fen": "4k3/8/8/P3P3/8/8/8/4K3 w - - 0 1",
            "expected_uci": "e5d5",
            "expected_type": "sideways",
            "hint": "Two passed pawns, far apart. Slide e5 to d5 — they support each other.",
            "explanation": "Sideways slides let isolated pawns regroup into devastating connected pairs.",
        },
    ],
    "swap_move": [
        {
            "id": "sm1",
            "title": "Swap into action",
            "rule_key": "swap_move",
            "fen": "4k3/8/8/8/8/8/8/RN2K3 w - - 0 1",
            "expected_uci": "swap:a1b1",
            "expected_type": "swap",
            "hint": "Your rook is stuck in the corner while a knight blocks. Use Swap to put the rook on b1 and knight on a1.",
            "explanation": "Swap Move trades positions of any two of your own non-king pieces — instantly fixing structural problems.",
        },
        {
            "id": "sm2",
            "title": "Defend the king",
            "rule_key": "swap_move",
            "fen": "4k3/8/8/8/8/8/4K3/3B1N2 w - - 0 1",
            "expected_uci": "swap:d1f1",
            "expected_type": "swap",
            "hint": "Swap your bishop and knight so the bishop covers the long diagonal.",
            "explanation": "When ideal piece placement is across the board, Swap saves you many tempi.",
        },
        {
            "id": "sm3",
            "title": "Reroute for attack",
            "rule_key": "swap_move",
            "fen": "4k3/8/8/8/8/8/8/R3K2R w - - 0 1",
            "expected_uci": "swap:a1h1",
            "expected_type": "swap",
            "hint": "Swap the rooks to surprise the opponent on the side they don't expect.",
            "explanation": "Use Swap once per game — wisely. It can be a game-changing attack setup.",
        },
    ],
    "classic": [],
}


@api.get("/rules/{key}/scenarios")
async def rule_scenarios(key: str):
    return {"scenarios": SCENARIOS.get(key, [])}


# -----------------------------------------------------------------------------
# Daily challenge
# -----------------------------------------------------------------------------
def _today_key() -> str:
    return date.today().isoformat()


@api.get("/daily")
async def get_daily(user: Dict[str, Any] = Depends(current_user)):
    today = _today_key()
    challenge = await db.daily.find_one({"date": today}, {"_id": 0})
    if not challenge:
        # Auto-rotate among rules so there's always one available.
        rules = await db.rules.find({}, {"_id": 0}).to_list(50)
        if not rules:
            raise HTTPException(status_code=500, detail="No rules configured")
        idx = (date.today().toordinal()) % len(rules)
        rule = rules[idx]
        challenge = {
            "id": str(uuid.uuid4()),
            "date": today,
            "rule_key": rule["key"],
            "fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
            "target": f"Defeat the Bronze bot using the {rule['name']} rule",
            "description": rule.get("description", ""),
            "auto_generated": True,
        }
        await db.daily.insert_one(dict(challenge))
        challenge.pop("_id", None)

    completion = await db.daily_completions.find_one(
        {"user_id": user["id"], "date": today}, {"_id": 0}
    )
    return {"challenge": challenge, "completed": bool(completion and completion.get("completed"))}


@api.post("/daily/submit")
async def submit_daily(payload: DailySubmitIn, user: Dict[str, Any] = Depends(current_user)):
    today = _today_key()
    existing = await db.daily_completions.find_one({"user_id": user["id"], "date": today})
    if existing and existing.get("completed"):
        return {"already_completed": True, "user": public_user(user)}

    record = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "date": today,
        "moves_san": payload.moves_san,
        "completed": payload.completed,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    if existing:
        await db.daily_completions.update_one({"id": existing["id"]}, {"$set": record})
    else:
        await db.daily_completions.insert_one(record)

    if payload.completed:
        # Streak: did user complete yesterday too?
        yesterday = (date.today() - timedelta(days=1)).isoformat()
        had_yesterday = await db.daily_completions.find_one(
            {"user_id": user["id"], "date": yesterday, "completed": True}
        )
        new_streak = (user.get("streak", 0) + 1) if had_yesterday else 1
        longest = max(user.get("longest_streak", 0), new_streak)
        badges = list(user.get("badges", []))
        if new_streak >= 3 and "streak_3" not in badges:
            badges.append("streak_3")
        if new_streak >= 7 and "streak_7" not in badges:
            badges.append("streak_7")
        await db.users.update_one(
            {"id": user["id"]},
            {
                "$inc": {"xp": DAILY_XP_BONUS, "coins": 20},
                "$set": {"streak": new_streak, "longest_streak": longest, "badges": badges},
            },
        )

    final = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    return {"ok": True, "user": public_user(final)}


# -----------------------------------------------------------------------------
# Leaderboard
# -----------------------------------------------------------------------------
@api.get("/leaderboard")
async def leaderboard():
    top = await db.users.find(
        {"is_guest": False},
        {"_id": 0, "id": 1, "name": 1, "elo": 1, "xp": 1, "wins": 1, "badges": 1},
    ).sort([("elo", -1), ("xp", -1)]).to_list(50)
    return {"leaderboard": top}


# -----------------------------------------------------------------------------
# Anti-cheat: server-side move validation (classic chess rules)
# -----------------------------------------------------------------------------
@api.post("/move/validate")
async def validate_move(payload: MoveValidateIn):
    try:
        board = pychess.Board(payload.fen)
        move = pychess.Move.from_uci(payload.uci)
    except Exception as e:
        return {"legal": False, "reason": f"parse error: {e}"}
    if move not in board.legal_moves:
        return {"legal": False, "reason": "not a legal classic move"}
    san = board.san(move)
    board.push(move)
    return {
        "legal": True,
        "san": san,
        "fen": board.fen(),
        "is_check": board.is_check(),
        "is_checkmate": board.is_checkmate(),
        "is_stalemate": board.is_stalemate(),
    }


# -----------------------------------------------------------------------------
# Admin
# -----------------------------------------------------------------------------
@api.post("/admin/rules")
async def admin_create_rule(payload: RuleIn, _: Dict[str, Any] = Depends(admin_user)):
    existing = await db.rules.find_one({"key": payload.key})
    rule = payload.dict()
    rule["id"] = existing["id"] if existing else str(uuid.uuid4())
    rule["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.rules.update_one({"key": payload.key}, {"$set": rule}, upsert=True)
    return {"rule": rule}


@api.delete("/admin/rules/{key}")
async def admin_delete_rule(key: str, _: Dict[str, Any] = Depends(admin_user)):
    res = await db.rules.delete_one({"key": key})
    return {"deleted": res.deleted_count}


@api.post("/admin/daily")
async def admin_set_daily(payload: DailyChallengeIn, _: Dict[str, Any] = Depends(admin_user)):
    today = _today_key()
    doc = {
        "id": str(uuid.uuid4()),
        "date": today,
        **payload.dict(),
        "auto_generated": False,
    }
    await db.daily.update_one({"date": today}, {"$set": doc}, upsert=True)
    doc.pop("_id", None)
    return {"challenge": doc}


@api.post("/admin/quizzes")
async def admin_create_quiz(payload: QuizIn, _: Dict[str, Any] = Depends(admin_user)):
    quiz = payload.dict()
    quiz["id"] = str(uuid.uuid4())
    quiz["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.quizzes.insert_one(dict(quiz))
    quiz.pop("_id", None)
    return {"quiz": quiz}


@api.delete("/admin/quizzes/{quiz_id}")
async def admin_delete_quiz(quiz_id: str, _: Dict[str, Any] = Depends(admin_user)):
    res = await db.quizzes.delete_one({"id": quiz_id})
    return {"deleted": res.deleted_count}


@api.get("/admin/users")
async def admin_users(_: Dict[str, Any] = Depends(admin_user)):
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(200)
    return {"users": users}


@api.get("/")
async def root():
    return {"app": "RuleForge Chess", "ok": True}


# -----------------------------------------------------------------------------
# Startup: indexes + seeding
# -----------------------------------------------------------------------------
DEFAULT_RULES = [
    {
        "key": "classic",
        "name": "Classic Chess",
        "description": "The pure, timeless game. No twists, just strategy.",
        "color": "#EAB308",
        "icon": "crown",
        "long_explanation": (
            "Classic chess follows the standard FIDE rules. White moves first, the "
            "objective is to checkmate the opponent's king. All special moves apply: "
            "castling, en passant, and pawn promotion."
        ),
        "examples": [
            "Develop knights and bishops in the opening.",
            "Castle early to keep your king safe.",
            "Look for tactics: forks, pins, skewers.",
        ],
        "premium": False,
    },
    {
        "key": "king_dash",
        "name": "King Dash",
        "description": "Once per game, your King may sprint two squares in any direction.",
        "color": "#06B6D4",
        "icon": "zap",
        "long_explanation": (
            "Your King has one extra power move per game: it can leap exactly two "
            "squares horizontally, vertically, or diagonally — provided the path and "
            "target square are not under attack and the target is empty or holds an "
            "enemy piece. Use it to escape danger, race to a key square, or surprise "
            "an attacker."
        ),
        "examples": [
            "Escape a pin by dashing two squares sideways.",
            "Activate your king in an endgame instantly.",
            "Save a Dash for a critical moment — once it's used, it's gone.",
        ],
        "premium": False,
    },
    {
        "key": "power_pawns",
        "name": "Power Pawns",
        "description": "Pawns on rank 5+ may also slide one square sideways.",
        "color": "#EF4444",
        "icon": "flame",
        "long_explanation": (
            "Pawns are weak no more. Once a pawn reaches its 5th rank (rank 5 for "
            "White, rank 4 for Black), it can move one square sideways to an empty "
            "square in addition to its normal moves. Sideways moves do not capture."
        ),
        "examples": [
            "Slide a power pawn to support an attack.",
            "Reposition for a stronger promotion path.",
            "Power pawns make passed pawns extra dangerous.",
        ],
        "premium": False,
    },
    {
        "key": "swap_move",
        "name": "Swap Move",
        "description": "Once per game, swap any two of your own non-king pieces.",
        "color": "#10B981",
        "icon": "shuffle",
        "long_explanation": (
            "Once per game, on your turn, you may use your Swap instead of moving. "
            "Choose any two of your own pieces (not the King) and swap their squares. "
            "After the swap, your turn ends. The swap counts as your move."
        ),
        "examples": [
            "Swap a stuck bishop with an active knight.",
            "Move a defender to your weak king side.",
            "Save it for a tactical, game-changing moment.",
        ],
        "premium": False,
    },
]

DEFAULT_QUIZZES = [
    {
        "rule_key": "king_dash",
        "question": "How many times can the King Dash be used per game?",
        "options": ["Once", "Twice", "Unlimited", "Once per turn"],
        "correct_index": 0,
        "explanation": "King Dash is a one-time power move per game per side.",
    },
    {
        "rule_key": "king_dash",
        "question": "Can the King Dash through a square that is attacked?",
        "options": ["Yes", "No"],
        "correct_index": 1,
        "explanation": "Like castling, the king cannot move through attacked squares.",
    },
    {
        "rule_key": "power_pawns",
        "question": "From which rank does a White pawn gain sideways movement?",
        "options": ["Rank 3", "Rank 4", "Rank 5", "Rank 6"],
        "correct_index": 2,
        "explanation": "Pawns gain sideways movement when they reach their 5th rank.",
    },
    {
        "rule_key": "power_pawns",
        "question": "Can a power pawn capture sideways?",
        "options": ["Yes", "No"],
        "correct_index": 1,
        "explanation": "Sideways pawn moves are non-capturing, only to empty squares.",
    },
    {
        "rule_key": "swap_move",
        "question": "Can the King be part of a Swap?",
        "options": ["Yes", "No"],
        "correct_index": 1,
        "explanation": "The King cannot be swapped — it would be too disruptive.",
    },
    {
        "rule_key": "swap_move",
        "question": "After a Swap, what happens?",
        "options": [
            "You get another move",
            "Your turn ends",
            "Opponent skips a turn",
            "Random rule triggers",
        ],
        "correct_index": 1,
        "explanation": "Using your Swap counts as your move — the turn passes.",
    },
    {
        "rule_key": "classic",
        "question": "Which side moves first in classic chess?",
        "options": ["Black", "White", "Random", "Higher Elo"],
        "correct_index": 1,
        "explanation": "White always moves first in standard chess.",
    },
]


async def seed_admin():
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@ruleforge.app").lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "Admin@1234")
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "email": admin_email,
            "password_hash": hash_password(admin_password),
            "name": "RuleForge Admin",
            "role": "admin",
            "is_guest": False,
            "xp": 0, "coins": 0, "elo": 1200,
            "streak": 0, "longest_streak": 0,
            "badges": ["founder"],
            "wins": 0, "losses": 0, "draws": 0,
            "premium": True,
            "avatar": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        logger.info("Seeded admin %s", admin_email)
    else:
        # Keep password in sync with .env so resets work even after env edits.
        if not verify_password(admin_password, existing.get("password_hash", "")):
            await db.users.update_one(
                {"email": admin_email},
                {"$set": {"password_hash": hash_password(admin_password), "role": "admin"}},
            )
            logger.info("Updated admin password for %s", admin_email)


async def seed_test_user():
    email = "player1@ruleforge.app"
    if not await db.users.find_one({"email": email}):
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "email": email,
            "password_hash": hash_password("Player@1234"),
            "name": "Test Player",
            "role": "user",
            "is_guest": False,
            "xp": 0, "coins": 100, "elo": 800,
            "streak": 0, "longest_streak": 0, "badges": [],
            "wins": 0, "losses": 0, "draws": 0,
            "premium": False, "avatar": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        logger.info("Seeded test user %s", email)


async def seed_rules():
    for rule in DEFAULT_RULES:
        existing = await db.rules.find_one({"key": rule["key"]})
        if not existing:
            doc = dict(rule)
            doc["id"] = str(uuid.uuid4())
            doc["updated_at"] = datetime.now(timezone.utc).isoformat()
            await db.rules.insert_one(doc)


async def seed_quizzes():
    if await db.quizzes.count_documents({}) == 0:
        docs = []
        for q in DEFAULT_QUIZZES:
            d = dict(q)
            d["id"] = str(uuid.uuid4())
            d["created_at"] = datetime.now(timezone.utc).isoformat()
            docs.append(d)
        await db.quizzes.insert_many(docs)


@app.on_event("startup")
async def on_startup():
    _ensure_thread_pool()
    try:
        # Cleanup legacy guest docs that had email explicitly set to null — they
        # collide with the unique index. We unset the field entirely so partial
        # index will ignore them.
        await db.users.update_many({"email": None}, {"$unset": {"email": ""}})
        # Drop legacy sparse index if present so we can rebuild as partial.
        try:
            indexes = await db.users.index_information()
            if "email_1" in indexes and not indexes["email_1"].get("partialFilterExpression"):
                await db.users.drop_index("email_1")
        except Exception as ix_e:
            logger.warning("Index cleanup issue: %s", ix_e)
        await db.users.create_index(
            "email",
            unique=True,
            partialFilterExpression={"email": {"$type": "string"}},
        )
        await db.users.create_index("id", unique=True)
        await db.rules.create_index("key", unique=True)
        await db.matches.create_index("user_id")
        await db.online_games.create_index("id", unique=True)
        await db.online_games.create_index("status")
        await db.online_games.create_index([("updated_at", -1)])
        await db.online_games.create_index(
            [("player_ids", 1)],
            unique=True,
            partialFilterExpression={"status": "ongoing", "player_ids": {"$exists": True}},
        )
        await db.online_moves.create_index([("game_id", 1), ("created_at", 1)])
        await db.rating_history.create_index([("user_id", 1), ("created_at", -1)])
        await db.friends.create_index("id", unique=True)
        await db.friends.create_index([("user_id", 1), ("friend_id", 1), ("status", 1)])
        await db.friends.create_index([("friend_id", 1), ("status", 1)])
        await db.challenges.create_index("id", unique=True)
        await db.challenges.create_index([("receiver_id", 1), ("status", 1), ("expires_at", 1)])
        await db.challenges.create_index([("sender_id", 1), ("status", 1), ("created_at", -1)])
        await db.notifications.create_index([("user_id", 1), ("is_read", 1), ("created_at", -1)])
        await db.daily.create_index("date", unique=True)
        await db.daily_completions.create_index([("user_id", 1), ("date", 1)], unique=True)
    except Exception as e:
        logger.warning("Index init issue: %s", e)
    await seed_admin()
    await seed_test_user()
    await seed_rules()
    await seed_quizzes()
    try:
        from retention import seed_puzzles as _sp
        await _sp(db)
    except Exception as e:
        logger.warning("Puzzle seed issue: %s", e)
    try:
        from monetization import seed_store as _ss
        await _ss(db)
    except Exception as e:
        logger.warning("Store seed issue: %s", e)
    try:
        from viral import seed_badges as _sb, seed_demo_tournaments as _st
        await _sb(db)
        await _st(db)
    except Exception as e:
        logger.warning("Viral seed issue: %s", e)
    logger.info("RuleForge Chess startup complete.")


@app.on_event("shutdown")
async def on_shutdown():
    client.close()


app.include_router(api)

# Realtime + Social (multiplayer / friends / challenges / notifications)
from realtime import ws_router  # noqa: E402
from social import make_social_router  # noqa: E402
from retention import (  # noqa: E402
    make_retention_router,
    _public_user as retention_public_user,
)

app.include_router(ws_router)  # /api/ws WebSocket
social_router = make_social_router(current_user, _db_getter)
app.include_router(social_router, prefix="/api")
retention_router = make_retention_router(current_user, _db_getter, None)
app.include_router(retention_router, prefix="/api")

# Monetization (wallet, store, inventory, preferences, premium, ads)
from monetization import make_monetization_router  # noqa: E402
monetization_router = make_monetization_router(current_user, _db_getter)
app.include_router(monetization_router, prefix="/api")

# Viral / scale (tournaments, watch live, badges, featured, share)
from viral import make_viral_router  # noqa: E402
from realtime import games as _live_games_manager  # noqa: E402
viral_router = make_viral_router(
    current_user, _db_getter,
    push_notification_fn=None,
    get_realtime_rooms=lambda: _live_games_manager,
)
app.include_router(viral_router, prefix="/api")

# QA / bug tracker / release readiness dashboard (admin-only)
from qa import make_qa_router  # noqa: E402
qa_router = make_qa_router(current_user, _db_getter)
app.include_router(qa_router, prefix="/api")

# Override the existing public_user to use the richer retention version
public_user = retention_public_user  # noqa: F811
