// Picture.tsx
import React, { useEffect, useState } from 'react';
import { View, Image } from 'react-native';
import * as SvgIcons from '../../assets/SvgIcon';

type PictureSrc =
  | 'html_lesson01_character_phone'
  | 'html_lesson01_screen'
  | 'html_lesson01_character'
  | 'hamburger'
  | 'html_role_img'
  | 'html_lesson_02'
  | 'html_lesson_03'
  | 'html_lesson_04'
  | 'html_lesson_09'
  | 'html_lesson_09_2'
  | 'css_lesson_01'
  | 'css_lesson_02'
  | 'css_lesson_04'
  | 'css_lesson_04_2'
  | 'css_lesson_04_3'
  | 'css_lesson_07'
  | 'css_lesson_08'
  | 'css_lesson_09_1'
  | 'css_lesson_09_2'
  | 'js_lesson_02'
  | 'js_lesson_04_1'
  | 'js_lesson_04_2'
  | 'js_lesson_05_1';

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
    src?: PictureSrc | string;
    size?: 'sm' | 'md' | 'lg' | 'xl' | { width: number; height: number };
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

// 정적 이미지 소스 매핑 (ObjectStore URL은 그대로 사용, 키는 require fallback)
const getPictureSource = (src: PictureSrc | string) => {
  if (typeof src === 'string' && (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('file:'))) {
    return { uri: src };
  }
  switch (src as PictureSrc) {
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
    case 'html_lesson_03':
      return require('../../assets/images/html_lesson_03.png');
    case 'html_lesson_04':
      return require('../../assets/images/html_lesson_04.png');
    case 'html_lesson_09':
      return require('../../assets/images/html_lesson_09.png');
    case 'html_lesson_09_2':
      return require('../../assets/images/html_lesson_09_2.png');
    case 'css_lesson_01':
      return require('../../assets/images/css_lesson_01.png');
    case 'css_lesson_02':
      return require('../../assets/images/css_lesson_02.png');
    case 'css_lesson_04':
      return require('../../assets/images/css_lesson_04.png');
    case 'css_lesson_04_2':
      return require('../../assets/images/css_lesson_04_2.png');
    case 'css_lesson_04_3':
      return require('../../assets/images/css_lesson_04_3.png');
    case 'css_lesson_07':
      return require('../../assets/images/css_lesson_07.png');
    case 'css_lesson_08':
      return require('../../assets/images/css_lesson_08.png');
    case 'css_lesson_09_1':
      return require('../../assets/images/css_lesson_09_1.png');
    case 'css_lesson_09_2':
      return require('../../assets/images/css_lesson_09_2.png');
    case 'js_lesson_02':
      return require('../../assets/images/js_lesson_02.png');
    case 'js_lesson_04_1':
      return require('../../assets/images/js_lesson_04_1.png');
    case 'js_lesson_04_2':
      return require('../../assets/images/js_lesson_04_2.png');
    case 'js_lesson_05_1':
      return require('../../assets/images/js_lesson_05_1.png');
  }
};

export const PictureComponent: React.FC<PictureComponentProps> = ({ module }) => {
  const [isVisible, setIsVisible] = useState(
    module.visibility?.type === 'time' ? false : true,
  );
  const [imageAspectRatio] = useState<number>(module.aspectRatio || 16 / 9);
  const [imageError, setImageError] = useState(false);

  // 🔑 핵심: 실제 레이아웃에 쓰는 현재 size
  const [currentSize, setCurrentSize] = useState<'sm' | 'md' | 'lg' | 'xl' | { width: number; height: number }>(
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
    if (currentSize === 'xl') {
      return {
        width: 395,
        height: 395 / imageAspectRatio,
      };
    }
    // fallback
    return {
      width: 300,
      height: 300 / imageAspectRatio,
    };
  };

  const contentSizeStyle = getContentStyle();

  useEffect(() => {
    const visibility = module.visibility;

    // step 타입이거나 visibility가 없으면 바로 등장
    if (!visibility || visibility.type !== 'time') {
      setIsVisible(true);
      return;
    }

    // time 타입: showDelay / shrinkDelay / hideDelay 처리 (애니메이션 없이 즉시 토글)
    const showDelay = visibility.showDelay ?? 0;
    const hideDelay = visibility.hideDelay;
    const shrinkDelay = visibility.shrinkDelay;
    const shrinkTo = visibility.shrinkTo;

    const showTimer = setTimeout(() => setIsVisible(true), showDelay);

    let shrinkTimer: NodeJS.Timeout | undefined;
    if (typeof shrinkDelay === 'number' && shrinkTo) {
      shrinkTimer = setTimeout(() => setCurrentSize(shrinkTo), shrinkDelay);
    }

    let hideTimer: NodeJS.Timeout | undefined;
    if (typeof hideDelay === 'number') {
      hideTimer = setTimeout(() => setIsVisible(false), hideDelay);
    }

    return () => {
      clearTimeout(showTimer);
      if (shrinkTimer) clearTimeout(shrinkTimer);
      if (hideTimer) clearTimeout(hideTimer);
    };
  }, [module.visibility]);

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
      <View style={containerStyle}>
        {/* 실제 이미지 */}
        {!imageError && module.src && (
          <Image
            source={getPictureSource(module.src)}
            style={contentSizeStyle as any}
            resizeMode={module.fit || 'contain'}
            onError={() => setImageError(true)}
          />
        )}
      </View>
    </View>
  );
};
