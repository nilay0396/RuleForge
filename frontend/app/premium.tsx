import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Modal } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../src/api';
import { useAuth } from '../src/auth';
import { colors, radii, spacing } from '../src/theme';
import Button from '../src/components/Button';

export default function Premium() {
  const router = useRouter();
  const { user, refresh } = useAuth();
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ method: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.premium();
      setData(r);
    } catch {}
  }, []);

  useFocusEffect(useCallback(() => { load(); refresh(); }, [load, refresh]));

  const subscribe = async (method: 'mock' | 'coins') => {
    setError(null);
    setBusy(true);
    try {
      await api.premiumSubscribe(method, 'monthly');
      await refresh();
      setDone({ method });
    } catch (e: any) {
      setError(e?.message || 'Could not start premium');
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    setBusy(true);
    try {
      await api.premiumCancel();
      await refresh();
    } catch {}
    finally { setBusy(false); }
  };

  const isPremium = !!user?.is_premium;
  const price = data?.price || {};
  const benefits = data?.benefits || [];

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="premium-back">
          <Text style={styles.iconBtnText}>‹</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>UPGRADE</Text>
          <Text style={styles.title}>RuleForge Premium</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Hero */}
        <View style={styles.hero}>
          <Text style={styles.heroCrown}>👑</Text>
          <Text style={styles.heroTitle}>{isPremium ? 'You’re Premium' : 'Play your way'}</Text>
          <Text style={styles.heroSub}>
            {isPremium
              ? 'Thanks for supporting RuleForge — you’ve unlocked every premium perk.'
              : 'Unlock exclusive themes, lose the ads, and get advanced stats — built for serious players.'}
          </Text>
        </View>

        {/* Benefits */}
        <View style={styles.benefitList}>
          {benefits.map((b: any) => (
            <View key={b.id} style={styles.benefit} testID={`benefit-${b.id}`}>
              <Text style={styles.benefitCheck}>✓</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.benefitTitle}>{b.title}</Text>
                <Text style={styles.benefitSub}>{b.description}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Pricing */}
        {!isPremium ? (
          <View style={styles.pricing}>
            <View style={styles.priceCard} testID="price-monthly">
              <Text style={styles.priceLabel}>MONTHLY</Text>
              <Text style={styles.priceValue}>${price.monthly_usd ?? '4.99'}</Text>
              <Text style={styles.priceFoot}>per month · cancel anytime</Text>
            </View>
            <View style={[styles.priceCard, { borderColor: colors.purple }]} testID="price-yearly">
              <Text style={[styles.priceLabel, { color: colors.purple }]}>YEARLY · BEST VALUE</Text>
              <Text style={styles.priceValue}>${price.yearly_usd ?? '39.99'}</Text>
              <Text style={styles.priceFoot}>save ~33% vs monthly</Text>
            </View>
          </View>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {/* CTAs */}
        <View style={{ marginTop: spacing.xl, gap: spacing.sm }}>
          {isPremium ? (
            busy ? <ActivityIndicator color={colors.accent} /> : (
              <Button label="Cancel premium" variant="danger" onPress={cancel} fullWidth testID="premium-cancel" />
            )
          ) : busy ? (
            <ActivityIndicator color={colors.accent} />
          ) : (
            <>
              <Button
                label="Subscribe (mock payment)"
                onPress={() => subscribe('mock')}
                fullWidth
                testID="premium-subscribe-mock"
              />
              <Button
                label={`Or pay with ${price.coins ?? 5000} coins`}
                variant="secondary"
                onPress={() => subscribe('coins')}
                fullWidth
                disabled={(user?.coins ?? 0) < (price.coins ?? 5000)}
                testID="premium-subscribe-coins"
              />
              {(user?.coins ?? 0) < (price.coins ?? 5000) ? (
                <Text style={styles.notEnough}>You need {(price.coins ?? 5000) - (user?.coins ?? 0)} more coins for the in-app option.</Text>
              ) : null}
            </>
          )}
        </View>

        <Text style={styles.disclaimer}>
          Mock payment for now — Stripe / Razorpay integration is wired-in via the same endpoint.
          Cancel anytime; nothing is auto-billed.
        </Text>
      </ScrollView>

      <Modal visible={!!done} transparent animationType="fade" onRequestClose={() => setDone(null)}>
        <View style={styles.modalScrim}>
          <View style={styles.modalCard}>
            <Text style={styles.modalCrown}>👑</Text>
            <Text style={styles.modalEyebrow}>WELCOME TO PREMIUM</Text>
            <Text style={styles.modalTitle}>You’re unlocked</Text>
            <Text style={styles.modalSub}>
              Exclusive themes, no ads, and advanced stats are now active. Visit the store to equip
              the new Obsidian board, Aurum pieces, and Crown avatar.
            </Text>
            <View style={{ height: spacing.lg }} />
            <Button label="Continue" fullWidth onPress={() => { setDone(null); router.replace('/store'); }} testID="premium-done" />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl * 2 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.md },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: radii.pill, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
  iconBtnText: { color: colors.textPrimary, fontSize: 20, fontWeight: '900' },
  eyebrow: { color: colors.purple, fontSize: 10, fontWeight: '900', letterSpacing: 3 },
  title: { color: colors.textPrimary, fontSize: 22, fontWeight: '900', marginTop: 2 },
  hero: {
    marginTop: spacing.lg, padding: spacing.xl,
    backgroundColor: colors.surface, borderColor: colors.purple, borderWidth: 1,
    borderRadius: radii.xl, alignItems: 'center',
  },
  heroCrown: { fontSize: 48 },
  heroTitle: { color: colors.textPrimary, fontSize: 24, fontWeight: '900', marginTop: 8 },
  heroSub: { color: colors.textSecondary, marginTop: 8, textAlign: 'center', lineHeight: 20 },
  benefitList: { marginTop: spacing.xl, gap: spacing.md },
  benefit: {
    flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start',
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    borderRadius: radii.md, padding: spacing.lg,
  },
  benefitCheck: { color: colors.purple, fontSize: 18, fontWeight: '900' },
  benefitTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: '800' },
  benefitSub: { color: colors.textSecondary, fontSize: 12, marginTop: 4 },
  pricing: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl },
  priceCard: {
    flex: 1, padding: spacing.lg,
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    borderRadius: radii.lg,
  },
  priceLabel: { color: colors.accent, fontSize: 10, fontWeight: '900', letterSpacing: 2 },
  priceValue: { color: colors.textPrimary, fontSize: 26, fontWeight: '900', marginTop: 6 },
  priceFoot: { color: colors.textMuted, fontSize: 11, marginTop: 4 },
  notEnough: { color: colors.textMuted, fontSize: 12, marginTop: 4, textAlign: 'center' },
  error: { color: colors.danger, marginTop: spacing.md, fontWeight: '700', textAlign: 'center' },
  disclaimer: { color: colors.textMuted, fontSize: 11, marginTop: spacing.xl, lineHeight: 16, textAlign: 'center' },
  modalScrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  modalCard: { width: '100%', maxWidth: 420, backgroundColor: colors.surface, borderColor: colors.purple, borderWidth: 1, borderRadius: radii.xl, padding: spacing.xl, alignItems: 'center' },
  modalCrown: { fontSize: 56 },
  modalEyebrow: { color: colors.purple, fontSize: 11, fontWeight: '900', letterSpacing: 4, marginTop: 8 },
  modalTitle: { color: colors.textPrimary, fontSize: 24, fontWeight: '900', marginTop: 4 },
  modalSub: { color: colors.textSecondary, marginTop: spacing.sm, textAlign: 'center', lineHeight: 20 },
});
