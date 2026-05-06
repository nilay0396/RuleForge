import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl, ActivityIndicator, TextInput, Modal } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../src/api';
import { useAuth } from '../src/auth';
import { colors, radii, spacing } from '../src/theme';
import Button from '../src/components/Button';

const SEVERITIES = ['blocker', 'critical', 'major', 'minor'] as const;
const STATUSES = ['open', 'in_progress', 'fixed', 'closed', 'wont_fix'] as const;

export default function QAScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [dash, setDash] = useState<any>(null);
  const [bugs, setBugs] = useState<any[]>([]);
  const [uat, setUat] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [draft, setDraft] = useState({
    title: '', severity: 'major', feature: '', steps: '', expected: '', actual: '',
  });

  const load = useCallback(async () => {
    if (user?.role !== 'admin') return;
    try {
      const [d, b, u] = await Promise.all([
        api.qaDashboard(),
        api.qaBugs(),
        api.qaUatStatus().catch(() => null),
      ]);
      setDash(d);
      setBugs(b.bugs || []);
      setUat(u);
    } catch {}
    setLoading(false);
  }, [user]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const submitBug = async () => {
    try {
      await api.qaCreateBug(draft);
      setDraft({ title: '', severity: 'major', feature: '', steps: '', expected: '', actual: '' });
      setShowCreate(false);
      await load();
    } catch {}
  };

  const updateStatus = async (bugId: string, status: string) => {
    try {
      await api.qaUpdateBug(bugId, { status });
      await load();
    } catch {}
  };

  if (user?.role !== 'admin') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.gateBox}>
          <Text style={styles.gateTitle}>Admin only</Text>
          <Text style={styles.gateSub}>Sign in as an admin to view the QA dashboard.</Text>
          <Button label="Back" variant="ghost" onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn}><Text style={styles.iconBtnText}>‹</Text></Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>QA · ADMIN</Text>
          <Text style={styles.title}>Release readiness</Text>
        </View>
        <Pressable onPress={() => setShowCreate(true)} style={styles.newBtn} testID="qa-new-bug">
          <Text style={styles.newBtnText}>+ New bug</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
        {loading ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: 60 }} />
        ) : !dash ? (
          <Text style={styles.empty}>Could not load dashboard.</Text>
        ) : (
          <>
            <View style={[styles.bigCard, dash.release_ready ? { borderColor: colors.success } : { borderColor: colors.danger }]} testID="qa-release-card">
              <Text style={styles.bigEyebrow}>{dash.release_ready ? 'READY TO SHIP' : 'NOT READY'}</Text>
              <Text style={styles.bigTitle}>{dash.release_ready ? 'All gates green' : 'Blockers remain'}</Text>
              {dash.blockers?.length ? (
                <View style={{ marginTop: spacing.sm }}>
                  {dash.blockers.map((b: string, i: number) => (
                    <Text key={i} style={styles.blockerText}>• {b}</Text>
                  ))}
                </View>
              ) : (
                <Text style={styles.blockerText}>No blockers detected.</Text>
              )}
            </View>

            {uat?.uat?.exists ? (
              <View
                style={[
                  styles.bigCard,
                  uat.ready && uat.uat.failed === 0 ? { borderColor: colors.success } : { borderColor: colors.danger },
                ]}
                testID="qa-uat-card"
              >
                <View style={styles.uatHead}>
                  <Text style={styles.bigEyebrow}>MANUAL UAT SIGNOFF</Text>
                  <View style={[styles.versionPill, uat.ready ? styles.versionPillReady : styles.versionPillNotReady]}>
                    <Text style={[styles.versionPillText, uat.ready ? { color: '#0A0A0B' } : { color: '#fff' }]}>
                      {uat.version}{uat.ready ? ' · READY' : ' · CHECK'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.bigTitle}>
                  {uat.uat.passed}/{uat.uat.total} passed · {uat.uat.pass_rate}%
                </Text>
                {uat.uat.run_date ? (
                  <Text style={styles.blockerText}>Run date: {uat.uat.run_date} · Build: {uat.uat.build || '—'}</Text>
                ) : null}
                <View style={styles.uatStatsRow}>
                  <UatStat label="TOTAL" value={uat.uat.total} />
                  <UatStat label="PASSED" value={uat.uat.passed} accent={colors.success} />
                  <UatStat label="FAILED" value={uat.uat.failed} accent={uat.uat.failed ? colors.danger : colors.textMuted} />
                  <UatStat label="BLOCKED" value={uat.uat.blocked} accent={uat.uat.blocked ? colors.info : colors.textMuted} />
                </View>
                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFillPass,
                      { flex: uat.uat.passed || 0.0001 },
                    ]}
                  />
                  <View
                    style={[
                      styles.progressFillBlocked,
                      { flex: uat.uat.blocked || 0 },
                    ]}
                  />
                  <View
                    style={[
                      styles.progressFillFail,
                      { flex: uat.uat.failed || 0 },
                    ]}
                  />
                </View>
                <Text style={styles.uatLegend}>
                  ✅ Auto {uat.uat.auto_pass} · 🟦 Manual {uat.uat.manual_pass} · 🟨 Signoff {uat.uat.blocked} · ❌ Fail {uat.uat.failed}
                </Text>

                {uat.uat.sections?.length ? (
                  <View style={{ marginTop: spacing.md }}>
                    <Text style={styles.uatSectionsHeader}>Section breakdown</Text>
                    {uat.uat.sections.map((s: any) => {
                      const ok = s.failed === 0 && s.blocked === 0;
                      const partial = s.failed === 0 && s.blocked > 0;
                      return (
                        <View key={s.name} style={styles.uatSectionRow}>
                          <Text style={styles.uatSectionName} numberOfLines={1}>{s.name}</Text>
                          <Text
                            style={[
                              styles.uatSectionCount,
                              ok ? { color: colors.success } : partial ? { color: colors.info } : { color: colors.danger },
                            ]}
                          >
                            {s.passed}/{s.total}
                            {s.blocked ? `  ·  ${s.blocked} signoff` : ''}
                            {s.failed ? `  ·  ${s.failed} fail` : ''}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                ) : null}

                {uat.uat.verdict ? (
                  <Text style={styles.uatVerdict}>“{uat.uat.verdict}”</Text>
                ) : null}
              </View>
            ) : null}

            <View style={styles.statsRow}>
              <Stat label="OPEN BUGS" value={dash.open_bugs} accent={dash.open_bugs ? colors.danger : colors.success} />
              <Stat label="BLOCKERS" value={dash.by_severity.blocker} accent={colors.danger} />
              <Stat label="CRITICAL" value={dash.by_severity.critical} accent={colors.danger} />
            </View>
            <View style={styles.statsRow}>
              <Stat label="MAJOR" value={dash.by_severity.major} />
              <Stat label="MINOR" value={dash.by_severity.minor} />
              <Stat label="TOTAL" value={dash.total_bugs} />
            </View>

            <View style={styles.subCard}>
              <Text style={styles.subTitle}>Pytest summary</Text>
              <Text style={styles.subText}>
                {dash.tests?.passed ?? 0} passed · {dash.tests?.failed ?? 0} failed · {dash.tests?.errors ?? 0} errors · {dash.tests?.skipped ?? 0} skipped
              </Text>
              {dash.tests?.note ? <Text style={styles.note}>{dash.tests.note}</Text> : null}
            </View>

            <View style={styles.subCard}>
              <Text style={styles.subTitle}>E2E (Playwright)</Text>
              {dash.e2e?.note ? (
                <Text style={styles.note}>{dash.e2e.note}</Text>
              ) : (
                <Text style={styles.subText}>
                  {dash.e2e?.expected ?? 0} passed · {dash.e2e?.unexpected ?? 0} failed · {dash.e2e?.flaky ?? 0} flaky · {Math.round((dash.e2e?.duration_ms ?? 0) / 1000)}s
                  {dash.e2e?.pass ? '  ·  ✅' : '  ·  ❌'}
                </Text>
              )}
            </View>

            <View style={styles.subCard}>
              <Text style={styles.subTitle}>Performance smoke</Text>
              {dash.performance?.note ? (
                <Text style={styles.note}>{dash.performance.note}</Text>
              ) : (
                <Text style={styles.subText}>
                  median {dash.performance?.median_ms}ms · p95 {dash.performance?.p95_ms}ms · err {(dash.performance?.error_rate ?? 0) * 100}%
                </Text>
              )}
            </View>

            <View style={{ marginTop: spacing.xl }}>
              <Text style={styles.sectionTitle}>Bug tracker</Text>
              {bugs.length === 0 ? (
                <Text style={styles.empty}>No bugs filed. 🎉</Text>
              ) : (
                <View style={{ gap: spacing.md, marginTop: spacing.sm }}>
                  {bugs.map((b) => (
                    <View key={b.id} style={[styles.bugCard, severityStyle(b.severity)]} testID={`qa-bug-${b.id}`}>
                      <View style={styles.bugHead}>
                        <Text style={styles.bugSev}>{b.severity.toUpperCase()}</Text>
                        <Text style={styles.bugStatus}>{b.status.toUpperCase()}</Text>
                      </View>
                      <Text style={styles.bugTitle}>{b.title}</Text>
                      <Text style={styles.bugFeature}>{b.feature}</Text>
                      {b.steps ? <Text style={styles.bugMeta}>Steps: {b.steps}</Text> : null}
                      {b.actual ? <Text style={styles.bugMeta}>Actual: {b.actual}</Text> : null}
                      <View style={styles.bugActions}>
                        {STATUSES.map((s) => (
                          <Pressable key={s} onPress={() => updateStatus(b.id, s)} style={[styles.statusChip, b.status === s && styles.statusChipActive]}>
                            <Text style={[styles.statusChipText, b.status === s && styles.statusChipTextActive]}>{s}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </>
        )}
        <View style={{ height: spacing.xxl }} />
      </ScrollView>

      <Modal visible={showCreate} transparent animationType="fade" onRequestClose={() => setShowCreate(false)}>
        <View style={styles.modalScrim}>
          <View style={styles.modalCard}>
            <Text style={styles.modalEyebrow}>NEW BUG</Text>
            <TextInput placeholder="Title" placeholderTextColor={colors.textMuted}
              value={draft.title} onChangeText={(t) => setDraft({ ...draft, title: t })}
              style={styles.input} />
            <TextInput placeholder="Feature (e.g. auth, store, multiplayer)"
              placeholderTextColor={colors.textMuted}
              value={draft.feature} onChangeText={(t) => setDraft({ ...draft, feature: t })}
              style={styles.input} />
            <View style={styles.sevRow}>
              {SEVERITIES.map((s) => (
                <Pressable key={s} onPress={() => setDraft({ ...draft, severity: s })}
                  style={[styles.sevChip, draft.severity === s && severityStyle(s)]}>
                  <Text style={styles.sevChipText}>{s}</Text>
                </Pressable>
              ))}
            </View>
            <TextInput placeholder="Steps to reproduce" placeholderTextColor={colors.textMuted}
              value={draft.steps} onChangeText={(t) => setDraft({ ...draft, steps: t })}
              style={[styles.input, { height: 60 }]} multiline />
            <TextInput placeholder="Expected" placeholderTextColor={colors.textMuted}
              value={draft.expected} onChangeText={(t) => setDraft({ ...draft, expected: t })}
              style={styles.input} />
            <TextInput placeholder="Actual" placeholderTextColor={colors.textMuted}
              value={draft.actual} onChangeText={(t) => setDraft({ ...draft, actual: t })}
              style={styles.input} />
            <View style={{ height: spacing.sm }} />
            <Button label="File bug" onPress={submitBug} fullWidth disabled={!draft.title || !draft.feature} testID="qa-submit-bug" />
            <View style={{ height: spacing.xs }} />
            <Button label="Cancel" variant="ghost" onPress={() => setShowCreate(false)} fullWidth />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, accent ? { color: accent } : null]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function UatStat({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <View style={styles.uatStat}>
      <Text style={[styles.uatStatValue, accent ? { color: accent } : null]}>{value}</Text>
      <Text style={styles.uatStatLabel}>{label}</Text>
    </View>
  );
}

function severityStyle(sev: string) {
  if (sev === 'blocker') return { borderColor: colors.danger, backgroundColor: 'rgba(239,68,68,0.06)' } as const;
  if (sev === 'critical') return { borderColor: colors.info, backgroundColor: 'rgba(6,182,212,0.06)' } as const;
  if (sev === 'major') return { borderColor: colors.accent } as const;
  return { borderColor: colors.border } as const;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.md },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: radii.pill, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
  iconBtnText: { color: colors.textPrimary, fontSize: 20, fontWeight: '900' },
  eyebrow: { color: colors.danger, fontSize: 10, fontWeight: '900', letterSpacing: 3 },
  title: { color: colors.textPrimary, fontSize: 22, fontWeight: '900' },
  newBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radii.pill, backgroundColor: colors.accent },
  newBtnText: { color: '#0A0A0B', fontWeight: '900', fontSize: 12 },
  bigCard: { padding: spacing.xl, backgroundColor: colors.surface, borderWidth: 1, borderRadius: radii.lg, marginTop: spacing.md },
  bigEyebrow: { color: colors.accent, fontSize: 11, fontWeight: '900', letterSpacing: 4 },
  bigTitle: { color: colors.textPrimary, fontSize: 22, fontWeight: '900', marginTop: 4 },
  blockerText: { color: colors.textSecondary, marginTop: 4, fontSize: 13 },
  statsRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  stat: { flex: 1, padding: spacing.md, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radii.md, alignItems: 'center' },
  statValue: { color: colors.textPrimary, fontSize: 22, fontWeight: '900' },
  statLabel: { color: colors.textMuted, fontSize: 10, fontWeight: '900', letterSpacing: 2, marginTop: 4 },
  subCard: { marginTop: spacing.md, padding: spacing.lg, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radii.md },
  subTitle: { color: colors.textPrimary, fontWeight: '900' },
  subText: { color: colors.textSecondary, marginTop: 6, fontSize: 13 },
  note: { color: colors.textMuted, marginTop: 6, fontSize: 12, fontStyle: 'italic' },
  sectionTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '900' },
  empty: { color: colors.textMuted, marginTop: spacing.md },
  bugCard: { padding: spacing.md, backgroundColor: colors.surface, borderWidth: 1, borderRadius: radii.md },
  bugHead: { flexDirection: 'row', justifyContent: 'space-between' },
  bugSev: { color: colors.danger, fontSize: 10, fontWeight: '900', letterSpacing: 2 },
  bugStatus: { color: colors.textMuted, fontSize: 10, fontWeight: '900', letterSpacing: 2 },
  bugTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: '900', marginTop: 6 },
  bugFeature: { color: colors.accent, fontSize: 11, fontWeight: '800', marginTop: 2 },
  bugMeta: { color: colors.textSecondary, fontSize: 12, marginTop: 4 },
  bugActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  statusChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: radii.pill, backgroundColor: colors.elevated, borderColor: colors.border, borderWidth: 1 },
  statusChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  statusChipText: { color: colors.textSecondary, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  statusChipTextActive: { color: '#0A0A0B' },
  modalScrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  modalCard: { width: '100%', maxWidth: 480, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radii.xl, padding: spacing.xl },
  modalEyebrow: { color: colors.accent, fontSize: 11, fontWeight: '900', letterSpacing: 4, marginBottom: spacing.md },
  input: { backgroundColor: colors.elevated, borderColor: colors.border, borderWidth: 1, borderRadius: radii.md, padding: 10, color: colors.textPrimary, marginBottom: 8 },
  sevRow: { flexDirection: 'row', gap: 6, marginBottom: 8 },
  sevChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radii.pill, borderColor: colors.border, borderWidth: 1, backgroundColor: colors.elevated },
  sevChipText: { color: colors.textPrimary, fontSize: 11, fontWeight: '900' },
  gateBox: { padding: spacing.xl, alignItems: 'center', justifyContent: 'center', flex: 1, gap: 8 },
  gateTitle: { color: colors.textPrimary, fontSize: 22, fontWeight: '900' },
  gateSub: { color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.lg },
  // Manual UAT Signoff card
  uatHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  versionPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radii.pill, borderWidth: 1 },
  versionPillReady: { backgroundColor: colors.accent, borderColor: colors.accent },
  versionPillNotReady: { backgroundColor: colors.danger, borderColor: colors.danger },
  versionPillText: { fontSize: 10, fontWeight: '900', letterSpacing: 2 },
  uatStatsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  uatStat: { flex: 1, paddingVertical: 10, paddingHorizontal: 6, borderRadius: radii.md, backgroundColor: colors.elevated, borderColor: colors.border, borderWidth: 1, alignItems: 'center' },
  uatStatValue: { color: colors.textPrimary, fontSize: 18, fontWeight: '900' },
  uatStatLabel: { color: colors.textMuted, fontSize: 9, fontWeight: '900', letterSpacing: 1.5, marginTop: 2 },
  progressTrack: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', marginTop: spacing.md, backgroundColor: colors.elevated },
  progressFillPass: { backgroundColor: colors.success },
  progressFillBlocked: { backgroundColor: colors.info },
  progressFillFail: { backgroundColor: colors.danger },
  uatLegend: { color: colors.textSecondary, fontSize: 11, marginTop: 6 },
  uatSectionsHeader: { color: colors.textPrimary, fontSize: 11, fontWeight: '900', letterSpacing: 2, marginBottom: 4 },
  uatSectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4, borderBottomColor: colors.border, borderBottomWidth: 1 },
  uatSectionName: { color: colors.textSecondary, fontSize: 12, flex: 1, paddingRight: 8 },
  uatSectionCount: { fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  uatVerdict: { color: colors.textMuted, fontSize: 12, marginTop: spacing.md, fontStyle: 'italic' },
});
