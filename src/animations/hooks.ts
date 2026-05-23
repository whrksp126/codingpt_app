import { useCallback, useEffect, useState } from 'react';
import {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
  withRepeat,
  withDelay,
  cancelAnimation,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import {
  SPRING_TIGHT,
  SPRING_GENTLE_POP,
  EASE_OUT_EXPO,
  EASE_OUT_QUART,
  DURATION_MODULE_ENTER,
  STAGGER_CHILD_MS,
} from './presets';

interface UseScaleOnPressOptions {
  pressed?: number;
  rest?: number;
}

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

  const stop = useCallback(() => {
    cancelAnimation(ty);
    ty.value = withTiming(0, { duration: 200 });
  }, [ty]);

  return { style, start, stop };
}

interface UseEntranceAnimationOptions {
  skip?: boolean;
  delay?: number;
  distance?: number;
  fromScale?: number;
}

/**
 * 공용 mount 진입 애니메이션.
 * fade + translateY(상승) + scale(0.96→1). UI 스레드.
 * skip=true 일 때는 즉시 final state.
 */
export function useEntranceAnimation(opts: UseEntranceAnimationOptions = {}) {
  const { skip = false, delay = 0, distance = 18, fromScale = 0.96 } = opts;

  const opacity = useSharedValue(skip ? 1 : 0);
  const ty = useSharedValue(skip ? 0 : distance);
  const sc = useSharedValue(skip ? 1 : fromScale);

  useEffect(() => {
    if (skip) {
      opacity.value = 1;
      ty.value = 0;
      sc.value = 1;
      return;
    }
    opacity.value = withDelay(
      delay,
      withTiming(1, { duration: DURATION_MODULE_ENTER, easing: EASE_OUT_EXPO }),
    );
    ty.value = withDelay(delay, withSpring(0, SPRING_GENTLE_POP));
    sc.value = withDelay(delay, withSpring(1, SPRING_GENTLE_POP));

    return () => {
      cancelAnimation(opacity);
      cancelAnimation(ty);
      cancelAnimation(sc);
    };
  }, [skip, delay, opacity, ty, sc]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: ty.value }, { scale: sc.value }],
  }));

  return { style, opacity, ty, sc };
}

/**
 * 자식 N개에 일정 간격의 delay 배열을 만들어줌.
 */
export function useStaggeredEntrance(itemCount: number, baseDelay = 60, step = STAGGER_CHILD_MS) {
  const delays: number[] = [];
  for (let i = 0; i < itemCount; i++) {
    delays.push(baseDelay + i * step);
  }
  return delays;
}

/**
 * 0 → target 값으로 부드럽게 증가시키는 카운트업.
 * displayValue 를 useState 로 반환 (UI 스레드에서 runOnJS).
 */
export function useCountUp(target: number, duration = 800, autostart = true) {
  const progress = useSharedValue(0);
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    if (!autostart) return;
    progress.value = 0;
    setDisplayValue(0);
    progress.value = withTiming(1, { duration, easing: EASE_OUT_EXPO }, () => {
      runOnJS(setDisplayValue)(target);
    });
    return () => {
      cancelAnimation(progress);
    };
  }, [target, duration, autostart, progress]);

  // 매 프레임 updater
  useAnimatedStyle(() => {
    const v = Math.round(progress.value * target);
    runOnJS(setDisplayValue)(v);
    return {};
  }, [target]);

  return displayValue;
}

/**
 * 무한 펄스 (캐릭터 halo 등). active 가 false 면 정지.
 */
export function usePulse(active: boolean, scaleRange: [number, number] = [1, 1.08], duration = 1100) {
  const s = useSharedValue(scaleRange[0]);

  useEffect(() => {
    if (active) {
      s.value = withRepeat(
        withTiming(scaleRange[1], {
          duration,
          easing: Easing.inOut(Easing.sin),
        }),
        -1,
        true,
      );
    } else {
      cancelAnimation(s);
      s.value = withTiming(scaleRange[0], { duration: 300 });
    }
    return () => {
      cancelAnimation(s);
    };
  }, [active, scaleRange, duration, s]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: s.value }],
  }));

  return { style, scale: s };
}

/**
 * shadow opacity / glow 강도 hook. RN shadow 한정.
 */
export function useGlow(active: boolean, peak = 0.45, duration = 600) {
  const v = useSharedValue(0);

  useEffect(() => {
    v.value = withTiming(active ? peak : 0, { duration, easing: EASE_OUT_QUART });
    return () => {
      cancelAnimation(v);
    };
  }, [active, peak, duration, v]);

  const style = useAnimatedStyle(() => ({
    shadowOpacity: v.value,
  }));

  return { style, value: v };
}
