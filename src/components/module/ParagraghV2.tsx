import React, { useEffect, useRef } from 'react';
import { View, Image, Animated, Easing, useWindowDimensions } from 'react-native';
import RenderHTML from 'react-native-render-html';

/**
 * props 타입은 기존 구조에 맞춰 사용
 */
interface ParagraghComponentProps {
  module: {
    id: number;
    type: string;
    visibility: { type: string; value: number };
    content: string;        // ✅ HTML 문자열
    src?: string;
    srcSize?: string | 'sm' | 'md' | 'lg';
  };
}

// 이미지 사이즈 매핑
const srcSizeMap: { [key: string]: { container: string; image: string } } = {
  sm: {
    container: 'flex-row gap-4',
    image: 'w-[110px] aspect-square rounded-2xl',
  },
  md: {
    container: 'flex-row gap-4',
    image: 'w-[150px] aspect-square rounded-2xl',
  },
  lg: {
    container: 'flex-col gap-4',
    image: 'w-full aspect-video rounded-2xl',
  },
};

/**
 * HTML 기본 태그 스타일
 */
const htmlTagsStyles: any = {
  body: { margin: 0, padding: 0 },
  p: { fontSize: 14, color: '#111827', marginBottom: 6, lineHeight: 20 },
  h1: { fontSize: 22, fontWeight: '700', marginBottom: 10, color: '#111827' },
  h2: { fontSize: 18, fontWeight: '700', marginBottom: 8, color: '#111827' },
  h3: { fontSize: 16, fontWeight: '600', marginBottom: 6, color: '#111827' },
  ul: { paddingLeft: 18, marginBottom: 6 },
  ol: { paddingLeft: 18, marginBottom: 6 },
  li: { fontSize: 14, color: '#111827', marginBottom: 4 },
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
    color: '#111827',
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
    fontSize: 11,
    fontWeight: '700',
    color: '#1D4ED8',
    marginBottom: 4,
  },

  // 코드 설명 라벨
  'code-label': {
    fontSize: 11,
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
    paddingVertical: 2,
    fontSize: 12,
    fontFamily: 'monospace',
  },
};

export const ParagraghComponent: React.FC<ParagraghComponentProps> = React.memo(
  ({ module }) => {
    const { width } = useWindowDimensions();

    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(12)).current;
    const scaleAnim = useRef(new Animated.Value(0.97)).current;

    useEffect(() => {
      const timer = setTimeout(() => {
        Animated.parallel([
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 250,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.spring(slideAnim, {
            toValue: 0,
            tension: 90,
            friction: 10,
            useNativeDriver: true,
          }),
          Animated.spring(scaleAnim, {
            toValue: 1,
            tension: 90,
            friction: 10,
            useNativeDriver: true,
          }),
        ]).start();
      }, 60);

      return () => clearTimeout(timer);
    }, [fadeAnim, slideAnim, scaleAnim]);

    const htmlSource = { html: module.content };
    const cardBaseStyle = {
      opacity: fadeAnim,
      transform: [{ translateY: slideAnim }, { scale: scaleAnim }],
    };

    // 이미지 있는 버전
    if (module.src) {
      const sizeKey = module.srcSize ?? 'sm';

      return (
        <Animated.View
          className="mb-4 rounded-2xl bg-[#F9FBFF] px-4 py-3 border border-[#E0EAFF] shadow-[0px_4px_12px_rgba(15,23,42,0.06)]"
          style={cardBaseStyle}
        >
          <View className={srcSizeMap[sizeKey].container}>
            <Image
              source={{ uri: module.src }}
              className={srcSizeMap[sizeKey].image}
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
        className="mb-4 rounded-2xl bg-[#F9FBFF] px-4 py-3 border border-[#E0EAFF] shadow-[0px_4px_12px_rgba(15,23,42,0.06)]"
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
