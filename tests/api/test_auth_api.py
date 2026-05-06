import pytest
import uuid


async def test_signup_login_me(client):
    email = f'qa-{uuid.uuid4().hex[:8]}@ruleforgeqa.app'
    pw = 'QaTest@1234'
    r = await client.post('/auth/register', json={'email': email, 'password': pw, 'name': 'QA'})
    assert r.status_code in (200, 201)
    token = r.json()['token']
    me = await client.get('/auth/me', headers={'Authorization': f'Bearer {token}'})
    assert me.status_code == 200
    assert me.json()['user']['email'] == email


async def test_login_wrong_password(client):
    r = await client.post('/auth/login', json={'email': 'player1@ruleforge.app', 'password': 'wrong'})
    assert r.status_code == 401


async def test_guest_login(client):
    r = await client.post('/auth/guest', json={'name': 'Guest QA'})
    assert r.status_code == 200
    assert r.json()['user']['is_guest'] is True


async def test_jwt_required(client):
    r = await client.get('/auth/me')
    assert r.status_code in (401, 403)


async def test_jwt_invalid(client):
    r = await client.get('/auth/me', headers={'Authorization': 'Bearer NOTAVALIDTOKEN'})
    assert r.status_code in (401, 403)
