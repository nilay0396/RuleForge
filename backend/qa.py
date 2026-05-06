"""QA module: bug tracker + release-readiness dashboard.

Admin-protected. Bugs collection schema:
  id, title, severity (blocker|critical|major|minor),
  feature, steps, expected, actual, status (open|in_progress|fixed|closed|wont_fix),
  assigned_to (user_id or null), reporter_id, created_at, updated_at.

The /qa/dashboard endpoint returns aggregated stats used by the admin
release-readiness UI. It is intentionally lightweight and read-only.
"""
from __future__ import annotations

import os
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

ALLOWED_SEVERITY = {'blocker', 'critical', 'major', 'minor'}
ALLOWED_STATUS = {'open', 'in_progress', 'fixed', 'closed', 'wont_fix'}

UAT_RESULTS_PATH = '/app/docs/UAT_RESULTS.md'
VERSION_PATH = '/app/VERSION'


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _read_version() -> str:
    try:
        if os.path.exists(VERSION_PATH):
            with open(VERSION_PATH, 'r') as f:
                return f.read().strip() or 'unknown'
    except Exception:
        pass
    return 'unknown'


def _parse_uat_results(path: str = UAT_RESULTS_PATH) -> Dict[str, Any]:
    """Parse the UAT_RESULTS.md markdown into pass/fail/blocked counts.

    Strategy:
      * Walk every markdown table row and inspect the Status cell.
      * Recognized markers:
          ✅       -> auto_pass
          🟦       -> manual_pass
          🟨       -> human_signoff (treated as 'blocked' / pending sign-off)
          ❌       -> failed
      * Also pulls Build/Run-date metadata, plus the document-level Summary
        block if present (used as a sanity fallback when the table parse
        produces 0 cases).
    """
    result: Dict[str, Any] = {
        'source': path,
        'exists': False,
        'build': None,
        'run_date': None,
        'total': 0,
        'passed': 0,           # auto + manual passes
        'auto_pass': 0,
        'manual_pass': 0,
        'failed': 0,
        'blocked': 0,          # human-signoff pending
        'pass_rate': 0.0,
        'sections': [],
        'verdict': None,
    }
    if not os.path.exists(path):
        return result
    result['exists'] = True
    try:
        with open(path, 'r', encoding='utf-8') as f:
            text = f.read()
    except Exception:
        return result

    # Metadata
    m = re.search(r'\*\*Run date\*\*\s*[:\-]\s*(.+)', text)
    if m:
        result['run_date'] = m.group(1).strip()
    m = re.search(r'\*\*Build\*\*\s*[:\-]\s*(.+)', text)
    if m:
        result['build'] = m.group(1).strip()

    # Walk per-section. Section heading is "## <name>" excluding "## Summary".
    sections: List[Dict[str, Any]] = []
    cur_section: Optional[Dict[str, Any]] = None
    for raw in text.splitlines():
        line = raw.rstrip()
        if line.startswith('## '):
            heading = line[3:].strip()
            if heading.lower().startswith('summary'):
                cur_section = None
                continue
            cur_section = {
                'name': heading, 'total': 0,
                'passed': 0, 'failed': 0, 'blocked': 0,
            }
            sections.append(cur_section)
            continue
        if not cur_section:
            continue
        # Table row? must start with '|' and not be header/separator
        if not line.startswith('|'):
            continue
        if '---' in line:
            continue
        if line.lower().startswith('| id ') or line.lower().startswith('|id '):
            continue
        cells = [c.strip() for c in line.strip('|').split('|')]
        if len(cells) < 3:
            continue
        # Heuristic: the first cell looks like a test id (ALPHA-01)
        if not re.match(r'^[A-Z]{2,5}-\d{1,3}', cells[0]):
            continue
        status_cell = cells[2] if len(cells) >= 3 else ''
        cur_section['total'] += 1
        result['total'] += 1
        if '❌' in status_cell:
            cur_section['failed'] += 1
            result['failed'] += 1
        elif '🟨' in status_cell:
            cur_section['blocked'] += 1
            result['blocked'] += 1
        elif '🟦' in status_cell:
            cur_section['passed'] += 1
            result['passed'] += 1
            result['manual_pass'] += 1
        elif '✅' in status_cell:
            cur_section['passed'] += 1
            result['passed'] += 1
            result['auto_pass'] += 1
        else:
            # Unknown marker: treat as blocked (pending signoff)
            cur_section['blocked'] += 1
            result['blocked'] += 1

    # Summary fallback — only used if table parse failed entirely
    if result['total'] == 0:
        m = re.search(r'\*\*Total cases\*\*\s*[:\-]\s*(\d+)', text)
        if m:
            result['total'] = int(m.group(1))
        for label, key in (
            ('Auto-pass', 'auto_pass'),
            ('Manual-pass', 'manual_pass'),
            ('Human-signoff required', 'blocked'),
            ('Fail', 'failed'),
        ):
            mm = re.search(rf'\*\*[^*]*{re.escape(label)}[^*]*\*\*[^\d]*(\d+)', text)
            if mm:
                result[key] = int(mm.group(1))
        result['passed'] = result['auto_pass'] + result['manual_pass']

    if result['total'] > 0:
        result['pass_rate'] = round((result['passed'] / result['total']) * 100, 1)

    # Verdict snippet
    m = re.search(r'\*\*Verdict\*\*\s*[:\-]?\s*(.+?)(?:\n\n|$)', text, re.S)
    if m:
        result['verdict'] = re.sub(r'\s+', ' ', m.group(1)).strip()[:400]

    result['sections'] = sections
    return result


