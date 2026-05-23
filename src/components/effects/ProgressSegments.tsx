import React from 'react';
import { View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withSequence,
  withDelay,
} from 'react-native-reanimated';
import {
  DURATION_SLIDE_IN,
  EASE_OUT_IOS,
  EASE_OUT_QUART,
  SPRING_END_DOT_BOUNCE,
} from '../../animations/presets';

interface Props {
  total: number;
  currentIndex: number;
  filledColor?: string;
  unfilledColor?: string;
  glowColor?: string;
  height?: number;
}

const Segment: React.FC<{
  filled: boolean;
  isJustFilled: boolean;
  filledColor: string;
  unfilledColor: string;
  glowColor: string;
  height: number;
  isLastFilled: boolean;
}> = ({ filled, isJustFilled, filledColor, unfilledColor, glowColor, height, isLastFilled }) => {
  const fill = useSharedValue(filled ? 1 : 0);
  const glow = useSharedValue(0);
  const dotScale = useSharedValue(isLastFilled ? 1 : 0);

  React.useEffect(() => {
    if (filled) {
      // 채워질 때: 슬라이드 전환과 동일 timing(180ms + EASE_OUT_IOS)으로 동기화.
      // 이전 400ms 는 슬라이드 전환(180ms)보다 길어서 뚝뚝 끊겨 보였음.
      fill.value = withTiming(1, { duration: DURATION_SLIDE_IN, easing: EASE_OUT_IOS });
      if (isJustFilled) {
        glow.value = withSequence(
          withTiming(1, { duration: 220, easing: EASE_OUT_QUART }),
          withTiming(0.4, { duration: 400, easing: EASE_OUT_QUART }),
          withDelay(150, withTiming(0, { duration: 350, easing: EASE_OUT_QUART })),
        );
      }
    } else {
      fill.value = withTiming(0, { duration: DURATION_SLIDE_IN, easing: EASE_OUT_IOS });
      glow.value = withTiming(0, { duration: 200 });
    }
  }, [filled, isJustFilled, fill, glow]);

  React.useEffect(() => {
    if (isLastFilled) {
      dotScale.value = withSpring(1, SPRING_END_DOT_BOUNCE);
    } else {
      dotScale.value = withTiming(0, { duration: 180 });
    }
  }, [isLastFilled, dotScale]);

  const barStyle = useAnimatedStyle(() => ({
    backgroundColor: fill.value > 0.5 ? filledColor : unfilledColor,
    shadowOpacity: glow.value * 0.7,
  }));

  const dotStyle = useAnimatedStyle(() => ({
    opacity: dotScale.value,
    transform: [{ scale: dotScale.value }],
  }));

  return (
    <View style={{ flex: 1, position: 'relative' }}>
      <Animated.View
        style={[
          {
            height,
            borderRadius: 5,
            shadowColor: glowColor,
            shadowRadius: 4,
            shadowOffset: { width: 0, height: 0 },
          },
          barStyle,
        ]}
      />
      {/* 끝 동그라미 */}
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            right: -3,
            top: -2,
            width: height + 4,
            height: height + 4,
            borderRadius: (height + 4) / 2,
            backgroundColor: filledColor,
            shadowColor: glowColor,
            shadowOpacity: 0.5,
            shadowRadius: 5,
            shadowOffset: { width: 0, height: 0 },
          },
          dotStyle,
        ]}
      />
    </View>
  );
};

/**
 * 슬라이드 진행 바.
 * - 채워질 때 글로우 펄스 한 번
 * - 마지막으로 채워진 세그먼트 끝에 동그라미 spring bounce
 */
export const ProgressSegments: React.FC<Props> = ({
  total,
  currentIndex,
  filledColor = '#08875D',
  unfilledColor = '#E5E7EB',
  glowColor = '#08875D',
  height = 3,
}) => {
  const prevIndexRef = React.useRef(currentIndex);
  const lastJustFilledRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (currentIndex > prevIndexRef.current) {
      lastJustFilledRef.current = currentIndex;
    } else if (currentIndex < prevIndexRef.current) {
      lastJustFilledRef.current = null;
    }
    prevIndexRef.current = currentIndex;
  }, [currentIndex]);

  return (
    <View className="flex-1 flex-row gap-1">
      {Array.from({ length: total }).map((_, index) => (
        <Segment
          key={`progress-${index}`}
          filled={index <= currentIndex}
          isJustFilled={lastJustFilledRef.current === index}
          isLastFilled={index === currentIndex}
          filledColor={filledColor}
          unfilledColor={unfilledColor}
          glowColor={glowColor}
          height={height}
        />
      ))}
    </View>
  );
};
