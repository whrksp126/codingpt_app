import React from 'react';
import { Pressable, PressableProps } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  Easing,
} from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type PressableScaleProps = PressableProps & {
  scaleTo?: number;  // 눌렀을 때 축소 배율
  dim?: number;      // 눌렀을 때 투명도 감소량
};

// 눌림 인터랙션 Pressable — onPressIn 시 빠르게 축소+딤, onPressOut 시 스프링 바운스 복귀.
// (NativeWind 함수형 style 버그 회피: 배열 style + Reanimated 애니메이션 스타일)
const PressableScale: React.FC<PressableScaleProps> = ({
  scaleTo = 0.95,
  dim = 0.12,
  style,
  onPressIn,
  onPressOut,
  children,
  ...rest
}) => {
  const p = useSharedValue(0);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - (1 - scaleTo) * p.value }],
    opacity: 1 - dim * p.value,
  }));

  return (
    <AnimatedPressable
      {...rest}
      onPressIn={(e) => {
        p.value = withTiming(1, { duration: 70, easing: Easing.out(Easing.quad) });
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        p.value = withSpring(0, { damping: 13, stiffness: 230, mass: 0.5 });
        onPressOut?.(e);
      }}
      style={[style as object, animStyle]}
    >
      {children}
    </AnimatedPressable>
  );
};

export default PressableScale;
