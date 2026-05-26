"""SQLite persistence layer — all state survives server restarts."""
import sqlite3
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DATA_DIR = Path(os.environ.get("DATA_DIR", Path(__file__).parent.parent / "data"))
DB_PATH = DATA_DIR / "pipeline.db"

PHASES_META = [
    ("0A", "Phase 0A — Scraping Swarm",       "Trend, News, Pain Points, Jobs, Patents, Social"),
    ("0B", "Phase 0B — Ideation",              "Cluster signals → brainstorm → shortlist top 5 ideas"),
    ("0C", "Phase 0C — Autonomous Validation", "Landing page, survey, search volume, community, competitor per idea"),
    ("0D", "Phase 0D — Synthesis",             "Aggregate all signals → rank top 2-3 ideas"),
    ("12", "Phase 1-2 — Research & Analysis",  "Market, Competitor, Audience, Differentiation"),
    ("3",  "Phase 3 — Scrutiny",               "Devil's Advocate, Risk, Feasibility"),
    ("4",  "Phase 4 — Business Validation",    "Business Model, GTM, Financial Projections"),
    ("5",  "Phase 5 — Final Judge",            "Go / No-Go / Pivot with full evidence"),
]

PHASE_ORDER = [p[0] for p in PHASES_META]


def _connect() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db() -> None:
    conn = _connect()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS pipeline_runs (
            id          TEXT PRIMARY KEY,
            domain      TEXT NOT NULL,
            status      TEXT NOT NULL DEFAULT 'pending',
            current_phase TEXT DEFAULT NULL,
            created_at  TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            updated_at  TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
        );

        CREATE TABLE IF NOT EXISTS phases (
            id            TEXT PRIMARY KEY,
            run_id        TEXT NOT NULL,
            phase_name    TEXT NOT NULL,
            phase_label   TEXT NOT NULL,
            phase_desc    TEXT NOT NULL DEFAULT '',
            status        TEXT NOT NULL DEFAULT 'pending',
            progress      INTEGER DEFAULT 0,
            started_at    TEXT DEFAULT NULL,
            completed_at  TEXT DEFAULT NULL,
            FOREIGN KEY (run_id) REFERENCES pipeline_runs(id)
        );

        CREATE TABLE IF NOT EXISTS logs (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            run_id      TEXT NOT NULL,
            phase_name  TEXT,
            agent_name  TEXT,
            level       TEXT NOT NULL DEFAULT 'info',
            message     TEXT NOT NULL,
            created_at  TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
        );

        CREATE TABLE IF NOT EXISTS artifacts (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            run_id        TEXT NOT NULL,
            phase_name    TEXT NOT NULL,
            artifact_name TEXT NOT NULL,
            artifact_type TEXT NOT NULL DEFAULT 'json',
            content       TEXT NOT NULL,
            created_at    TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
        );
    """)
    conn.close()


# ── Run helpers ──────────────────────────────────────────────────────────────

def create_run(run_id: str, domain: str) -> None:
    conn = _connect()
    conn.execute(
        "INSERT INTO pipeline_runs (id, domain, status) VALUES (?, ?, 'pending')",
        (run_id, domain),
    )
    for name, label, desc in PHASES_META:
        phase_id = f"{run_id}:{name}"
        conn.execute(
            "INSERT INTO phases (id, run_id, phase_name, phase_label, phase_desc, status) VALUES (?,?,?,?,?,'pending')",
            (phase_id, run_id, name, label, desc),
        )
    conn.close()


def get_run(run_id: str) -> dict | None:
    conn = _connect()
    row = conn.execute("SELECT * FROM pipeline_runs WHERE id=?", (run_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def list_runs() -> list[dict]:
    conn = _connect()
    rows = conn.execute("SELECT * FROM pipeline_runs ORDER BY created_at DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def update_run_status(run_id: str, status: str, current_phase: str | None = None) -> None:
    conn = _connect()
    conn.execute(
        "UPDATE pipeline_runs SET status=?, current_phase=?, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?",
        (status, current_phase, run_id),
    )
    conn.close()


# ── Phase helpers ─────────────────────────────────────────────────────────────

def get_phases(run_id: str) -> list[dict]:
    conn = _connect()
    rows = conn.execute(
        "SELECT * FROM phases WHERE run_id=? ORDER BY rowid", (run_id,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_phase(run_id: str, phase_name: str) -> dict | None:
    conn = _connect()
    row = conn.execute(
        "SELECT * FROM phases WHERE run_id=? AND phase_name=?", (run_id, phase_name)
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def update_phase(run_id: str, phase_name: str, **kwargs: Any) -> None:
    if not kwargs:
        return
    sets = ", ".join(f"{k}=?" for k in kwargs)
    vals = list(kwargs.values()) + [run_id, phase_name]
    conn = _connect()
    conn.execute(f"UPDATE phases SET {sets} WHERE run_id=? AND phase_name=?", vals)
    conn.close()


# ── Log helpers ───────────────────────────────────────────────────────────────

def add_log(run_id: str, message: str, level: str = "info",
            phase_name: str | None = None, agent_name: str | None = None) -> dict:
    conn = _connect()
    cur = conn.execute(
        "INSERT INTO logs (run_id, phase_name, agent_name, level, message) VALUES (?,?,?,?,?)",
        (run_id, phase_name, agent_name, level, message),
    )
    row = conn.execute("SELECT * FROM logs WHERE id=?", (cur.lastrowid,)).fetchone()
    conn.close()
    return dict(row)


def get_logs(run_id: str, phase_name: str | None = None, limit: int = 500) -> list[dict]:
    conn = _connect()
    if phase_name:
        rows = conn.execute(
            "SELECT * FROM logs WHERE run_id=? AND phase_name=? ORDER BY id DESC LIMIT ?",
            (run_id, phase_name, limit),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM logs WHERE run_id=? ORDER BY id DESC LIMIT ?",
            (run_id, limit),
        ).fetchall()
    conn.close()
    return [dict(r) for r in reversed(rows)]


# ── Artifact helpers ──────────────────────────────────────────────────────────

def add_artifact(run_id: str, phase_name: str, artifact_name: str,
                 content: Any, artifact_type: str = "json") -> dict:
    if artifact_type == "json" and not isinstance(content, str):
        content = json.dumps(content, indent=2)
    conn = _connect()
    cur = conn.execute(
        "INSERT INTO artifacts (run_id, phase_name, artifact_name, artifact_type, content) VALUES (?,?,?,?,?)",
        (run_id, phase_name, artifact_name, artifact_type, content),
    )
    row = conn.execute("SELECT * FROM artifacts WHERE id=?", (cur.lastrowid,)).fetchone()
    conn.close()
    return dict(row)


def get_artifacts(run_id: str, phase_name: str | None = None) -> list[dict]:
    conn = _connect()
    if phase_name:
        rows = conn.execute(
            "SELECT * FROM artifacts WHERE run_id=? AND phase_name=? ORDER BY id",
            (run_id, phase_name),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM artifacts WHERE run_id=? ORDER BY id", (run_id,)
        ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def next_phase_name(current: str) -> str | None:
    try:
        idx = PHASE_ORDER.index(current)
        return PHASE_ORDER[idx + 1] if idx + 1 < len(PHASE_ORDER) else None
    except ValueError:
        return None
