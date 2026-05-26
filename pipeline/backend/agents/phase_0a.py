"""Phase 0A — Scraping Agent Swarm (6 agents run in parallel)."""
import asyncio
from typing import Callable
from .base import BaseAgent


class TrendScraperAgent(BaseAgent):
    name = "trend_scraper"
    phase = "0A"

    async def run(self, domain: str) -> dict:
        await self.log(f"Scanning trend signals for: {domain}")
        system = (
            "You are a market trend intelligence analyst. Your job is to identify "
            "rising keywords, viral discussions, and emerging trend signals relevant to "
            "a given domain. Synthesize data as if you had just scraped Google Trends, "
            "Reddit trending, and X/Twitter for the past 30 days."
        )
        prompt = f"""Domain: {domain}

Analyze trend signals and return a JSON object with:
{{
  "rising_keywords": ["keyword1", "keyword2", ...],  // top 10 rising search terms
  "viral_topics": [
    {{"topic": "...", "platform": "...", "engagement_signal": "high|medium|low", "summary": "..."}}
  ],
  "trend_momentum": "accelerating|steady|declining",
  "trend_score": 0-100,
  "key_insight": "one-sentence insight about the strongest trend signal",
  "raw_signals": ["signal1", "signal2", ...]  // 5-8 specific data points
}}"""
        result = await self.json_completion(system, prompt)
        await self.save_artifact("trend_signals", result)
        await self.log(f"Trend score: {result.get('trend_score')}/100 | Momentum: {result.get('trend_momentum')}", "success")
        return result


class NewsSignalAgent(BaseAgent):
    name = "news_signal"
    phase = "0A"

    async def run(self, domain: str) -> dict:
        await self.log(f"Scanning news & VC signals for: {domain}")
        system = (
            "You are a tech news and venture capital signal analyst. Synthesize recent "
            "news (TechCrunch, HackerNews, newsletters) and VC investment data as if "
            "you had live access to them for the past 90 days."
        )
        prompt = f"""Domain: {domain}

Analyze news and investment signals. Return JSON:
{{
  "recent_headlines": [
    {{"headline": "...", "source": "...", "relevance": "high|medium", "date_approx": "..."}}
  ],
  "funded_startups": [
    {{"name": "...", "funding_stage": "...", "amount": "...", "investor": "...", "what_they_solve": "..."}}
  ],
  "vc_interest_areas": ["area1", "area2"],
  "emerging_industries": ["industry1", "industry2"],
  "news_score": 0-100,
  "key_insight": "one-sentence insight about investor appetite"
}}"""
        result = await self.json_completion(system, prompt)
        await self.save_artifact("news_signals", result)
        await self.log(f"News score: {result.get('news_score')}/100 | VC areas: {len(result.get('vc_interest_areas', []))}", "success")
        return result


class PainPointMinerAgent(BaseAgent):
    name = "pain_point_miner"
    phase = "0A"

    async def run(self, domain: str) -> dict:
        await self.log(f"Mining pain points & complaints for: {domain}")
        system = (
            "You are a customer pain point intelligence analyst. Synthesize Reddit posts "
            "(r/entrepreneur, r/startups, niche subreddits), App Store reviews, and "
            "forum complaints as if you had live access, identifying 'I wish...', "
            "'Why doesn't X exist', 'I hate that...' patterns."
        )
        prompt = f"""Domain: {domain}

Mine pain points and unmet needs. Return JSON:
{{
  "pain_points": [
    {{
      "pain": "...",
      "frequency": "very_common|common|occasional",
      "intensity": "critical|high|medium",
      "verbatim_examples": ["quote1", "quote2"],
      "source": "reddit|app_store|forum"
    }}
  ],
  "wish_list": ["feature/product people wish existed"],
  "top_complaints": ["complaint1", "complaint2"],
  "pain_score": 0-100,
  "key_insight": "the single biggest unmet need in this domain"
}}"""
        result = await self.json_completion(system, prompt, max_tokens=5000)
        await self.save_artifact("pain_points", result)
        await self.log(f"Pain score: {result.get('pain_score')}/100 | Pain points found: {len(result.get('pain_points', []))}", "success")
        return result


