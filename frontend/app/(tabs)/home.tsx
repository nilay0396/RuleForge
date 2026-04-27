import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../src/auth';
import { api } from '../../src/api';
import { colors, radii, ruleColors, spacing } from '../../src/theme';

export default function Home() {
  const { user, refresh } = useAuth();
  const router = useRouter();
  const [rules, setRules] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.rules();
      setRules(r.rules);
    } catch (e) {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      refresh();
    }, [load, refresh]),
  );

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([load(), refresh()]);
    setRefreshing(false);
  };

  const ruleByKey: Record<string, any> = {};
  rules.forEach((r) => (ruleByKey[r.key] = r));

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }
      >
        {/* Top bar */}
        <View style={styles.topbar}>
          <View>
            <Text style={styles.eyebrow}>WELCOME</Text>
            <Text style={styles.hello} testID="home-hello">
              {user?.name || 'Player'}
            </Text>
          </View>
          <View style={styles.statsRow}>
            <Stat label="ELO" value={user?.elo ?? 1000} testID="home-elo" />
            <Stat label="XP" value={user?.xp ?? 0} testID="home-xp" />
            <Stat label="COINS" value={user?.coins ?? 0} testID="home-coins" />
          </View>
        </View>

        {/* Hero */}
        <Pressable
          testID="home-quickplay"
          onPress={() =>
            router.push({ pathname: '/play', params: { rule: 'classic', ai: '2' } })
          }
          style={styles.hero}
        >
          <View style={styles.heroLeft}>
            <Text style={styles.heroEyebrow}>QUICK PLAY</Text>
            <Text style={styles.heroTitle}>Play{'\n'}Classic Chess</Text>
            <Text style={styles.heroSub}>vs RuleForge AI · Silver level</Text>
          </View>
          <View style={styles.heroBoardSet}>
            <Text style={styles.heroPiece}>♜</Text>
            <Text style={styles.heroPiece}>♞</Text>
            <Text style={styles.heroPiece}>♝</Text>
            <Text style={[styles.heroPiece, { color: colors.accent }]}>♛</Text>
            <Text style={[styles.heroPiece, { color: colors.accent }]}>♚</Text>
          </View>
        </Pressable>

        <Section title="Rule Variants" subtitle="Classic chess, with a delightful twist.">
          {rules
            .filter((r) => r.key !== 'classic')
            .map((rule) => (
              <RuleCard
                key={rule.key}
                rule={rule}
                onPlay={() =>
                  router.push({ pathname: '/play', params: { rule: rule.key, ai: '2' } })
                }
                onLearn={() =>
                  router.push({ pathname: '/rule', params: { key: rule.key } })
                }
              />
            ))}
        </Section>

        <Section title="More" subtitle="Daily challenges, leaderboard and learn.">
          <Pressable
            testID="home-daily-card"
            onPress={() => router.push('/daily')}
            style={[styles.smallCard]}
          >
            <Text style={styles.smallCardEyebrow}>DAILY</Text>
            <Text style={styles.smallCardTitle}>Today&apos;s Challenge</Text>
            <Text style={styles.smallCardSub}>+50 XP · streak {user?.streak ?? 0}</Text>
          </Pressable>
          <Pressable
            testID="home-leaderboard-card"
            onPress={() => router.push('/leaderboard')}
            style={[styles.smallCard]}
          >
            <Text style={styles.smallCardEyebrow}>LEADERBOARD</Text>
            <Text style={styles.smallCardTitle}>Global Top 50</Text>
            <Text style={styles.smallCardSub}>Climb the Elo ladder</Text>
          </Pressable>
          {ruleByKey.classic ? (
            <Pressable
              testID="home-learn-card"
              onPress={() => router.push({ pathname: '/rule', params: { key: 'classic' } })}
              style={[styles.smallCard]}
            >
              <Text style={styles.smallCardEyebrow}>LEARN</Text>
              <Text style={styles.smallCardTitle}>Classic chess basics</Text>
              <Text style={styles.smallCardSub}>Quizzes & lessons</Text>
            </Pressable>
          ) : null}
          {user?.role === 'admin' ? (
            <Pressable
              testID="home-admin-card"
              onPress={() => router.push('/admin')}
              style={[styles.smallCard, { borderColor: colors.accent }]}
            >
              <Text style={[styles.smallCardEyebrow, { color: colors.accent }]}>ADMIN</Text>
              <Text style={styles.smallCardTitle}>Manage content</Text>
              <Text style={styles.smallCardSub}>Rules · Quizzes · Daily</Text>
            </Pressable>
          ) : null}
        </Section>

        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value, testID }: { label: string; value: number; testID?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue} testID={testID}>
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ marginTop: spacing.xxl }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle ? <Text style={styles.sectionSub}>{subtitle}</Text> : null}
      <View style={{ marginTop: spacing.lg, gap: spacing.md }}>{children}</View>
    </View>
  );
}

