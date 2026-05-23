import React, { useEffect } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
  withDelay,
  cancelAnimation,
} from 'react-native-reanimated';
import Svg, { Defs, RadialGradient, Stop, Rect } from 'react-native-svg';
import { EASE_OUT_QUART } from '../../animations/presets';

interface Props {
  active: boolean; // 트리거 — 0→1 짧게 번쩍 후 0으로
  color?: string;
  peak?: number;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

/**
 * 화면 가장자리에 라디얼 글로우를 잠깐 띄움 (오답 시).
 * SVG RadialGradient 로 가운데 transparent → 가장자리 color 의 vignette.
 * pointerEvents=none 으로 인터랙션 방해 X.
 */
export const EdgeRadialGlow: React.FC<Props> = ({ active, color = '#E02D3C', peak = 0.55 }) => {
  const v = useSharedValue(0);

  useEffect(() => {
    if (!active) return;
    v.value = withSequence(
      withTiming(peak, { duration: 250, easing: EASE_OUT_QUART }),
      withDelay(80, withTiming(0, { duration: 550, easing: EASE_OUT_QUART })),
    );
    return () => {
      cancelAnimation(v);
    };
  }, [active, peak, v]);

  const style = useAnimatedStyle(() => ({
    opacity: v.value,
  }));

  return (
    <Animated.View style={[StyleSheet.absoluteFillObject, style]} pointerEvents="none">
      <Svg width={SCREEN_WIDTH} height={SCREEN_HEIGHT} style={StyleSheet.absoluteFillObject}>
        <Defs>
          <RadialGradient
            id="edgeGlow"
            cx="50%"
            cy="50%"
            rx="70%"
            ry="60%"
            fx="50%"
            fy="50%"
          >
            <Stop offset="0%" stopColor={color} stopOpacity="0" />
            <Stop offset="55%" stopColor={color} stopOpacity="0" />
            <Stop offset="100%" stopColor={color} stopOpacity="1" />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#edgeGlow)" />
      </Svg>
    </Animated.View>
  );
};
