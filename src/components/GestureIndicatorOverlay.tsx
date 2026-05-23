import React from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  useAnimatedReaction,
  withTiming,
  withSequence,
  withDelay,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';

interface GestureIndicatorOverlayProps {
  translateX: Animated.SharedValue<number>;
  isPaused: boolean;
  hasActiveTimers: boolean;
  canGoLeft: boolean;
  canGoRight: boolean;
}

/**
 * 슬라이드 좌/우 스와이프 시 화면 가장자리에 부드럽게 나타나는 방향 인디케이터.
 * - 화면 좌측/우측 가장자리에 안쪽으로 페이드되는 반투명 그라데이션 베일.
 * - 콘텐츠 자체는 가리지 않고 방향감만 암시.
 * - 한 방향 트리거 후 OPPOSITE_LOCK_MS 동안 반대 방향 트리거 금지 (스프링 오버슈트 보호).
 */
const OPPOSITE_LOCK_MS = 600;
const GLOW_WIDTH = 120; // 가장자리에서 안쪽으로 페이드할 거리 (px)
// 다중 색상 그라데이션 — 가장자리는 네이비, 중간은 보라, 안쪽으로 투명.
// 단색보다 더 자연스럽고 슬라이드 배경(라이트 그라데이션) 위에서 색감이 살아남.
const GLOW_STOP_EDGE = 'rgba(30, 35, 80, 0.42)';    // 네이비
const GLOW_STOP_MID = 'rgba(75, 50, 120, 0.22)';    // 보라
const GLOW_STOP_INNER = 'rgba(120, 80, 160, 0)';    // transparent

const GestureIndicatorOverlay: React.FC<GestureIndicatorOverlayProps> = ({
  translateX,
  canGoLeft,
  canGoRight,
}) => {
  const { height: SCREEN_HEIGHT } = useWindowDimensions();

  const leftGlowOpacity = useSharedValue(0);
  const rightGlowOpacity = useSharedValue(0);
  const isShowingLeft = useSharedValue(false);
  const isShowingRight = useSharedValue(false);
  const lastLeftTriggerAt = useSharedValue(0);
  const lastRightTriggerAt = useSharedValue(0);

  useAnimatedReaction(
    () => translateX.value,
    (current, previous) => {
      const absCurrent = Math.abs(current);
      const absPrevious = previous !== null ? Math.abs(previous) : 0;
      const isLeftSwipe = current < 0;
      const isRightSwipe = current > 0;
      const now = Date.now();

      // 왼쪽 스와이프 시작 → 다음 슬라이드 방향 → 우측 글로우
      if (
        absPrevious < 5 &&
        absCurrent >= 5 &&
        isLeftSwipe &&
        !isShowingRight.value &&
        now - lastLeftTriggerAt.value > OPPOSITE_LOCK_MS
      ) {
        isShowingRight.value = true;
        lastRightTriggerAt.value = now;
        rightGlowOpacity.value = withSequence(
          withTiming(1, { duration: 180 }),
          withDelay(900, withTiming(0, { duration: 320 }, () => {
            isShowingRight.value = false;
          })),
        );
      }

      // 오른쪽 스와이프 시작 → 이전 슬라이드 방향 → 좌측 글로우
      if (
        absPrevious < 5 &&
        absCurrent >= 5 &&
        isRightSwipe &&
        !isShowingLeft.value &&
        now - lastRightTriggerAt.value > OPPOSITE_LOCK_MS
      ) {
        isShowingLeft.value = true;
        lastLeftTriggerAt.value = now;
        leftGlowOpacity.value = withSequence(
          withTiming(1, { duration: 180 }),
          withDelay(900, withTiming(0, { duration: 320 }, () => {
            isShowingLeft.value = false;
          })),
        );
      }
    },
    [],
  );

  const leftGlowStyle = useAnimatedStyle(() => {
    const intensity = translateX.value > 0 ? Math.min(1, translateX.value / 120) : 0;
    return {
      opacity: canGoLeft ? leftGlowOpacity.value * (0.65 + intensity * 0.35) : 0,
    };
  });

  const rightGlowStyle = useAnimatedStyle(() => {
    const intensity = translateX.value < 0 ? Math.min(1, -translateX.value / 120) : 0;
    return {
      opacity: canGoRight ? rightGlowOpacity.value * (0.65 + intensity * 0.35) : 0,
    };
  });

  return (
    <Animated.View style={styles.overlay} pointerEvents="none">
      {canGoLeft && (
        <Animated.View style={[styles.leftGlow, { height: SCREEN_HEIGHT }, leftGlowStyle]}>
          <Svg width={GLOW_WIDTH} height={SCREEN_HEIGHT}>
            <Defs>
              <LinearGradient id="leftEdgeGlow" x1="0" y1="0" x2={GLOW_WIDTH} y2="0" gradientUnits="userSpaceOnUse">
                <Stop offset="0" stopColor={GLOW_STOP_EDGE} />
                <Stop offset="0.5" stopColor={GLOW_STOP_MID} />
                <Stop offset="1" stopColor={GLOW_STOP_INNER} />
              </LinearGradient>
            </Defs>
            <Rect width="100%" height="100%" fill="url(#leftEdgeGlow)" />
          </Svg>
        </Animated.View>
      )}
      {canGoRight && (
        <Animated.View style={[styles.rightGlow, { height: SCREEN_HEIGHT }, rightGlowStyle]}>
          <Svg width={GLOW_WIDTH} height={SCREEN_HEIGHT}>
            <Defs>
              <LinearGradient id="rightEdgeGlow" x1="0" y1="0" x2={GLOW_WIDTH} y2="0" gradientUnits="userSpaceOnUse">
                <Stop offset="0" stopColor={GLOW_STOP_INNER} />
                <Stop offset="0.5" stopColor={GLOW_STOP_MID} />
                <Stop offset="1" stopColor={GLOW_STOP_EDGE} />
              </LinearGradient>
            </Defs>
            <Rect width="100%" height="100%" fill="url(#rightEdgeGlow)" />
          </Svg>
        </Animated.View>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
  },
  leftGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: GLOW_WIDTH,
  },
  rightGlow: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: GLOW_WIDTH,
  },
});

export default GestureIndicatorOverlay;
