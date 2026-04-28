import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, Dimensions, ScrollView, Modal, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Chess } from 'chess.js';
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
  const [connectionState, setConnectionState] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [gameOver, setGameOver] = useState<{ result: 'win' | 'loss' | 'draw'; reason: string; delta?: number; before?: number; after?: number } | null>(null);
  const [confirmResign, setConfirmResign] = useState(false);

  // Use RuleChess for board rendering (classic only)
  const rcRef = useRef(new RuleChess('classic'));
  const [tick, setTick] = useState(0);
  const [selected, setSelected] = useState<SquareName | null>(null);
  const [legalTargets, setLegalTargets] = useState<LegalTarget[]>([]);

  // Refresh the engine from a server-authoritative FEN
  const setFromFen = (fen: string, movesSan: string[]) => {
    const fresh = new RuleChess('classic');
    // Replace internal board state via FEN load
    (fresh as any).rawGame = () => null; // placeholder
    try {
      const c = new Chess(fen);
      // Use chess.js board state directly inside RuleChess by rebuilding through FEN
      (fresh as any).game = c;
    } catch {}
    // Sync history SAN list
    (fresh as any).history = movesSan.map((s) => ({ san: s, fenBefore: '', fenAfter: '', flagsBefore: (fresh as any).flags }));
    rcRef.current = fresh;
    setTick((t) => t + 1);
  };

  useEffect(() => {
    realtime.connect();
    const off = realtime.on((m) => {
      if (m.type === '__connected') setConnectionState('connected');
      if (m.type === '__disconnected') setConnectionState('disconnected');
      if (m.type === 'match_found') {
        setGameId(m.game_id);
        setMyColor(m.your_color);
        const opp = m.your_color === 'w' ? m.black : m.white;
        setOpponent(opp);
        setFromFen(m.fen, []);
      }
      if (m.type === 'game_state' && (!gameId || m.game?.id === gameId)) {
        setGameId(m.game.id);
        setMyColor(m.your_color);
        const opp = m.your_color === 'w'
          ? { id: m.game.black_id, name: '', elo: m.game.black_rating }
          : { id: m.game.white_id, name: '', elo: m.game.white_rating };
        setOpponent(opp);
        setFromFen(m.game.fen, m.game.moves_san || []);
      }
      if (m.type === 'move' && m.game_id === gameId) {
        const wasCapture = !!rcRef.current.pieceAt(m.to as SquareName);
        setFromFen(m.fen, m.moves_san);
        if (m.is_check) playSound('check');
        else if (wasCapture) playSound('capture');
        else playSound('move');
        setSelected(null);
        setLegalTargets([]);
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
        refresh();
      }
      if (m.type === 'error') {
        // transient error display (optional)
      }
    });

    // If we entered with a game_id but no state yet, ask for it
    if (gameId) {
      const sendOnce = () => realtime.send({ type: 'request_game_state', game_id: gameId });
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
  const myTurn = !!myColor && turn === myColor && !gameOver;

  const onSquarePress = (sq: SquareName) => {
    if (!myTurn || !gameId) return;
    if (selected) {
      const target = legalTargets.find((t) => t.to === sq);
      if (target) {
        // Promotion auto-queen for now
        realtime.send({
          type: 'make_move',
          game_id: gameId,
          from: selected,
          to: sq,
          promotion: target.promotion || 'q',
        });
        setSelected(null);
        setLegalTargets([]);
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
      />

      <View style={styles.boardWrap}>
        <Chessboard
          rc={rcRef.current}
          orientation={myColor === 'b' ? 'b' : 'w'}
          selected={selected}
          targets={legalTargets}
          disabled={!myTurn}
          size={boardSize}
          onSquarePress={onSquarePress}
        />
      </View>

      <PlayerStrip
        name={user?.name || 'You'}
        sub={`You · ${user?.elo ?? 800} ELO${myTurn ? ' · your move' : ''}`}
        active={myTurn}
        captures=""
      />

      <View style={styles.actionBar}>
        <Pressable
          onPress={() => setConfirmResign(true)}
          disabled={!gameId || !!gameOver}
          style={[styles.actionBtn, (!gameId || !!gameOver) && { opacity: 0.4 }]}
          testID="online-resign"
        >
          <Text style={[styles.actionText, { color: colors.danger }]}>Resign</Text>
        </Pressable>
      </View>

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
              if (gameId) realtime.send({ type: 'resign', game_id: gameId });
            }} fullWidth />
            <View style={{ height: spacing.sm }} />
            <Button label="Keep playing" variant="secondary" testID="confirm-resign-no" onPress={() => setConfirmResign(false)} fullWidth />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function PlayerStrip({ name, sub, active, captures }: { name: string; sub: string; active: boolean; captures: string }) {
  return (
    <View style={[styles.player, active && { borderColor: colors.accent }]}>
      <View style={[styles.playerDot, { backgroundColor: active ? colors.accent : colors.border }]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.playerName}>{name}</Text>
        <Text style={styles.playerSub}>{sub}{captures ? `   ·   ${captures}` : ''}</Text>
      </View>
    </View>
  );
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
  boardWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.sm },
  actionBar: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  actionBtn: { paddingHorizontal: spacing.lg, paddingVertical: 8, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.danger, backgroundColor: colors.surface },
  actionText: { fontWeight: '700', fontSize: 13 },
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
});
