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
import lessonData from '../../data/lessons/html_00.json';

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

  // 첫 번째 레슨 데이터를 state로 관리
  const [lesson, setLesson] = useState<Lesson>(lessonData.lessons[0] as Lesson);
  const currentSlider: Slider = lesson.sliders[currentSliderIndex];

  useEffect(() => {
    // 슬라이더가 변경될 때 상태 초기화
    setVisibleModules(new Set());

    // 모듈의 visibility 설정에 따라 순차적으로 표시
    let maxDelay = 0;
    
    currentSlider.modules.forEach((module) => {
      const delay = module.visibility?.showDelay || 0;
      
      if (delay === 0) {
        // 즉시 표시
        setVisibleModules((prev) => new Set(prev).add(module.id));
      } else {
        // 지연 후 표시
        setTimeout(() => {
          setVisibleModules((prev) => new Set(prev).add(module.id));
          // 새 모듈이 나타날 때 스크롤을 하단으로 부드럽게 이동
          setTimeout(() => {
            scrollViewRef.current?.scrollToEnd({ animated: true });
          }, 100); // 렌더링 후 스크롤
        }, delay);
      }

      // missionList 타입인 경우, 각 아이템이 나타날 때도 스크롤
      if (module.type === 'missionList' && module.items) {
        module.items.forEach((item: any) => {
          const itemDelay = delay + (item.showDelay || 0);
          setTimeout(() => {
            scrollViewRef.current?.scrollToEnd({ animated: true });
          }, itemDelay + 450); // 아이템 애니메이션 완료 후 스크롤
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

    // afterSubmit 타입 모듈은 '선택 완료' 버튼 클릭 시에만 표시됨 (콜백으로 처리)

    // 컴포넌트 언마운트 시 타이머 정리
    return () => {
      setVisibleModules(new Set());
    };
  }, [currentSliderIndex]);

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
    const newLesson = { ...lesson };
    const newSliders = [...newLesson.sliders];
    const newModules = [...newSliders[currentSliderIndex].modules];
    
    // result 모듈들을 추가 (step 기반이므로 visibility는 그대로 유지)
    const resultModules = filteredResultModules.map((mod: any) => ({
      ...mod,
      // step 기반 visibility는 그대로 유지
    }));

    newSliders[currentSliderIndex].modules = [...newModules, ...resultModules];
    newLesson.sliders = newSliders;
    setLesson(newLesson);

    // result 모듈들을 순차적으로 표시
    resultModules.forEach((mod: any, index: number) => {
      setTimeout(() => {
        setVisibleModules((prev) => new Set(prev).add(mod.id));
        setTimeout(() => {
          scrollViewRef.current?.scrollToEnd({ animated: true });
        }, 100);
      }, 500 + (index * 300)); // 첫 번째는 0.5초 후, 나머지는 0.3초 간격
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
    const newLesson = { ...lesson };
    const newSliders = [...newLesson.sliders];
    const newModules = [...newSliders[currentSliderIndex].modules];
    
    const resultModules = filteredResultModules.map((mod: any) => ({
      ...mod,
    }));
  
    newSliders[currentSliderIndex].modules = [...newModules, ...resultModules];
    newLesson.sliders = newSliders;
    setLesson(newLesson);
  
    // result 모듈들을 순차적으로 표시
    resultModules.forEach((mod: any, index: number) => {
      setTimeout(() => {
        setVisibleModules((prev) => new Set(prev).add(mod.id));
        setTimeout(() => {
          scrollViewRef.current?.scrollToEnd({ animated: true });
        }, 100);
      }, 500 + (index * 300));
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
              curLesson={lesson as any}
              setCurLesson={setLesson}
              isReviewMode={false}
              onSubmitComplete={handleMultipleChoiceSubmit}
            />
          </View>
        );

      case 'trueFalseChoice':
        return (
          <View key={`module-${module.id}`} className="mb-6">
            <TrueFalseChoiceComponent
              curSlideIndex={currentSliderIndex}
              moduleIndex={currentSlider.modules.findIndex((m) => m.id === module.id)}
              curLesson={lesson as any}
              setCurLesson={setLesson}
              isReviewMode={false}
              onSubmitComplete={handleTrueFalseChoiceSubmit}
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
            {lesson.sliders.map((_, index) => (
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
      {lesson.sliders.length > 1 && (
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
          
          {currentSliderIndex < lesson.sliders.length - 1 && (
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
          
          {currentSliderIndex === lesson.sliders.length - 1 && (
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

