import React, { useEffect, useState, useRef, useCallback } from 'react';
import { ScrollView, Text, View, Animated, Easing } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { X } from '../../assets/SvgIcon';
import DefaultIconBtn from '../../components/Button/DefaultIconBtn';
import DefaultBtn from '../../components/Button/DefaultBtn';

// 모듈 컴포넌트들
import { ParagraghComponentV2 } from '../../components/module/ParagraghV2';
import { PictureComponent } from '../../components/module/Picture';
import { IconBadgeComponent } from '../../components/module/IconBadge';
import { CardComponent } from '../../components/module/Card';
import { CharacterSpeechBubbleComponent } from '../../components/module/CharacterSpeechBubble';
import { MissionCardComponent } from '../../components/module/MissionCard';
import { ConceptCardComponent } from '../../components/module/ConceptCard';
import { CodeComponent } from '../../components/module/Code';
import { WebViewComponent } from '../../components/module/WebView';
import { ActionButtonComponent } from '../../components/module/ActionButton';
import { ActionButtonsComponent } from '../../components/module/ActionButtons';
import { DragAndDropQuizComponent } from '../../components/module/DragAndDropQuiz';

// 레슨 데이터
import buttonLesson from '../../data/lessons/button_lesson_01.json';

// =========================
// 🔷 타입 정의
// =========================

interface SlideModule {
  id: string;
  type: string;
  visibility: {
    type: string;
    value: number;
  };
  [key: string]: any;
}

interface Slide {
  id: number;
  title: string;
  role: string;
  autoAdvance?: {
    enabled: boolean;
    duration?: number;
    triggerAfterInteraction?: boolean;
    triggerAfterCorrectAnswer?: boolean;
  };
  backgroundColor?: string;
  modules: SlideModule[];
}

interface Lesson {
  id: string;
  title: string;
  description?: string;
  isCompleted: boolean;
  config?: {
    autoAdvance?: {
      enabled: boolean;
      defaultDuration?: number;
      pauseOnInteraction?: boolean;
    };
    progressBar?: {
      visible: boolean;
      style: string;
    };
  };
  sliders: Slide[];
}

// =========================
// 🔷 모듈 렌더러
// =========================

interface ModuleRendererProps {
  module: SlideModule;
  onNextStep?: () => void;
  onActionButtonPress?: (buttonId: string, action?: any) => void;
  setIsNextButtonEnabled?: (enabled: boolean) => void;
  onCorrectAnswer?: () => void;
  onTriggerAutoAdvance?: () => void;
  isReviewMode?: boolean;
  previewUrls?: Record<string, string>;
}

const ModuleRenderer: React.FC<ModuleRendererProps> = ({
  module,
  onNextStep,
  onActionButtonPress,
  setIsNextButtonEnabled,
  onCorrectAnswer,
  onTriggerAutoAdvance,
  isReviewMode,
  previewUrls,
}) => {
  switch (module.type) {
    case 'iconBadge':
      return <IconBadgeComponent module={module as any} />;

    case 'paragraph':
      return <ParagraghComponentV2 module={module as any} />;

    case 'image':
      return <PictureComponent module={module as any} />;

    case 'card':
      return <CardComponent module={module as any} />;

    case 'characterSpeechBubble':
      return <CharacterSpeechBubbleComponent module={module as any} />;

    case 'missionCard':
      return <MissionCardComponent module={module as any} />;

    case 'conceptCard':
      return <ConceptCardComponent module={module as any} />;

    case 'code':
      return (
        <CodeComponent
          module={module as any}
          isActive={true}
        />
      );

    case 'webview':
      // previewUrls에서 동적 URL 가져오기
      const dynamicUrl = previewUrls?.[module.id];
      const moduleWithUrl = dynamicUrl 
        ? {
            ...module,
            tabs: module.tabs?.map((tab: any) => ({
              ...tab,
              content: dynamicUrl
            }))
          }
        : module;
      
      return (
        <WebViewComponent
          module={moduleWithUrl as any}
          isActive={true}
        />
      );

    case 'actionButton':
      return (
        <ActionButtonComponent
          module={module as any}
          onPress={async () => {
            // executeCode 액션 처리
            if (module.action?.type === 'executeCode') {
              // API 호출하여 프리뷰 URL 받기
              const success = await onActionButtonPress?.(module.id, module.action);
              
              if (success) {
                // 다음 스텝으로 이동
                if (onNextStep) {
                  onNextStep();
                }
              }
              return;
            }
            
            // 기본 동작: 다음 스텝으로 이동
            if (onNextStep) {
              onNextStep();
            }
            // triggerAfterInteraction이 true면 자동 전환 시작
            if (onTriggerAutoAdvance) {
              // onTriggerAutoAdvance();
            }
          }}
        />
      );

    case 'actionButtons':
      return (
        <ActionButtonsComponent
          module={module as any}
          onButtonPress={onActionButtonPress}
        />
      );

    case 'dragAndDropQuiz':
      return (
        <DragAndDropQuizComponent
          module={module as any}
          setIsNextButtonEnabled={setIsNextButtonEnabled}
          onCorrectAnswer={onCorrectAnswer}
          isReviewMode={isReviewMode}
        />
      );

    default:
      return null;
  }
};

