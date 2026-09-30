// IconButton — 헤더·툴바 아이콘 버튼 단일 정본(설계 §0.8).
//  시각 36 × 36, 히트 44(hitSlop 로 보충). 아이콘 20 · 기본 색 text2.
//  눌림: iOS opacity .5(누르는 즉시, 놓으면 150ms 복귀) / Android borderless ripple(pressed 색).
//  accessibilityLabel 필수 — 아이콘만으로는 스크린리더가 읽을 게 없다.
import React from 'react';
import { Insets, Platform, Pressable, PressableProps, StyleProp, ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { v2 } from '../../theme/v2Tokens';

/** phosphor-react-native 아이콘 컴포넌트 모양(size/color/weight). */
export type IconComponent = React.ComponentType<{ size?: number; color?: string; weight?: any }>;

export type IconButtonProps = Omit<PressableProps, 'style' | 'children' | 'accessibilityLabel'> & {
  /** phosphor 아이콘 컴포넌트(예: `icon={X}`). children 을 주면 무시된다 */
  icon?: IconComponent;
  children?: React.ReactNode;
  accessibilityLabel: string;
  /** 아이콘 색(기본 text2) */
  color?: string;
  /** 아이콘 크기(기본 20) */
  iconSize?: number;
  /** phosphor weight(기본 regular) */
  weight?: 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone';
  /** 시각 크기(기본 36) — 히트 영역은 hitSlop 으로 44 까지 보충 */
  size?: number;
  /** 켜진 상태(토글형 아이콘) — `selected` 워시 */
  selected?: boolean;
  style?: StyleProp<ViewStyle>;
};

const IOS = Platform.OS === 'ios';

export default function IconButton({
  icon: Icon, children, color, iconSize = 20, weight = 'regular', size = 36, selected, style,
  disabled, hitSlop, onPressIn, onPressOut, accessibilityRole = 'button', accessibilityState, ...rest
}: IconButtonProps) {
  const C = v2.colors;
  const o = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({ opacity: o.value }));
  const pad = Math.max(0, Math.ceil((44 - size) / 2));
  const slop: Insets | number | null | undefined = hitSlop ?? (pad > 0 ? { top: pad, bottom: pad, left: pad, right: pad } : undefined);
  return (
    <Pressable
      {...rest}
      disabled={disabled}
      hitSlop={slop}
      accessibilityRole={accessibilityRole}
      accessibilityState={{ disabled: !!disabled, ...(selected !== undefined ? { selected } : null), ...accessibilityState }}
      android_ripple={IOS ? undefined : { color: C.pressed, borderless: true, radius: Math.round(size / 2) + 2 }}
      onPressIn={(e) => {
        if (IOS) o.value = withTiming(0.5, { duration: 40 });
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        if (IOS) o.value = withTiming(1, { duration: 150, easing: Easing.out(Easing.quad) });
        onPressOut?.(e);
      }}
      style={[
        {
          width: size, height: size, borderRadius: v2.radius.md,
          alignItems: 'center', justifyContent: 'center',
          backgroundColor: selected ? C.selected : 'transparent',
          opacity: disabled ? (IOS ? 0.34 : 0.38) : 1,
        },
        style,
      ]}
    >
      <Animated.View style={pressStyle}>
        {children ?? (Icon ? <Icon size={iconSize} color={color ?? C.text2} weight={weight} /> : null)}
      </Animated.View>
    </Pressable>
  );
}
