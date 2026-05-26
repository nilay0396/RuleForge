"""Phase 0D — Feedback Synthesis: aggregates all validation → ranks top ideas."""
import asyncio
import json
from typing import Callable
from .base import BaseAgent


class FeedbackSynthesisAgent(BaseAgent):
    name = "feedback_synthesis"
    phase = "0D"

    async def run(self, top_5_ideas: list, phase_0c_data: dict) -> dict:
        await self.log("Aggregating all quantitative and qualitative validation signals...")
        await self.set_progress(15)

        system = (
            "You are a startup validation expert and data analyst. You receive validation "
            "data from multiple parallel agents and synthesize it into a ranked, evidence-backed "
            "recommendation. You think like a YC partner reviewing batch applications."
        )

        ideas_summary = json.dumps(top_5_ideas, indent=2)[:3000]
        validation_summary = json.dumps(phase_0c_data, indent=2)[:6000]

        prompt = f"""Top 5 Candidate Ideas:
{ideas_summary}

Validation Data (landing page, survey design, search volume, community, competitors):
{validation_summary}

Synthesize all signals and rank the ideas. Return JSON:
{{
  "signal_summary": {{
    "total_signals_analyzed": 0,
    "strongest_signal": "...",
    "biggest_risk_across_all": "..."
  }},
  "ranked_ideas": [
    {{
      "rank": 1,
      "idea_name": "...",
      "composite_score": 0-100,
      "score_breakdown": {{
        "pain_intensity": 0-25,
        "market_size": 0-25,
        "timing_momentum": 0-25,
        "whitespace": 0-25
      }},
      "strongest_evidence": ["evidence1", "evidence2"],
      "key_concerns": ["concern1", "concern2"],
      "go_forward_recommendation": "strong_yes|yes|maybe|no"
    }}
  ],
  "top_2_3_winners": ["idea_name_1", "idea_name_2"],
  "executive_summary": "2-3 sentence synthesis of the most promising opportunity",
  "recommended_next_steps": ["step1", "step2", "step3"],
  "passed_to_next_phase": "idea_name_of_winner"
}}"""

        await self.log("Computing composite scores and ranking ideas...")
        await self.set_progress(50)

        result = await self.json_completion(system, prompt, max_tokens=5000)

        await self.set_progress(90)
        await self.save_artifact("synthesis_full", result)
        await self.save_artifact("winner_idea", {"winner": result.get("passed_to_next_phase"), "top_2_3": result.get("top_2_3_winners")})

        ranked = result.get("ranked_ideas", [])
        for r in ranked:
            emoji = "🏆" if r.get("rank") == 1 else "  "
            await self.log(f"{emoji} #{r.get('rank')} [{r.get('composite_score')}/100] {r.get('idea_name')} — {r.get('go_forward_recommendation')}", "success")

        await self.log(f"Winner: {result.get('passed_to_next_phase')}", "success")
        await self.set_progress(100)
        return result


async def run_phase_0d(run_id: str, top_5_ideas: list, phase_0c_data: dict, broadcast: Callable) -> dict:
    agent = FeedbackSynthesisAgent(run_id, broadcast)
    return await agent.run(top_5_ideas, phase_0c_data)
