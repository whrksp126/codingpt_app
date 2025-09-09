import React, { useEffect, useRef, useState } from 'react';
import { View, Image, Animated, Easing, Dimensions, Text } from 'react-native';
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
  // 애니메이션 상태 (로티 모듈과 동일)
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;
  const [isVisible, setIsVisible] = useState(false);
  const [imageAspectRatio, setImageAspectRatio] = useState<number>(1.777559);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [imageOpacityValue, setImageOpacityValue] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);

  // 컴포넌트 마운트 시 애니메이션 (로티 모듈과 동일)
  useEffect(() => {
    console.log(module)
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
  }, [fadeAnim, slideAnim, scaleAnim, module]);

  // 모듈 샘플
  // {
  //   id: 11, 
  //   type: 'image', 
  //   src: 'https://s3.ghmate.com/codingpt/mascot/mascot_001.png', 
  //   size: 'lg' 
  //   visibility: { type: 'step', value: 2 }
  // }



  // width와 비율로 정확한 높이 계산
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
    // lg일 때는 containerWidth가 측정되면 그 값을 사용, 아니면 고정 높이 사용
    if (containerWidth > 0) {
      const width = containerWidth;
      calculatedHeight = width / imageAspectRatio;
      widthStyle = { width, height: calculatedHeight };
    } else {
      // 컨테이너 너비가 측정되기 전까지는 고정 높이 사용
      const fixedHeight = 208.15;
      widthStyle = { width: '100%', height: fixedHeight };
    }
  }
  
  // 계산된 크기 로그 출력
  console.log(`Image size: ${module.size}, width: ${widthStyle.width}, height: ${calculatedHeight.toFixed(2)}`);

  // 이미지 스타일 (정확한 크기 적용 + 라운드)
  const imageStyle = [
    widthStyle,
    {
      borderRadius: 12,
      overflow: 'hidden'
    }
  ];

  // 스켈레톤 애니메이션
  const skeletonAnim = useRef(new Animated.Value(0)).current;
  
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

  // containerWidth가 변경될 때마다 크기 재계산
  useEffect(() => {
    if (module.size === 'lg' && containerWidth > 0) {
      console.log(`Container width updated: ${containerWidth}px`);
    }
  }, [containerWidth, module.size]);

  // 스켈레톤 스타일 (정확한 크기 적용 + 라운드)
  const skeletonStyle = [
    widthStyle,
    { 
      backgroundColor: '#e0e0e0',
      borderRadius: 12,
      overflow: 'hidden',
      position: 'relative'
    }
  ];

  return (
    <Animated.View
      style={[
        widthStyle,
        {
          opacity: fadeAnim,
          transform: [
            { translateY: slideAnim },
            { scale: scaleAnim }
          ],
        }
      ]}
      onLayout={(event) => {
        const { width } = event.nativeEvent.layout;
        if (module.size === 'lg' && containerWidth !== width) {
          setContainerWidth(width);
        }
      }}
    >
      {!imageLoaded && !imageError && (
        <Animated.View style={skeletonStyle}>
          {/* 스켈레톤 셰이머 효과 */}
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
                outputRange: [0.3, 0.7]
              }),
              transform: [
                {
                  translateX: skeletonAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['-100%', '100%']
                  })
                }
              ]
            }}
          />
          {/* 스켈레톤 컨텐츠 */}
          <View style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            justifyContent: 'center',
            alignItems: 'center'
          }}>
            <View style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: '#d0d0d0',
              marginBottom: 8
            }} />
            <View style={{
              width: 60,
              height: 8,
              backgroundColor: '#d0d0d0',
              borderRadius: 4
            }} />
          </View>
        </Animated.View>
      )}
      
      {imageError && (
        <Animated.View style={skeletonStyle}>
          <View style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            justifyContent: 'center',
            alignItems: 'center'
          }}>
            <View style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: '#ffcccc',
              marginBottom: 8,
              justifyContent: 'center',
              alignItems: 'center'
            }}>
              <Text style={{ color: '#ff6b6b', fontSize: 16 }}>!</Text>
            </View>
            <Text style={{ 
              color: '#ff6b6b', 
              fontSize: 12,
              textAlign: 'center'
            }}>
              이미지 로드 실패
            </Text>
          </View>
        </Animated.View>
      )}

      {!imageError && (
        <Image
          source={{ uri: module.src }}
          style={[
            imageStyle, 
            { 
              opacity: imageOpacityValue,
              backgroundColor: '#f0f0f0',
              transition: 'opacity 0.3s ease-out'
            }
          ]}
          resizeMode="cover"
          onError={(error) => {
            console.log('Image load error:', error.nativeEvent.error);
            console.log('Image source:', module.src);
            setImageError(true);
          }}
          onLoad={() => {
            setImageLoaded(true);
            
            // 이미지 로드 완료 시 부드러운 페이드인
            setTimeout(() => {
              setImageOpacityValue(1);
            }, 100);
            
            console.log('Image loaded successfully:', module.src);
          }}
        />
      )}
    </Animated.View>
  );
};