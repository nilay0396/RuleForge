import { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radii, spacing } from '../src/theme';
import Button from '../src/components/Button';

type Lesson = {
  id: string;
  tier: string;
  title: string;
  goal: string;
  guide: string[];
  quiz: {
    question: string;
    options: string[];
    answer: number;
    explain: string;
  };
};

const LESSONS: Lesson[] = [
  {
    id: 'board-basics',
    tier: 'Beginner',
    title: 'Board, turns, and check',
    goal: 'Understand the board, piece colors, and what check means.',
    guide: [
      'White moves first, then players alternate one move at a time.',
      'A king is in check when an enemy piece attacks its square.',
      'You may never make a move that leaves your own king in check.',
    ],
    quiz: {
      question: 'What must you do when your king is in check?',
      options: ['Ignore it and attack', 'Make a legal move that removes check', 'Move any pawn'],
      answer: 1,
      explain: 'Every legal reply must make the king safe: move the king, block, or capture the attacker.',
    },
  },
  {
    id: 'piece-power',
    tier: 'Beginner',
    title: 'Piece value and trades',
    goal: 'Learn when captures are good and when they lose material.',
    guide: [
      'A common value scale is pawn 1, knight 3, bishop 3, rook 5, queen 9.',
      'Winning a rook for a bishop is usually good because you gain about two pawns of value.',
      'Do not capture automatically. Check whether your piece can be recaptured.',
    ],
    quiz: {
      question: 'Which trade is usually best for you?',
      options: ['Your queen for a rook', 'Your bishop for a rook', 'Your rook for a pawn'],
      answer: 1,
      explain: 'A bishop is worth about 3 and a rook about 5, so winning a rook for a bishop gains material.',
    },
  },
  {
    id: 'opening-principles',
    tier: 'Intermediate',
    title: 'Opening priorities',
    goal: 'Reach playable positions without memorizing long lines.',
    guide: [
      'Fight for the center with pawns and pieces.',
      'Develop knights and bishops before moving the same piece repeatedly.',
      'Castle early when the center can open.',
    ],
    quiz: {
      question: 'Which opening plan is most reliable?',
      options: ['Develop pieces and castle', 'Move the queen out on move two', 'Push only rook pawns'],
      answer: 0,
      explain: 'Development and king safety matter more than early queen attacks against solid defense.',
    },
  },
  {
    id: 'tactics',
    tier: 'Advanced',
    title: 'Tactics: forks, pins, skewers',
    goal: 'Spot forcing moves before choosing quiet moves.',
    guide: [
      'Checks, captures, and threats are forcing moves. Scan them first.',
      'A fork attacks two targets at once. Knights are especially strong for forks.',
      'A pin makes a defender unable or unwilling to move because a stronger piece sits behind it.',
    ],
    quiz: {
      question: 'What should you calculate first in a sharp position?',
      options: ['Random quiet moves', 'Checks, captures, and threats', 'Only pawn moves'],
      answer: 1,
      explain: 'Forcing moves limit the opponent replies and reveal tactics faster.',
    },
  },
  {
    id: 'endgames',
    tier: 'Expert',
    title: 'Winning endgames',
    goal: 'Convert advantages and save worse positions.',
    guide: [
      'Activate your king when queens are gone and mating danger is lower.',
      'Passed pawns become stronger as pieces leave the board.',
      'Rooks belong behind passed pawns, both when attacking and defending.',
    ],
    quiz: {
      question: 'In most endgames, what should your king do?',
      options: ['Hide forever', 'Become an active fighting piece', 'Stay on the back rank'],
      answer: 1,
      explain: 'The king is a powerful short-range piece in endgames and should support pawns and pieces.',
    },
  },
  {
    id: 'master-thinking',
    tier: 'Grandmaster',
    title: 'Candidate moves and plans',
    goal: 'Think like a strong player: compare plans, not just moves.',
    guide: [
      'List candidate moves before calculating deeply.',
      'Compare the opponent threats, your forcing moves, and long-term pawn breaks.',
      'After choosing a move, do a final blunder check: what can the opponent capture or check?',
    ],
    quiz: {
      question: 'What is the final check before you play a move?',
      options: ['Whether it looks stylish', 'Whether the opponent has a strong check, capture, or threat', 'Whether it uses the queen'],
      answer: 1,
      explain: 'A final opponent-threat scan catches one-move blunders before they happen.',
    },
  },
];

