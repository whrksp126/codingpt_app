import React, { useEffect, useState } from 'react';
import { Text, TextStyle } from 'react-native';
import {
  useSharedValue,
  useAnimatedReaction,
  withDelay,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { EASE_OUT_EXPO } from '../../animations/presets';

interface Props {
  value: number;
  duration?: number;
  delay?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
  textStyle?: TextStyle;
}

/**
 * 0 → value 까지 부드럽게 증가하는 숫자 표시.
 * 매 프레임 UI thread 의 progress 변경을 reaction 으로 JS state 에 sync.
 */
export const CountUpNumber: React.FC<Props> = ({
  value,
  duration = 800,
  delay = 0,
  prefix = '',
  suffix = '',
  className,
  textStyle,
}) => {
  const progress = useSharedValue(0);
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    progress.value = 0;
    setDisplay(0);
    progress.value = withDelay(
      delay,
      withTiming(1, { duration, easing: EASE_OUT_EXPO }),
    );
  }, [value, duration, delay, progress]);

  useAnimatedReaction(
    () => Math.round(progress.value * value),
    (current, previous) => {
      if (current !== previous) {
        runOnJS(setDisplay)(current);
      }
    },
    [value],
  );

  return (
    <Text className={className} style={textStyle}>
      {prefix}
      {display}
      {suffix}
    </Text>
  );
};
