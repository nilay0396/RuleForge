"""pytest fixtures shared across unit + API tests.

Lightweight: spins up an httpx.AsyncClient against the running FastAPI server
(via supervisor) and creates fresh test users on demand.
"""
import os
import uuid
from pathlib import Path
import pytest_asyncio
import httpx
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / 'backend' / '.env')

BACKEND = os.environ.get('TEST_BACKEND_URL', 'http://localhost:8001')
API = f"{BACKEND}/api"


@pytest_asyncio.fixture
async def client():
    async with httpx.AsyncClient(base_url=API, timeout=30) as c:
        yield c


@pytest_asyncio.fixture
async def fresh_user(client: httpx.AsyncClient):
    """Register a unique user and return {user, token, auth_headers}."""
    email = f"qa-{uuid.uuid4().hex[:10]}@ruleforgeqa.app"
    password = 'QaTest@1234'
    name = 'QA Test User'
    r = await client.post('/auth/register', json={'email': email, 'password': password, 'name': name})
    assert r.status_code in (200, 201), f"register failed: {r.text}"
    data = r.json()
    headers = {'Authorization': f"Bearer {data['token']}"}
    return {'user': data['user'], 'token': data['token'], 'headers': headers, 'email': email, 'password': password}


@pytest_asyncio.fixture
async def admin_user(client: httpx.AsyncClient):
    r = await client.post('/auth/login', json={'email': 'admin@ruleforge.app', 'password': 'Admin@1234'})
    assert r.status_code == 200, f"admin login failed: {r.text}"
    data = r.json()
    return {'user': data['user'], 'token': data['token'], 'headers': {'Authorization': f"Bearer {data['token']}"}}


@pytest_asyncio.fixture
async def player1(client: httpx.AsyncClient):
    r = await client.post('/auth/login', json={'email': 'player1@ruleforge.app', 'password': 'Player@1234'})
    assert r.status_code == 200
    data = r.json()
    return {'user': data['user'], 'token': data['token'], 'headers': {'Authorization': f"Bearer {data['token']}"}}
