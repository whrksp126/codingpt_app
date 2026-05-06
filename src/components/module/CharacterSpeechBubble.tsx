import React, { useMemo } from 'react';
import { View, Text, Image } from 'react-native';
import { useWindowDimensions } from 'react-native';
import RenderHtml from 'react-native-render-html';
import { htmlTagsStyles, classesStyles } from '../../utils/htmlStyles';
import { HighlightTextRenderer } from './HighlightTextRenderer';

// 캐릭터 이미지 매핑 (ObjectStore URL 우선, 키 형태는 require fallback으로 유지)
const CHARACTER_IMAGES: Record<string, any> = {
  student_full: require('../../assets/images/student_full.png'),
  student_profile: require('../../assets/images/student_profile.png'),
  teacher_full: require('../../assets/images/teacher_full.png'),
  teacher_profile: require('../../assets/images/teacher_profile.png'),
};

const resolveCharacterImage = (value?: string) => {
  if (!value) return CHARACTER_IMAGES.teacher_full;
  if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('file:')) {
    return { uri: value };
  }
  return CHARACTER_IMAGES[value] || CHARACTER_IMAGES.teacher_full;
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
  id: number;
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
  visibleSpeechIds?: Set<string>;
  currentAudioTime?: number;
  currentAudioUrl?: string;
  highlightDisabled?: boolean;
}

