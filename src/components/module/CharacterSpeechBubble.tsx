import React, { useMemo, useCallback } from 'react';
import { View, Text, Image } from 'react-native';
import { useWindowDimensions } from 'react-native';
import RenderHtml from 'react-native-render-html';

// 캐릭터 이미지 매핑
const CHARACTER_IMAGES: Record<string, any> = {
  turtle: require('../../assets/images/turtle.png'),
  raccoon: require('../../assets/images/raccoon.png'),
};

interface SpeechContent {
  title?: {
    text: string;
    color?: string;
    marginBottom?: number;
  };
  content: string;
}

interface CharacterSpeechBubbleModule {
  type: 'characterSpeechBubble';
  character: {
    image: string;
    size?: { width: number; height: number };
  };
  speech: SpeechContent;
  tts?: string;
  spacing?: {
    marginTop?: number;
    marginBottom?: number;
  };
}

interface Props {
  module: CharacterSpeechBubbleModule;
}

export const CharacterSpeechBubbleComponent: React.FC<Props> = ({ module }) => {
  const { width: screenWidth } = useWindowDimensions();
  const { character, speech, spacing } = module;
  const characterSize = character.size || { width: 160, height: 160 };
  const characterImage = CHARACTER_IMAGES[character.image] || CHARACTER_IMAGES.raccoon;
  const marginTop = spacing?.marginTop;
  const marginBottom = spacing?.marginBottom;

  // HTML 콘텐츠에서 줄바꿈 처리 - useCallback으로 메모이제이션
  const processContent = useCallback((content: string) => {
    return content.replace(/\n/g, '<br/>');
  }, []);

  // semibold-15, Text-Black_Primary 스타일 - useMemo로 메모이제이션
  const semibold15Style = useMemo(() => ({
    fontFamily: 'PretendardVariable',
    fontSize: 15,
    fontWeight: '600' as const,
    color: '#333333', // Text-Black_Primary
    lineHeight: 22.5,
    letterSpacing: -0.3,
  }), []);

  const tagsStyles = useMemo(() => ({
    body: semibold15Style,
    span: semibold15Style,
    b: { fontWeight: '700' as const },
  }), [semibold15Style]);

  const classesStyles = useMemo(() => ({
    'text-success': { color: '#08875D' },
    'text-warning': { color: '#B25E09' },
    'text-danger': { color: '#DC2626' },
    'text-blue': { color: '#2F6FED' },
  }), []);

  // RenderHtml에 전달되는 props들을 메모이제이션하여 불필요한 리렌더링 방지
  const contentWidth = useMemo(() => screenWidth - 150, [screenWidth]);
  
  const htmlSource = useMemo(() => ({
    html: processContent(speech.content)
  }), [speech.content, processContent]);

  return (
    <View 
      className="w-full items-end relative" 
      style={{ 
        paddingBottom: characterSize.height - 50,
        ...(marginTop !== undefined && { marginTop }),
        ...(marginBottom !== undefined && { marginBottom })
      }}
    >
      <View className="items-end pr-[44px]">
        <View
          className="rounded-[15px] px-[18px] py-[12px]"
          style={{
            backgroundColor: '#F8F9FC',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.2,
            shadowRadius: 5,
            elevation: 5,
            maxWidth: screenWidth - 100,
          }}
        >
          {/* Title */}
          {speech.title && (
            <Text
              className="bold-22"
              style={{ 
                color: speech.title.color || '#B25E09',
                marginBottom: speech.title.marginBottom ?? 8
              }}
            >
              {speech.title.text}
            </Text>
          )}

          {/* Content */}
          <RenderHtml
            contentWidth={contentWidth}
            source={htmlSource}
            tagsStyles={tagsStyles}
            classesStyles={classesStyles}
          />
        </View>
      </View>

      {/* Character */}
      <View
        className="absolute right-0 bottom-0"
        style={{ width: characterSize.width, height: characterSize.height }}
      >
        <Image
          source={characterImage}
          className="w-full h-full"
          resizeMode="contain"
        />
      </View>
    </View>
  );
};

