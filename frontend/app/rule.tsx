import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../src/api';
import { colors, radii, ruleColors, spacing } from '../src/theme';
import Button from '../src/components/Button';

export default function RuleLearn() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const router = useRouter();
  const [data, setData] = useState<{ rule: any; quizzes: any[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [quizIdx, setQuizIdx] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);

  useEffect(() => {
    if (!key) return;
    (async () => {
      try {
        const r = await api.rule(key);
        setData(r);
      } catch {}
      setLoading(false);
    })();
  }, [key]);

  if (loading || !data) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>
      </SafeAreaView>
    );
  }
  const { rule, quizzes } = data;
  const accent = ruleColors[rule.key] || colors.accent;
  const quiz = quizzes[quizIdx];
  const quizDone = quizIdx >= quizzes.length;

  const submit = (i: number) => {
    if (picked != null) return;
    setPicked(i);
    if (i === quiz.correct_index) setScore((s) => s + 1);
  };
  const next = () => {
    setPicked(null);
    setQuizIdx((i) => i + 1);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} testID="rule-back">
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>

        <Text style={[styles.eyebrow, { color: accent }]}>
          {rule.key.toUpperCase().replace('_', ' ')}
        </Text>
        <Text style={styles.title}>{rule.name}</Text>
        <Text style={styles.subtitle}>{rule.description}</Text>

        <View style={[styles.card, { borderColor: accent }]}>
          <Text style={styles.h3}>How it works</Text>
          <Text style={styles.body}>{rule.long_explanation}</Text>
          {(rule.examples || []).length > 0 && (
            <View style={{ marginTop: spacing.lg }}>
              <Text style={styles.h3}>Tactical tips</Text>
              {(rule.examples as string[]).map((ex, i) => (
                <Text key={i} style={styles.bullet}>
                  •  {ex}
                </Text>
              ))}
            </View>
          )}
        </View>

        {quizzes.length > 0 && (
          <View style={[styles.card, { borderColor: colors.border, marginTop: spacing.lg }]}>
            <Text style={[styles.eyebrow, { color: accent }]}>QUIZ</Text>
            <Text style={styles.h2}>Test your understanding</Text>
            <Text style={styles.quizMeta}>
              {Math.min(quizIdx + 1, quizzes.length)} / {quizzes.length} · score {score}
            </Text>
            {!quizDone ? (
              <View style={{ marginTop: spacing.lg }}>
                <Text style={styles.question} testID={`quiz-q-${quizIdx}`}>{quiz.question}</Text>
                <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
                  {(quiz.options as string[]).map((opt, i) => {
                    const isCorrect = i === quiz.correct_index;
                    const isPicked = picked === i;
                    const showColor =
                      picked == null
                        ? colors.border
                        : isCorrect
                        ? colors.success
                        : isPicked
                        ? colors.danger
                        : colors.border;
                    return (
                      <Pressable
                        key={i}
                        onPress={() => submit(i)}
                        disabled={picked != null}
                        style={[styles.option, { borderColor: showColor }]}
                        testID={`quiz-opt-${i}`}
                      >
                        <Text style={styles.optionText}>{opt}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                {picked != null && (
                  <View style={{ marginTop: spacing.md }}>
                    <Text
                      style={[
                        styles.explain,
                        { color: picked === quiz.correct_index ? colors.success : colors.danger },
                      ]}
                    >
                      {picked === quiz.correct_index ? '✓ Correct.' : '✗ Not quite.'}
                    </Text>
                    <Text style={styles.explainBody}>{quiz.explanation}</Text>
                    <View style={{ height: spacing.md }} />
                    <Button
                      label={quizIdx === quizzes.length - 1 ? 'Finish' : 'Next'}
                      testID="quiz-next"
                      onPress={next}
                      fullWidth
                    />
                  </View>
                )}
              </View>
            ) : (
              <View style={{ marginTop: spacing.lg }}>
                <Text style={styles.h2}>Quiz complete!</Text>
                <Text style={styles.body}>
                  You scored {score} of {quizzes.length}.
                </Text>
              </View>
            )}
          </View>
        )}

        <View style={{ height: spacing.xl }} />
        <Button
          label={`Play with ${rule.name}`}
          testID="rule-play"
          onPress={() =>
            router.replace({
              pathname: '/play',
              params: { rule: rule.key, ai: '2' },
            })
          }
          fullWidth
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: spacing.xl, paddingBottom: spacing.xxl },
  backBtn: { paddingVertical: spacing.xs, alignSelf: 'flex-start' },
  backText: { color: colors.textSecondary, fontSize: 16, fontWeight: '600' },
  eyebrow: { fontSize: 11, fontWeight: '900', letterSpacing: 4, marginTop: spacing.lg },
  title: { color: colors.textPrimary, fontSize: 32, fontWeight: '900', marginTop: 4 },
  subtitle: { color: colors.textSecondary, fontSize: 15, marginTop: spacing.sm },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.xl,
    marginTop: spacing.xl,
  },
  h3: { color: colors.textPrimary, fontSize: 14, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase' },
  h2: { color: colors.textPrimary, fontSize: 18, fontWeight: '800', marginTop: 4 },
  body: { color: colors.textSecondary, marginTop: spacing.sm, lineHeight: 22 },
  bullet: { color: colors.textSecondary, marginTop: 4, lineHeight: 22 },
  quizMeta: { color: colors.textMuted, fontSize: 12, marginTop: 4 },
  question: { color: colors.textPrimary, fontSize: 16, fontWeight: '700' },
  option: {
    borderWidth: 1,
    borderRadius: radii.md,
    paddingVertical: 12,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.elevated,
  },
  optionText: { color: colors.textPrimary, fontSize: 14 },
  explain: { fontWeight: '900', fontSize: 14 },
  explainBody: { color: colors.textSecondary, marginTop: 4 },
});
