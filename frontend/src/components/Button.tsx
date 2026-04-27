import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { colors, radii, spacing } from '../theme';

type Props = {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  testID?: string;
  disabled?: boolean;
  fullWidth?: boolean;
  iconLeft?: React.ReactNode;
};

export default function Button({
  label,
  onPress,
  variant = 'primary',
  testID,
  disabled,
  fullWidth,
  iconLeft,
}: Props) {
  const styleMap = {
    primary: { bg: colors.accent, text: '#0A0A0B', border: 'transparent' },
    secondary: { bg: 'transparent', text: colors.textPrimary, border: colors.border },
    ghost: { bg: 'transparent', text: colors.textSecondary, border: 'transparent' },
    danger: { bg: 'transparent', text: colors.danger, border: colors.danger },
  } as const;
  const s = styleMap[variant];
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        {
          backgroundColor: s.bg,
          borderColor: s.border,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
          alignSelf: fullWidth ? 'stretch' : 'auto',
        },
      ]}
    >
      {iconLeft ? <View style={{ marginRight: spacing.sm }}>{iconLeft}</View> : null}
      <Text style={[styles.text, { color: s.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    paddingHorizontal: spacing.xl,
    paddingVertical: 14,
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
