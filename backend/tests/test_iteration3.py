"""Iteration 3 tests: WebSocket multiplayer, friends, challenges, notifications.

Covers:
- WS auth (101 upgrade w/ valid token, close 1008 w/ invalid token)
- Matchmaking: two users -> match_found w/ correct shape
- Move sync: white plays e4 -> both receive 'move'; black plays e5 succeeds; turn enforcement
- Resignation -> game_over with rating delta + persistence
- REST: /online, /users/search, /friends/request + accept (+ notifications)
- REST: /challenges + /challenges/{id}/accept (broadcasts match_found over WS)
- REST: /notifications + /notifications/read-all
"""
from __future__ import annotations

import asyncio
import json
import os
import time
from urllib.parse import urlparse

import pytest
import requests
import websockets

from conftest import BASE_URL, auth_headers


def _ws_url() -> str:
    p = urlparse(BASE_URL)
    scheme = "wss" if p.scheme == "https" else "ws"
    return f"{scheme}://{p.netloc}/api/ws"


async def _recv_until(ws, type_predicate, timeout=10.0):
    """Receive frames until predicate(msg) returns True; ignores non-matching frames."""
    end = time.time() + timeout
    while time.time() < end:
        remaining = end - time.time()
        try:
            raw = await asyncio.wait_for(ws.recv(), timeout=remaining)
        except asyncio.TimeoutError:
            raise AssertionError("Timeout waiting for matching frame")
        try:
            msg = json.loads(raw)
        except Exception:
            continue
        if type_predicate(msg):
            return msg
    raise AssertionError("Timeout waiting for matching frame")


# --------------------------- WebSocket auth ---------------------------
class TestWebSocketAuth:
    def test_invalid_token_closes_1008(self):
        async def run():
            url = f"{_ws_url()}?token=garbage"
            try:
                async with websockets.connect(url) as ws:
                    # Server should close immediately
                    await asyncio.wait_for(ws.recv(), timeout=5)
                    return None
            except websockets.exceptions.InvalidStatus as e:
                # If server rejects the upgrade w/ HTTP we land here
                return ("invalid_status", getattr(e.response, "status_code", None))
            except websockets.exceptions.ConnectionClosed as e:
                return ("closed", e.code)

        result = asyncio.run(run())
        assert result is not None, "expected close on invalid token"
        kind, code = result
        # Acceptable: either policy-violation close after upgrade, or rejected upgrade
        assert (kind == "closed" and code == 1008) or kind == "invalid_status", (
            f"unexpected close: kind={kind} code={code}"
        )

    def test_valid_token_connects_and_receives_hello(self, player_token):
        async def run():
            url = f"{_ws_url()}?token={player_token}"
            async with websockets.connect(url) as ws:
                msg = await _recv_until(ws, lambda m: m.get("type") == "hello", timeout=8)
                return msg

        msg = asyncio.run(run())
        assert msg["type"] == "hello"
        assert "user" in msg and "id" in msg["user"]


