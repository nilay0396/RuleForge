"""Pydantic request/response models."""
from pydantic import BaseModel
from typing import Any


class CreateRunRequest(BaseModel):
    domain: str  # e.g. "AI tools for remote software teams"


class ApprovePhaseRequest(BaseModel):
    notes: str = ""  # optional human notes passed into next phase context


class RunResponse(BaseModel):
    id: str
    domain: str
    status: str
    current_phase: str | None
    created_at: str
    updated_at: str


class PhaseResponse(BaseModel):
    id: str
    run_id: str
    phase_name: str
    phase_label: str
    phase_desc: str
    status: str
    progress: int
    started_at: str | None
    completed_at: str | None


class LogEntry(BaseModel):
    id: int
    run_id: str
    phase_name: str | None
    agent_name: str | None
    level: str
    message: str
    created_at: str


class ArtifactEntry(BaseModel):
    id: int
    run_id: str
    phase_name: str
    artifact_name: str
    artifact_type: str
    content: str
    created_at: str


class WSMessage(BaseModel):
    type: str
    data: dict[str, Any]
