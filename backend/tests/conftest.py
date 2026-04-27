import os
import pytest
import requests

BASE_URL = "https://rule-master-1.preview.emergentagent.com"


@pytest.fixture(scope="session")
def base_url():
    return BASE_URL


@pytest.fixture
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "admin@ruleforge.app", "password": "Admin@1234"},
        timeout=20,
    )
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def player_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "player1@ruleforge.app", "password": "Player@1234"},
        timeout=20,
    )
    assert r.status_code == 200, f"Player login failed: {r.status_code} {r.text}"
    return r.json()["token"]


def auth_headers(token: str):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
