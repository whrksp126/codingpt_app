import React, { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  withTiming,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface Props {
  active: boolean; // 자동 넘김 타이머가 활성화되어 있는가
  durationMs: number; // 전체 남은 시간 (ms)
  size?: number;
  strokeWidth?: number;
  color?: string;
  bgColor?: string;
}

/**
 * Pause/Play 버튼 주위에 둘러진 원형 progress.
 * - 자동 넘김 잔여 시간을 0→1 로 채워가며 시각화
 * - active=false (일시정지/없음) 일 때는 보이지 않음
 *
 * 부모는 절대 위치로 버튼 위에 겹쳐 두면 됨. (pointerEvents=none)
 */
export const PauseCountdownRing: React.FC<Props> = ({
  active,
  durationMs,
  size = 32,
  strokeWidth = 2,
  color = '#08875D',
  bgColor = 'rgba(8, 135, 93, 0.15)',
}) => {
  const progress = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (active && durationMs > 0) {
      progress.value = 0;
      opacity.value = withTiming(1, { duration: 180 });
      progress.value = withTiming(1, {
        duration: durationMs,
        easing: Easing.linear,
      });
    } else {
      cancelAnimation(progress);
      opacity.value = withTiming(0, { duration: 200 });
    }
    return () => {
      cancelAnimation(progress);
      cancelAnimation(opacity);
    };
  }, [active, durationMs, progress, opacity]);

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value),
  }));

  const wrapperStyle = {
    width: size,
    height: size,
    position: 'absolute' as const,
    transform: [{ rotate: '-90deg' as const }],
  };

  const containerStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        { width: size, height: size, position: 'absolute', top: 0, left: 0 },
        containerStyle,
      ]}
    >
      <View style={wrapperStyle}>
        <Svg width={size} height={size}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={bgColor}
            strokeWidth={strokeWidth}
            fill="transparent"
          />
          <AnimatedCircle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={color}
            strokeWidth={strokeWidth}
            strokeDasharray={`${circumference},${circumference}`}
            strokeLinecap="round"
            fill="transparent"
            animatedProps={animatedProps}
          />
        </Svg>
      </View>
    </Animated.View>
  );
};
