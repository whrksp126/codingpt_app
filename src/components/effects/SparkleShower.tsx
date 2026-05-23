import React, { useMemo } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withTiming,
  withSequence,
  Easing,
  withRepeat,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

interface SparkleConfig {
  size: number;
  x: number;
  y: number;
  delay: number;
  duration: number;
  color: string;
}

interface Props {
  count?: number;
  colors?: string[];
  area?: { x: number; y: number; width: number; height: number };
  loop?: boolean;
}

const DEFAULT_COLORS = ['#FFD700', '#FFC800', '#FFF5B0', '#FFFFFF'];

const Sparkle: React.FC<{ config: SparkleConfig; loop: boolean }> = ({ config, loop }) => {
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0);
  const rot = useSharedValue(0);

  React.useEffect(() => {
    const sequence = withSequence(
      withTiming(1, { duration: config.duration * 0.35, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: config.duration * 0.65, easing: Easing.in(Easing.quad) }),
    );
    const scaleSeq = withSequence(
      withTiming(1, { duration: config.duration * 0.35, easing: Easing.out(Easing.back(1.6)) }),
      withTiming(0.4, { duration: config.duration * 0.65, easing: Easing.in(Easing.quad) }),
    );
    if (loop) {
      opacity.value = withDelay(config.delay, withRepeat(sequence, -1, false));
      scale.value = withDelay(config.delay, withRepeat(scaleSeq, -1, false));
      rot.value = withDelay(
        config.delay,
        withRepeat(withTiming(180, { duration: config.duration, easing: Easing.linear }), -1, false),
      );
    } else {
      opacity.value = withDelay(config.delay, sequence);
      scale.value = withDelay(config.delay, scaleSeq);
      rot.value = withDelay(
        config.delay,
        withTiming(120, { duration: config.duration, easing: Easing.out(Easing.quad) }),
      );
    }
  }, [config, loop, opacity, scale, rot]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }, { rotate: `${rot.value}deg` }],
  }));

  // 4 꼭짓점 별 SVG path
  const s = config.size;
  const half = s / 2;
  const path = `M${half} 0 L${half + s * 0.12} ${half - s * 0.12} L${s} ${half} L${half + s * 0.12} ${half + s * 0.12} L${half} ${s} L${half - s * 0.12} ${half + s * 0.12} L0 ${half} L${half - s * 0.12} ${half - s * 0.12} Z`;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: config.x - half,
          top: config.y - half,
          width: s,
          height: s,
        },
        style,
      ]}
    >
      <Svg width={s} height={s}>
        <Path d={path} fill={config.color} />
      </Svg>
    </Animated.View>
  );
};

/**
 * 별 입자 샤워. mount 시 일제히 등장 시작 (loop=false 면 1회, true 면 반복).
 * 완료 화면 sparkle 또는 캐릭터 주변 입자 등에 사용.
 */
export const SparkleShower: React.FC<Props> = ({
  count = 14,
  colors = DEFAULT_COLORS,
  area,
  loop = false,
}) => {
  const { width: SW, height: SH } = Dimensions.get('window');
  const region = area ?? { x: 0, y: 0, width: SW, height: SH };

  const configs = useMemo<SparkleConfig[]>(() => {
    return Array.from({ length: count }).map(() => ({
      size: 10 + Math.random() * 16,
      x: region.x + Math.random() * region.width,
      y: region.y + Math.random() * region.height,
      delay: Math.random() * 800,
      duration: 900 + Math.random() * 700,
      color: colors[Math.floor(Math.random() * colors.length)],
    }));
  }, [count, colors, region.x, region.y, region.width, region.height]);

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      {configs.map((c, i) => (
        <Sparkle key={`s-${i}`} config={c} loop={loop} />
      ))}
    </View>
  );
};
