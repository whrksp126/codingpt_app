import React, { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withSpring,
  interpolateColor,
  Easing,
} from 'react-native-reanimated';

interface ProgressBarProps {
  current: number;
  total: number;
  height?: number;
  backgroundColor?: string;
  progressColor?: string;
  borderRadius?: number;
  animated?: boolean;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  current,
  total,
  height = 20,
  backgroundColor = '#E5E5E5',
  progressColor = '#FFC800',
  borderRadius = 10,
  animated = true,
}) => {
  const progress = useSharedValue(0);
  const scale = useSharedValue(1);
  const colorPulse = useSharedValue(0);

  const target = total > 0 ? (current / total) * 100 : 0;

  useEffect(() => {
    if (!animated) {
      progress.value = target;
      return;
    }

    progress.value = withTiming(target, {
      duration: 500,
      easing: Easing.out(Easing.cubic),
    });

    scale.value = withSequence(
      withTiming(1.05, { duration: 200, easing: Easing.out(Easing.quad) }),
      withSpring(1, { damping: 10, stiffness: 200 }),
    );

    colorPulse.value = withSequence(
      withTiming(1, { duration: 200, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: 350, easing: Easing.out(Easing.quad) }),
    );
  }, [target, animated, progress, scale, colorPulse]);

  const fillStyle = useAnimatedStyle(() => ({
    height: '100%',
    width: `${Math.max(0, Math.min(100, progress.value))}%`,
    transform: [{ scale: scale.value }],
    backgroundColor: interpolateColor(
      colorPulse.value,
      [0, 1],
      [progressColor, '#FF8C00'],
    ),
  }));

  return (
    <View
      style={{
        height,
        backgroundColor,
        borderRadius,
        overflow: 'hidden',
      }}
    >
      <Animated.View style={[{ borderRadius }, fillStyle]} />
    </View>
  );
};

export default ProgressBar;
