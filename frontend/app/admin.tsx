import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../src/api';
import { useAuth } from '../src/auth';
import { colors, radii, ruleColors, spacing } from '../src/theme';
import Button from '../src/components/Button';

export default function Admin() {
  const { user } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<'rules' | 'daily' | 'quizzes' | 'users'>('rules');

  if (!user || user.role !== 'admin') {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.center}>
          <Text style={styles.h1}>Admin only</Text>
          <Text style={styles.muted}>Sign in as an admin to access this page.</Text>
          <View style={{ height: spacing.md }} />
          <Button label="Back to home" onPress={() => router.replace('/home')} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} testID="admin-back" style={styles.backBtn}>
            <Text style={styles.backText}>‹ Back</Text>
          </Pressable>
          <Text style={styles.eyebrow}>ADMIN</Text>
          <Text style={styles.title}>Manage RuleForge</Text>
        </View>
        <View style={styles.tabBar}>
          {(['rules', 'daily', 'quizzes', 'users'] as const).map((t) => (
            <Pressable
              key={t}
              onPress={() => setTab(t)}
              testID={`admin-tab-${t}`}
              style={[styles.tab, tab === t && styles.tabActive]}
            >
              <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t.toUpperCase()}</Text>
            </Pressable>
          ))}
        </View>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {tab === 'rules' && <RulesPanel />}
          {tab === 'daily' && <DailyPanel />}
          {tab === 'quizzes' && <QuizzesPanel />}
          {tab === 'users' && <UsersPanel />}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function RulesPanel() {
  const [rules, setRules] = useState<any[]>([]);
  const [form, setForm] = useState({ key: '', name: '', description: '', color: '#EAB308', long_explanation: '' });
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const r = await api.rules();
      setRules(r.rules);
    } catch {}
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.key || !form.name) {
      Alert.alert('Missing fields', 'Key and name are required.');
      return;
    }
    setBusy(true);
    try {
      await api.adminCreateRule({
        key: form.key.trim(),
        name: form.name.trim(),
        description: form.description.trim(),
        color: form.color || '#EAB308',
        icon: 'crown',
        long_explanation: form.long_explanation.trim(),
        examples: [],
      });
      setForm({ key: '', name: '', description: '', color: '#EAB308', long_explanation: '' });
      load();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (key: string) => {
    try {
      await api.adminDeleteRule(key);
      load();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  return (
    <View style={{ gap: spacing.lg }}>
      <Card title="Existing rules">
        {rules.length === 0 ? (
          <Text style={styles.muted}>No rules yet.</Text>
        ) : (
          rules.map((r) => (
            <View key={r.key} style={styles.row} testID={`admin-rule-${r.key}`}>
              <View style={[styles.swatch, { backgroundColor: ruleColors[r.key] || r.color }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{r.name}</Text>
                <Text style={styles.rowSub}>{r.key} · {r.description}</Text>
              </View>
              <Pressable onPress={() => remove(r.key)} testID={`admin-rule-delete-${r.key}`} style={styles.deleteBtn}>
                <Text style={styles.deleteText}>Delete</Text>
              </Pressable>
            </View>
          ))
        )}
      </Card>

      <Card title="Add or update rule">
        <Field label="Key (e.g. fog_chess)" value={form.key} onChange={(v) => setForm({ ...form, key: v })} testID="admin-rule-key" />
        <Field label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} testID="admin-rule-name" />
        <Field label="Short description" value={form.description} onChange={(v) => setForm({ ...form, description: v })} testID="admin-rule-desc" />
        <Field label="Accent color (hex)" value={form.color} onChange={(v) => setForm({ ...form, color: v })} testID="admin-rule-color" />
        <Field
          label="Long explanation"
          value={form.long_explanation}
          onChange={(v) => setForm({ ...form, long_explanation: v })}
          testID="admin-rule-long"
          multiline
        />
        <View style={{ height: spacing.sm }} />
        <Button label={busy ? 'Saving...' : 'Save rule'} onPress={save} testID="admin-rule-save" disabled={busy} fullWidth />
      </Card>
    </View>
  );
}

function DailyPanel() {
  const [rules, setRules] = useState<any[]>([]);
  const [ruleKey, setRuleKey] = useState('');
  const [target, setTarget] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.rules().then((r) => {
      setRules(r.rules);
      if (r.rules[0]) setRuleKey(r.rules[0].key);
    });
  }, []);

  const save = async () => {
    if (!ruleKey) return;
    setBusy(true);
    try {
      await api.adminSetDaily({
        rule_key: ruleKey,
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        target: target.trim() || `Defeat the bot using ${ruleKey}`,
        description: description.trim(),
      });
      Alert.alert('Saved', 'Today\u2019s daily challenge has been updated.');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Set today's daily challenge">
      <Text style={styles.label}>Rule</Text>
      <View style={styles.chipRow}>
        {rules.map((r) => (
          <Pressable
            key={r.key}
            onPress={() => setRuleKey(r.key)}
            testID={`admin-daily-rule-${r.key}`}
            style={[styles.chip, ruleKey === r.key && { borderColor: colors.accent, backgroundColor: 'rgba(234,179,8,0.08)' }]}
          >
            <Text style={[styles.chipText, ruleKey === r.key && { color: colors.textPrimary }]}>{r.name}</Text>
          </Pressable>
        ))}
      </View>
      <Field label="Target text" value={target} onChange={setTarget} testID="admin-daily-target" />
      <Field label="Description" value={description} onChange={setDescription} testID="admin-daily-desc" multiline />
      <View style={{ height: spacing.sm }} />
      <Button label={busy ? 'Saving...' : 'Save daily'} onPress={save} testID="admin-daily-save" disabled={busy} fullWidth />
    </Card>
  );
}

function QuizzesPanel() {
  const [rules, setRules] = useState<any[]>([]);
  const [ruleKey, setRuleKey] = useState('');
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '', '', '']);
  const [correct, setCorrect] = useState(0);
  const [explanation, setExplanation] = useState('');
  const [list, setList] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  const loadList = async (key: string) => {
    if (!key) return;
    try {
      const r = await api.rule(key);
      setList(r.quizzes);
    } catch {}
  };

  useEffect(() => {
    api.rules().then((r) => {
      setRules(r.rules);
      if (r.rules[0]) {
        setRuleKey(r.rules[0].key);
        loadList(r.rules[0].key);
      }
    });
  }, []);

  useEffect(() => { loadList(ruleKey); }, [ruleKey]);

  const save = async () => {
    if (!ruleKey || !question || options.some((o) => !o.trim())) {
      Alert.alert('Missing fields', 'Pick a rule, write the question and 4 options.');
      return;
    }
    setBusy(true);
    try {
      await api.adminCreateQuiz({
        rule_key: ruleKey,
        question: question.trim(),
        options: options.map((o) => o.trim()),
        correct_index: correct,
        explanation: explanation.trim(),
      });
      setQuestion('');
      setOptions(['', '', '', '']);
      setCorrect(0);
      setExplanation('');
      loadList(ruleKey);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setBusy(false);
    }
  };

  const del = async (id: string) => {
    try {
      await api.adminDeleteQuiz(id);
      loadList(ruleKey);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  return (
    <View style={{ gap: spacing.lg }}>
      <Card title="Existing quizzes">
        <View style={styles.chipRow}>
          {rules.map((r) => (
            <Pressable
              key={r.key}
              onPress={() => setRuleKey(r.key)}
              testID={`admin-quiz-rule-${r.key}`}
              style={[styles.chip, ruleKey === r.key && { borderColor: colors.accent, backgroundColor: 'rgba(234,179,8,0.08)' }]}
            >
              <Text style={[styles.chipText, ruleKey === r.key && { color: colors.textPrimary }]}>{r.name}</Text>
            </Pressable>
          ))}
        </View>
        <View style={{ height: spacing.sm }} />
        {list.length === 0 ? (
          <Text style={styles.muted}>No quizzes for this rule.</Text>
        ) : (
          list.map((q) => (
            <View key={q.id} style={styles.row} testID={`admin-quiz-${q.id}`}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle} numberOfLines={2}>{q.question}</Text>
                <Text style={styles.rowSub}>Correct: {q.options[q.correct_index]}</Text>
              </View>
              <Pressable onPress={() => del(q.id)} style={styles.deleteBtn} testID={`admin-quiz-delete-${q.id}`}>
                <Text style={styles.deleteText}>Delete</Text>
              </Pressable>
            </View>
          ))
        )}
      </Card>

      <Card title="Add a quiz">
        <Field label="Question" value={question} onChange={setQuestion} testID="admin-quiz-q" multiline />
        {options.map((o, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Pressable onPress={() => setCorrect(i)} testID={`admin-quiz-correct-${i}`} style={[styles.radio, correct === i && styles.radioOn]} />
            <View style={{ flex: 1 }}>
              <Field
                label={`Option ${i + 1}${correct === i ? ' (correct)' : ''}`}
                value={o}
                onChange={(v) => {
                  const next = [...options];
                  next[i] = v;
                  setOptions(next);
                }}
                testID={`admin-quiz-opt-${i}`}
              />
            </View>
          </View>
        ))}
        <Field label="Explanation" value={explanation} onChange={setExplanation} testID="admin-quiz-explain" multiline />
        <View style={{ height: spacing.sm }} />
        <Button label={busy ? 'Saving...' : 'Save quiz'} onPress={save} testID="admin-quiz-save" disabled={busy} fullWidth />
      </Card>
    </View>
  );
}

function UsersPanel() {
  const [users, setUsers] = useState<any[]>([]);
  useEffect(() => {
    api.adminUsers().then((r) => setUsers(r.users)).catch(() => {});
  }, []);
  return (
    <Card title={`Users (${users.length})`}>
      {users.length === 0 ? (
        <Text style={styles.muted}>No users.</Text>
      ) : (
        users.map((u) => (
          <View key={u.id} style={styles.row} testID={`admin-user-${u.id}`}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{u.name}</Text>
              <Text style={styles.rowSub}>
                {u.email || 'guest'} · {u.role}{u.is_guest ? ' (guest)' : ''} · ELO {u.elo}
              </Text>
            </View>
          </View>
        ))
      )}
    </Card>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      <View style={{ marginTop: spacing.md, gap: spacing.sm }}>{children}</View>
    </View>
  );
}

function Field({
  label,
  value,
  onChange,
  testID,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  testID?: string;
  multiline?: boolean;
}) {
  return (
    <View style={{ marginTop: spacing.xs }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        testID={testID}
        multiline={multiline}
        autoCapitalize="none"
        placeholderTextColor={colors.textMuted}
        style={[styles.input, multiline && { minHeight: 70, textAlignVertical: 'top' }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  h1: { color: colors.textPrimary, fontSize: 26, fontWeight: '900' },
  muted: { color: colors.textMuted, fontSize: 13 },
  header: { padding: spacing.xl, paddingBottom: spacing.md },
  backBtn: { paddingVertical: spacing.xs, alignSelf: 'flex-start' },
  backText: { color: colors.textSecondary, fontSize: 16, fontWeight: '600' },
  eyebrow: { color: colors.accent, fontSize: 11, fontWeight: '900', letterSpacing: 4, marginTop: spacing.sm },
  title: { color: colors.textPrimary, fontSize: 28, fontWeight: '900', marginTop: 2 },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  tab: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 8,
    borderRadius: radii.pill,
    borderColor: colors.border,
    borderWidth: 1,
    backgroundColor: colors.surface,
  },
  tabActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  tabText: { color: colors.textSecondary, fontWeight: '700', fontSize: 11, letterSpacing: 1 },
  tabTextActive: { color: '#0A0A0B' },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.lg,
  },
  cardTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '900', letterSpacing: 0.5 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  rowTitle: { color: colors.textPrimary, fontWeight: '700' },
  rowSub: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  swatch: { width: 14, height: 14, borderRadius: 4 },
  deleteBtn: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: radii.pill, borderColor: colors.danger, borderWidth: 1,
  },
  deleteText: { color: colors.danger, fontWeight: '700', fontSize: 12 },
  label: { color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  input: {
    backgroundColor: colors.elevated,
    borderColor: colors.border, borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md, paddingVertical: 10,
    color: colors.textPrimary, marginTop: 4, fontSize: 14,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md, paddingVertical: 6,
    borderRadius: radii.pill,
    borderColor: colors.border, borderWidth: 1,
    backgroundColor: colors.elevated,
  },
  chipText: { color: colors.textSecondary, fontWeight: '700', fontSize: 12 },
  radio: {
    width: 18, height: 18, borderRadius: 9,
    borderColor: colors.border, borderWidth: 2,
    backgroundColor: colors.elevated,
  },
  radioOn: { borderColor: colors.accent, backgroundColor: colors.accent },
});
