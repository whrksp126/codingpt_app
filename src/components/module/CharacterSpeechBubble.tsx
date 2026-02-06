import React, { useMemo } from 'react';
import { View, Text, Image } from 'react-native';
import { useWindowDimensions } from 'react-native';
import RenderHtml from 'react-native-render-html';
import { htmlTagsStyles, classesStyles } from '../../utils/htmlStyles';
import { HighlightTextRenderer } from './HighlightTextRenderer';

// 캐릭터 이미지 매핑
const CHARACTER_IMAGES: Record<string, any> = {
  student_full: require('../../assets/images/student_full.png'),
  student_profile: require('../../assets/images/student_profile.png'),
  teacher_full: require('../../assets/images/teacher_full.png'),
  teacher_profile: require('../../assets/images/teacher_profile.png'),
};

interface SpeechContent {
  title?: {
    text: string;
    color?: string;
    marginBottom?: number;
  };
  content?: string;
  image?: string;
  tts?: string | { url: string; timestamps?: any };
}

interface Speech {
  id: number;
  content?: string;
  image?: string;
  showCharacter?: boolean;
  visibility?: {
    type: string;
    showDelay?: number;
  };
  tts?: string | { url: string; timestamps?: any };
}

interface CharacterSpeechBubbleModule {
  type: 'characterSpeechBubble';
  displayType?: 'full' | 'profile';
  position?: 'left' | 'right'; // 캐릭터 위치 (기본값: 'right')
  character?: {
    image: string;
    size?: { width: number; height: number };
  };
  speech?: SpeechContent;
  speeches?: Speech[];
  showCharacter?: boolean; // 캐릭터 표시 여부 (기본값: true)
  tts?: string | { url: string; timestamps?: any };
  spacing?: {
    marginTop?: number;
    marginBottom?: number;
  };
}

interface Props {
  module: CharacterSpeechBubbleModule;
  currentAudioTime?: number;
  currentAudioUrl?: string;
  highlightDisabled?: boolean;
}

