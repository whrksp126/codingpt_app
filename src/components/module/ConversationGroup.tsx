import React, { useEffect, useRef, useMemo } from 'react';
import { View, Animated, Image } from 'react-native';
import { CharacterSpeechBubbleComponent } from './CharacterSpeechBubble';

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
  content?: string;
  image?: string;
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
  tts?: string;
}

interface ConversationModule {
  id: number;
  type: 'characterSpeechBubble';
  displayType?: 'full' | 'profile';
  position?: 'left' | 'right';
  character?: {
    image: string;
    size?: { width: number; height: number };
  };
  speech?: SpeechContent;
  speeches?: Speech[];
  showCharacter?: boolean;
  tts?: string;
  spacing?: {
    marginTop?: number;
    marginBottom?: number;
  };
}

interface Props {
  modules: ConversationModule[];
  visibleModuleIds: Set<number>;
  visibleSpeechIds: Set<string>;
}

/**
 * ConversationGroup 컴포넌트 - 대화형 말풍선 그룹 렌더링
 */
export const ConversationGroupComponent: React.FC<Props> = ({ modules, visibleModuleIds, visibleSpeechIds }) => {
  // 그룹 내 모든 모듈이 같은 displayType과 position을 가져야 함
  const displayType = modules[0]?.displayType || 'full';
  const position = modules[0]?.position || 'right';

  // 캐릭터 정보 가져오기 (그룹 전체의 대표 캐릭터 정보 - 이미지가 없는 경우를 대비함)
  const characterModule = modules.find(m => m.character && (m.showCharacter !== false))
    || modules.find(m => m.character)
    || null;

  // 모든 렌더링 대상 말풍선을 평탄화
  const allSpeeches = useMemo(() => {
    const speechList: Array<{
      moduleId: number;
      modulePosition?: 'left' | 'right';
      character?: any;
      speech: any;
      speechId: string;
      showCharacter?: boolean
    }> = [];

    modules.forEach(m => {
      if (m.speeches) {
        m.speeches.forEach(s => {
          speechList.push({
            moduleId: m.id,
            modulePosition: m.position,
            // 개별 speech에 캐릭터 정보가 있으면 그것을 사용, 없으면 모듈의 캐릭터 정보 사용
            character: (s as any).character || m.character,
            speech: s,
            speechId: `${m.id}-${s.id}`,
            showCharacter: s.showCharacter
          });
        });
      } else if (m.speech) {
        speechList.push({
          moduleId: m.id,
          modulePosition: m.position,
          character: m.character,
          speech: m.speech,
          speechId: String(m.id), // 기존 구조는 모듈 아이디를 키로 사용
          showCharacter: m.showCharacter
        });
      }
    });

    return speechList;
  }, [modules]);

  // 현재 표시 중인 말풍선들 중 가장 마지막에 있는 유효한 캐릭터 정보를 찾음
  const lastVisibleSpeechWithCharacter = [...allSpeeches]
    .filter(s => {
      // 보이는 말풍선인지 확인
      const isVisible = s.speechId.includes('-')
        ? visibleSpeechIds.has(s.speechId)
        : visibleModuleIds.has(Number(s.speechId));
      return isVisible && s.character;
    })
    .pop();

  const activeCharacter = lastVisibleSpeechWithCharacter?.character || characterModule?.character;
  const characterSize = activeCharacter?.size || { width: 160, height: 160 };
  const characterImage = activeCharacter ? (CHARACTER_IMAGES[activeCharacter.image || 'raccoon'] || CHARACTER_IMAGES.raccoon) : null;

  // 보이는 말풍선들만 필터링
  const visibleSpeeches = allSpeeches.filter(s => {
    if (s.speechId.includes('-')) {
      return visibleSpeechIds.has(s.speechId);
    }
    return visibleModuleIds.has(Number(s.speechId));
  });

  // 각 말풍선의 애니메이션 값
  const bubbleAnimations = useRef<Map<string, Animated.Value>>(new Map());
  const previousVisibleCount = useRef<number>(0);

  useEffect(() => {
    visibleSpeeches.forEach((s) => {
      if (!bubbleAnimations.current.has(s.speechId)) {
        const animValue = new Animated.Value(0);
        bubbleAnimations.current.set(s.speechId, animValue);

        Animated.timing(animValue, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }).start();
      }
    });

    previousVisibleCount.current = visibleSpeeches.length;
  }, [visibleSpeeches.length]);

  // 오른쪽 레이아웃 (전신 상태 - full)
  if (displayType === 'full' && (position === 'right' || !position)) {
    return (
      <View
        className="w-full items-end relative"
        style={{
          // 말풍선이 없더라도 캐릭터가 있으면 공간 확보 (캐릭터가 먼저 등장하므로)
          paddingBottom: activeCharacter ? characterSize.height - 50 : 0,
        }}
      >
        <View className="items-end pr-[44px] w-full">
          {visibleSpeeches.map((s, index) => {
            const animValue = bubbleAnimations.current.get(s.speechId) || new Animated.Value(1);

            return (
              <Animated.View
                key={`bubble-${s.speechId}`}
                style={{
                  opacity: animValue,
                  marginBottom: index < visibleSpeeches.length - 1 ? 12 : 0,
                }}
              >
                <CharacterSpeechBubbleComponent
                  module={{
                    ...s,
                    type: 'characterSpeechBubble',
                    position: s.modulePosition,
                    speech: s.speech,
                    showCharacter: false,
                  } as any}
                />
              </Animated.View>
            );
          })}
        </View>

        {/* 캐릭터 - 말풍선 없어도 등장 */}
        {activeCharacter && characterImage && (
          <Animated.View
            className="absolute right-0 bottom-0"
            style={{
              width: characterSize.width,
              height: characterSize.height,
              opacity: 1,
            }}
          >
            <Image
              source={characterImage}
              className="w-full h-full"
              resizeMode="contain"
            />
          </Animated.View>
        )}
      </View>
    );
  }

  // 프로필 상태 (profile) - 말풍선 옆에 원형 캐릭터 표시
  return (
    <View className="w-full">
      {visibleSpeeches.map((s, index) => {
        const animValue = bubbleAnimations.current.get(s.speechId) || new Animated.Value(1);
        const isFirstBubble = index === 0;

        return (
          <Animated.View
            key={`bubble-${s.speechId}`}
            style={{
              opacity: animValue,
              marginBottom: index < visibleSpeeches.length - 1 ? 12 : 0,
            }}
          >
            <CharacterSpeechBubbleComponent
              module={{
                ...s,
                type: 'characterSpeechBubble',
                displayType: 'profile',
                position: s.modulePosition,
                speech: s.speech,
                // 마지막 말풍선에 캐릭터 표시 (사용자의 요청: 프로필 상태는 말풍선의 우측 최하단 영역)
                // 하지만 기존 position=left 로직은 첫 번째에 표시하고 있음. 
                // 사용자 요청대로 '우측 최하단'이면 마지막 말풍선에 표시하는 것이 맞음.
                showCharacter: index === visibleSpeeches.length - 1 && activeCharacter && characterImage ? true : false,
                character: (index === visibleSpeeches.length - 1) ? (s.character || activeCharacter) : undefined,
              } as any}
            />
          </Animated.View>
        );
      })}
    </View>
  );
};

