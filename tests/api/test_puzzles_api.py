

async def test_daily_puzzle_no_solution_field(client, fresh_user):
    r = await client.get('/puzzles/daily', headers=fresh_user['headers'])
    assert r.status_code == 200
    body = r.json()
    p = body['puzzle']
    assert 'solution' not in p
    assert p.get('solution_length') == 1
    assert body['completed'] is False


async def test_random_puzzle_within_rating_band(client, fresh_user):
    r = await client.get('/puzzles/random', headers=fresh_user['headers'])
    assert r.status_code == 200
    p = r.json()['puzzle']
    assert 'solution' not in p
    assert isinstance(p['rating'], int)


async def test_attempt_records(client, fresh_user):
    h = fresh_user['headers']
    rp = (await client.get('/puzzles/random', headers=h)).json()['puzzle']
    sub = await client.post(f'/puzzles/{rp["id"]}/attempt', headers=h,
                            json={'moves': ['a2a3'], 'success': True, 'time_taken_ms': 1000, 'used_hint': False})
    assert sub.status_code == 200
    body = sub.json()
    assert 'attempt' in body
