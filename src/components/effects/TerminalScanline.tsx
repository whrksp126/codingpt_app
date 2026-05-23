import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';

interface Props {
  height: number;
  width?: number | string;
  bandHeight?: number;
  duration?: number;
}

/**
 * 터미널 컨테이너 위에 깔리는 미세한 scanline 오버레이.
 * 얇은 가로 밴드가 위→아래로 천천히 반복.
 */
export const TerminalScanline: React.FC<Props> = ({
  height,
  width = '100%',
  bandHeight = 60,
  duration = 2800,
}) => {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration, easing: Easing.linear }),
      -1,
      false,
    );
  }, [duration, progress]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: -bandHeight + progress.value * (height + bandHeight) }],
  }));

  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFillObject, { overflow: 'hidden', borderRadius: 8 }]}
    >
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: 0,
            right: 0,
            height: bandHeight,
          },
          style,
        ]}
      >
        <Svg width="100%" height={bandHeight}>
          <Defs>
            <LinearGradient id="scanline" x1="0%" y1="0%" x2="0%" y2="100%">
              <Stop offset="0%" stopColor="#7CFFB2" stopOpacity="0" />
              <Stop offset="50%" stopColor="#7CFFB2" stopOpacity="0.07" />
              <Stop offset="100%" stopColor="#7CFFB2" stopOpacity="0" />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#scanline)" />
        </Svg>
      </Animated.View>
    </View>
  );
};
