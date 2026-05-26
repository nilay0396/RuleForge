"""Phase 0B — Ideation Agent: clusters Phase 0A signals → top 5 ideas."""
import asyncio
import json
from typing import Callable
from .base import BaseAgent


class IdeationAgent(BaseAgent):
    name = "ideation"
    phase = "0B"

    async def run(self, domain: str, phase_0a_data: dict) -> dict:
        await self.log("Clustering signals from all 6 scraping agents...")
        await self.set_progress(10)

        system = (
            "You are a world-class startup ideation strategist. You receive raw market "
            "intelligence from 6 specialized scraping agents and use it to identify "
            "high-potential startup ideas. You think like a top YC partner: "
            "you care about timing, pain intensity, market size, and whitespace."
        )

        # Summarize 0A data for the prompt
        signal_summary = json.dumps(phase_0a_data, indent=2)[:8000]

        prompt = f"""Domain: {domain}

Phase 0A Intelligence Data:
{signal_summary}

Your task:
1. Cluster the patterns and signals across all 6 data sources
2. Brainstorm 20-30 raw startup ideas derived from these signals
3. Score each on: Market Size (0-10), Pain Intensity (0-10), Timing/Momentum (0-10), Whitespace (0-10)
4. Shortlist the TOP 5 highest-potential ideas

Return JSON:
{{
  "signal_clusters": [
    {{"cluster_name": "...", "signals": ["s1","s2"], "opportunity_thesis": "..."}}
  ],
  "all_ideas": [
    {{"idea": "...", "one_liner": "...", "market_size": 0-10, "pain_intensity": 0-10, "timing": 0-10, "whitespace": 0-10, "total_score": 0-40}}
  ],
  "top_5": [
    {{
      "rank": 1,
      "idea_name": "...",
      "one_liner": "...",
      "problem": "...",
      "solution": "...",
      "target_customer": "...",
      "why_now": "...",
      "market_size_est": "...",
      "scores": {{"market_size": 0-10, "pain_intensity": 0-10, "timing": 0-10, "whitespace": 0-10}},
      "total_score": 0-40,
      "key_risk": "..."
    }}
  ]
}}"""

        await self.log("Brainstorming 20-30 raw ideas from signal clusters...")
        await self.set_progress(30)

        result = await self.json_completion(system, prompt, max_tokens=6000)

        await self.set_progress(80)

        top5 = result.get("top_5", [])
        await self.save_artifact("ideation_full", result)
        await self.save_artifact("top_5_ideas", top5)

        for idea in top5:
            score = idea.get("total_score", 0)
            await self.log(
                f"  #{idea.get('rank')} [{score}/40] {idea.get('idea_name')} — {idea.get('one_liner', '')}",
                "success",
            )

        await self.set_progress(100)
        await self.log(f"Ideation complete. Top idea: {top5[0].get('idea_name') if top5 else 'N/A'}", "success")
        return result


async def run_phase_0b(run_id: str, domain: str, phase_0a_data: dict, broadcast: Callable) -> dict:
    agent = IdeationAgent(run_id, broadcast)
    return await agent.run(domain, phase_0a_data)
