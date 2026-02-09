import React, { useRef, useState } from 'react';
import { Pressable, View, Animated, Easing, Vibration, Platform } from 'react-native';

interface CircleBtnProps {
  onPress: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  size?: number;
  backgroundColor?: string;
  disabledBackgroundColor?: string;
  enableHapticFeedback?: boolean;
  enableSound?: boolean;
  className?: string;
}

const CircleBtn: React.FC<CircleBtnProps> = ({
  onPress,
  children,
  disabled = false,
  size = 70,
  backgroundColor = '#58CC02',
  disabledBackgroundColor = '#E5E5E5',
  enableHapticFeedback = true,
  enableSound = true,
  className = '',
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
      console.log('원형 버튼 사운드 재생');
    }
  };

  const handleButtonPressIn = () => {
    if (disabled) return;

    setIsPressed(true);

    // 버튼을 누를 때 애니메이션
    Animated.parallel([
      Animated.spring(buttonScale, {
        toValue: 0.9,
        tension: 300,
        friction: 10,
        useNativeDriver: true,
      }),
      Animated.timing(buttonOpacity, {
        toValue: 0.8,
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
        toValue: 1.1,
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

  // 현재 배경색 결정
  const currentBackgroundColor = disabled ? disabledBackgroundColor : backgroundColor;

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
        className={`py-[10px] ${className}`}
      >
        <View
          className="flex items-center justify-center"
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: currentBackgroundColor,
            shadowColor: isPressed ? '#000' : currentBackgroundColor,
            shadowOffset: {
              width: 0,
              height: isPressed ? 2 : 4,
            },
            shadowOpacity: isPressed ? 0.2 : (disabled ? 0.1 : 0.3),
            shadowRadius: isPressed ? 3 : 6,
            elevation: isPressed ? 3 : 6,
          }}
        >
          {children}
        </View>
      </Pressable>
    </Animated.View>
  );
};

export default CircleBtn;
