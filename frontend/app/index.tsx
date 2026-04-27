import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '../src/auth';
import { colors } from '../src/theme';

export default function Index() {
  const { user } = useAuth();

  if (user === undefined) {
    return (
      <View style={styles.container} testID="splash-screen">
        <Text style={styles.brand}>RuleForge</Text>
        <Text style={styles.tag}>CHESS</Text>
        <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} />
      </View>
    );
  }
  if (user) return <Redirect href="/home" />;
  return <Redirect href="/onboarding" />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: {
    color: colors.textPrimary,
    fontSize: 36,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  tag: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 6,
    marginTop: 4,
  },
});
