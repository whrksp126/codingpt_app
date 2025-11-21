// Picture.tsx
import React, { useEffect, useRef, useState } from 'react';
import { Image, Animated, Easing } from 'react-native';

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
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;
  const skeletonAnim = useRef(new Animated.Value(0)).current;
  const imageOpacity = useRef(new Animated.Value(0)).current; // 이미지 전용 opacity 애니메이션

  const [imageAspectRatio, setImageAspectRatio] = useState<number>(1.777);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [containerWidth, setContainerWidth] = useState(0);

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

  // 이미지 로딩 중 스켈레톤 애니메이션
  useEffect(() => {
    if (!imageLoaded && !imageError) {
      const shimmer = Animated.loop(
        Animated.sequence([
          Animated.timing(skeletonAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(skeletonAnim, {
            toValue: 0,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      );
      shimmer.start();
      return () => shimmer.stop();
    }
  }, [imageLoaded, imageError, skeletonAnim]);

  // width & height
  let widthStyle = {};
  let calculatedHeight = 0;

  if (module.size === 'sm') {
    const width = 100;
    calculatedHeight = width / imageAspectRatio;
    widthStyle = { width, height: calculatedHeight };
  } else if (module.size === 'md') {
    const width = 200;
    calculatedHeight = width / imageAspectRatio;
    widthStyle = { width, height: calculatedHeight };
  } else {
    if (containerWidth > 0) {
      const width = containerWidth;
      calculatedHeight = width / imageAspectRatio;
      widthStyle = { width, height: calculatedHeight };
    } else {
      const fixedHeight = 208.15;
      widthStyle = { width: '100%', height: fixedHeight };
    }
  }

  return (
    <Animated.View
      style={[
        widthStyle,
        {
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }, { scale: scaleAnim }],
        },
      ]}
      onLayout={(event) => {
        const { width } = event.nativeEvent.layout;
        if (module.size === 'lg' && containerWidth !== width) {
          setContainerWidth(width);
        }
      }}
    >
      {/* 스켈레톤 애니메이션 */}
      {!imageLoaded && !imageError && (
        <Animated.View
          style={[
            widthStyle,
            {
              backgroundColor: '#e0e0e0',
              borderRadius: 12,
              overflow: 'hidden',
              position: 'relative',
            },
          ]}
        >
          <Animated.View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: '#f0f0f0',
              opacity: skeletonAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0.3, 0.7],
              }),
              transform: [
                {
                  translateX: skeletonAnim.interpolate({
                    inputRange: [0, 1],
                    // ✅ 퍼센트를 숫자로 환산해서 적용
                    outputRange: [
                      -(containerWidth || 200),
                      containerWidth || 200,
                    ],
                  }),
                },
              ],
            }}
          />
        </Animated.View>
      )}

      {/* 이미지 */}
      {!imageError && (
        <Animated.View
          style={[
            widthStyle,
            {
              position: 'absolute',
              top: 0,
              left: 0,
              opacity: imageOpacity,
            },
          ]}
        >
          <Image
            source={{ uri: module.src }}
            style={[
              {
                borderRadius: 12,
                backgroundColor: '#f0f0f0',
              },
              widthStyle,
            ]}
            resizeMode="cover"
            onError={() => setImageError(true)}
            onLoad={() => {
              setImageLoaded(true);
              Animated.timing(imageOpacity, { // 이미지 페이드인 + 스켈레톤 멈춤
                toValue: 1,
                duration: 300,
                useNativeDriver: true,
              }).start();
            }}
          />
        </Animated.View>
      )}
    </Animated.View>
  );
};
