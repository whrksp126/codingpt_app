import React from 'react';
import { Pressable, Text, View, StyleSheet, ViewStyle, ActivityIndicator } from 'react-native';
import { v2Colors, v2Radius, v2Font } from '../../theme/v2Tokens';

type Variant = 'primary' | 'accent' | 'ghost' | 'outline';

interface ButtonProps {
  children: React.ReactNode;
  variant?: Variant;
  full?: boolean;
  sm?: boolean;
  icon?: React.ReactNode;
  loading?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
}

// V2 셸 버튼 — flat solid fill, 1px 헤어라인, 단일 액센트, tight 반경(r10), pill/글로우 없음.
// lib/V2.jsx 의 Btn 과 동일 매핑.
const VARIANTS: Record<Variant, { bg: string; color: string; border: string }> = {
  primary: { bg: v2Colors.cta, color: '#FFFFFF', border: 'transparent' },
  accent: { bg: v2Colors.accent, color: v2Colors.onAccent, border: 'transparent' },
  ghost: { bg: v2Colors.elevated2, color: v2Colors.text, border: v2Colors.border },
  outline: { bg: 'transparent', color: v2Colors.text, border: v2Colors.borderControl },
};

const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  full,
  sm,
  icon,
  loading,
  disabled,
  onPress,
  style,
}) => {
  const v = VARIANTS[variant];
  const isDisabled = disabled || loading;
  // 비활성(선택 전 등)은 반투명 그린이 아니라 명확히 구분되는 뉴트럴 muted 로 표시.
  const muted = !!disabled && !loading;
  const bg = muted ? v2Colors.elevated2 : v.bg;
  const fg = muted ? v2Colors.textDim : v.color;
  const bd = muted ? v2Colors.border : v.border;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        {
          height: sm ? 34 : 42,
          paddingHorizontal: sm ? 12 : 16,
          width: full ? '100%' : undefined,
          alignSelf: full ? 'stretch' : 'flex-start',
          backgroundColor: bg,
          borderColor: bd,
          opacity: pressed && !isDisabled ? 0.85 : 1,
          transform: [{ scale: pressed && !isDisabled ? 0.98 : 1 }],
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={v.color} />
      ) : (
        <View style={styles.content}>
          {icon}
          <Text
            style={[
              styles.label,
              { color: fg, fontSize: sm ? 13 : 14 },
            ]}
          >
            {children}
          </Text>
        </View>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: v2Radius.md,
    borderWidth: 1,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  label: {
    fontFamily: v2Font.sans,
    fontWeight: v2Font.weight.semibold,
    letterSpacing: v2Font.letterSpacing * 14,
  },
});

export default Button;
