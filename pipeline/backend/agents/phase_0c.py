"""Phase 0C — Autonomous Validation: 5 agents per top idea, all in parallel."""
import asyncio
import json
from typing import Callable
from .base import BaseAgent


class LandingPageAgent(BaseAgent):
    name = "landing_page"
    phase = "0C"

    async def run(self, idea: dict) -> dict:
        idea_name = idea.get("idea_name", "")
        await self.log(f"Generating landing page mockup for: {idea_name}")
        system = "You are a conversion-focused landing page copywriter and UX designer."
        prompt = f"""Idea: {json.dumps(idea, indent=2)[:2000]}

Create a complete landing page spec. Return JSON:
{{
  "headline": "...",
  "subheadline": "...",
  "hero_cta": "Get Early Access",
  "value_propositions": ["prop1", "prop2", "prop3"],
  "social_proof_placeholder": "...",
  "pricing_hint": "...",
  "faq": [{{"q": "...", "a": "..."}}],
  "estimated_conversion_rate": "X-Y%",
  "cro_notes": "...",
  "html_skeleton": "<html>...</html>"
}}

For html_skeleton, write a real minimal HTML page with the copy filled in."""
        result = await self.json_completion(system, prompt, max_tokens=3000)
        await self.save_artifact(f"landing_page_{idea_name[:30]}", result)
        await self.log(f"Landing page ready. Est. CVR: {result.get('estimated_conversion_rate')}", "success")
        return result


class SurveyDesignerAgent(BaseAgent):
    name = "survey_designer"
    phase = "0C"

    async def run(self, idea: dict) -> dict:
        idea_name = idea.get("idea_name", "")
        await self.log(f"Designing validation survey for: {idea_name}")
        system = "You are a customer discovery expert who designs lean startup validation surveys."
        prompt = f"""Idea: {json.dumps(idea, indent=2)[:2000]}

Design a validation survey. Return JSON:
{{
  "survey_title": "...",
  "intro_text": "...",
  "questions": [
    {{
      "id": 1,
      "type": "multiple_choice|scale|open_text",
      "question": "...",
      "options": ["opt1", "opt2"],
      "why_this_question": "..."
    }}
  ],
  "target_respondents": "...",
  "distribution_channels": ["channel1", "channel2"],
  "success_criteria": "...",
  "willingness_to_pay_question": "...",
  "estimated_completion_time": "X minutes"
}}"""
        result = await self.json_completion(system, prompt)
        await self.save_artifact(f"survey_{idea_name[:30]}", result)
        await self.log(f"Survey designed: {len(result.get('questions', []))} questions", "success")
        return result


class SearchVolumeAgent(BaseAgent):
    name = "search_volume"
    phase = "0C"

    async def run(self, idea: dict) -> dict:
        idea_name = idea.get("idea_name", "")
        await self.log(f"Estimating search volume & SEO demand for: {idea_name}")
        system = (
            "You are an SEO and demand analyst. Estimate keyword search volumes and "
            "trends based on your knowledge of SEMrush/Google Keyword Planner data."
        )
        prompt = f"""Idea: {json.dumps(idea, indent=2)[:2000]}

Estimate search demand. Return JSON:
{{
  "primary_keywords": [
    {{"keyword": "...", "monthly_volume_est": "...", "trend": "growing|stable|declining", "competition": "high|medium|low", "cpc_est": "$X"}}
  ],
  "long_tail_keywords": ["kw1", "kw2"],
  "total_addressable_search_volume": "X/month",
  "seo_opportunity_score": 0-100,
  "paid_search_budget_est": "$X/month for meaningful traffic",
  "trend_direction": "up|flat|down",
  "key_insight": "..."
}}"""
        result = await self.json_completion(system, prompt)
        await self.save_artifact(f"search_volume_{idea_name[:30]}", result)
        await self.log(f"SEO score: {result.get('seo_opportunity_score')}/100 | Vol: {result.get('total_addressable_search_volume')}", "success")
        return result


