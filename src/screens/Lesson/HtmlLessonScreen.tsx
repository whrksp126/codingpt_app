import React, { useEffect, useState, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import DefaultIconBtn from '../../components/Button/DefaultIconBtn';
import { X } from '../../assets/SvgIcon';
import { ParagraghComponentV2 } from '../../components/module/ParagraghV2';
import { WebViewComponent } from '../../components/module/WebView';
import { CharacterSpeechBubbleComponent } from '../../components/module/CharacterSpeechBubble';
import { CodeComponent } from '../../components/module/Code';
import { MissionListComponent } from '../../components/module/MissionList';
import { TagDescriptionListComponent } from '../../components/module/TagDescriptionList';
import { MultipleChoiceComponent } from '../../components/module/MultipleChoice';
import { TrueFalseChoiceComponent } from '../../components/module/TrueFalseChoice';

// html_00.json 데이터 import
import html_00 from '../../data/lessons/html_00.json';

console.log("html_00", html_00);

interface VisibilityConfig {
  type: string;
  showDelay?: number;
  hideDelay?: number;
  value?: number;
}

interface Module {
  id: number;
  type: 'paragraph' | 'webview' | 'code' | 'characterSpeechBubble' | 'missionList' | 'tagDescriptionList' | 'multipleChoice' | 'trueFalseChoice';
  content?: string;
  tabs?: Array<{
    type: 'html' | 'url';
    content: string;
  }>;
  position?: 'left' | 'right'; // 말풍선 위치
  character?: {
    image: string;
    size?: { width: number; height: number };
  };
  speech?: {
    title?: {
      text: string;
      color?: string;
      marginBottom?: number;
    };
    content: string;
  };
  showCharacter?: boolean; // 캐릭터 표시 여부
  title?: string; // missionList 제목
  items?: Array<{
    id: number;
    text: string;
    showDelay?: number;
  }>; // missionList 항목들
  questions?: Array<{
    title: string;
    interactionOptions: Array<{
      label: string;
    }>;
    answer: {
      answer: number;
      userAnswer?: number;
      isCorrect?: boolean | null;
    };
  }>; // multipleChoice 질문들
  visibility?: VisibilityConfig;
  tts?: string;
}

interface Slider {
  id: number;
  title: string;
  role: string;
  modules: Module[];
}

interface Lesson {
  id: number;
  title: string;
  isCompleted: boolean;
  sliders: Slider[];
}

const HtmlLessonScreen: React.FC = () => {
  const navigation = useNavigation();
  const scrollViewRef = useRef<ScrollView>(null);
  const [visibleModules, setVisibleModules] = useState<Set<number>>(new Set());
  const [currentSliderIndex, setCurrentSliderIndex] = useState(0);
  // 각 슬라이더별로 표시된 모듈 ID 목록을 저장 (깜빡임 방지)
  const [sliderVisibleModules, setSliderVisibleModules] = useState<Map<number, Set<number>>>(new Map());
  const timeoutRefs = useRef<NodeJS.Timeout[]>([]);

  // =========================
  // 📌 기본 설정
  // =========================
  // const { lessonData: lessonDataOriginal } = route.params as any;
  // const lessonData = JSON.parse(JSON.stringify(lessonDataOriginal));
  // =========================
  // 📌 레슨/슬라이드 관련 상태
  // =========================
  const [curLesson, setCurLesson] = useState<Lesson>(() => {
    // 깊은 복사를 통해 원본 JSON 데이터가 오염되지 않도록 함
    return JSON.parse(JSON.stringify(html_00.lessons[0]));
  });
  const currentSlider: Slider = curLesson.sliders[currentSliderIndex];

  useEffect(() => {
    // 이전 타이머들 정리
    timeoutRefs.current.forEach((timeout) => clearTimeout(timeout));
    timeoutRefs.current = [];

    const slider = curLesson.sliders[currentSliderIndex];
    if (!slider) return;

    // 현재 슬라이더가 이미 렌더링되었는지 확인
    const savedVisibleModules = sliderVisibleModules.get(currentSliderIndex);
    console.log("savedVisibleModules", savedVisibleModules);

    if (savedVisibleModules) {
      // 이미 렌더링된 슬라이더: 저장된 모듈 목록을 즉시 표시 (깜빡임 없음)
      setVisibleModules(new Set(savedVisibleModules));
    } else {
      // 처음 렌더링하는 슬라이더: 순차적으로 표시
      setVisibleModules(new Set());

      const newVisibleModules = new Set<number>();
      let maxDelay = 0;

      slider.modules.forEach((module) => {
        const delay = module.visibility?.showDelay || 0;

        if (delay === 0) {
          // 즉시 표시
          newVisibleModules.add(module.id);
          setVisibleModules((prev) => new Set(prev).add(module.id));
        } else {
          // 지연 후 표시
          const timeout = setTimeout(() => {
            newVisibleModules.add(module.id);
            setVisibleModules((prev) => new Set(prev).add(module.id));
            // 새 모듈이 나타날 때 스크롤을 하단으로 부드럽게 이동
            const scrollTimeout = setTimeout(() => {
              scrollViewRef.current?.scrollToEnd({ animated: true });
            }, 100); // 렌더링 후 스크롤
            timeoutRefs.current.push(scrollTimeout);
          }, delay);
          timeoutRefs.current.push(timeout);
        }

        // missionList 타입인 경우, 각 아이템이 나타날 때도 스크롤
        if (module.type === 'missionList' && module.items) {
          module.items.forEach((item: any) => {
            const itemDelay = delay + (item.showDelay || 0);
            const itemTimeout = setTimeout(() => {
              scrollViewRef.current?.scrollToEnd({ animated: true });
            }, itemDelay + 450); // 아이템 애니메이션 완료 후 스크롤
            timeoutRefs.current.push(itemTimeout);
          });

          // 마지막 아이템의 딜레이 계산
          const lastItem = module.items[module.items.length - 1];
          const lastItemDelay = delay + (lastItem.showDelay || 0) + 450;
          if (lastItemDelay > maxDelay) {
            maxDelay = lastItemDelay;
          }
        } else if (delay > maxDelay) {
          maxDelay = delay;
        }
      });

      // 모든 모듈이 표시된 후 저장 (maxDelay + 여유 시간)
      const saveTimeout = setTimeout(() => {
        // 현재 visibleModules 상태를 기반으로 저장 (비동기 업데이트 고려)
        setSliderVisibleModules((prev) => {
          const newMap = new Map(prev);
          // 모든 모듈 ID 수집
          const allModuleIds = new Set(slider.modules.map((m) => m.id));
          newMap.set(currentSliderIndex, allModuleIds);
          return newMap;
        });
      }, maxDelay + 500); // 모든 애니메이션 완료 후 저장
      timeoutRefs.current.push(saveTimeout);
    }

    // 컴포넌트 언마운트 시 타이머 정리
    return () => {
      timeoutRefs.current.forEach((timeout) => clearTimeout(timeout));
      timeoutRefs.current = [];
    };
  }, [currentSliderIndex, curLesson.sliders]);

  const handleExitPress = () => {
    navigation.goBack();
  };

  // multipleChoice 완료 후 result 모듈 추가
  const handleMultipleChoiceSubmit = (completedModuleId: number) => {
    const problemModule = currentSlider.modules.find((m) => m.id === completedModuleId);

    // 퀴즈 모듈이 아니거나 result가 없으면 종료
    if (!problemModule || problemModule.type !== 'multipleChoice' || !(problemModule as any).result) {
      return;
    }

    const result = (problemModule as any).result;

    // 정답 여부 계산
    const isAllCorrect = problemModule.questions?.every(
      (q: any) => q.answer?.isCorrect === true
    ) ?? false;

    // result.modules 조건 필터링
    const filteredResultModules = (result.modules ?? []).filter((mod: any) => {
      if (mod?.condition === 'correct') return isAllCorrect;
      if (mod?.condition === 'wrong') return !isAllCorrect;
      return true; // condition 없으면 전부 통과
    });

    // result 모듈들을 현재 슬라이더에 추가
    const newLesson = { ...curLesson };
    const newSliders = [...newLesson.sliders];
    const newModules = [...newSliders[currentSliderIndex].modules];

    // result 모듈들을 추가 (step 기반이므로 visibility는 그대로 유지)
    const resultModules = filteredResultModules.map((mod: any) => ({
      ...mod,
      // step 기반 visibility는 그대로 유지
    }));

    newSliders[currentSliderIndex].modules = [...newModules, ...resultModules];
    newLesson.sliders = newSliders;
    setCurLesson(newLesson);

    // result 모듈들을 순차적으로 표시
    resultModules.forEach((mod: any, index: number) => {
      const timeout = setTimeout(() => {
        setVisibleModules((prev) => new Set(prev).add(mod.id));
        const scrollTimeout = setTimeout(() => {
          scrollViewRef.current?.scrollToEnd({ animated: true });
        }, 100);
        timeoutRefs.current.push(scrollTimeout);
      }, 500 + (index * 300)); // 첫 번째는 0.5초 후, 나머지는 0.3초 간격
      timeoutRefs.current.push(timeout);
    });

    // result 모듈 ID들을 sliderVisibleModules에 추가
    const resultModuleIds = resultModules.map((mod: any) => mod.id);
    setSliderVisibleModules((prev) => {
      const newMap = new Map(prev);
      const currentSet = newMap.get(currentSliderIndex) || new Set<number>();
      resultModuleIds.forEach((id: number) => currentSet.add(id));
      newMap.set(currentSliderIndex, currentSet);
      return newMap;
    });
  };

  // trueFalseChoice 완료 후 result 모듈 추가
  const handleTrueFalseChoiceSubmit = (completedModuleId: number) => {
    const problemModule = currentSlider.modules.find((m) => m.id === completedModuleId);

    if (!problemModule || problemModule.type !== 'trueFalseChoice' || !(problemModule as any).result) {
      return;
    }

    const result = (problemModule as any).result;

    // 정답 여부 계산
    const isAllCorrect = problemModule.questions?.every(
      (q: any) => q.answer?.isCorrect === true
    ) ?? false;

    // result.modules 조건 필터링
    const filteredResultModules = (result.modules ?? []).filter((mod: any) => {
      if (mod?.condition === 'correct') return isAllCorrect;
      if (mod?.condition === 'wrong') return !isAllCorrect;
      return true;
    });

    // result 모듈들을 현재 슬라이더에 추가
    const newLesson = { ...curLesson };
    const newSliders = [...newLesson.sliders];
    const newModules = [...newSliders[currentSliderIndex].modules];

    const resultModules = filteredResultModules.map((mod: any) => ({
      ...mod,
    }));

    newSliders[currentSliderIndex].modules = [...newModules, ...resultModules];
    newLesson.sliders = newSliders;
    setCurLesson(newLesson);

    // result 모듈들을 순차적으로 표시
    resultModules.forEach((mod: any, index: number) => {
      const timeout = setTimeout(() => {
        setVisibleModules((prev) => new Set(prev).add(mod.id));
        const scrollTimeout = setTimeout(() => {
          scrollViewRef.current?.scrollToEnd({ animated: true });
        }, 100);
        timeoutRefs.current.push(scrollTimeout);
      }, 500 + (index * 300));
      timeoutRefs.current.push(timeout);
    });

    // result 모듈 ID들을 sliderVisibleModules에 추가
    const resultModuleIds = resultModules.map((mod: any) => mod.id);
    setSliderVisibleModules((prev) => {
      const newMap = new Map(prev);
      const currentSet = newMap.get(currentSliderIndex) || new Set<number>();
      resultModuleIds.forEach((id: number) => currentSet.add(id));
      newMap.set(currentSliderIndex, currentSet);
      return newMap;
    });
  };

  const renderModule = (module: Module) => {
    const isVisible = visibleModules.has(module.id);

    // step 기반 모듈은 항상 표시 (result에서 추가된 모듈)
    const isStepBased = module.visibility?.type === 'step';

    if (!isVisible && !isStepBased) {
      return null;
    }

    if (!isVisible) {
      return null;
    }

    // 현재 슬라이더가 이미 렌더링되었는지 확인 (애니메이션 스킵용)
    const isSliderAlreadyRendered = sliderVisibleModules.has(currentSliderIndex);
    // result 모듈은 항상 애니메이션 실행 (처음 나타나는 것이므로)
    const shouldSkipAnimation = isSliderAlreadyRendered && !isStepBased;

    switch (module.type) {
      case 'paragraph':
        return (
          <View key={`module-${module.id}`} className="mb-6">
            <ParagraghComponentV2 module={module as any} />
          </View>
        );

      case 'webview':
        return (
          <View key={`module-${module.id}`} className="mb-6">
            <WebViewComponent
              module={module}
              isActive={true}
            />
          </View>
        );

      case 'code':
        return (
          <View key={`module-${module.id}`} className="mb-6">
            <CodeComponent module={module as any} />
          </View>
        );

      case 'characterSpeechBubble':
        return (
          <View key={`module-${module.id}`} className="mb-6">
            <CharacterSpeechBubbleComponent module={module as any} />
          </View>
        );

      case 'missionList':
        return (
          <View key={`module-${module.id}`} className="mb-6">
            <MissionListComponent module={module as any} />
          </View>
        );

      case 'tagDescriptionList':
        return (
          <View key={`module-${module.id}`} className="mb-6">
            <TagDescriptionListComponent module={module as any} />
          </View>
        );

      case 'multipleChoice':
        return (
          <View key={`module-${module.id}`} className="mb-6">
            <MultipleChoiceComponent
              curSlideIndex={currentSliderIndex}
              moduleIndex={currentSlider.modules.findIndex((m) => m.id === module.id)}
              curLesson={curLesson as any}
              setCurLesson={setCurLesson}
              isReviewMode={false}
              onSubmitComplete={handleMultipleChoiceSubmit}
              skipAnimation={shouldSkipAnimation}
            />
          </View>
        );

      case 'trueFalseChoice':
        return (
          <View key={`module-${module.id}`} className="mb-6">
            <TrueFalseChoiceComponent
              curSlideIndex={currentSliderIndex}
              moduleIndex={currentSlider.modules.findIndex((m) => m.id === module.id)}
              curLesson={curLesson as any}
              setCurLesson={setCurLesson}
              isReviewMode={false}
              onSubmitComplete={handleTrueFalseChoiceSubmit}
              skipAnimation={shouldSkipAnimation}
            />
          </View>
        );

      default:
        return null;
    }
  };

  return (
    <SafeAreaView
      className="flex-1 bg-white"
      edges={['top']}
    >
      {/* Header */}
      <View className="px-4 py-3 border-b border-[#E1E6EF]">
        <View className="flex-row items-center gap-3">
          {/* Progress Bar */}
          <View className="flex-1 flex-row gap-1">
            {curLesson.sliders.map((_, index) => (
              <View
                key={`progress-${index}`}
                className="flex-1 h-[3px] rounded-[5px]"
                style={{
                  backgroundColor: index <= currentSliderIndex ? '#08875D' : '#E5E7EB'
                }}
              />
            ))}
          </View>

          {/* Exit Button */}
          <DefaultIconBtn
            onPress={handleExitPress}
            size={32}
            enableHapticFeedback
          >
            <X width={24} height={24} fill="#6C757D" />
          </DefaultIconBtn>
        </View>
      </View>

      {/* Content */}
      <ScrollView
        ref={scrollViewRef}
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 20 }}
        showsVerticalScrollIndicator={false}
      >
        {currentSlider.modules.map((module) => renderModule(module))}
      </ScrollView>

      {/* Navigation Buttons */}
      {curLesson.sliders.length > 1 && (
        <View className="px-4 py-3 border-t border-[#E1E6EF] flex-row gap-3">
          {currentSliderIndex > 0 && (
            <TouchableOpacity
              className="flex-1 bg-[#F5F5F5] rounded-[12px] py-4 items-center"
              onPress={() => setCurrentSliderIndex(currentSliderIndex - 1)}
              activeOpacity={0.7}
            >
              <Text className="text-[16px] font-semibold text-[#333333]">
                이전
              </Text>
            </TouchableOpacity>
          )}

          {currentSliderIndex < curLesson.sliders.length - 1 && (
            <TouchableOpacity
              className="flex-1 bg-[#08875D] rounded-[12px] py-4 items-center"
              onPress={() => setCurrentSliderIndex(currentSliderIndex + 1)}
              activeOpacity={0.7}
            >
              <Text className="text-[16px] font-semibold text-white">
                다음
              </Text>
            </TouchableOpacity>
          )}

          {currentSliderIndex === curLesson.sliders.length - 1 && (
            <TouchableOpacity
              className="flex-1 bg-[#08875D] rounded-[12px] py-4 items-center"
              onPress={handleExitPress}
              activeOpacity={0.7}
            >
              <Text className="text-[16px] font-semibold text-white">
                완료
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </SafeAreaView>
  );
};

export default HtmlLessonScreen;

