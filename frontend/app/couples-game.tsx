import { useCallback, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radii, spacing } from '../src/theme';
import Button from '../src/components/Button';

// ---------------------------------------------------------------------------
// "Never Have I Ever" — an impromptu party game for couples.
// A card deck of funny confession prompts. Every new game reshuffles a fresh
// set of 10 from a large pool spanning relationship, life, and situation
// themes, so no two games feel the same.
// ---------------------------------------------------------------------------

const QUESTIONS_PER_GAME = 10;

type Category = 'couple' | 'life' | 'situation';

type Prompt = {
  id: string;
  category: Category;
  text: string; // Completes the sentence "Never have I ever ..."
};

const CATEGORY_META: Record<Category, { label: string; color: string; emoji: string }> = {
  couple: { label: 'JUST US', color: colors.danger, emoji: '💞' },
  life: { label: 'LIFE', color: colors.info, emoji: '🎬' },
  situation: { label: 'WHAT IF', color: colors.purple, emoji: '🎲' },
};

// A deliberately large pool so a random draw of 10 stays fresh across games.
const POOL: Prompt[] = [
  // --- Couple / relationship ---
  { id: 'c1', category: 'couple', text: 'stalked my partner on social media before our first date.' },
  { id: 'c2', category: 'couple', text: 'pretended to like a hobby just to spend time with my partner.' },
  { id: 'c3', category: 'couple', text: 'eaten the last bite of food I promised to share.' },
  { id: 'c4', category: 'couple', text: 'blamed a smell on my partner when it was clearly me.' },
  { id: 'c5', category: 'couple', text: 'secretly re-washed the dishes my partner "cleaned".' },
  { id: 'c6', category: 'couple', text: 'fallen asleep during a movie my partner really wanted to watch.' },
  { id: 'c7', category: 'couple', text: 'used my partner’s toothbrush and never confessed.' },
  { id: 'c8', category: 'couple', text: 'lost an argument on purpose just to end it faster.' },
  { id: 'c9', category: 'couple', text: 'googled how to win an argument mid-argument.' },
  { id: 'c10', category: 'couple', text: 'saved my partner in my phone under a ridiculous nickname.' },
  { id: 'c11', category: 'couple', text: 'pretended to be asleep so my partner would deal with the noise.' },
  { id: 'c12', category: 'couple', text: 'snooped through my partner’s phone "by accident".' },
  { id: 'c13', category: 'couple', text: 'worn my partner’s clothes without asking.' },
  { id: 'c14', category: 'couple', text: 'planned an entire imaginary future on a second date.' },
  { id: 'c15', category: 'couple', text: 'hidden a snack so I wouldn’t have to share it.' },
  { id: 'c16', category: 'couple', text: 'said "I’m fine" when I was absolutely not fine.' },
  { id: 'c17', category: 'couple', text: 'faked enthusiasm for a gift I secretly disliked.' },
  { id: 'c18', category: 'couple', text: 'rehearsed a text to my partner before sending it.' },
  { id: 'c19', category: 'couple', text: 'let my partner think they won so I could win later.' },
  { id: 'c20', category: 'couple', text: 're-gifted something my partner gave me.' },
  { id: 'c21', category: 'couple', text: 'pretended not to hear so I wouldn’t have to get up.' },
  { id: 'c22', category: 'couple', text: 'taken a "candid" photo of my partner 47 times to get one good shot.' },
  { id: 'c23', category: 'couple', text: 'stolen all the blankets and denied it in the morning.' },
  { id: 'c24', category: 'couple', text: 'agreed to a plan hoping it would get cancelled.' },

  // --- Life / real events ---
  { id: 'l1', category: 'life', text: 'walked into a glass door in public.' },
  { id: 'l2', category: 'life', text: 'called a teacher "mom" or "dad" by accident.' },
  { id: 'l3', category: 'life', text: 'waved back at someone who was waving at the person behind me.' },
  { id: 'l4', category: 'life', text: 'laughed at completely the wrong moment.' },
  { id: 'l5', category: 'life', text: 'sent a text to the exact wrong person.' },
  { id: 'l6', category: 'life', text: 'pretended to know a song and mumbled through the whole thing.' },
  { id: 'l7', category: 'life', text: 'tripped up the stairs and looked around to see who noticed.' },
  { id: 'l8', category: 'life', text: 'forgotten someone’s name three seconds after meeting them.' },
  { id: 'l9', category: 'life', text: 'replied "you too" when the waiter said "enjoy your meal".' },
  { id: 'l10', category: 'life', text: 'pushed a "pull" door with full confidence.' },
  { id: 'l11', category: 'life', text: 'ghosted a group chat and pretended I never saw it.' },
  { id: 'l12', category: 'life', text: 'lied about my age to sound cooler.' },
  { id: 'l13', category: 'life', text: 'clapped when the plane landed.' },
  { id: 'l14', category: 'life', text: 'gotten lost while using the map on my own phone.' },
  { id: 'l15', category: 'life', text: 'practiced a phone call before making it.' },
  { id: 'l16', category: 'life', text: 'eaten food off the floor when nobody was looking.' },
  { id: 'l17', category: 'life', text: 'left a store empty-handed just because a worker asked if I needed help.' },
  { id: 'l18', category: 'life', text: 'said "happy birthday" to someone whose birthday it was not.' },
  { id: 'l19', category: 'life', text: 'binge-watched a whole series in one sitting and told no one.' },
  { id: 'l20', category: 'life', text: 'blamed the dog, the wifi, or traffic for being late.' },
  { id: 'l21', category: 'life', text: 'pretended to text so I could avoid talking to someone.' },
  { id: 'l22', category: 'life', text: 'ordered something just because it was the first thing on the menu.' },
  { id: 'l23', category: 'life', text: 'sung the wrong lyrics loudly and confidently for years.' },
  { id: 'l24', category: 'life', text: 'returned to a parking lot and forgotten where I parked entirely.' },
  { id: 'l25', category: 'life', text: 'panic-bought something in an ad at 2am.' },

  // --- Situations / hypotheticals ---
  { id: 's1', category: 'situation', text: 'would survive a week without my phone.' },
  { id: 's2', category: 'situation', text: 'have run away if I saw a spider the size of a coin.' },
  { id: 's3', category: 'situation', text: 'could eat the same meal every day for a month.' },
  { id: 's4', category: 'situation', text: 'would win in a staring contest against my partner.' },
  { id: 's5', category: 'situation', text: 'would tell a stranger they had food in their teeth.' },
  { id: 's6', category: 'situation', text: 'would fake a phone call to escape an awkward conversation.' },
  { id: 's7', category: 'situation', text: 'have kept a receipt "just in case" for over a year.' },
  { id: 's8', category: 'situation', text: 'would rather give up dessert than coffee forever.' },
  { id: 's9', category: 'situation', text: 'would last a full day pretending to be my partner.' },
  { id: 's10', category: 'situation', text: 'would return extra change a cashier gave me by mistake.' },
  { id: 's11', category: 'situation', text: 'could go a whole day without complaining about anything.' },
  { id: 's12', category: 'situation', text: 'would voluntarily go on a rollercoaster twice in a row.' },
  { id: 's13', category: 'situation', text: 'would win a dance-off at a family wedding.' },
  { id: 's14', category: 'situation', text: 'could keep a surprise party secret without spoiling it.' },
  { id: 's15', category: 'situation', text: 'would rather host the party than attend one.' },
  { id: 's16', category: 'situation', text: 'would eat the mystery leftover in the back of the fridge.' },
  { id: 's17', category: 'situation', text: 'could assemble furniture without reading the instructions.' },
  { id: 's18', category: 'situation', text: 'would sing karaoke completely sober.' },
  { id: 's19', category: 'situation', text: 'would survive as a contestant on a cooking show.' },
  { id: 's20', category: 'situation', text: 'could resist checking my phone for an entire dinner date.' },
  { id: 's21', category: 'situation', text: 'would rather be too early than one minute late.' },
  { id: 's22', category: 'situation', text: 'could name all the plants I own without googling.' },
  { id: 's23', category: 'situation', text: 'would win in an argument against a toddler.' },
];

