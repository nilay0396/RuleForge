import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl, ActivityIndicator } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../../src/api';
import { colors, radii, spacing } from '../../src/theme';

type Tournament = {
  id: string;
  name: string;
  description?: string;
  status: 'upcoming' | 'live' | 'finished';
  start_time: string;
  end_time: string;
  prize_coins: number;
  rule_key: string;
  players: number;
  joined: boolean;
};

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  const now = Date.now();
  const diff = t - now;
  const min = Math.round(diff / 60000);
  if (Math.abs(min) < 1) return 'now';
  if (min < 0) {
    const m = -min;
    if (m < 60) return `${m}m ago`;
    return `${Math.round(m / 60)}h ago`;
  }
  if (min < 60) return `in ${min}m`;
  const h = Math.round(min / 60);
  if (h < 24) return `in ${h}h`;
  return `in ${Math.round(h / 24)}d`;
}

export default function Tournaments() {
  const router = useRouter();
  const [rows, setRows] = useState<Tournament[]>([]);
  const [scope, setScope] = useState<'all' | 'live' | 'upcoming' | 'finished'>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const r = await api.tournaments(scope);
      setRows(r.tournaments || []);
    } catch {}
    setLoading(false);
  }, [scope]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const live = rows.filter((r) => r.status === 'live');
  const upcoming = rows.filter((r) => r.status === 'upcoming');
  const finished = rows.filter((r) => r.status === 'finished');

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
        <View style={styles.header}>
          <Text style={styles.eyebrow}>TOURNAMENTS</Text>
          <Text style={styles.title}>Compete on stage</Text>
          <Text style={styles.subtitle}>Win matches to climb live leaderboards. Top 3 take coin prizes.</Text>
        </View>

        <View style={styles.tabsRow}>
          {(['all', 'live', 'upcoming', 'finished'] as const).map((s) => (
            <Pressable
              key={s}
              onPress={() => setScope(s)}
              style={[styles.tab, scope === s && styles.tabActive]}
              testID={`tourney-tab-${s}`}
            >
              <Text style={[styles.tabText, scope === s && styles.tabTextActive]}>{s.toUpperCase()}</Text>
            </Pressable>
          ))}
        </View>

        {loading ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xl }} />
        ) : (
          <View style={{ marginTop: spacing.lg, gap: spacing.lg }}>
            {live.length > 0 ? (
              <Section title="Live now" rows={live} router={router} accent={colors.danger} />
            ) : null}
            {upcoming.length > 0 ? (
              <Section title="Upcoming" rows={upcoming} router={router} accent={colors.accent} />
            ) : null}
            {finished.length > 0 ? (
              <Section title="Finished" rows={finished} router={router} accent={colors.textMuted} />
            ) : null}
            {rows.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>No tournaments in this scope</Text>
                <Text style={styles.emptySub}>Pull down to refresh, or check back later for new arenas.</Text>
              </View>
            ) : null}
          </View>
        )}
        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, rows, router, accent }: { title: string; rows: Tournament[]; router: any; accent: string }) {
  return (
    <View>
      <Text style={[styles.sectionTitle, { color: accent }]}>{title.toUpperCase()}</Text>
      <View style={{ gap: spacing.md, marginTop: spacing.sm }}>
        {rows.map((t) => (
          <Pressable
            key={t.id}
            onPress={() => router.push({ pathname: '/tournament', params: { id: t.id } })}
            style={[
              styles.card,
              t.status === 'live' && { borderColor: colors.danger },
              t.status === 'finished' && { opacity: 0.7 },
            ]}
            testID={`tourney-${t.id}`}
          >
            <View style={styles.cardHead}>
              <Text style={styles.cardName} numberOfLines={1}>{t.name}</Text>
              {t.status === 'live' ? (
                <View style={styles.liveBadge}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveBadgeText}>LIVE</Text>
                </View>
              ) : (
                <Text style={styles.cardWhen}>{relativeTime(t.status === 'finished' ? t.end_time : t.start_time)}</Text>
              )}
            </View>
            {t.description ? <Text style={styles.cardDesc} numberOfLines={2}>{t.description}</Text> : null}
            <View style={styles.cardFoot}>
              <Text style={styles.metaPill}>{t.rule_key.replace('_', ' ').toUpperCase()}</Text>
              <Text style={styles.metaPill}>🟡 {t.prize_coins}</Text>
              <Text style={styles.metaPill}>· {t.players} players</Text>
              {t.joined ? <Text style={[styles.metaPill, { color: colors.success }]}>JOINED</Text> : null}
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.xl, paddingBottom: spacing.xxl * 2 },
  header: { },
  eyebrow: { color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 4 },
  title: { color: colors.textPrimary, fontSize: 24, fontWeight: '900', marginTop: 2 },
  subtitle: { color: colors.textSecondary, marginTop: 6, fontSize: 13, lineHeight: 19 },
  tabsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl, flexWrap: 'wrap' },
  tab: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radii.pill, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
  tabActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  tabText: { color: colors.textSecondary, fontWeight: '900', fontSize: 11, letterSpacing: 1.4 },
  tabTextActive: { color: '#0A0A0B' },
  sectionTitle: { fontSize: 12, fontWeight: '900', letterSpacing: 2.5 },
  card: { padding: spacing.lg, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radii.lg },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cardName: { flex: 1, color: colors.textPrimary, fontSize: 16, fontWeight: '900' },
  cardWhen: { color: colors.textMuted, fontSize: 11, fontWeight: '800' },
  cardDesc: { color: colors.textSecondary, fontSize: 12, marginTop: 6, lineHeight: 18 },
  cardFoot: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  metaPill: { color: colors.textSecondary, fontSize: 11, fontWeight: '800' },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(239,68,68,0.1)', borderColor: colors.danger, borderWidth: 1, borderRadius: radii.pill, paddingHorizontal: 8, paddingVertical: 2 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.danger },
  liveBadgeText: { color: colors.danger, fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  emptyCard: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radii.lg, padding: spacing.xl, alignItems: 'center' },
  emptyTitle: { color: colors.textPrimary, fontWeight: '900' },
  emptySub: { color: colors.textSecondary, marginTop: 6, textAlign: 'center', fontSize: 12 },
});
