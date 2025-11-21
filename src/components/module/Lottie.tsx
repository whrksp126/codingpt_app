import React, { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import LottieView from 'lottie-react-native';

type LottieSrc = 'CodingDevelio' | 'BusinessPlan';
type LottieSize = 'sm' | 'md' | 'lg';

interface LottieComponentProps {
  module: {
    id: number;
    type: string;
    src: LottieSrc; // CodingDevelio(시작용), BusinessPlan(끝용)
    size: LottieSize; // sm, md, lg
    visibility: { type: string; value: number };
  };
}

// 미리 정의된 Lottie 파일들 - 정적 경로만 사용 가능
const getLottieSource = (src: LottieSrc) => {
  switch (src) {
    case 'CodingDevelio':
      return require('../../assets/lottie/CodingDevelio.json');
    case 'BusinessPlan':
      return require('../../assets/lottie/BusinessPlan.json');
    default:
      return require('../../assets/lottie/CodingDevelio.json'); 
  }
};

const LottieComponentInner: React.FC<LottieComponentProps> = ({ module }) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;

  // 컴포넌트 마운트 시 애니메이션
  useEffect(() => {
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

    return () => clearTimeout(timer);
  }, [fadeAnim, slideAnim, scaleAnim]);

  // 사이즈별 width/height
  let width = module.size === 'sm' ? 100 : module.size === 'md' ? 200 : 300;
  let height = module.size === 'sm' ? 100 : module.size === 'md' ? 200 : 300;

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
      <LottieView
        source={getLottieSource(module.src)}
        autoPlay
        loop={true}
        speed={1}
        style={{ 
          width: width, 
          height: height, 
          alignSelf: 'center', // RN에서는 margin: 'auto' 대신 이걸 사용
        }} 
      />
    </Animated.View>
  );
};

export const LottieComponent = React.memo(LottieComponentInner);