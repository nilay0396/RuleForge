import pytest


async def test_qa_dashboard_basic(client, admin_user):
    r = await client.get('/qa/dashboard', headers=admin_user['headers'])
    assert r.status_code == 200
    body = r.json()
    assert 'open_bugs' in body
    assert 'release_ready' in body


async def test_create_bug(client, admin_user):
    r = await client.post('/qa/bugs', headers=admin_user['headers'], json={
        'title': 'Test bug', 'severity': 'minor', 'feature': 'auth',
        'steps': '1. login', 'expected': 'works', 'actual': 'broken',
    })
    assert r.status_code == 200
    b = r.json()['bug']
    assert b['severity'] == 'minor'
    assert b['status'] == 'open'


async def test_only_admin_can_create_bugs(client, fresh_user):
    r = await client.post('/qa/bugs', headers=fresh_user['headers'], json={
        'title': 'Non-admin attempt', 'severity': 'minor', 'feature': 'auth',
        'steps': '1', 'expected': '1', 'actual': '1',
    })
    assert r.status_code in (401, 403)
