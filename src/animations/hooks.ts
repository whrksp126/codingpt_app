import { useCallback } from 'react';
import {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
  withRepeat,
  Easing,
} from 'react-native-reanimated';
import { SPRING_TIGHT } from './presets';

interface UseScaleOnPressOptions {
  pressed?: number;
  rest?: number;
}

/**
 * Pressable scale animation hook.
 * - 누를 때: pressed로 스케일다운 (spring)
 * - 떼면: rest로 복귀 (spring)
 * UI 스레드에서 동작.
 */
export function useScaleOnPress(opts: UseScaleOnPressOptions = {}) {
  const { pressed = 0.94, rest = 1 } = opts;
  const scale = useSharedValue(rest);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const onPressIn = useCallback(() => {
    scale.value = withSpring(pressed, SPRING_TIGHT);
  }, [scale, pressed]);

  const onPressOut = useCallback(() => {
    scale.value = withSpring(rest, SPRING_TIGHT);
  }, [scale, rest]);

  return { style, onPressIn, onPressOut, scale };
}

/**
 * 좌우 흔들림 애니메이션 (오답 피드백 등).
 */
export function useShake(amplitude = 8) {
  const tx = useSharedValue(0);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }],
  }));

  const trigger = useCallback(() => {
    tx.value = withSequence(
      withTiming(-amplitude, { duration: 50, easing: Easing.linear }),
      withTiming(amplitude, { duration: 60, easing: Easing.linear }),
      withTiming(-amplitude * 0.6, { duration: 60, easing: Easing.linear }),
      withTiming(amplitude * 0.6, { duration: 60, easing: Easing.linear }),
      withTiming(0, { duration: 50, easing: Easing.linear }),
    );
  }, [tx, amplitude]);

  return { style, trigger };
}

/**
 * 위로 튕기는 애니메이션 (정답 피드백 등).
 */
export function useBounce(scaleUp = 1.08) {
  const s = useSharedValue(1);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: s.value }],
  }));

  const trigger = useCallback(() => {
    s.value = withSequence(
      withTiming(scaleUp, { duration: 120, easing: Easing.out(Easing.quad) }),
      withSpring(1, { damping: 6, stiffness: 220 }),
    );
  }, [s, scaleUp]);

  return { style, trigger };
}

/**
 * 무한 반복 floating 애니메이션 (떠다니는 캐릭터/풍선 등).
 */
export function useFloat(amplitude = 8, duration = 1500) {
  const ty = useSharedValue(0);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: ty.value }],
  }));

  const start = useCallback(() => {
    ty.value = withRepeat(
      withTiming(-amplitude, {
        duration,
        easing: Easing.inOut(Easing.sin),
      }),
      -1,
      true,
    );
  }, [ty, amplitude, duration]);

  return { style, start };
}
