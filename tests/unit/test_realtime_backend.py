import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend"))

from realtime import DEFAULT_TIME_CONTROL, LiveGame, _parse_time_control


def test_live_game_defaults_to_server_clock():
    game = LiveGame("g1", "white-user", "black-user", 800, 800)
    expected = _parse_time_control(DEFAULT_TIME_CONTROL)

    assert game.time_control == expected["label"]
    assert game.clock_initial_ms == expected["initial_ms"]
    assert game.clock_increment_ms == expected["increment_ms"]
    if expected["initial_ms"] is not None:
        assert game.to_dict()["clock_remaining_ms"]["w"] <= expected["initial_ms"]
        assert game.to_dict()["clock_remaining_ms"]["b"] == expected["initial_ms"]


def test_spend_turn_time_deducts_elapsed_and_adds_increment():
    game = LiveGame("g1", "white-user", "black-user", 800, 800, time_control="5+2")
    now = datetime.now(timezone.utc)
    game.clock_updated_at = now - timedelta(seconds=3)

    assert game.spend_turn_time("w", now=now) is True

    assert 298_000 <= game.clock_remaining_ms["w"] <= 299_000
    assert game.clock_remaining_ms["b"] == 300_000
    assert game.clock_updated_at == now


def test_timeout_winner_uses_side_to_move_clock():
    game = LiveGame("g1", "white-user", "black-user", 800, 800, time_control="5+0")
    game.clock_remaining_ms["w"] = 0

    assert game.flag_winner() == "black"

    game.board.push_uci("e2e4")
    game.clock_remaining_ms["b"] = 0
    assert game.flag_winner() == "white"


def test_live_game_restores_persisted_online_state():
    record = {
        "id": "persisted-game",
        "white_id": "white-user",
        "black_id": "black-user",
        "white_rating": 901,
        "black_rating": 899,
        "rule_key": "classic",
        "time_control": "3+2",
        "fen": "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
        "moves_san": ["e4", "e5"],
        "status": "ongoing",
        "created_at": "2026-05-13T00:00:00+00:00",
        "last_activity": "2026-05-13T00:00:05+00:00",
        "clock_updated_at": "2026-05-13T00:00:05+00:00",
        "clock_initial_ms": 180_000,
        "clock_increment_ms": 2_000,
        "clock_remaining_ms": {"w": 177_000, "b": 179_000},
        "draw_offer_by": "black-user",
    }

    game = LiveGame.from_record(record)

    assert game.id == "persisted-game"
    assert game.board.fen() == record["fen"]
    assert game.moves_san == ["e4", "e5"]
    assert game.clock_remaining_ms == {"w": 177_000, "b": 179_000}
    assert game.draw_offer_by == "black-user"
    assert game.to_dict()["draw_offer_color"] == "b"
