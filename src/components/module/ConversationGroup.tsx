import React, { useEffect, useRef, useMemo, useState } from 'react';
import { View, Image, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  FadeIn,
  Layout,
  SlideInDown,
  LinearTransition,
  withSpring
} from 'react-native-reanimated';
import { CharacterSpeechBubbleComponent } from './CharacterSpeechBubble';

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
  currentAudioTime?: number;
  currentAudioUrl?: string;
  highlightDisabled?: boolean;
}

/**
 * ConversationGroup 컴포넌트 - 대화형 말풍선 그룹 렌더링
 * 수정: 말풍선이 아래에서 위로 쌓이는 스택 구조 (채팅처럼) 및 동기화된 애니메이션
 * 수정2: 모든 말풍선의 높이를 미리 계산하여 컨테이너 높이를 고정(캐릭터 위치 고정)
 * 수정3: 애니메이션 개선 (짧은 거리 등, 캐릭터 고정)
 */
export const ConversationGroupComponent: React.FC<Props> = ({ modules, visibleModuleIds, visibleSpeechIds, currentAudioTime, currentAudioUrl, highlightDisabled }) => {
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
      showCharacter?: boolean;
      tts?: any;
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
            showCharacter: s.showCharacter,
            tts: s.tts || m.tts
          });
        });
      } else if (m.speech) {
        speechList.push({
          moduleId: m.id,
          modulePosition: m.position,
          character: m.character,
          speech: m.speech,
          speechId: String(m.id), // 기존 구조는 모듈 아이디를 키로 사용
          showCharacter: m.showCharacter,
          tts: m.speech.tts || m.tts
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
  const characterImage = activeCharacter ? (CHARACTER_IMAGES[activeCharacter.image || 'teacher_full'] || CHARACTER_IMAGES.teacher_full) : null;

  // 보이는 말풍선들만 필터링
  const visibleSpeeches = allSpeeches.filter(s => {
    if (s.speechId.includes('-')) {
      return visibleSpeechIds.has(s.speechId);
    }
    return visibleModuleIds.has(Number(s.speechId));
  });

  // 측정된 말풍선 ID 및 높이 관리
  const [measuredIds, setMeasuredIds] = useState<Set<string>>(new Set());
  const [bubbleHeights, setBubbleHeights] = useState<Record<string, number>>({});

  // 1. 측정이 필요한 말풍선들 (모든 말풍선 대상, 아직 측정 안 된 것)
  const speechesToMeasure = allSpeeches.filter(s => !measuredIds.has(s.speechId));

  // 2. 전체 예상 높이 계산 (캐릭터 높이 + 모든 말풍선 높이 + 마진)
  const totalSpeechesHeight = allSpeeches.reduce((acc, s) => acc + (bubbleHeights[s.speechId] || 0), 0);
  // 마진: 말풍선 개수 - 1 * 12px. (단, 말풍선이 1개 이상일 때)
  const totalMargins = Math.max(0, allSpeeches.length - 1) * 12;
  // 캐릭터 높이
  const totalCharacterHeight = activeCharacter ? (characterSize.height - 50) : 0; // paddingBottom 값

  const minContainerHeight = totalSpeechesHeight + totalMargins + totalCharacterHeight;

  // 수정: 모든 말풍선의 측정이 완료되어야 isReady가 true가 됨
  const isReady = allSpeeches.length > 0 ? (measuredIds.size === allSpeeches.length) : true;

  // 3. 렌더링할(이미 측정된) '보이는' 말풍선들만 필터링 후 역순 정렬
  // visibleSpeeches 중에서 측정이 완료된 것만 렌더링 (깜빡임 방지)
  const safeToRenderSpeeches = visibleSpeeches
    .filter(s => measuredIds.has(s.speechId))
    .reverse();

  // 커스텀 진입 애니메이션: 수직 이동 없이 Opacity만 0 -> 1로 변경
  const CustomEntering = (targetValues: any) => {
    'worklet';
    return {
      initialValues: {
        opacity: 0,
      },
      animations: {
        opacity: withTiming(1, { duration: 300 }),
      },
    };
  };

  // 오른쪽 레이아웃 (전신 상태 - full)
  if (displayType === 'full' && (position === 'right' || !position)) {
    return (
      <View className="w-full relative">
        {/* 1. 측정용 숨겨진 뷰 - 모든 말풍선을 렌더링하여 높이 측정 */}
        <View style={styles.hiddenContainer} pointerEvents="none">
          {speechesToMeasure.map((s) => (
            <View
              key={`measure-${s.speechId}`}
              onLayout={(e) => {
                const { height } = e.nativeEvent.layout;
                // 높이가 0이 아닐 때만 업데이트
                if (height > 0) {
                  setBubbleHeights(prev => ({ ...prev, [s.speechId]: height }));
                  setMeasuredIds(prev => new Set(prev).add(s.speechId));
                }
              }}
              className="items-end pr-[44px] w-full"
            >
              <CharacterSpeechBubbleComponent
                module={{
                  ...s,
                  type: 'characterSpeechBubble',
                  position: s.modulePosition,
                  speech: s.speech,
                  showCharacter: false,
                } as any}
                currentAudioTime={currentAudioTime}
                currentAudioUrl={currentAudioUrl}
                highlightDisabled={highlightDisabled}
              />
            </View>
          ))}
        </View>

        {/* 2. 실제 렌더링 뷰 (Column Reverse) */}
        {/* 준비되기 전까지는 opacity 0으로 숨김 (캐릭터 점프 방지) */}
        <View
          className="w-full items-end"
          style={{
            flexDirection: 'column-reverse',
            paddingBottom: activeCharacter ? characterSize.height - 50 : 0,
            minHeight: isReady ? minContainerHeight : undefined,
            opacity: isReady ? 1 : 0,
          }}
        >
          {/* 캐릭터 (이미지) - Absolute로 배치 */}
          {activeCharacter && characterImage && (
            <View
              className="absolute right-0"
              style={{
                width: characterSize.width,
                height: characterSize.height,
                bottom: -15,
                zIndex: 10,
              }}
            >
              <Image
                source={characterImage}
                className="w-full h-full"
                resizeMode="contain"
              />
            </View>
          )}

          {/* 말풍선 리스트 */}
          <View className="items-end pr-[44px] w-full" style={{ flexDirection: 'column-reverse' }}>
            {safeToRenderSpeeches.map((s, index) => (
              <Animated.View
                key={`bubble-${s.speechId}`}
                layout={LinearTransition.springify().damping(15).mass(0.6).stiffness(150)}
                entering={CustomEntering}
                style={{
                  marginBottom: 12, // 각 말풍선 사이 간격
                  width: '100%',
                  alignItems: 'flex-end',
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
                  currentAudioTime={currentAudioTime}
                  currentAudioUrl={currentAudioUrl}
                  highlightDisabled={highlightDisabled}
                />
              </Animated.View>
            ))}
          </View>
        </View>
      </View>
    );
  }

  // 프로필 상태 (profile) - 기존 로직 유지하되 애니메이션 및 측정 적용
  return (
    <View className="w-full">
      <View style={styles.hiddenContainer} pointerEvents="none">
        {speechesToMeasure.map((s) => (
          <View
            key={`measure-${s.speechId}`}
            onLayout={(e) => {
              const { height } = e.nativeEvent.layout;
              if (height > 0) {
                setBubbleHeights(prev => ({ ...prev, [s.speechId]: height }));
                setMeasuredIds(prev => new Set(prev).add(s.speechId));
              }
            }}
          >
            <CharacterSpeechBubbleComponent
              module={{ ...s, type: 'characterSpeechBubble', displayType: 'profile' } as any}
            />
          </View>
        ))}
      </View>

      <View className="w-full" style={{ flexDirection: 'column-reverse' }}>
        {safeToRenderSpeeches.map((s, index) => {
          const isNewest = index === 0;

          return (
            <Animated.View
              key={`bubble-${s.speechId}`}
              layout={LinearTransition.springify().damping(15)}
              entering={CustomEntering}
              style={{
                marginBottom: 12,
              }}
            >
              <CharacterSpeechBubbleComponent
                module={{
                  ...s,
                  type: 'characterSpeechBubble',
                  displayType: 'profile',
                  position: s.modulePosition,
                  speech: s.speech,
                  // 사용자 요청대로 '우측 최하단'이면 마지막 말풍선에 표시하는 것이 맞음.
                  showCharacter: isNewest && activeCharacter && characterImage ? true : false,
                  character: isNewest ? (s.character || activeCharacter) : undefined,
                } as any}
                currentAudioTime={currentAudioTime}
                currentAudioUrl={currentAudioUrl}
                highlightDisabled={highlightDisabled}
              />
            </Animated.View>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  hiddenContainer: {
    position: 'absolute',
    opacity: 0,
    top: 0,
    left: 0,
    right: 0,
    zIndex: -1,
  },
});
