import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  interpolateColor,
  Easing,
} from 'react-native-reanimated';

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
  onAppear?: () => void;
  checkAnimationDelay?: number;
}> = ({ item, isVisible, completed, checkAnimationDelay = 0 }) => {
  const [shouldCompleteCheck, setShouldCompleteCheck] = useState(false);

  useEffect(() => {
    if (completed) {
      const timer = setTimeout(() => setShouldCompleteCheck(true), checkAnimationDelay);
      return () => clearTimeout(timer);
    }
  }, [completed, checkAnimationDelay]);

  if (!completed && !isVisible) {
    return <View style={{ flexDirection: 'row', alignItems: 'center', height: 24 }} />;
  }

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', height: 24 }}>
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
    </View>
  );
};

export const MissionListComponent: React.FC<MissionListProps & { visibleItemIds?: Set<string> }> = ({
  module,
  visibleItemIds,
}) => {
  return (
    <View
      style={{
        backgroundColor: '#F8F9FC',
        borderRadius: 16,
        padding: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.25,
        shadowRadius: 5,
        elevation: 5,
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
              isVisible={isVisible}
              completed={module.completed}
              checkAnimationDelay={checkAnimationDelay}
            />
          );
        })}
      </View>
    </View>
  );
};