function RuleCard({
  rule,
  onPlay,
  onLearn,
}: {
  rule: any;
  onPlay: () => void;
  onLearn: () => void;
}) {
  const accent = ruleColors[rule.key] || colors.accent;
  return (
    <View style={[styles.ruleCard, { borderColor: colors.border }]} testID={`rule-card-${rule.key}`}>
      <View style={[styles.ruleAccent, { backgroundColor: accent }]} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.ruleEyebrow, { color: accent }]}>{rule.key.toUpperCase().replace('_', ' ')}</Text>
        <Text style={styles.ruleName}>{rule.name}</Text>
        <Text style={styles.ruleDesc} numberOfLines={2}>
          {rule.description}
        </Text>
        <View style={styles.ruleActions}>
          <Pressable
            onPress={onPlay}
            style={[styles.ruleBtn, { backgroundColor: accent }]}
            testID={`rule-play-${rule.key}`}
          >
            <Text style={[styles.ruleBtnText, { color: '#0A0A0B' }]}>Play</Text>
          </Pressable>
          <Pressable
            onPress={onLearn}
            style={[styles.ruleBtn, styles.ruleBtnGhost]}
            testID={`rule-learn-${rule.key}`}
          >
            <Text style={styles.ruleBtnTextGhost}>Learn</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.xl, paddingBottom: spacing.xxl },
  topbar: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  eyebrow: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 4,
  },
  hello: {
    color: colors.textPrimary,
    fontSize: 28,
    fontWeight: '900',
    marginTop: 2,
    letterSpacing: -0.5,
  },
  statsRow: { flexDirection: 'row', gap: spacing.md },
  stat: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minWidth: 56,
    alignItems: 'center',
  },
  statValue: { color: colors.textPrimary, fontWeight: '900', fontSize: 14 },
  statLabel: { color: colors.textMuted, fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  hero: {
    marginTop: spacing.xl,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.xl,
    padding: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
  heroLeft: { flex: 1 },
  heroEyebrow: { color: colors.accent, fontSize: 11, fontWeight: '900', letterSpacing: 4 },
  heroTitle: {
    color: colors.textPrimary,
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: -0.8,
    marginTop: spacing.sm,
    lineHeight: 32,
  },
  heroSub: { color: colors.textSecondary, marginTop: spacing.sm, fontSize: 13 },
  heroBoardSet: { flexDirection: 'row', alignItems: 'flex-end' },
  heroPiece: { fontSize: 30, marginLeft: -6, color: colors.textPrimary, opacity: 0.85 },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  sectionSub: { color: colors.textSecondary, marginTop: 2, fontSize: 13 },
  ruleCard: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.lg,
    overflow: 'hidden',
  },
  ruleAccent: { width: 4, borderRadius: 4, marginRight: spacing.lg },
  ruleEyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 2 },
  ruleName: { color: colors.textPrimary, fontSize: 18, fontWeight: '800', marginTop: 2 },
  ruleDesc: { color: colors.textSecondary, fontSize: 13, marginTop: 4 },
  ruleActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  ruleBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 8,
    borderRadius: radii.pill,
  },
  ruleBtnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
  ruleBtnText: { fontWeight: '800', fontSize: 13 },
  ruleBtnTextGhost: { color: colors.textPrimary, fontWeight: '700', fontSize: 13 },
  smallCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: spacing.lg,
  },
  smallCardEyebrow: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 3,
  },
  smallCardTitle: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '800',
    marginTop: 4,
  },
  smallCardSub: { color: colors.textSecondary, fontSize: 13, marginTop: 4 },
});
