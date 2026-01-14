import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Animated, Easing } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';

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

const CheckIcon: React.FC<{ size?: number; completed?: boolean }> = ({ size = 24, completed = false }) => {
  const strokeColor = completed ? '#08875D' : 'rgba(51, 51, 51, 0.8)';

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="11" stroke={strokeColor} strokeWidth="2" />
      <Path
        d="M7 12L10.5 15.5L17 9"
        stroke={strokeColor}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
};

const MissionListItem: React.FC<{ item: MissionItem; isVisible: boolean; completed?: boolean; onAppear?: () => void }> = ({ item, isVisible, completed, onAppear }) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(8)).current;
  const [hasAppeared, setHasAppeared] = useState(false);

  useEffect(() => {
    if (isVisible && !hasAppeared) {
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
        // 애니메이션 완료 후 스크롤 트리거
        if (onAppear) {
          setTimeout(onAppear, 50);
        }
      });
    }
  }, [isVisible, hasAppeared]);

  // 완료 상태일 때(슬라이드 재방문 등) 즉시 표시
  useEffect(() => {
    if (completed && !hasAppeared) {
      setHasAppeared(true);
      fadeAnim.setValue(1);
      slideAnim.setValue(0);
    }
  }, [completed]);

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
        <CheckIcon size={24} completed={completed} />
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
        {module.items.map((item) => {
          const itemId = `${module.id}-${item.id}`;
          const isVisible = visibleItemIds?.has(itemId) ?? false;

          return (
            <MissionListItem
              key={item.id}
              item={item}
              isVisible={isVisible}
              completed={module.completed}
              onAppear={handleItemAppear}
            />
          );
        })}
      </View>
    </Animated.View>
  );
};

