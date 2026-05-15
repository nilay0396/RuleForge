import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
  ScrollView,
  Modal,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../src/api';
import { useAuth } from '../src/auth';
import { colors, radii, ruleColors, spacing } from '../src/theme';
import Chessboard from '../src/components/Chessboard';
import Button from '../src/components/Button';
import { RuleChess, RuleKey, SquareName, LegalTarget } from '../src/engine';
import { chooseAIMove, AILevel, getAIProfile } from '../src/ai';
import { playSound } from '../src/sound';

const TIMER_OPTIONS: { key: string; label: string; seconds: number | null }[] = [
  { key: 'casual', label: 'Casual', seconds: null },
  { key: 'rapid', label: 'Rapid 10', seconds: 10 * 60 },
  { key: 'blitz', label: 'Blitz 5', seconds: 5 * 60 },
  { key: 'bullet', label: 'Bullet 1', seconds: 60 },
];

export default function Play() {
  const params = useLocalSearchParams<{ rule?: string; ai?: string; daily?: string }>();
  const router = useRouter();
  const { user, refresh, setUser } = useAuth();

  const ruleKey: RuleKey = (params.rule as RuleKey) || 'classic';
  const aiLevel: AILevel = clampLevel(parseInt(params.ai || '2', 10));
  const aiProfile = getAIProfile(aiLevel);
  const isDaily = params.daily === '1';

  const [showRuleModal, setShowRuleModal] = useState(true);
  const [timerKey, setTimerKey] = useState<string>('casual');

  // Engine instance kept in ref; force re-render via state counter
  const rcRef = useRef(new RuleChess(ruleKey));
  const [tick, setTick] = useState(0);
  const bump = () => setTick((t) => t + 1);

  const [selected, setSelected] = useState<SquareName | null>(null);
  const [legalTargets, setLegalTargets] = useState<LegalTarget[]>([]);

  // Swap mode UI state (only for swap_move rule)
  const [swapMode, setSwapMode] = useState(false);
  const [swapFirst, setSwapFirst] = useState<SquareName | null>(null);

  // Promotion modal state
  const [pendingPromotion, setPendingPromotion] = useState<{ from: SquareName; to: SquareName } | null>(null);

  const [aiThinking, setAiThinking] = useState(false);
  const [gameOver, setGameOver] = useState<{ result: 'win' | 'loss' | 'draw'; reason: string } | null>(null);
  const [matchSubmitted, setMatchSubmitted] = useState(false);
  const [eloChange, setEloChange] = useState<{ before: number; after: number; delta: number } | null>(null);
  // Undo is allowed only between AI's reply and the player's next move.
  const [canUndo, setCanUndo] = useState(false);
  // Confirmation modals
  const [confirmAbort, setConfirmAbort] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);

  // Timers (per side, seconds remaining). null means no timer.
  const initial = TIMER_OPTIONS.find((t) => t.key === timerKey)!.seconds;
  const [whiteTime, setWhiteTime] = useState<number | null>(initial);
  const [blackTime, setBlackTime] = useState<number | null>(initial);

  // Reset timers when timer choice changes
  useEffect(() => {
    const s = TIMER_OPTIONS.find((t) => t.key === timerKey)!.seconds;
    setWhiteTime(s);
    setBlackTime(s);
  }, [timerKey]);

  // Tick timers every second when game active
  useEffect(() => {
    if (gameOver || showRuleModal) return;
    if (whiteTime == null) return;
    const id = setInterval(() => {
      const turn = rcRef.current.turn();
      if (turn === 'w') {
        setWhiteTime((t) => (t == null ? null : Math.max(0, t - 1)));
      } else {
        setBlackTime((t) => (t == null ? null : Math.max(0, t - 1)));
      }
    }, 1000);
    return () => clearInterval(id);
  }, [gameOver, showRuleModal, whiteTime]);

  // Time-out check
  useEffect(() => {
    if (gameOver) return;
    if (whiteTime === 0) endGame('loss', 'Out of time');
    else if (blackTime === 0) endGame('win', 'Opponent out of time');
  }, [whiteTime, blackTime]);

  // AI move trigger
  useEffect(() => {
    if (gameOver || showRuleModal) return;
    if (rcRef.current.turn() !== 'b') return;
    setAiThinking(true);
    const id = setTimeout(() => {
      try {
        const m = chooseAIMove(rcRef.current, aiLevel);
        if (m) {
          const fenBefore = rcRef.current.fen();
          const wasCapture = !!rcRef.current.pieceAt(m.to as SquareName);
          rcRef.current.move(m.from as SquareName, m.to as SquareName, {
            promotion: (m.promotion as any) || 'q',
          });
          const isCheck = rcRef.current.inCheck();
          if (isCheck) playSound('check');
          else if (wasCapture) playSound('capture');
          else playSound('move');
          checkOutcome();
          // After AI replies, player is allowed to undo their previous move pair.
          setCanUndo(rcRef.current.historySAN().length >= 2 && !rcRef.current.isGameOver());
          // Acknowledge fenBefore for non-undefined linting
          void fenBefore;
          bump();
        }
      } finally {
        setAiThinking(false);
      }
    }, 250);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, showRuleModal, gameOver]);

  const dim = Dimensions.get('window');
  const boardSize = Math.min(dim.width - 32, 560, dim.height - 320);

  const onSquarePress = (sq: SquareName) => {
    if (gameOver || aiThinking) return;
    if (rcRef.current.turn() !== 'w') return;

    if (swapMode) {
      const piece = rcRef.current.pieceAt(sq);
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
      const ok = rcRef.current.swap(swapFirst, sq);
      if (ok) {
        setSwapMode(false);
        setSwapFirst(null);
        setSelected(null);
        setLegalTargets([]);
        checkOutcome();
        bump();
      }
      return;
    }

    if (selected) {
      const target = legalTargets.find((t) => t.to === sq);
      if (target) {
        // Promotion check
        const piece = rcRef.current.pieceAt(selected);
        if (piece?.type === 'p' && (sq[1] === '8' || sq[1] === '1') && target.type === 'normal') {
          setPendingPromotion({ from: selected, to: sq });
          return;
        }
        const wasCapture = !!rcRef.current.pieceAt(sq);
        const ok = rcRef.current.move(selected, sq, { promotion: target.promotion });
        if (ok) {
          // Lock undo on player move (consumes any pending undo right).
          setCanUndo(false);
          const isCheck = rcRef.current.inCheck();
          if (isCheck) playSound('check');
          else if (wasCapture) playSound('capture');
          else playSound('move');
          setSelected(null);
          setLegalTargets([]);
          checkOutcome();
          bump();
          return;
        }
      }
      // Re-select another piece of own color
      const piece = rcRef.current.pieceAt(sq);
      if (piece && piece.color === 'w') {
        setSelected(sq);
        setLegalTargets(rcRef.current.legalTargets(sq));
        return;
      }
      setSelected(null);
      setLegalTargets([]);
      return;
    }

    const piece = rcRef.current.pieceAt(sq);
    if (piece && piece.color === 'w') {
      setSelected(sq);
      setLegalTargets(rcRef.current.legalTargets(sq));
    }
  };

  const completePromotion = (p: 'q' | 'r' | 'b' | 'n') => {
    if (!pendingPromotion) return;
    const ok = rcRef.current.move(pendingPromotion.from, pendingPromotion.to, { promotion: p });
    setPendingPromotion(null);
    setSelected(null);
    setLegalTargets([]);
    if (ok) {
      checkOutcome();
      bump();
    }
  };

  const checkOutcome = () => {
    const rc = rcRef.current;
    if (!rc.isGameOver()) return;
    if (rc.isCheckmate()) {
      // The side to move is checkmated
      const result = rc.turn() === 'w' ? 'loss' : 'win';
      endGame(result, 'Checkmate');
    } else if (rc.isStalemate() || rc.isDraw()) {
      endGame('draw', rc.isStalemate() ? 'Stalemate' : 'Draw');
    }
  };

  const endGame = async (result: 'win' | 'loss' | 'draw', reason: string) => {
    if (gameOver) return;
    setGameOver({ result, reason });
    setCanUndo(false);
    playSound('end');
    if (matchSubmitted) return;
    setMatchSubmitted(true);
    try {
      const r = await api.recordMatch({
        mode: isDaily ? 'daily' : ruleKey,
        rule_key: ruleKey,
        result,
        moves_san: rcRef.current.historySAN(),
        final_fen: rcRef.current.fen(),
        duration_seconds: 0,
        ai_level: aiLevel,
      });
      if (r.user) {
        const oldElo = user?.elo ?? 800;
        setUser(r.user);
        setEloChange({
          before: oldElo,
          after: r.user.elo,
          delta: r.user.elo - oldElo,
        });
      }
      if (isDaily && result !== 'loss') {
        try {
          const d = await api.submitDaily(rcRef.current.historySAN(), true);
          if (d.user) setUser(d.user);
        } catch {}
      }
      await refresh();
    } catch {}
  };

  const undo = () => {
    if (!canUndo || aiThinking || gameOver) return;
    // Revert AI's last move + player's last move (one full pair).
    rcRef.current.undo();
    rcRef.current.undo();
    setSelected(null);
    setLegalTargets([]);
    setCanUndo(false);
    bump();
  };

  const abortGame = () => {
    // Only allowed if no moves have been played
    if (rcRef.current.historySAN().length > 0) return;
    router.replace('/home');
  };

  const newGame = () => {
    rcRef.current = new RuleChess(ruleKey);
    setSelected(null);
    setLegalTargets([]);
    setSwapMode(false);
    setSwapFirst(null);
    setGameOver(null);
    setMatchSubmitted(false);
    setPendingPromotion(null);
    setCanUndo(false);
    setEloChange(null);
    const s = TIMER_OPTIONS.find((t) => t.key === timerKey)!.seconds;
    setWhiteTime(s);
    setBlackTime(s);
    bump();
  };

  const accent = ruleColors[ruleKey] || colors.accent;
  const inCheck = rcRef.current.inCheck();
  const flags = rcRef.current.flags;
  const swapAvailable = ruleKey === 'swap_move' && !flags.whiteSwapUsed && !gameOver;
  const dashLabel =
    ruleKey === 'king_dash'
      ? flags.whiteKingDashUsed
        ? 'Dash used'
        : 'Dash available'
      : null;

  const movesPairs = useMemo(() => {
    const sans = rcRef.current.historySAN();
    const pairs: { num: number; w?: string; b?: string }[] = [];
    for (let i = 0; i < sans.length; i += 2) {
      pairs.push({ num: i / 2 + 1, w: sans[i], b: sans[i + 1] });
    }
    return pairs;
  }, [tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const moveListRef = useRef<ScrollView | null>(null);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="play-back">
          <Text style={styles.iconBtnText}>‹</Text>
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={[styles.eyebrow, { color: accent }]}>
            {isDaily ? 'DAILY · ' : ''}
            {ruleKey.toUpperCase().replace('_', ' ')}
          </Text>
          <Text style={styles.title} numberOfLines={1}>
            vs {aiProfile.name}
          </Text>
        </View>
        <Pressable onPress={() => setShowRuleModal(true)} style={styles.iconBtn} testID="play-rule-info">
          <Text style={styles.iconBtnText}>?</Text>
        </Pressable>
      </View>

      {/* Opponent header */}
      <PlayerStrip
        name={aiProfile.name}
        avatar={aiProfile.avatar}
        sub={
          aiThinking
            ? `${aiProfile.title} Bot · ${aiProfile.rating} ELO · thinking...`
            : `${aiProfile.title} Bot · ${aiProfile.rating} ELO`
        }
        time={blackTime}
        active={rcRef.current.turn() === 'b' && !gameOver && !showRuleModal}
        captures={countCaptures(rcRef.current, 'w')}
        thinking={aiThinking}
      />

      {/* Board */}
      <View style={styles.boardWrap}>
        <Chessboard
          rc={rcRef.current}
          orientation="w"
          selected={selected}
          targets={legalTargets}
          swapFirst={swapFirst}
          disabled={!!gameOver || aiThinking || showRuleModal}
          size={boardSize}
          onSquarePress={onSquarePress}
        />
      </View>

      {/* Player header */}
      <PlayerStrip
        name={user?.name || 'You'}
        sub={`You · ${user?.elo ?? 800} ELO${inCheck && rcRef.current.turn() === 'w' ? ' · CHECK!' : ''}`}
        time={whiteTime}
        active={rcRef.current.turn() === 'w' && !gameOver && !showRuleModal}
        captures={countCaptures(rcRef.current, 'b')}
      />

      {/* Action bar */}
      <View style={styles.actionBar}>
        <ActionBtn
          label="Undo"
          onPress={undo}
          testID="play-undo"
          disabled={!canUndo || aiThinking}
        />
        {rcRef.current.historySAN().length === 0 ? (
          <ActionBtn label="Abort" onPress={() => setConfirmAbort(true)} testID="play-abort" />
        ) : (
          <ActionBtn label="New game" onPress={() => setConfirmNew(true)} testID="play-new" />
        )}
        {ruleKey === 'swap_move' && (
          <ActionBtn
            label={swapMode ? 'Cancel swap' : 'Swap'}
            onPress={() => {
              if (!swapAvailable) return;
              setSwapMode((s) => !s);
              setSwapFirst(null);
              setSelected(null);
              setLegalTargets([]);
            }}
            testID="play-swap"
            disabled={!swapAvailable}
            highlight={swapMode}
          />
        )}
        {dashLabel && (
          <View style={[styles.actionBtn, { borderColor: colors.info }]}>
            <Text style={[styles.actionText, { color: flags.whiteKingDashUsed ? colors.textMuted : colors.info }]}>
              {dashLabel}
            </Text>
          </View>
        )}
      </View>

      {/* Move list */}
      <ScrollView
        ref={moveListRef}
        style={styles.moveList}
        contentContainerStyle={{ padding: spacing.sm }}
        horizontal
        showsHorizontalScrollIndicator={false}
        onContentSizeChange={() => moveListRef.current?.scrollToEnd({ animated: true })}
      >
        {movesPairs.length === 0 ? (
          <Text style={styles.movesEmpty}>Game starts here.</Text>
        ) : (
          movesPairs.map((p, i) => {
            const isLastPair = i === movesPairs.length - 1;
            return (
              <View key={p.num} style={styles.movePair}>
                <Text style={styles.moveNum}>{p.num}.</Text>
                <Text style={[styles.moveSan, isLastPair && !p.b && styles.moveSanCurrent]}>{p.w}</Text>
                {p.b ? (
                  <Text style={[styles.moveSan, isLastPair && styles.moveSanCurrent]}>{p.b}</Text>
                ) : null}
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Game-over modal */}
      <Modal visible={!!gameOver} transparent animationType="fade">
        <View style={styles.modalScrim}>
          <View style={styles.modalCard}>
            <Text style={[styles.modalEyebrow, { color: gameOver?.result === 'win' ? colors.success : gameOver?.result === 'loss' ? colors.danger : colors.textSecondary }]}>
              {gameOver?.result?.toUpperCase()}
            </Text>
            <Text style={styles.modalTitle}>
              {gameOver?.result === 'win'
                ? 'You won!'
                : gameOver?.result === 'loss'
                ? 'You lost.'
                : 'Draw.'}
            </Text>
            <Text style={styles.modalBody}>{gameOver?.reason}</Text>
            {eloChange ? (
              <View style={styles.eloChangeRow} testID="play-elo-change">
                <View style={styles.eloChangeBlock}>
                  <Text style={styles.eloChangeLabel}>RATING</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                    <Text style={styles.eloChangeValue}>{eloChange.after}</Text>
                    <Text
                      style={[
                        styles.eloChangeDelta,
                        { color: eloChange.delta >= 0 ? colors.success : colors.danger },
                      ]}
                    >
                      {' '}
                      {eloChange.delta >= 0 ? `+${eloChange.delta}` : eloChange.delta}
                    </Text>
                  </View>
                  <Text style={styles.eloChangeWas}>was {eloChange.before}</Text>
                </View>
              </View>
            ) : null}
            <Text style={styles.modalReward}>
              {gameOver?.result === 'win'
                ? '+25 XP · +10 coins'
                : gameOver?.result === 'draw'
                ? '+10 XP · +2 coins'
                : '+5 XP'}
              {isDaily && gameOver?.result !== 'loss' ? '   ·   +50 XP daily bonus' : ''}
            </Text>
            <View style={{ height: spacing.lg }} />
            <Button label="New game" onPress={newGame} testID="play-newgame-modal" fullWidth />
            <View style={{ height: spacing.sm }} />
            <Button label="Back to home" variant="secondary" testID="play-home-modal" onPress={() => router.replace('/home')} fullWidth />
          </View>
        </View>
      </Modal>

      {/* Abort confirmation */}
      <Modal visible={confirmAbort} transparent animationType="fade">
        <View style={styles.modalScrim}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Abort game?</Text>
            <Text style={styles.modalBody}>No moves have been played, so nothing will be recorded.</Text>
            <View style={{ height: spacing.lg }} />
            <Button
              label="Yes, abort"
              variant="danger"
              testID="confirm-abort-yes"
              onPress={() => { setConfirmAbort(false); abortGame(); }}
              fullWidth
            />
            <View style={{ height: spacing.sm }} />
            <Button
              label="Cancel"
              variant="secondary"
              testID="confirm-abort-no"
              onPress={() => setConfirmAbort(false)}
              fullWidth
            />
          </View>
        </View>
      </Modal>

      {/* New game confirmation */}
      <Modal visible={confirmNew} transparent animationType="fade">
        <View style={styles.modalScrim}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Start a new game?</Text>
            <Text style={styles.modalBody}>The current match will be discarded and won&apos;t affect your rating.</Text>
            <View style={{ height: spacing.lg }} />
            <Button
              label="Yes, new game"
              testID="confirm-new-yes"
              onPress={() => { setConfirmNew(false); newGame(); }}
              fullWidth
            />
            <View style={{ height: spacing.sm }} />
            <Button
              label="Keep playing"
              variant="secondary"
              testID="confirm-new-no"
              onPress={() => setConfirmNew(false)}
              fullWidth
            />
          </View>
        </View>
      </Modal>

      {/* Rule explanation modal */}
      <Modal visible={showRuleModal} transparent animationType="fade">
        <View style={styles.modalScrim}>
          <View style={styles.modalCard}>
            <Text style={[styles.modalEyebrow, { color: accent }]}>{ruleKey.toUpperCase().replace('_', ' ')}</Text>
            <Text style={styles.modalTitle}>{ruleSummary[ruleKey]?.title}</Text>
            <Text style={styles.modalBody}>{ruleSummary[ruleKey]?.body}</Text>
            <View style={styles.opponentPreview}>
              <View style={styles.opponentAvatar}>
                <Text style={styles.opponentAvatarText}>{aiProfile.avatar}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.opponentName}>{aiProfile.name}</Text>
                <Text style={styles.opponentMeta}>
                  Level {aiProfile.level} · {aiProfile.title} · {aiProfile.rating} ELO
                </Text>
              </View>
            </View>
            <Text style={styles.modalSubhead}>Time control</Text>
            <View style={styles.timerRow}>
              {TIMER_OPTIONS.map((t) => (
                <Pressable
                  key={t.key}
                  testID={`timer-${t.key}`}
                  onPress={() => setTimerKey(t.key)}
                  style={[styles.timerChip, timerKey === t.key && { borderColor: accent, backgroundColor: 'rgba(234,179,8,0.08)' }]}
                >
                  <Text style={[styles.timerChipText, timerKey === t.key && { color: colors.textPrimary }]}>
                    {t.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View style={{ height: spacing.lg }} />
            <Button label="Start game" testID="play-start" onPress={() => setShowRuleModal(false)} fullWidth />
            <View style={{ height: spacing.sm }} />
            <Button
              label="Read full guide"
              variant="secondary"
              testID="play-rule-guide"
              onPress={() => {
                setShowRuleModal(false);
                router.push({ pathname: '/rule', params: { key: ruleKey } });
              }}
              fullWidth
            />
          </View>
        </View>
      </Modal>

      {/* Promotion modal */}
      <Modal visible={!!pendingPromotion} transparent animationType="fade">
        <View style={styles.modalScrim}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Promote pawn</Text>
            <View style={styles.promoteRow}>
              {(['q', 'r', 'b', 'n'] as const).map((p) => (
                <Pressable
                  key={p}
                  onPress={() => completePromotion(p)}
                  style={styles.promoteBtn}
                  testID={`promote-${p}`}
                >
                  <Text style={styles.promoteGlyph}>{{ q: '♛', r: '♜', b: '♝', n: '♞' }[p]}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function ActionBtn({
  label,
  onPress,
  testID,
  disabled,
  highlight,
}: {
  label: string;
  onPress: () => void;
  testID?: string;
  disabled?: boolean;
  highlight?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      style={[
        styles.actionBtn,
        highlight && { backgroundColor: 'rgba(234,179,8,0.12)', borderColor: colors.accent },
        disabled && { opacity: 0.4 },
      ]}
    >
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
  );
}

function PlayerStrip({
  name,
  avatar,
  sub,
  time,
  active,
  captures,
  thinking,
}: {
  name: string;
  avatar?: string;
  sub: string;
  time: number | null;
  active: boolean;
  captures: string;
  thinking?: boolean;
}) {
  return (
    <View style={[styles.player, active && { borderColor: colors.accent }]}>
      <View style={[styles.playerAvatar, active && { borderColor: colors.accent }]}>
        <Text style={styles.playerAvatarText}>{avatar || name.slice(0, 1).toUpperCase()}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={styles.playerName}>{name}</Text>
          {thinking ? <ActivityIndicator size="small" color={colors.accent} /> : null}
        </View>
        <Text style={styles.playerSub}>
          {sub}
          {captures ? `   ·   ${captures}` : ''}
        </Text>
      </View>
      {time != null ? (
        <View style={[styles.clockBox, active && { borderColor: colors.accent }]}>
          <Text style={styles.clock}>{formatTime(time)}</Text>
        </View>
      ) : null}
    </View>
  );
}

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

function clampLevel(n: number): AILevel {
  if (n <= 1) return 1;
  if (n === 2) return 2;
  if (n === 3) return 3;
  if (n === 4) return 4;
  if (n === 5) return 5;
  return 6;
}

function countCaptures(rc: RuleChess, color: 'w' | 'b'): string {
  // Count missing pieces of `color` from initial set => those are captured by opponent
  const initial: Record<string, number> = { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 };
  const present: Record<string, number> = { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 };
  for (const row of rc.board()) {
    for (const cell of row) {
      if (cell && cell.color === color) {
        present[cell.type] = (present[cell.type] || 0) + 1;
      }
    }
  }
  const captured: string[] = [];
  for (const t of ['q', 'r', 'b', 'n', 'p']) {
    const diff = (initial[t] || 0) - (present[t] || 0);
    for (let i = 0; i < diff; i++) {
      const glyph = { q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' }[t]!;
      captured.push(glyph);
    }
  }
  return captured.join('');
}

const ruleSummary: Record<string, { title: string; body: string }> = {
  classic: {
    title: 'Classic Chess',
    body: 'Standard rules. White moves first. Checkmate the opponent king. All standard rules apply.',
  },
  king_dash: {
    title: 'King Dash',
    body: 'Once per game your king may dash exactly two squares horizontally, vertically, or diagonally. The path must be empty and the king cannot pass through or land on attacked squares. Use it wisely!',
  },
  power_pawns: {
    title: 'Power Pawns',
    body: 'When your pawn reaches its 5th rank, it gains one extra option: slide one square sideways to an empty square (non-capturing). Standard pawn moves still apply.',
  },
  swap_move: {
    title: 'Swap Move',
    body: 'Once per game, instead of moving, you may swap two of your own non-king pieces. Tap the Swap button, then choose two of your pieces.',
  },
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
  },
  iconBtnText: { color: colors.textPrimary, fontSize: 20, fontWeight: '900' },
  eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 3 },
  title: { color: colors.textPrimary, fontSize: 14, fontWeight: '700', marginTop: 2 },
  player: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginHorizontal: spacing.lg,
    marginVertical: spacing.xs,
  },
  playerDot: { width: 10, height: 10, borderRadius: 5 },
  playerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderColor: colors.border,
    borderWidth: 1,
    backgroundColor: colors.elevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerAvatarText: { color: colors.accent, fontWeight: '900', fontSize: 15 },
  playerName: { color: colors.textPrimary, fontWeight: '800' },
  playerSub: { color: colors.textMuted, fontSize: 12, marginTop: 1 },
  clockBox: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.elevated,
  },
  clock: { color: colors.textPrimary, fontWeight: '900', fontVariant: ['tabular-nums'] as any, fontSize: 16 },
  boardWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    position: 'relative',
  },
  actionBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  actionBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 8,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  actionText: { color: colors.textPrimary, fontWeight: '700', fontSize: 13 },
  moveList: {
    maxHeight: 56,
    marginTop: spacing.sm,
    marginHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.md,
  },
  movesEmpty: { color: colors.textMuted, padding: spacing.sm, fontStyle: 'italic' },
  movePair: { flexDirection: 'row', gap: 6, marginRight: spacing.md, alignItems: 'baseline' },
  moveNum: { color: colors.textMuted, fontSize: 12 },
  moveSan: { color: colors.textPrimary, fontSize: 13, fontWeight: '700' },
  moveSanCurrent: { color: colors.accent, backgroundColor: 'rgba(234,179,8,0.12)', paddingHorizontal: 4, borderRadius: 4 },
  eloChangeRow: { marginTop: spacing.lg, flexDirection: 'row', gap: spacing.md },
  eloChangeBlock: {
    flex: 1,
    backgroundColor: colors.elevated,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  eloChangeLabel: { color: colors.textMuted, fontSize: 10, fontWeight: '900', letterSpacing: 2 },
  eloChangeValue: { color: colors.textPrimary, fontSize: 28, fontWeight: '900', marginTop: 4 },
  eloChangeDelta: { fontSize: 16, fontWeight: '900' },
  eloChangeWas: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  modalScrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.xl,
    padding: spacing.xl,
  },
  modalEyebrow: { fontSize: 11, fontWeight: '900', letterSpacing: 4 },
  modalTitle: { color: colors.textPrimary, fontSize: 24, fontWeight: '900', marginTop: spacing.xs },
  modalBody: { color: colors.textSecondary, marginTop: spacing.sm, lineHeight: 22 },
  opponentPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.lg,
    padding: spacing.md,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.md,
    backgroundColor: colors.elevated,
  },
  opponentAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.accent,
    borderWidth: 1,
  },
  opponentAvatarText: { color: colors.accent, fontWeight: '900', fontSize: 18 },
  opponentName: { color: colors.textPrimary, fontWeight: '900', fontSize: 16 },
  opponentMeta: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  modalSubhead: { color: colors.textPrimary, fontSize: 12, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase', marginTop: spacing.lg },
  modalReward: { color: colors.accent, fontWeight: '700', marginTop: spacing.md },
  timerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  timerChip: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  timerChipText: { color: colors.textSecondary, fontWeight: '700', fontSize: 13 },
  promoteRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg, justifyContent: 'center' },
  promoteBtn: {
    width: 64, height: 64,
    borderRadius: radii.md,
    backgroundColor: colors.elevated,
    borderColor: colors.border, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  promoteGlyph: { fontSize: 36, color: colors.textPrimary, fontFamily: Platform.select({ ios: 'Times New Roman', android: 'serif', default: 'serif' }) },
});