// Fisher-Yates shuffle (returns a new array, does not mutate input).
function shuffle<T>(input: T[]): T[] {
  const arr = [...input];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Draw a fresh set of 10, biased away from prompts used in the previous game.
function drawSet(recent: Set<string>): Prompt[] {
  const fresh = POOL.filter((p) => !recent.has(p.id));
  // If we've filtered too aggressively to fill a game, fall back to the pool.
  const source = fresh.length >= QUESTIONS_PER_GAME ? fresh : POOL;
  return shuffle(source).slice(0, QUESTIONS_PER_GAME);
}

type Phase = 'intro' | 'playing' | 'done';

export default function CouplesGame() {
  const router = useRouter();
  const recentIds = useRef<Set<string>>(new Set());

  const [phase, setPhase] = useState<Phase>('intro');
  const [deck, setDeck] = useState<Prompt[]>([]);
  const [index, setIndex] = useState(0);

  const startGame = useCallback(() => {
    const next = drawSet(recentIds.current);
    recentIds.current = new Set(next.map((p) => p.id));
    setDeck(next);
    setIndex(0);
    setPhase('playing');
  }, []);

  const current = deck[index];
  const isLast = index >= deck.length - 1;
  const progress = deck.length ? (index + 1) / deck.length : 0;

  const next = useCallback(() => {
    if (isLast) {
      setPhase('done');
    } else {
      setIndex((i) => i + 1);
    }
  }, [isLast]);

  const back = useCallback(() => {
    setIndex((i) => Math.max(0, i - 1));
  }, []);

  const cat = useMemo(() => (current ? CATEGORY_META[current.category] : null), [current]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="couples-back">
          <Text style={styles.iconText}>‹</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>COUPLES · PARTY GAME</Text>
          <Text style={styles.title}>Never Have I Ever</Text>
        </View>
      </View>

      {phase === 'intro' ? (
        <View style={styles.body} testID="couples-intro">
          <View style={styles.introCard}>
            <Text style={styles.introEmoji}>💞</Text>
            <Text style={styles.introTitle}>10 cards. One couple. Zero secrets.</Text>
            <Text style={styles.introText}>
              Flip through {QUESTIONS_PER_GAME} funny prompts together. Read each one out loud —
              if you’ve done it, own up (a point, a sip of your drink, a dramatic gasp… your rules).
            </Text>
            <View style={styles.howList}>
              <HowRow n={1} text="Take turns reading the card aloud." />
              <HowRow n={2} text="Both react — confess, deny, or negotiate." />
              <HowRow n={3} text="Tap Next for the next card. That’s it." />
            </View>
            <Text style={styles.introHint}>
              Every game deals a brand-new set from {POOL.length} prompts, so it never repeats.
            </Text>
          </View>
          <View style={styles.actions}>
            <Button label="Deal a new game" testID="couples-start" onPress={startGame} fullWidth />
          </View>
        </View>
      ) : null}

      {phase === 'playing' && current && cat ? (
        <View style={styles.body} testID="couples-playing">
          <View style={styles.progressRow}>
            <Text style={styles.progressText}>
              Card {index + 1} of {deck.length}
            </Text>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${Math.round(progress * 100)}%` }]} />
            </View>
          </View>

          <View style={[styles.card, { borderColor: cat.color }]} testID="couples-card">
            <View style={[styles.chip, { borderColor: cat.color }]}>
              <Text style={styles.chipEmoji}>{cat.emoji}</Text>
              <Text style={[styles.chipLabel, { color: cat.color }]}>{cat.label}</Text>
            </View>
            <Text style={styles.cardLead}>Never have I ever…</Text>
            <Text style={styles.cardText} testID="couples-card-text">
              {current.text}
            </Text>
          </View>

          <View style={styles.actions}>
            <Button
              label={isLast ? 'Finish game' : 'Next card'}
              testID="couples-next"
              onPress={next}
              fullWidth
            />
            <View style={{ height: spacing.sm }} />
            <View style={styles.secondaryRow}>
              <Pressable
                onPress={back}
                disabled={index === 0}
                style={[styles.secondaryBtn, index === 0 && { opacity: 0.4 }]}
                testID="couples-prev"
              >
                <Text style={styles.secondaryText}>‹ Previous</Text>
              </Pressable>
              <Pressable onPress={startGame} style={styles.secondaryBtn} testID="couples-reshuffle">
                <Text style={styles.secondaryText}>↻ New set</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}

      {phase === 'done' ? (
        <View style={styles.body} testID="couples-done">
          <View style={styles.introCard}>
            <Text style={styles.introEmoji}>🎉</Text>
            <Text style={styles.introTitle}>That’s a wrap!</Text>
            <Text style={styles.introText}>
              You made it through all {deck.length} cards. Whoever confessed the most either has the
              best stories… or the most explaining to do.
            </Text>
            <Text style={styles.introHint}>Ready for a completely new set of cards?</Text>
          </View>
          <View style={styles.actions}>
            <Button label="Play again (new cards)" testID="couples-play-again" onPress={startGame} fullWidth />
            <View style={{ height: spacing.sm }} />
            <Button
              label="Back home"
              variant="secondary"
              testID="couples-home"
              onPress={() => router.back()}
              fullWidth
            />
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

function HowRow({ n, text }: { n: number; text: string }) {
  return (
    <View style={styles.howRow}>
      <View style={styles.howDot}>
        <Text style={styles.howDotText}>{n}</Text>
      </View>
      <Text style={styles.howText}>{text}</Text>
    </View>
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
  eyebrow: { color: colors.accent, fontSize: 11, fontWeight: '900', letterSpacing: 3 },
  title: { color: colors.textPrimary, fontSize: 22, fontWeight: '900', marginTop: 2 },

  body: { flex: 1, paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },

  // Intro / done card
  introCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.xl,
    padding: spacing.xl,
    marginTop: spacing.md,
  },
  introEmoji: { fontSize: 40 },
  introTitle: { color: colors.textPrimary, fontSize: 22, fontWeight: '900', marginTop: spacing.md, letterSpacing: -0.4 },
  introText: { color: colors.textSecondary, fontSize: 14, lineHeight: 21, marginTop: spacing.sm },
  howList: { marginTop: spacing.lg, gap: spacing.md },
  howRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  howDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.elevated,
    borderColor: colors.border,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  howDotText: { color: colors.accent, fontSize: 12, fontWeight: '900' },
  howText: { flex: 1, color: colors.textPrimary, fontSize: 14, lineHeight: 20 },
  introHint: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: spacing.lg,
    fontStyle: 'italic',
  },

  // Progress
  progressRow: { marginTop: spacing.md, marginBottom: spacing.lg },
  progressText: { color: colors.textMuted, fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  track: {
    marginTop: spacing.sm,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.elevated,
    overflow: 'hidden',
  },
  fill: { height: '100%', backgroundColor: colors.accent },

  // Prompt card
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderRadius: radii.xl,
    padding: spacing.xl,
    justifyContent: 'center',
  },
  chip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  chipEmoji: { fontSize: 13 },
  chipLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 2 },
  cardLead: { color: colors.textMuted, fontSize: 15, fontWeight: '700', marginTop: spacing.xl },
  cardText: {
    color: colors.textPrimary,
    fontSize: 28,
    fontWeight: '900',
    lineHeight: 36,
    letterSpacing: -0.5,
    marginTop: spacing.sm,
  },

  // Actions
  actions: { marginTop: spacing.lg },
  secondaryRow: { flexDirection: 'row', gap: spacing.sm },
  secondaryBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  secondaryText: { color: colors.textSecondary, fontSize: 13, fontWeight: '700' },
});
