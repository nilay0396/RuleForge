import pytest


async def test_global_leaderboard(client, player1):
    r = await client.get('/leaderboard/global?scope=global&limit=10', headers=player1['headers'])
    assert r.status_code == 200
    body = r.json()
    assert 'leaderboard' in body
    if body['leaderboard']:
        assert body['leaderboard'][0]['rank'] == 1


async def test_country_leaderboard(client, player1):
    r = await client.get('/leaderboard/global?scope=country&country=ZZ', headers=player1['headers'])
    assert r.status_code == 200
    assert r.json()['leaderboard'] == []
