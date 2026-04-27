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

export default function Login() {
  const router = useRouter();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError(null);
    if (!email || !password) {
      setError('Please enter both email and password.');
      return;
    }
    setLoading(true);
    try {
      await signIn(email.trim(), password);
      router.replace('/home');
    } catch (e: any) {
      setError(e?.message || 'Login failed');
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
          <Pressable onPress={() => router.back()} testID="login-back" style={styles.back}>
            <Text style={styles.backText}>‹ Back</Text>
          </Pressable>

          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.subtitle}>Pick up where you left off.</Text>

          <View style={styles.field}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              testID="login-email"
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
              testID="login-password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="••••••••"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />
          </View>

          {error ? (
            <Text testID="login-error" style={styles.error}>
              {error}
            </Text>
          ) : null}

          <View style={{ height: spacing.lg }} />
          <Button
            label={loading ? 'Signing in...' : 'Sign in'}
            testID="login-submit"
            onPress={submit}
            disabled={loading}
            fullWidth
          />
          <View style={{ height: spacing.md }} />
          <Button
            label="Create new account"
            testID="login-go-register"
            variant="secondary"
            onPress={() => router.replace('/register')}
            fullWidth
          />
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
