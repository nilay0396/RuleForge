"""Unit-level tests for the store / wallet flow."""
import pytest


async def test_default_items_owned(client, fresh_user):
    h = fresh_user['headers']
    r = await client.get('/store', headers=h)
    assert r.status_code == 200
    items = r.json()['items']
    keys = {i['key']: i for i in items}
    assert keys['board_classic']['owned'] is True
    assert keys['board_classic']['equipped'] is True


async def test_insufficient_coins_blocks_purchase(client, fresh_user):
    h = fresh_user['headers']
    # New user has 0 coins; emerald board is 300
    r = await client.post('/store/board_emerald/buy', headers=h)
    assert r.status_code == 402


async def test_premium_only_locked_for_free_user(client, fresh_user):
    h = fresh_user['headers']
    r = await client.post('/store/board_obsidian/buy', headers=h)
    assert r.status_code == 403


async def test_unknown_item_404(client, fresh_user):
    h = fresh_user['headers']
    r = await client.post('/store/this_does_not_exist/buy', headers=h)
    assert r.status_code == 404


async def test_equip_locked_theme_blocked(client, fresh_user):
    h = fresh_user['headers']
    r = await client.put('/preferences', headers=h, json={'board_theme': 'board_midnight'})
    assert r.status_code == 403
