import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../src/api';
import { colors, radii, spacing } from '../src/theme';
import { useAuth } from '../src/auth';

export default function Leaderboard() {
  const router = useRouter();
  const { user } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await api.leaderboard();
        setRows(r.leaderboard);
      } catch {}
      setLoading(false);
    })();
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} testID="lb-back" style={styles.backBtn}>
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>
        <Text style={styles.eyebrow}>GLOBAL</Text>
        <Text style={styles.title}>Leaderboard</Text>
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        {loading ? (
          <ActivityIndicator color={colors.accent} />
        ) : rows.length === 0 ? (
          <Text style={styles.empty}>No players yet.</Text>
        ) : (
          rows.map((r, i) => {
            const isMe = user?.id === r.id;
            return (
              <View
                key={r.id}
                style={[styles.row, isMe && { borderColor: colors.accent }]}
                testID={`lb-row-${i + 1}`}
              >
                <Text style={[styles.rank, i < 3 && { color: colors.accent }]}>{i + 1}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>
                    {r.name}
                    {isMe ? '  (you)' : ''}
                  </Text>
                  <Text style={styles.meta}>
                    {r.wins} wins · {r.badges?.length || 0} badges
                  </Text>
                </View>
                <View style={styles.eloBlock}>
                  <Text style={styles.elo}>{r.elo}</Text>
                  <Text style={styles.eloLabel}>ELO</Text>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { padding: spacing.xl, paddingBottom: spacing.lg },
  backBtn: { paddingVertical: spacing.xs, alignSelf: 'flex-start' },
  backText: { color: colors.textSecondary, fontSize: 16, fontWeight: '600' },
  eyebrow: { color: colors.accent, fontSize: 11, fontWeight: '900', letterSpacing: 4, marginTop: spacing.md },
  title: { color: colors.textPrimary, fontSize: 30, fontWeight: '900', marginTop: 2 },
  scroll: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.sm },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: spacing.xxl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.lg,
  },
  rank: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '900',
    width: 32,
    textAlign: 'center',
  },
  name: { color: colors.textPrimary, fontSize: 15, fontWeight: '700' },
  meta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  eloBlock: { alignItems: 'flex-end' },
  elo: { color: colors.accent, fontWeight: '900', fontSize: 18 },
  eloLabel: { color: colors.textMuted, fontSize: 10, fontWeight: '700' },
});