class BugIn(BaseModel):
    title: str = Field(..., min_length=2, max_length=200)
    severity: str = Field(..., pattern='^(blocker|critical|major|minor)$')
    feature: str = Field(..., min_length=1, max_length=80)
    steps: str = ''
    expected: str = ''
    actual: str = ''
    assigned_to: Optional[str] = None
    notes: Optional[str] = None


class BugUpdate(BaseModel):
    title: Optional[str] = None
    severity: Optional[str] = None
    feature: Optional[str] = None
    steps: Optional[str] = None
    expected: Optional[str] = None
    actual: Optional[str] = None
    status: Optional[str] = None
    assigned_to: Optional[str] = None
    notes: Optional[str] = None


def make_qa_router(current_user_dep, db_getter):
    router = APIRouter()

    async def _require_admin(user: Dict[str, Any]):
        if user.get('role') != 'admin':
            raise HTTPException(403, 'Admin access required')

    @router.get('/qa/bugs')
    async def list_bugs(
        request: Request,
        status: Optional[str] = None,
        severity: Optional[str] = None,
        feature: Optional[str] = None,
        user: Dict[str, Any] = Depends(current_user_dep),
    ):
        await _require_admin(user)
        db = db_getter(request)
        filt: Dict[str, Any] = {}
        if status:
            filt['status'] = status
        if severity:
            filt['severity'] = severity
        if feature:
            filt['feature'] = feature
        rows = await db.bugs.find(filt, {'_id': 0}).sort('created_at', -1).to_list(500)
        return {'bugs': rows, 'count': len(rows)}

    @router.post('/qa/bugs')
    async def create_bug(
        body: BugIn,
        request: Request,
        user: Dict[str, Any] = Depends(current_user_dep),
    ):
        await _require_admin(user)
        db = db_getter(request)
        doc = {
            'id': str(uuid.uuid4()),
            'title': body.title,
            'severity': body.severity,
            'feature': body.feature,
            'steps': body.steps,
            'expected': body.expected,
            'actual': body.actual,
            'status': 'open',
            'assigned_to': body.assigned_to,
            'reporter_id': user['id'],
            'notes': body.notes or '',
            'created_at': _now_iso(),
            'updated_at': _now_iso(),
        }
        await db.bugs.insert_one(dict(doc))
        return {'bug': doc}

    @router.put('/qa/bugs/{bug_id}')
    async def update_bug(
        bug_id: str,
        body: BugUpdate,
        request: Request,
        user: Dict[str, Any] = Depends(current_user_dep),
    ):
        await _require_admin(user)
        db = db_getter(request)
        existing = await db.bugs.find_one({'id': bug_id}, {'_id': 0})
        if not existing:
            raise HTTPException(404, 'Bug not found')
        updates = {k: v for k, v in body.model_dump().items() if v is not None}
        if 'severity' in updates and updates['severity'] not in ALLOWED_SEVERITY:
            raise HTTPException(400, 'Invalid severity')
        if 'status' in updates and updates['status'] not in ALLOWED_STATUS:
            raise HTTPException(400, 'Invalid status')
        updates['updated_at'] = _now_iso()
        await db.bugs.update_one({'id': bug_id}, {'$set': updates})
        bug = await db.bugs.find_one({'id': bug_id}, {'_id': 0})
        return {'bug': bug}

    @router.delete('/qa/bugs/{bug_id}')
    async def delete_bug(
        bug_id: str,
        request: Request,
        user: Dict[str, Any] = Depends(current_user_dep),
    ):
        await _require_admin(user)
        db = db_getter(request)
        await db.bugs.delete_one({'id': bug_id})
        return {'ok': True}

    @router.get('/qa/dashboard')
    async def dashboard(
        request: Request,
        user: Dict[str, Any] = Depends(current_user_dep),
    ):
        await _require_admin(user)
        db = db_getter(request)
        # Aggregate counts
        agg = await db.bugs.aggregate([
            {'$group': {'_id': {'severity': '$severity', 'status': '$status'},
                        'count': {'$sum': 1}}}
        ]).to_list(100)
        by_sev: Dict[str, Dict[str, int]] = {s: {} for s in ALLOWED_SEVERITY}
        for row in agg:
            sev = row['_id']['severity']
            st = row['_id']['status']
            by_sev.setdefault(sev, {})[st] = row['count']

        def open_count(sev: str) -> int:
            return sum(c for s, c in by_sev.get(sev, {}).items() if s in ('open', 'in_progress'))

        open_blockers = open_count('blocker')
        open_critical = open_count('critical')
        open_major = open_count('major')
        open_minor = open_count('minor')
        total_bugs = await db.bugs.count_documents({})

        # Reading test report file (if pytest has been run) for last summary
        report_path = '/app/test_reports/pytest_summary.json'
        test_report: Optional[Dict[str, Any]] = None
        if os.path.exists(report_path):
            try:
                import json
                with open(report_path) as f:
                    test_report = json.load(f)
            except Exception:
                test_report = None

        # Performance / load metrics file (optional)
        perf_path = '/app/test_reports/perf_summary.json'
        perf_report: Optional[Dict[str, Any]] = None
        if os.path.exists(perf_path):
            try:
                import json
                with open(perf_path) as f:
                    perf_report = json.load(f)
            except Exception:
                perf_report = None

        # Release-readiness gating
        passed_tests = (test_report or {}).get('passed', 0)
        failed_tests = (test_report or {}).get('failed', 0)
        e2e_pass = (test_report or {}).get('e2e_pass', None)
        # Honor either schema (target_met from auth_register_perf.json,
        # targets_met from locust perf_summary.json).
        perf_pass = None
        if perf_report:
            if 'target_met' in perf_report:
                perf_pass = bool(perf_report['target_met'])
            elif 'targets_met' in perf_report:
                perf_pass = bool(perf_report['targets_met'])

        release_ready = (
            open_blockers == 0
            and open_critical == 0
            and failed_tests == 0
            and (e2e_pass is None or e2e_pass is True)
            and (perf_pass is None or perf_pass is True)
        )
        reasons: List[str] = []
        if open_blockers:
            reasons.append(f'{open_blockers} blocker bug(s) open')
        if open_critical:
            reasons.append(f'{open_critical} critical bug(s) open')
        if failed_tests:
            reasons.append(f'{failed_tests} test failures')
        if e2e_pass is False:
            reasons.append('E2E tests failing')
        if perf_pass is False:
            reasons.append('Performance targets unmet')

        return {
            'total_bugs': total_bugs,
            'open_bugs': open_blockers + open_critical + open_major + open_minor,
            'by_severity': {
                'blocker': open_blockers,
                'critical': open_critical,
                'major': open_major,
                'minor': open_minor,
            },
            'tests': test_report or {'passed': 0, 'failed': 0, 'note': 'Run `make test-backend` to populate.'},
            'e2e': (test_report or {}).get('e2e') or {'note': 'Run `make test-e2e` to populate.'},
            'performance': perf_report or {'note': 'Run `make perf` to populate.'},
            'uat': _parse_uat_results(),
            'version': _read_version(),
            'release_ready': release_ready,
            'blockers': reasons,
        }

    @router.get('/qa/uat-status')
    async def uat_status(
        request: Request,
        user: Dict[str, Any] = Depends(current_user_dep),
    ):
        """Manual UAT signoff status, parsed from /app/docs/UAT_RESULTS.md.

        Admin-only. Returns aggregate counters plus per-section breakdown so
        the QA dashboard can render a human-readable signoff card.
        """
        await _require_admin(user)
        uat = _parse_uat_results()
        version = _read_version()
        # Readiness: no failures and version tagged
        ready = (
            uat['exists']
            and uat['total'] > 0
            and uat['failed'] == 0
            and version not in ('', 'unknown')
        )
        return {
            'version': version,
            'uat': uat,
            'ready': ready,
        }

    return router
