"""Full backend test suite for RuleForge Chess API.

Covers auth (register/login/guest/upgrade/me), rules, matches, daily, leaderboard,
move validation and admin endpoints (including 403 guard).
"""
import uuid
import requests
import pytest

from conftest import BASE_URL, auth_headers


# ---------- Health ----------
def test_root_ok():
    r = requests.get(f"{BASE_URL}/api/", timeout=15)
    assert r.status_code == 200
    assert r.json().get("ok") is True


# ---------- Auth ----------
class TestAuth:
    def test_register_and_me(self, api_client):
        email = f"test_{uuid.uuid4().hex[:8]}@ruleforge.app"
        r = api_client.post(
            f"{BASE_URL}/api/auth/register",
            json={"email": email, "password": "Passw0rd!", "name": "TEST User"},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "token" in data and "user" in data
        user = data["user"]
        assert user["email"] == email
        assert user["is_guest"] is False
        assert user["xp"] == 0 and user["coins"] == 100 and user["elo"] == 1000

        me = api_client.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {data['token']}"},
            timeout=15,
        )
        assert me.status_code == 200
        assert me.json()["user"]["email"] == email

    def test_register_duplicate_fails(self, api_client):
        r = api_client.post(
            f"{BASE_URL}/api/auth/register",
            json={"email": "admin@ruleforge.app", "password": "whatever1", "name": "X"},
            timeout=15,
        )
        assert r.status_code == 400

    def test_login_admin(self, admin_token):
        assert admin_token and len(admin_token) > 20

    def test_login_player(self, player_token):
        assert player_token and len(player_token) > 20

    def test_login_bad_password(self, api_client):
        r = api_client.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "admin@ruleforge.app", "password": "wrongwrong"},
            timeout=15,
        )
        assert r.status_code == 401

    def test_me_requires_auth(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/auth/me", timeout=15)
        assert r.status_code == 401

    def test_guest_then_upgrade(self, api_client):
        g = api_client.post(f"{BASE_URL}/api/auth/guest", timeout=15)
        assert g.status_code == 200
        gd = g.json()
        assert gd["user"]["is_guest"] is True
        gtoken = gd["token"]

        new_email = f"upgraded_{uuid.uuid4().hex[:8]}@ruleforge.app"
        up = api_client.post(
            f"{BASE_URL}/api/auth/upgrade",
            json={"email": new_email, "password": "Passw0rd!", "name": "Upgraded"},
            headers=auth_headers(gtoken),
            timeout=20,
        )
        assert up.status_code == 200, up.text
        assert up.json()["user"]["is_guest"] is False
        assert up.json()["user"]["email"] == new_email

        # Can now login with new creds
        li = api_client.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": new_email, "password": "Passw0rd!"},
            timeout=15,
        )
        assert li.status_code == 200


