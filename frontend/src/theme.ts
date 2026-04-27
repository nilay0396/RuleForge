// Theme tokens for RuleForge Chess (premium dark — Jewel & Luxury)
export const colors = {
  bg: '#09090B',
  surface: '#121214',
  elevated: '#1A1A1E',
  border: '#27272A',
  borderSoft: '#1F1F22',
  textPrimary: '#FAFAFA',
  textSecondary: '#A1A1AA',
  textMuted: '#71717A',
  textDisabled: '#52525B',
  accent: '#EAB308',           // gold
  accentSoft: 'rgba(234,179,8,0.15)',
  danger: '#EF4444',
  success: '#10B981',
  info: '#06B6D4',
  purple: '#8B5CF6',
  orange: '#F97316',
  // Board
  boardLight: '#E8E1CF',
  boardDark: '#7A6A4F',
  boardHighlight: 'rgba(234,179,8,0.55)',
  boardLegal: 'rgba(234,179,8,0.35)',
  boardLastMove: 'rgba(56,189,248,0.35)',
  boardCheck: 'rgba(239,68,68,0.55)',
};

export const ruleColors: Record<string, string> = {
  classic: '#EAB308',
  king_dash: '#06B6D4',
  power_pawns: '#EF4444',
  swap_move: '#10B981',
  fog_chess: '#8B5CF6',
  capture_boost: '#F97316',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const radii = {
  sm: 8,
  md: 12,
  lg: 18,
  xl: 24,
  pill: 999,
};

export const fontFamily = {
  // Use system fonts to keep bundle light; weights still convey premium feel.
  heading: undefined as string | undefined,
  body: undefined as string | undefined,
};
