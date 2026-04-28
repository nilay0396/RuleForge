import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Dimensions,
  Modal,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../src/api';
import { colors, radii, ruleColors, spacing } from '../src/theme';
import Button from '../src/components/Button';
import Chessboard from '../src/components/Chessboard';
import { RuleChess, RuleKey, SquareName, LegalTarget } from '../src/engine';
import { playSound } from '../src/sound';

type Scenario = {
  id: string;
  title: string;
  rule_key: string;
  fen: string;
  expected_uci: string; // 'e2e4' or 'swap:a1b1'
  expected_type: 'normal' | 'dash' | 'sideways' | 'swap';
  hint: string;
  explanation: string;
};

export default function RuleLearn() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const router = useRouter();
  const [rule, setRule] = useState<any>(null);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loading, setLoading] = useState(true);

  const [idx, setIdx] = useState(0);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [showHint, setShowHint] = useState(false);
  const [solved, setSolved] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Engine state for the current scenario
  const rcRef = useRef<RuleChess | null>(null);
  const [tick, setTick] = useState(0);
  const bump = () => setTick((t) => t + 1);
  const [selected, setSelected] = useState<SquareName | null>(null);
  const [legalTargets, setLegalTargets] = useState<LegalTarget[]>([]);
  const [swapFirst, setSwapFirst] = useState<SquareName | null>(null);
  const [showCompleteModal, setShowCompleteModal] = useState(false);

  const ruleKey = (key as RuleKey) || 'classic';
  const accent = ruleColors[ruleKey] || colors.accent;
  const scenario = scenarios[idx];

  useEffect(() => {
    if (!key) return;
    (async () => {
      try {
        const [rRes, sRes] = await Promise.all([api.rule(key), api.scenarios(key)]);
        setRule(rRes.rule);
        setScenarios(sRes.scenarios as Scenario[]);
      } catch {}
      setLoading(false);
    })();
  }, [key]);

  // Reset scenario state when scenario changes
  useEffect(() => {
    if (!scenario) return;
    rcRef.current = new RuleChess(ruleKey, scenario.fen);
    setSelected(null);
    setLegalTargets([]);
    setSwapFirst(null);
    setSolved(false);
    setShowHint(false);
    setErrorMsg(null);
    bump();
  }, [scenario, ruleKey]);

  const dim = Dimensions.get('window');
  const boardSize = Math.min(dim.width - 32, 460);

  const expected = useMemo(() => {
    if (!scenario) return null;
    if (scenario.expected_type === 'swap') {
      const m = scenario.expected_uci.match(/^swap:([a-h][1-8])([a-h][1-8])$/);
      if (!m) return null;
      return { kind: 'swap' as const, s1: m[1] as SquareName, s2: m[2] as SquareName };
    }
    return {
      kind: 'move' as const,
      from: scenario.expected_uci.slice(0, 2) as SquareName,
      to: scenario.expected_uci.slice(2, 4) as SquareName,
    };
  }, [scenario]);

  const checkSolution = (from: SquareName, to: SquareName) => {
    if (!expected || expected.kind !== 'move') return false;
    return expected.from === from && expected.to === to;
  };

  const onSquarePress = (sq: SquareName) => {
    if (!rcRef.current || !scenario || solved) return;
    const rc = rcRef.current;

    if (scenario.expected_type === 'swap') {
      const piece = rc.pieceAt(sq);
      if (!piece || piece.color !== 'w' || piece.type === 'k') {
        if (swapFirst === sq) setSwapFirst(null);
        return;
      }
      if (!swapFirst) {
        setSwapFirst(sq);
        return;
      }
      if (swapFirst === sq) {
        setSwapFirst(null);
        return;
      }
      // Try the swap
      if (expected && expected.kind === 'swap' && (
        (expected.s1 === swapFirst && expected.s2 === sq) ||
        (expected.s1 === sq && expected.s2 === swapFirst)
      )) {
        rc.swap(swapFirst, sq);
        markSolved();
      } else {
        setErrorMsg('Not the right swap. Re-read the hint and try again.');
        setShowHint(true);
        setSwapFirst(null);
      }
      return;
    }

    if (selected) {
      const target = legalTargets.find((t) => t.to === sq);
      if (target) {
        // Validate intent
        if (checkSolution(selected, sq) && (target.type === scenario.expected_type || (scenario.expected_type === 'normal' && target.type === 'normal'))) {
          rc.move(selected, sq, { promotion: target.promotion });
          markSolved();
          return;
        }
        // Wrong move — revert: do not apply, prompt hint
        setErrorMsg('That isn\u2019t the move we\u2019re looking for. Try again — peek at the hint if needed.');
        setShowHint(true);
        setSelected(null);
        setLegalTargets([]);
        return;
      }
      const piece = rc.pieceAt(sq);
      if (piece && piece.color === 'w') {
        setSelected(sq);
        setLegalTargets(rc.legalTargets(sq));
        return;
      }
      setSelected(null);
      setLegalTargets([]);
      return;
    }
    const piece = rc.pieceAt(sq);
    if (piece && piece.color === 'w') {
      setSelected(sq);
      setLegalTargets(rc.legalTargets(sq));
    }
  };

  const markSolved = () => {
    setSolved(true);
    setShowHint(false);
    setErrorMsg(null);
    setSelected(null);
    setLegalTargets([]);
    setSwapFirst(null);
    playSound('move');
    setCompleted((c) => {
      const n = new Set(c);
      if (scenario) n.add(scenario.id);
      return n;
    });
    bump();
  };

  const next = () => {
    if (idx < scenarios.length - 1) {
      setIdx((i) => i + 1);
    } else {
      setShowCompleteModal(true);
    }
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
        <Pressable onPress={() => router.back()} style={styles.backBtn} testID="rule-back">
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>

        <Text style={[styles.eyebrow, { color: accent }]}>
          {ruleKey.toUpperCase().replace('_', ' ')}
        </Text>
        <Text style={styles.title}>{rule?.name}</Text>
        <Text style={styles.subtitle}>{rule?.description}</Text>

        <View style={[styles.card, { borderColor: accent }]}>
          <Text style={styles.h3}>How it works</Text>
          <Text style={styles.body}>{rule?.long_explanation}</Text>
        </View>

        {scenarios.length === 0 ? (
          <View style={[styles.card, { marginTop: spacing.lg }]}>
            <Text style={styles.h3}>No interactive lessons yet</Text>
            <Text style={styles.body}>This rule does not have guided scenarios — start a game to practice instead.</Text>
            <View style={{ height: spacing.md }} />
            <Button label={`Play with ${rule?.name || 'this rule'}`} onPress={() => router.replace({ pathname: '/play', params: { rule: ruleKey, ai: '2' } })} fullWidth testID="rule-play" />
          </View>
        ) : (
          <View style={{ marginTop: spacing.lg }}>
            {/* Progress dots */}
            <View style={styles.dots}>
              {scenarios.map((s, i) => (
                <View
                  key={s.id}
                  style={[
                    styles.dot,
                    i === idx && { backgroundColor: accent, transform: [{ scale: 1.15 }] },
                    completed.has(s.id) && { backgroundColor: colors.success },
                  ]}
                />
              ))}
            </View>
            <Text style={[styles.eyebrow, { color: accent, marginTop: spacing.lg }]}>
              SCENARIO {idx + 1} OF {scenarios.length}
            </Text>
            <Text style={styles.scenarioTitle} testID="scenario-title">{scenario?.title}</Text>

            <View style={styles.boardWrap}>
              {rcRef.current ? (
                <Chessboard
                  rc={rcRef.current}
                  orientation="w"
                  selected={selected}
                  targets={legalTargets}
                  swapFirst={swapFirst}
                  size={boardSize}
                  onSquarePress={onSquarePress}
                />
              ) : null}
            </View>

            {!solved ? (
              <View style={styles.promptCard}>
                <Text style={styles.promptText}>
                  {scenario.expected_type === 'swap'
                    ? 'Tap two of your pieces to perform the correct Swap.'
                    : 'Find the correct move on the board.'}
                </Text>
                {errorMsg ? <Text style={[styles.bodyDanger]} testID="scenario-error">{errorMsg}</Text> : null}
                {showHint ? (
                  <View style={styles.hintBox} testID="scenario-hint">
                    <Text style={[styles.eyebrow, { color: accent }]}>HINT</Text>
                    <Text style={styles.body}>{scenario.hint}</Text>
                  </View>
                ) : null}
                <View style={{ height: spacing.md }} />
                <Pressable onPress={() => setShowHint((s) => !s)} style={styles.linkBtn} testID="scenario-hint-toggle">
                  <Text style={styles.linkText}>{showHint ? 'Hide hint' : 'Show hint'}</Text>
                </Pressable>
              </View>
            ) : (
              <View style={[styles.promptCard, { borderColor: colors.success }]}>
                <Text style={[styles.eyebrow, { color: colors.success }]}>CORRECT</Text>
                <Text style={styles.scenarioDone} testID="scenario-explain">{scenario.explanation}</Text>
                <View style={{ height: spacing.md }} />
                <Button
                  label={idx === scenarios.length - 1 ? 'Finish lesson' : 'Next scenario'}
                  testID="scenario-next"
                  onPress={next}
                  fullWidth
                />
              </View>
            )}
          </View>
        )}

        <View style={{ height: spacing.xl }} />
        {scenarios.length > 0 && (
          <Button
            label={`Play with ${rule?.name || ruleKey}`}
            testID="rule-play"
            onPress={() => router.replace({ pathname: '/play', params: { rule: ruleKey, ai: '2' } })}
            variant="secondary"
            fullWidth
          />
        )}
      </ScrollView>

      <Modal visible={showCompleteModal} transparent animationType="fade">
        <View style={modalStyles.scrim}>
          <View style={modalStyles.card}>
            <Text style={[modalStyles.eyebrow, { color: accent }]}>LESSON COMPLETE</Text>
            <Text style={modalStyles.title}>You&apos;ve mastered the basics!</Text>
            <Text style={modalStyles.body}>
              {completed.size} of {scenarios.length} scenarios solved. Time to put it into practice.
            </Text>
            <View style={{ height: spacing.lg }} />
            <Button
              label={`Play with ${rule?.name}`}
              testID="lesson-play"
              onPress={() => {
                setShowCompleteModal(false);
                router.replace({ pathname: '/play', params: { rule: ruleKey, ai: '2' } });
              }}
              fullWidth
            />
            <View style={{ height: spacing.sm }} />
            <Button
              label="Back to home"
              variant="secondary"
              testID="lesson-home"
              onPress={() => {
                setShowCompleteModal(false);
                router.replace('/home');
              }}
              fullWidth
            />
          </View>
        </View>
      </Modal>
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
  h3: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  body: { color: colors.textSecondary, marginTop: spacing.sm, lineHeight: 22 },
  bodyDanger: { color: colors.danger, marginTop: spacing.sm, fontWeight: '700' },
  dots: { flexDirection: 'row', gap: 6, marginTop: spacing.lg },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  scenarioTitle: { color: colors.textPrimary, fontSize: 22, fontWeight: '900', marginTop: 4 },
  boardWrap: { alignItems: 'center', justifyContent: 'center', marginTop: spacing.lg },
  promptCard: {
    marginTop: spacing.lg,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.lg,
  },
  promptText: { color: colors.textPrimary, fontSize: 14, fontWeight: '700' },
  hintBox: {
    marginTop: spacing.md,
    backgroundColor: 'rgba(234,179,8,0.08)',
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
    padding: spacing.md,
    borderRadius: radii.sm,
  },
  scenarioDone: { color: colors.textPrimary, marginTop: spacing.sm, lineHeight: 22 },
  linkBtn: { paddingVertical: spacing.xs, alignSelf: 'flex-start' },
  linkText: { color: colors.textSecondary, fontWeight: '700' },
});

const modalStyles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.xl,
    padding: spacing.xl,
  },
  eyebrow: { fontSize: 11, fontWeight: '900', letterSpacing: 4 },
  title: { color: colors.textPrimary, fontSize: 24, fontWeight: '900', marginTop: spacing.xs },
  body: { color: colors.textSecondary, marginTop: spacing.sm },
});
