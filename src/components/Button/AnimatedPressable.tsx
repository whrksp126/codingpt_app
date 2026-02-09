import React, { useRef } from 'react';
import { Pressable, Animated, Easing, Vibration, Platform, ViewStyle } from 'react-native';

interface AnimatedPressableProps {
  onPress: () => void;
  children: (props: {
    onPress: () => void;
    onPressIn: () => void;
    onPressOut: () => void;
    disabled?: boolean;
  }) => React.ReactNode;
  className?: string;
  style?: ViewStyle;
  disabled?: boolean;
  enableHapticFeedback?: boolean;
  enableSound?: boolean;
  scaleValue?: number;
  bounceValue?: number;
  tension?: number;
  friction?: number;
}

const AnimatedPressable: React.FC<AnimatedPressableProps> = ({
  onPress,
  children,
  className = '',
  style = {},
  disabled = false,
  enableHapticFeedback = true,
  enableSound = true,
  scaleValue = 0.9,
  bounceValue = 1.05,
  tension = 300,
  friction = 10,
}) => {
  // 애니메이션 상태
  const buttonScale = useRef(new Animated.Value(1)).current;

  // 버튼 효과 함수들
  const playButtonSound = () => {
    if (!enableSound) return;

    if (Platform.OS === 'ios') {
      console.log('버튼 사운드 재생');
    }
  };

  const handleButtonPressIn = () => {
    if (disabled) return;

    // 버튼을 누를 때 애니메이션
    Animated.spring(buttonScale, {
      toValue: scaleValue,
      tension,
      friction,
      useNativeDriver: true,
    }).start();
  };

  const handleButtonPressOut = () => {
    if (disabled) return;

    // 버튼을 놓을 때 애니메이션
    Animated.spring(buttonScale, {
      toValue: 1,
      tension,
      friction,
      useNativeDriver: true,
    }).start();
  };

  const handleButtonPress = () => {
    if (disabled) return;

    // 클릭 시 효과
    if (enableHapticFeedback) {
      playButtonSound();
    }

    // 클릭 시 살짝 튀는 효과
    Animated.sequence([
      Animated.timing(buttonScale, {
        toValue: bounceValue,
        duration: 100,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.spring(buttonScale, {
        toValue: 1,
        tension: 300,
        friction: 8,
        useNativeDriver: true,
      }),
    ]).start();

    // 버튼 클릭 로직 실행
    onPress();
  };

  return (
    <Animated.View
      style={{
        transform: [{ scale: buttonScale }],
        ...style,
      }}
      className={className}
    >
      {children({
        onPress: handleButtonPress,
        onPressIn: handleButtonPressIn,
        onPressOut: handleButtonPressOut,
        disabled,
      })}
    </Animated.View>
  );
};

export default AnimatedPressable;
