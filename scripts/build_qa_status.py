"""Aggregate latest pytest run into a small JSON for the QA dashboard.
Reads pytest_raw.json (if produced by pytest-json-report) or scrapes the
textual summary file. Writes test_reports/pytest_summary.json.
"""
import json
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPORT_DIR = ROOT / 'test_reports'
REPORT_DIR.mkdir(exist_ok=True)
RAW = REPORT_DIR / 'pytest_raw.json'
OUT = REPORT_DIR / 'pytest_summary.json'


def run_pytest_summary():
    """Run pytest in capture mode and parse the trailing summary line."""
    proc = subprocess.run(
        ['python', '-m', 'pytest', '-q', '--tb=no', '-W', 'ignore::DeprecationWarning',
         'unit', 'api'],
        cwd=ROOT / 'tests', capture_output=True, text=True, timeout=600,
    )
    out = (proc.stdout or '') + '\n' + (proc.stderr or '')
    m = re.search(r'(\d+) passed', out)
    passed = int(m.group(1)) if m else 0
    m = re.search(r'(\d+) failed', out)
    failed = int(m.group(1)) if m else 0
    m = re.search(r'(\d+) error', out)
    errors = int(m.group(1)) if m else 0
    m = re.search(r'(\d+) skipped', out)
    skipped = int(m.group(1)) if m else 0
    return {
        'passed': passed,
        'failed': failed,
        'errors': errors,
        'skipped': skipped,
        'returncode': proc.returncode,
        'tail': '\n'.join(out.splitlines()[-20:]),
        'generated_at': datetime.now(timezone.utc).isoformat(),
    }


def parse_e2e_report():
    """Read Playwright JSON reporter output for E2E summary."""
    path = REPORT_DIR / 'e2e-results.json'
    if not path.exists():
        return None
    try:
        with path.open() as f:
            data = json.load(f)
    except Exception:
        return None
    stats = data.get('stats', {})
    expected = stats.get('expected', 0)
    unexpected = stats.get('unexpected', 0)
    return {
        'expected': expected,
        'unexpected': unexpected,
        'flaky': stats.get('flaky', 0),
        'skipped': stats.get('skipped', 0),
        'duration_ms': stats.get('duration', 0),
        'pass': unexpected == 0 and expected > 0,
    }


def main():
    summary = run_pytest_summary()
    e2e = parse_e2e_report()
    summary['e2e'] = e2e
    summary['e2e_pass'] = (e2e or {}).get('pass') if e2e is not None else None
    with OUT.open('w') as f:
        json.dump(summary, f, indent=2)
    print(f'Wrote {OUT}: {summary["passed"]} passed, {summary["failed"]} failed; E2E={summary["e2e_pass"]}.')


if __name__ == '__main__':
    main()
