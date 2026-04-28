import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../src/api';
import { useAuth } from '../src/auth';
import { colors, radii, spacing } from '../src/theme';
import Button from '../src/components/Button';

export default function TournamentDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const r = await api.tournamentDetail(id);
      setData(r);
    } catch {}
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const join = async () => {
    if (!id) return;
    setBusy(true);
    try { await api.tournamentJoin(id); await load(); } catch {} finally { setBusy(false); }
  };
  const leave = async () => {
    if (!id) return;
    setBusy(true);
    try { await api.tournamentLeave(id); await load(); } catch {} finally { setBusy(false); }
  };
  const playNow = () => {
    if (!data?.tournament) return;
    // Route to online matchmaking with the tournament's rule
    router.push({ pathname: '/online', params: { rule: data.tournament.rule_key, tournament_id: id } });
  };

  if (!data) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ActivityIndicator color={colors.accent} style={{ marginTop: 80 }} />
      </SafeAreaView>
    );
  }

  const t = data.tournament;
  const board = data.leaderboard || [];

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="tournament-back">
          <Text style={styles.iconBtnText}>‹</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>{t.status.toUpperCase()} · {t.type.replace('_', ' ').toUpperCase()}</Text>
          <Text style={styles.title} numberOfLines={1}>{t.name}</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
        <View style={styles.heroCard}>
          <Text style={styles.heroDesc}>{t.description}</Text>
          <View style={styles.statRow}>
            <Stat label="PRIZE" value={`🟡 ${t.prize_coins}`} />
            <Stat label="PLAYERS" value={`${t.players}`} />
            <Stat label="RULE" value={t.rule_key.replace('_', ' ').toUpperCase()} />
          </View>
        </View>

        <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
          {t.status === 'live' ? (
            t.joined ? (
              <>
                <Button label="Play next match" onPress={playNow} fullWidth testID="tournament-play" />
                {busy ? <ActivityIndicator color={colors.accent} /> : (
                  <Button label="Leave tournament" variant="ghost" onPress={leave} fullWidth testID="tournament-leave" />
                )}
              </>
            ) : (
              busy ? <ActivityIndicator color={colors.accent} /> : (
                <Button label="Join tournament" onPress={join} fullWidth testID="tournament-join" />
              )
            )
          ) : t.status === 'upcoming' ? (
            t.joined ? (
              <Button label="You’re in. We’ll notify you." disabled fullWidth />
            ) : busy ? <ActivityIndicator color={colors.accent} /> : (
              <Button label="Reserve a spot" onPress={join} fullWidth testID="tournament-reserve" />
            )
          ) : (
            <Button label="This tournament has ended" disabled fullWidth />
          )}
        </View>

        <View style={{ marginTop: spacing.xl }}>
          <Text style={styles.sectionTitle}>Leaderboard</Text>
          {data.my_rank ? (
            <Text style={styles.myRank}>You’re ranked #{data.my_rank}</Text>
          ) : null}
          {board.length === 0 ? (
            <Text style={styles.empty}>No matches reported yet. Be the first — join and play!</Text>
          ) : (
            <View style={{ marginTop: spacing.sm }}>
              {board.map((r: any) => (
                <View key={r.user_id} style={[styles.lbRow, r.user_id === user?.id && styles.lbRowMe]}>
                  <Text style={styles.lbRank}>#{r.rank}</Text>
                  <Text style={styles.lbName} numberOfLines={1}>{r.name} {r.is_featured ? '★' : ''}</Text>
                  <Text style={styles.lbWins}>{r.wins}W · {r.losses}L</Text>
                  <Text style={styles.lbScore}>{r.score} pts</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xl },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.md },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: radii.pill, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
  iconBtnText: { color: colors.textPrimary, fontSize: 20, fontWeight: '900' },
  eyebrow: { color: colors.textMuted, fontSize: 10, fontWeight: '900', letterSpacing: 3 },
  title: { color: colors.textPrimary, fontSize: 22, fontWeight: '900', marginTop: 2 },
  heroCard: { padding: spacing.lg, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radii.lg },
  heroDesc: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  statRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  stat: { flex: 1, backgroundColor: colors.elevated, borderColor: colors.border, borderWidth: 1, borderRadius: radii.md, padding: spacing.sm, alignItems: 'center' },
  statLabel: { color: colors.textMuted, fontSize: 10, fontWeight: '900', letterSpacing: 2 },
  statValue: { color: colors.accent, fontSize: 13, fontWeight: '900', marginTop: 4 },
  sectionTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '900' },
  myRank: { color: colors.accent, fontSize: 12, fontWeight: '800', marginTop: 4 },
  empty: { color: colors.textMuted, marginTop: spacing.sm, fontSize: 13 },
  lbRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomColor: colors.border, borderBottomWidth: 1, gap: 8 },
  lbRowMe: { backgroundColor: 'rgba(234,179,8,0.05)', borderRadius: radii.sm, paddingHorizontal: 8 },
  lbRank: { color: colors.accent, width: 36, fontWeight: '900' },
  lbName: { flex: 1, color: colors.textPrimary, fontWeight: '700' },
  lbWins: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
  lbScore: { color: colors.textPrimary, fontWeight: '900', width: 60, textAlign: 'right' },
});
