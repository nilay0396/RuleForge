import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../src/auth';
import { api } from '../../src/api';
import { colors, radii, spacing } from '../../src/theme';
import Button from '../../src/components/Button';

const BADGE_LABELS: Record<string, { name: string; emoji: string; color: string }> = {
  founder: { name: 'Founder', emoji: '★', color: '#EAB308' },
  first_win: { name: 'First Win', emoji: '♛', color: '#10B981' },
  ten_wins: { name: '10 Wins', emoji: '⚔', color: '#06B6D4' },
  rule_breaker: { name: 'Rule Breaker', emoji: '⚡', color: '#EF4444' },
  streak_3: { name: '3-Day Streak', emoji: '🔥', color: '#F97316' },
  streak_7: { name: '7-Day Streak', emoji: '☀', color: '#EAB308' },
};

export default function Profile() {
  const { user, signOut, refresh } = useAuth();
  const router = useRouter();
  const [matches, setMatches] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, h] = await Promise.all([api.myMatches(), api.ratingHistory()]);
      setMatches(m.matches);
      setHistory(h.history);
      await refresh();
    } catch {}
    setLoading(false);
  }, [refresh]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const totalGames = (user?.wins ?? 0) + (user?.losses ?? 0) + (user?.draws ?? 0);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <View style={styles.avatar} testID="profile-avatar">
            <Text style={styles.avatarText}>{(user?.name || 'P').slice(0, 1).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name} testID="profile-name">{user?.name || 'Player'}</Text>
            <Text style={styles.handle}>
              {user?.is_guest ? 'Guest account' : user?.email}
              {user?.role === 'admin' ? ' · admin' : ''}
            </Text>
          </View>
        </View>

        <View style={styles.statsCard}>
          <Stat value={user?.elo ?? 800} label="ELO" testID="profile-elo" />
          <Divider />
          <Stat value={user?.xp ?? 0} label="XP" testID="profile-xp" />
          <Divider />
          <Stat value={user?.coins ?? 0} label="COINS" testID="profile-coins" />
          <Divider />
          <Stat value={user?.streak ?? 0} label="STREAK" testID="profile-streak" />
        </View>

        <View style={styles.row3}>
          <RecordBlock value={user?.wins ?? 0} label="Wins" color={colors.success} />
          <RecordBlock value={user?.draws ?? 0} label="Draws" color={colors.textSecondary} />
          <RecordBlock value={user?.losses ?? 0} label="Losses" color={colors.danger} />
        </View>

        <Section title="Badges">
          <View style={styles.badgeRow}>
            {(user?.badges?.length ?? 0) === 0 ? (
              <Text style={styles.empty}>Win games and complete daily challenges to earn badges.</Text>
            ) : (
              user!.badges.map((b) => {
                const info = BADGE_LABELS[b] || { name: b, emoji: '♟', color: colors.textSecondary };
                return (
                  <View key={b} style={[styles.badge, { borderColor: info.color }]} testID={`badge-${b}`}>
                    <Text style={[styles.badgeEmoji, { color: info.color }]}>{info.emoji}</Text>
                    <Text style={styles.badgeName}>{info.name}</Text>
                  </View>
                );
              })
            )}
          </View>
        </Section>

        <Section title="Rating Trend" subtitle={history.length > 0 ? `Last ${Math.min(history.length, 8)} games` : 'Play to start your trend'}>
          {history.length === 0 ? (
            <Text style={styles.empty}>Your rating history will appear here.</Text>
          ) : (
            <View style={styles.trendRow} testID="rating-trend">
              {history.slice(0, 8).reverse().map((h, i) => (
                <View key={h.id || i} style={styles.trendCell}>
                  <Text
                    style={[
                      styles.trendDelta,
                      { color: h.delta >= 0 ? colors.success : colors.danger },
                    ]}
                  >
                    {h.delta >= 0 ? `+${h.delta}` : h.delta}
                  </Text>
                  <Text style={styles.trendAfter}>{h.rating_after}</Text>
                </View>
              ))}
            </View>
          )}
        </Section>

        <Section title="Match History" subtitle={`${totalGames} games played`}>
          {loading ? (
            <ActivityIndicator color={colors.accent} />
          ) : matches.length === 0 ? (
            <Text style={styles.empty}>No matches yet. Play one!</Text>
          ) : (
            matches.slice(0, 12).map((m) => (
              <View key={m.id} style={styles.matchRow} testID={`match-${m.id}`}>
                <Text style={[styles.matchResult, { color: resultColor(m.result) }]}>
                  {m.result.toUpperCase()}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.matchMode}>
                    {(m.rule_key || m.mode).replace('_', ' ').toUpperCase()}
                    {m.ai_level ? ` · BOT L${m.ai_level}` : ''}
                  </Text>
                  <Text style={styles.matchMeta}>
                    {new Date(m.created_at).toLocaleString()} · {m.moves_san?.length || 0} moves
                  </Text>
                </View>
                <Text
                  style={[styles.matchDelta, { color: m.elo_delta >= 0 ? colors.success : colors.danger }]}
                >
                  {m.elo_delta >= 0 ? `+${m.elo_delta}` : m.elo_delta}
                </Text>
              </View>
            ))
          )}
        </Section>

        <View style={{ height: spacing.xl }} />
        <Pressable onPress={() => router.push('/leaderboard')} style={styles.linkBtn} testID="profile-leaderboard">
          <Text style={styles.linkText}>View global leaderboard ›</Text>
        </Pressable>
        {user?.is_guest ? (
          <View style={{ marginTop: spacing.md }}>
            <Button
              label="Save my progress (create account)"
              testID="profile-upgrade-guest"
              onPress={() => router.push('/register')}
              fullWidth
            />
          </View>
        ) : null}
        <View style={{ marginTop: spacing.md }}>
          <Button
            label="Sign out"
            variant="danger"
            testID="profile-signout"
            onPress={async () => {
              await signOut();
              router.replace('/onboarding');
            }}
            fullWidth
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function resultColor(r: string) {
  if (r === 'win') return colors.success;
  if (r === 'loss') return colors.danger;
  return colors.textSecondary;
}

