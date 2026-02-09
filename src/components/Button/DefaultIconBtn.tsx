import React, { useRef, useState } from 'react';
import { Pressable, Animated, Easing, Vibration, Platform } from 'react-native';

interface DefaultIconBtnProps {
  onPress: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  size?: number;
  enableHapticFeedback?: boolean;
  enableSound?: boolean;
  className?: string;
  iconClassName?: string;
  pressScale?: number;
  pressOpacity?: number;
  bounceScale?: number;
}

const DefaultIconBtn: React.FC<DefaultIconBtnProps> = ({
  onPress,
  children,
  disabled = false,
  size = 35,
  enableHapticFeedback = true,
  enableSound = true,
  className = '',
  iconClassName = '',
  pressScale = 0.9,
  pressOpacity = 0.7,
  bounceScale = 1.1,
}) => {
  // 애니메이션 상태
  const buttonScale = useRef(new Animated.Value(1)).current;
  const buttonOpacity = useRef(new Animated.Value(1)).current;
  const [isPressed, setIsPressed] = useState(false);

  // 버튼 효과 함수들
  const playButtonSound = () => {
    if (!enableSound) return;

    // iOS에서는 시스템 사운드 사용
    if (Platform.OS === 'ios') {
      // iOS에서는 시스템 사운드 재생 (실제 구현 시 react-native-sound 등 사용)
      console.log('아이콘 버튼 사운드 재생');
    }
  };

  const handleButtonPressIn = () => {
    if (disabled) return;

    setIsPressed(true);

    // 버튼을 누를 때 애니메이션
    Animated.parallel([
      Animated.spring(buttonScale, {
        toValue: pressScale,
        tension: 300,
        friction: 10,
        useNativeDriver: true,
      }),
      Animated.timing(buttonOpacity, {
        toValue: pressOpacity,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handleButtonPressOut = () => {
    if (disabled) return;

    setIsPressed(false);

    // 버튼을 놓을 때 애니메이션
    Animated.parallel([
      Animated.spring(buttonScale, {
        toValue: 1,
        tension: 300,
        friction: 10,
        useNativeDriver: true,
      }),
      Animated.timing(buttonOpacity, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();
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
        toValue: bounceScale,
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
        opacity: buttonOpacity,
      }}
    >
      <Pressable
        onPress={handleButtonPress}
        onPressIn={handleButtonPressIn}
        onPressOut={handleButtonPressOut}
        disabled={disabled}
        className={`${className}`}
        style={{
          width: size,
          height: size,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <Animated.View
          className={`${iconClassName}`}
          style={{
            opacity: disabled ? 0.5 : 1,
          }}
        >
          {children}
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
};

export default DefaultIconBtn;
