import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing } from 'react-native';
import LottieView from 'lottie-react-native';

type LottieSrc = 'CodingDevelio' | 'BusinessPlan' | 'MoneyRunAway';
type LottieSize = 'sm' | 'md' | 'lg' | 'xl' | 'xxl';

interface TimeVisibility {
  type: 'time';
  showDelay?: number;    // ms 후 나타남
  hideDelay?: number;    // ms 후 사라짐
  shrinkDelay?: number;  // ms 후 크기 축소
  shrinkTo?: LottieSize; // 축소될 사이즈
}

interface StepVisibility {
  type: 'step';
  value: number;
}

interface LottieComponentProps {
  module: {
    id: number;
    type: string;
    src: LottieSrc; // CodingDevelio(시작용), BusinessPlan(끝용)
    size: LottieSize; // sm, md, lg, xl, xxl
    visibility: TimeVisibility | StepVisibility;
  };
  onHide?: () => void;
  onShrink?: () => void;
}

// 사이즈별 크기 매핑
const sizeMap: Record<LottieSize, number> = {
  sm: 100,
  md: 200,
  lg: 300,
  xl: 400,
  xxl: 500,
};

// 미리 정의된 Lottie 파일들 - 정적 경로만 사용 가능
const getLottieSource = (src: LottieSrc) => {
  switch (src) {
    case 'CodingDevelio':
      return require('../../assets/lottie/CodingDevelio.json');
    case 'BusinessPlan':
      return require('../../assets/lottie/BusinessPlan.json');
    case 'MoneyRunAway':
      // TODO: MoneyRunAway.json 파일 추가 필요 - 임시로 BusinessPlan 사용
      return require('../../assets/lottie/BusinessPlan.json');
    default:
      return require('../../assets/lottie/CodingDevelio.json'); 
  }
};

const LottieComponentInner: React.FC<LottieComponentProps> = ({ module, onHide, onShrink }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isHidden, setIsHidden] = useState(false);
  
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;
  const sizeAnim = useRef(new Animated.Value(sizeMap[module.size])).current;

  // 컴포넌트 마운트 시 애니메이션
  const isTimeType = module.visibility.type === 'time';
  const timeVis = module.visibility as TimeVisibility;

  useEffect(() => {
    const timers: NodeJS.Timeout[] = [];

    if (isTimeType) {
      // Time 기반 visibility
      const showDelay = timeVis.showDelay ?? 0;

      // 나타나는 애니메이션
      const showTimer = setTimeout(() => {
        setIsVisible(true);
        Animated.parallel([
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 600,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.spring(slideAnim, {
            toValue: 0,
            tension: 80,
            friction: 8,
            useNativeDriver: true,
          }),
          Animated.spring(scaleAnim, {
            toValue: 1,
            tension: 100,
            friction: 6,
            useNativeDriver: true,
          }),
        ]).start();
      }, showDelay);
      timers.push(showTimer);

      // 숨기는 애니메이션 (hideDelay가 있을 경우)
      if (timeVis.hideDelay !== undefined) {
        const hideTimer = setTimeout(() => {
          Animated.timing(fadeAnim, {
            toValue: 0,
            duration: 400,
            easing: Easing.in(Easing.cubic),
            useNativeDriver: true,
          }).start(() => {
            setIsHidden(true);
            onHide?.();
          });
        }, timeVis.hideDelay);
        timers.push(hideTimer);
      }

      // 크기 축소 애니메이션 (shrinkDelay가 있을 경우)
      if (timeVis.shrinkDelay !== undefined && timeVis.shrinkTo) {
        const shrinkTimer = setTimeout(() => {
          const targetSize = sizeMap[timeVis.shrinkTo!];
          Animated.spring(sizeAnim, {
            toValue: targetSize,
            tension: 60,
            friction: 10,
            useNativeDriver: false, // width/height 애니메이션은 native driver 불가
          }).start(() => {
            onShrink?.();
          });
        }, timeVis.shrinkDelay);
        timers.push(shrinkTimer);
      }
    } else {
      // Step 기반 visibility (기존 로직)
      setIsVisible(true);
      const timer = setTimeout(() => {
        Animated.parallel([
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 800,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.spring(slideAnim, {
            toValue: 0,
            tension: 80,
            friction: 8,
            useNativeDriver: true,
          }),
          Animated.spring(scaleAnim, {
            toValue: 1,
            tension: 100,
            friction: 6,
            useNativeDriver: true,
          }),
        ]).start();
      }, 100);
      timers.push(timer);
    }

    return () => {
      timers.forEach(timer => clearTimeout(timer));
    };
  }, [fadeAnim, slideAnim, scaleAnim, sizeAnim, isTimeType, timeVis]);

  // 완전히 숨겨진 경우 null 반환
  if (isHidden) return null;

  // 아직 보이지 않는 경우 (time 타입에서 showDelay 대기 중)
  if (!isVisible && isTimeType) {
    return null;
  }

  return (
    <Animated.View
      style={{
        opacity: fadeAnim,
        transform: [
          { translateY: slideAnim },
          { scale: scaleAnim }
        ],
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Animated.View
        style={{
          width: sizeAnim,
          height: sizeAnim,
        }}
      >
        <LottieView
          source={getLottieSource(module.src)}
          autoPlay
          loop={true}
          speed={1}
          style={{ 
            width: '100%', 
            height: '100%', 
          }} 
        />
      </Animated.View>
    </Animated.View>
  );
};

export const LottieComponent = React.memo(LottieComponentInner);