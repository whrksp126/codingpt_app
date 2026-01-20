import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Animated, Easing } from 'react-native';
import RenderHTML from 'react-native-render-html';
import { htmlTagsStyles, classesStyles } from '../../utils/htmlStyles';

interface TagDescriptionItem {
  id: number;
  tag: string;
  description: string;
}

interface TagDescriptionListProps {
  module: {
    id: number;
    type: string;
    items: TagDescriptionItem[];
    visibility?: {
      type: string;
      time?: number;
    };
  };
}

const TagDescriptionListItem: React.FC<{ 
  item: TagDescriptionItem; 
  onAppear?: () => void;
  isLast?: boolean;
  index: number;
}> = ({ item, onAppear, isLast, index }) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(8)).current;
  const [hasAppeared, setHasAppeared] = useState(false);

  useEffect(() => {
    // 순차적으로 나타나도록 인덱스 * 1000ms 딜레이
    const delay = index * 1000;
    
    const timer = setTimeout(() => {
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
    }, delay);

    return () => clearTimeout(timer);
  }, [index]);

  return (
    <Animated.View
      style={{
        opacity: fadeAnim,
        transform: [{ translateY: slideAnim }],
        borderBottomWidth: isLast ? 0 : 0.75,
        borderBottomColor: '#E1E6EF',
        paddingBottom: isLast ? 0 : 15.75,
        gap: 10,
      }}
    >
      {/* Tag */}
      <View
        style={{
          backgroundColor: '#F0F5FF',
          borderRadius: 6,
          paddingHorizontal: 8,
          paddingVertical: 4,
          alignSelf: 'flex-start',
        }}
      >
        <Text
          style={{
            fontFamily: 'PretendardVariable',
            fontWeight: '700',
            fontSize: 14,
            lineHeight: 21,
            color: '#2F6FED',
            letterSpacing: -0.28,
          }}
        >
          {item.tag}
        </Text>
      </View>

      {/* Description */}
      <RenderHTML
        contentWidth={300}
        source={{ html: item.description }}
        tagsStyles={htmlTagsStyles}
        classesStyles={classesStyles}
        baseStyle={{
          fontFamily: 'PretendardVariable',
          fontWeight: '400',
          fontSize: 15,
          lineHeight: 22.5,
          color: '#333',
          letterSpacing: -0.3,
        }}
      />
    </Animated.View>
  );
};

export const TagDescriptionListComponent: React.FC<TagDescriptionListProps> = ({ module }) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(12)).current;
  const scaleAnim = useRef(new Animated.Value(0.97)).current;
  const viewRef = useRef<View>(null);

  useEffect(() => {
    // 즉시 등장 (duration은 HtmlLessonScreen에서 관리)
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
    viewRef.current?.measureInWindow(() => {});
  };

  return (
    <Animated.View
      ref={viewRef}
      style={{
        opacity: fadeAnim,
        transform: [{ translateY: slideAnim }, { scale: scaleAnim }],
        backgroundColor: '#F8F9FC',
        borderRadius: 16,
        padding: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.2,
        shadowRadius: 5,
        elevation: 5,
        gap: 15,
      }}
    >
      {module.items.map((item, index) => (
        <TagDescriptionListItem 
          key={item.id} 
          item={item} 
          index={index}
          onAppear={handleItemAppear}
          isLast={index === module.items.length - 1}
        />
      ))}
    </Animated.View>
  );
};

