"""Iteration 2 tests: ELO, rating history, scenarios."""
import math
import uuid
import requests

from conftest import BASE_URL, auth_headers


def _register_fresh(api_client):
    email = f"iter2_{uuid.uuid4().hex[:8]}@ruleforge.app"
    r = api_client.post(
        f"{BASE_URL}/api/auth/register",
        json={"email": email, "password": "Passw0rd!", "name": "ITER2"},
        timeout=20,
    )
    assert r.status_code == 200, r.text
    return r.json(), email


class TestFreshEloBase:
    def test_fresh_register_elo_is_800(self, api_client):
        data, _ = _register_fresh(api_client)
        assert data["user"]["elo"] == 800, f"expected 800 got {data['user']['elo']}"


class TestMatchEloFields:
    def test_match_returns_rating_fields_and_correct_delta(self, api_client):
        data, _ = _register_fresh(api_client)
        token = data["token"]
        # ai_level=2 -> opponent 900; player 800 -> expected win delta ~22
        r = api_client.post(
            f"{BASE_URL}/api/matches",
            headers=auth_headers(token),
            json={
                "mode": "king_dash",
                "rule_key": "king_dash",
                "result": "win",
                "moves_san": ["e4"],
                "ai_level": 2,
                "duration_seconds": 60,
            },
            timeout=20,
        )
        assert r.status_code == 200, r.text
        m = r.json()["match"]
        for k in ("rating_before", "rating_after", "opponent_rating", "elo_delta"):
            assert k in m, f"missing {k}"
        assert m["rating_before"] == 800
        assert m["opponent_rating"] == 900
        expected = round(32 * (1 - 1 / (1 + 10 ** ((900 - 800) / 400))))
        assert m["elo_delta"] == expected, f"elo_delta {m['elo_delta']} != expected {expected}"
        # ~22 sanity
        assert 20 <= m["elo_delta"] <= 24
        assert m["rating_after"] == m["rating_before"] + m["elo_delta"]


class TestRatingHistory:
    def test_rating_history_auth_required(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/rating/history", timeout=15)
        assert r.status_code == 401

    def test_rating_history_shape(self, api_client):
        data, _ = _register_fresh(api_client)
        token = data["token"]
        # record a match so history has entry
        api_client.post(
            f"{BASE_URL}/api/matches",
            headers=auth_headers(token),
            json={"mode": "classic", "rule_key": "classic", "result": "loss", "ai_level": 1},
            timeout=20,
        )
        r = api_client.get(
            f"{BASE_URL}/api/rating/history", headers=auth_headers(token), timeout=15
        )
        assert r.status_code == 200
        body = r.json()
        assert "history" in body and isinstance(body["history"], list)
        assert len(body["history"]) >= 1
        e = body["history"][0]
        for k in ("rating_before", "rating_after", "delta", "opponent_rating"):
            assert k in e, f"rating_history entry missing {k}"


class TestScenarios:
    def test_king_dash_has_3(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/rules/king_dash/scenarios", timeout=15)
        assert r.status_code == 200
        scs = r.json()["scenarios"]
        assert len(scs) == 3
        ids = [s["id"] for s in scs]
        assert ids == ["kd1", "kd2", "kd3"]
        # kd1 expected move e1g1
        kd1 = scs[0]
        assert kd1["expected_uci"] == "e1g1"
        assert kd1["fen"].startswith("4k3/8/8/8/8/8/4r3/4K3")

    def test_power_pawns_has_3(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/rules/power_pawns/scenarios", timeout=15)
        assert r.status_code == 200
        scs = r.json()["scenarios"]
        assert len(scs) == 3
        assert [s["id"] for s in scs] == ["pp1", "pp2", "pp3"]

    def test_swap_move_has_3(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/rules/swap_move/scenarios", timeout=15)
        assert r.status_code == 200
        scs = r.json()["scenarios"]
        assert len(scs) == 3
        assert [s["id"] for s in scs] == ["sm1", "sm2", "sm3"]
        assert scs[0]["expected_uci"] == "swap:a1b1"

    def test_classic_empty(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/rules/classic/scenarios", timeout=15)
        assert r.status_code == 200
        assert r.json()["scenarios"] == []
