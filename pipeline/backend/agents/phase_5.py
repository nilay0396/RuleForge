"""Phase 5 — Final Judge: synthesizes all evidence → Go / No-Go / Pivot report."""
import asyncio
import json
from typing import Callable
from .base import BaseAgent


class FinalJudgeAgent(BaseAgent):
    name = "final_judge"
    phase = "5"

    async def run(self, winner: str, domain: str, all_phase_data: dict) -> dict:
        await self.log("Convening the Final Judge — analyzing all 8 phases of evidence...")
        await self.set_progress(10)

        system = (
            "You are the final decision-making committee: a panel of a top VC partner, "
            "an experienced founder, a domain expert, and a skeptical CFO. You have been "
            "given complete research, validation data, risk analysis, and financial projections "
            "for a startup idea. Your job is to deliver a definitive, actionable Go/No-Go/Pivot "
            "verdict backed by the full evidence base. Be decisive, specific, and honest."
        )

        full_context = json.dumps(all_phase_data, indent=2)[:10000]

        prompt = f"""Startup Idea: {winner}
Domain: {domain}

Complete Evidence Base (all phases):
{full_context}

Deliver the final verdict. Return JSON:
{{
  "verdict": "GO|NO_GO|PIVOT",
  "confidence": "high|medium|low",
  "verdict_rationale": "3-4 sentence explanation of the verdict",

  "evidence_summary": {{
    "strongest_signals": ["signal1", "signal2", "signal3"],
    "biggest_risks": ["risk1", "risk2"],
    "market_opportunity_size": "...",
    "competitive_position": "strong|moderate|weak",
    "timing_assessment": "perfect|good|early|late"
  }},

  "scorecard": {{
    "market_opportunity": {{"score": 0-10, "note": "..."}},
    "pain_validation": {{"score": 0-10, "note": "..."}},
    "competitive_position": {{"score": 0-10, "note": "..."}},
    "team_fit_potential": {{"score": 0-10, "note": "..."}},
    "business_model": {{"score": 0-10, "note": "..."}},
    "timing": {{"score": 0-10, "note": "..."}},
    "financial_viability": {{"score": 0-10, "note": "..."}},
    "overall": 0-70
  }},

  "if_go": {{
    "top_3_priorities_week_1": ["p1","p2","p3"],
    "mvp_recommendation": "...",
    "first_customer_strategy": "...",
    "fundraising_recommendation": "...",
    "key_hire_to_make_first": "..."
  }},

  "if_pivot": {{
    "pivot_direction": "...",
    "what_to_keep": ["k1","k2"],
    "what_to_change": ["c1","c2"],
    "pivot_idea": "..."
  }},

  "north_star_metric": "...",
  "success_looks_like_in_12_months": "...",
  "single_biggest_bet_youre_making": "...",
  "final_message_to_founder": "One honest, direct sentence to the founder about what matters most."
}}"""

        await self.log("Analyzing full evidence base across all 8 phases...")
        await self.set_progress(40)

        result = await self.json_completion(system, prompt, max_tokens=6000)

        await self.set_progress(85)

        await self.save_artifact("final_verdict", result)

        verdict = result.get("verdict", "?")
        confidence = result.get("confidence", "?")
        scorecard = result.get("scorecard", {})
        overall_score = scorecard.get("overall", 0)

        await self.log(f"{'='*60}", "success")
        await self.log(f"FINAL VERDICT: {verdict} (Confidence: {confidence})", "success")
        await self.log(f"Overall Score: {overall_score}/70", "success")
        await self.log(f"Rationale: {result.get('verdict_rationale', '')[:200]}", "success")
        await self.log(f"{'='*60}", "success")
        await self.log(f"Message to Founder: {result.get('final_message_to_founder', '')}", "info")

        await self.set_progress(100)
        return result


async def run_phase_5(run_id: str, winner: str, domain: str, all_data: dict, broadcast: Callable) -> dict:
    agent = FinalJudgeAgent(run_id, broadcast)
    return await agent.run(winner, domain, all_data)
