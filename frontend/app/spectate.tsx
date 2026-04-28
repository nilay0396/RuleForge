import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Dimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../src/api';
import { colors, radii, spacing } from '../src/theme';
import Chessboard from '../src/components/Chessboard';
import { RuleChess, type RuleKey } from '../src/engine';

const BACKEND = process.env.EXPO_PUBLIC_BACKEND_URL || '';

export default function Spectate() {
  const router = useRouter();
  const { game_id } = useLocalSearchParams<{ game_id: string }>();
  const [meta, setMeta] = useState<any>(null);
  const [fen, setFen] = useState<string>('');
  const [moves, setMoves] = useState<string[]>([]);
  const [spectators, setSpectators] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!game_id) return;
    let stopped = false;
    (async () => {
      try {
        const r = await api.liveGameDetail(game_id);
        if (stopped) return;
        setMeta(r);
        setFen(r.fen || '');
        setMoves(r.moves_san || []);
        setSpectators(r.spectators || 0);
      } catch (e: any) {
        setError(e?.message || 'Game not found');
      }
    })();

    try {
      const wsUrl = BACKEND.replace(/^http/, 'ws') + `/api/live/spectate/${encodeURIComponent(game_id)}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data as string);
          if (msg.type === 'snapshot') {
            setFen(msg.fen);
            setMoves(msg.moves || []);
          } else if (msg.fen) {
            setFen(msg.fen);
          }
        } catch {}
      };
    } catch {}

    const t = setInterval(async () => {
      if (stopped) return;
      try {
        const r = await api.liveGameDetail(game_id);
        setFen(r.fen);
        setMoves(r.moves_san || []);
        setSpectators(r.spectators || 0);
      } catch {}
    }, 4000);

    return () => { stopped = true; clearInterval(t); try { wsRef.current?.close(); } catch {} };
  }, [game_id]);

  const rc = useMemo(() => {
    try {
      const ruleKey = (meta?.rule_key as RuleKey) || 'classic';
      return new RuleChess(ruleKey, fen || undefined);
    } catch {
      return new RuleChess('classic');
    }
  }, [meta?.rule_key, fen]);

  const screenW = Dimensions.get('window').width;
  const boardSize = Math.min(screenW - spacing.md * 2, 380);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn}><Text style={styles.iconBtnText}>‹</Text></Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>SPECTATING · {spectators} watching</Text>
          <Text style={styles.title}>Live game</Text>
        </View>
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorTitle}>Game ended</Text>
          <Text style={styles.errorSub}>{error}</Text>
          <Pressable onPress={() => router.back()} style={styles.errorBtn}>
            <Text style={styles.errorBtnText}>Back to Watch</Text>
          </Pressable>
        </View>
      ) : !meta ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 60 }} />
      ) : (
        <View style={{ padding: spacing.md, gap: spacing.md }}>
          <View style={styles.playerCard}>
            <View style={[styles.dot, styles.dotBlack]} />
            <Text style={styles.playerName}>{meta.black?.name || '?'}</Text>
            <Text style={styles.playerElo}>{meta.black?.elo || 800}</Text>
          </View>
          <View style={{ alignItems: 'center' }}>
            <Chessboard
              rc={rc}
              size={boardSize}
              disabled
              onSquarePress={() => {}}
            />
          </View>
          <View style={styles.playerCard}>
            <View style={[styles.dot, styles.dotWhite]} />
            <Text style={styles.playerName}>{meta.white?.name || '?'}</Text>
            <Text style={styles.playerElo}>{meta.white?.elo || 800}</Text>
          </View>

          <View style={styles.movesCard}>
            <Text style={styles.movesTitle}>Moves · {moves.length}</Text>
            <Text style={styles.movesText} numberOfLines={4}>{moves.join('  ') || 'Game just started.'}</Text>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.md },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: radii.pill, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
  iconBtnText: { color: colors.textPrimary, fontSize: 20, fontWeight: '900' },
  eyebrow: { color: colors.danger, fontSize: 10, fontWeight: '900', letterSpacing: 3 },
  title: { color: colors.textPrimary, fontSize: 22, fontWeight: '900', marginTop: 2 },
  playerCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radii.md },
  dot: { width: 12, height: 12, borderRadius: 6, borderWidth: 1, borderColor: colors.border },
  dotWhite: { backgroundColor: '#F4F4F5' },
  dotBlack: { backgroundColor: '#0A0A0B' },
  playerName: { flex: 1, color: colors.textPrimary, fontWeight: '900' },
  playerElo: { color: colors.textMuted, fontWeight: '700' },
  movesCard: { padding: spacing.md, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radii.md },
  movesTitle: { color: colors.textPrimary, fontWeight: '900' },
  movesText: { color: colors.textSecondary, marginTop: 6, lineHeight: 19 },
  errorBox: { margin: spacing.xl, padding: spacing.xl, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radii.lg, alignItems: 'center' },
  errorTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '900' },
  errorSub: { color: colors.textSecondary, marginTop: 6, textAlign: 'center', fontSize: 13 },
  errorBtn: { marginTop: spacing.lg, paddingHorizontal: 16, paddingVertical: 10, borderRadius: radii.pill, backgroundColor: colors.accent },
  errorBtnText: { color: '#0A0A0B', fontWeight: '900' },
});