class CommunityEngagementAgent(BaseAgent):
    name = "community_engagement"
    phase = "0C"

    async def run(self, idea: dict) -> dict:
        idea_name = idea.get("idea_name", "")
        await self.log(f"Mapping community validation strategy for: {idea_name}")
        system = "You are a community-led growth expert who validates startup ideas through authentic community engagement."
        prompt = f"""Idea: {json.dumps(idea, indent=2)[:2000]}

Design a community validation strategy. Return JSON:
{{
  "target_communities": [
    {{"platform": "...", "community": "...", "members_est": "...", "relevance": "high|medium"}}
  ],
  "post_templates": [
    {{"platform": "...", "post_title": "...", "post_body": "...", "expected_engagement": "..."}}
  ],
  "fake_door_test": {{
    "concept": "...",
    "call_to_action": "...",
    "success_metric": "X% click-through"
  }},
  "expected_signals": ["signal1", "signal2"],
  "validation_timeline": "X days",
  "community_fit_score": 0-100
}}"""
        result = await self.json_completion(system, prompt, max_tokens=3000)
        await self.save_artifact(f"community_{idea_name[:30]}", result)
        await self.log(f"Community fit: {result.get('community_fit_score')}/100 | Communities: {len(result.get('target_communities', []))}", "success")
        return result


class CompetitorLandscapeAgent(BaseAgent):
    name = "competitor_landscape"
    phase = "0C"

    async def run(self, idea: dict) -> dict:
        idea_name = idea.get("idea_name", "")
        await self.log(f"Mapping competitor landscape for: {idea_name}")
        system = "You are a competitive intelligence analyst specializing in SaaS and tech startups."
        prompt = f"""Idea: {json.dumps(idea, indent=2)[:2000]}

Map the competitive landscape. Return JSON:
{{
  "direct_competitors": [
    {{"name": "...", "url": "...", "funding": "...", "strengths": ["s1"], "weaknesses": ["w1"], "pricing": "..."}}
  ],
  "indirect_competitors": [
    {{"name": "...", "overlap": "..."}}
  ],
  "market_gaps": ["gap1", "gap2"],
  "whitespace_analysis": "...",
  "differentiation_angles": ["angle1", "angle2"],
  "competitive_moat_suggestions": ["moat1", "moat2"],
  "competition_intensity": "high|medium|low",
  "whitespace_score": 0-100
}}"""
        result = await self.json_completion(system, prompt, max_tokens=3000)
        await self.save_artifact(f"competitors_{idea_name[:30]}", result)
        await self.log(f"Whitespace score: {result.get('whitespace_score')}/100 | Direct comps: {len(result.get('direct_competitors', []))}", "success")
        return result


async def _validate_one_idea(idea: dict, run_id: str, broadcast: Callable) -> dict:
    """Run 5 validation agents in parallel for a single idea."""
    agents = [
        LandingPageAgent(run_id, broadcast),
        SurveyDesignerAgent(run_id, broadcast),
        SearchVolumeAgent(run_id, broadcast),
        CommunityEngagementAgent(run_id, broadcast),
        CompetitorLandscapeAgent(run_id, broadcast),
    ]
    results = await asyncio.gather(*[a.run(idea) for a in agents], return_exceptions=True)
    out = {}
    for agent, result in zip(agents, results):
        out[agent.name] = result if not isinstance(result, Exception) else {"error": str(result)}
    return out


async def run_phase_0c(run_id: str, top_5_ideas: list, broadcast: Callable) -> dict:
    """Run all 5 validation agents for each of the top 5 ideas, all in parallel."""
    idea_tasks = [_validate_one_idea(idea, run_id, broadcast) for idea in top_5_ideas[:5]]
    results = await asyncio.gather(*idea_tasks, return_exceptions=True)
    output = {}
    for idea, result in zip(top_5_ideas[:5], results):
        name = idea.get("idea_name", "unknown")
        output[name] = result if not isinstance(result, Exception) else {"error": str(result)}
    return output
