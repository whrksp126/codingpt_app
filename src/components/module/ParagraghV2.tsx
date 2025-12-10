import React, { useEffect, useRef, useState } from 'react';
import { View, Image, Animated, Easing, useWindowDimensions, ImageSourcePropType } from 'react-native';
import RenderHTML from 'react-native-render-html';

type ParagraghSrc = 'html_lesson01_character' | 'html_lesson01_screen' | 'html_lesson01_character_phone';

/**
 * props 타입은 기존 구조에 맞춰 사용
 */
interface ParagraghComponentProps {
  module: {
    id: number;
    type: string;
    visibility: { 
      type: string; 
      value?: number;
      showDelay?: number;  // time 타입일 때 사용
      hideDelay?: number;  // time 타입일 때 사용
    };
    content: string;        // ✅ HTML 문자열
    src?: string;
    srcSize?: string | 'sm' | 'md' | 'lg';
  };
}

// 미리 정의된 Lottie 파일들 - 정적 경로만 사용 가능
const getParagraghSource = (src: ParagraghSrc) => {
  switch (src) {
    case 'html_lesson01_character':
      return require('../../assets/images/html_lesson01_character.png');
    case 'html_lesson01_screen':
      return require('../../assets/images/html_lesson01_screen.png');
    case 'html_lesson01_character_phone':
      return require('../../assets/images/html_lesson01_character_phone.png');
  }
};

// 이미지 사이즈 매핑
const srcSizeMap: { [key: string]: { container: string; image: string } } = {
  sm: {
    container: 'flex-row gap-4',
    image: 'w-[110px] aspect-square',
  },
  md: {
    container: 'flex-row gap-4',
    image: 'w-[150px] aspect-square',
  },
  lg: {
    container: 'flex-col gap-4',
    image: 'w-full aspect-video',
  },
};

/**
 * HTML 기본 태그 스타일
 */
const htmlTagsStyles: any = {
  body: { margin: 0, padding: 0 },
  p: { fontSize: 16, color: '#111111', lineHeight: 20, marginTop: 0, marginBottom: 0 },
  h1: { fontSize: 32, fontWeight: '700', color: '#111111', marginTop: 0, marginBottom: 0 },
  h2: { fontSize: 24, fontWeight: '700', color: '#111111', marginTop: 0, marginBottom: 0 },
  h3: { fontSize: 18.7, fontWeight: '600', color: '#111111', marginTop: 0, marginBottom: 0 },
  ul: { paddingLeft: 16, marginTop: 0, marginBottom: 0 },
  ol: { paddingLeft: 16, marginTop: 0, marginBottom: 0 },
  li: { fontSize: 16, color: '#111111', marginTop: 0, marginBottom: 0 },
  a: { color: '#2563EB', textDecorationLine: 'underline', fontWeight: '500' },
  code: {
    fontFamily: 'monospace',
  },
  pre: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 10,
    marginTop: 6,
    marginBottom: 6,
  },
};

/**
 * HTML class 기반 스타일 (꾸미는 포인트는 여기서!)
 */
