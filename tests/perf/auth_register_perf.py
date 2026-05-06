"""Targeted performance test for /auth/register.

Sends N concurrent register requests against a freshly-restarted backend and
asserts that p95 latency is below RF_PERF_TARGET_MS (default 800ms).

Writes /app/test_reports/auth_register_perf.json for the QA dashboard.

Run:
    python tests/perf/auth_register_perf.py [N]

This intentionally does NOT use locust so it can run in seconds and produce a
machine-readable report. The same scenario is covered more broadly by the
locust suite.
"""
import asyncio
import json
import os
import statistics
import sys
import time
import uuid
from datetime import datetime, timezone

import httpx

BASE = os.environ.get('TEST_BACKEND_URL', 'http://localhost:8001') + '/api'
TARGET_MS = float(os.environ.get('RF_PERF_TARGET_MS', '800'))
N = int(sys.argv[1]) if len(sys.argv) > 1 else 30
CONCURRENCY = int(os.environ.get('RF_PERF_CONCURRENCY', '10'))


async def one_register(client: httpx.AsyncClient, idx: int) -> float:
    email = f'perf-{uuid.uuid4().hex[:10]}-{idx}@ruleforgeqa.app'
    body = {'email': email, 'password': 'PerfTest@1234', 'name': f'Perf {idx}'}
    t0 = time.perf_counter()
    r = await client.post('/auth/register', json=body, timeout=30)
    dt = (time.perf_counter() - t0) * 1000.0
    r.raise_for_status()
    return dt


async def main():
    async with httpx.AsyncClient(base_url=BASE) as client:
        sem = asyncio.Semaphore(CONCURRENCY)
        timings: list[float] = []

        async def runner(i: int):
            async with sem:
                t = await one_register(client, i)
                timings.append(t)

        await asyncio.gather(*(runner(i) for i in range(N)))

    timings.sort()
    p50 = statistics.median(timings)
    p95 = timings[int(0.95 * len(timings)) - 1] if len(timings) >= 20 else max(timings)
    p99 = timings[int(0.99 * len(timings)) - 1] if len(timings) >= 100 else max(timings)
    mean = statistics.mean(timings)
    target_met = p95 < TARGET_MS

    out = {
        'endpoint': 'POST /auth/register',
        'samples': len(timings),
        'concurrency': CONCURRENCY,
        'target_ms': TARGET_MS,
        'p50_ms': round(p50, 1),
        'p95_ms': round(p95, 1),
        'p99_ms': round(p99, 1),
        'mean_ms': round(mean, 1),
        'min_ms': round(min(timings), 1),
        'max_ms': round(max(timings), 1),
        'target_met': target_met,
        'generated_at': datetime.now(timezone.utc).isoformat(),
    }
    os.makedirs('/app/test_reports', exist_ok=True)
    out_path = '/app/test_reports/auth_register_perf.json'
    with open(out_path, 'w') as f:
        json.dump(out, f, indent=2)

    print(json.dumps(out, indent=2))
    print(f'\\nWrote {out_path}')

    sys.exit(0 if target_met else 1)


if __name__ == '__main__':
    asyncio.run(main())
