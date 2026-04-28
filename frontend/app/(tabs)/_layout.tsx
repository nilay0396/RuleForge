import { Tabs } from 'expo-router';
import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { Text, View, StyleSheet } from 'react-native';
import { useAuth } from '../../src/auth';
import { colors } from '../../src/theme';

function TabIcon({ glyph, color }: { glyph: string; color: string }) {
  return (
    <View style={styles.iconWrap}>
      <Text style={[styles.iconGlyph, { color }]}>{glyph}</Text>
    </View>
  );
}

export default function TabsLayout() {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user === null) router.replace('/onboarding');
  }, [user, router]);

  if (!user) return null;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 64,
          paddingTop: 8,
          paddingBottom: 8,
        },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'PLAY',
          tabBarIcon: ({ color }) => <TabIcon glyph="♛" color={color} />,
          tabBarTestID: 'tab-home',
        }}
      />
      <Tabs.Screen
        name="daily"
        options={{
          title: 'DAILY',
          tabBarIcon: ({ color }) => <TabIcon glyph="✦" color={color} />,
          tabBarTestID: 'tab-daily',
        }}
      />
      <Tabs.Screen
        name="store"
        options={{
          title: 'STORE',
          tabBarIcon: ({ color }) => <TabIcon glyph="✧" color={color} />,
          tabBarTestID: 'tab-store',
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'PROFILE',
          tabBarIcon: ({ color }) => <TabIcon glyph="◉" color={color} />,
          tabBarTestID: 'tab-profile',
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconWrap: { alignItems: 'center', justifyContent: 'center', height: 24 },
  iconGlyph: { fontSize: 22, fontWeight: '900' },
});