function Stat({ value, label, testID }: { value: number; label: string; testID?: string }) {
  return (
    <View style={statStyles.stat}>
      <Text style={statStyles.value} testID={testID}>{value}</Text>
      <Text style={statStyles.label}>{label}</Text>
    </View>
  );
}
function Divider() {
  return <View style={statStyles.divider} />;
}
function RecordBlock({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <View style={recordStyles.block}>
      <Text style={[recordStyles.value, { color }]}>{value}</Text>
      <Text style={recordStyles.label}>{label}</Text>
    </View>
  );
}
function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: spacing.xl }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle ? <Text style={styles.sectionSub}>{subtitle}</Text> : null}
      <View style={{ marginTop: spacing.md, gap: spacing.sm }}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.xl, paddingBottom: spacing.xxl },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  avatar: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: colors.elevated, borderWidth: 2, borderColor: colors.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: colors.accent, fontSize: 24, fontWeight: '900' },
  name: { color: colors.textPrimary, fontSize: 22, fontWeight: '900' },
  handle: { color: colors.textMuted, marginTop: 2 },
  statsCard: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderColor: colors.border, borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginTop: spacing.xl,
    alignItems: 'center',
  },
  row3: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  sectionTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: '900' },
  sectionSub: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 6, paddingHorizontal: 10,
    borderWidth: 1, borderRadius: radii.pill,
    backgroundColor: colors.surface,
  },
  badgeEmoji: { fontSize: 14, fontWeight: '900' },
  badgeName: { color: colors.textPrimary, fontSize: 12, fontWeight: '700' },
  empty: { color: colors.textMuted, fontStyle: 'italic' },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderColor: colors.border, borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  matchResult: { fontWeight: '900', fontSize: 12, letterSpacing: 1, width: 56 },
  matchMode: { color: colors.textPrimary, fontWeight: '700' },
  matchMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  matchDelta: { fontWeight: '900' },
  linkBtn: { paddingVertical: spacing.md },
  linkText: { color: colors.textPrimary, fontWeight: '700' },
  trendRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  trendCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  trendDelta: { fontSize: 12, fontWeight: '900' },
  trendAfter: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
});

const statStyles = StyleSheet.create({
  stat: { flex: 1, alignItems: 'center' },
  value: { color: colors.textPrimary, fontSize: 18, fontWeight: '900' },
  label: { color: colors.textMuted, fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginTop: 2 },
  divider: { width: 1, height: 28, backgroundColor: colors.border },
});

const recordStyles = StyleSheet.create({
  block: {
    flex: 1,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
    alignItems: 'center',
  },
  value: { fontSize: 22, fontWeight: '900' },
  label: { color: colors.textMuted, fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginTop: 2 },
});
