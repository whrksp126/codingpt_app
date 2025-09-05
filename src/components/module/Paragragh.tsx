import React, { useState, useEffect, useRef } from 'react';
import { View, Image, Animated, Easing } from 'react-native';
import Markdown from 'react-native-markdown-display';

interface ParagraghComponentProps {
  module: {
    id: number;
    type: string;
    visibility: { type: string; value: number };
    content: string;
    src?: string;
    srcSize?: string | "sm" | "md" | "lg";
  };
}
const srcSizeMap: { [key: string | "sm" | "md" | "lg"]: { parrent: string, image: string } } = {
  sm: {
    parrent: 'flex flex-row gap-[20px]',
    image: 'w-[120px] aspect-square resize-contain',
  },
  md: {
    parrent: 'flex flex-row gap-[20px]',
    image: 'w-[180px] aspect-square resize-contain',
  },
  lg: {
    parrent: 'flex flex-col gap-[20px]',
    image: 'w-full aspect-square resize-contain',
  },
}

export const ParagraghComponent: React.FC<ParagraghComponentProps> = ({ module }) => {
  // 애니메이션 상태
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;
  const [isVisible, setIsVisible] = useState(false);

  // 컴포넌트 마운트 시 애니메이션
  useEffect(() => {
    // 약간의 지연 후 애니메이션 시작
    const timer = setTimeout(() => {
      setIsVisible(true);
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

  if(module.src){
    return (
      <Animated.View 
        className={`${srcSizeMap[`${module.srcSize}`].parrent}`}
        style={{
          opacity: fadeAnim,
          transform: [
            { translateY: slideAnim },
            { scale: scaleAnim }
          ],
        }}
      >
        <Image
          source={{ uri: module.src }}
          className={`${srcSizeMap[`${module.srcSize}`].image}`} 
        />
        <View className="flex-1">
          <Markdown
            style={{
              body: { fontSize: 14, color: '#333' },
              heading1: { fontSize: 20, fontWeight: 'bold' },
              heading2: { fontSize: 18, fontWeight: 'bold' },
              heading3: { fontSize: 16, fontWeight: 'bold' },
              bullet_list: { marginVertical: 4 },
              ordered_list: { marginVertical: 4 },
              link: { color: '#007AFF' },
              code_inline: {
                backgroundColor: '#f0f0f0',
                paddingHorizontal: 4,
                paddingVertical: 2,
                borderRadius: 4,
                fontFamily: 'monospace',
              },
              fence: {
                backgroundColor: '#f6f8fa',
                padding: 8,
                borderRadius: 6,
                fontFamily: 'monospace',
              },
            }}
          >
            {module.content}
          </Markdown>
        </View>
      </Animated.View>    
    );
  }


  return (
    <Animated.View
      style={{
        opacity: fadeAnim,
        transform: [
          { translateY: slideAnim },
          { scale: scaleAnim }
        ],
      }}
    >
      <Markdown
        style={{
          body: { fontSize: 14, color: '#333' },
          heading1: { fontSize: 20, fontWeight: 'bold' },
          heading2: { fontSize: 18, fontWeight: 'bold' },
          heading3: { fontSize: 16, fontWeight: 'bold' },
          bullet_list: { marginVertical: 4 },
          ordered_list: { marginVertical: 4 },
          link: { color: '#007AFF' },
          code_inline: {
            backgroundColor: '#f0f0f0',
            paddingHorizontal: 4,
            paddingVertical: 2,
            borderRadius: 4,
            fontFamily: 'monospace',
          },
          fence: {
            backgroundColor: '#f6f8fa',
            padding: 8,
            borderRadius: 6,
            fontFamily: 'monospace',
          },
        }}
      >
        {module.content}
      </Markdown>
    </Animated.View>
  );
};