export default function Learn() {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(LESSONS[0].id);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const selected = useMemo(
    () => LESSONS.find((lesson) => lesson.id === selectedId) || LESSONS[0],
    [selectedId],
  );
  const answered = answers[selected.id];
  const isCorrect = answered === selected.quiz.answer;
  const completed = LESSONS.filter((lesson) => answers[lesson.id] === lesson.quiz.answer).length;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="learn-back">
          <Text style={styles.iconText}>‹</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>LEARN</Text>
          <Text style={styles.title}>Chess training path</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.progressCard}>
          <Text style={styles.progressLabel}>PATH PROGRESS</Text>
          <Text style={styles.progressTitle}>
            {completed}/{LESSONS.length} quizzes passed
          </Text>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.round((completed / LESSONS.length) * 100)}%` }]} />
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.lessonRail}>
          {LESSONS.map((lesson) => {
            const active = lesson.id === selected.id;
            const done = answers[lesson.id] === lesson.quiz.answer;
            return (
              <Pressable
                key={lesson.id}
                testID={`learn-lesson-${lesson.id}`}
                onPress={() => setSelectedId(lesson.id)}
                style={[styles.lessonTab, active && styles.lessonTabActive, done && styles.lessonTabDone]}
              >
                <Text style={[styles.lessonTier, active && { color: colors.accent }]}>{lesson.tier}</Text>
                <Text style={styles.lessonTabTitle} numberOfLines={2}>{lesson.title}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.lessonCard}>
          <Text style={styles.lessonEyebrow}>{selected.tier}</Text>
          <Text style={styles.lessonTitle}>{selected.title}</Text>
          <Text style={styles.goal}>{selected.goal}</Text>
          <View style={styles.guideList}>
            {selected.guide.map((item, index) => (
              <View key={item} style={styles.guideRow}>
                <View style={styles.stepDot}>
                  <Text style={styles.stepDotText}>{index + 1}</Text>
                </View>
                <Text style={styles.guideText}>{item}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.quizCard}>
          <Text style={styles.quizEyebrow}>QUIZ</Text>
          <Text style={styles.quizQuestion}>{selected.quiz.question}</Text>
          <View style={styles.optionList}>
            {selected.quiz.options.map((option, index) => {
              const picked = answered === index;
              const reveal = answered != null;
              const correct = selected.quiz.answer === index;
              return (
                <Pressable
                  key={option}
                  testID={`learn-answer-${index}`}
                  onPress={() => setAnswers((prev) => ({ ...prev, [selected.id]: index }))}
                  style={[
                    styles.option,
                    picked && styles.optionPicked,
                    reveal && correct && styles.optionCorrect,
                    reveal && picked && !correct && styles.optionWrong,
                  ]}
                >
                  <Text style={styles.optionText}>{option}</Text>
                </Pressable>
              );
            })}
          </View>
          {answered != null ? (
            <View style={styles.feedback}>
              <Text style={[styles.feedbackTitle, { color: isCorrect ? colors.success : colors.danger }]}>
                {isCorrect ? 'Correct' : 'Try this one again'}
              </Text>
              <Text style={styles.feedbackText}>{selected.quiz.explain}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.actions}>
          <Button
            label="Practice with puzzles"
            testID="learn-puzzles"
            onPress={() => router.push({ pathname: '/puzzle', params: { mode: 'random' } })}
            fullWidth
          />
          <View style={{ height: spacing.sm }} />
          <Button
            label="Play against AI"
            testID="learn-play-ai"
            variant="secondary"
            onPress={() => router.push({ pathname: '/play', params: { rule: 'classic', ai: '3' } })}
            fullWidth
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
  },
  iconText: { color: colors.textPrimary, fontSize: 22, fontWeight: '900' },
  eyebrow: { color: colors.accent, fontSize: 11, fontWeight: '900', letterSpacing: 4 },
  title: { color: colors.textPrimary, fontSize: 22, fontWeight: '900', marginTop: 2 },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  progressCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.lg,
  },
  progressLabel: { color: colors.textMuted, fontSize: 10, fontWeight: '900', letterSpacing: 3 },
  progressTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: '900', marginTop: 4 },
  track: {
    marginTop: spacing.md,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.elevated,
    overflow: 'hidden',
  },
  fill: { height: '100%', backgroundColor: colors.accent },
  lessonRail: { gap: spacing.sm, paddingVertical: spacing.lg },
  lessonTab: {
    width: 150,
    minHeight: 86,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  lessonTabActive: { borderColor: colors.accent },
  lessonTabDone: { backgroundColor: 'rgba(34,197,94,0.08)' },
  lessonTier: { color: colors.textMuted, fontSize: 10, fontWeight: '900', letterSpacing: 2 },
  lessonTabTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: '800', marginTop: 5 },
  lessonCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.lg,
  },
  lessonEyebrow: { color: colors.accent, fontSize: 11, fontWeight: '900', letterSpacing: 3 },
  lessonTitle: { color: colors.textPrimary, fontSize: 23, fontWeight: '900', marginTop: 4 },
  goal: { color: colors.textSecondary, lineHeight: 21, marginTop: spacing.sm },
  guideList: { marginTop: spacing.lg, gap: spacing.md },
  guideRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  stepDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.elevated,
    borderColor: colors.border,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotText: { color: colors.accent, fontSize: 12, fontWeight: '900' },
  guideText: { flex: 1, color: colors.textPrimary, lineHeight: 21 },
  quizCard: {
    marginTop: spacing.lg,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.lg,
  },
  quizEyebrow: { color: colors.info, fontSize: 11, fontWeight: '900', letterSpacing: 3 },
  quizQuestion: { color: colors.textPrimary, fontSize: 18, fontWeight: '900', marginTop: spacing.sm },
  optionList: { marginTop: spacing.md, gap: spacing.sm },
  option: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.md,
    backgroundColor: colors.elevated,
    padding: spacing.md,
  },
  optionPicked: { borderColor: colors.accent },
  optionCorrect: { borderColor: colors.success, backgroundColor: 'rgba(34,197,94,0.08)' },
  optionWrong: { borderColor: colors.danger, backgroundColor: 'rgba(239,68,68,0.08)' },
  optionText: { color: colors.textPrimary, fontWeight: '700' },
  feedback: { marginTop: spacing.md, borderTopColor: colors.border, borderTopWidth: 1, paddingTop: spacing.md },
  feedbackTitle: { fontSize: 13, fontWeight: '900', textTransform: 'uppercase' },
  feedbackText: { color: colors.textSecondary, lineHeight: 20, marginTop: 4 },
  actions: { marginTop: spacing.lg },
});
