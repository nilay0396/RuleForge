import { View, Text, StyleSheet, ImageBackground, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../src/auth';
import { colors, radii, spacing } from '../src/theme';
import Button from '../src/components/Button';

export default function Onboarding() {
  const router = useRouter();
  const { signInAsGuest } = useAuth();

  const playAsGuest = async () => {
    try {
      await signInAsGuest();
      router.replace('/home');
    } catch (e: any) {
      // ignore — guest creation should not fail
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'bottom']}>
      <ImageBackground
        source={{
          uri: 'https://images.unsplash.com/photo-1770745559994-545619d3c3da?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200',
        }}
        style={styles.bg}
        imageStyle={{ opacity: 0.35 }}
      >
        <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
          <View style={styles.brandBlock}>
            <Text style={styles.eyebrow}>RULEFORGE</Text>
            <Text style={styles.title}>Chess.{'\n'}But Forged{'\n'}With Rules.</Text>
            <Text style={styles.subtitle}>
              Familiar like chess. Wild like nothing else. Discover new game-changing rules every day.
            </Text>
          </View>

          <View style={styles.featureBlock}>
            <Feature
              accent={colors.info}
              title="King Dash"
              text="Once per game, your king can sprint two squares."
            />
            <Feature
              accent={colors.danger}
              title="Power Pawns"
              text="Pawns gain sideways slides past the 5th rank."
            />
            <Feature
              accent={colors.success}
              title="Swap Move"
              text="Once per game, swap any two of your own pieces."
            />
          </View>

          <View style={styles.actions}>
            <Button
              label="Create account"
              testID="onboard-signup-btn"
              onPress={() => router.push('/register')}
              fullWidth
            />
            <View style={{ height: spacing.md }} />
            <Button
              label="I already have an account"
              testID="onboard-login-btn"
              variant="secondary"
              onPress={() => router.push('/login')}
              fullWidth
            />
            <View style={{ height: spacing.md }} />
            <Button
              label="Continue as guest"
              testID="onboard-guest-btn"
              variant="ghost"
              onPress={playAsGuest}
              fullWidth
            />
          </View>
        </ScrollView>
      </ImageBackground>
    </SafeAreaView>
  );
}

function Feature({ accent, title, text }: { accent: string; title: string; text: string }) {
  return (
    <View style={styles.feature}>
      <View style={[styles.featureBadge, { backgroundColor: accent }]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.featureTitle}>{title}</Text>
        <Text style={styles.featureText}>{text}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: colors.bg },
  container: {
    flexGrow: 1,
    padding: spacing.xl,
    justifyContent: 'space-between',
  },
  brandBlock: { marginTop: spacing.xl },
  eyebrow: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 6,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 44,
    fontWeight: '900',
    letterSpacing: -1,
    marginTop: spacing.md,
    lineHeight: 48,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 16,
    marginTop: spacing.lg,
    maxWidth: 380,
    lineHeight: 22,
  },
  featureBlock: {
    marginTop: spacing.xxl,
    gap: spacing.md,
  },
  feature: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.lg,
  },
  featureBadge: {
    width: 10,
    height: 36,
    borderRadius: 6,
  },
  featureTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  featureText: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  actions: { marginTop: spacing.xxl, marginBottom: spacing.lg },
});
