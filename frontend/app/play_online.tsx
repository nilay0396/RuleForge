import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, Dimensions, ScrollView, Modal, Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../src/auth';
import { realtime } from '../src/ws';
import { colors, radii, spacing } from '../src/theme';
import Chessboard from '../src/components/Chessboard';
import { RuleChess, SquareName, LegalTarget } from '../src/engine';
import { playSound } from '../src/sound';
import Button from '../src/components/Button';

export default function PlayOnline() {
  const params = useLocalSearchParams<{ game_id?: string }>();
  const router = useRouter();
  const { user, refresh } = useAuth();

  const [gameId, setGameId] = useState<string | null>((params.game_id as string) || null);
  const [myColor, setMyColor] = useState<'w' | 'b' | null>(null);
  const [opponent, setOpponent] = useState<{ id: string; name: string; elo: number } | null>(null);
  const [opponentDisconnected, setOpponentDisconnected] = useState(false);
  const [connectionState, setConnectionState] = useState<'connecting' | 'connected' | 'disconnected'>(
    realtime.connected ? 'connected' : 'connecting',
  );
  const [gameOver, setGameOver] = useState<{ result: 'win' | 'loss' | 'draw'; reason: string; delta?: number; before?: number; after?: number } | null>(null);
  const [confirmResign, setConfirmResign] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [clocks, setClocks] = useState<{ w: number; b: number } | null>(null);
  const [drawOfferBy, setDrawOfferBy] = useState<'w' | 'b' | null>(null);

  // Use RuleChess for board rendering (classic only)
  const rcRef = useRef(new RuleChess('classic'));
  const [tick, setTick] = useState(0);
  const [selected, setSelected] = useState<SquareName | null>(null);
  const [legalTargets, setLegalTargets] = useState<LegalTarget[]>([]);
  const [pendingPromotion, setPendingPromotion] = useState<{ from: SquareName; to: SquareName } | null>(null);

  // Refresh the engine from a server-authoritative FEN
  const setFromFen = (fen: string, movesSan: string[]) => {
    const fresh = new RuleChess('classic');
    if (!fresh.loadFen(fen, movesSan)) {
      setActionError('Could not load server board state.');
    }
    rcRef.current = fresh;
    setTick((t) => t + 1);
  };

  const applyServerExtras = (payload: any) => {
    const nextClocks = extractClocks(payload);
    if (nextClocks) setClocks(nextClocks);
    const offerBy = extractDrawOfferBy(payload);
    if (offerBy !== undefined) setDrawOfferBy(offerBy);
  };

  useEffect(() => {
    realtime.connect();
    const requestCurrentState = () => {
      if (!gameId) return;
      const sent = realtime.send({ type: 'request_game_state', game_id: gameId });
      if (!sent.ok) setActionError('Waiting for realtime connection to restore game state.');
    };
    const off = realtime.on((m) => {
      if (m.type === '__connected') {
        setConnectionState('connected');
        setActionError(null);
        requestCurrentState();
      }
      if (m.type === '__disconnected') {
        setConnectionState('disconnected');
        setActionError('Realtime connection lost. Reconnecting...');
      }
      if (m.type === '__socket_error') setActionError('Realtime connection error. Reconnecting...');
      if (m.type === 'match_found') {
        setActionError(null);
        setClocks(null);
        setDrawOfferBy(null);
        setGameId(m.game_id);
        setMyColor(m.your_color);
        const opp = m.your_color === 'w' ? m.black : m.white;
        setOpponent(opp);
        setFromFen(m.fen, []);
        applyServerExtras(m);
      }
      if (m.type === 'game_state' && (!gameId || m.game?.id === gameId)) {
        setActionError(null);
        setClocks(extractClocks(m.game));
        setDrawOfferBy(extractDrawOfferBy(m.game) ?? null);
        setGameId(m.game.id);
        setMyColor(m.your_color);
        const opp = m.your_color === 'w'
          ? { id: m.game.black_id, name: '', elo: m.game.black_rating }
          : { id: m.game.white_id, name: '', elo: m.game.white_rating };
        setOpponent(opp);
        setFromFen(m.game.fen, m.game.moves_san || []);
        applyServerExtras(m.game);
      }
      if (m.type === 'move' && m.game_id === gameId) {
        setActionError(null);
        applyServerExtras(m);
        setDrawOfferBy(null);
        const wasCapture = !!rcRef.current.pieceAt(m.to as SquareName);
        setFromFen(m.fen, m.moves_san);
        if (m.is_check) playSound('check');
        else if (wasCapture) playSound('capture');
        else playSound('move');
        setSelected(null);
        setLegalTargets([]);
        setPendingPromotion(null);
      }
      if ((m.type === 'clock' || m.type === 'clock_update') && (!m.game_id || m.game_id === gameId)) {
        applyServerExtras(m);
      }
      if ((m.type === 'draw_offer' || m.type === 'draw_offered') && m.game_id === gameId) {
        const rawBy = m.by || m.offer_by || m.by_color || m.from_color || m.color;
        let by = normalizeColor(rawBy);
        if (!by && rawBy && rawBy === user?.id) by = myColor;
        if (!by && rawBy && rawBy === opponent?.id && myColor) by = myColor === 'w' ? 'b' : 'w';
        if (by) setDrawOfferBy(by);
      }
      if ((m.type === 'draw_declined' || m.type === 'draw_offer_cancelled') && m.game_id === gameId) {
        setDrawOfferBy(null);
        if (m.type === 'draw_declined') setActionError('Draw offer declined.');
      }
      if (m.type === 'opponent_disconnected' && m.game_id === gameId) setOpponentDisconnected(true);
      if (m.type === 'opponent_reconnected' && m.game_id === gameId) setOpponentDisconnected(false);
      if (m.type === 'game_over' && m.game_id === gameId) {
        playSound('end');
        setGameOver({
          result: m.result,
          reason: m.reason,
          delta: m.delta,
          before: m.rating_before,
          after: m.rating_after,
        });
        setDrawOfferBy(null);
        setPendingPromotion(null);
        refresh();
      }
      if (m.type === 'error') {
        setActionError(m.error || m.message || 'Realtime command failed.');
      }
    });

    // If we entered with a game_id but no state yet, ask for it
    if (gameId) {
      const sendOnce = requestCurrentState;
      sendOnce();
      const t = setInterval(sendOnce, 1500);
      const clear = () => clearInterval(t);
      const off2 = realtime.on((m) => {
        if (m.type === 'game_state' && m.game?.id === gameId) clear();
      });
      return () => { off(); off2(); clearInterval(t); };
    }

    return () => off();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  const dim = Dimensions.get('window');
  const boardSize = Math.min(dim.width - 32, 560, dim.height - 320);

  const turn = rcRef.current.turn();
  const socketReady = connectionState === 'connected';
  const myTurn = !!myColor && turn === myColor && !gameOver;
  const canSendGameCommand = socketReady && !!gameId && !gameOver;
  const incomingDrawOffer = !!myColor && !!drawOfferBy && drawOfferBy !== myColor;
  const outgoingDrawOffer = !!myColor && drawOfferBy === myColor;

  const sendMove = (from: SquareName, to: SquareName, promotion?: 'q' | 'r' | 'b' | 'n') => {
    if (!gameId) return false;
    const sent = realtime.send({
      type: 'make_move',
      game_id: gameId,
      from,
      to,
      ...(promotion ? { promotion } : {}),
    });
    if (!sent.ok) {
      setActionError('Move was not sent because realtime is disconnected.');
      return false;
    }
    setActionError(null);
    setSelected(null);
    setLegalTargets([]);
    setPendingPromotion(null);
    return true;
  };

  const onSquarePress = (sq: SquareName) => {
    if (!socketReady) {
      setActionError('Reconnect before making a move.');
      return;
    }
    if (!myTurn || !gameId || pendingPromotion) return;
    if (selected) {
      const target = legalTargets.find((t) => t.to === sq);
      if (target) {
        const piece = rcRef.current.pieceAt(selected);
        if (piece?.type === 'p' && target.type === 'normal' && (sq[1] === '8' || sq[1] === '1')) {
          setPendingPromotion({ from: selected, to: sq });
          return;
        }
        sendMove(selected, sq, target.promotion);
        return;
      }
      const piece = rcRef.current.pieceAt(sq);
      if (piece && piece.color === myColor) {
        setSelected(sq);
        setLegalTargets(rcRef.current.legalTargets(sq));
        return;
      }
      setSelected(null);
      setLegalTargets([]);
      return;
    }
    const piece = rcRef.current.pieceAt(sq);
    if (piece && piece.color === myColor) {
      setSelected(sq);
      setLegalTargets(rcRef.current.legalTargets(sq));
    }
  };

  const completePromotion = (promotion: 'q' | 'r' | 'b' | 'n') => {
    if (!pendingPromotion) return;
    sendMove(pendingPromotion.from, pendingPromotion.to, promotion);
  };

  const sendDrawCommand = (type: 'offer_draw' | 'accept_draw' | 'decline_draw') => {
    if (!gameId || !socketReady) {
      setActionError('Reconnect before using draw controls.');
      return;
    }
    const sent = realtime.send({ type, game_id: gameId });
    if (!sent.ok) {
      setActionError('Draw command was not sent because realtime is disconnected.');
      return;
    }
    setActionError(null);
    if (type === 'offer_draw') setDrawOfferBy(myColor);
    if (type === 'accept_draw' || type === 'decline_draw') setDrawOfferBy(null);
  };

  const movesPairs = useMemo(() => {
    const sans = rcRef.current.historySAN();
    const pairs: { num: number; w?: string; b?: string }[] = [];
    for (let i = 0; i < sans.length; i += 2) pairs.push({ num: i / 2 + 1, w: sans[i], b: sans[i + 1] });
    return pairs;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.replace('/home')} style={styles.iconBtn} testID="online-play-back">
          <Text style={styles.iconBtnText}>‹</Text>
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.eyebrow}>ONLINE · CLASSIC</Text>
          <Text style={styles.title}>vs {opponent?.name || 'Opponent'}</Text>
        </View>
        <View style={[styles.connDot, { backgroundColor: connectionState === 'connected' ? colors.success : colors.danger }]} />
      </View>

      <PlayerStrip
        name={opponent?.name || (gameId ? 'Loading…' : 'Waiting…')}
        sub={`${opponent?.elo ?? '?'} ELO${opponentDisconnected ? ' · disconnected' : ''}`}
        active={!myTurn && !gameOver}
        captures=""
        time={myColor === 'b' ? clocks?.w : clocks?.b}
      />

      <View style={styles.boardWrap}>
        <Chessboard
          rc={rcRef.current}
          orientation={myColor === 'b' ? 'b' : 'w'}
          selected={selected}
          targets={legalTargets}
          disabled={!myTurn || !socketReady || !!pendingPromotion}
          size={boardSize}
          onSquarePress={onSquarePress}
        />
      </View>

      <PlayerStrip
        name={user?.name || 'You'}
        sub={`You · ${user?.elo ?? 800} ELO${myTurn ? ' · your move' : ''}`}
        active={myTurn}
        captures=""
        time={myColor ? clocks?.[myColor] : undefined}
      />

      <View style={styles.actionBar}>
        <Button
          label="Offer draw"
          variant="secondary"
          onPress={() => sendDrawCommand('offer_draw')}
          disabled={!canSendGameCommand || incomingDrawOffer || outgoingDrawOffer}
          testID="online-offer-draw"
        />
        <Button
          label="Resign"
          variant="danger"
          onPress={() => setConfirmResign(true)}
          disabled={!canSendGameCommand}
          testID="online-resign"
        />
      </View>
      {incomingDrawOffer ? (
        <View style={styles.drawOfferBar} testID="online-draw-offer">
          <Text style={styles.drawOfferText}>Opponent offered a draw</Text>
          <View style={styles.drawOfferActions}>
            <Button label="Accept" onPress={() => sendDrawCommand('accept_draw')} disabled={!canSendGameCommand} testID="online-accept-draw" />
            <Button label="Decline" variant="secondary" onPress={() => sendDrawCommand('decline_draw')} disabled={!canSendGameCommand} testID="online-decline-draw" />
          </View>
        </View>
      ) : outgoingDrawOffer ? (
        <Text style={styles.inlineNotice} testID="online-draw-pending">Draw offer sent.</Text>
      ) : null}
      {actionError ? (
        <Text style={styles.inlineError} testID="online-action-error">{actionError}</Text>
      ) : null}

      <ScrollView style={styles.moveList} contentContainerStyle={{ padding: spacing.sm }} horizontal showsHorizontalScrollIndicator={false}>
        {movesPairs.length === 0 ? (
          <Text style={styles.movesEmpty}>Waiting for the first move…</Text>
        ) : movesPairs.map((p) => (
          <View key={p.num} style={styles.movePair}>
            <Text style={styles.moveNum}>{p.num}.</Text>
            {p.w ? <Text style={styles.moveSan}>{p.w}</Text> : null}
            {p.b ? <Text style={styles.moveSan}>{p.b}</Text> : null}
          </View>
        ))}
      </ScrollView>

      <Modal visible={!!gameOver} transparent animationType="fade">
        <View style={styles.modalScrim}>
          <View style={styles.modalCard}>
            <Text style={[styles.modalEyebrow, { color: gameOver?.result === 'win' ? colors.success : gameOver?.result === 'loss' ? colors.danger : colors.textSecondary }]}>
              {gameOver?.result?.toUpperCase()}
            </Text>
            <Text style={styles.modalTitle}>
              {gameOver?.result === 'win' ? 'Victory!' : gameOver?.result === 'loss' ? 'Defeat' : 'Draw'}
            </Text>
            <Text style={styles.modalBody}>{gameOver?.reason}</Text>
            {gameOver?.after !== undefined ? (
              <View style={styles.eloChangeRow} testID="online-elo-change">
                <View style={styles.eloChangeBlock}>
                  <Text style={styles.eloChangeLabel}>RATING</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                    <Text style={styles.eloChangeValue}>{gameOver.after}</Text>
                    <Text style={[styles.eloChangeDelta, { color: (gameOver.delta ?? 0) >= 0 ? colors.success : colors.danger }]}>
                      {' '}{(gameOver.delta ?? 0) >= 0 ? `+${gameOver.delta}` : gameOver.delta}
                    </Text>
                  </View>
                  <Text style={styles.eloChangeWas}>was {gameOver.before}</Text>
                </View>
              </View>
            ) : null}
            <View style={{ height: spacing.lg }} />
            <Button label="Find another match" onPress={() => router.replace('/online')} testID="online-find-again" fullWidth />
            <View style={{ height: spacing.sm }} />
            <Button label="Back to home" variant="secondary" onPress={() => router.replace('/home')} fullWidth />
          </View>
        </View>
      </Modal>

      <Modal visible={confirmResign} transparent animationType="fade">
        <View style={styles.modalScrim}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Resign?</Text>
            <Text style={styles.modalBody}>You will lose rating points.</Text>
            <View style={{ height: spacing.lg }} />
            <Button label="Yes, resign" variant="danger" testID="confirm-resign-yes" onPress={() => {
              setConfirmResign(false);
              if (!gameId) return;
              if (!socketReady) {
                setActionError('Reconnect before resigning.');
                return;
              }
              const sent = realtime.send({ type: 'resign', game_id: gameId });
              if (!sent.ok) setActionError('Resign was not sent because realtime is disconnected.');
              else setActionError(null);
            }} fullWidth />
            <View style={{ height: spacing.sm }} />
            <Button label="Keep playing" variant="secondary" testID="confirm-resign-no" onPress={() => setConfirmResign(false)} fullWidth />
          </View>
        </View>
      </Modal>

      <Modal visible={!!pendingPromotion} transparent animationType="fade">
        <View style={styles.modalScrim}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Promote pawn</Text>
            <View style={styles.promoteRow}>
              {(['q', 'r', 'b', 'n'] as const).map((p) => (
                <Pressable
                  key={p}
                  onPress={() => completePromotion(p)}
                  style={styles.promoteBtn}
                  testID={`online-promote-${p}`}
                >
                  <Text style={styles.promoteGlyph}>{{ q: '♛', r: '♜', b: '♝', n: '♞' }[p]}</Text>
                  <Text style={styles.promoteLabel}>{{ q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight' }[p]}</Text>
                </Pressable>
              ))}
            </View>
            <View style={{ height: spacing.lg }} />
            <Button
              label="Cancel"
              variant="secondary"
              onPress={() => setPendingPromotion(null)}
              testID="online-promote-cancel"
              fullWidth
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function PlayerStrip({ name, sub, active, captures, time }: { name: string; sub: string; active: boolean; captures: string; time?: number }) {
  return (
    <View style={[styles.player, active && { borderColor: colors.accent }]}>
      <View style={[styles.playerDot, { backgroundColor: active ? colors.accent : colors.border }]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.playerName}>{name}</Text>
        <Text style={styles.playerSub}>{sub}{captures ? `   ·   ${captures}` : ''}</Text>
      </View>
      {time != null ? (
        <View style={[styles.clockBox, active && { borderColor: colors.accent }]}>
          <Text style={styles.clock}>{formatTime(time)}</Text>
        </View>
      ) : null}
    </View>
  );
}

function normalizeColor(value: any): 'w' | 'b' | null {
  if (value === 'w' || value === 'white') return 'w';
  if (value === 'b' || value === 'black') return 'b';
  return null;
}

function normalizeClockValue(value: any): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const seconds = value > 86400 ? Math.ceil(value / 1000) : Math.ceil(value);
  return Math.max(0, seconds);
}

function extractClocks(payload: any): { w: number; b: number } | null {
  const source = payload?.clock_remaining_ms || payload?.clocks_ms || payload?.clocks || payload?.clock || payload?.time || payload?.remaining;
  if (!source) return null;
  const white = normalizeClockValue(source.w ?? source.white ?? source.white_seconds ?? source.white_ms);
  const black = normalizeClockValue(source.b ?? source.black ?? source.black_seconds ?? source.black_ms);
  if (white == null || black == null) return null;
  return { w: white, b: black };
}

function extractDrawOfferBy(payload: any): 'w' | 'b' | null | undefined {
  if (!payload) return undefined;
  if (payload.draw_offer_by === null || payload.drawOfferBy === null) return null;
  const raw = payload.draw_offer_by ?? payload.drawOfferBy ?? payload.draw?.by ?? payload.draw_offer?.by;
  const by = normalizeColor(raw);
  if (by) return by;
  if (raw && raw === payload.white_id) return 'w';
  if (raw && raw === payload.black_id) return 'b';
  return undefined;
}

function formatTime(seconds: number) {
  const s = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: radii.pill, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
  iconBtnText: { color: colors.textPrimary, fontSize: 20, fontWeight: '900' },
  eyebrow: { color: colors.accent, fontSize: 10, fontWeight: '900', letterSpacing: 3 },
  title: { color: colors.textPrimary, fontSize: 14, fontWeight: '700', marginTop: 2 },
  connDot: { width: 10, height: 10, borderRadius: 5 },
  player: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radii.lg, padding: spacing.md, marginHorizontal: spacing.lg, marginVertical: spacing.xs },
  playerDot: { width: 10, height: 10, borderRadius: 5 },
  playerName: { color: colors.textPrimary, fontWeight: '800' },
  playerSub: { color: colors.textMuted, fontSize: 12, marginTop: 1 },
  clockBox: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.elevated,
  },
  clock: { color: colors.textPrimary, fontWeight: '900', fontVariant: ['tabular-nums'] as any, fontSize: 16 },
  boardWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.sm },
  actionBar: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  drawOfferBar: { marginHorizontal: spacing.lg, marginTop: spacing.sm, padding: spacing.md, borderRadius: radii.md, borderWidth: 1, borderColor: colors.accent, backgroundColor: colors.accentSoft },
  drawOfferText: { color: colors.textPrimary, fontWeight: '800', marginBottom: spacing.sm },
  drawOfferActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  inlineNotice: { color: colors.textSecondary, fontSize: 12, fontWeight: '700', marginHorizontal: spacing.lg, marginTop: spacing.xs },
  inlineError: { color: colors.danger, fontSize: 12, fontWeight: '700', marginHorizontal: spacing.lg, marginTop: spacing.xs },
  moveList: { maxHeight: 56, marginTop: spacing.sm, marginHorizontal: spacing.lg, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radii.md },
  movesEmpty: { color: colors.textMuted, padding: spacing.sm, fontStyle: 'italic' },
  movePair: { flexDirection: 'row', gap: 6, marginRight: spacing.md, alignItems: 'baseline' },
  moveNum: { color: colors.textMuted, fontSize: 12 },
  moveSan: { color: colors.textPrimary, fontSize: 13, fontWeight: '700' },
  modalScrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  modalCard: { width: '100%', maxWidth: 420, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radii.xl, padding: spacing.xl },
  modalEyebrow: { fontSize: 11, fontWeight: '900', letterSpacing: 4 },
  modalTitle: { color: colors.textPrimary, fontSize: 24, fontWeight: '900', marginTop: spacing.xs },
  modalBody: { color: colors.textSecondary, marginTop: spacing.sm, lineHeight: 22 },
  eloChangeRow: { marginTop: spacing.lg, flexDirection: 'row', gap: spacing.md },
  eloChangeBlock: { flex: 1, backgroundColor: colors.elevated, borderColor: colors.border, borderWidth: 1, borderRadius: radii.md, padding: spacing.md },
  eloChangeLabel: { color: colors.textMuted, fontSize: 10, fontWeight: '900', letterSpacing: 2 },
  eloChangeValue: { color: colors.textPrimary, fontSize: 28, fontWeight: '900', marginTop: 4 },
  eloChangeDelta: { fontSize: 16, fontWeight: '900' },
  eloChangeWas: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  promoteRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.lg, justifyContent: 'center' },
  promoteBtn: {
    width: 76,
    height: 88,
    borderRadius: radii.md,
    backgroundColor: colors.elevated,
    borderColor: colors.border,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  promoteGlyph: { fontSize: 34, color: colors.textPrimary, fontFamily: Platform.select({ ios: 'Times New Roman', android: 'serif', default: 'serif' }) },
  promoteLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '700', marginTop: 2 },
});
