"""Base agent — Claude API wrapper with logging/artifact plumbing."""
import asyncio
import json
import os
import re
from typing import AsyncIterator, Callable, Any

import anthropic

from backend import database as db

MODEL = os.environ.get("CLAUDE_MODEL", "claude-sonnet-4-6")


class AgentError(Exception):
    pass


class BaseAgent:
    name: str = "base"
    phase: str = "?"

    def __init__(
        self,
        run_id: str,
        broadcast: Callable,  # async fn(msg: dict) → None
    ):
        self.run_id = run_id
        self.broadcast = broadcast
        self._client: anthropic.AsyncAnthropic | None = None

    @property
    def client(self) -> anthropic.AsyncAnthropic:
        if self._client is None:
            key = os.environ.get("ANTHROPIC_API_KEY", "")
            if not key:
                raise AgentError("ANTHROPIC_API_KEY not set")
            self._client = anthropic.AsyncAnthropic(api_key=key)
        return self._client

    # ── Helpers ──────────────────────────────────────────────────────────────

    async def log(self, message: str, level: str = "info") -> None:
        entry = db.add_log(self.run_id, message, level, self.phase, self.name)
        await self.broadcast({
            "type": "log",
            "data": {
                "run_id": self.run_id,
                "phase": self.phase,
                "agent": self.name,
                **entry,
            },
        })

    async def save_artifact(self, name: str, content: Any, kind: str = "json") -> None:
        entry = db.add_artifact(self.run_id, self.phase, name, content, kind)
        await self.broadcast({
            "type": "artifact",
            "data": {
                "run_id": self.run_id,
                "phase": self.phase,
                "artifact_name": name,
                "artifact_type": kind,
                "artifact_id": entry["id"],
            },
        })

    async def set_progress(self, pct: int) -> None:
        db.update_phase(self.run_id, self.phase, progress=min(pct, 100))
        await self.broadcast({
            "type": "progress",
            "data": {"run_id": self.run_id, "phase": self.phase, "progress": pct},
        })

    # ── Claude call with live streaming ──────────────────────────────────────

    async def stream_completion(
        self,
        system: str,
        user_prompt: str,
        max_tokens: int = 4096,
    ) -> str:
        """Streams Claude response token-by-token; logs chunks; returns full text."""
        full_text = ""
        chunk_buf = ""
        try:
            async with self.client.messages.stream(
                model=MODEL,
                max_tokens=max_tokens,
                system=system,
                messages=[{"role": "user", "content": user_prompt}],
            ) as stream:
                async for text in stream.text_stream:
                    full_text += text
                    chunk_buf += text
                    # broadcast in ~sentence-sized chunks to avoid flooding
                    if len(chunk_buf) >= 120 or text in (".", "\n"):
                        await self.log(chunk_buf.strip(), "stream")
                        chunk_buf = ""
                if chunk_buf.strip():
                    await self.log(chunk_buf.strip(), "stream")
        except anthropic.APIError as exc:
            await self.log(f"Claude API error: {exc}", "error")
            raise AgentError(str(exc)) from exc
        return full_text

    async def json_completion(
        self,
        system: str,
        user_prompt: str,
        max_tokens: int = 4096,
    ) -> dict | list:
        """Calls Claude and parses the JSON block from the response."""
        text = await self.stream_completion(system, user_prompt + "\n\nRespond with ONLY valid JSON. No markdown fences.", max_tokens)
        # extract first JSON object or array
        match = re.search(r"(\{[\s\S]*\}|\[[\s\S]*\])", text)
        if not match:
            raise AgentError(f"No JSON found in Claude response: {text[:300]}")
        try:
            return json.loads(match.group(1))
        except json.JSONDecodeError as exc:
            raise AgentError(f"JSON parse error: {exc}") from exc
