import React, { useEffect, useRef } from 'react';
import { View, Animated, Easing } from 'react-native';

interface ProgressBarProps {
  current: number;        // 현재 진행도 (예: 3)
  total: number;          // 전체 진행도 (예: 10)
  height?: number;        // 프로그래스 바 높이 (기본: 20)
  backgroundColor?: string; // 배경색 (기본: #E5E5E5)
  progressColor?: string;  // 진행색 (기본: #FFC800)
  borderRadius?: number;   // 모서리 둥글기 (기본: 10)
  animated?: boolean;      // 애니메이션 사용 여부 (기본: true)
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  current,
  total,
  height = 20,
  backgroundColor = '#E5E5E5',
  progressColor = '#FFC800',
  borderRadius = 10,
  animated = true,
}) => {
  // 애니메이션 상태
  const progressAnim = useRef(new Animated.Value(0)).current;
  const progressScaleAnim = useRef(new Animated.Value(1)).current;
  const progressOpacityAnim = useRef(new Animated.Value(1)).current;
  const progressColorValue = useRef(new Animated.Value(0)).current;

  // 프로그래스 계산
  const progressPercentage = (current / total) * 100;

  // 애니메이션 효과
  useEffect(() => {
    if (!animated) {
      // 애니메이션 없이 즉시 설정
      progressAnim.setValue(progressPercentage);
      return;
    }

    // 프로그래스 바 증가 애니메이션 + 시각적 효과
    Animated.parallel([
      // 1. 프로그래스 바 너비 증가
      Animated.timing(progressAnim, {
        toValue: progressPercentage,
        duration: 500,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false, // width는 native driver 사용 불가
      }),
      // 2. 스케일 효과 (살짝 커졌다가 돌아오기)
      Animated.sequence([
        Animated.timing(progressScaleAnim, {
          toValue: 1.05,
          duration: 200,
          easing: Easing.out(Easing.quad),
          useNativeDriver: false, // 안전하게 false로 설정
        }),
        Animated.timing(progressScaleAnim, {
          toValue: 1,
          duration: 300,
          easing: Easing.out(Easing.quad),
          useNativeDriver: false,
        }),
      ]),
      // 3. 투명도 효과 (깜빡이는 효과)
      Animated.sequence([
        Animated.timing(progressOpacityAnim, {
          toValue: 0.7,
          duration: 150,
          easing: Easing.out(Easing.quad),
          useNativeDriver: false, // 안전하게 false로 설정
        }),
        Animated.timing(progressOpacityAnim, {
          toValue: 1,
          duration: 350,
          easing: Easing.out(Easing.quad),
          useNativeDriver: false,
        }),
      ]),
    ]).start();

    // 색상 변화 효과 (별도 실행)
    Animated.sequence([
      Animated.timing(progressColorValue, {
        toValue: 1,
        duration: 200,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false, // 색상은 native driver 사용 불가
      }),
      Animated.timing(progressColorValue, {
        toValue: 0,
        duration: 300,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      }),
    ]).start();
  }, [current, total, animated, progressAnim, progressScaleAnim, progressOpacityAnim, progressColorValue]);

  return (
    <View 
      style={{ 
        height, 
        backgroundColor, 
        borderRadius, 
        overflow: 'hidden' 
      }}
    >
      <Animated.View 
        style={{ 
          height: '100%',
          borderRadius,
          width: progressAnim.interpolate({
            inputRange: [0, 100],
            outputRange: ['0%', '100%'],
            extrapolate: 'clamp',
          }),
          opacity: progressOpacityAnim,
          transform: [{ scale: progressScaleAnim }],
          backgroundColor: progressColorValue.interpolate({
            inputRange: [0, 1],
            outputRange: [progressColor, '#FF8C00'], // 기본색 → 주황색
            extrapolate: 'clamp',
          }),
        }} 
      />
    </View>
  );
};

export default ProgressBar;
