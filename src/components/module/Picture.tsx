import React, { useEffect, useRef, useState } from 'react';
import { View, Image, Animated, Easing } from 'react-native';
import Markdown from 'react-native-markdown-display';

interface PictureComponentProps {
  module: {
    id: number;
    type: string;
    src: string;
    size: string;
    visibility: { type: string; value: number };
  };
}

export const PictureComponent: React.FC<PictureComponentProps> = ({ module }) => {
  // 애니메이션 상태
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;
  const [isVisible, setIsVisible] = useState(false);

  // 컴포넌트 마운트 시 애니메이션
  useEffect(() => {
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

  // 모듈 샘플
  // {
  //   id: 11, 
  //   type: 'image', 
  //   src: 'https://s3.ghmate.com/codingpt/mascot/mascot_001.png', 
  //   size: 'lg' 
  //   visibility: { type: 'step', value: 2 }
  // }



  // width만 고정, height는 비율에 맞게 자동 조정
  let widthStyle = {};
  if (module.size === 'sm') {
    widthStyle = { width: 100 };
  } else if (module.size === 'md') {
    widthStyle = { width: 200 };
  } else {
    widthStyle = { width: '100%' };
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
      <Image
        source={{ uri: module.src }}
        style={[widthStyle, { aspectRatio: 1, resizeMode: 'contain' }]}
      />
    </Animated.View>
  );
};