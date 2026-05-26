"""FastAPI application — REST API + WebSocket hub for the validation pipeline."""
import asyncio
import json
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

from backend import database as db
from backend.models import ApprovePhaseRequest, CreateRunRequest
from backend.orchestrator import execute_phase

FRONTEND_DIR = Path(__file__).parent.parent / "frontend"


# ── WebSocket connection manager ─────────────────────────────────────────────

class ConnectionManager:
    def __init__(self):
        # run_id → set of WebSocket connections
        self._connections: dict[str, set[WebSocket]] = {}

    async def connect(self, run_id: str, ws: WebSocket) -> None:
        await ws.accept()
        self._connections.setdefault(run_id, set()).add(ws)

    def disconnect(self, run_id: str, ws: WebSocket) -> None:
        if run_id in self._connections:
            self._connections[run_id].discard(ws)

    async def broadcast(self, run_id: str, message: dict) -> None:
        dead = set()
        for ws in self._connections.get(run_id, set()):
            try:
                await ws.send_text(json.dumps(message))
            except Exception:
                dead.add(ws)
        for ws in dead:
            self._connections[run_id].discard(ws)

    def make_broadcaster(self, run_id: str):
        async def _broadcast(msg: dict) -> None:
            await self.broadcast(run_id, msg)
        return _broadcast


manager = ConnectionManager()


# ── App lifecycle ─────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
    yield


app = FastAPI(title="RuleForge Validation Pipeline", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Static files ──────────────────────────────────────────────────────────────

@app.get("/", response_class=HTMLResponse)
async def serve_dashboard():
    index = FRONTEND_DIR / "index.html"
    if index.exists():
        return index.read_text()
    return HTMLResponse("<h1>Dashboard not found</h1>", status_code=404)


# ── REST: Runs ────────────────────────────────────────────────────────────────

@app.post("/api/runs")
async def create_run(req: CreateRunRequest):
    if not req.domain.strip():
        raise HTTPException(400, "domain is required")
    run_id = str(uuid.uuid4())[:8]
    db.create_run(run_id, req.domain.strip())
    run = db.get_run(run_id)
    # Kick off Phase 0A automatically in the background
    asyncio.create_task(_run_first_phase(run_id))
    return {**run, "phases": db.get_phases(run_id)}


async def _run_first_phase(run_id: str) -> None:
    await asyncio.sleep(0.5)  # let the HTTP response return first
    broadcast = manager.make_broadcaster(run_id)
    try:
        await execute_phase(run_id, "0A", "", broadcast)
    except Exception as exc:
        db.add_log(run_id, f"Phase 0A startup error: {exc}", "error", "0A")


@app.get("/api/runs")
async def list_runs():
    runs = db.list_runs()
    result = []
    for r in runs:
        phases = db.get_phases(r["id"])
        result.append({**r, "phases": phases})
    return result


@app.get("/api/runs/{run_id}")
async def get_run(run_id: str):
    run = db.get_run(run_id)
    if not run:
        raise HTTPException(404, "Run not found")
    phases = db.get_phases(run_id)
    artifacts_by_phase = {}
    for p in phases:
        arts = db.get_artifacts(run_id, p["phase_name"])
        artifacts_by_phase[p["phase_name"]] = arts
    return {**run, "phases": phases, "artifacts_by_phase": artifacts_by_phase}


# ── REST: Phase approval ──────────────────────────────────────────────────────

@app.post("/api/runs/{run_id}/phases/{phase_name}/approve")
async def approve_phase(run_id: str, phase_name: str, req: ApprovePhaseRequest):
    run = db.get_run(run_id)
    if not run:
        raise HTTPException(404, "Run not found")
    phase = db.get_phase(run_id, phase_name)
    if not phase:
        raise HTTPException(404, "Phase not found")
    if phase["status"] != "awaiting_approval":
        raise HTTPException(400, f"Phase is {phase['status']}, not awaiting_approval")

    db.update_phase(run_id, phase_name, status="completed")

    next_phase = db.next_phase_name(phase_name)
    if not next_phase:
        db.update_run_status(run_id, "completed")
        return {"message": "Pipeline complete — no more phases."}

    db.add_log(run_id, f"Phase {phase_name} approved. Starting Phase {next_phase}...", "success", phase_name)

    broadcast = manager.make_broadcaster(run_id)
    await broadcast({
        "type": "phase_update",
        "data": {"run_id": run_id, "phase": phase_name, "status": "completed"},
    })

    asyncio.create_task(execute_phase(run_id, next_phase, req.notes, broadcast))
    return {"message": f"Phase {next_phase} started.", "next_phase": next_phase}


@app.post("/api/runs/{run_id}/phases/{phase_name}/reject")
async def reject_phase(run_id: str, phase_name: str):
    run = db.get_run(run_id)
    if not run:
        raise HTTPException(404, "Run not found")
    db.update_phase(run_id, phase_name, status="rejected")
    db.update_run_status(run_id, "stopped", phase_name)
    db.add_log(run_id, f"Phase {phase_name} rejected by user. Pipeline stopped.", "warn", phase_name)
    broadcast = manager.make_broadcaster(run_id)
    await broadcast({
        "type": "phase_update",
        "data": {"run_id": run_id, "phase": phase_name, "status": "rejected"},
    })
    return {"message": "Pipeline stopped."}


@app.post("/api/runs/{run_id}/phases/{phase_name}/retry")
async def retry_phase(run_id: str, phase_name: str):
    run = db.get_run(run_id)
    if not run:
        raise HTTPException(404, "Run not found")
    phase = db.get_phase(run_id, phase_name)
    if not phase:
        raise HTTPException(404, "Phase not found")
    if phase["status"] not in ("failed", "rejected"):
        raise HTTPException(400, f"Cannot retry phase with status: {phase['status']}")
    broadcast = manager.make_broadcaster(run_id)
    asyncio.create_task(execute_phase(run_id, phase_name, "", broadcast))
    return {"message": f"Phase {phase_name} restarted."}


# ── REST: Logs & Artifacts ────────────────────────────────────────────────────

@app.get("/api/runs/{run_id}/logs")
async def get_logs(run_id: str, phase: str | None = None, limit: int = 500):
    if not db.get_run(run_id):
        raise HTTPException(404, "Run not found")
    return db.get_logs(run_id, phase, limit)


@app.get("/api/runs/{run_id}/artifacts")
async def get_artifacts(run_id: str, phase: str | None = None):
    if not db.get_run(run_id):
        raise HTTPException(404, "Run not found")
    return db.get_artifacts(run_id, phase)


@app.get("/api/runs/{run_id}/artifacts/{artifact_id}")
async def get_artifact(run_id: str, artifact_id: int):
    arts = db.get_artifacts(run_id)
    for a in arts:
        if a["id"] == artifact_id:
            return a
    raise HTTPException(404, "Artifact not found")


# ── WebSocket ─────────────────────────────────────────────────────────────────

@app.websocket("/ws/{run_id}")
async def websocket_endpoint(websocket: WebSocket, run_id: str):
    await manager.connect(run_id, websocket)
    # Send current state immediately on connect
    run = db.get_run(run_id)
    if run:
        phases = db.get_phases(run_id)
        logs = db.get_logs(run_id, limit=200)
        await websocket.send_text(json.dumps({
            "type": "init",
            "data": {"run": run, "phases": phases, "logs": logs},
        }))
    try:
        while True:
            # Keep connection alive; client sends pings
            data = await websocket.receive_text()
            msg = json.loads(data)
            if msg.get("type") == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))
    except WebSocketDisconnect:
        manager.disconnect(run_id, websocket)
