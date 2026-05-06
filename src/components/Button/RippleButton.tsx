import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  GestureResponderEvent,
  LayoutChangeEvent,
  Pressable,
  PressableProps,
  StyleProp,
  ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '../../contexts/ThemeContext';
import { haptic } from '../../animations/haptics';

/**
 * 누른 지점에서 원형 잉크가 퍼지는 Material 스타일 ripple 효과를 모든 플랫폼에서 동일하게 구현.
 * - react-native-reanimated 기반(UI 스레드)
 * - 다중 ripple 동시 표시 가능 (빠르게 여러 번 누르면 겹침)
 * - 다크/라이트 테마에 따라 기본 ripple 색상 자동 전환
 */

interface RippleProps {
  x: number;
  y: number;
  size: number;
  color: string;
  onComplete: () => void;
}

const Ripple: React.FC<RippleProps> = ({ x, y, size, color, onComplete }) => {
  const scale = useSharedValue(0);
  const opacity = useSharedValue(1);

  useEffect(() => {
    scale.value = withTiming(1, { duration: 450, easing: Easing.out(Easing.cubic) });
    opacity.value = withDelay(
      200,
      withTiming(0, { duration: 350, easing: Easing.out(Easing.cubic) }, (finished) => {
        if (finished) runOnJS(onComplete)();
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: x - size / 2,
          top: y - size / 2,
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        },
        animatedStyle,
      ]}
    />
  );
};

interface RippleButtonProps extends Omit<PressableProps, 'style'> {
  children: React.ReactNode;
  rippleColor?: string;
  enableHapticFeedback?: boolean;
  style?: StyleProp<ViewStyle>;
  className?: string;
}

const RippleButton: React.FC<RippleButtonProps> = ({
  children,
  rippleColor,
  enableHapticFeedback = true,
  style,
  className,
  onPress,
  onPressIn,
  disabled,
  ...rest
}) => {
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';
  const defaultColor = isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.10)';

  const [layout, setLayout] = useState({ width: 0, height: 0 });
  const [ripples, setRipples] = useState<
    Array<{ id: number; x: number; y: number; size: number }>
  >([]);
  const rippleIdRef = useRef(0);

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setLayout({ width, height });
  }, []);

  const handlePressIn = useCallback(
    (e: GestureResponderEvent) => {
      if (disabled) return;
      const { locationX, locationY } = e.nativeEvent;
      const w = layout.width || 0;
      const h = layout.height || 0;

      // 누른 지점에서 가장 먼 모서리까지의 거리 * 2 → 영역을 가득 채우는 ripple 크기
      const dx = Math.max(locationX, w - locationX);
      const dy = Math.max(locationY, h - locationY);
      const radius = Math.sqrt(dx * dx + dy * dy);
      const size = Math.max(radius * 2, 40);

      const id = rippleIdRef.current++;
      setRipples((prev) => [...prev, { id, x: locationX, y: locationY, size }]);

      if (enableHapticFeedback) haptic.light();
      onPressIn?.(e);
    },
    [disabled, layout, enableHapticFeedback, onPressIn],
  );

  const removeRipple = useCallback((id: number) => {
    setRipples((prev) => prev.filter((r) => r.id !== id));
  }, []);

  return (
    <Pressable
      {...rest}
      onPress={onPress}
      onPressIn={handlePressIn}
      onLayout={handleLayout}
      disabled={disabled}
      style={[{ overflow: 'hidden' }, style]}
      className={className}
    >
      {children}
      {ripples.map((r) => (
        <Ripple
          key={r.id}
          x={r.x}
          y={r.y}
          size={r.size}
          color={rippleColor ?? defaultColor}
          onComplete={() => removeRipple(r.id)}
        />
      ))}
    </Pressable>
  );
};

export default RippleButton;
