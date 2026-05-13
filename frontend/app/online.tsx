import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../src/api';
import { realtime } from '../src/ws';
import { useAuth } from '../src/auth';
import { colors, radii, spacing } from '../src/theme';
import Button from '../src/components/Button';

export default function Online() {
  const router = useRouter();
  const { user } = useAuth();
  const [online, setOnline] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(realtime.connected);
  const [socketError, setSocketError] = useState<string | null>(null);

  const loadOnline = async () => {
    try {
      const r = await api.online();
      setOnline(r.online.filter((o) => o.id !== user?.id));
    } catch {}
  };

  useEffect(() => {
    setLoading(true);
    loadOnline().finally(() => setLoading(false));
    realtime.connect();
    const off = realtime.on((m) => {
      if (m.type === '__connected') {
        setConnected(true);
        setSocketError(null);
      }
      if (m.type === '__disconnected') {
        setConnected(false);
        setSearching(false);
        setSocketError('Realtime connection lost. Reconnecting...');
      }
      if (m.type === '__socket_error') setSocketError('Realtime connection error. Reconnecting...');
      if (m.type === 'presence') setOnline((m.online || []).filter((o: any) => o.id !== user?.id));
      if (m.type === 'searching') {
        setSearching(true);
        setSocketError(null);
      }
      if (m.type === 'match_cancelled') {
        setSearching(false);
        setSocketError(null);
      }
      if (m.type === 'match_found') {
        setSearching(false);
        setSocketError(null);
        router.replace({ pathname: '/play_online', params: { game_id: m.game_id } });
      }
      if (m.type === 'error') {
        setSearching(false);
        setSocketError(m.error || m.message || 'Realtime command failed.');
      }
    });
    return () => { off(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const find = () => {
    if (!connected) {
      setSocketError('Connect to realtime before finding a match.');
      return;
    }
    setSearching(true);
    setSocketError(null);
    const sent = realtime.send({ type: 'find_match', rule_key: 'classic' });
    if (!sent.ok) {
      setSearching(false);
      setSocketError('Could not start matchmaking because realtime is disconnected.');
    }
  };
  const cancel = () => {
    const sent = realtime.send({ type: 'cancel_match' });
    if (!sent.ok) setSocketError('Could not cancel on the server because realtime is disconnected.');
    setSearching(false);
  };

  const challenge = async (id: string, name: string) => {
    try {
      await api.createChallenge(id, 'classic');
      Alert.alert('Challenge sent', `Your challenge to ${name} is on its way.`);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await loadOnline(); setRefreshing(false); }} tintColor={colors.accent} />
        }
      >
        <Pressable onPress={() => router.back()} style={styles.backBtn} testID="online-back">
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>
        <Text style={styles.eyebrow}>PLAY ONLINE</Text>
        <Text style={styles.title}>Find a Match</Text>
        <Text style={styles.subtitle}>Classic chess. Real opponents. Live moves.</Text>

        <View style={[styles.card, searching && { borderColor: colors.accent }]}>
          {searching ? (
            <View style={{ alignItems: 'center', paddingVertical: spacing.lg, gap: spacing.md }}>
              <ActivityIndicator color={colors.accent} size="large" />
              <Text style={styles.searchingText}>Searching for an opponent…</Text>
              <Text style={styles.muted}>We expand the rating range every second to find you a match.</Text>
              {socketError ? <Text style={styles.errorText}>{socketError}</Text> : null}
              <Button label="Cancel search" testID="online-cancel" onPress={cancel} variant="secondary" fullWidth />
            </View>
          ) : (
            <View style={{ gap: spacing.md }}>
              <Text style={styles.cardTitle}>Quick match · Classic</Text>
              <Text style={styles.muted}>Paired by ELO (±200, expanding to ±800).</Text>
              {socketError ? <Text style={styles.errorText}>{socketError}</Text> : null}
              <Button label="Find match" testID="online-find" onPress={find} disabled={!connected} fullWidth />
            </View>
          )}
        </View>

        <View style={{ marginTop: spacing.xl }}>
          <Text style={styles.sectionTitle}>Online Players</Text>
          <Text style={styles.sectionSub}>{online.length} player{online.length === 1 ? '' : 's'} live now</Text>
          <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
            {loading ? (
              <ActivityIndicator color={colors.accent} />
            ) : online.length === 0 ? (
              <Text style={styles.muted}>Nobody online yet. Be the first — find a match.</Text>
            ) : (
              online.map((p) => (
                <View key={p.id} style={styles.onlineRow} testID={`online-row-${p.id}`}>
                  <View style={styles.onlineDot} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.onlineName}>{p.name}</Text>
                    <Text style={styles.muted}>{p.elo} ELO</Text>
                  </View>
                  <Pressable
                    onPress={() => challenge(p.id, p.name)}
                    style={styles.challengeBtn}
                    testID={`online-challenge-${p.id}`}
                  >
                    <Text style={styles.challengeBtnText}>Challenge</Text>
                  </Pressable>
                </View>
              ))
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.xl, paddingBottom: spacing.xxl },
  backBtn: { paddingVertical: spacing.xs, alignSelf: 'flex-start' },
  backText: { color: colors.textSecondary, fontSize: 16, fontWeight: '600' },
  eyebrow: { color: colors.accent, fontSize: 11, fontWeight: '900', letterSpacing: 4, marginTop: spacing.lg },
  title: { color: colors.textPrimary, fontSize: 30, fontWeight: '900', marginTop: 4 },
  subtitle: { color: colors.textSecondary, marginTop: 4 },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border, borderWidth: 1, borderRadius: radii.xl,
    padding: spacing.xl, marginTop: spacing.xl,
  },
  cardTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: '900' },
  muted: { color: colors.textMuted, fontSize: 13 },
  errorText: { color: colors.danger, fontSize: 13, fontWeight: '700' },
  searchingText: { color: colors.textPrimary, fontSize: 16, fontWeight: '800' },
  sectionTitle: { color: colors.textPrimary, fontSize: 20, fontWeight: '900' },
  sectionSub: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  onlineRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    borderRadius: radii.md, padding: spacing.md,
  },
  onlineDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.success },
  onlineName: { color: colors.textPrimary, fontWeight: '800' },
  challengeBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radii.pill, backgroundColor: colors.accent },
  challengeBtnText: { color: '#0A0A0B', fontWeight: '800', fontSize: 13 },
});
