import asyncio
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend"))

from realtime import DEFAULT_TIME_CONTROL, LiveGame, MatchmakingQueue, _parse_time_control


class _AsyncCursor:
    def __init__(self, docs):
        self.docs = docs

    def sort(self, key, direction):
        reverse = direction < 0
        self.docs.sort(key=lambda doc: doc.get(key), reverse=reverse)
        return self

    def limit(self, count):
        self.docs = self.docs[:count]
        return self

    def __aiter__(self):
        self._iter = iter(self.docs)
        return self

    async def __anext__(self):
        try:
            return next(self._iter)
        except StopIteration as exc:
            raise StopAsyncIteration from exc


class _FakeCollection:
    def __init__(self):
        self.docs = {}

    def find(self, query, projection=None):
        return _AsyncCursor([self._project(doc, projection) for doc in self.docs.values() if self._matches(doc, query)])

    async def update_one(self, filter_doc, update_doc, upsert=False):
        doc = self.docs.get(filter_doc["id"], {}) if upsert else self.docs[filter_doc["id"]]
        doc.update(update_doc.get("$set", {}))
        self.docs[filter_doc["id"]] = doc

    async def find_one_and_update(self, filter_doc, update_doc, projection=None, return_document=None):
        for doc in self.docs.values():
            if self._matches(doc, filter_doc):
                doc.update(update_doc.get("$set", {}))
                return self._project(doc, projection)
        return None

    async def delete_many(self, query):
        for key, doc in list(self.docs.items()):
            if self._matches(doc, query):
                del self.docs[key]

    def _project(self, doc, projection):
        result = dict(doc)
        if projection and projection.get("_id") == 0:
            result.pop("_id", None)
        return result

    def _matches(self, doc, query):
        for key, expected in query.items():
            if key == "$or":
                if not any(self._matches(doc, option) for option in expected):
                    return False
                continue
            actual = doc.get(key)
            if isinstance(expected, dict):
                if "$ne" in expected and actual == expected["$ne"]:
                    return False
                if "$lte" in expected and not (actual is not None and actual <= expected["$lte"]):
                    return False
            elif actual != expected:
                return False
        return True


class _FakeDb:
    def __init__(self):
        self.online_matchmaking = _FakeCollection()


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


def test_matchmaking_queue_pairs_across_instances():
    async def run():
        db = _FakeDb()
        first_worker = MatchmakingQueue()
        second_worker = MatchmakingQueue()

        assert await first_worker.add_or_pair(db, "u1", 1000, "classic", "10+0") is None
        opponent = await second_worker.add_or_pair(db, "u2", 1015, "classic", "10+0")

        assert opponent["user_id"] == "u1"
        assert opponent["status"] == "paired"
        assert opponent["time_control"] == "10+0"

    asyncio.run(run())


def test_matchmaking_queue_keeps_time_controls_separate():
    async def run():
        db = _FakeDb()
        queue = MatchmakingQueue()

        assert await queue.add_or_pair(db, "rapid-user", 1000, "classic", "10+0") is None
        assert await queue.add_or_pair(db, "blitz-user", 1000, "classic", "3+0") is None

        waiting_users = {doc["user_id"] for doc in db.online_matchmaking.docs.values()}
        assert waiting_users == {"rapid-user", "blitz-user"}

    asyncio.run(run())
