"""Phase 3 — Scrutiny: Devil's Advocate, Risk Analysis, Feasibility."""
import asyncio
import json
from typing import Callable
from .base import BaseAgent


class DevilsAdvocateAgent(BaseAgent):
    name = "devils_advocate"
    phase = "3"

    async def run(self, winner: str, phase_12_data: dict) -> dict:
        await self.log(f"Playing devil's advocate for: {winner}")
        system = (
            "You are the sharpest skeptic at a top VC firm. Your job is to ruthlessly "
            "identify every reason why this startup will fail. Be harsh, specific, and "
            "evidence-based. This is a feature, not a bug — helping founders prepare."
        )
        context = json.dumps(phase_12_data, indent=2)[:4000]
        prompt = f"""Startup idea: {winner}

Research context:
{context}

Provide the strongest possible case AGAINST this idea. Return JSON:
{{
  "fatal_flaws": [
    {{"flaw": "...", "severity": "fatal|serious|moderate", "counter_evidence": "..."}}
  ],
  "strongest_objections": ["obj1", "obj2", "obj3"],
  "why_incumbents_will_win": "...",
  "customer_behavior_assumptions_that_are_wrong": ["assumption1", "assumption2"],
  "timing_risk": "too_early|right_time|too_late",
  "timing_rationale": "...",
  "the_one_thing_that_kills_this": "...",
  "rebuttals": [
    {{"objection": "...", "rebuttal": "..."}}
  ],
  "overall_skepticism_score": 0-100
}}"""
        result = await self.json_completion(system, prompt, max_tokens=4000)
        await self.save_artifact("devils_advocate", result)
        await self.log(f"Skepticism score: {result.get('overall_skepticism_score')}/100 | Fatal flaws: {len([f for f in result.get('fatal_flaws', []) if f.get('severity') == 'fatal'])}", "error")
        return result


class RiskAnalysisAgent(BaseAgent):
    name = "risk_analysis"
    phase = "3"

    async def run(self, winner: str, phase_12_data: dict) -> dict:
        await self.log(f"Comprehensive risk analysis for: {winner}")
        system = "You are a startup risk analyst specializing in early-stage company risk assessment."
        context = json.dumps(phase_12_data, indent=2)[:3000]
        prompt = f"""Startup idea: {winner}

Context: {context}

Analyze all risk categories. Return JSON:
{{
  "risk_register": [
    {{
      "category": "market|technical|regulatory|financial|team|competitive|timing",
      "risk": "...",
      "probability": "high|medium|low",
      "impact": "high|medium|low",
      "risk_score": 1-9,
      "mitigation": "...",
      "owner": "founder|investor|market"
    }}
  ],
  "top_3_risks": ["risk1", "risk2", "risk3"],
  "regulatory_red_flags": ["flag1"],
  "data_privacy_concerns": "...",
  "dependency_risks": ["dep1", "dep2"],
  "overall_risk_score": 0-100,
  "risk_profile": "low|medium|high|very_high"
}}"""
        result = await self.json_completion(system, prompt, max_tokens=4000)
        await self.save_artifact("risk_analysis", result)
        await self.log(f"Risk profile: {result.get('risk_profile')} | Score: {result.get('overall_risk_score')}/100", "warn")
        return result


class FeasibilityAgent(BaseAgent):
    name = "feasibility"
    phase = "3"

    async def run(self, winner: str, domain: str) -> dict:
        await self.log(f"Technical and resource feasibility for: {winner}")
        system = "You are a CTO-level technical feasibility expert and startup resource strategist."
        prompt = f"""Startup idea: {winner}
Domain: {domain}

Assess feasibility. Return JSON:
{{
  "technical_complexity": "low|medium|high|very_high",
  "core_technologies_needed": ["tech1", "tech2"],
  "build_vs_buy": [
    {{"component": "...", "recommendation": "build|buy|open_source", "rationale": "..."}}
  ],
  "mvp_scope": {{
    "must_have_features": ["f1","f2","f3"],
    "nice_to_have": ["f4","f5"],
    "out_of_scope_v1": ["f6"]
  }},
  "mvp_timeline_estimate": "X weeks",
  "team_requirements": [
    {{"role": "...", "seniority": "...", "priority": "must_have|nice_to_have"}}
  ],
  "capital_required_to_mvp": "$X-Y",
  "key_technical_risks": ["risk1", "risk2"],
  "feasibility_score": 0-100,
  "verdict": "highly_feasible|feasible|challenging|not_feasible"
}}"""
        result = await self.json_completion(system, prompt, max_tokens=4000)
        await self.save_artifact("feasibility", result)
        await self.log(f"Feasibility: {result.get('verdict')} ({result.get('feasibility_score')}/100) | MVP: {result.get('mvp_timeline_estimate')}", "success")
        return result


async def run_phase_3(run_id: str, winner: str, domain: str, phase_12_data: dict, broadcast: Callable) -> dict:
    agents = [
        DevilsAdvocateAgent(run_id, broadcast),
        RiskAnalysisAgent(run_id, broadcast),
        FeasibilityAgent(run_id, broadcast),
    ]
    results = await asyncio.gather(
        agents[0].run(winner, phase_12_data),
        agents[1].run(winner, phase_12_data),
        agents[2].run(winner, domain),
        return_exceptions=True,
    )
    output = {}
    for agent, result in zip(agents, results):
        output[agent.name] = result if not isinstance(result, Exception) else {"error": str(result)}
    return output
