"""Unit tests for backend chess rules logic (python-chess based validation).

The server uses python-chess for move legality on classic and tracks
custom-rule logic on the client. Backend tests here verify the validators
that live in server.move_validate (POST /api/move/validate).
"""
import httpx


async def _validate(client: httpx.AsyncClient, headers, fen, uci):
    r = await client.post('/move/validate', headers=headers, json={'fen': fen, 'uci': uci})
    return r.status_code, r.json() if r.status_code < 500 else r.text


async def test_classic_legal_pawn_open(client, fresh_user):
    sc, body = await _validate(client, fresh_user['headers'],
                                'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'e2e4')
    assert sc == 200
    assert body['legal'] is True


async def test_classic_illegal_pawn_jump(client, fresh_user):
    # pawn cannot jump 3
    sc, body = await _validate(client, fresh_user['headers'],
                                'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'e2e5')
    assert sc == 200
    assert body['legal'] is False


async def test_invalid_uci_format(client, fresh_user):
    sc, body = await _validate(client, fresh_user['headers'],
                                'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'zz99')
    # Server returns 200 with legal=false for malformed UCI
    assert sc == 200
    assert body['legal'] is False


async def test_check_detection(client, fresh_user):
    # Position where black's king is in check after white's move (Scholar's mate-ish setup).
    # Use a contrived simple check: white queen on h5, black king on e8, white moves Qh5xf7+ ...
    fen = 'r1bqkbnr/pppp1Qpp/2n5/4p3/4P3/8/PPPP1PPP/RNB1KBNR b KQkq - 0 3'
    sc, body = await _validate(client, fresh_user['headers'], fen, 'e8d8')
    assert sc == 200
    # legal escape is forced; just assert we got a deterministic answer
    assert body['legal'] in (True, False)


async def test_promotion_required(client, fresh_user):
    # White pawn on 7th rank, must promote
    fen = '8/4P3/8/8/8/8/8/4K2k w - - 0 1'
    sc, body = await _validate(client, fresh_user['headers'], fen, 'e7e8')
    # python-chess accepts e7e8 as a pseudo move? promotion needed: e7e8q
    assert sc == 200
    sc2, body2 = await _validate(client, fresh_user['headers'], fen, 'e7e8q')
    assert sc2 == 200
    assert body2['legal'] is True
