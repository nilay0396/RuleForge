"""Seed deterministic test users for QA / UAT runs.

Usage (from the repository root):
  python scripts/seed_test_users.py

Idempotent. Will not duplicate existing users.
"""
import asyncio
import os
import sys
import uuid
import hashlib
import secrets
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'backend'))
from dotenv import load_dotenv
load_dotenv(ROOT / 'backend' / '.env')
from motor.motor_asyncio import AsyncIOMotorClient

try:
    import bcrypt  # type: ignore
    def hash_pw(p: str) -> str:
        return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()
except Exception:
    def hash_pw(p: str) -> str:
        salt = secrets.token_hex(8)
        return f"sha256${salt}${hashlib.sha256((salt + p).encode()).hexdigest()}"


USERS = [
    {'email': 'admin@ruleforge.app', 'password': 'Admin@1234', 'name': 'GM Admin',
     'role': 'admin', 'elo': 1900, 'is_premium': True, 'is_featured': True, 'country': 'US',
     'wins': 50, 'losses': 5, 'draws': 3, 'coins': 5000, 'xp': 12000},
    {'email': 'player1@ruleforge.app', 'password': 'Player@1234', 'name': 'Test Player',
     'role': 'user', 'elo': 1050, 'country': 'IN', 'coins': 500, 'xp': 250},
    {'email': 'beginner@ruleforge.test', 'password': 'QaTest@1234', 'name': 'Beginner Bob',
     'role': 'user', 'elo': 700, 'country': 'US', 'wins': 1, 'losses': 8},
    {'email': 'highrating@ruleforge.test', 'password': 'QaTest@1234', 'name': 'GM Stella',
     'role': 'user', 'elo': 2100, 'country': 'NO', 'wins': 120, 'losses': 25, 'draws': 14,
     'is_featured': True},
    {'email': 'premium@ruleforge.test', 'password': 'QaTest@1234', 'name': 'Premium Pro',
     'role': 'user', 'elo': 1450, 'country': 'GB', 'is_premium': True, 'coins': 8000},
    {'email': 'celebrity@ruleforge.test', 'password': 'QaTest@1234', 'name': 'Streamer Sam',
     'role': 'user', 'elo': 1700, 'country': 'BR', 'is_featured': True, 'is_premium': True},
    {'email': 'friend_a@ruleforgeqa.app', 'password': 'QaTest@1234', 'name': 'Friend A',
     'role': 'user', 'elo': 950, 'country': 'CA'},
    {'email': 'friend_b@ruleforgeqa.app', 'password': 'QaTest@1234', 'name': 'Friend B',
     'role': 'user', 'elo': 970, 'country': 'CA'},
    {'email': 'tour_a@ruleforge.test', 'password': 'QaTest@1234', 'name': 'Tour A',
     'role': 'user', 'elo': 1200, 'country': 'DE'},
    {'email': 'tour_b@ruleforge.test', 'password': 'QaTest@1234', 'name': 'Tour B',
     'role': 'user', 'elo': 1180, 'country': 'FR'},
]


async def main():
    client = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = client[os.environ['DB_NAME']]
    upserts, creates = 0, 0
    for u in USERS:
        existing = await db.users.find_one({'email': u['email']}, {'_id': 0})
        if existing:
            patch = {k: v for k, v in u.items() if k != 'password'}
            patch.update({'updated_at': datetime.now(timezone.utc).isoformat()})
            await db.users.update_one({'email': u['email']}, {'$set': patch})
            upserts += 1
        else:
            doc = {
                'id': str(uuid.uuid4()),
                **{k: v for k, v in u.items() if k != 'password'},
                'password_hash': hash_pw(u['password']),
                'is_guest': False,
                'badges': [],
                'wins': u.get('wins', 0),
                'losses': u.get('losses', 0),
                'draws': u.get('draws', 0),
                'coins': u.get('coins', 0),
                'xp': u.get('xp', 0),
                'created_at': datetime.now(timezone.utc).isoformat(),
            }
            await db.users.insert_one(doc)
            creates += 1
    print(f'Seed complete — created {creates}, updated {upserts}.')

    # Friend pair
    fa = await db.users.find_one({'email': 'friend_a@ruleforgeqa.app'}, {'_id': 0, 'id': 1})
    fb = await db.users.find_one({'email': 'friend_b@ruleforgeqa.app'}, {'_id': 0, 'id': 1})
    if fa and fb:
        await db.friends.update_one(
            {'user_id': fa['id'], 'friend_id': fb['id']},
            {'$setOnInsert': {'id': str(uuid.uuid4()), 'user_id': fa['id'],
                              'friend_id': fb['id'], 'status': 'accepted',
                              'created_at': datetime.now(timezone.utc).isoformat()}},
            upsert=True,
        )
        await db.friends.update_one(
            {'user_id': fb['id'], 'friend_id': fa['id']},
            {'$setOnInsert': {'id': str(uuid.uuid4()), 'user_id': fb['id'],
                              'friend_id': fa['id'], 'status': 'accepted',
                              'created_at': datetime.now(timezone.utc).isoformat()}},
            upsert=True,
        )
    print('Friend pair seeded.')

if __name__ == '__main__':
    asyncio.run(main())
