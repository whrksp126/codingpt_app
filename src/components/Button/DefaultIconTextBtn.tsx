import React, { useRef, useState } from 'react';
import { Pressable, Text, Animated, Easing, Vibration, Platform, View } from 'react-native';

interface DefaultIconTextBtnProps {
  onPress: () => void;
  text: string;
  icon: React.ReactNode;
  disabled?: boolean;
  buttonClassName?: string;
  textClassName?: string;
  iconClassName?: string;
  enableHapticFeedback?: boolean;
  enableSound?: boolean;
  flex?: boolean;
}

const DefaultIconTextBtn: React.FC<DefaultIconTextBtnProps> = ({
  onPress,
  text,
  icon,
  disabled = false,
  buttonClassName = 'bg-[#58CC02] h-[50px] rounded-[25px] px-6 py-3 flex-row items-center justify-center',
  textClassName = 'text-[18px] font-bold text-white',
  iconClassName = 'mr-[10px]',
  enableHapticFeedback = true,
  enableSound = true,
  flex = true,
}) => {
  // 애니메이션 상태
  const buttonScale = useRef(new Animated.Value(1)).current;
  const buttonOpacity = useRef(new Animated.Value(1)).current;
  const [isPressed, setIsPressed] = useState(false);

  // 버튼 효과 함수들
  const playButtonSound = () => {
    if (!enableSound) return;
    
    // iOS에서는 시스템 사운드 사용, Android에서는 HapticFeedback 사용
    if (Platform.OS === 'ios') {
      // iOS에서는 시스템 사운드 재생 (실제 구현 시 react-native-sound 등 사용)
      console.log('버튼 사운드 재생');
    } else {
      // Android에서는 HapticFeedback 사용
      Vibration.vibrate(50); // 50ms 진동
    }
  };

  const handleButtonPressIn = () => {
    if (disabled) return;
    
    setIsPressed(true);
    
    // 버튼을 누를 때 애니메이션
    Animated.parallel([
      Animated.spring(buttonScale, {
        toValue: 0.95,
        tension: 300,
        friction: 8,
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
        friction: 8,
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
        toValue: 1.05,
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

  // disabled 상태일 때의 스타일
  const getButtonClassName = () => {
    if (disabled) {
      return buttonClassName.replace('bg-[#58CC02]', 'bg-[#CCCCCC]');
    }
    return buttonClassName;
  };

  const getTextClassName = () => {
    if (disabled) {
      return textClassName.replace('text-white', 'text-[#999999]');
    }
    return textClassName;
  };

  return (
    <Animated.View
      className={flex ? "flex-1" : ""}
      style={{
        transform: [{ scale: buttonScale }],
        opacity: buttonOpacity,
      }}
    >
      <Pressable
        onPress={handleButtonPress}
        onPressIn={handleButtonPressIn}
        onPressOut={handleButtonPressOut}
        className={getButtonClassName()}
        style={{
          shadowColor: isPressed ? '#000' : (disabled ? '#CCCCCC' : '#58CC02'),
          shadowOffset: {
            width: 0,
            height: isPressed ? 2 : 4,
          },
          shadowOpacity: isPressed ? 0.2 : (disabled ? 0.1 : 0.3),
          shadowRadius: isPressed ? 3 : 6,
          elevation: isPressed ? 3 : 6,
        }}
        disabled={disabled}
      >
        <View className={iconClassName}>
          {icon}
        </View>
        <Text className={getTextClassName()}>
          {text}
        </Text>
      </Pressable>
    </Animated.View>
  );
};

export default DefaultIconTextBtn;
