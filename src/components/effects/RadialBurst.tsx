import React, { useEffect, useMemo } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withTiming,
  Easing,
} from 'react-native-reanimated';

interface Props {
  rayCount?: number;
  color?: string;
  delay?: number;
  duration?: number;
  maxLength?: number;
  origin?: { x: number; y: number };
}

const { width: SW, height: SH } = Dimensions.get('window');

const Ray: React.FC<{
  index: number;
  total: number;
  color: string;
  delay: number;
  duration: number;
  maxLength: number;
  originX: number;
  originY: number;
}> = ({ index, total, color, delay, duration, maxLength, originX, originY }) => {
  const len = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    const myDelay = delay + (index / total) * 60;
    len.value = withDelay(
      myDelay,
      withTiming(maxLength, { duration, easing: Easing.out(Easing.cubic) }),
    );
    opacity.value = withDelay(
      myDelay,
      withTiming(0.6, { duration: duration * 0.3, easing: Easing.out(Easing.cubic) }),
    );
    // fade out 후
    opacity.value = withDelay(
      myDelay + duration * 0.3,
      withTiming(0, { duration: duration * 0.7, easing: Easing.in(Easing.cubic) }),
    );
  }, [delay, duration, index, total, maxLength, len, opacity]);

  const angle = (index / total) * 360;
  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    width: len.value,
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: originX,
          top: originY,
          height: 2,
          backgroundColor: color,
          transformOrigin: 'left center' as any,
          transform: [{ rotate: `${angle}deg` }],
          borderRadius: 1,
        },
        style,
      ]}
    />
  );
};

/**
 * 중앙(또는 지정된 origin)에서 광선이 사방으로 퍼져나가는 효과 (mount 1회).
 */
export const RadialBurst: React.FC<Props> = ({
  rayCount = 12,
  color = '#FFD700',
  delay = 0,
  duration = 700,
  maxLength,
  origin,
}) => {
  const cx = origin?.x ?? SW / 2;
  const cy = origin?.y ?? SH / 3;
  const maxLen = maxLength ?? Math.min(SW, SH) * 0.4;

  const rays = useMemo(() => Array.from({ length: rayCount }), [rayCount]);

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      {rays.map((_, i) => (
        <Ray
          key={`r-${i}`}
          index={i}
          total={rayCount}
          color={color}
          delay={delay}
          duration={duration}
          maxLength={maxLen}
          originX={cx}
          originY={cy}
        />
      ))}
    </View>
  );
};
