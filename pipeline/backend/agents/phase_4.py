"""Phase 4 — Business Validation: Business Model, GTM, Financial Projections."""
import asyncio
import json
from typing import Callable
from .base import BaseAgent


class BusinessModelAgent(BaseAgent):
    name = "business_model"
    phase = "4"

    async def run(self, winner: str, phase_12_data: dict) -> dict:
        await self.log(f"Designing business model for: {winner}")
        system = "You are a startup business model expert and monetization strategist."
        context = json.dumps(phase_12_data, indent=2)[:3000]
        prompt = f"""Startup idea: {winner}
Research context: {context}

Design the optimal business model. Return JSON:
{{
  "primary_revenue_model": "saas|marketplace|transactional|usage_based|freemium|enterprise",
  "pricing_tiers": [
    {{"tier": "...", "price": "$X/mo", "features": ["f1","f2"], "target": "..."}},
  ],
  "recommended_entry_price": "$X/mo",
  "unit_economics": {{
    "cac_estimate": "$X",
    "ltv_estimate": "$X",
    "ltv_cac_ratio": "X:1",
    "payback_period": "X months",
    "gross_margin_est": "X%"
  }},
  "secondary_revenue_streams": ["stream1", "stream2"],
  "expansion_revenue_strategy": "...",
  "pricing_psychology": "...",
  "freemium_hook": "...",
  "enterprise_play": "...",
  "business_model_score": 0-100
}}"""
        result = await self.json_completion(system, prompt, max_tokens=4000)
        await self.save_artifact("business_model", result)
        ue = result.get("unit_economics", {})
        await self.log(f"LTV/CAC: {ue.get('ltv_cac_ratio')} | Payback: {ue.get('payback_period')} | Margin: {ue.get('gross_margin_est')}", "success")
        return result


class GTMStrategyAgent(BaseAgent):
    name = "gtm_strategy"
    phase = "4"

    async def run(self, winner: str, phase_12_data: dict) -> dict:
        await self.log(f"Building go-to-market strategy for: {winner}")
        system = "You are a B2B/B2C go-to-market strategist with experience launching 10+ startups."
        context = json.dumps(phase_12_data, indent=2)[:3000]
        prompt = f"""Startup idea: {winner}
Context: {context}

Design a 12-month GTM strategy. Return JSON:
{{
  "gtm_motion": "product_led|sales_led|community_led|content_led",
  "launch_strategy": {{
    "day_1_to_30": "...",
    "month_2_to_6": "...",
    "month_7_to_12": "..."
  }},
  "acquisition_channels": [
    {{"channel": "...", "priority": "primary|secondary", "cac_est": "$X", "volume_est": "X leads/mo", "tactics": ["t1","t2"]}}
  ],
  "first_100_customers_playbook": ["step1", "step2", "step3"],
  "partnerships": ["partner_type1", "partner_type2"],
  "content_strategy": "...",
  "virality_hooks": ["hook1", "hook2"],
  "sales_motion": "self_serve|inside_sales|field_sales",
  "key_metrics_to_track": ["metric1", "metric2", "metric3"],
  "gtm_budget_year1": "$X",
  "gtm_confidence_score": 0-100
}}"""
        result = await self.json_completion(system, prompt, max_tokens=4000)
        await self.save_artifact("gtm_strategy", result)
        await self.log(f"GTM motion: {result.get('gtm_motion')} | Channels: {len(result.get('acquisition_channels', []))} | Confidence: {result.get('gtm_confidence_score')}/100", "success")
        return result


class FinancialProjectionsAgent(BaseAgent):
    name = "financial_projections"
    phase = "4"

    async def run(self, winner: str, biz_model: dict) -> dict:
        await self.log(f"Building 3-year financial model for: {winner}")
        system = "You are a startup CFO and financial modeler. Build realistic but ambitious projections."
        context = json.dumps(biz_model, indent=2)[:2000]
        prompt = f"""Startup idea: {winner}
Business model context: {context}

Build a 3-year financial projection. Return JSON:
{{
  "assumptions": {{
    "starting_arr": "$0",
    "avg_contract_value": "$X/yr",
    "monthly_churn": "X%",
    "sales_cycle": "X weeks",
    "team_size_y1": X,
    "burn_rate_y1": "$X/mo"
  }},
  "projections": {{
    "year_1": {{"mrr_end": "$X", "arr": "$X", "customers": X, "employees": X, "burn": "$XM", "revenue": "$X"}},
    "year_2": {{"mrr_end": "$X", "arr": "$X", "customers": X, "employees": X, "burn": "$XM", "revenue": "$X"}},
    "year_3": {{"mrr_end": "$X", "arr": "$X", "customers": X, "employees": X, "burn": "$XM", "revenue": "$X"}}
  }},
  "funding_requirements": {{
    "seed": {{"amount": "$X", "runway": "X months", "use_of_funds": "..."}},
    "series_a": {{"timing": "month X", "amount": "$XM", "milestone_to_raise": "..."}}
  }},
  "break_even_timeline": "month X",
  "key_financial_risks": ["risk1", "risk2"],
  "comparable_exits": ["company1 ($XM)", "company2 ($XB)"],
  "financial_confidence": "high|medium|low"
}}"""
        result = await self.json_completion(system, prompt, max_tokens=4000)
        await self.save_artifact("financial_projections", result)
        y3 = result.get("projections", {}).get("year_3", {})
        await self.log(f"Y3 ARR: {y3.get('arr')} | Y3 Customers: {y3.get('customers')} | Break-even: {result.get('break_even_timeline')}", "success")
        return result


async def run_phase_4(run_id: str, winner: str, domain: str, phase_12_data: dict, broadcast: Callable) -> dict:
    biz_agent = BusinessModelAgent(run_id, broadcast)
    gtm_agent = GTMStrategyAgent(run_id, broadcast)

    # Run biz model and GTM in parallel, then use biz model for financial projections
    biz_result, gtm_result = await asyncio.gather(
        biz_agent.run(winner, phase_12_data),
        gtm_agent.run(winner, phase_12_data),
        return_exceptions=True,
    )

    fin_agent = FinancialProjectionsAgent(run_id, broadcast)
    fin_result = await fin_agent.run(winner, biz_result if not isinstance(biz_result, Exception) else {})

    return {
        "business_model": biz_result if not isinstance(biz_result, Exception) else {"error": str(biz_result)},
        "gtm_strategy": gtm_result if not isinstance(gtm_result, Exception) else {"error": str(gtm_result)},
        "financial_projections": fin_result if not isinstance(fin_result, Exception) else {"error": str(fin_result)},
    }
