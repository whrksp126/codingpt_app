import React, { useEffect } from 'react';
import { Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  cancelAnimation,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import { EASE_OUT_EXPO } from '../../animations/presets';

interface Props {
  visible: boolean;
  message: string;
  onHide: () => void;
  duration?: number;
}

/**
 * 학습 페이지 상단 토스트 — 퀴즈 미완료 등 즉시 피드백이 필요한 상황에 사용.
 * - visible=true 로 트리거되면 상단에서 슬라이드/페이드 인 → duration 후 페이드 아웃 → onHide 호출.
 * - 표시 중 다시 visible=true 가 들어와도 자연스럽게 갱신되도록 useEffect cleanup 으로 in-flight 애니메이션 취소.
 */
export const QuizGateToast: React.FC<Props> = ({ visible, message, onHide, duration = 1800 }) => {
  const insets = useSafeAreaInsets();
  const opacity = useSharedValue(0);
  const ty = useSharedValue(-20);

  useEffect(() => {
    if (!visible) return;

    cancelAnimation(opacity);
    cancelAnimation(ty);

    opacity.value = 0;
    ty.value = -20;

    opacity.value = withTiming(1, { duration: 180, easing: EASE_OUT_EXPO });
    ty.value = withTiming(0, { duration: 220, easing: EASE_OUT_EXPO });

    opacity.value = withDelay(
      duration,
      withTiming(0, { duration: 220, easing: Easing.in(Easing.cubic) }, (finished) => {
        if (finished) runOnJS(onHide)();
      }),
    );
    ty.value = withDelay(duration, withTiming(-12, { duration: 220, easing: Easing.in(Easing.cubic) }));

    return () => {
      cancelAnimation(opacity);
      cancelAnimation(ty);
    };
  }, [visible, duration, onHide, opacity, ty]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: ty.value }],
  }));

  if (!visible) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.container,
        { top: insets.top + 12 },
        style,
      ]}
    >
      <Text style={styles.text}>{message}</Text>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 9999,
    backgroundColor: 'rgba(33, 37, 41, 0.92)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 8,
  },
  text: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'PretendardVariable',
    lineHeight: 20,
    textAlign: 'center',
  },
});
