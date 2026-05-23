import React, { useEffect, useRef } from 'react';
import { Dimensions, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import {
  DURATION_SLIDE_IN,
  DURATION_SLIDE_OUT,
  EASE_OUT_IOS,
  PARALLAX_IN_RATIO,
  PARALLAX_OUT_RATIO,
} from '../../animations/presets';

export type SlideDirection = 'forward' | 'backward';

interface Props {
  isActive: boolean;
  children: React.ReactNode;
  zIndex?: number;
  direction?: SlideDirection;
}

const SCREEN_WIDTH = Dimensions.get('window').width;

export const SlidePageContainer: React.FC<Props> = ({
  isActive,
  children,
  zIndex = 1,
  direction = 'forward',
}) => {
  const opacity = useSharedValue(isActive ? 1 : 0);
  const translateX = useSharedValue(0);
  const prevIsActiveRef = useRef(isActive);
  const isFirstMount = useRef(true);

  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      prevIsActiveRef.current = isActive;
      opacity.value = isActive ? 1 : 0;
      translateX.value = 0;
      return;
    }

    if (isActive === prevIsActiveRef.current) return;
    prevIsActiveRef.current = isActive;

    const sign = direction === 'forward' ? 1 : -1;

    // 정통 캐러셀: opacity 안 건드림. 두 슬라이드가 같은 속도로 1:1 이동.
    // outgoing 은 반대 방향으로 100% 빠지고, incoming 은 같은 방향에서 100% → 0.
    // 화면 밖으로 빠진 슬라이드는 transform 만으로 가려지므로 fade 불필요.
    opacity.value = 1;
    if (isActive) {
      translateX.value = sign * SCREEN_WIDTH * PARALLAX_IN_RATIO;
      translateX.value = withTiming(0, {
        duration: DURATION_SLIDE_IN,
        easing: EASE_OUT_IOS,
      });
    } else {
      translateX.value = 0;
      translateX.value = withTiming(-sign * SCREEN_WIDTH * PARALLAX_OUT_RATIO, {
        duration: DURATION_SLIDE_OUT,
        easing: EASE_OUT_IOS,
      });
    }
  }, [isActive, direction, opacity, translateX]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <Animated.View
      needsOffscreenAlphaCompositing
      style={[StyleSheet.absoluteFill, { zIndex }, style]}
      pointerEvents={isActive ? 'auto' : 'none'}
    >
      {children}
    </Animated.View>
  );
};