// =========================
// 🔷 프로그레스 바 컴포넌트
// =========================

interface ProgressBarProps {
  current: number;
  total: number;
  autoAdvanceProgress?: number; // 0~1 사이 값
}

const SegmentedProgressBar: React.FC<ProgressBarProps> = ({
  current,
  total,
  autoAdvanceProgress,
}) => {
  return (
    <View className="flex-row gap-1">
      {Array.from({ length: total }).map((_, index) => {
        const isCompleted = index < current;
        const isCurrent = index === current;

        return (
          <View
            key={`progress-${index}`}
            className="flex-1 h-[3px] rounded-[5px] overflow-hidden"
            style={{
              backgroundColor: isCompleted ? '#08875D' : '#E5E7EB',
            }}
          >
            {/* 현재 슬라이드에 autoAdvance 진행률 표시 */}
            {isCurrent && autoAdvanceProgress !== undefined && (
              <View
                className="h-full bg-Success-Default-700"
                style={{
                  width: `${autoAdvanceProgress * 100}%`,
                }}
              />
            )}
          </View>
        );
      })}
    </View>
  );
};

// =========================
// 🔷 메인 컴포넌트
// =========================

const LessonLearningScreenV4: React.FC = () => {
  const navigation = useNavigation();
  const lessonData = buttonLesson.lessons[0] as Lesson;

  // =========================
  // 📌 상태 관리
  // =========================
  const [curSlideIndex, setCurSlideIndex] = useState(0);
  const [curSlideStep, setCurSlideStep] = useState<number[]>(
    Array(lessonData.sliders.length).fill(1)
  );
  const [isNextButtonEnabled, setIsNextButtonEnabled] = useState(true);
  const [autoAdvanceProgress, setAutoAdvanceProgress] = useState(0);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});

  // 타이머 관련 ref
  const autoAdvanceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const progressAnimationRef = useRef<Animated.Value>(new Animated.Value(0));
  const scrollViewRef = useRef<ScrollView>(null);

  // 현재 슬라이드 데이터
  const currentSlide = lessonData.sliders[curSlideIndex];
  const hasNextSlide = curSlideIndex < lessonData.sliders.length - 1;

  // =========================
  // 🔧 유틸리티 함수
  // =========================

  // 현재 스텝의 모듈들 가져오기
  const getVisibleModules = useCallback(() => {
    if (!currentSlide) return [];
    return currentSlide.modules.filter(
      (m) => m.visibility.type === 'step' && m.visibility.value <= curSlideStep[curSlideIndex]
    );
  }, [currentSlide, curSlideStep, curSlideIndex]);

  // 다음 스텝 모듈 확인
  const getNextStepModules = useCallback(() => {
    if (!currentSlide) return [];
    return currentSlide.modules.filter(
      (m) => m.visibility.type === 'step' && m.visibility.value === curSlideStep[curSlideIndex] + 1
    );
  }, [currentSlide, curSlideStep, curSlideIndex]);

  // 문제 모듈 확인
  const hasProblemModule = useCallback((modules: SlideModule[]) => {
    return modules.some(m => m.type === 'dragAndDropQuiz');
  }, []);

  // =========================
  // 🌐 S3 API 호출
  // =========================
  const executeCodePreview = useCallback(async (s3Path: string, targetWebViewId: string) => {
    try {
      // 본인 내부망 IP로 수정
      const response = await fetch('http://192.168.222.127:5103/api/executor/preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ s3Path }),
      });

      const data = await response.json();

      if (data.success && data.previewUrl) {
        setPreviewUrls(prev => ({
          ...prev,
          [targetWebViewId]: data.previewUrl
        }));
        return true;
      } else {
        console.error('❌ API 호출 실패:', data);
        return false;
      }
    } catch (error) {
      console.error('❌ API 호출 에러:', error);
      return false;
    }
  }, []);

  // =========================
  // 🎬 Auto Advance 로직
  // =========================

  const clearAutoAdvanceTimer = useCallback(() => {
    if (autoAdvanceTimerRef.current) {
      clearTimeout(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = null;
    }
    progressAnimationRef.current.setValue(0);
    setAutoAdvanceProgress(0);
  }, []);

  const startAutoAdvance = useCallback(() => {
    if (!currentSlide?.autoAdvance?.enabled) return;

    const duration = currentSlide.autoAdvance.duration ||
      lessonData.config?.autoAdvance?.defaultDuration ||
      5000;

    clearAutoAdvanceTimer();

    // 프로그레스 애니메이션
    progressAnimationRef.current.setValue(0);
    Animated.timing(progressAnimationRef.current, {
      toValue: 1,
      duration,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start();

    // 프로그레스 값 업데이트
    const updateInterval = setInterval(() => {
      progressAnimationRef.current.addListener(({ value }) => {
        setAutoAdvanceProgress(value);
      });
    }, 100);

    // 자동 다음 슬라이드
    autoAdvanceTimerRef.current = setTimeout(() => {
      clearInterval(updateInterval);
      handleNextSlide();
    }, duration);

    return () => {
      clearInterval(updateInterval);
    };
  }, [currentSlide, lessonData.config?.autoAdvance?.defaultDuration, clearAutoAdvanceTimer]);

  // 슬라이드 변경 시 타이머 관리
  useEffect(() => {
    clearAutoAdvanceTimer();

    const isLastSlide = curSlideIndex === lessonData.sliders.length - 1;

    // autoAdvance가 활성화된 슬라이드면 타이머 시작
    if (currentSlide?.autoAdvance?.enabled) {
      // 약간의 딜레이 후 시작 (렌더링 완료 대기)
      const startDelay = setTimeout(() => {
        startAutoAdvance();
      }, 300);

      return () => clearTimeout(startDelay);
    }

    // 마지막 슬라이드: 프로그레스 바만 애니메이션 (자동 전환 없음)
    if (isLastSlide) {
      const duration = 2000; // 3초 동안 채우기
      
      // 프로그레스 애니메이션만 시작 (타이머는 설정하지 않음)
      progressAnimationRef.current.setValue(0);
      Animated.timing(progressAnimationRef.current, {
        toValue: 1,
        duration,
        easing: Easing.linear,
        useNativeDriver: false,
      }).start();

      // 프로그레스 값 업데이트
      const updateInterval = setInterval(() => {
        progressAnimationRef.current.addListener(({ value }) => {
          setAutoAdvanceProgress(value);
        });
      }, 100);

      return () => {
        clearInterval(updateInterval);
      };
    }

    return () => clearAutoAdvanceTimer();
  }, [curSlideIndex, currentSlide?.autoAdvance?.enabled, lessonData.sliders.length]);

  // =========================
  // 🛠 핸들러 함수
  // =========================

  const handleNextStep = useCallback(() => {
    const nextStepModules = getNextStepModules();

    if (nextStepModules.length > 0) {
      // 다음 스텝이 있으면 스텝 증가
      setCurSlideStep(prev => {
        const updated = [...prev];
        updated[curSlideIndex] = updated[curSlideIndex] + 1;
        return updated;
      });

      // 문제 모듈이 있으면 버튼 비활성화
      if (hasProblemModule(nextStepModules)) {
        setIsNextButtonEnabled(false);
      }

      // 스크롤 하단으로
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } else {
      // 다음 스텝이 없으면 다음 슬라이드로
      handleNextSlide();
    }
  }, [curSlideIndex, getNextStepModules, hasProblemModule]);

  const handleNextSlide = useCallback(() => {
    if (hasNextSlide) {
      setCurSlideIndex(prev => prev + 1);
      setIsNextButtonEnabled(true);
      scrollViewRef.current?.scrollTo({ y: 0, animated: false });
    } else {
      // 마지막 슬라이드면 학습 완료
      handleLessonComplete();
    }
  }, [hasNextSlide]);

  const handleLessonComplete = useCallback(() => {
    console.log('🎉 레슨 완료!');
    navigation.goBack();
  }, [navigation]);

  const handleExitPress = useCallback(() => {
    clearAutoAdvanceTimer();
    navigation.goBack();
  }, [clearAutoAdvanceTimer, navigation]);

  const handleActionButtonPress = useCallback(async (buttonId: string, action?: any) => {
    if (action?.type === 'executeCode') {
      const { s3Path, targetWebViewId } = action;
      return await executeCodePreview(s3Path, targetWebViewId);
    }
    
    if (action?.type === 'navigate') {
      if (action.target === 'nextLesson') {
        // TODO: 다음 레슨으로 이동
        console.log('다음 레슨으로 이동');
      } else if (action.target === 'home') {
        navigation.goBack();
      }
    }
  }, [navigation, executeCodePreview]);

  const startAutoAdvanceWithDuration = useCallback((duration: number) => {
    // 기존 타이머 정리
    clearAutoAdvanceTimer();
    
    // 프로그레스 애니메이션
    progressAnimationRef.current.setValue(0);
    Animated.timing(progressAnimationRef.current, {
      toValue: 1,
      duration,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start();

    // 프로그레스 값 업데이트
    const updateInterval = setInterval(() => {
      progressAnimationRef.current.addListener(({ value }) => {
        setAutoAdvanceProgress(value);
      });
    }, 100);

    // 자동 다음 슬라이드
    autoAdvanceTimerRef.current = setTimeout(() => {
      clearInterval(updateInterval);
      handleNextSlide();
    }, duration);
  }, [clearAutoAdvanceTimer, handleNextSlide]);

  const handleCorrectAnswer = useCallback(() => {
    // 퀴즈 정답 시 호출되는 함수
    // triggerAfterCorrectAnswer가 true면 자동 전환 시작
    if (currentSlide?.autoAdvance?.triggerAfterCorrectAnswer) {
      const duration = currentSlide.autoAdvance.duration || 3000;
      startAutoAdvanceWithDuration(duration);
    }
  }, [currentSlide, startAutoAdvanceWithDuration]);

  const handleTriggerAutoAdvance = useCallback(() => {
    // 버튼 클릭 등 상호작용 후 자동 전환 시작
    if (currentSlide?.autoAdvance?.triggerAfterInteraction) {
      const duration = currentSlide.autoAdvance.duration || 3000;
      startAutoAdvanceWithDuration(duration);
    }
  }, [currentSlide, startAutoAdvanceWithDuration]);

  // =========================
  // 🎨 렌더링
  // =========================

  if (!lessonData || !currentSlide) return null;

  const visibleModules = getVisibleModules();
  const isLastSlide = curSlideIndex === lessonData.sliders.length - 1;
  
  // 버튼 표시 조건:
  // 1. autoAdvance가 비활성화된 슬라이드
  // 2. 마지막 슬라이드
  // 3. triggerAfterCorrectAnswer가 true인 슬라이드 (정답 후 자동/수동 전환 선택 가능)
  const showNextButton = 
    !currentSlide.autoAdvance?.enabled || 
    isLastSlide || 
    currentSlide.autoAdvance?.triggerAfterCorrectAnswer;

  return (
    <SafeAreaView
      className="flex-1"
      style={{
        backgroundColor: currentSlide.backgroundColor || '#FAFAFA',
      }}
      edges={['top']}
    >
      {/* 헤더 */}
      <View className="px-4 pt-2 pb-1">
        {/* 프로그레스 바 */}
        <SegmentedProgressBar
          current={curSlideIndex}
          total={lessonData.sliders.length}
          autoAdvanceProgress={
            (currentSlide.autoAdvance?.enabled || 
             currentSlide.autoAdvance?.triggerAfterCorrectAnswer ||
             currentSlide.autoAdvance?.triggerAfterInteraction ||
             isLastSlide) 
              ? autoAdvanceProgress 
              : undefined
          }
        />

        {/* 타이틀 & 닫기 버튼 */}
        <View className="flex-row justify-between items-center mt-2 h-[44px]">
          <Text className="bold-16 text-Text-Black_Secondary tracking-[-0.32px]">
            {currentSlide.title}
          </Text>
          <DefaultIconBtn
            onPress={handleExitPress}
            size={32}
            enableHapticFeedback
          >
            <X width={24} height={24} fill="#6C757D" />
          </DefaultIconBtn>
        </View>
      </View>

      {/* 본문 */}
      <ScrollView
        ref={scrollViewRef}
        className="flex-1 px-4"
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="py-10">
          {visibleModules.map((module, index) => {
            // spacing이 설정된 모듈은 py-10의 패딩을 상쇄하고, gap 대신 모듈 자체의 margin 사용
            const hasSpacing = module.spacing && (module.spacing.marginTop !== undefined || module.spacing.marginBottom !== undefined);
            const isFirst = index === 0;
            const isLast = index === visibleModules.length - 1;
            
            return (
              <View
                key={`${module.id}-${index}`}
                style={{
                  // spacing이 있는 모듈은 py-10(40px) 패딩 상쇄
                  ...(hasSpacing && isFirst && { marginTop: -40 }),
                  ...(hasSpacing && isLast && { marginBottom: -40 }),
                  // spacing이 없는 모듈만 gap 적용 (첫 번째가 아니면)
                  ...(!hasSpacing && !isFirst && { marginTop: 30 }),
                }}
              >
                <ModuleRenderer
                  module={module}
                  onNextStep={handleNextStep}
                  onActionButtonPress={handleActionButtonPress}
                  setIsNextButtonEnabled={setIsNextButtonEnabled}
                  onCorrectAnswer={handleCorrectAnswer}
                  onTriggerAutoAdvance={handleTriggerAutoAdvance}
                  isReviewMode={false}
                  previewUrls={previewUrls}
                />
              </View>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default LessonLearningScreenV4;