export const CharacterSpeechBubbleComponent: React.FC<Props> = ({ module, visibleSpeechIds, currentAudioTime, currentAudioUrl, highlightDisabled }) => {
  const { width: screenWidth } = useWindowDimensions();
  const { character, speech: directSpeech, speeches, spacing, showCharacter = true, position = 'right', displayType = 'full' } = module;

  // 모든 말풍선을 평탄화하여 관리
  const allSpeeches = useMemo(() => {
    const speechList: Array<{
      speech: SpeechContent;
      speechId: string;
      tts?: string | { url: string; timestamps?: any };
    }> = [];

    if (directSpeech) {
      speechList.push({
        speech: directSpeech,
        speechId: String((module as any).id),
        tts: directSpeech.tts || module.tts
      });
    } else if (speeches && speeches.length > 0) {
      speeches.forEach(s => {
        speechList.push({
          speech: {
            content: s.content,
            image: s.image,
          } as SpeechContent,
          speechId: `${(module as any).id}-${s.id}`,
          tts: s.tts || module.tts
        });
      });
    }
    return speechList;
  }, [directSpeech, speeches, module.id, module.tts]);

  // RenderHtml에 전달되는 props들을 메모이제이션
  const contentWidth = useMemo(() => screenWidth - 150, [screenWidth]);

  // 보이는 말풍선들만 필터링
  const visibleSpeeches = useMemo(() => {
    return allSpeeches.filter(s => {
      if (!visibleSpeechIds) return true; // visibleSpeechIds가 없으면 모두 표시 (하위 호환)
      return visibleSpeechIds.has(s.speechId);
    });
  }, [allSpeeches, visibleSpeechIds]);

  const characterSize = character?.size
    ? { width: character.size.width / 2, height: character.size.height / 2 }
    : { width: 80, height: 80 };
  const characterImage = resolveCharacterImage(character?.image);
  const marginTop = spacing?.marginTop;
  const marginBottom = spacing?.marginBottom;

  if (visibleSpeeches.length === 0) return null;
  if (displayType === 'profile' || position === 'left') {
    const isLeft = position === 'left';
    return (
      <View
        className="w-full gap-[12px]"
        style={{
          ...(marginTop !== undefined && { marginTop }),
          ...(marginBottom !== undefined && { marginBottom })
        }}
      >
        {visibleSpeeches.map((s, index) => {
          const isFirstVisible = index === 0;
          const speech = s.speech;

          return (
            <View
              key={s.speechId}
              className={`w-full flex-row items-center gap-[18px] ${isLeft ? 'justify-start' : 'justify-end'}`}
              style={{ flexDirection: isLeft ? 'row' : 'row-reverse' }}
            >
              {/* 캐릭터 - 작은 원형 (첫 번째 말풍선에만 캐릭터 표시) */}
              <View
                className="rounded-full overflow-hidden"
                style={{
                  width: 75,
                  height: 75,
                  backgroundColor: (showCharacter && isFirstVisible) ? '#B5A495' : 'transparent'
                }}
              >
                {showCharacter && isFirstVisible && (
                  <Image
                    source={characterImage}
                    className="w-full h-full"
                    resizeMode="cover"
                  />
                )}
              </View>

              {/* 말풍선 */}
              <View className={`flex-row gap-[10px] items-center relative ${isLeft ? 'flex-1 justify-start' : 'flex-1 justify-end'}`}>
                <View
                  className="rounded-[15px] px-[18px] py-[12px]"
                  style={{
                    backgroundColor: '#F8F9FC',
                    shadowColor: '#000000',
                    shadowOffset: { width: 0, height: 0 },
                    shadowOpacity: 0.2,
                    shadowRadius: 5,
                    elevation: 5,
                  }}
                >
                  {speech.image && (
                    <View className="items-center mb-[10px]">
                      <Image
                        source={resolveCharacterImage(speech.image)}
                        style={{ width: 125, height: 90 }}
                        resizeMode="contain"
                      />
                    </View>
                  )}

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

                  {speech.content && (
                    <RenderSpeechContent
                      content={speech.content}
                      tts={s.tts}
                      currentAudioTime={currentAudioTime}
                      currentAudioUrl={currentAudioUrl}
                      highlightDisabled={highlightDisabled}
                      contentWidth={contentWidth}
                    />
                  )}
                </View>

                {/* 화살표 꼬리 (첫 번째 말풍선에만 캐릭터가 있을 때 표시) */}
                {showCharacter && isFirstVisible && (
                  <View
                    className="absolute"
                    style={{
                      ...(isLeft ? { left: -11 } : { right: -11 }),
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
                      transform: [{ rotate: isLeft ? '90deg' : '270deg' }]
                    }} />
                  </View>
                )}
              </View>
            </View>
          );
        })}
      </View>
    );
  }

  // 오른쪽 레이아웃 (기존 버전 - 캐릭터가 아래 오른쪽에 큰 이미지로)
  return (
    <View
      className="w-full relative"
      style={{
        paddingTop: showCharacter ? 20 : 0,
        ...(marginTop !== undefined && { marginTop }),
        ...(marginBottom !== undefined && { marginBottom }),
        gap: 12,
      }}
    >
      {visibleSpeeches.map((s, index) => {
        const speech = s.speech;
        return (
          <View
            key={s.speechId}
            className="w-full relative items-end pr-[100px]"
          >
            <View
              className="rounded-[15px] px-[18px] py-[12px]"
              style={{
                backgroundColor: '#F8F9FC',
                maxWidth: screenWidth - 100,
                shadowColor: '#000000',
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.2,
                shadowRadius: 5,
                elevation: 5,
              }}
            >
              {speech.image && (
                <View className="items-center mb-[10px]" style={{ width: '100%' }}>
                  <Image
                    source={resolveCharacterImage(speech.image)}
                    style={{ width: '100%', aspectRatio: 125 / 90 }}
                    resizeMode="contain"
                  />
                </View>
              )}

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

              {speech.content && (
                <RenderSpeechContent
                  content={speech.content}
                  tts={s.tts}
                  currentAudioTime={currentAudioTime}
                  currentAudioUrl={currentAudioUrl}
                  highlightDisabled={highlightDisabled}
                  contentWidth={contentWidth}
                />
              )}
            </View>

            {/* Character - 첫 번째 말풍선 위치에 세로 중앙 배치 */}
            {showCharacter && index === 0 && (
              <View
                className="absolute right-0"
                style={{
                  width: characterSize.width,
                  height: characterSize.height,
                  top: '50%',
                  transform: [{ translateY: -characterSize.height / 2 }]
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
      })}
    </View>
  );
};

// 말풍선 내부 콘텐츠 렌더링을 위한 헬퍼 컴포넌트
const RenderSpeechContent: React.FC<{
  content: string;
  tts?: any;
  currentAudioTime?: number;
  currentAudioUrl?: string;
  highlightDisabled?: boolean;
  contentWidth: number;
}> = ({ content, tts, currentAudioTime, currentAudioUrl, highlightDisabled, contentWidth }) => {
  const ttsUrl = typeof tts === 'string' ? tts : tts?.url;
  const isMatch = ttsUrl && currentAudioUrl === ttsUrl;
  const hasTimestamps = tts?.timestamps?.alignment;

  if (!highlightDisabled && isMatch && currentAudioTime !== undefined && hasTimestamps) {
    return (
      <HighlightTextRenderer
        content={content}
        ttsData={tts}
        currentAudioTime={currentAudioTime || 0}
      />
    );
  }

  return (
    <RenderHtml
      contentWidth={contentWidth}
      source={{ html: content }}
      tagsStyles={htmlTagsStyles}
      classesStyles={classesStyles}
    />
  );
};

