import React, { useEffect, useRef } from 'react';
import type { LayoutChangeEvent, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withSpring,
  withTiming,
  cancelAnimation,
} from 'react-native-reanimated';
import {
  DURATION_MODULE_ENTER,
  EASE_OUT_EXPO,
  SPRING_GENTLE_POP,
  STAGGER_CHILD_MS,
} from '../../animations/presets';
import { ENABLE_NEW_LESSON_ANIMATIONS } from '../../utils/featureFlags';

interface ModuleEnterProps {
  children: React.ReactNode;
  /**
   * 화면에 보여줄지 여부. false 이면 자리도 차지 안 하고 (height:0) 투명.
   * isPreloadType 모듈 (WebView/Code/Terminal 등) 의 wrap 컴포넌트 자체는
   * 유지하여 unmount/remount 로 인한 WebView 재로딩을 방지한다.
   */
  isActive?: boolean;
  /**
   * true 이면 entrance 애니메이션 없이 즉시 final state.
   * (이미 보았던 슬라이드 재방문 시)
   */
  skipEnter?: boolean;
  index?: number;
  baseDelay?: number;
  distance?: number;
  fromScale?: number;
  style?: ViewStyle;
  onLayout?: (event: LayoutChangeEvent) => void;
}

/**
 * 학습 페이지의 모든 모듈 wrap.
 * - isActive=false: height:0, opacity:0 (자리 미차지)
 * - isActive=true 로 전이 시: fade + 상승 + 미세 scale entrance (skipEnter=false 일 때만)
 * - skipEnter=true: 즉시 final state
 */
export const ModuleEnter: React.FC<ModuleEnterProps> = ({
  children,
  isActive = true,
  skipEnter = false,
  index = 0,
  // 0ms — 갤러리 톤. 슬라이드 전환과 완전히 병행해서 모듈이 즉시 등장 시작.
  // (모듈 사이 등장 페이스는 콘텐츠의 visibility.time 이 별도로 조절함)
  baseDelay = 0,
  distance = 12,
  // scale 변화는 흰 배경 카드의 shadow 가 element 안쪽으로 침투하는 듯이 보이게 만든다.
  // 의도적으로 1 로 두어 scale 변화 없이 fade + translateY 만으로 entrance.
  fromScale = 1,
  style,
  onLayout,
}) => {
  const delay = baseDelay + index * STAGGER_CHILD_MS;
  const enabled = ENABLE_NEW_LESSON_ANIMATIONS && !skipEnter;

  const opacity = useSharedValue(isActive && (skipEnter || !ENABLE_NEW_LESSON_ANIMATIONS) ? 1 : 0);
  const ty = useSharedValue(isActive && (skipEnter || !ENABLE_NEW_LESSON_ANIMATIONS) ? 0 : distance);
  const sc = useSharedValue(isActive && (skipEnter || !ENABLE_NEW_LESSON_ANIMATIONS) ? 1 : fromScale);

  // entrance — isActive=true 로 전이 (또는 첫 mount 에 isActive=true) 시 발동
  const hasEnteredRef = useRef(false);
  useEffect(() => {
    if (!isActive) {
      // 비활성 — 초기 상태 유지
      hasEnteredRef.current = false;
      return;
    }
    if (hasEnteredRef.current) {
      return; // 이미 entrance 끝남
    }
    hasEnteredRef.current = true;

    if (!enabled) {
      opacity.value = 1;
      ty.value = 0;
      sc.value = 1;
      return;
    }

    opacity.value = withDelay(delay, withTiming(1, { duration: DURATION_MODULE_ENTER, easing: EASE_OUT_EXPO }));
    ty.value = withDelay(delay, withSpring(0, SPRING_GENTLE_POP));
    sc.value = withDelay(delay, withSpring(1, SPRING_GENTLE_POP));

    return () => {
      cancelAnimation(opacity);
      cancelAnimation(ty);
      cancelAnimation(sc);
    };
  }, [isActive, enabled, delay, opacity, ty, sc]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: ty.value }, { scale: sc.value }],
  }));

  const containerStyle: ViewStyle = isActive
    ? (style ?? {})
    : { height: 0, opacity: 0, overflow: 'hidden' };

  return (
    <Animated.View
      // iOS/Android 모두: 자식의 shadow 가 부모 opacity 와 함께 fade 되도록 offscreen 합성.
      // 이 prop 이 없으면 등장 중 자식 카드의 shadow 만 풀 강도로 그려져 그림자가 짙어졌다 사라지는 듯한 시각 효과 발생.
      needsOffscreenAlphaCompositing
      style={[containerStyle, isActive ? animStyle : undefined]}
      onLayout={onLayout}
    >
      {children}
    </Animated.View>
  );
};
