import React, { useEffect } from 'react';
import { Text, TextStyle, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withTiming,
  withSpring,
} from 'react-native-reanimated';
import {
  EASE_OUT_EXPO,
  SPRING_GENTLE_POP,
} from '../../animations/presets';

interface Props {
  text: string;
  textStyle?: TextStyle;
  charDelayMs?: number;
  startDelayMs?: number;
  className?: string;
}

const Char: React.FC<{ ch: string; delay: number; textStyle?: TextStyle; className?: string }> = ({
  ch,
  delay,
  textStyle,
  className,
}) => {
  const opacity = useSharedValue(0);
  const ty = useSharedValue(10);
  const sc = useSharedValue(0.85);

  useEffect(() => {
    opacity.value = withDelay(delay, withTiming(1, { duration: 380, easing: EASE_OUT_EXPO }));
    ty.value = withDelay(delay, withSpring(0, SPRING_GENTLE_POP));
    sc.value = withDelay(delay, withSpring(1, SPRING_GENTLE_POP));
  }, [delay, opacity, ty, sc]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: ty.value }, { scale: sc.value }],
  }));

  return (
    <Animated.View style={style}>
      <Text style={textStyle} className={className}>
        {ch === ' ' ? ' ' : ch}
      </Text>
    </Animated.View>
  );
};

/**
 * 글자 단위 spring stagger 등장.
 * 완료 화면 등 "와닿는" 텍스트 effect.
 */
export const TypographyReveal: React.FC<Props> = ({
  text,
  textStyle,
  className,
  charDelayMs = 35,
  startDelayMs = 0,
}) => {
  const chars = text.split('');
  return (
    <View style={{ flexDirection: 'row' }}>
      {chars.map((ch, i) => (
        <Char
          key={`${ch}-${i}`}
          ch={ch}
          delay={startDelayMs + i * charDelayMs}
          textStyle={textStyle}
          className={className}
        />
      ))}
    </View>
  );
};
