// PressableRow — 목록 행 단일 정본(설계 §0.5·§0.8).
//  · iOS: 누르는 즉시 `pressed` 워시, 놓으면 150ms 페이드 아웃(UIKit 셀 하이라이트 문법).
//  · Android: bounded `android_ripple`(pressed 색, foreground) — 둥근 모서리 밖으로 새지 않게 overflow:hidden.
//  · selected → `selected` 워시(무채색. 액센트 금지). 최소 높이 44, 반경 md.
//  색은 렌더 시점에 v2.colors 에서 읽는다(StyleSheet.create 에 굳히지 않는다 — 테마 전환).
//  NativeWind 함수형 style 버그 회피: style 은 배열로만 넘긴다.
import React from 'react';
import { Platform, Pressable, PressableProps, StyleProp, ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { v2 } from '../../theme/v2Tokens';

export type PressableRowProps = Omit<PressableProps, 'style' | 'children'> & {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** 선택된 행 — `selected` 워시 */
  selected?: boolean;
  /** 모서리 반경(기본 radius.md = 8). 전폭 목록 행은 0 을 줄 것 */
  radius?: number;
  /** 최소 높이(기본 44 — 터치 타깃) */
  minHeight?: number;
};

const IOS = Platform.OS === 'ios';

export default function PressableRow({
  children, style, selected, radius = v2.radius.md, minHeight = 44, disabled,
  onPressIn, onPressOut, accessibilityRole = 'button', accessibilityState, ...rest
}: PressableRowProps) {
  const C = v2.colors;
  const p = useSharedValue(0);
  const washStyle = useAnimatedStyle(() => ({ opacity: p.value }));
  return (
    <Pressable
      {...rest}
      disabled={disabled}
      accessibilityRole={accessibilityRole}
      accessibilityState={{ selected: !!selected, disabled: !!disabled, ...accessibilityState }}
      android_ripple={IOS ? undefined : { color: C.pressed, borderless: false, foreground: true }}
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
          minHeight, borderRadius: radius, overflow: 'hidden',
          backgroundColor: selected ? C.selected : 'transparent',
          opacity: disabled ? (IOS ? 0.34 : 0.38) : 1,
        },
        style,
      ]}
    >
      {IOS ? (
        <Animated.View
          pointerEvents="none"
          style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: C.pressed }, washStyle]}
        />
      ) : null}
      {children}
    </Pressable>
  );
}
