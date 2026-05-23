import React, { useEffect, useRef, useState } from 'react';
import { View, Text, LayoutChangeEvent } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withDelay,
  interpolateColor,
  Easing,
} from 'react-native-reanimated';
import {
  DURATION_MODULE_ENTER,
  EASE_OUT_EXPO,
  SPRING_GENTLE_POP,
} from '../../animations/presets';
import { ENABLE_NEW_LESSON_ANIMATIONS } from '../../utils/featureFlags';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);

interface MissionItem {
  id: number;
  text: string;
  showDelay?: number;
}

interface MissionListProps {
  module: {
    id: number;
    type: string;
    title: string;
    completed?: boolean;
    items: MissionItem[];
    visibility?: {
      type: string;
      showDelay?: number;
    };
  };
}

const CheckIcon: React.FC<{ size?: number; shouldComplete?: boolean }> = ({
  size = 24,
  shouldComplete = false,
}) => {
  const colorAnim = useSharedValue(0);

  useEffect(() => {
    if (shouldComplete) {
      colorAnim.value = withTiming(1, { duration: 1000, easing: Easing.out(Easing.cubic) });
    }
  }, [shouldComplete, colorAnim]);

  const circleProps = useAnimatedProps(() => ({
    stroke: interpolateColor(colorAnim.value, [0, 1], ['rgba(51, 51, 51, 0.8)', '#8B54F7']),
    fill: interpolateColor(colorAnim.value, [0, 1], ['rgba(0,0,0,0)', '#8B54F7']),
  }));

  const pathProps = useAnimatedProps(() => ({
    stroke: interpolateColor(colorAnim.value, [0, 1], ['rgba(51, 51, 51, 0.8)', '#FFFFFF']),
  }));

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <AnimatedCircle cx="12" cy="12" r="11" strokeWidth="2" animatedProps={circleProps} />
      <AnimatedPath
        d="M7 12L10.5 15.5L17 9"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        animatedProps={pathProps}
      />
    </Svg>
  );
};

const MissionListItem: React.FC<{
  item: MissionItem;
  isVisible: boolean;
  completed?: boolean;
  checkAnimationDelay?: number;
  itemKey: string;
  onLayout?: (itemKey: string, relativeY: number) => void;
  skipEnter?: boolean;
}> = ({ item, isVisible, completed, checkAnimationDelay = 0, itemKey, onLayout, skipEnter = false }) => {
  const [shouldCompleteCheck, setShouldCompleteCheck] = useState(false);
  const enabled = ENABLE_NEW_LESSON_ANIMATIONS && !skipEnter;

  // entrance — isVisible=false → true 로 전이될 때 한 번만 발동.
  // 캐릭터 말풍선(SpeechItem)과 동일한 translateY + scale 패턴으로 통일.
  // 이전에는 translateX 였지만, 모듈 컨테이너(ModuleEnter)가 translateY 로 등장해서 방향이 어긋났음.
  const opacity = useSharedValue(isVisible && !enabled ? 1 : 0);
  const ty = useSharedValue(isVisible && !enabled ? 0 : 14);
  const sc = useSharedValue(isVisible && !enabled ? 1 : 0.97);
  const enteredRef = useRef(false);

  useEffect(() => {
    if (completed) {
      const timer = setTimeout(() => setShouldCompleteCheck(true), checkAnimationDelay);
      return () => clearTimeout(timer);
    }
  }, [completed, checkAnimationDelay]);

  useEffect(() => {
    if (!isVisible) {
      // 아직 안 보임 — 자리는 차지하되 placeholder 만
      return;
    }
    if (enteredRef.current) return;
    enteredRef.current = true;

    if (!enabled) {
      opacity.value = 1;
      ty.value = 0;
      sc.value = 1;
      return;
    }
    // 200ms delay — scroll 이 끝날 무렵 entrance 가 시작되도록 (다른 모듈/말풍선과 통일).
    opacity.value = withDelay(200, withTiming(1, { duration: DURATION_MODULE_ENTER, easing: EASE_OUT_EXPO }));
    ty.value = withDelay(200, withSpring(0, SPRING_GENTLE_POP));
    sc.value = withDelay(200, withSpring(1, SPRING_GENTLE_POP));
  }, [isVisible, enabled, opacity, ty, sc]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: ty.value }, { scale: sc.value }],
  }));

  const handleLayout = (e: LayoutChangeEvent) => {
    onLayout?.(itemKey, e.nativeEvent.layout.y);
  };

  // 자리는 항상 차지 (완료/미완료 모두 height 24)
  const showContent = isVisible || completed;

  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'center', height: 24 }}
      onLayout={handleLayout}
    >
      {showContent ? (
        <Animated.View style={[{ flexDirection: 'row', alignItems: 'center' }, animStyle]}>
          <CheckIcon size={24} shouldComplete={shouldCompleteCheck} />
          <Text
            style={{
              fontFamily: 'PretendardVariable',
              fontWeight: '700',
              fontSize: 18,
              lineHeight: 24,
              color: 'rgba(51, 51, 51, 0.8)',
              marginLeft: 12,
            }}
          >
            {item.text}
          </Text>
        </Animated.View>
      ) : null}
    </View>
  );
};

export const MissionListComponent: React.FC<MissionListProps & {
  visibleItemIds?: Set<string>;
  onItemLayout?: (itemKey: string, relativeY: number) => void;
  skipEnter?: boolean;
}> = ({
  module,
  visibleItemIds,
  onItemLayout,
  skipEnter = false,
}) => {
  return (
    <View
      style={{
        backgroundColor: '#F8F9FC',
        borderRadius: 16,
        padding: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 12,
        elevation: 1,
      }}
    >
      <Text
        style={{
          fontFamily: 'PretendardVariable',
          fontWeight: '700',
          fontSize: 22,
          lineHeight: 33,
          color: '#333',
          textAlign: 'center',
          letterSpacing: -0.44,
          marginBottom: 24,
        }}
      >
        {module.title}
      </Text>

      <View style={{ gap: 16 }}>
        {module.items.map((item, index) => {
          const itemId = `${module.id}-${item.id}`;
          const isVisible = visibleItemIds?.has(itemId) ?? false;
          const checkAnimationDelay = (index + 1) * 1000;

          return (
            <MissionListItem
              key={item.id}
              item={item}
              itemKey={itemId}
              isVisible={isVisible}
              completed={module.completed}
              checkAnimationDelay={checkAnimationDelay}
              onLayout={onItemLayout}
              skipEnter={skipEnter}
            />
          );
        })}
      </View>
    </View>
  );
};
