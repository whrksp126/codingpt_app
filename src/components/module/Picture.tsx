// Picture.tsx
import React, { useEffect, useRef, useState } from 'react';
import { View, Image, Animated, Easing } from 'react-native';

type PictureSrc =
  | 'html_lesson01_character_phone'
  | 'html_lesson01_screen'
  | 'html_lesson01_character';

type PictureVisibility = {
  type: 'step' | 'time';
  value?: number;

  // time 기반일 때 옵션 (필요한 모듈에서만 사용)
  showDelay?: number;       // 등장 시점(ms)
  hideDelay?: number;       // 사라지는 시점(ms)
  shrinkDelay?: number;     // 축소 시작 시점(ms)
  shrinkTo?: 'sm' | 'md' | 'lg';
  shrinkMoveUp?: number;    // (지금은 사용 X, 추후 필요시 다시 사용)
};

interface PictureComponentProps {
  module: {
    id: number;
    type: string;
    src: PictureSrc;
    size: 'sm' | 'md' | 'lg';
    visibility?: PictureVisibility;

    alignX?: 'left' | 'center' | 'right';
    aspectRatio?: number;   // 기본 16:9
    fit?: 'contain' | 'cover';
  };
}

// 정적 이미지 소스 매핑
const getPictureSource = (src: PictureSrc) => {
  switch (src) {
    case 'html_lesson01_character_phone':
      return require('../../assets/images/html_lesson01_character_phone.png');
    case 'html_lesson01_screen':
      return require('../../assets/images/html_lesson01_screen.png');
    case 'html_lesson01_character':
      return require('../../assets/images/html_lesson01_character.png');
  }
};

export const PictureComponent: React.FC<PictureComponentProps> = ({ module }) => {
  // 🎬 등장 애니메이션 값
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;

  // 이미지 페이드인용
  const imageOpacity = useRef(new Animated.Value(0)).current;

  const [isVisible, setIsVisible] = useState(
    module.visibility?.type === 'time' ? false : true,
  );
  const [imageAspectRatio] = useState<number>(module.aspectRatio || 16 / 9);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  // 🔑 핵심: 실제 레이아웃에 쓰는 현재 size
  const [currentSize, setCurrentSize] = useState<'sm' | 'md' | 'lg'>(module.size);

  // 가로 정렬
  const alignXStyle =
    module.alignX === 'left'
      ? 'flex-start'
      : module.alignX === 'right'
      ? 'flex-end'
      : 'center';

  // 🔢 현재 size 기준 width / height 계산
  const getContentStyle = () => {
    if (currentSize === 'sm') {
      return {
        width: 140,
        height: 140 / imageAspectRatio,
      };
    }
    if (currentSize === 'md') {
      return {
        width: 220,
        height: 220 / imageAspectRatio,
      };
    }
    if (currentSize === 'lg') {
      return {
        width: 350,
        height: 350 / imageAspectRatio,
      };
    }
    // fallback
    return {
      width: 300,
      height: 300 / imageAspectRatio,
    };
  };

  const contentSizeStyle = getContentStyle();
  const animatedContentStyle = contentSizeStyle as any;

  useEffect(() => {
    const visibility = module.visibility;

    // ✅ step 타입이거나 visibility가 없으면: 바로 등장 애니메이션
    if (!visibility || visibility.type !== 'time') {
      setIsVisible(true);

      const timer = setTimeout(() => {
        Animated.parallel([
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 800,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.spring(translateY, {
            toValue: 0,
            tension: 80,
            friction: 8,
            useNativeDriver: true,
          }),
        ]).start();
      }, 60);

      return () => clearTimeout(timer);
    }

    // ✅ time 타입일 때: showDelay / shrinkDelay / hideDelay 처리
    const showDelay = visibility.showDelay ?? 0;
    const hideDelay = visibility.hideDelay;
    const shrinkDelay = visibility.shrinkDelay;
    const shrinkTo = visibility.shrinkTo;

    // 1) 등장
    const showTimer = setTimeout(() => {
      setIsVisible(true);

      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 800,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(translateY, {
          toValue: 0,
          tension: 80,
          friction: 8,
          useNativeDriver: true,
        }),
      ]).start();
    }, showDelay);

    // 2) 축소: ✨ 여기서 레이아웃 size 자체를 변경
    let shrinkTimer: NodeJS.Timeout | undefined;
    if (typeof shrinkDelay === 'number' && shrinkTo) {
      shrinkTimer = setTimeout(() => {
        setCurrentSize(shrinkTo);
        // 필요하면 약간만 위로 올리는 효과
        Animated.timing(translateY, {
          toValue: -10, // 살짝만 위로
          duration: 400,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start();
      }, shrinkDelay);
    }

    // 3) 퇴장 (지금은 id=1에서는 안 쓰지만 구조상 유지)
    let hideTimer: NodeJS.Timeout | undefined;
    if (typeof hideDelay === 'number') {
      hideTimer = setTimeout(() => {
        Animated.parallel([
          Animated.timing(fadeAnim, {
            toValue: 0,
            duration: 300,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(translateY, {
            toValue: 20,
            duration: 300,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]).start(({ finished }) => {
          if (finished) setIsVisible(false);
        });
      }, hideDelay);
    }

    return () => {
      clearTimeout(showTimer);
      if (shrinkTimer) clearTimeout(shrinkTimer);
      if (hideTimer) clearTimeout(hideTimer);
    };
  }, [module.visibility, fadeAnim, translateY]);

  // time 타입인데 아직 등장 전이면 아무것도 그리지 않음
  if (!isVisible) return null;

  return (
    <View
      style={{
        width: '100%',
        alignItems: alignXStyle,
        marginVertical: 5,
      }}
    >
      <Animated.View
        style={{
          opacity: fadeAnim,
          transform: [{ translateY }],
        }}
      >
        {/* 실제 이미지 */}
        {!imageError && (
          <Animated.View
            style={[
              animatedContentStyle,
              {
                opacity: imageOpacity,
              },
            ]}
          >
            <Image
              source={getPictureSource(module.src)}
              style={contentSizeStyle as any}
              resizeMode={module.fit || 'cover'}
              onError={() => setImageError(true)}
              onLoad={() => {
                setImageLoaded(true);
                Animated.timing(imageOpacity, {
                  toValue: 1,
                  duration: 300,
                  useNativeDriver: true,
                }).start();
              }}
            />
          </Animated.View>
        )}
      </Animated.View>
    </View>
  );
};
