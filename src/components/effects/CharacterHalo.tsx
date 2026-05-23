import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  cancelAnimation,
  Easing,
} from 'react-native-reanimated';
import Svg, { Defs, RadialGradient, Stop, Rect } from 'react-native-svg';

interface Props {
  size: number; // 캐릭터 영역 크기 (정사각형 가정)
  isSpeaking?: boolean;
  color?: string;
}

/**
 * 캐릭터 뒤에 절대 위치로 깔리는 radial halo.
 * - 항상 부드러운 idle pulse (1.0 → 1.06)
 * - isSpeaking=true 시 더 강한 pulse + brighter
 */
export const CharacterHalo: React.FC<Props> = ({ size, isSpeaking = false, color = '#FFE69C' }) => {
  const scale = useSharedValue(1);
  const brightness = useSharedValue(0.35);

  useEffect(() => {
    cancelAnimation(scale);
    cancelAnimation(brightness);
    if (isSpeaking) {
      scale.value = withRepeat(
        withSequence(
          withTiming(1.12, { duration: 550, easing: Easing.inOut(Easing.sin) }),
          withTiming(1.0, { duration: 550, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        false,
      );
      brightness.value = withTiming(0.65, { duration: 300 });
    } else {
      scale.value = withRepeat(
        withSequence(
          withTiming(1.06, { duration: 1400, easing: Easing.inOut(Easing.sin) }),
          withTiming(1.0, { duration: 1400, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        false,
      );
      brightness.value = withTiming(0.35, { duration: 400 });
    }
    return () => {
      cancelAnimation(scale);
      cancelAnimation(brightness);
    };
  }, [isSpeaking, scale, brightness]);

  const haloStyle = useAnimatedStyle(() => ({
    opacity: brightness.value,
    transform: [{ scale: scale.value }],
  }));

  // 캐릭터보다 더 크게 그려서 가장자리 빛이 캐릭터 뒤에서 새어나오게.
  const haloSize = size * 1.6;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: (size - haloSize) / 2,
          top: (size - haloSize) / 2,
          width: haloSize,
          height: haloSize,
        },
        haloStyle,
      ]}
    >
      <Svg width={haloSize} height={haloSize} style={StyleSheet.absoluteFillObject}>
        <Defs>
          <RadialGradient id={`halo-${size}`} cx="50%" cy="50%" rx="50%" ry="50%">
            <Stop offset="0%" stopColor={color} stopOpacity="0.9" />
            <Stop offset="45%" stopColor={color} stopOpacity="0.35" />
            <Stop offset="100%" stopColor={color} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#halo-${size})`} />
      </Svg>
    </Animated.View>
  );
};
