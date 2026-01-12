import React, { useEffect, useRef } from 'react';
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

interface ConversationModule {
  id: number;
  type: 'characterSpeechBubble';
  position?: 'left' | 'right';
  character?: {
    image: string;
    size?: { width: number; height: number };
  };
  speech: SpeechContent;
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
}

/**
 * ConversationGroup 컴포넌트 - 대화형 말풍선 그룹 렌더링
 * 
 * 동작 방식:
 * 1. 그룹화: HtmlLessonScreen의 groupConversationModules에서 연속된 characterSpeechBubble 모듈들을
 *    같은 position과 같은 캐릭터를 가진 것들끼리 그룹으로 묶어서 전달받음
 * 
 * 2. 캐릭터 관리:
 *    - 그룹 내 모든 모듈에서 캐릭터 정보를 찾음 (우선순위: showCharacter=true > character 있는 첫 번째)
 *    - 캐릭터는 첫 번째 말풍선과 함께 표시되고, 이후 말풍선들은 캐릭터 없이 표시됨
 * 
 * 3. 레이아웃:
 *    - position='right' (기본): 말풍선들이 오른쪽 정렬, 캐릭터는 하단 오른쪽에 큰 이미지로 표시
 *    - position='left': 각 말풍선이 원래 CharacterSpeechBubble 구조 유지, 
 *                      첫 번째 말풍선에만 캐릭터가 작은 원형으로 표시
 * 
 * 4. 애니메이션:
 *    - 새 말풍선이 추가될 때 페이드인 애니메이션 적용
 *    - 말풍선들이 세로로 스택되어 위로 밀려 올라가는 효과 (레이아웃 자동 조정)
 * 
 * 5. 가시성 관리:
 *    - visibleModuleIds Set을 통해 현재 보여야 할 말풍선만 필터링
 *    - 말풍선이 순차적으로 나타나면서 대화가 진행되는 효과 구현
 */
export const ConversationGroupComponent: React.FC<Props> = ({ modules, visibleModuleIds }) => {
  // 그룹 내 모든 모듈이 같은 position을 가져야 함 (그룹화 로직에서 보장됨)
  // 첫 번째 모듈의 position 사용
  const position = modules[0]?.position || 'right';
  
  // 캐릭터 정보 가져오기 (그룹 내 모든 모듈에서 찾기)
  // 우선순위: showCharacter가 true인 모듈 > character가 있는 첫 번째 모듈
  const characterModule = modules.find(m => m.character && (m.showCharacter !== false)) 
    || modules.find(m => m.character) 
    || null;
  const character = characterModule?.character;
  const characterSize = character?.size || { width: 160, height: 160 };
  const characterImage = character ? (CHARACTER_IMAGES[character.image || 'raccoon'] || CHARACTER_IMAGES.raccoon) : null;
  
  // 보이는 모듈들만 필터링
  const visibleModules = modules.filter(m => visibleModuleIds.has(m.id));

  // 각 말풍선의 애니메이션 값 (페이드인 효과)
  const bubbleAnimations = useRef<Map<number, Animated.Value>>(new Map());
  const previousVisibleCount = useRef<number>(0);

  // 새로운 말풍선이 추가될 때 애니메이션 초기화
  useEffect(() => {
    visibleModules.forEach((module) => {
      if (!bubbleAnimations.current.has(module.id)) {
        const animValue = new Animated.Value(0);
        bubbleAnimations.current.set(module.id, animValue);
        
        // 새 말풍선 페이드인 애니메이션
        Animated.timing(animValue, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }).start();
      }
    });

    // 이전에 보이던 말풍선들의 위치 조정 (위로 밀려 올라가는 효과)
    if (visibleModules.length > previousVisibleCount.current) {
      // 새 말풍선이 추가되었으므로 기존 말풍선들은 이미 보이고 있음
      // 레이아웃이 자동으로 조정됨
    }

    previousVisibleCount.current = visibleModules.length;
  }, [visibleModules.length]);

  // 오른쪽 레이아웃 (기본)
  if (position === 'right' || !position) {
    return (
      <View 
        className="w-full items-end relative" 
        style={{ 
          paddingBottom: character && visibleModules.length > 0 ? characterSize.height - 50 : 0,
        }}
      >
        {/* 말풍선들 - 세로로 스택 */}
        <View className="items-end pr-[44px] w-full">
          {visibleModules.map((module, index) => {
            const animValue = bubbleAnimations.current.get(module.id) || new Animated.Value(1);
            
            return (
              <Animated.View
                key={`bubble-${module.id}`}
                style={{
                  opacity: animValue,
                  marginBottom: index < visibleModules.length - 1 ? 12 : 0,
                }}
              >
                <CharacterSpeechBubbleComponent
                  module={{
                    ...module,
                    // 모든 말풍선에서 캐릭터 숨김 (ConversationGroup에서 관리)
                    showCharacter: false,
                  }}
                />
              </Animated.View>
            );
          })}
        </View>

        {/* 캐릭터 - 첫 번째 말풍선이 나타날 때 함께 표시 (캐릭터 정보가 있으면) */}
        {character && characterImage && visibleModules.length > 0 && (
          <Animated.View
            className="absolute right-0 bottom-0"
            style={{ 
              width: characterSize.width, 
              height: characterSize.height,
              opacity: visibleModules.length > 0 ? 1 : 0,
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

  // 왼쪽 레이아웃 - 첫 번째 말풍선에만 캐릭터 표시, 나머지는 캐릭터 공간 제거
  return (
    <View className="w-full">
      {visibleModules.map((module, index) => {
        const animValue = bubbleAnimations.current.get(module.id) || new Animated.Value(1);
        const isFirstBubble = index === 0;
        
        return (
          <Animated.View
            key={`bubble-${module.id}`}
            style={{
              opacity: animValue,
              marginBottom: index < visibleModules.length - 1 ? 12 : 0,
            }}
          >
            <CharacterSpeechBubbleComponent
              module={{
                ...module,
                // 첫 번째 말풍선에만 캐릭터 표시
                showCharacter: isFirstBubble && character && characterImage ? true : false,
                // 첫 번째 말풍선이 아니면 character를 undefined로 전달하여 캐릭터 공간 제거
                character: isFirstBubble ? (module.character || character) : undefined,
              }}
            />
          </Animated.View>
        );
      })}
    </View>
  );
};

