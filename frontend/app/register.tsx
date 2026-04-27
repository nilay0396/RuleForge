import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../src/auth';
import { colors, radii, spacing } from '../src/theme';
import Button from '../src/components/Button';

export default function Register() {
  const router = useRouter();
  const { signUp, user, upgradeGuest } = useAuth();
  const isGuestUpgrade = !!user && user.is_guest;

  const [name, setName] = useState(user?.is_guest ? '' : '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError(null);
    if (!name.trim() || !email.trim() || password.length < 6) {
      setError('Name, email and a password (min 6 chars) are required.');
      return;
    }
    setLoading(true);
    try {
      if (isGuestUpgrade) await upgradeGuest(email.trim(), password, name.trim());
      else await signUp(email.trim(), password, name.trim());
      router.replace('/home');
    } catch (e: any) {
      setError(e?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Pressable onPress={() => router.back()} testID="reg-back" style={styles.back}>
            <Text style={styles.backText}>‹ Back</Text>
          </Pressable>
          <Text style={styles.title}>{isGuestUpgrade ? 'Save your progress' : 'Create account'}</Text>
          <Text style={styles.subtitle}>
            {isGuestUpgrade
              ? 'Upgrade your guest profile to keep your XP, coins and streaks.'
              : 'Track your XP, climb the leaderboard, earn badges.'}
          </Text>
          <View style={styles.field}>
            <Text style={styles.label}>Name</Text>
            <TextInput
              testID="reg-name"
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              testID="reg-email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="you@example.com"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              testID="reg-password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="At least 6 characters"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />
          </View>
          {error ? (
            <Text testID="reg-error" style={styles.error}>
              {error}
            </Text>
          ) : null}
          <View style={{ height: spacing.lg }} />
          <Button
            label={loading ? 'Creating...' : isGuestUpgrade ? 'Save my account' : 'Create account'}
            testID="reg-submit"
            onPress={submit}
            disabled={loading}
            fullWidth
          />
          {!isGuestUpgrade && (
            <>
              <View style={{ height: spacing.md }} />
              <Button
                label="I already have an account"
                testID="reg-go-login"
                variant="secondary"
                onPress={() => router.replace('/login')}
                fullWidth
              />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.xl, flexGrow: 1 },
  back: { alignSelf: 'flex-start', paddingVertical: spacing.sm },
  backText: { color: colors.textSecondary, fontSize: 16, fontWeight: '600' },
  title: {
    color: colors.textPrimary,
    fontSize: 32,
    fontWeight: '900',
    marginTop: spacing.lg,
    letterSpacing: -0.5,
  },
  subtitle: { color: colors.textSecondary, marginTop: spacing.xs, marginBottom: spacing.xl },
  field: { marginBottom: spacing.md },
  label: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    color: colors.textPrimary,
    fontSize: 16,
  },
  error: {
    color: colors.danger,
    marginTop: spacing.sm,
    fontWeight: '600',
  },
});