export const CharacterSpeechBubbleComponent: React.FC<Props> = ({ module, currentAudioTime, currentAudioUrl, highlightDisabled }) => {
  const { width: screenWidth } = useWindowDimensions();
  const { character, speech: directSpeech, speeches, spacing, showCharacter = true, position = 'right', displayType = 'full' } = module;

  // speech 필드가 있으면 사용, 없으면 speeches 배열의 첫 번째 항목 사용
  const speech = useMemo(() => {
    if (directSpeech) return directSpeech;
    if (speeches && speeches.length > 0) {
      const first = speeches[0];
      return {
        content: first.content,
        image: first.image,
        // speeches[0]에는 title이 없으므로 필요한 경우 확장 가능
      } as SpeechContent;
    }
    return null;
  }, [directSpeech, speeches]);

  const characterSize = character?.size || { width: 160, height: 160 };
  const characterImage = CHARACTER_IMAGES[character?.image || 'teacher_full'] || CHARACTER_IMAGES.teacher_full;
  const marginTop = spacing?.marginTop;
  const marginBottom = spacing?.marginBottom;

  // RenderHtml에 전달되는 props들을 메모이제이션하여 불필요한 리렌더링 방지
  const contentWidth = useMemo(() => screenWidth - 150, [screenWidth]);

  const htmlSource = useMemo(() => ({
    html: speech?.content || ''
  }), [speech?.content]);

  // 말풍선 내부 이미지 가져오기
  // 로컬 이미지 파일명을 받아서 자동으로 require하거나, URI로 사용
  const speechImage = useMemo(() => {
    if (!speech?.image) return null;

    // URI 형태 (http://, https://, file:// 등)인 경우 그대로 사용
    if (speech.image.startsWith('http://') || speech.image.startsWith('https://') || speech.image.startsWith('file://')) {
      return { uri: speech.image };
    }

    // 로컬 이미지 파일명인 경우 자동으로 require
    // React Native의 require는 정적 분석이 필요하므로, 파일명 기반으로 매핑
    const imageName = speech.image.replace(/\.(png|jpg|jpeg|gif|webp)$/i, '');
    const imageMap: Record<string, any> = {
      'html_img': require('../../assets/images/html_img.png'),
      'css_img': require('../../assets/images/css_img.png'),
      'js_img': require('../../assets/images/js_img.png'),
    };

    // 매핑에 있으면 사용, 없으면 URI로 시도
    return imageMap[imageName] || { uri: speech.image };
  }, [speech?.image]);

  if (!speech) return null;

  // 프로필 상태 (profile) - 원형 프로필 이미지가 말풍선 옆에 위치
  if (displayType === 'profile' || position === 'left') {
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
              // 그림자 제거
            }}
          >
            {/* Image */}
            {speechImage && (
              <View className="items-center mb-[10px]">
                <Image
                  source={speechImage}
                  style={{ width: 125, height: 90 }}
                  resizeMode="contain"
                />
              </View>
            )}

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
            {speech.content && (
              <>
                {(() => {
                  const moduleTtsUrl = typeof module.tts === 'string' ? module.tts : module.tts?.url;
                  const speechTtsUrl = typeof speech.tts === 'string' ? speech.tts : speech.tts?.url;

                  const isModuleMatch = moduleTtsUrl && currentAudioUrl === moduleTtsUrl;
                  const isSpeechMatch = speechTtsUrl && currentAudioUrl === speechTtsUrl;

                  if (!highlightDisabled && (isModuleMatch || isSpeechMatch) && currentAudioTime !== undefined) {
                    return (
                      <HighlightTextRenderer
                        content={speech.content}
                        ttsData={(isSpeechMatch ? (typeof speech.tts === 'string' ? { url: speech.tts } : speech.tts) : undefined) || (isModuleMatch ? (typeof module.tts === 'string' ? { url: module.tts } : module.tts) : undefined) as any}
                        currentAudioTime={currentAudioTime || 0}
                      />
                    );
                  }

                  return (
                    <RenderHtml
                      contentWidth={contentWidth}
                      source={htmlSource}
                      tagsStyles={htmlTagsStyles}
                      classesStyles={classesStyles}
                    />
                  );
                })()}
              </>
            )}
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
            // 그림자 제거
            maxWidth: screenWidth - 100,
          }}
        >
          {/* Image */}
          {speechImage && (
            <View className="items-center mb-[10px]" style={{ width: '100%' }}>
              <Image
                source={speechImage}
                style={{ width: '100%', aspectRatio: 125 / 90 }}
                resizeMode="contain"
              />
            </View>
          )}

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
          {speech.content && (
            <>
              {(() => {
                const moduleTtsUrl = typeof module.tts === 'string' ? module.tts : module.tts?.url;
                const speechTtsUrl = typeof speech.tts === 'string' ? speech.tts : speech.tts?.url;

                const isModuleMatch = moduleTtsUrl && currentAudioUrl === moduleTtsUrl;
                const isSpeechMatch = speechTtsUrl && currentAudioUrl === speechTtsUrl;

                if (!highlightDisabled && (isModuleMatch || isSpeechMatch) && currentAudioTime !== undefined) {
                  return (
                    <HighlightTextRenderer
                      content={speech.content}
                      ttsData={(isSpeechMatch ? (typeof speech.tts === 'string' ? { url: speech.tts } : speech.tts) : undefined) || (isModuleMatch ? (typeof module.tts === 'string' ? { url: module.tts } : module.tts) : undefined) as any}
                      currentAudioTime={currentAudioTime || 0}
                    />
                  );
                }

                return (
                  <RenderHtml
                    contentWidth={contentWidth}
                    source={htmlSource}
                    tagsStyles={htmlTagsStyles}
                    classesStyles={classesStyles}
                  />
                );
              })()}
            </>
          )}
        </View>
      </View>

      {/* Character - 마지막 말풍선에만 표시 */}
      {showCharacter && (
        <View
          className="absolute right-0"
          style={{ 
            width: characterSize.width, 
            height: characterSize.height,
            bottom: -15
          }}
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