class JobMarketAgent(BaseAgent):
    name = "job_market"
    phase = "0A"

    async def run(self, domain: str) -> dict:
        await self.log(f"Analyzing job market hiring patterns for: {domain}")
        system = (
            "You are a job market intelligence analyst. Analyze LinkedIn and Indeed hiring "
            "patterns to identify what problems companies are hiring people to solve manually "
            "— indicating automation or SaaS opportunities."
        )
        prompt = f"""Domain: {domain}

Analyze hiring patterns. Return JSON:
{{
  "fast_growing_roles": [
    {{"title": "...", "growth_rate": "...", "companies_hiring": ["co1","co2"], "manual_problem_they_solve": "..."}}
  ],
  "manual_processes_ripe_for_automation": [
    {{"process": "...", "evidence": "...", "opportunity_size": "large|medium|small"}}
  ],
  "top_skills_in_demand": ["skill1", "skill2"],
  "companies_with_budget": ["co1", "co2"],
  "job_market_score": 0-100,
  "key_insight": "the biggest automation opportunity based on hiring data"
}}"""
        result = await self.json_completion(system, prompt)
        await self.save_artifact("job_market", result)
        await self.log(f"Job market score: {result.get('job_market_score')}/100", "success")
        return result


class PatentResearchAgent(BaseAgent):
    name = "patent_research"
    phase = "0A"

    async def run(self, domain: str) -> dict:
        await self.log(f"Scanning patents & academic research for: {domain}")
        system = (
            "You are a technology scouting analyst specializing in patents and academic "
            "research. Identify technologies being built (patents filed, papers published) "
            "but not yet commercially productized — these represent whitespace opportunities."
        )
        prompt = f"""Domain: {domain}

Identify technology whitespace from patents and research. Return JSON:
{{
  "recent_patents": [
    {{"title": "...", "assignee": "...", "technology": "...", "commercialization_status": "not_yet|partial|commercialized"}}
  ],
  "arxiv_papers": [
    {{"title": "...", "key_finding": "...", "commercial_potential": "high|medium|low"}}
  ],
  "unproductized_technologies": [
    {{"technology": "...", "why_not_yet_built": "...", "opportunity": "..."}}
  ],
  "research_score": 0-100,
  "key_insight": "the most promising tech being built in labs but not yet available as a product"
}}"""
        result = await self.json_completion(system, prompt)
        await self.save_artifact("patent_research", result)
        await self.log(f"Research score: {result.get('research_score')}/100 | Unproductized techs: {len(result.get('unproductized_technologies', []))}", "success")
        return result


class SocialListeningAgent(BaseAgent):
    name = "social_listening"
    phase = "0A"

    async def run(self, domain: str) -> dict:
        await self.log(f"Listening to communities & social signals for: {domain}")
        system = (
            "You are a social listening intelligence analyst. Monitor hashtags, Facebook "
            "Groups, Discord servers, and Slack communities to detect unmet needs, "
            "sentiment shifts, and community pain patterns."
        )
        prompt = f"""Domain: {domain}

Analyze social listening signals. Return JSON:
{{
  "active_communities": [
    {{"platform": "...", "community": "...", "size_estimate": "...", "dominant_pain": "..."}}
  ],
  "sentiment_signals": [
    {{"topic": "...", "sentiment": "positive|negative|mixed", "intensity": "high|medium|low", "recurring_theme": "..."}}
  ],
  "feature_requests": ["request1", "request2"],
  "underserved_segments": ["segment1", "segment2"],
  "social_score": 0-100,
  "key_insight": "the community signal with the strongest unmet need"
}}"""
        result = await self.json_completion(system, prompt)
        await self.save_artifact("social_listening", result)
        await self.log(f"Social score: {result.get('social_score')}/100 | Communities: {len(result.get('active_communities', []))}", "success")
        return result


async def run_phase_0a(run_id: str, domain: str, broadcast: Callable) -> dict:
    """Run all 6 scraping agents in parallel."""
    agents = [
        TrendScraperAgent(run_id, broadcast),
        NewsSignalAgent(run_id, broadcast),
        PainPointMinerAgent(run_id, broadcast),
        JobMarketAgent(run_id, broadcast),
        PatentResearchAgent(run_id, broadcast),
        SocialListeningAgent(run_id, broadcast),
    ]
    results = await asyncio.gather(
        *[a.run(domain) for a in agents],
        return_exceptions=True,
    )
    output = {}
    for agent, result in zip(agents, results):
        if isinstance(result, Exception):
            await broadcast({
                "type": "log",
                "data": {"run_id": run_id, "phase": "0A", "agent": agent.name,
                         "level": "error", "message": f"Agent failed: {result}",
                         "created_at": "now"},
            })
            output[agent.name] = {"error": str(result)}
        else:
            output[agent.name] = result
    return output
