import pytest


async def test_list_tournaments(client, player1):
    r = await client.get('/tournaments', headers=player1['headers'])
    assert r.status_code == 200
    rows = r.json()['tournaments']
    assert len(rows) >= 1
    statuses = {t['status'] for t in rows}
    assert statuses & {'live', 'upcoming', 'finished'}


async def test_join_live_tournament(client, fresh_user):
    h = fresh_user['headers']
    rows = (await client.get('/tournaments', headers=h)).json()['tournaments']
    live = next((t for t in rows if t['status'] == 'live'), None)
    assert live, 'no live tournament available'
    j = await client.post(f'/tournaments/{live["id"]}/join', headers=h)
    assert j.status_code == 200
    j2 = await client.post(f'/tournaments/{live["id"]}/join', headers=h)
    assert j2.status_code == 200
    assert j2.json().get('already_joined') is True


async def test_report_match_scoring(client, fresh_user):
    h = fresh_user['headers']
    rows = (await client.get('/tournaments', headers=h)).json()['tournaments']
    live = next((t for t in rows if t['status'] == 'live'), None)
    if not live:
        pytest.skip('no live tournament')
    await client.post(f'/tournaments/{live["id"]}/join', headers=h)
    r = await client.post(f'/tournaments/{live["id"]}/report-match', headers=h,
                          json={'opponent_id': 'opponent-stub', 'result': 'win'})
    assert r.status_code == 200
    assert r.json()['score_added'] == 3
