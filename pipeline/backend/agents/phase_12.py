"""Phase 1-2 — Research & Analysis: Market, Competitor, Audience, Differentiation."""
import asyncio
import json
from typing import Callable
from .base import BaseAgent


class MarketResearchAgent(BaseAgent):
    name = "market_research"
    phase = "12"

    async def run(self, winner: str, domain: str) -> dict:
        await self.log(f"Deep market research for: {winner}")
        system = "You are a top-tier market research analyst with expertise in TAM/SAM/SOM analysis."
        prompt = f"""Winning idea: {winner}
Domain: {domain}

Conduct deep market research. Return JSON:
{{
  "tam": {{"value": "$XB", "methodology": "...", "sources": ["source1"]}},
  "sam": {{"value": "$XM", "rationale": "..."}},
  "som": {{"value": "$XM", "3_year_target": "..."}},
  "market_structure": "fragmented|consolidated|emerging",
  "growth_rate": "X% CAGR",
  "key_market_drivers": ["driver1", "driver2", "driver3"],
  "market_barriers": ["barrier1", "barrier2"],
  "customer_segments": [
    {{"segment": "...", "size": "...", "willingness_to_pay": "$X/mo", "priority": "primary|secondary"}}
  ],
  "regulatory_environment": "...",
  "market_maturity": "nascent|growth|mature",
  "research_confidence": "high|medium|low"
}}"""
        result = await self.json_completion(system, prompt, max_tokens=4000)
        await self.save_artifact("market_research", result)
        await self.log(f"TAM: {result.get('tam', {}).get('value')} | SAM: {result.get('sam', {}).get('value')} | CAGR: {result.get('growth_rate')}", "success")
        return result


class DeepCompetitorAgent(BaseAgent):
    name = "deep_competitor"
    phase = "12"

    async def run(self, winner: str, domain: str) -> dict:
        await self.log(f"Deep competitor analysis for: {winner}")
        system = "You are a competitive intelligence analyst specializing in product and go-to-market strategy."
        prompt = f"""Winning idea: {winner}
Domain: {domain}

Conduct deep competitive analysis. Return JSON:
{{
  "competitor_matrix": [
    {{
      "name": "...",
      "category": "direct|indirect|potential",
      "funding_total": "...",
      "revenue_est": "...",
      "pricing": "...",
      "target_customer": "...",
      "key_features": ["f1","f2"],
      "weaknesses": ["w1","w2"],
      "customer_sentiment": "positive|mixed|negative"
    }}
  ],
  "market_gap_analysis": [
    {{"gap": "...", "severity": "critical|high|medium", "addressable_by_winner": true}}
  ],
  "competitive_advantages_available": ["adv1", "adv2"],
  "moat_options": ["moat1", "moat2"],
  "risk_of_big_tech_entry": "high|medium|low",
  "risk_rationale": "..."
}}"""
        result = await self.json_completion(system, prompt, max_tokens=4000)
        await self.save_artifact("competitor_deep", result)
        await self.log(f"Mapped {len(result.get('competitor_matrix', []))} competitors | Gaps: {len(result.get('market_gap_analysis', []))}", "success")
        return result


class AudienceAnalysisAgent(BaseAgent):
    name = "audience_analysis"
    phase = "12"

    async def run(self, winner: str, domain: str) -> dict:
        await self.log(f"Building audience personas for: {winner}")
        system = "You are a customer research specialist who builds precise ICPs and buyer personas."
        prompt = f"""Winning idea: {winner}
Domain: {domain}

Build detailed audience analysis. Return JSON:
{{
  "icp": {{
    "company_size": "...",
    "industry": "...",
    "geography": "...",
    "role_title": "...",
    "budget_authority": "...",
    "key_pain": "..."
  }},
  "buyer_personas": [
    {{
      "name": "...",
      "role": "...",
      "age_range": "...",
      "goals": ["g1","g2"],
      "frustrations": ["f1","f2"],
      "how_they_buy": "...",
      "watering_holes": ["community1","publication1"],
      "willingness_to_pay": "$X/mo"
    }}
  ],
  "buying_committee": ["role1", "role2"],
  "sales_cycle_est": "X weeks",
  "churn_risk_factors": ["risk1","risk2"],
  "retention_drivers": ["driver1","driver2"]
}}"""
        result = await self.json_completion(system, prompt, max_tokens=4000)
        await self.save_artifact("audience_analysis", result)
        await self.log(f"ICP: {result.get('icp', {}).get('role_title')} @ {result.get('icp', {}).get('company_size')} | Personas: {len(result.get('buyer_personas', []))}", "success")
        return result


class DifferentiationAgent(BaseAgent):
    name = "differentiation"
    phase = "12"

    async def run(self, winner: str, domain: str) -> dict:
        await self.log(f"Defining positioning and differentiation for: {winner}")
        system = "You are a product positioning and messaging strategist."
        prompt = f"""Winning idea: {winner}
Domain: {domain}

Define differentiation strategy. Return JSON:
{{
  "positioning_statement": "For [target customer] who [pain], [product name] is a [category] that [benefit]. Unlike [competitor], we [key differentiator].",
  "unique_value_proposition": "...",
  "differentiation_pillars": [
    {{"pillar": "...", "how": "...", "defensibility": "high|medium|low"}}
  ],
  "messaging_hierarchy": {{
    "headline": "...",
    "subheadline": "...",
    "proof_points": ["p1","p2","p3"]
  }},
  "category_design": {{
    "existing_category": "...",
    "new_category_option": "...",
    "category_strategy": "compete|create_new"
  }},
  "brand_personality": ["trait1","trait2","trait3"]
}}"""
        result = await self.json_completion(system, prompt, max_tokens=3000)
        await self.save_artifact("differentiation", result)
        await self.log(f"Positioning: {result.get('positioning_statement', '')[:100]}...", "success")
        return result


async def run_phase_12(run_id: str, winner: str, domain: str, broadcast: Callable) -> dict:
    agents = [
        MarketResearchAgent(run_id, broadcast),
        DeepCompetitorAgent(run_id, broadcast),
        AudienceAnalysisAgent(run_id, broadcast),
        DifferentiationAgent(run_id, broadcast),
    ]
    results = await asyncio.gather(*[a.run(winner, domain) for a in agents], return_exceptions=True)
    output = {}
    for agent, result in zip(agents, results):
        output[agent.name] = result if not isinstance(result, Exception) else {"error": str(result)}
    return output