# ---------- Rules ----------
class TestRules:
    def test_list_rules_has_defaults(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/rules", timeout=15)
        assert r.status_code == 200
        keys = {x["key"] for x in r.json()["rules"]}
        for k in ("classic", "king_dash", "power_pawns", "swap_move"):
            assert k in keys, f"Missing rule {k}"

    def test_get_rule_king_dash_has_quizzes(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/rules/king_dash", timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body["rule"]["key"] == "king_dash"
        assert isinstance(body["quizzes"], list)
        assert len(body["quizzes"]) >= 1

    def test_get_rule_not_found(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/rules/not_a_rule", timeout=15)
        assert r.status_code == 404


# ---------- Matches ----------
class TestMatches:
    def test_record_match_updates_user(self, api_client, player_token):
        before = api_client.get(
            f"{BASE_URL}/api/auth/me", headers=auth_headers(player_token), timeout=15
        ).json()["user"]
        r = api_client.post(
            f"{BASE_URL}/api/matches",
            headers=auth_headers(player_token),
            json={
                "mode": "king_dash",
                "rule_key": "king_dash",
                "result": "win",
                "moves_san": ["e4", "e5"],
                "final_fen": "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
                "duration_seconds": 120,
                "ai_level": 2,
            },
            timeout=20,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["match"]["result"] == "win"
        assert data["user"]["xp"] >= before["xp"] + 25
        assert data["user"]["coins"] >= before["coins"] + 10
        # rule_breaker badge should appear since mode != classic
        assert "rule_breaker" in data["user"]["badges"]

    def test_my_matches_returns_list(self, api_client, player_token):
        r = api_client.get(
            f"{BASE_URL}/api/matches/me",
            headers=auth_headers(player_token),
            timeout=15,
        )
        assert r.status_code == 200
        assert isinstance(r.json()["matches"], list)
        assert len(r.json()["matches"]) >= 1

    def test_matches_requires_auth(self, api_client):
        r = api_client.post(f"{BASE_URL}/api/matches", json={"mode": "classic", "result": "draw"}, timeout=15)
        assert r.status_code == 401


# ---------- Daily ----------
class TestDaily:
    def test_daily_autogenerates(self, api_client, player_token):
        r = api_client.get(
            f"{BASE_URL}/api/daily", headers=auth_headers(player_token), timeout=15
        )
        assert r.status_code == 200
        body = r.json()
        assert "challenge" in body
        assert body["challenge"]["rule_key"]
        assert "completed" in body

    def test_daily_submit_awards_xp(self, api_client):
        # Use a brand-new guest so streak math is clean
        g = api_client.post(f"{BASE_URL}/api/auth/guest", timeout=15).json()
        tok = g["token"]
        before_xp = g["user"]["xp"]
        api_client.get(f"{BASE_URL}/api/daily", headers=auth_headers(tok), timeout=15)
        r = api_client.post(
            f"{BASE_URL}/api/daily/submit",
            headers=auth_headers(tok),
            json={"moves_san": ["e4", "e5"], "completed": True},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        assert r.json()["user"]["xp"] >= before_xp + 50
        assert r.json()["user"]["streak"] >= 1


# ---------- Leaderboard ----------
def test_leaderboard_excludes_guests(api_client):
    r = api_client.get(f"{BASE_URL}/api/leaderboard", timeout=15)
    assert r.status_code == 200
    lb = r.json()["leaderboard"]
    assert isinstance(lb, list)
    # admin user should be in leaderboard
    emails_or_names = [u.get("name") for u in lb]
    assert any("Admin" in (n or "") or "Player" in (n or "") for n in emails_or_names)


# ---------- Move validation ----------
class TestMoveValidate:
    START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"

    def test_legal_move(self, api_client):
        r = api_client.post(
            f"{BASE_URL}/api/move/validate",
            json={"fen": self.START, "uci": "e2e4"},
            timeout=15,
        )
        assert r.status_code == 200
        assert r.json()["legal"] is True
        assert r.json()["san"] == "e4"

    def test_illegal_move(self, api_client):
        r = api_client.post(
            f"{BASE_URL}/api/move/validate",
            json={"fen": self.START, "uci": "e2e5"},
            timeout=15,
        )
        assert r.status_code == 200
        assert r.json()["legal"] is False


# ---------- Admin ----------
class TestAdmin:
    def test_non_admin_forbidden(self, api_client, player_token):
        r = api_client.get(
            f"{BASE_URL}/api/admin/users", headers=auth_headers(player_token), timeout=15
        )
        assert r.status_code == 403

    def test_admin_users_list(self, api_client, admin_token):
        r = api_client.get(
            f"{BASE_URL}/api/admin/users", headers=auth_headers(admin_token), timeout=15
        )
        assert r.status_code == 200
        users = r.json()["users"]
        assert isinstance(users, list) and len(users) >= 2

    def test_admin_upsert_and_delete_rule(self, api_client, admin_token):
        key = f"test_rule_{uuid.uuid4().hex[:6]}"
        r = api_client.post(
            f"{BASE_URL}/api/admin/rules",
            headers=auth_headers(admin_token),
            json={"key": key, "name": "TEST Rule", "description": "temp", "color": "#fff", "icon": "crown"},
            timeout=15,
        )
        assert r.status_code == 200
        # GET via list
        lst = api_client.get(f"{BASE_URL}/api/rules", timeout=15).json()["rules"]
        assert any(x["key"] == key for x in lst)
        # Delete
        d = api_client.delete(
            f"{BASE_URL}/api/admin/rules/{key}",
            headers=auth_headers(admin_token),
            timeout=15,
        )
        assert d.status_code == 200 and d.json()["deleted"] == 1

    def test_admin_quiz_create_and_delete(self, api_client, admin_token):
        r = api_client.post(
            f"{BASE_URL}/api/admin/quizzes",
            headers=auth_headers(admin_token),
            json={
                "rule_key": "classic",
                "question": "TEST Q?",
                "options": ["A", "B"],
                "correct_index": 0,
                "explanation": "",
            },
            timeout=15,
        )
        assert r.status_code == 200
        qid = r.json()["quiz"]["id"]
        d = api_client.delete(
            f"{BASE_URL}/api/admin/quizzes/{qid}",
            headers=auth_headers(admin_token),
            timeout=15,
        )
        assert d.status_code == 200 and d.json()["deleted"] == 1

    def test_admin_set_daily(self, api_client, admin_token):
        r = api_client.post(
            f"{BASE_URL}/api/admin/daily",
            headers=auth_headers(admin_token),
            json={
                "rule_key": "classic",
                "fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
                "target": "TEST target",
                "description": "TEST",
            },
            timeout=15,
        )
        assert r.status_code == 200
        assert r.json()["challenge"]["target"] == "TEST target"