const classesStyles: any = {
  // 텍스트 모듈 간 간격을 줄이기 위한 음수 마진
  'mb-4': {
    marginBottom: -16,
  },

  // 상단 작은 뱃지
  'badge-pill': {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#DBEAFE',
    color: '#1D4ED8',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 6,
  },

  // 섹션 타이틀 (컬러 + 간격)
  'section-title': {
    fontSize: 18,
    fontWeight: '700',
    color: '#111111',
    marginBottom: 8,
  },

  // 부제목 / 소제목
  'section-subtitle': {
    fontSize: 13,
    fontWeight: '500',
    color: '#6B7280',
    marginBottom: 8,
  },

  // 강조 단어
  'inline-keyword': {
    fontWeight: '700',
    color: '#2563EB',
  },

  // Tip 박스
  'tip-box': {
    backgroundColor: '#EFF6FF',
    borderRadius: 14,
    padding: 10,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  'tip-title': {
    fontSize: 16,
    fontWeight: '700',
    color: '#1D4ED8',
    marginBottom: 4,
  },

  // 코드 설명 라벨
  'code-label': {
    fontSize: 14,
    fontWeight: '600',
    color: '#9CA3AF',
    marginBottom: 4,
  },

  // 코드 블록(밝은 테마)
  'code-block': {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 10,
    marginTop: 4,
  },
  'code-inline': {
    backgroundColor: '#F3F4F6',
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 5,
    fontSize: 14,
    fontFamily: 'monospace',
  },
};

export const ParagraghComponentV2: React.FC<ParagraghComponentProps> = React.memo(
  ({ module }) => {
    const { width } = useWindowDimensions();
    const isTimeType = module.visibility?.type === 'time';
    const [isVisible, setIsVisible] = useState(!isTimeType); // time 타입이면 초기값 false

    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(12)).current;
    const scaleAnim = useRef(new Animated.Value(0.97)).current;

    useEffect(() => {
      const visibility = module.visibility;
      
      // time 타입일 때 showDelay 처리
      if (isTimeType && visibility?.showDelay !== undefined) {
        const showDelay = visibility.showDelay ?? 0;
        
        const showTimer = setTimeout(() => {
          setIsVisible(true);
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
        }, showDelay);

        // hideDelay 처리 (있는 경우)
        let hideTimer: NodeJS.Timeout | undefined;
        if (visibility.hideDelay !== undefined) {
          hideTimer = setTimeout(() => {
            Animated.timing(fadeAnim, {
              toValue: 0,
              duration: 300,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }).start();
          }, visibility.hideDelay);
        }

        return () => {
          clearTimeout(showTimer);
          if (hideTimer) clearTimeout(hideTimer);
        };
      } else {
        // step 타입이거나 visibility가 없는 경우 즉시 표시
        const timer = setTimeout(() => {
          Animated.parallel([
            Animated.timing(fadeAnim, {
              toValue: 1,
              duration: 450,
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
        }, 60);

        return () => clearTimeout(timer);
      }
    }, [fadeAnim, slideAnim, scaleAnim, isTimeType, module.visibility]);

    // time 타입이고 아직 보이지 않으면 null 반환
    if (isTimeType && !isVisible) {
      return null;
    }

    const htmlSource = { html: module.content };
    const cardBaseStyle = {
      opacity: fadeAnim,
      transform: [{ translateY: slideAnim }, { scale: scaleAnim }],
    };

    // 이미지 있는 버전
    if (module.src) {
      const sizeKey = module.srcSize ?? 'sm';
      
      // module.src가 ParagraghSrc 타입인지 확인하고 로컬 이미지 경로 가져오기
      const imageSource = getParagraghSource(module.src as ParagraghSrc);

      return (
        <Animated.View
          // className="mb-4 rounded-2xl bg-[#F9FBFF] px-4 py-3 border border-[#E0EAFF] shadow-[0px_4px_12px_rgba(15,23,42,0.06)]"
          style={cardBaseStyle}
        >
          <View className={srcSizeMap[sizeKey].container}>
            <Image
              source={imageSource}
              className={srcSizeMap[sizeKey].image}
              resizeMode="contain"
            />
            <View className="flex-1">
              <RenderHTML
                contentWidth={width - 48}
                source={htmlSource}
                tagsStyles={htmlTagsStyles}
                classesStyles={classesStyles}
              />
            </View>
          </View>
        </Animated.View>
      );
    }

    // 텍스트만 있는 카드
    return (
      <Animated.View
        // className="mb-4 rounded-2xl bg-[#F9FBFF] px-4 py-3 border border-[#E0EAFF] shadow-[0px_4px_12px_rgba(15,23,42,0.06)]"
        style={cardBaseStyle}
      >
        <RenderHTML
          contentWidth={width - 48}
          source={htmlSource}
          tagsStyles={htmlTagsStyles}
          classesStyles={classesStyles}
        />
      </Animated.View>
    );
  },
);

// 기존 export 유지 (하위 호환성)
export const ParagraghComponent = ParagraghComponentV2;
