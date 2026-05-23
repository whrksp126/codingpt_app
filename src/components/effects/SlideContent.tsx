import React, { useEffect, useRef } from 'react';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import {
  DURATION_SLIDE_IN,
  EASE_OUT_EXPO,
} from '../../animations/presets';
import { ENABLE_SLIDE_TRANSITION } from '../../utils/featureFlags';

interface Props {
  children: React.ReactNode;
  transitionKey: number | string;
  direction?: number; // (사용 안 함 — 호환성 유지)
  /**
   * false 이면 transitionKey 변화에 반응하지 않고 첫 마운트 상태(opacity 1) 유지.
   * 비활성 슬라이드 keep-alive 용 — wrapper 를 떼지 않으면서 추가 transition 만 막음.
   */
  enabled?: boolean;
}

/**
 * 슬라이드 전환 시 콘텐츠가 아래에서 위로 살짝 떠오르며 페이드인.
 * - translateY 12 → 0
 * - opacity   0  → 1
 *
 * 활성 슬라이드든 비활성 슬라이드든 동일하게 wrap 해야 함 —
 * wrapper 가 들어왔다 빠지면 React reconciler 가 자식 트리를 unmount/remount 시키므로
 * 안쪽 WebView/Terminal 등의 native state 가 손실됨.
 */
export const SlideContent: React.FC<Props> = ({ children, transitionKey, enabled = true }) => {
  const opacity = useSharedValue(1);
  const ty = useSharedValue(0);
  const isFirst = useRef(true);

  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false;
      return;
    }
    if (!ENABLE_SLIDE_TRANSITION || !enabled) {
      // 비활성 슬라이드는 transition 무시. 안 그러면 keep-alive 슬라이드도 fade-in 됨.
      opacity.value = 1;
      ty.value = 0;
      return;
    }

    opacity.value = 0;
    ty.value = 12;
    opacity.value = withTiming(1, { duration: DURATION_SLIDE_IN, easing: EASE_OUT_EXPO });
    ty.value = withTiming(0, { duration: DURATION_SLIDE_IN, easing: EASE_OUT_EXPO });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transitionKey, enabled]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: ty.value }],
  }));

  return (
    <Animated.View
      // 자식 트리(특히 카드 shadow) 가 opacity 보간 중 분리 렌더링되어 그림자가 짙어졌다 사라지는
      // 현상을 막기 위해 offscreen 합성. SlideContent 의 fade-in 동안만 비용 발생.
      needsOffscreenAlphaCompositing
      style={[{ flex: 1 }, style]}
    >
      {children}
    </Animated.View>
  );
};
