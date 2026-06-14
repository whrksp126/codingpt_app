import React, { useEffect } from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { v2Colors, v2Radius } from '../../theme/v2Tokens';

interface ProgressBarProps {
  /** 0 ~ 1 진행률 */
  progress: number;
  height?: number;
  trackColor?: string;
  fillColor?: string;
  style?: ViewStyle;
}

// 트랙(border-control) + 민트 fill. width 를 ease-out 으로 애니메이션.
const ProgressBar: React.FC<ProgressBarProps> = ({
  progress,
  height = 5,
  trackColor = v2Colors.borderControl,
  fillColor = v2Colors.accent,
  style,
}) => {
  const clamped = Math.max(0, Math.min(1, progress));
  const w = useSharedValue(clamped);

  useEffect(() => {
    w.value = withTiming(clamped, {
      duration: 300,
      easing: Easing.out(Easing.cubic),
    });
  }, [clamped, w]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${w.value * 100}%`,
  }));

  return (
    <View
      style={[
        styles.track,
        { height, borderRadius: v2Radius.pill, backgroundColor: trackColor },
        style,
      ]}
    >
      <Animated.View
        style={[
          { height: '100%', borderRadius: v2Radius.pill, backgroundColor: fillColor },
          fillStyle,
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  track: {
    width: '100%',
    overflow: 'hidden',
  },
});

export default ProgressBar;
