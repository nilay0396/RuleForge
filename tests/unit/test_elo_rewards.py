"""Unit-style coverage of Elo + reward maths via API integration."""
import pytest
import httpx


async def test_daily_reward_first_claim(client, fresh_user):
    h = fresh_user['headers']
    # state initially available
    s = await client.get('/daily-reward/state', headers=h)
    assert s.status_code == 200
    assert s.json()['reward']['available'] is True
    # claim
    r = await client.post('/daily-reward/claim', headers=h)
    assert r.status_code == 200
    body = r.json()
    assert body['claimed'] is True
    assert body['coins'] == 50
    assert body['xp'] == 25
    assert body['multiplier'] in (1.0, 1)
    assert body['streak'] == 1
    # second claim same day → already_claimed
    r2 = await client.post('/daily-reward/claim', headers=h)
    assert r2.status_code == 200
    assert r2.json()['already_claimed'] is True


async def test_match_record_updates_elo(client, fresh_user):
    h = fresh_user['headers']
    payload = {
        'mode': 'offline',
        'rule_key': 'classic',
        'result': 'win',
        'moves_san': ['e4', 'e5', 'Nf3'],
        'ai_level': 1500,
    }
    r = await client.post('/matches', headers=h, json=payload)
    assert r.status_code == 200, r.text
    body = r.json()
    match = body.get('match', body)
    assert match['rating_after'] > match['rating_before']
    assert match['elo_delta'] > 0


async def test_match_record_loss_decreases_elo(client, fresh_user):
    h = fresh_user['headers']
    payload = {
        'mode': 'offline', 'rule_key': 'classic', 'result': 'loss',
        'moves_san': ['e4'], 'ai_level': 600,
    }
    r = await client.post('/matches', headers=h, json=payload)
    assert r.status_code == 200
    match = r.json().get('match', r.json())
    assert match['elo_delta'] <= 0


async def test_rating_history_recorded(client, fresh_user):
    h = fresh_user['headers']
    await client.post('/matches', headers=h, json={
        'mode': 'offline', 'rule_key': 'classic', 'result': 'win',
        'moves_san': ['e4'], 'ai_level': 1200})
    # auth/me should reflect updated stats
    me = await client.get('/auth/me', headers=h)
    assert me.status_code == 200
    user = me.json()['user']
    assert user['wins'] >= 1
