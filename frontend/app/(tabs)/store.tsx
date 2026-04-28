import { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, RefreshControl,
  Modal, ActivityIndicator,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../../src/api';
import { useAuth } from '../../src/auth';
import { colors, radii, spacing } from '../../src/theme';
import Button from '../../src/components/Button';

type StoreItem = {
  id: string; key: string; name: string; type: 'board' | 'piece' | 'avatar';
  price_coins: number; premium_only: boolean; description?: string;
  preview?: any; default?: boolean;
  owned: boolean; equipped: boolean; locked_premium: boolean;
};

const TABS: { key: 'board' | 'piece' | 'avatar'; label: string }[] = [
  { key: 'board', label: 'Boards' },
  { key: 'piece', label: 'Pieces' },
  { key: 'avatar', label: 'Avatars' },
];

export default function StoreScreen() {
  const router = useRouter();
  const { user, refresh } = useAuth();
  const [grouped, setGrouped] = useState<Record<string, StoreItem[]>>({});
  const [tab, setTab] = useState<'board' | 'piece' | 'avatar'>('board');
  const [refreshing, setRefreshing] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [preview, setPreview] = useState<StoreItem | null>(null);
  const [adsBusy, setAdsBusy] = useState(false);
  const [adsState, setAdsState] = useState<{ available: boolean; remaining: number; limit: number; reward_coins: number; is_premium: boolean } | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.store();
      setGrouped(r.grouped);
    } catch {}
    try {
      const a = await api.adsState();
      setAdsState(a);
    } catch {}
  }, []);

  useFocusEffect(useCallback(() => {
    load();
    refresh();
  }, [load, refresh]));

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([load(), refresh()]);
    setRefreshing(false);
  };

  const buy = async (item: StoreItem) => {
    if (item.locked_premium) {
      router.push('/premium');
      return;
    }
    setBusyKey(item.key);
    try {
      await api.storeBuy(item.key);
      await Promise.all([load(), refresh()]);
      setPreview(null);
    } catch (e: any) {
      // Surface error inside preview modal
      setPreview((p) => p ? ({ ...p, _err: e?.message || 'Could not purchase' } as any) : p);
    } finally {
      setBusyKey(null);
    }
  };

  const equip = async (item: StoreItem) => {
    setBusyKey(item.key);
    try {
      const body: any = {};
      if (item.type === 'board') body.board_theme = item.key;
      if (item.type === 'piece') body.piece_style = item.key;
      if (item.type === 'avatar') body.avatar = item.key;
      await api.setPreferences(body);
      await load();
      setPreview(null);
    } catch (e: any) {
      setPreview((p) => p ? ({ ...p, _err: e?.message || 'Could not equip' } as any) : p);
    } finally {
      setBusyKey(null);
    }
  };

  const watchAd = async () => {
    if (!adsState?.available) return;
    setAdsBusy(true);
    try {
      // Simulate ad watching delay (3s) — production would render an actual ad SDK here
      await new Promise((res) => setTimeout(res, 1200));
      const r = await api.adsReward();
      await Promise.all([load(), refresh()]);
      setAdsState((s) => s ? { ...s, remaining: r.remaining, available: r.remaining > 0 } : s);
    } catch {}
    finally { setAdsBusy(false); }
  };

  const items = grouped[tab] || [];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>STORE</Text>
            <Text style={styles.title}>Personalize your play</Text>
          </View>
          <Pressable
            onPress={() => router.push('/inventory')}
            style={styles.coinChip}
            testID="store-coins"
          >
            <Text style={styles.coinIcon}>🟡</Text>
            <Text style={styles.coinValue}>{user?.coins ?? 0}</Text>
          </Pressable>
        </View>

        {/* Premium upsell */}
        {!user?.is_premium ? (
          <Pressable
            onPress={() => router.push('/premium')}
            style={styles.premiumBanner}
            testID="store-premium-banner"
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.premiumEyebrow}>UPGRADE · PREMIUM</Text>
              <Text style={styles.premiumTitle}>Unlock exclusive themes</Text>
              <Text style={styles.premiumSub}>Obsidian board · Aurum pieces · Crown · No ads</Text>
            </View>
            <Text style={styles.premiumArrow}>›</Text>
          </Pressable>
        ) : null}

        {/* Rewarded ad card */}
        {adsState && !adsState.is_premium && adsState.limit > 0 ? (
          <View style={styles.adCard} testID="store-ad-card">
            <View style={{ flex: 1 }}>
              <Text style={styles.adEyebrow}>FREE COINS</Text>
              <Text style={styles.adTitle}>Watch a quick ad</Text>
              <Text style={styles.adSub}>+{adsState.reward_coins} coins · {adsState.remaining}/{adsState.limit} left today</Text>
            </View>
            {adsBusy ? (
              <ActivityIndicator color={colors.accent} />
            ) : (
              <Pressable
                onPress={watchAd}
                disabled={!adsState.available}
                style={[styles.adBtn, !adsState.available && { opacity: 0.4 }]}
                testID="watch-ad-btn"
              >
                <Text style={styles.adBtnText}>{adsState.available ? 'Watch' : 'Daily limit reached'}</Text>
              </Pressable>
            )}
          </View>
        ) : null}

        {/* Tabs */}
        <View style={styles.tabsRow}>
          {TABS.map((t) => (
            <Pressable
              key={t.key}
              onPress={() => setTab(t.key)}
              style={[styles.tab, tab === t.key && styles.tabActive]}
              testID={`store-tab-${t.key}`}
            >
              <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* Grid */}
        <View style={styles.grid}>
          {items.map((it) => (
            <Pressable
              key={it.key}
              onPress={() => setPreview(it)}
              style={[
                styles.card,
                it.equipped && { borderColor: colors.success },
                it.locked_premium && { opacity: 0.85 },
              ]}
              testID={`store-item-${it.key}`}
            >
              <ItemPreview item={it} />
              <Text style={styles.cardName} numberOfLines={1}>{it.name}</Text>
              <View style={styles.cardFoot}>
                {it.equipped ? (
                  <Text style={[styles.cardPrice, { color: colors.success }]}>EQUIPPED</Text>
                ) : it.owned ? (
                  <Text style={[styles.cardPrice, { color: colors.accent }]}>OWNED</Text>
                ) : it.locked_premium ? (
                  <Text style={[styles.cardPrice, { color: colors.purple }]}>PREMIUM</Text>
                ) : (
                  <Text style={styles.cardPrice}>{it.price_coins === 0 ? 'FREE' : `${it.price_coins} 🟡`}</Text>
                )}
              </View>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      {/* Preview modal */}
      <Modal visible={!!preview} transparent animationType="fade" onRequestClose={() => setPreview(null)}>
        <View style={styles.modalScrim}>
          <View style={styles.modalCard}>
            {preview ? (
              <>
                <Text style={styles.modalEyebrow}>{preview.type.toUpperCase()}</Text>
                <Text style={styles.modalTitle}>{preview.name}</Text>
                {preview.locked_premium ? (
                  <Text style={[styles.modalLock, { color: colors.purple }]}>👑 Premium-only</Text>
                ) : null}
                <View style={styles.previewBox}>
                  <ItemPreview item={preview} large />
                </View>
                {preview.description ? (
                  <Text style={styles.modalDesc}>{preview.description}</Text>
                ) : null}
                {(preview as any)._err ? (
                  <Text style={styles.modalErr}>{(preview as any)._err}</Text>
                ) : null}
                <View style={{ height: spacing.lg }} />
                {busyKey === preview.key ? (
                  <ActivityIndicator color={colors.accent} />
                ) : preview.equipped ? (
                  <Button label="Equipped" disabled fullWidth />
                ) : preview.owned ? (
                  <Button label="Equip" onPress={() => equip(preview)} fullWidth testID="item-equip-btn" />
                ) : preview.locked_premium ? (
                  <Button label="Upgrade to Premium" onPress={() => { setPreview(null); router.push('/premium'); }} fullWidth />
                ) : (
                  <Button
                    label={preview.price_coins === 0 ? 'Claim free' : `Buy for ${preview.price_coins} coins`}
                    onPress={() => buy(preview)}
                    fullWidth
                    disabled={(user?.coins ?? 0) < preview.price_coins}
                    testID="item-buy-btn"
                  />
                )}
                {!preview.owned && !preview.locked_premium && preview.price_coins > 0 && (user?.coins ?? 0) < preview.price_coins ? (
                  <Text style={styles.modalNotEnough}>You need {preview.price_coins - (user?.coins ?? 0)} more coins.</Text>
                ) : null}
                <View style={{ height: spacing.sm }} />
                <Button label="Close" variant="ghost" onPress={() => setPreview(null)} fullWidth />
              </>
            ) : null}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function ItemPreview({ item, large }: { item: StoreItem; large?: boolean }) {
  const size = large ? 120 : 80;
  if (item.type === 'board') {
    const light = item.preview?.light || '#E8E1CF';
    const dark = item.preview?.dark || '#7A6A4F';
    // 4x4 mini board
    const cells: React.ReactNode[] = [];
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        const isLight = (r + c) % 2 === 0;
        cells.push(
          <View key={`${r}-${c}`} style={{ width: size / 4, height: size / 4, backgroundColor: isLight ? light : dark }} />,
        );
      }
    }
    return (
      <View style={[styles.boardPreview, { width: size, height: size }]}>
        {cells}
      </View>
    );
  }
  if (item.type === 'piece') {
    const glyph = item.preview?.glyph || '♚';
    return (
      <View style={[styles.piecePreview, { width: size, height: size }]}>
        <Text style={{ fontSize: size * 0.6, color: colors.textPrimary }}>{glyph}</Text>
      </View>
    );
  }
  // avatar
  const emoji = item.preview?.emoji || '♟';
  return (
    <View style={[styles.avatarPreview, { width: size, height: size }]}>
      <Text style={{ fontSize: size * 0.6 }}>{emoji}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.xl, paddingBottom: spacing.xxl * 2 },
  header: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  eyebrow: { color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 4 },
  title: { color: colors.textPrimary, fontSize: 24, fontWeight: '900', marginTop: 2, letterSpacing: -0.4 },
  coinChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: radii.pill, backgroundColor: colors.surface,
    borderColor: colors.border, borderWidth: 1,
  },
  coinIcon: { fontSize: 14 },
  coinValue: { color: colors.accent, fontWeight: '900' },
  premiumBanner: {
    marginTop: spacing.lg, padding: spacing.lg,
    borderRadius: radii.lg, backgroundColor: colors.surface,
    borderColor: colors.purple, borderWidth: 1,
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
  },
  premiumEyebrow: { color: colors.purple, fontSize: 10, fontWeight: '900', letterSpacing: 3 },
  premiumTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: '900', marginTop: 4 },
  premiumSub: { color: colors.textSecondary, fontSize: 12, marginTop: 4 },
  premiumArrow: { color: colors.purple, fontSize: 28, fontWeight: '900' },
  adCard: {
    marginTop: spacing.md, padding: spacing.lg,
    borderRadius: radii.lg, backgroundColor: colors.surface,
    borderColor: colors.border, borderWidth: 1,
    flexDirection: 'row', alignItems: 'center',
  },
  adEyebrow: { color: colors.info, fontSize: 10, fontWeight: '900', letterSpacing: 3 },
  adTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '800', marginTop: 4 },
  adSub: { color: colors.textSecondary, fontSize: 12, marginTop: 4 },
  adBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radii.pill, backgroundColor: colors.info },
  adBtnText: { color: '#0A0A0B', fontWeight: '900' },
  tabsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl },
  tab: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
  },
  tabActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  tabText: { color: colors.textSecondary, fontWeight: '800', fontSize: 12 },
  tabTextActive: { color: '#0A0A0B' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.lg },
  card: {
    width: '47%', padding: spacing.md,
    backgroundColor: colors.surface, borderRadius: radii.lg,
    borderColor: colors.border, borderWidth: 1,
    alignItems: 'center', gap: 8,
  },
  boardPreview: {
    flexDirection: 'row', flexWrap: 'wrap',
    borderRadius: radii.sm, overflow: 'hidden',
    borderColor: colors.border, borderWidth: 1,
  },
  piecePreview: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.elevated, borderRadius: radii.md },
  avatarPreview: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.elevated, borderRadius: 999 },
  cardName: { color: colors.textPrimary, fontWeight: '800', fontSize: 13, marginTop: 4 },
  cardFoot: { marginTop: 2 },
  cardPrice: { color: colors.textSecondary, fontSize: 12, fontWeight: '900' },
  modalScrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  modalCard: { width: '100%', maxWidth: 420, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radii.xl, padding: spacing.xl, alignItems: 'center' },
  modalEyebrow: { color: colors.accent, fontSize: 11, fontWeight: '900', letterSpacing: 4 },
  modalTitle: { color: colors.textPrimary, fontSize: 24, fontWeight: '900', marginTop: 4, textAlign: 'center' },
  modalLock: { fontSize: 13, fontWeight: '800', marginTop: 4 },
  previewBox: { marginTop: spacing.lg, padding: spacing.md, alignItems: 'center', justifyContent: 'center' },
  modalDesc: { color: colors.textSecondary, fontSize: 13, marginTop: spacing.sm, textAlign: 'center', lineHeight: 19 },
  modalErr: { color: colors.danger, fontWeight: '700', marginTop: spacing.sm, textAlign: 'center' },
  modalNotEnough: { color: colors.textMuted, fontSize: 12, marginTop: 6, textAlign: 'center' },
});
