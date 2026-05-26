"""Pipeline orchestrator — manages phase lifecycle and state transitions."""
import asyncio
import json
from datetime import datetime, timezone
from typing import Callable

from backend import database as db
from backend.agents.phase_0a import run_phase_0a
from backend.agents.phase_0b import run_phase_0b
from backend.agents.phase_0c import run_phase_0c
from backend.agents.phase_0d import run_phase_0d
from backend.agents.phase_12 import run_phase_12
from backend.agents.phase_3 import run_phase_3
from backend.agents.phase_4 import run_phase_4
from backend.agents.phase_5 import run_phase_5


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _start_phase(run_id: str, phase_name: str, broadcast: Callable) -> None:
    db.update_phase(run_id, phase_name, status="running", started_at=_now(), progress=0)
    db.update_run_status(run_id, "running", phase_name)
    await broadcast({
        "type": "phase_update",
        "data": {"run_id": run_id, "phase": phase_name, "status": "running"},
    })


async def _complete_phase(run_id: str, phase_name: str, broadcast: Callable) -> None:
    db.update_phase(run_id, phase_name, status="awaiting_approval", progress=100, completed_at=_now())
    db.update_run_status(run_id, "awaiting_approval", phase_name)
    await broadcast({
        "type": "phase_update",
        "data": {"run_id": run_id, "phase": phase_name, "status": "awaiting_approval"},
    })
    db.add_log(run_id, f"Phase {phase_name} complete — awaiting your approval to proceed.", "success", phase_name)
    await broadcast({
        "type": "log",
        "data": {
            "run_id": run_id, "phase": phase_name, "agent": "orchestrator",
            "level": "success",
            "message": f"Phase {phase_name} complete — awaiting your approval to proceed.",
            "created_at": _now(),
        },
    })


async def _fail_phase(run_id: str, phase_name: str, error: str, broadcast: Callable) -> None:
    db.update_phase(run_id, phase_name, status="failed", completed_at=_now())
    db.update_run_status(run_id, "failed", phase_name)
    db.add_log(run_id, f"Phase {phase_name} FAILED: {error}", "error", phase_name)
    await broadcast({
        "type": "phase_update",
        "data": {"run_id": run_id, "phase": phase_name, "status": "failed", "error": error},
    })


def _get_artifact_json(run_id: str, phase_name: str, artifact_name: str) -> dict | list | None:
    arts = db.get_artifacts(run_id, phase_name)
    for a in arts:
        if a["artifact_name"] == artifact_name:
            try:
                return json.loads(a["content"])
            except Exception:
                return None
    return None


async def execute_phase(run_id: str, phase_name: str, human_notes: str, broadcast: Callable) -> None:
    """Execute a single phase. Called after the user approves the previous phase."""
    run = db.get_run(run_id)
    if not run:
        return
    domain = run["domain"]

    await _start_phase(run_id, phase_name, broadcast)

    try:
        if phase_name == "0A":
            result = await run_phase_0a(run_id, domain, broadcast)
            db.add_artifact(run_id, "0A", "phase_0a_combined", result)

        elif phase_name == "0B":
            phase_0a = _get_artifact_json(run_id, "0A", "phase_0a_combined") or {}
            result = await run_phase_0b(run_id, domain, phase_0a, broadcast)
            db.add_artifact(run_id, "0B", "phase_0b_combined", result)

        elif phase_name == "0C":
            phase_0b = _get_artifact_json(run_id, "0B", "phase_0b_combined") or {}
            top_5 = phase_0b.get("top_5", [])
            if not top_5:
                raise ValueError("No top 5 ideas found from Phase 0B")
            result = await run_phase_0c(run_id, top_5, broadcast)
            db.add_artifact(run_id, "0C", "phase_0c_combined", result)

        elif phase_name == "0D":
            phase_0b = _get_artifact_json(run_id, "0B", "phase_0b_combined") or {}
            phase_0c = _get_artifact_json(run_id, "0C", "phase_0c_combined") or {}
            top_5 = phase_0b.get("top_5", [])
            result = await run_phase_0d(run_id, top_5, phase_0c, broadcast)
            db.add_artifact(run_id, "0D", "phase_0d_combined", result)

        elif phase_name == "12":
            phase_0d = _get_artifact_json(run_id, "0D", "phase_0d_combined") or {}
            winner = phase_0d.get("passed_to_next_phase", domain)
            result = await run_phase_12(run_id, winner, domain, broadcast)
            db.add_artifact(run_id, "12", "phase_12_combined", result)

        elif phase_name == "3":
            phase_0d = _get_artifact_json(run_id, "0D", "phase_0d_combined") or {}
            phase_12 = _get_artifact_json(run_id, "12", "phase_12_combined") or {}
            winner = phase_0d.get("passed_to_next_phase", domain)
            result = await run_phase_3(run_id, winner, domain, phase_12, broadcast)
            db.add_artifact(run_id, "3", "phase_3_combined", result)

        elif phase_name == "4":
            phase_0d = _get_artifact_json(run_id, "0D", "phase_0d_combined") or {}
            phase_12 = _get_artifact_json(run_id, "12", "phase_12_combined") or {}
            winner = phase_0d.get("passed_to_next_phase", domain)
            result = await run_phase_4(run_id, winner, domain, phase_12, broadcast)
            db.add_artifact(run_id, "4", "phase_4_combined", result)

        elif phase_name == "5":
            phase_0d = _get_artifact_json(run_id, "0D", "phase_0d_combined") or {}
            winner = phase_0d.get("passed_to_next_phase", domain)
            all_data = {
                "phase_0a": _get_artifact_json(run_id, "0A", "phase_0a_combined") or {},
                "phase_0b": _get_artifact_json(run_id, "0B", "phase_0b_combined") or {},
                "phase_0d": phase_0d,
                "phase_12": _get_artifact_json(run_id, "12", "phase_12_combined") or {},
                "phase_3": _get_artifact_json(run_id, "3", "phase_3_combined") or {},
                "phase_4": _get_artifact_json(run_id, "4", "phase_4_combined") or {},
                "human_notes": human_notes,
            }
            result = await run_phase_5(run_id, winner, domain, all_data, broadcast)
            db.add_artifact(run_id, "5", "phase_5_final", result)
            # Final phase: mark run as completed
            db.update_phase(run_id, "5", status="completed", progress=100, completed_at=_now())
            db.update_run_status(run_id, "completed", "5")
            await broadcast({
                "type": "phase_update",
                "data": {"run_id": run_id, "phase": "5", "status": "completed"},
            })
            await broadcast({
                "type": "run_complete",
                "data": {"run_id": run_id, "verdict": result.get("verdict", "?")},
            })
            return

        else:
            raise ValueError(f"Unknown phase: {phase_name}")

        await _complete_phase(run_id, phase_name, broadcast)

    except Exception as exc:
        await _fail_phase(run_id, phase_name, str(exc), broadcast)
        raise
