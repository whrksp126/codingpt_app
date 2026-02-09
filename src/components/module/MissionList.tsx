import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Animated, Easing } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';

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
  shouldComplete = false
}) => {
  const colorAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (shouldComplete) {
      Animated.timing(colorAnim, {
        toValue: 1,
        duration: 1000,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    }
  }, [shouldComplete]);

  // 테두리(Circle) 색상
  const borderColor = colorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(51, 51, 51, 0.8)', '#8B54F7'],
  });

  // 체크 표시(Path) 색상
  const checkColor = colorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(51, 51, 51, 0.8)', '#FFFFFF'],
  });

  // 배경색
  const fillColor = colorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['transparent', '#8B54F7'],
  });

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <AnimatedCircle
        cx="12"
        cy="12"
        r="11"
        stroke={borderColor}  // 테두리 색상
        fill={fillColor}  // 배경 색상
        strokeWidth="2"
      />
      <AnimatedPath
        d="M7 12L10.5 15.5L17 9"
        stroke={checkColor}  // 체크 표시 색상
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
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
}> = ({ item, isVisible, completed, onAppear, checkAnimationDelay = 0 }) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(8)).current;
  const [hasAppeared, setHasAppeared] = useState(false);
  const [shouldCompleteCheck, setShouldCompleteCheck] = useState(false);

  // completed가 true면 즉시 모든 아이템 표시
  useEffect(() => {
    if (completed && !hasAppeared) {
      setHasAppeared(true);
      fadeAnim.setValue(1);
      slideAnim.setValue(0);
      // 체크 애니메이션 시작
      setTimeout(() => {
        setShouldCompleteCheck(true);
      }, checkAnimationDelay);
    }
  }, [completed, hasAppeared, checkAnimationDelay]);

  // completed가 false면 isVisible에 따라 순차적으로 페이드인
  useEffect(() => {
    if (!completed && isVisible && !hasAppeared) {
      setHasAppeared(true);
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 400,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 400,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(() => {
        if (onAppear) {
          setTimeout(onAppear, 50);
        }
      });
    }
  }, [isVisible, hasAppeared, completed, onAppear]);

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        height: 24,
      }}
    >
      <Animated.View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        }}
      >
        <CheckIcon
          size={24}
          shouldComplete={shouldCompleteCheck}
        />
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
    </View>
  );
};

export const MissionListComponent: React.FC<MissionListProps & { visibleItemIds?: Set<string> }> = ({ module, visibleItemIds }) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(12)).current;
  const scaleAnim = useRef(new Animated.Value(0.97)).current;
  const viewRef = useRef<View>(null);

  useEffect(() => {
    // 프레임은 즉시 애니메이션으로 등장
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        tension: 60,
        friction: 12,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 60,
        friction: 12,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const handleItemAppear = () => {
    // 아이템이 나타날 때 레이아웃 변경을 알림
    viewRef.current?.measureInWindow(() => {
      // 부모 스크롤뷰가 자동으로 감지하도록 함
    });
  };

  return (
    <Animated.View
      ref={viewRef}
      style={{
        opacity: fadeAnim,
        transform: [{ translateY: slideAnim }, { scale: scaleAnim }],
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
      {/* Title */}
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

      {/* Items Container */}
      <View style={{ gap: 16 }}>
        {module.items.map((item, index) => {
          const itemId = `${module.id}-${item.id}`;
          const isVisible = visibleItemIds?.has(itemId) ?? false;
          // 첫 번째 아이템은 1000ms 후, 이후 1000ms씩 지연
          const checkAnimationDelay = (index + 1) * 1000;

          return (
            <MissionListItem
              key={item.id}
              item={item}
              isVisible={isVisible}
              completed={module.completed}
              onAppear={handleItemAppear}
              checkAnimationDelay={checkAnimationDelay}
            />
          );
        })}
      </View>
    </Animated.View>
  );
};