# --------------------------- Matchmaking + Move + Resign ---------------------------
class TestMultiplayerFlow:
    def test_match_move_resign_full_flow(self, admin_token, player_token):
        """End-to-end: match_found -> e4 (white) -> e5 (black) -> resign (white) -> game_over."""

        async def run():
            url_a = f"{_ws_url()}?token={admin_token}"
            url_p = f"{_ws_url()}?token={player_token}"
            async with websockets.connect(url_a) as wa, websockets.connect(url_p) as wp:
                # Drain hello/presence
                await _recv_until(wa, lambda m: m.get("type") == "hello")
                await _recv_until(wp, lambda m: m.get("type") == "hello")

                # First user sends find_match, expect 'searching'
                await wa.send(json.dumps({"type": "find_match", "rule_key": "classic"}))
                # Second user sends find_match
                await wp.send(json.dumps({"type": "find_match", "rule_key": "classic"}))

                ma = await _recv_until(wa, lambda m: m.get("type") == "match_found", timeout=10)
                mp = await _recv_until(wp, lambda m: m.get("type") == "match_found", timeout=10)

                # Assertions on shape
                for m in (ma, mp):
                    assert m["game_id"] == ma["game_id"]
                    assert m["fen"].startswith("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w")
                    assert "white" in m and "black" in m
                    assert m["your_color"] in ("w", "b")
                assert ma["your_color"] != mp["your_color"], "Both players got same color"

                # Identify white-side and black-side sockets
                if ma["your_color"] == "w":
                    ws_white, ws_black = wa, wp
                else:
                    ws_white, ws_black = wp, wa
                game_id = ma["game_id"]

                # Black tries to move first -> expect 'error: not your turn'
                await ws_black.send(json.dumps({"type": "make_move", "game_id": game_id, "from": "e7", "to": "e5"}))
                err = await _recv_until(ws_black, lambda m: m.get("type") == "error", timeout=5)
                assert "not your turn" in err.get("error", "").lower()

                # White plays e2-e4
                await ws_white.send(json.dumps({"type": "make_move", "game_id": game_id, "from": "e2", "to": "e4"}))
                mv_w = await _recv_until(ws_white, lambda m: m.get("type") == "move", timeout=5)
                mv_b = await _recv_until(ws_black, lambda m: m.get("type") == "move", timeout=5)
                for mv in (mv_w, mv_b):
                    assert mv["san"] == "e4"
                    assert mv["moves_san"] == ["e4"]
                    assert mv["turn"] == "b"
                    assert "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR" in mv["fen"]

                # Black plays e5 successfully
                await ws_black.send(json.dumps({"type": "make_move", "game_id": game_id, "from": "e7", "to": "e5"}))
                mv2 = await _recv_until(ws_white, lambda m: m.get("type") == "move", timeout=5)
                assert mv2["san"] == "e5"
                assert mv2["moves_san"] == ["e4", "e5"]
                assert mv2["turn"] == "w"

                # White resigns
                await ws_white.send(json.dumps({"type": "resign", "game_id": game_id}))
                go_w = await _recv_until(ws_white, lambda m: m.get("type") == "game_over", timeout=5)
                go_b = await _recv_until(ws_black, lambda m: m.get("type") == "game_over", timeout=5)
                assert go_w["result"] == "loss"
                assert go_b["result"] == "win"
                assert go_w["reason"] == "Resignation"
                assert "delta" in go_w and "rating_after" in go_w
                return True

        ok = asyncio.run(run())
        assert ok is True

        # Verify rating_history persisted
        r = requests.get(f"{BASE_URL}/api/rating/history", headers=auth_headers(admin_token), timeout=15)
        assert r.status_code == 200
        history = r.json().get("history", [])
        assert any(h.get("rule_key") == "classic" for h in history), "no online rating history entry persisted"


