import React, { useEffect } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { EASE_OUT_EXPO } from '../../animations/presets';

interface Props {
  delay?: number;
  duration?: number;
  width?: number; // sweep band 두께
  angle?: number; // degrees
}

const { width: SW, height: SH } = Dimensions.get('window');

/**
 * 대각선 빛 한 줄기가 화면을 한 번 휙 스쳐가는 효과.
 * mount 시 1회 재생.
 */
export const LightSweep: React.FC<Props> = ({
  delay = 0,
  duration = 1100,
  width = 200,
  angle = -20,
}) => {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      delay,
      withTiming(1, { duration, easing: EASE_OUT_EXPO }),
    );
  }, [delay, duration, progress]);

  const style = useAnimatedStyle(() => {
    const totalDistance = SW + width + Math.abs(Math.sin((angle * Math.PI) / 180)) * SH;
    const tx = -width + progress.value * totalDistance;
    const opacity = progress.value > 0 && progress.value < 1 ? 1 : 0;
    return {
      opacity,
      transform: [{ translateX: tx }, { rotate: `${angle}deg` }],
    };
  });

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: -SH * 0.2,
            left: -width,
            width,
            height: SH * 1.4,
          },
          style,
        ]}
      >
        <Svg width={width} height={SH * 1.4}>
          <Defs>
            <LinearGradient id="sweep" x1="0%" y1="0%" x2="100%" y2="0%">
              <Stop offset="0%" stopColor="#FFFFFF" stopOpacity="0" />
              <Stop offset="50%" stopColor="#FFFFFF" stopOpacity="0.45" />
              <Stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#sweep)" />
        </Svg>
      </Animated.View>
    </View>
  );
};
