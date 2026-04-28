import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator, Alert,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../src/api';
import { realtime } from '../src/ws';
import { colors, radii, spacing } from '../src/theme';

type Friend = { id: string; name: string; elo: number; online?: boolean; friendship_id?: string };

export default function Friends() {
  const router = useRouter();
  const [data, setData] = useState<{ accepted: Friend[]; incoming: Friend[]; outgoing: Friend[] } | null>(null);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.friends();
      setData(r);
    } catch {}
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Re-fetch when WS notifies a friend event
  useEffect(() => realtime.on((m) => {
    if (m.type === 'notification' && (m.notification?.type === 'friend_request' || m.notification?.type === 'friend_accepted')) {
      load();
    }
  }), [load]);

  // Live search
  useEffect(() => {
    let cancel = false;
    const id = setTimeout(async () => {
      if (q.trim().length < 2) { setResults([]); return; }
      try {
        const r = await api.searchUsers(q.trim());
        if (!cancel) setResults(r.users);
      } catch {}
    }, 250);
    return () => { cancel = true; clearTimeout(id); };
  }, [q]);

  const sendRequest = async (id: string) => {
    setBusy(true);
    try {
      await api.friendRequest(id);
      Alert.alert('Request sent', 'Once they accept, they\u2019ll appear in your friends list.');
      setQ(''); setResults([]);
      load();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setBusy(false);
    }
  };

  const accept = async (fid: string) => {
    try {
      await api.friendAccept(fid);
      load();
    } catch (e: any) { Alert.alert('Error', e.message); }
  };
  const reject = async (fid: string) => {
    try {
      await api.friendReject(fid);
      load();
    } catch (e: any) { Alert.alert('Error', e.message); }
  };
  const challenge = async (id: string) => {
    try {
      await api.createChallenge(id, 'classic');
      Alert.alert('Challenge sent', 'Waiting for your friend to accept.');
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
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => router.back()} style={styles.backBtn} testID="friends-back">
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>
        <Text style={styles.eyebrow}>SOCIAL</Text>
        <Text style={styles.title}>Friends</Text>

        <Text style={styles.label}>Search by name or email</Text>
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Type 2+ characters"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          style={styles.input}
          testID="friends-search"
        />
        {q.length >= 2 && (
          <View style={{ gap: spacing.xs, marginTop: spacing.sm }}>
            {results.length === 0 ? (
              <Text style={styles.muted}>No users found.</Text>
            ) : results.map((u) => (
              <View key={u.id} style={styles.row} testID={`friends-result-${u.id}`}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowName}>{u.name}</Text>
                  <Text style={styles.muted}>{u.elo} ELO {u.online ? '· online' : ''}</Text>
                </View>
                <Pressable onPress={() => sendRequest(u.id)} disabled={busy} style={styles.primaryBtn} testID={`friends-add-${u.id}`}>
                  <Text style={styles.primaryBtnText}>Add</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}

        {data?.incoming?.length ? (
          <Section title={`Pending requests (${data.incoming.length})`}>
            {data.incoming.map((f) => (
              <View key={f.friendship_id} style={styles.row} testID={`friends-incoming-${f.friendship_id}`}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowName}>{f.name}</Text>
                  <Text style={styles.muted}>{f.elo} ELO</Text>
                </View>
                <Pressable onPress={() => accept(f.friendship_id!)} style={styles.primaryBtn} testID={`friends-accept-${f.friendship_id}`}>
                  <Text style={styles.primaryBtnText}>Accept</Text>
                </Pressable>
                <Pressable onPress={() => reject(f.friendship_id!)} style={styles.dangerBtn} testID={`friends-reject-${f.friendship_id}`}>
                  <Text style={styles.dangerBtnText}>Reject</Text>
                </Pressable>
              </View>
            ))}
          </Section>
        ) : null}

        <Section title={`Friends (${data?.accepted?.length ?? 0})`}>
          {data?.accepted?.length ? (
            data.accepted.map((f) => (
              <View key={f.friendship_id} style={styles.row} testID={`friends-row-${f.id}`}>
                <View style={[styles.dot, { backgroundColor: f.online ? colors.success : colors.border }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowName}>{f.name}</Text>
                  <Text style={styles.muted}>{f.elo} ELO {f.online ? '· online' : ''}</Text>
                </View>
                <Pressable onPress={() => challenge(f.id)} style={styles.primaryBtn} testID={`friends-challenge-${f.id}`}>
                  <Text style={styles.primaryBtnText}>Challenge</Text>
                </Pressable>
              </View>
            ))
          ) : (
            <Text style={styles.muted}>No friends yet — add some above.</Text>
          )}
        </Section>

        {data?.outgoing?.length ? (
          <Section title={`Outgoing requests (${data.outgoing.length})`}>
            {data.outgoing.map((f) => (
              <View key={f.friendship_id} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowName}>{f.name}</Text>
                  <Text style={styles.muted}>Pending</Text>
                </View>
              </View>
            ))}
          </Section>
        ) : null}
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
  title: { color: colors.textPrimary, fontSize: 30, fontWeight: '900', marginTop: 4, marginBottom: spacing.lg },
  label: { color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  input: {
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    borderRadius: radii.md, paddingHorizontal: spacing.lg, paddingVertical: 12,
    color: colors.textPrimary, fontSize: 16, marginTop: 4,
  },
  muted: { color: colors.textMuted, fontSize: 13 },
  sectionTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '900' },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    borderRadius: radii.md, padding: spacing.md,
  },
  rowName: { color: colors.textPrimary, fontWeight: '700' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  primaryBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radii.pill, backgroundColor: colors.accent },
  primaryBtnText: { color: '#0A0A0B', fontWeight: '800', fontSize: 12 },
  dangerBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.danger },
  dangerBtnText: { color: colors.danger, fontWeight: '800', fontSize: 12 },
});