# --------------------------- REST endpoints ---------------------------
class TestSocialREST:
    def test_online_endpoint_returns_list(self, player_token):
        r = requests.get(f"{BASE_URL}/api/online", headers=auth_headers(player_token), timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert "online" in body and isinstance(body["online"], list)

    def test_users_search(self, admin_token):
        r = requests.get(
            f"{BASE_URL}/api/users/search?q=Test",
            headers=auth_headers(admin_token),
            timeout=15,
        )
        assert r.status_code == 200
        users = r.json().get("users", [])
        # Test Player should appear (from seed). Allow case-insensitive substring match
        assert any("test" in (u.get("name", "")).lower() for u in users), f"Test user not found: {users}"

    def test_users_search_short_query_returns_empty(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/users/search?q=t", headers=auth_headers(admin_token), timeout=15)
        assert r.status_code == 200
        assert r.json().get("users") == []

    def test_friend_request_and_accept_with_notifications(self, admin_token, player_token):
        # Get IDs
        admin = requests.get(f"{BASE_URL}/api/auth/me", headers=auth_headers(admin_token), timeout=15).json()["user"]
        player = requests.get(f"{BASE_URL}/api/auth/me", headers=auth_headers(player_token), timeout=15).json()["user"]

        # admin -> player
        r = requests.post(
            f"{BASE_URL}/api/friends/request",
            headers=auth_headers(admin_token),
            json={"friend_id": player["id"]},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        friendship = r.json()["friendship"]
        assert friendship["status"] in ("pending", "accepted")  # idempotent
        fid = friendship["id"]

        # Player should have a friend_request notification
        r2 = requests.get(f"{BASE_URL}/api/notifications", headers=auth_headers(player_token), timeout=15)
        assert r2.status_code == 200
        notifs = r2.json().get("notifications", [])
        assert any(n.get("type") == "friend_request" for n in notifs), "no friend_request notification"

        # If still pending, accept
        if friendship["status"] == "pending":
            r3 = requests.post(
                f"{BASE_URL}/api/friends/{fid}/accept",
                headers=auth_headers(player_token),
                timeout=15,
            )
            assert r3.status_code == 200, r3.text

            # Admin should now have a friend_accepted notification
            r4 = requests.get(f"{BASE_URL}/api/notifications", headers=auth_headers(admin_token), timeout=15)
            assert r4.status_code == 200
            anotifs = r4.json().get("notifications", [])
            assert any(n.get("type") == "friend_accepted" for n in anotifs), "no friend_accepted notification"

    def test_notifications_read_all(self, player_token):
        r = requests.post(
            f"{BASE_URL}/api/notifications/read-all",
            headers=auth_headers(player_token),
            timeout=15,
        )
        assert r.status_code == 200
        # Verify
        r2 = requests.get(f"{BASE_URL}/api/notifications", headers=auth_headers(player_token), timeout=15)
        assert r2.status_code == 200
        assert r2.json().get("unread", 0) == 0


# --------------------------- Challenges ---------------------------
class TestChallenges:
    def test_create_and_accept_challenge_emits_match_found(self, admin_token, player_token):
        admin = requests.get(f"{BASE_URL}/api/auth/me", headers=auth_headers(admin_token), timeout=15).json()["user"]
        player = requests.get(f"{BASE_URL}/api/auth/me", headers=auth_headers(player_token), timeout=15).json()["user"]

        # admin challenges player
        r = requests.post(
            f"{BASE_URL}/api/challenges",
            headers=auth_headers(admin_token),
            json={"receiver_id": player["id"], "rule_key": "classic"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        ch = r.json()["challenge"]
        assert ch["status"] == "pending"
        cid = ch["id"]

        # Player should have challenge_received notification
        notifs = requests.get(f"{BASE_URL}/api/notifications", headers=auth_headers(player_token), timeout=15).json()["notifications"]
        assert any(n.get("type") == "challenge_received" for n in notifs)

        # Accept challenge — both must be connected over WS to receive match_found
        async def run_accept():
            url_a = f"{_ws_url()}?token={admin_token}"
            url_p = f"{_ws_url()}?token={player_token}"
            async with websockets.connect(url_a) as wa, websockets.connect(url_p) as wp:
                await _recv_until(wa, lambda m: m.get("type") == "hello")
                await _recv_until(wp, lambda m: m.get("type") == "hello")

                # Receiver accepts via REST
                rr = requests.post(
                    f"{BASE_URL}/api/challenges/{cid}/accept",
                    headers=auth_headers(player_token),
                    timeout=15,
                )
                assert rr.status_code == 200, rr.text
                body = rr.json()
                assert body.get("ok") is True
                assert "game_id" in body

                # Both should receive match_found
                ma = await _recv_until(wa, lambda m: m.get("type") == "match_found", timeout=8)
                mp = await _recv_until(wp, lambda m: m.get("type") == "match_found", timeout=8)
                assert ma["game_id"] == mp["game_id"] == body["game_id"]
                assert ma.get("challenge_id") == cid

                # Cleanup: white resigns to free user games
                if ma["your_color"] == "w":
                    await wa.send(json.dumps({"type": "resign", "game_id": body["game_id"]}))
                else:
                    await wp.send(json.dumps({"type": "resign", "game_id": body["game_id"]}))
                # drain game_over
                try:
                    await asyncio.wait_for(wa.recv(), timeout=3)
                    await asyncio.wait_for(wp.recv(), timeout=3)
                except Exception:
                    pass

        asyncio.run(run_accept())
