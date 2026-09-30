// Button — 텍스트 버튼 단일 정본(설계 §0.8, PC `.btn` 규격의 모바일판).
//  variant:
//   · primary   — 바탕 text · 글씨 base (무채색 반전. 액센트 금지)
//   · secondary — hover 워시 + borderControl 헤어라인(기본)
//   · ghost     — 투명
//   · danger    — 글씨 error, 눌림 시 error 14% 틴트
//  크기: md 44 / sm 36. 반경 md. 라벨 15/500. 비활성 opacity .34(iOS) / .38(Android).
//  눌림: iOS opacity .5(즉시, 놓으면 150ms) / Android bounded ripple(foreground, overflow hidden).
//  색은 렌더 시점 조회(테마 전환). NativeWind 함수형 style 금지 — 배열 style.
import React from 'react';
import { ActivityIndicator, Platform, Pressable, PressableProps, StyleProp, Text, View, ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { v2, tint } from '../../theme/v2Tokens';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'md' | 'sm';

export type ButtonProps = Omit<PressableProps, 'style' | 'children'> & {
  label: string;
  variant?: ButtonVariant;
  /** md = 44(기본) · sm = 36 */
  size?: ButtonSize;
  /** 라벨 앞 아이콘(색은 호출부가 `labelColor` 규칙에 맞춰 준다 — buttonLabelColor(variant) 사용) */
  icon?: React.ReactNode;
  /** 진행 중 — 스피너로 교체하고 눌림 차단 */
  busy?: boolean;
  /** 가로로 늘리기(flex:1) */
  stretch?: boolean;
  style?: StyleProp<ViewStyle>;
};

const IOS = Platform.OS === 'ios';

/** 변형별 글씨색 — 아이콘 색을 맞출 때 쓴다(렌더 시점 호출). */
export function buttonLabelColor(variant: ButtonVariant = 'secondary'): string {
  const C = v2.colors;
  if (variant === 'primary') return C.base;
  if (variant === 'danger') return C.error;
  return C.text;
}

export default function Button({
  label, variant = 'secondary', size = 'md', icon, busy, stretch, style, disabled,
  onPressIn, onPressOut, accessibilityRole = 'button', accessibilityLabel, accessibilityState, ...rest
}: ButtonProps) {
  const C = v2.colors;
  const off = !!disabled || !!busy;
  const fg = buttonLabelColor(variant);
  const bg = variant === 'primary' ? C.text : variant === 'secondary' ? C.hover : 'transparent';
  const pressTint = variant === 'danger' ? tint(C.error) : C.pressed;
  // iOS 눌림: 채움 버튼은 opacity, danger 는 틴트 워시(글씨가 흐려지면 "위험"이 약해진다)
  const p = useSharedValue(0);
  const fadeStyle = useAnimatedStyle(() => ({ opacity: variant === 'danger' ? 1 : 1 - 0.5 * p.value }));
  const washStyle = useAnimatedStyle(() => ({ opacity: p.value }));
  return (
    <Pressable
      {...rest}
      disabled={off}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: off, busy: !!busy, ...accessibilityState }}
      android_ripple={IOS ? undefined : { color: pressTint, borderless: false, foreground: true }}
      onPressIn={(e) => {
        if (IOS) p.value = withTiming(1, { duration: 40 });
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        if (IOS) p.value = withTiming(0, { duration: 150, easing: Easing.out(Easing.quad) });
        onPressOut?.(e);
      }}
      style={[
        {
          height: size === 'sm' ? 36 : 44,
          paddingHorizontal: size === 'sm' ? 12 : 16,
          borderRadius: v2.radius.md,
          overflow: 'hidden',
          backgroundColor: bg,
          borderWidth: variant === 'secondary' ? 1 : 0,
          borderColor: C.borderControl,
          opacity: disabled ? (IOS ? 0.34 : 0.38) : 1,
          alignSelf: stretch ? undefined : 'flex-start',
          flex: stretch ? 1 : undefined,
        },
        style,
      ]}
    >
      {IOS && variant === 'danger' ? (
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: pressTint }, washStyle]} />
      ) : null}
      <Animated.View style={[{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }, fadeStyle]}>
        {busy ? <ActivityIndicator size="small" color={fg} /> : icon ? <View>{icon}</View> : null}
        <Text numberOfLines={1} style={{ color: fg, fontSize: v2.font.size.body, fontWeight: '500', fontFamily: v2.font.sans }}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}
