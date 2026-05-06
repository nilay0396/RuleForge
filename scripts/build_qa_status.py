"""Aggregate latest pytest run into a small JSON for the QA dashboard.
Reads pytest_raw.json (if produced by pytest-json-report) or scrapes the
textual summary file. Writes /app/test_reports/pytest_summary.json.
"""
import json
import os
import re
import subprocess
from datetime import datetime, timezone

REPORT_DIR = '/app/test_reports'
os.makedirs(REPORT_DIR, exist_ok=True)
RAW = os.path.join(REPORT_DIR, 'pytest_raw.json')
OUT = os.path.join(REPORT_DIR, 'pytest_summary.json')


def run_pytest_summary():
    """Run pytest in capture mode and parse the trailing summary line."""
    proc = subprocess.run(
        ['python', '-m', 'pytest', '-q', '--tb=no', '-W', 'ignore::DeprecationWarning',
         'unit', 'api'],
        cwd='/app/tests', capture_output=True, text=True, timeout=600,
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


def main():
    summary = run_pytest_summary()
    summary['e2e_pass'] = None  # populated by Playwright suite when wired
    with open(OUT, 'w') as f:
        json.dump(summary, f, indent=2)
    print(f'Wrote {OUT}: {summary["passed"]} passed, {summary["failed"]} failed.')


if __name__ == '__main__':
    main()
