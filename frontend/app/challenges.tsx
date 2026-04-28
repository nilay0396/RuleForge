import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Alert } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../src/api';
import { realtime } from '../src/ws';
import { colors, radii, spacing } from '../src/theme';

export default function Challenges() {
  const router = useRouter();
  const [data, setData] = useState<{ incoming: any[]; outgoing: any[] } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const r = await api.challenges();
      setData(r);
    } catch {}
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Watch for live events
  useEffect(() => realtime.on((m) => {
    if (m.type === 'notification' && (m.notification?.type === 'challenge_received' || m.notification?.type === 'challenge_rejected')) {
      load();
    }
    if (m.type === 'match_found' && m.challenge_id) {
      router.replace({ pathname: '/play_online', params: { game_id: m.game_id } });
    }
  }), [load, router]);

  const accept = async (cid: string) => {
    try {
      const r = await api.acceptChallenge(cid);
      router.replace({ pathname: '/play_online', params: { game_id: r.game_id } });
    } catch (e: any) { Alert.alert('Error', e.message); }
  };
  const reject = async (cid: string) => {
    try {
      await api.rejectChallenge(cid);
      load();
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} testID="ch-back">
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>
        <Text style={styles.eyebrow}>SOCIAL</Text>
        <Text style={styles.title}>Challenges</Text>

        <Section title={`Incoming (${data?.incoming?.length ?? 0})`}>
          {(data?.incoming ?? []).length === 0 ? (
            <Text style={styles.muted}>No incoming challenges right now.</Text>
          ) : data!.incoming.map((c) => (
            <View key={c.id} style={styles.row} testID={`ch-incoming-${c.id}`}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName}>{c.sender?.name || 'Player'}</Text>
                <Text style={styles.muted}>{(c.rule_key || 'classic').toUpperCase()} · ELO {c.sender?.elo ?? '?'}</Text>
              </View>
              <Pressable onPress={() => accept(c.id)} style={styles.primaryBtn} testID={`ch-accept-${c.id}`}>
                <Text style={styles.primaryBtnText}>Accept</Text>
              </Pressable>
              <Pressable onPress={() => reject(c.id)} style={styles.dangerBtn} testID={`ch-reject-${c.id}`}>
                <Text style={styles.dangerBtnText}>Reject</Text>
              </Pressable>
            </View>
          ))}
        </Section>

        <Section title={`Outgoing (${data?.outgoing?.length ?? 0})`}>
          {(data?.outgoing ?? []).length === 0 ? (
            <Text style={styles.muted}>No outgoing challenges.</Text>
          ) : data!.outgoing.map((c) => (
            <View key={c.id} style={styles.row} testID={`ch-outgoing-${c.id}`}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName}>{c.receiver?.name || 'Player'}</Text>
                <Text style={styles.muted}>Waiting · {(c.rule_key || 'classic').toUpperCase()}</Text>
              </View>
            </View>
          ))}
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: spacing.xl, gap: spacing.sm }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={{ gap: spacing.sm }}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: spacing.xl, paddingBottom: spacing.xxl },
  backBtn: { paddingVertical: spacing.xs, alignSelf: 'flex-start' },
  backText: { color: colors.textSecondary, fontSize: 16, fontWeight: '600' },
  eyebrow: { color: colors.accent, fontSize: 11, fontWeight: '900', letterSpacing: 4, marginTop: spacing.lg },
  title: { color: colors.textPrimary, fontSize: 30, fontWeight: '900', marginTop: 4 },
  muted: { color: colors.textMuted, fontSize: 13 },
  sectionTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '900' },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    borderRadius: radii.md, padding: spacing.md,
  },
  rowName: { color: colors.textPrimary, fontWeight: '700' },
  primaryBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radii.pill, backgroundColor: colors.accent },
  primaryBtnText: { color: '#0A0A0B', fontWeight: '800', fontSize: 12 },
  dangerBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.danger },
  dangerBtnText: { color: colors.danger, fontWeight: '800', fontSize: 12 },
});
