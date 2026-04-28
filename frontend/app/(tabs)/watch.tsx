import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl, ActivityIndicator } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../../src/api';
import { useAuth } from '../../src/auth';
import { colors, radii, spacing } from '../../src/theme';

type LiveGame = {
  game_id: string;
  white: { id: string; name: string; elo: number; country?: string; is_featured?: boolean };
  black: { id: string; name: string; elo: number; country?: string; is_featured?: boolean };
  rule_key: string;
  fen: string;
  moves: number;
  spectators: number;
  featured: boolean;
};

export default function Watch() {
  const router = useRouter();
  const { user } = useAuth();
  const [games, setGames] = useState<LiveGame[]>([]);
  const [featured, setFeatured] = useState<any[]>([]);
  const [leaders, setLeaders] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [g, f, lb] = await Promise.all([
        api.liveGames(),
        api.featuredPlayers(),
        api.globalLeaderboard('global', undefined, 5),
      ]);
      setGames(g.games || []);
      setFeatured(f.featured || []);
      setLeaders(lb.leaderboard || []);
    } catch {}
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>WATCH LIVE</Text>
            <Text style={styles.title}>Live arena</Text>
          </View>
          <Pressable onPress={() => router.push('/leaderboard')} style={styles.lbChip} testID="lb-pill">
            <Text style={styles.lbChipText}>☰ LEADERBOARD</Text>
          </Pressable>
        </View>

        {/* Featured players */}
        {featured.length > 0 ? (
          <View style={{ marginTop: spacing.lg }}>
            <Text style={styles.sectionTitle}>Featured players</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.md, paddingVertical: spacing.sm }}>
              {featured.map((f) => (
                <View key={f.id} style={styles.featureCard} testID={`featured-${f.id}`}>
                  <View style={styles.crownBadge}><Text>👑</Text></View>
                  <Text style={styles.featureName} numberOfLines={1}>{f.name}</Text>
                  <Text style={styles.featureMeta}>{f.country || '—'} · {f.elo} ELO</Text>
                </View>
              ))}
            </ScrollView>
          </View>
        ) : null}

        {/* Live games */}
        <View style={{ marginTop: spacing.xl }}>
          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>Live games</Text>
            <View style={styles.liveDot}><View style={styles.liveDotInner} /><Text style={styles.liveDotText}>LIVE · {games.length}</Text></View>
          </View>
          {loading ? (
            <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.lg }} />
          ) : games.length === 0 ? (
            <View style={styles.emptyCard} testID="watch-empty">
              <Text style={styles.emptyTitle}>No live games right now</Text>
              <Text style={styles.emptySub}>Be the first — jump into online matchmaking and someone may end up watching you.</Text>
              <Pressable
                onPress={() => router.push({ pathname: '/online' })}
                style={styles.emptyBtn}
                testID="watch-find-game"
              >
                <Text style={styles.emptyBtnText}>Find an opponent</Text>
              </Pressable>
            </View>
          ) : (
            <View style={{ gap: spacing.md, marginTop: spacing.sm }}>
              {games.map((g) => (
                <Pressable
                  key={g.game_id}
                  onPress={() => router.push({ pathname: '/spectate', params: { game_id: g.game_id } })}
                  style={[styles.gameCard, g.featured && { borderColor: colors.purple }]}
                  testID={`live-game-${g.game_id}`}
                >
                  {g.featured ? <Text style={styles.gameBadge}>★ FEATURED</Text> : null}
                  <View style={styles.gameRow}>
                    <PlayerSide player={g.white} side="W" />
                    <Text style={styles.vs}>vs</Text>
                    <PlayerSide player={g.black} side="B" />
                  </View>
                  <View style={styles.gameMeta}>
                    <Text style={styles.gameMetaText}>{g.rule_key.replace('_', ' ').toUpperCase()}</Text>
                    <Text style={styles.gameMetaText}>• {g.moves} moves</Text>
                    <Text style={styles.gameMetaText}>• {g.spectators} watching</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        {/* Top players preview */}
        <View style={{ marginTop: spacing.xl }}>
          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>Top of the world</Text>
            <Pressable onPress={() => router.push('/leaderboard')} testID="see-all-lb">
              <Text style={styles.linkText}>See all ›</Text>
            </Pressable>
          </View>
          {leaders.slice(0, 5).map((p) => (
            <View key={p.id} style={styles.lbRow} testID={`top-${p.id}`}>
              <Text style={styles.lbRank}>#{p.rank}</Text>
              <Text style={styles.lbName} numberOfLines={1}>{p.name} {p.is_featured ? '★' : ''}</Text>
              <Text style={styles.lbCountry}>{p.country || '—'}</Text>
              <Text style={styles.lbElo}>{p.elo}</Text>
            </View>
          ))}
        </View>
        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function PlayerSide({ player, side }: { player: any; side: 'W' | 'B' }) {
  return (
    <View style={{ flex: 1 }}>
      <View style={styles.sideRow}>
        <View style={[styles.sideDot, side === 'W' ? styles.dotWhite : styles.dotBlack]} />
        <Text style={styles.sidePlayer} numberOfLines={1}>
          {player.name}{player.is_featured ? ' ★' : ''}
        </Text>
      </View>
      <Text style={styles.sideMeta}>{player.country || '—'} · {player.elo} ELO</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.xl, paddingBottom: spacing.xxl * 2 },
  header: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  eyebrow: { color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 4 },
  title: { color: colors.textPrimary, fontSize: 24, fontWeight: '900', marginTop: 2 },
  lbChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radii.pill, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
  lbChipText: { color: colors.textPrimary, fontSize: 11, fontWeight: '900', letterSpacing: 1.4 },
  sectionTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '900' },
  sectionRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: spacing.sm },
  linkText: { color: colors.accent, fontWeight: '800', fontSize: 12 },
  featureCard: { width: 130, padding: spacing.md, backgroundColor: colors.surface, borderColor: colors.purple, borderWidth: 1, borderRadius: radii.md, alignItems: 'center' },
  crownBadge: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.elevated, alignItems: 'center', justifyContent: 'center' },
  featureName: { color: colors.textPrimary, fontSize: 13, fontWeight: '800', marginTop: 6 },
  featureMeta: { color: colors.textSecondary, fontSize: 10, marginTop: 2 },
  liveDot: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDotInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.danger },
  liveDotText: { color: colors.danger, fontSize: 10, fontWeight: '900', letterSpacing: 2 },
  gameCard: { padding: spacing.lg, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radii.lg, gap: 8 },
  gameBadge: { color: colors.purple, fontSize: 10, fontWeight: '900', letterSpacing: 3 },
  gameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  vs: { color: colors.textMuted, fontSize: 11, fontWeight: '900' },
  sideRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sideDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1, borderColor: colors.border },
  dotWhite: { backgroundColor: '#F4F4F5' },
  dotBlack: { backgroundColor: '#0A0A0B' },
  sidePlayer: { color: colors.textPrimary, fontWeight: '800', fontSize: 13, flex: 1 },
  sideMeta: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  gameMeta: { flexDirection: 'row', gap: 6, marginTop: 4 },
  gameMetaText: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
  emptyCard: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radii.lg, padding: spacing.xl, alignItems: 'center' },
  emptyTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: '900' },
  emptySub: { color: colors.textSecondary, marginTop: 6, textAlign: 'center', lineHeight: 19, fontSize: 12 },
  emptyBtn: { marginTop: spacing.md, paddingHorizontal: 16, paddingVertical: 10, borderRadius: radii.pill, backgroundColor: colors.accent },
  emptyBtnText: { color: '#0A0A0B', fontWeight: '900' },
  lbRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomColor: colors.border, borderBottomWidth: 1, gap: spacing.md },
  lbRank: { color: colors.accent, width: 36, fontWeight: '900' },
  lbName: { flex: 1, color: colors.textPrimary, fontWeight: '700' },
  lbCountry: { color: colors.textMuted, width: 30, textAlign: 'center', fontSize: 11, fontWeight: '900' },
  lbElo: { color: colors.textPrimary, fontWeight: '900', width: 56, textAlign: 'right' },
});
