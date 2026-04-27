import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../../src/api';
import { useAuth } from '../../src/auth';
import { colors, radii, ruleColors, spacing } from '../../src/theme';
import Button from '../../src/components/Button';

export default function Daily() {
  const { user, refresh } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{ challenge: any; completed: boolean } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.daily();
      setData(r);
      await refresh();
    } catch (e) {
      // no-op; UI shows error state by data === null
    } finally {
      setLoading(false);
    }
  }, [refresh]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading || !data) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>
      </SafeAreaView>
    );
  }

  const { challenge, completed } = data;
  const accent = ruleColors[challenge.rule_key] || colors.accent;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.eyebrow}>DAILY CHALLENGE</Text>
        <Text style={styles.title}>{new Date(challenge.date).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}</Text>

        <View style={[styles.card, { borderColor: accent }]} testID="daily-card">
          <View style={[styles.accent, { backgroundColor: accent }]} />
          <Text style={[styles.ruleEyebrow, { color: accent }]}>
            {challenge.rule_key.toUpperCase().replace('_', ' ')}
          </Text>
          <Text style={styles.cardTitle}>{challenge.target}</Text>
          {challenge.description ? (
            <Text style={styles.cardDesc}>{challenge.description}</Text>
          ) : null}

          <View style={styles.streakRow}>
            <View style={styles.streakBlock}>
              <Text style={styles.streakValue} testID="daily-streak">{user?.streak ?? 0}</Text>
              <Text style={styles.streakLabel}>STREAK</Text>
            </View>
            <View style={styles.streakBlock}>
              <Text style={styles.streakValue}>{user?.longest_streak ?? 0}</Text>
              <Text style={styles.streakLabel}>BEST</Text>
            </View>
            <View style={styles.streakBlock}>
              <Text style={[styles.streakValue, { color: accent }]}>+50</Text>
              <Text style={styles.streakLabel}>XP REWARD</Text>
            </View>
          </View>

          {completed ? (
            <View style={styles.doneBadge}>
              <Text style={styles.doneText}>✓ Completed today</Text>
            </View>
          ) : null}

          <View style={{ marginTop: spacing.lg }}>
            <Button
              label={completed ? 'Play again (no bonus)' : 'Start daily challenge'}
              testID="daily-start"
              onPress={() =>
                router.push({
                  pathname: '/play',
                  params: { rule: challenge.rule_key, ai: '2', daily: '1' },
                })
              }
              fullWidth
            />
          </View>
        </View>

        <Pressable
          testID="daily-learn-rule"
          onPress={() => router.push({ pathname: '/rule', params: { key: challenge.rule_key } })}
          style={styles.learnLink}
        >
          <Text style={styles.learnText}>Learn this rule first ›</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.xl, paddingBottom: spacing.xxl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { color: colors.accent, fontSize: 11, fontWeight: '900', letterSpacing: 4 },
  title: { color: colors.textPrimary, fontSize: 32, fontWeight: '900', marginTop: spacing.xs },
  card: {
    marginTop: spacing.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderRadius: radii.xl,
    padding: spacing.xl,
    overflow: 'hidden',
  },
  accent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  ruleEyebrow: { fontSize: 11, fontWeight: '900', letterSpacing: 3 },
  cardTitle: { color: colors.textPrimary, fontSize: 22, fontWeight: '800', marginTop: spacing.sm },
  cardDesc: { color: colors.textSecondary, marginTop: spacing.sm, fontSize: 14 },
  streakRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl },
  streakBlock: {
    flex: 1,
    backgroundColor: colors.elevated,
    borderRadius: radii.md,
    padding: spacing.md,
    alignItems: 'center',
  },
  streakValue: { color: colors.textPrimary, fontSize: 22, fontWeight: '900' },
  streakLabel: { color: colors.textMuted, fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginTop: 2 },
  doneBadge: {
    marginTop: spacing.lg,
    backgroundColor: 'rgba(16,185,129,0.12)',
    borderColor: colors.success,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
    alignSelf: 'flex-start',
  },
  doneText: { color: colors.success, fontWeight: '800' },
  learnLink: { marginTop: spacing.lg, alignSelf: 'flex-start', padding: spacing.sm },
  learnText: { color: colors.textSecondary, fontWeight: '700' },
});
