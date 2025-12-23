import React from 'react';
import { View, Text, Image } from 'react-native';
import { useWindowDimensions } from 'react-native';

// 캐릭터 이미지 매핑
const CHARACTER_IMAGES: Record<string, any> = {
  turtle: require('../../assets/images/turtle.png'),
  raccoon: require('../../assets/images/raccoon.png'),
};

interface ContentSegment {
  text: string;
  style?: string | string[];
}

interface SpeechContent {
  title?: {
    text: string;
    color?: string;
  };
  content: ContentSegment[];
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

export const CharacterSpeechBubbleV2Component: React.FC<Props> = ({ module }) => {
  const { width: screenWidth } = useWindowDimensions();
  const { character, speech, spacing } = module;
  const characterSize = character.size || { width: 160, height: 160 };
  const characterImage = CHARACTER_IMAGES[character.image] || CHARACTER_IMAGES.raccoon;
  const marginTop = spacing?.marginTop;
  const marginBottom = spacing?.marginBottom;

  // semibold-15, Text-Black_Primary 기본 스타일
  const baseTextStyle = {
    fontFamily: 'PretendardVariable',
    fontSize: 15,
    fontWeight: '600' as const,
    color: '#333333', // Text-Black_Primary
    lineHeight: 22.5,
    letterSpacing: -0.3,
  };

  // 스타일 오버라이드 매핑
  const styleOverrides: Record<string, any> = {
    'bold': { fontWeight: '700' as const },
    'text-success': { color: '#08875D' },
    'text-warning': { color: '#B25E09' },
    'text-danger': { color: '#DC2626' },
    'text-blue': { color: '#2F6FED' },
  };

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
              className="bold-22 mb-[8px]"
              style={{ color: speech.title.color || '#B25E09' }}
            >
              {speech.title.text}
            </Text>
          )}

          {/* Content */}
          <Text style={baseTextStyle}>
            {speech.content.map((segment, index) => {
              let segmentStyle = { ...baseTextStyle };
              
              if (segment.style) {
                const styles = Array.isArray(segment.style) ? segment.style : [segment.style];
                styles.forEach(styleName => {
                  if (styleOverrides[styleName]) {
                    segmentStyle = { ...segmentStyle, ...styleOverrides[styleName] };
                  }
                });
              }
              
              return (
                <Text key={index} style={segmentStyle}>
                  {segment.text}
                </Text>
              );
            })}
          </Text>
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

