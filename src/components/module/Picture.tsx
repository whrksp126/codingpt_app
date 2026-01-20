// Picture.tsx
import React, { useEffect, useRef, useState } from 'react';
import { View, Image, Animated, Easing } from 'react-native';
import * as SvgIcons from '../../assets/SvgIcon';

type PictureSrc =
  | 'html_lesson01_character_phone'
  | 'html_lesson01_screen'
  | 'html_lesson01_character'
  | 'hamburger'
  | 'html_role_img'
  | 'html_lesson_02';

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
    src?: PictureSrc;
    size?: 'sm' | 'md' | 'lg' | { width: number; height: number };
    visibility?: PictureVisibility;

    alignX?: 'left' | 'center' | 'right';
    aspectRatio?: number;   // 기본 16:9
    fit?: 'contain' | 'cover';
    
    // SVG 아이콘 관련 속성
    icon?: keyof typeof SvgIcons;  // SvgIcon.tsx의 아이콘 이름
    svgSize?: number;              // SVG 아이콘 크기
    svgFill?: string;              // SVG fill 색상
    backgroundShape?: 'circle' | 'square';  // 배경 모양
    backgroundSize?: number;       // 배경 크기
    backgroundColor?: string;      // 배경 색상
    containerHeightRatio?: number; // 컨테이너 높이 비율
    
    // 이미지 컨테이너 배경 스타일
    containerBackground?: string;   // 컨테이너 배경색
    containerPadding?: number;      // 컨테이너 패딩
    containerBorderRadius?: number; // 컨테이너 모서리 둥글기
    containerShadow?: boolean;      // 그림자 효과
  };
}

// 정적 이미지 소스 매핑
const getPictureSource = (src: PictureSrc) => {
  switch (src) {
    case 'html_lesson01_character_phone':
      return require('../../assets/images/mascot_js.png');
    case 'html_lesson01_screen':
      return require('../../assets/images/mascot_css.png');
    case 'html_lesson01_character':
      return require('../../assets/images/mascot_html.png');
    case 'hamburger':
      return require('../../assets/images/hamburger.png');
    case 'html_role_img':
      return require('../../assets/images/html_role_img.png');
    case 'html_lesson_02':
      return require('../../assets/images/html_lesson_02.png');
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
  const [currentSize, setCurrentSize] = useState<'sm' | 'md' | 'lg' | { width: number; height: number }>(
    module.size || 'md'
  );

  // 가로 정렬
  const alignXStyle =
    module.alignX === 'left'
      ? 'flex-start'
      : module.alignX === 'right'
      ? 'flex-end'
      : 'center';

  // 🔢 현재 size 기준 width / height 계산
  const getContentStyle = () => {
    // size가 객체 형태인 경우 직접 사용
    if (typeof currentSize === 'object' && 'width' in currentSize && 'height' in currentSize) {
      return {
        width: currentSize.width,
        height: currentSize.height,
      };
    }
    
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

  // SVG 아이콘 렌더링
  if (module.icon) {
    const SvgIcon = SvgIcons[module.icon] as React.ComponentType<{
      width?: number;
      height?: number;
      fill?: string;
    }>;

    if (!SvgIcon) {
      console.warn(`SVG icon "${module.icon}" not found in SvgIcon.tsx`);
      return null;
    }

    const svgSize = module.svgSize || 32;
    const backgroundSize = module.backgroundSize || 64;
    const backgroundColor = module.backgroundColor || '#F3F4F6';
    const svgFill = module.svgFill || '#111827';
    const isCircle = module.backgroundShape === 'circle';

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
          <View
            style={{
              width: backgroundSize,
              height: backgroundSize,
              backgroundColor: backgroundColor,
              borderRadius: isCircle ? backgroundSize / 2 : 8,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <SvgIcon width={svgSize} height={svgSize} fill={svgFill} />
          </View>
        </Animated.View>
      </View>
    );
  }

  // 컨테이너 배경 스타일
  const containerStyle = module.containerBackground ? {
    backgroundColor: module.containerBackground,
    padding: module.containerPadding || 20,
    borderRadius: module.containerBorderRadius || 16,
    ...(module.containerShadow ? {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08,
      shadowRadius: 12,
      elevation: 5,
    } : {}),
  } : {};

  // 기존 이미지 렌더링
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
        <View style={containerStyle}>
          {/* 실제 이미지 */}
          {!imageError && module.src && (
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
                resizeMode={module.fit || 'contain'}
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
        </View>
      </Animated.View>
    </View>
  );
};
