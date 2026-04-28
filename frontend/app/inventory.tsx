import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../src/api';
import { colors, radii, spacing } from '../src/theme';

type InventoryRow = {
  id: string; user_id: string; item_key: string; type: string;
  acquired_via: string; price_paid?: number; created_at: string;
  equipped: boolean;
  item: { name: string; type: string; preview?: any; price_coins: number; description?: string };
};

export default function Inventory() {
  const router = useRouter();
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.inventory();
      setRows(r.inventory || []);
    } catch {}
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const equip = async (row: InventoryRow) => {
    setBusy(row.item_key);
    try {
      const body: any = {};
      if (row.type === 'board') body.board_theme = row.item_key;
      if (row.type === 'piece') body.piece_style = row.item_key;
      if (row.type === 'avatar') body.avatar = row.item_key;
      await api.setPreferences(body);
      await load();
    } catch {}
    finally { setBusy(null); }
  };

  // Group by type
  const byType: Record<string, InventoryRow[]> = { board: [], piece: [], avatar: [] };
  rows.forEach((r) => { (byType[r.type] ||= []).push(r); });

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="inventory-back">
          <Text style={styles.iconBtnText}>‹</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>OWNED</Text>
          <Text style={styles.title}>My inventory</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
        {(['board', 'piece', 'avatar'] as const).map((t) => (
          <View key={t} style={{ marginTop: spacing.lg }}>
            <Text style={styles.sectionTitle}>{t === 'board' ? 'Boards' : t === 'piece' ? 'Pieces' : 'Avatars'}</Text>
            {(byType[t] || []).length === 0 ? (
              <Text style={styles.empty}>You don’t own any {t} yet.</Text>
            ) : (
              <View style={styles.grid}>
                {byType[t].map((r) => (
                  <Pressable
                    key={r.id}
                    onPress={() => !r.equipped && equip(r)}
                    style={[styles.card, r.equipped && { borderColor: colors.success }]}
                    disabled={busy === r.item_key}
                    testID={`inv-${r.item_key}`}
                  >
                    <Text style={styles.cardEyebrow}>{r.type.toUpperCase()}</Text>
                    <Text style={styles.cardName}>{r.item?.name || r.item_key}</Text>
                    <Text style={[styles.cardStatus, { color: r.equipped ? colors.success : colors.accent }]}>
                      {busy === r.item_key ? 'Equipping…' : r.equipped ? 'EQUIPPED' : 'Tap to equip'}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        ))}
        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xl },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.md },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: radii.pill, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
  iconBtnText: { color: colors.textPrimary, fontSize: 20, fontWeight: '900' },
  eyebrow: { color: colors.textMuted, fontSize: 10, fontWeight: '900', letterSpacing: 3 },
  title: { color: colors.textPrimary, fontSize: 22, fontWeight: '900', marginTop: 2 },
  sectionTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '900', letterSpacing: -0.2 },
  empty: { color: colors.textMuted, marginTop: 8, fontSize: 13 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.md },
  card: {
    width: '47%', padding: spacing.md,
    backgroundColor: colors.surface, borderRadius: radii.lg,
    borderColor: colors.border, borderWidth: 1,
  },
  cardEyebrow: { color: colors.textMuted, fontSize: 10, fontWeight: '900', letterSpacing: 2 },
  cardName: { color: colors.textPrimary, fontSize: 15, fontWeight: '800', marginTop: 4 },
  cardStatus: { fontSize: 11, fontWeight: '900', letterSpacing: 1.5, marginTop: 8 },
});
