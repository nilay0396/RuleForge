import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  RefreshControl,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../src/auth';
import { api } from '../../src/api';
import { realtime } from '../../src/ws';
import { colors, radii, ruleColors, spacing } from '../../src/theme';
import Button from '../../src/components/Button';
import { AI_PROFILES, AIProfile } from '../../src/ai';

export default function Home() {
  const { user, refresh } = useAuth();
  const router = useRouter();
  const [rules, setRules] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [unread, setUnread] = useState(0);
  const [onlineCount, setOnlineCount] = useState(0);
  const [dailyPuzzle, setDailyPuzzle] = useState<{ puzzle: any; completed: boolean } | null>(null);
  const [showReward, setShowReward] = useState(false);
  const [rewardResult, setRewardResult] = useState<any>(null);
  const [claiming, setClaiming] = useState(false);

  const loadNotifs = useCallback(async () => {
    try {
      const r = await api.notifications();
      setUnread(r.unread || 0);
    } catch {}
  }, []);
  const loadOnline = useCallback(async () => {
    try {
      const r = await api.online();
      setOnlineCount((r.online || []).filter((o: any) => o.id !== user?.id).length);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const loadDailyPuzzle = useCallback(async () => {
    try {
      const r = await api.puzzleDaily();
      setDailyPuzzle({ puzzle: r.puzzle, completed: r.completed });
    } catch {}
  }, []);

  // Auto-show reward popup once per session
  useEffect(() => {
    if (user?.daily_reward_available && !rewardResult) setShowReward(true);
  }, [user?.daily_reward_available, rewardResult]);

  const claimReward = async () => {
    setClaiming(true);
    try {
      const r = await api.claimReward();
      if (r.user) { /* rely on refresh */ }
      setRewardResult(r);
      await refresh();
    } finally {
      setClaiming(false);
    }
  };

  const load = useCallback(async () => {
    try {
      const r = await api.rules();
      setRules(r.rules);
    } catch (e) {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      refresh();
      loadNotifs();
      loadOnline();
      loadDailyPuzzle();
    }, [load, refresh, loadNotifs, loadOnline, loadDailyPuzzle]),
  );

  // Global realtime listeners (unread counter, redirect into incoming match, online count)
  useEffect(() => {
    realtime.connect();
    const off = realtime.on((m) => {
      if (m.type === 'notification') {
        setUnread((u) => u + 1);
      } else if (m.type === 'presence') {
        setOnlineCount((m.online || []).filter((o: any) => o.id !== user?.id).length);
      } else if (m.type === 'match_found') {
        router.push({ pathname: '/play_online', params: { game_id: m.game_id } });
      }
    });
    return () => off();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([load(), refresh(), loadNotifs(), loadOnline()]);
    setRefreshing(false);
  };

  const ruleByKey: Record<string, any> = {};
  rules.forEach((r) => (ruleByKey[r.key] = r));

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }
      >
        {/* Top bar */}
        <View style={styles.topbar}>
          <View>
            <Text style={styles.eyebrow}>WELCOME</Text>
            <Text style={styles.hello} testID="home-hello">
              {user?.name || 'Player'}
            </Text>
          </View>
          <View style={styles.statsRow}>
            <Stat label="ELO" value={user?.elo ?? 800} testID="home-elo" />
            <Stat label="XP" value={user?.xp ?? 0} testID="home-xp" />
            <Stat label="COINS" value={user?.coins ?? 0} testID="home-coins" />
          </View>
        </View>

        {/* Level + login streak strip */}
        <View style={styles.retentionStrip} testID="home-retention-strip">
          <View style={styles.levelBlock}>
            <View style={styles.levelHeader}>
              <Text style={styles.levelChip} testID="home-level-chip">
                LV {user?.level ?? 1}
              </Text>
              <Text style={styles.levelXp} testID="home-level-xp">
                {(user?.level_progress ?? 0)}/{(user?.level_needed ?? 200)} XP
              </Text>
            </View>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${Math.min(
                      100,
                      Math.round(((user?.level_progress ?? 0) / Math.max(1, user?.level_needed ?? 1)) * 100),
                    )}%`,
                  },
                ]}
              />
            </View>
          </View>
          <Pressable
            onPress={() => user?.daily_reward_available && setShowReward(true)}
            style={[
              styles.streakChip,
              user?.daily_reward_available && { borderColor: colors.accent, backgroundColor: 'rgba(234,179,8,0.08)' },
            ]}
            testID="home-streak-chip"
          >
            <Text style={styles.streakFlame}>🔥</Text>
            <View>
              <Text style={styles.streakValue}>{user?.login_streak ?? 0}</Text>
              <Text style={styles.streakLabel}>
                {user?.daily_reward_available ? 'CLAIM' : 'DAY STREAK'}
              </Text>
            </View>
          </Pressable>
        </View>

        {/* Hero */}
        {/* Play Online hero */}
        <Pressable
          testID="home-play-online"
          onPress={() => router.push('/online')}
          style={[styles.hero, { borderColor: colors.accent, marginTop: spacing.xl }]}
        >
          <View style={styles.heroLeft}>
            <Text style={styles.heroEyebrow}>PLAY ONLINE · LIVE</Text>
            <Text style={styles.heroTitle}>Live{'\n'}Multiplayer</Text>
            <Text style={styles.heroSub}>{onlineCount} player{onlineCount === 1 ? '' : 's'} online · matched by ELO</Text>
          </View>
          <View style={styles.heroBoardSet}>
            <Text style={styles.heroPiece}>♞</Text>
            <Text style={styles.heroPiece}>♝</Text>
            <Text style={[styles.heroPiece, { color: colors.accent }]}>♛</Text>
          </View>
        </Pressable>


        <Pressable
          testID="home-quickplay"
          onPress={() =>
            router.push({ pathname: '/play', params: { rule: 'classic', ai: '3' } })
          }
          style={styles.hero}
        >
          <View style={styles.heroLeft}>
            <Text style={styles.heroEyebrow}>QUICK PLAY</Text>
            <Text style={styles.heroTitle}>Play{'\n'}Classic Chess</Text>
            <Text style={styles.heroSub}>vs Rook · Club level</Text>
          </View>
          <View style={styles.heroBoardSet}>
            <Text style={styles.heroPiece}>♜</Text>
            <Text style={styles.heroPiece}>♞</Text>
            <Text style={styles.heroPiece}>♝</Text>
            <Text style={[styles.heroPiece, { color: colors.accent }]}>♛</Text>
            <Text style={[styles.heroPiece, { color: colors.accent }]}>♚</Text>
          </View>
        </Pressable>

        <Section title="AI Opponents" subtitle="Pick a bot level and train at your pace.">
          <View style={styles.aiGrid}>
            {(Object.values(AI_PROFILES) as AIProfile[]).map((profile) => (
              <Pressable
                key={profile.level}
                testID={`home-ai-level-${profile.level}`}
                onPress={() =>
                  router.push({
                    pathname: '/play',
                    params: { rule: 'classic', ai: String(profile.level) },
                  })
                }
                style={styles.aiCard}
              >
                <View style={styles.aiAvatar}>
                  <Text style={styles.aiAvatarText}>{profile.avatar}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.aiName}>{profile.name}</Text>
                  <Text style={styles.aiMeta}>
                    L{profile.level} · {profile.title} · {profile.rating}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        </Section>

        <Section title="Puzzles" subtitle="Sharpen your tactics every day.">
          <Pressable
            testID="home-daily-puzzle-card"
            onPress={() =>
              router.push({ pathname: '/puzzle', params: { mode: 'daily' } })
            }
            style={[
              styles.puzzleHero,
              dailyPuzzle?.completed && { borderColor: colors.success },
            ]}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.puzzleEyebrow}>
                {dailyPuzzle?.completed ? 'DAILY · COMPLETED' : 'DAILY PUZZLE'}
              </Text>
              <Text style={styles.puzzleTitle}>
                {dailyPuzzle?.puzzle?.title || 'Today\u2019s tactical brain teaser'}
              </Text>
              <Text style={styles.puzzleSub}>
                {dailyPuzzle?.completed
                  ? 'Solved! Come back tomorrow.'
                  : `+25 XP · +10 coins · rated ${dailyPuzzle?.puzzle?.rating ?? '—'}`}
              </Text>
            </View>
            <View style={styles.puzzleIcon}>
              <Text style={{ fontSize: 28 }}>{dailyPuzzle?.completed ? '✓' : '♟'}</Text>
            </View>
          </Pressable>
          <Pressable
            testID="home-random-puzzle-card"
            onPress={() => router.push({ pathname: '/puzzle', params: { mode: 'random' } })}
            style={styles.smallCard}
          >
            <Text style={styles.smallCardEyebrow}>TRAINING</Text>
            <Text style={styles.smallCardTitle}>Random puzzle</Text>
            <Text style={styles.smallCardSub}>
              Puzzle rating · {user?.puzzle_rating ?? 800}
            </Text>
          </Pressable>
        </Section>

        <Section title="Rule Variants" subtitle="Classic chess, with a delightful twist.">
          {rules
            .filter((r) => r.key !== 'classic')
            .map((rule) => (
              <RuleCard
                key={rule.key}
                rule={rule}
                onPlay={() =>
                  router.push({ pathname: '/play', params: { rule: rule.key, ai: '2' } })
                }
                onLearn={() =>
                  router.push({ pathname: '/rule', params: { key: rule.key } })
                }
              />
            ))}
        </Section>

        <Section title="More" subtitle="Daily challenges, leaderboard and learn.">
          <Pressable
            testID="home-couples-game-card"
            onPress={() => router.push('/couples-game')}
            style={[styles.smallCard, { borderColor: colors.danger }]}
          >
            <Text style={[styles.smallCardEyebrow, { color: colors.danger }]}>PARTY GAME</Text>
            <Text style={styles.smallCardTitle}>Never Have I Ever 💞</Text>
            <Text style={styles.smallCardSub}>Impromptu couples game · fresh 10 cards each time</Text>
          </Pressable>
          <Pressable
            testID="home-friends-card"
            onPress={() => router.push('/friends')}
            style={[styles.smallCard]}
          >
            <Text style={styles.smallCardEyebrow}>SOCIAL</Text>
            <Text style={styles.smallCardTitle}>Friends</Text>
            <Text style={styles.smallCardSub}>Add, challenge, climb together</Text>
          </Pressable>
          <Pressable
            testID="home-challenges-card"
            onPress={() => router.push('/challenges')}
            style={[styles.smallCard, unread > 0 && { borderColor: colors.accent }]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.smallCardEyebrow}>CHALLENGES</Text>
              {unread > 0 ? (
                <View style={styles.badgePill} testID="home-notif-badge">
                  <Text style={styles.badgePillText}>{unread}</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.smallCardTitle}>Friend matches</Text>
            <Text style={styles.smallCardSub}>{unread > 0 ? `${unread} new` : 'View incoming & outgoing'}</Text>
          </Pressable>
          <Pressable
            testID="home-daily-card"
            onPress={() => router.push('/daily')}
            style={[styles.smallCard]}
          >
            <Text style={styles.smallCardEyebrow}>DAILY</Text>
            <Text style={styles.smallCardTitle}>Today&apos;s Challenge</Text>
            <Text style={styles.smallCardSub}>+50 XP · streak {user?.streak ?? 0}</Text>
          </Pressable>
          <Pressable
            testID="home-leaderboard-card"
            onPress={() => router.push('/leaderboard')}
            style={[styles.smallCard]}
          >
            <Text style={styles.smallCardEyebrow}>LEADERBOARD</Text>
            <Text style={styles.smallCardTitle}>Global Top 50</Text>
            <Text style={styles.smallCardSub}>Climb the Elo ladder</Text>
          </Pressable>
          {ruleByKey.classic ? (
            <Pressable
              testID="home-learn-card"
              onPress={() => router.push('/learn')}
              style={[styles.smallCard]}
            >
              <Text style={styles.smallCardEyebrow}>LEARN</Text>
              <Text style={styles.smallCardTitle}>Training path</Text>
              <Text style={styles.smallCardSub}>Guides and quizzes from beginner to advanced</Text>
            </Pressable>
          ) : null}
          {user?.role === 'admin' ? (
            <Pressable
              testID="home-admin-card"
              onPress={() => router.push('/admin')}
              style={[styles.smallCard, { borderColor: colors.accent }]}
            >
              <Text style={[styles.smallCardEyebrow, { color: colors.accent }]}>ADMIN</Text>
              <Text style={styles.smallCardTitle}>Manage content</Text>
              <Text style={styles.smallCardSub}>Rules · Quizzes · Daily</Text>
            </Pressable>
          ) : null}
        </Section>

        <View style={{ height: spacing.xl }} />
      </ScrollView>

      {/* Daily reward modal */}
      <Modal
        visible={showReward}
        transparent
        animationType="fade"
        onRequestClose={() => setShowReward(false)}
      >
        <View style={styles.modalScrim}>
          <View style={styles.rewardCard} testID="daily-reward-modal">
            {!rewardResult ? (
              <>
                <Text style={styles.rewardEyebrow}>DAILY REWARD</Text>
                <Text style={styles.rewardTitle}>Welcome back!</Text>
                <Text style={styles.rewardSub}>
                  Day {(user?.next_streak_if_claimed ?? user?.login_streak ?? 1)} streak. Keep it
                  burning to earn bigger rewards.
                </Text>
                <View style={styles.rewardRow}>
                  <View style={styles.rewardStat}>
                    <Text style={styles.rewardStatLabel}>COINS</Text>
                    <Text style={styles.rewardStatValue}>+50+</Text>
                  </View>
                  <View style={styles.rewardStat}>
                    <Text style={styles.rewardStatLabel}>XP</Text>
                    <Text style={styles.rewardStatValue}>+25+</Text>
                  </View>
                </View>
                <View style={{ height: spacing.lg }} />
                {claiming ? (
                  <ActivityIndicator color={colors.accent} />
                ) : (
                  <Button label="Claim reward" onPress={claimReward} fullWidth testID="claim-reward-btn" />
                )}
                <View style={{ height: spacing.sm }} />
                <Button
                  label="Maybe later"
                  variant="ghost"
                  fullWidth
                  onPress={() => setShowReward(false)}
                />
              </>
            ) : (
              <>
                <Text style={[styles.rewardEyebrow, { color: colors.success }]}>CLAIMED</Text>
                <Text style={styles.rewardTitle}>+{rewardResult?.coins} coins</Text>
                <Text style={styles.rewardSub}>
                  +{rewardResult?.xp} XP · ×{rewardResult?.multiplier} multiplier · {rewardResult?.streak}-day streak
                </Text>
                <View style={{ height: spacing.lg }} />
                <Button
                  label="Awesome"
                  fullWidth
                  onPress={() => {
                    setShowReward(false);
                    setRewardResult(null);
                  }}
                  testID="reward-done-btn"
                />
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Stat({ label, value, testID }: { label: string; value: number; testID?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue} testID={testID}>
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ marginTop: spacing.xxl }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle ? <Text style={styles.sectionSub}>{subtitle}</Text> : null}
      <View style={{ marginTop: spacing.lg, gap: spacing.md }}>{children}</View>
    </View>
  );
}

function RuleCard({
  rule,
  onPlay,
  onLearn,
}: {
  rule: any;
  onPlay: () => void;
  onLearn: () => void;
}) {
  const accent = ruleColors[rule.key] || colors.accent;
  return (
    <View style={[styles.ruleCard, { borderColor: colors.border }]} testID={`rule-card-${rule.key}`}>
      <View style={[styles.ruleAccent, { backgroundColor: accent }]} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.ruleEyebrow, { color: accent }]}>{rule.key.toUpperCase().replace('_', ' ')}</Text>
        <Text style={styles.ruleName}>{rule.name}</Text>
        <Text style={styles.ruleDesc} numberOfLines={2}>
          {rule.description}
        </Text>
        <View style={styles.ruleActions}>
          <Pressable
            onPress={onPlay}
            style={[styles.ruleBtn, { backgroundColor: accent }]}
            testID={`rule-play-${rule.key}`}
          >
            <Text style={[styles.ruleBtnText, { color: '#0A0A0B' }]}>Play</Text>
          </Pressable>
          <Pressable
            onPress={onLearn}
            style={[styles.ruleBtn, styles.ruleBtnGhost]}
            testID={`rule-learn-${rule.key}`}
          >
            <Text style={styles.ruleBtnTextGhost}>Learn</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.xl, paddingBottom: spacing.xxl },
  topbar: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  eyebrow: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 4,
  },
  hello: {
    color: colors.textPrimary,
    fontSize: 28,
    fontWeight: '900',
    marginTop: 2,
    letterSpacing: -0.5,
  },
  statsRow: { flexDirection: 'row', gap: spacing.md },
  stat: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minWidth: 56,
    alignItems: 'center',
  },
  statValue: { color: colors.textPrimary, fontWeight: '900', fontSize: 14 },
  statLabel: { color: colors.textMuted, fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  hero: {
    marginTop: spacing.xl,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.xl,
    padding: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
  heroLeft: { flex: 1 },
  heroEyebrow: { color: colors.accent, fontSize: 11, fontWeight: '900', letterSpacing: 4 },
  heroTitle: {
    color: colors.textPrimary,
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: -0.8,
    marginTop: spacing.sm,
    lineHeight: 32,
  },
  heroSub: { color: colors.textSecondary, marginTop: spacing.sm, fontSize: 13 },
  heroBoardSet: { flexDirection: 'row', alignItems: 'flex-end' },
  heroPiece: { fontSize: 30, marginLeft: -6, color: colors.textPrimary, opacity: 0.85 },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  sectionSub: { color: colors.textSecondary, marginTop: 2, fontSize: 13 },
  ruleCard: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.lg,
    overflow: 'hidden',
  },
  ruleAccent: { width: 4, borderRadius: 4, marginRight: spacing.lg },
  ruleEyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 2 },
  ruleName: { color: colors.textPrimary, fontSize: 18, fontWeight: '800', marginTop: 2 },
  ruleDesc: { color: colors.textSecondary, fontSize: 13, marginTop: 4 },
  ruleActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  ruleBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 8,
    borderRadius: radii.pill,
  },
  ruleBtnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
  ruleBtnText: { fontWeight: '800', fontSize: 13 },
  ruleBtnTextGhost: { color: colors.textPrimary, fontWeight: '700', fontSize: 13 },
  smallCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: spacing.lg,
  },
  smallCardEyebrow: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 3,
  },
  smallCardTitle: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '800',
    marginTop: 4,
  },
  smallCardSub: { color: colors.textSecondary, fontSize: 13, marginTop: 4 },
  aiGrid: { gap: spacing.sm },
  aiCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: spacing.md,
  },
  aiAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  aiAvatarText: { color: colors.accent, fontSize: 18, fontWeight: '900' },
  aiName: { color: colors.textPrimary, fontSize: 16, fontWeight: '900' },
  aiMeta: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  badgePill: {
    minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5,
    backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center',
  },
  badgePillText: { color: '#fff', fontSize: 10, fontWeight: '900' },

  // Retention strip
  retentionStrip: {
    marginTop: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  levelBlock: {
    flex: 1,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  levelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  levelChip: {
    color: colors.accent,
    fontWeight: '900',
    fontSize: 11,
    letterSpacing: 1.5,
  },
  levelXp: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
  progressTrack: {
    marginTop: 6,
    height: 6,
    borderRadius: 4,
    backgroundColor: colors.elevated,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.accent,
    borderRadius: 4,
  },
  streakChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    minWidth: 92,
  },
  streakFlame: { fontSize: 22 },
  streakValue: { color: colors.textPrimary, fontWeight: '900', fontSize: 16 },
  streakLabel: { color: colors.textMuted, fontSize: 9, fontWeight: '900', letterSpacing: 1.4 },

  // Puzzle hero
  puzzleHero: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  puzzleEyebrow: { color: colors.accent, fontSize: 10, fontWeight: '900', letterSpacing: 3 },
  puzzleTitle: { color: colors.textPrimary, fontSize: 17, fontWeight: '800', marginTop: 4 },
  puzzleSub: { color: colors.textSecondary, fontSize: 12, marginTop: 4 },
  puzzleIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.elevated,
    borderColor: colors.border,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Reward modal
  modalScrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  rewardCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.xl,
    padding: spacing.xl,
  },
  rewardEyebrow: { color: colors.accent, fontSize: 11, fontWeight: '900', letterSpacing: 4 },
  rewardTitle: { color: colors.textPrimary, fontSize: 26, fontWeight: '900', marginTop: spacing.xs },
  rewardSub: { color: colors.textSecondary, marginTop: spacing.sm, fontSize: 13, lineHeight: 19 },
  rewardRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  rewardStat: {
    flex: 1,
    backgroundColor: colors.elevated,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
    alignItems: 'center',
  },
  rewardStatLabel: { color: colors.textMuted, fontSize: 10, fontWeight: '900', letterSpacing: 2 },
  rewardStatValue: { color: colors.accent, fontSize: 22, fontWeight: '900', marginTop: 4 },
});
