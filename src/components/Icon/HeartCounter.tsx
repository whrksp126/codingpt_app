import React, { useEffect, useRef, useCallback } from 'react';
import { View, Text, Animated, Easing } from 'react-native';
import { HeartStraight } from '../../assets/SvgIcon';

interface HeartCounterProps {
  value: number;              // 현재 하트 수
  previousValue?: number;     // 이전 하트 수 (차감 애니메이션용)
  size?: number;              // 하트 크기
  color?: string;             // 하트 색상
  textSize?: number;          // 텍스트 크기
  textColor?: string;         // 텍스트 색상
  animated?: boolean;         // 애니메이션 사용 여부
  onAnimationComplete?: () => void; // 애니메이션 완료 콜백
}

export const HeartCounter: React.FC<HeartCounterProps> = ({
  value,
  previousValue,
  size = 35,
  color = '#EE5555',
  textSize = 18,
  textColor = '#EE5555',
  animated = true,
  onAnimationComplete,
}) => {
  // 아이콘 애니메이션 상태
  const iconScaleAnim = useRef(new Animated.Value(1)).current;
  const iconOpacityAnim = useRef(new Animated.Value(1)).current;
  const iconColorAnim = useRef(new Animated.Value(0)).current;
  const iconShakeAnim = useRef(new Animated.Value(0)).current;

  // 텍스트 애니메이션 상태
  const textScaleAnim = useRef(new Animated.Value(1)).current;
  const textOpacityAnim = useRef(new Animated.Value(1)).current;
  const textColorAnim = useRef(new Animated.Value(0)).current;
  const textBounceAnim = useRef(new Animated.Value(0)).current;

  // 값이 변경되었을 때 애니메이션 실행
  useEffect(() => {
    if (!animated || previousValue === undefined) return;

    const isDecreased = value < previousValue;
    const isIncreased = value > previousValue;

    if (isDecreased) {
      // 차감 애니메이션 (하트와 텍스트가 깜빡이고 작아졌다가 돌아오기)
      Animated.parallel([
        // 아이콘 애니메이션
        Animated.parallel([
          // 1. 아이콘 스케일 효과
          Animated.sequence([
            Animated.timing(iconScaleAnim, {
              toValue: 0.8,
              duration: 150,
              easing: Easing.out(Easing.quad),
              useNativeDriver: false,
            }),
            Animated.spring(iconScaleAnim, {
              toValue: 1,
              tension: 100,
              friction: 8,
              useNativeDriver: false,
            }),
          ]),
          // 2. 아이콘 투명도 효과
          Animated.sequence([
            Animated.timing(iconOpacityAnim, {
              toValue: 0.3,
              duration: 100,
              easing: Easing.out(Easing.quad),
              useNativeDriver: false,
            }),
            Animated.timing(iconOpacityAnim, {
              toValue: 1,
              duration: 200,
              easing: Easing.out(Easing.quad),
              useNativeDriver: false,
            }),
          ]),
          // 3. 아이콘 색상 변화
          Animated.sequence([
            Animated.timing(iconColorAnim, {
              toValue: 1,
              duration: 150,
              easing: Easing.out(Easing.quad),
              useNativeDriver: false,
            }),
            Animated.timing(iconColorAnim, {
              toValue: 0,
              duration: 250,
              easing: Easing.out(Easing.quad),
              useNativeDriver: false,
            }),
          ]),
          // 4. 아이콘 흔들기 효과
          Animated.sequence([
            Animated.timing(iconShakeAnim, {
              toValue: 1,
              duration: 100,
              easing: Easing.out(Easing.quad),
              useNativeDriver: false,
            }),
            Animated.timing(iconShakeAnim, {
              toValue: -1,
              duration: 100,
              easing: Easing.out(Easing.quad),
              useNativeDriver: false,
            }),
            Animated.timing(iconShakeAnim, {
              toValue: 0,
              duration: 100,
              easing: Easing.out(Easing.quad),
              useNativeDriver: false,
            }),
          ]),
        ]),
        // 텍스트 애니메이션
        Animated.parallel([
          // 1. 텍스트 스케일 효과 (더 작게)
          Animated.sequence([
            Animated.timing(textScaleAnim, {
              toValue: 0.9,
              duration: 150,
              easing: Easing.out(Easing.quad),
              useNativeDriver: false,
            }),
            Animated.spring(textScaleAnim, {
              toValue: 1,
              tension: 120,
              friction: 8,
              useNativeDriver: false,
            }),
          ]),
          // 2. 텍스트 투명도 효과
          Animated.sequence([
            Animated.timing(textOpacityAnim, {
              toValue: 0.4,
              duration: 100,
              easing: Easing.out(Easing.quad),
              useNativeDriver: false,
            }),
            Animated.timing(textOpacityAnim, {
              toValue: 1,
              duration: 200,
              easing: Easing.out(Easing.quad),
              useNativeDriver: false,
            }),
          ]),
          // 3. 텍스트 색상 변화
          Animated.sequence([
            Animated.timing(textColorAnim, {
              toValue: 1,
              duration: 150,
              easing: Easing.out(Easing.quad),
              useNativeDriver: false,
            }),
            Animated.timing(textColorAnim, {
              toValue: 0,
              duration: 250,
              easing: Easing.out(Easing.quad),
              useNativeDriver: false,
            }),
          ]),
          // 4. 텍스트 바운스 효과
          Animated.sequence([
            Animated.timing(textBounceAnim, {
              toValue: 1,
              duration: 100,
              easing: Easing.out(Easing.quad),
              useNativeDriver: false,
            }),
            Animated.timing(textBounceAnim, {
              toValue: 0,
              duration: 200,
              easing: Easing.out(Easing.quad),
              useNativeDriver: false,
            }),
          ]),
        ]),
      ]).start(() => {
        onAnimationComplete?.();
      });
    } else if (isIncreased) {
      // 증가 애니메이션 (하트와 텍스트가 커졌다가 돌아오기)
      Animated.parallel([
        // 아이콘 애니메이션
        Animated.parallel([
          Animated.sequence([
            Animated.timing(iconScaleAnim, {
              toValue: 1.2,
              duration: 200,
              easing: Easing.out(Easing.quad),
              useNativeDriver: false,
            }),
            Animated.spring(iconScaleAnim, {
              toValue: 1,
              tension: 80,
              friction: 6,
              useNativeDriver: false,
            }),
          ]),
          Animated.sequence([
            Animated.timing(iconOpacityAnim, {
              toValue: 1.2,
              duration: 150,
              easing: Easing.out(Easing.quad),
              useNativeDriver: false,
            }),
            Animated.timing(iconOpacityAnim, {
              toValue: 1,
              duration: 200,
              easing: Easing.out(Easing.quad),
              useNativeDriver: false,
            }),
          ]),
        ]),
        // 텍스트 애니메이션
        Animated.parallel([
          Animated.sequence([
            Animated.timing(textScaleAnim, {
              toValue: 1.15,
              duration: 200,
              easing: Easing.out(Easing.quad),
              useNativeDriver: false,
            }),
            Animated.spring(textScaleAnim, {
              toValue: 1,
              tension: 100,
              friction: 6,
              useNativeDriver: false,
            }),
          ]),
          Animated.sequence([
            Animated.timing(textOpacityAnim, {
              toValue: 1.2,
              duration: 150,
              easing: Easing.out(Easing.quad),
              useNativeDriver: false,
            }),
            Animated.timing(textOpacityAnim, {
              toValue: 1,
              duration: 200,
              easing: Easing.out(Easing.quad),
              useNativeDriver: false,
            }),
          ]),
        ]),
      ]).start(() => {
        onAnimationComplete?.();
      });
    }
  }, [value, previousValue, animated]);

  // 아이콘 색상 계산
  const animatedIconColor = iconColorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [color, '#FF8C00'], // 기본색 → 주황색
    extrapolate: 'clamp',
  });

  // 텍스트 색상 계산
  const animatedTextColor = textColorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [textColor, '#FF8C00'], // 기본색 → 주황색
    extrapolate: 'clamp',
  });

  // 아이콘 흔들기 변환
  const iconShakeTransform = iconShakeAnim.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: [-3, 0, 3], // 좌우로 3px 흔들기
    extrapolate: 'clamp',
  });

  // 텍스트 바운스 변환
  const textBounceTransform = textBounceAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -2], // 위로 2px 바운스
    extrapolate: 'clamp',
  });

  return (
    <View className="flex-row items-center gap-[5px]">
      {/* 하트 아이콘 - 기본 애니메이션 추가 */}
      <Animated.View
        style={{
          transform: [
            { scale: iconScaleAnim },
            { translateX: iconShakeTransform },
          ],
          opacity: iconOpacityAnim,
        }}
      >
        <HeartStraight 
          width={size} 
          height={size} 
          fill={color} 
        />
      </Animated.View>

      {/* 하트 텍스트 */}
      <Animated.Text
        style={{
          fontSize: textSize,
          fontWeight: '700',
          color: animated ? animatedTextColor as any : textColor,
          transform: [
            { scale: textScaleAnim },
            { translateY: textBounceTransform },
          ],
          opacity: textOpacityAnim,
        }}
      >
        {value}
      </Animated.Text>
    </View>
  );
};

export default HeartCounter;
