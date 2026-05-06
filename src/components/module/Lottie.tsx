import React, { useEffect, useState } from 'react';
import LottieView from 'lottie-react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  Easing,
  runOnJS,
} from 'react-native-reanimated';

type LottieSrc = 'CodingDevelio' | 'BusinessPlan' | 'MoneyRunAway';
type LottieSize = 'sm' | 'md' | 'lg' | 'xl' | 'xxl';

interface TimeVisibility {
  type: 'time';
  showDelay?: number;
  hideDelay?: number;
  shrinkDelay?: number;
  shrinkTo?: LottieSize;
}

interface StepVisibility {
  type: 'step';
  value: number;
}

interface LottieComponentProps {
  module: {
    id: number;
    type: string;
    src: LottieSrc;
    size: LottieSize;
    visibility: TimeVisibility | StepVisibility;
  };
  onHide?: () => void;
  onShrink?: () => void;
}

const sizeMap: Record<LottieSize, number> = {
  sm: 100,
  md: 200,
  lg: 300,
  xl: 400,
  xxl: 500,
};

const getLottieSource = (src: LottieSrc) => {
  switch (src) {
    case 'CodingDevelio':
      return require('../../assets/lottie/CodingDevelio.json');
    case 'BusinessPlan':
      return require('../../assets/lottie/BusinessPlan.json');
    case 'MoneyRunAway':
      return require('../../assets/lottie/BusinessPlan.json');
    default:
      return require('../../assets/lottie/CodingDevelio.json');
  }
};

const LottieComponentInner: React.FC<LottieComponentProps> = ({ module, onHide, onShrink }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isHidden, setIsHidden] = useState(false);

  const fadeAnim = useSharedValue(0);
  const slideAnim = useSharedValue(20);
  const scaleAnim = useSharedValue(0.95);
  const sizeAnim = useSharedValue(sizeMap[module.size]);

  const isTimeType = module.visibility.type === 'time';
  const timeVis = module.visibility as TimeVisibility;

  useEffect(() => {
    const timers: NodeJS.Timeout[] = [];

    const playEnter = (duration: number) => {
      fadeAnim.value = withTiming(1, { duration, easing: Easing.out(Easing.cubic) });
      slideAnim.value = withSpring(0, { damping: 14, stiffness: 110 });
      scaleAnim.value = withSpring(1, { damping: 12, stiffness: 130 });
    };

    if (isTimeType) {
      const showDelay = timeVis.showDelay ?? 0;

      const showTimer = setTimeout(() => {
        setIsVisible(true);
        playEnter(500);
      }, showDelay);
      timers.push(showTimer);

      if (timeVis.hideDelay !== undefined) {
        const hideTimer = setTimeout(() => {
          fadeAnim.value = withTiming(
            0,
            { duration: 400, easing: Easing.in(Easing.cubic) },
            (finished) => {
              if (finished) {
                runOnJS(setIsHidden)(true);
                if (onHide) runOnJS(onHide)();
              }
            },
          );
        }, timeVis.hideDelay);
        timers.push(hideTimer);
      }

      if (timeVis.shrinkDelay !== undefined && timeVis.shrinkTo) {
        const shrinkTimer = setTimeout(() => {
          const targetSize = sizeMap[timeVis.shrinkTo!];
          sizeAnim.value = withSpring(
            targetSize,
            { damping: 16, stiffness: 90 },
            (finished) => {
              if (finished && onShrink) runOnJS(onShrink)();
            },
          );
        }, timeVis.shrinkDelay);
        timers.push(shrinkTimer);
      }
    } else {
      setIsVisible(true);
      const timer = setTimeout(() => playEnter(600), 80);
      timers.push(timer);
    }

    return () => {
      timers.forEach((timer) => clearTimeout(timer));
    };
  }, [fadeAnim, slideAnim, scaleAnim, sizeAnim, isTimeType, timeVis, onHide, onShrink]);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: fadeAnim.value,
    transform: [{ translateY: slideAnim.value }, { scale: scaleAnim.value }],
  }));
  const sizeStyle = useAnimatedStyle(() => ({
    width: sizeAnim.value,
    height: sizeAnim.value,
  }));

  if (isHidden) return null;
  if (!isVisible && isTimeType) return null;

  return (
    <Animated.View
      style={[containerStyle, { alignItems: 'center', justifyContent: 'center' }]}
    >
      <Animated.View style={sizeStyle}>
        <LottieView
          source={getLottieSource(module.src)}
          autoPlay
          loop={true}
          speed={1}
          style={{ width: '100%', height: '100%' }}
        />
      </Animated.View>
    </Animated.View>
  );
};

export const LottieComponent = React.memo(LottieComponentInner);
