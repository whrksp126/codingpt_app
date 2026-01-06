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
  position?: 'left' | 'right'; // 캐릭터 위치 (기본값: 'right')
  character?: {
    image: string;
    size?: { width: number; height: number };
  };
  speech: SpeechContent;
  showCharacter?: boolean; // 캐릭터 표시 여부 (기본값: true)
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
  const { character, speech, spacing, showCharacter = true, position = 'right' } = module;
  const characterSize = character?.size || { width: 160, height: 160 };
  const characterImage = CHARACTER_IMAGES[character?.image || 'raccoon'] || CHARACTER_IMAGES.raccoon;
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

  // 왼쪽 레이아웃 (캐릭터가 오른쪽에 작은 원형으로)
  if (position === 'left') {
    return (
      <View 
        className="w-full flex-row items-center justify-end gap-[18px]"
        style={{ 
          ...(marginTop !== undefined && { marginTop }),
          ...(marginBottom !== undefined && { marginBottom })
        }}
      >
        {/* 말풍선 */}
        <View className="flex-row gap-[10px] items-center relative flex-1 justify-end">
          <View
            className="rounded-[15px] px-[18px] py-[12px]"
            style={{
              backgroundColor: '#F8F9FC',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 0.2,
              shadowRadius: 5,
              elevation: 5,
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
          
          {/* 화살표 꼬리 (캐릭터가 있을 때만) */}
          {showCharacter && (
            <View 
              className="absolute"
              style={{
                right: -11,
                top: '50%',
                transform: [{ translateY: -10 }]
              }}
            >
              <View style={{ 
                width: 0, 
                height: 0,
                borderLeftWidth: 10,
                borderRightWidth: 10,
                borderTopWidth: 10,
                borderLeftColor: 'transparent',
                borderRightColor: 'transparent',
                borderTopColor: '#F8F9FC',
                transform: [{ rotate: '90deg' }]
              }} />
            </View>
          )}
        </View>

        {/* 캐릭터 - 작은 원형 (항상 공간 차지, 캐릭터는 조건부 표시) */}
        <View 
          className="rounded-full overflow-hidden"
          style={{ 
            width: 75, 
            height: 75,
            backgroundColor: showCharacter ? '#B5A495' : 'transparent'
          }}
        >
          {showCharacter && (
            <Image
              source={characterImage}
              className="w-full h-full"
              resizeMode="cover"
            />
          )}
        </View>
      </View>
    );
  }

  // 오른쪽 레이아웃 (기존 버전 - 캐릭터가 아래 오른쪽에 큰 이미지로)
  return (
    <View 
      className="w-full items-end relative" 
      style={{ 
        paddingBottom: showCharacter ? characterSize.height - 50 : 0,
        ...(marginTop !== undefined && { marginTop }),
        ...(marginBottom !== undefined && { marginBottom })
      }}
    >
      {/* 말풍선은 항상 같은 오른쪽 여백 유지 */}
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

      {/* Character - 마지막 말풍선에만 표시 */}
      {showCharacter && (
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
      )}
    </View>
  );
};

