import React, { useEffect, useState, useRef, useCallback } from 'react';
import { ScrollView, Text, View, Animated, Easing } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { X } from '../../assets/SvgIcon';
import DefaultIconBtn from '../../components/Button/DefaultIconBtn';
import DefaultBtn from '../../components/Button/DefaultBtn';
import { AudioPlayer } from '../../components/AudioPlayer';

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
import { BACK_URL } from '../../utils/service';

// 레슨 데이터
import buttonLesson from '../../data/lessons/button_lesson_01.json';

// =========================
// 🔷 타입 정의
// =========================

interface SlideModule {
  id: string | number;
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
  previewUrls?: Record<string, { url: string; timestamp: number }>;
  executeCodePreview?: (s3Path: string, targetWebViewId: string, forceRefresh?: boolean) => Promise<boolean>;
  currentSlideModules?: SlideModule[];
}

// WebView 자동 새로고침 컴포넌트
const WebViewWithAutoRefresh: React.FC<{
  module: SlideModule;
  previewUrls?: Record<string, { url: string; timestamp: number }>;
  executeCodePreview?: (s3Path: string, targetWebViewId: string, forceRefresh?: boolean) => Promise<boolean>;
  currentSlideModules?: SlideModule[];
}> = ({ module, previewUrls, executeCodePreview, currentSlideModules }) => {
  const previewData = previewUrls?.[module.id];
  const PREVIEW_EXPIRY_TIME = 5 * 60 * 1000; // 5분
  const [refreshKey, setRefreshKey] = useState(0); // WebView 강제 리로드를 위한 key

  // 프리뷰 URL이 없거나 만료되었는지 체크
  const needsRefresh = !previewData || (Date.now() - previewData.timestamp) >= PREVIEW_EXPIRY_TIME;

  // 같은 슬라이드의 actionButton에서 s3Path 찾기
  useEffect(() => {
    if (needsRefresh && executeCodePreview && currentSlideModules) {
      // 같은 슬라이드의 actionButton에서 targetWebViewId가 이 WebView의 id와 일치하는 것 찾기
      const actionButton = currentSlideModules.find(
        (m) => m.type === 'actionButton' && m.action?.targetWebViewId === module.id
      );
      
      if (actionButton?.action?.s3Path) {
        console.log('🔄 프리뷰 URL 자동 새로고침:', module.id, 's3Path:', actionButton.action.s3Path);
        executeCodePreview(actionButton.action.s3Path, String(module.id), true).then(() => {
          // URL 업데이트 후 WebView 강제 리로드
          setRefreshKey(prev => prev + 1);
        });
      }
    }
  }, [needsRefresh, module.id, executeCodePreview, currentSlideModules]);

  // previewUrls가 변경되면 WebView 강제 리로드
  useEffect(() => {
    if (previewData?.url) {
      console.log('🔄 프리뷰 URL 변경됨, WebView 리로드:', previewData.url);
      setRefreshKey(prev => prev + 1);
    }
  }, [previewData?.url]);

  const dynamicUrl = previewData?.url;
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
      key={`webview-${module.id}-${refreshKey}`} // URL 변경 시 강제 리로드
      module={moduleWithUrl as any}
      isActive={true}
    />
  );
};

const ModuleRenderer: React.FC<ModuleRendererProps> = ({
  module,
  onNextStep,
  onActionButtonPress,
  setIsNextButtonEnabled,
  onCorrectAnswer,
  onTriggerAutoAdvance,
  isReviewMode,
  previewUrls,
  executeCodePreview,
  currentSlideModules,
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
      // WebView 컴포넌트를 렌더링하면서 프리뷰 URL 자동 요청
      return (
        <WebViewWithAutoRefresh
          module={module}
          previewUrls={previewUrls}
          executeCodePreview={executeCodePreview}
          currentSlideModules={currentSlideModules}
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
              const success = await onActionButtonPress?.(String(module.id), module.action);
              
              if (success) {
                // 다음 스텝으로 이동
                if (onNextStep) {
                  onNextStep();
                }
                // triggerAfterInteraction이 true면 자동 전환 시작 (마지막 스텝 완료 후)
                // 모듈 렌더링 완료를 위해 약간의 딜레이 후 호출
                if (onTriggerAutoAdvance) {
                  setTimeout(() => {
                    onTriggerAutoAdvance();
                  }, 300);
                }
              }
              return;
            }
            
            // 기본 동작: 다음 스텝으로 이동
            if (onNextStep) {
              onNextStep();
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
  // 프리뷰 URL과 생성 시간 저장 (5분 유효기간)
  const [previewUrls, setPreviewUrls] = useState<Record<string, { url: string; timestamp: number }>>({});
  
  // TTS 관련 상태
  const [ttsQueue, setTtsQueue] = useState<string[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);

  // 🎮 제스처 관련 상태: 자동 넘김 일시정지/재생
  const [isPaused, setIsPaused] = useState(false);
  const [remainingMs, setRemainingMs] = useState<number | null>(null); // pause 시점의 남은 시간
  const pausedAtRef = useRef<number | null>(null); // pause 시작 시각 (타임스탬프)

  // 타이머 관련 ref
  const autoAdvanceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const progressAnimationRef = useRef<Animated.Value>(new Animated.Value(0));
  const progressListenerIdRef = useRef<string | null>(null); // 리스너 ID 추적 (중복 방지)
  const scrollViewRef = useRef<ScrollView>(null);

  // 현재 슬라이드 데이터
  const currentSlide = lessonData.sliders[curSlideIndex];
  const hasNextSlide = curSlideIndex < lessonData.sliders.length - 1;

  // =========================
  // 🔧 유틸리티 함수
  // =========================

  /**
   * 📌 canGoNext: 다음 슬라이드로 이동 가능 여부 판별
   * - 설명형 슬라이드(개념 설명만)에서만 true
   * - 상호작용(퀴즈/코드실행/액션버튼 등)이 필요한 슬라이드는 false
   * - 이전 슬라이드로는 제한 없음
   */
  const canGoNext = useCallback((slide: Slide): boolean => {
    // autoAdvance가 비활성화되어 있으면 수동 조작 전용 슬라이드 → false
    if (!slide.autoAdvance?.enabled) {
      return false;
    }

    // triggerAfterInteraction이나 triggerAfterCorrectAnswer가 있으면
    // 상호작용 완료 전까지는 다음으로 넘어갈 수 없음 → false
    if (
      slide.autoAdvance.triggerAfterInteraction ||
      slide.autoAdvance.triggerAfterCorrectAnswer
    ) {
      return false;
    }

    // 상호작용 모듈 체크: 퀴즈, executeCode 액션, 웹뷰 상호작용 등
    const hasInteractionModule = slide.modules.some((module) => {
      // 퀴즈 모듈
      if (module.type === 'dragAndDropQuiz') {
        return true;
      }
      // executeCode 액션 버튼
      if (module.type === 'actionButton' && (module as any).action?.type === 'executeCode') {
        return true;
      }
      // 향후 확장: 다른 상호작용 모듈 추가 가능
      return false;
    });

    if (hasInteractionModule) {
      return false;
    }

    // 모든 조건 통과 → 다음 슬라이드 이동 허용
    return true;
  }, []);

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

  // 현재 스텝의 모듈들 가져오기 (TTS용)
  const getStepModules = useCallback((step: number): SlideModule[] => {
    if (!currentSlide) return [];
    return currentSlide.modules.filter(
      (m) => m.visibility.type === 'step' && m.visibility.value === step
    );
  }, [currentSlide]);

  // 문제 모듈 확인
  const hasProblemModule = useCallback((modules: SlideModule[]) => {
    return modules.some(m => m.type === 'dragAndDropQuiz');
  }, []);

  // =========================
  // 🌐 S3 API 호출
  // =========================
  const executeCodePreview = useCallback(async (s3Path: string, targetWebViewId: string, forceRefresh: boolean = false) => {
    try {
      // 기존 URL이 있고 만료되지 않았으면 재사용 (forceRefresh가 false일 때만)
      const existingPreview = previewUrls[targetWebViewId];
      const PREVIEW_EXPIRY_TIME = 5 * 60 * 1000; // 5분 (밀리초)
      
      if (!forceRefresh && existingPreview) {
        const elapsed = Date.now() - existingPreview.timestamp;
        if (elapsed < PREVIEW_EXPIRY_TIME) {
          console.log('♻️ 기존 프리뷰 URL 재사용 (만료까지 남은 시간:', Math.round((PREVIEW_EXPIRY_TIME - elapsed) / 1000), '초)');
          return true;
        } else {
          console.log('⏰ 프리뷰 URL 만료됨, 새로운 URL 요청');
        }
      }

      // API URL (환경에 따라 변경 필요)
      const API_URL = `${BACK_URL}/api/executor/preview`;
      console.log('🌐 API 호출:', API_URL, 's3Path:', s3Path, 'forceRefresh:', forceRefresh);
      
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ s3Path }),
      });

      const data = await response.json();
      console.log('🌐 API 응답:', data);

      if (data.success && data.previewUrl) {
        console.log('✅ API 호출 성공, 새로운 previewUrl:', data.previewUrl);
        setPreviewUrls(prev => ({
          ...prev,
          [targetWebViewId]: {
            url: data.previewUrl,
            timestamp: Date.now()
          }
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
  }, [previewUrls]);

  // =========================
  // 🎬 Auto Advance 로직
  // =========================

  /**
   * 📌 clearAutoAdvanceTimer: 타이머 및 애니메이션 정리
   * - 기존 타이머 제거
   * - 애니메이션 중지
   * - 리스너 제거 (메모리 누수 방지)
   */
  const clearAutoAdvanceTimer = useCallback(() => {
    if (autoAdvanceTimerRef.current) {
      clearTimeout(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = null;
    }
    // 애니메이션 중지
    progressAnimationRef.current.stopAnimation();
    
    // 리스너 제거 (메모리 누수 방지)
    if (progressListenerIdRef.current) {
      progressAnimationRef.current.removeListener(progressListenerIdRef.current);
      progressListenerIdRef.current = null;
    }
    
    progressAnimationRef.current.setValue(0);
    setAutoAdvanceProgress(0);
    setIsPaused(false);
    setRemainingMs(null);
    pausedAtRef.current = null;
  }, []);

  /**
   * 📌 startAutoAdvance: 자동 넘김 시작 (pause/resume 지원)
   * - durationMs: 전체 재생 시간 (resume 시에는 남은 시간)
   * - fromProgress: 시작 progress (0~1, resume 시에는 이전 진행률)
   */
  const startAutoAdvance = useCallback((durationMs?: number, fromProgress: number = 0) => {
    if (!currentSlide?.autoAdvance?.enabled) return;

    const totalDuration = durationMs || 
      currentSlide.autoAdvance.duration ||
      lessonData.config?.autoAdvance?.defaultDuration ||
      5000;

    clearAutoAdvanceTimer();

    // 프로그레스 애니메이션: fromProgress부터 1까지
    progressAnimationRef.current.setValue(fromProgress);
    
    Animated.timing(progressAnimationRef.current, {
      toValue: 1,
      duration: totalDuration,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start();

    // 리스너 추가 (중복 방지)
    if (!progressListenerIdRef.current) {
      progressListenerIdRef.current = progressAnimationRef.current.addListener(({ value }) => {
        setAutoAdvanceProgress(value);
      });
    }

    // 자동 다음 슬라이드 타이머
    autoAdvanceTimerRef.current = setTimeout(() => {
      // canGoNext 체크: 다음 슬라이드로 이동 가능한지 확인
      if (canGoNext(currentSlide)) {
        handleNextSlide();
      } else {
        // 상호작용 필요 슬라이드 → 타이머만 정리하고 대기
        console.log('⏸️ 상호작용 필요 슬라이드: 자동 넘김 중단');
        clearAutoAdvanceTimer();
      }
    }, totalDuration);

  }, [currentSlide, lessonData.config?.autoAdvance?.defaultDuration, clearAutoAdvanceTimer, canGoNext]);

  /**
   * 📌 pauseAutoAdvance: 자동 넘김 일시정지
   * - 현재 진행률 저장
   * - 남은 시간 계산 (전체 시간 * (1 - 진행률))
   * - 타이머 및 애니메이션 중지
   * - TTS 재생 중이면 TTS도 일시정지
   */
  const pauseAutoAdvance = useCallback(() => {
    if (!currentSlide?.autoAdvance?.enabled || isPaused) return;

    const isTtsSlide = (currentSlide.autoAdvance as any).trigger === 'tts';
    
    // TTS 슬라이드인 경우: 프로그레스 바 애니메이션만 pause (TTS는 별도로 제어)
    if (isTtsSlide) {
      // 프로그레스 바 애니메이션 중지
      progressAnimationRef.current.stopAnimation((finalValue) => {
        setAutoAdvanceProgress(finalValue);
      });
      
      // TTS 일시정지
      setIsPaused(true);
      console.log('⏸️ TTS 일시정지');
      return;
    }

    // 일반 슬라이드: 타이머 기반 pause
    const currentProgress = autoAdvanceProgress;
    const totalDuration =
      currentSlide.autoAdvance.duration ||
      lessonData.config?.autoAdvance?.defaultDuration ||
      5000;

    const remaining = totalDuration * (1 - currentProgress);

    // 애니메이션 중지
    progressAnimationRef.current.stopAnimation((finalValue) => {
      setAutoAdvanceProgress(finalValue);
    });

    // 타이머 제거 (애니메이션 값은 유지)
    if (autoAdvanceTimerRef.current) {
      clearTimeout(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = null;
    }

    // pause 상태 저장
    setIsPaused(true);
    setRemainingMs(remaining);
    pausedAtRef.current = Date.now();

    console.log('⏸️ 일시정지:', { currentProgress, remaining: `${Math.round(remaining)}ms` });
  }, [currentSlide, isPaused, autoAdvanceProgress, lessonData.config?.autoAdvance?.defaultDuration]);

  /**
   * 📌 resumeAutoAdvance: 자동 넘김 재개
   * - 저장된 남은 시간으로 타이머 재시작
   * - 진행률은 이어서 표시
   * - TTS 재생 중이면 TTS도 재개
   */
  const resumeAutoAdvance = useCallback(() => {
    if (!currentSlide?.autoAdvance?.enabled || !isPaused) return;

    const isTtsSlide = (currentSlide.autoAdvance as any).trigger === 'tts';
    
    // TTS 슬라이드인 경우: 프로그레스 바 애니메이션만 resume (TTS는 별도로 제어)
    if (isTtsSlide) {
      const currentProgress = autoAdvanceProgress;
      const estimatedDuration = 15000; // TTS 예상 시간
      const remaining = estimatedDuration * (1 - currentProgress);
      
      // 프로그레스 바 애니메이션 재개
      Animated.timing(progressAnimationRef.current, {
        toValue: 0.9, // TTS는 90%까지만 채움
        duration: remaining,
        easing: Easing.linear,
        useNativeDriver: false,
      }).start();
      
      // TTS 재개
      setIsPaused(false);
      console.log('▶️ TTS 재생');
      return;
    }

    // 일반 슬라이드: 타이머 기반 resume
    if (remainingMs === null) return;

    const currentProgress = autoAdvanceProgress;

    console.log('▶️ 재생:', { currentProgress, remainingMs: `${Math.round(remainingMs)}ms` });

    // 애니메이션 재개: currentProgress → 1
    Animated.timing(progressAnimationRef.current, {
      toValue: 1,
      duration: remainingMs,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start();

    // 타이머 재시작
    autoAdvanceTimerRef.current = setTimeout(() => {
      // canGoNext 체크
      if (canGoNext(currentSlide)) {
        handleNextSlide();
      } else {
        console.log('⏸️ 상호작용 필요 슬라이드: 자동 넘김 중단');
        clearAutoAdvanceTimer();
      }
    }, remainingMs);

    // pause 상태 해제
    setIsPaused(false);
    setRemainingMs(null);
    pausedAtRef.current = null;
  }, [currentSlide, isPaused, remainingMs, autoAdvanceProgress, canGoNext, clearAutoAdvanceTimer]);

  /**
   * 📌 togglePauseResume: 탭으로 일시정지/재생 토글
   * - 상호작용이 필요 없는 슬라이드에서만 동작
   *   (autoAdvance.enabled === true이고, 상호작용 모듈이 없는 슬라이드)
   * - TTS 슬라이드도 pause/resume 가능
   */
  const togglePauseResume = useCallback(() => {
    // autoAdvance가 활성화되어 있어야 함
    if (!currentSlide?.autoAdvance?.enabled) return;

    // 상호작용이 필요한 슬라이드는 pause/resume 불가
    // 단, TTS 슬라이드(trigger === 'tts')는 예외로 pause/resume 가능
    const isTtsSlide = (currentSlide.autoAdvance as any).trigger === 'tts';
    if (!isTtsSlide && !canGoNext(currentSlide)) {
      // TTS가 아니고 상호작용이 필요한 슬라이드 → pause/resume 불가
      return;
    }

    if (isPaused) {
      resumeAutoAdvance();
    } else {
      pauseAutoAdvance();
    }
  }, [isPaused, currentSlide, pauseAutoAdvance, resumeAutoAdvance, canGoNext]);

  // 슬라이드 변경 시 타이머 관리
  useEffect(() => {
    // 슬라이드 변경 시 pause 상태 초기화
    clearAutoAdvanceTimer();

    const isLastSlide = curSlideIndex === lessonData.sliders.length - 1;

    // autoAdvance가 활성화된 슬라이드면 타이머 시작
    if (currentSlide?.autoAdvance?.enabled) {
      // trigger가 "tts"인 경우, TTS가 끝날 때까지 기다림 (타이머 시작하지 않음)
      if ((currentSlide.autoAdvance as any).trigger === 'tts') {
        console.log('⏸️ TTS 트리거 대기 중...');
        return;
      }

      // 약간의 딜레이 후 시작 (렌더링 완료 대기)
      const startDelay = setTimeout(() => {
        startAutoAdvance();
      }, 300);

      return () => clearTimeout(startDelay);
    }

    // 마지막 슬라이드: 프로그레스 바만 애니메이션 (자동 전환 없음)
    if (isLastSlide) {
      const duration = 2000; // 2초 동안 채우기
      
      // 프로그레스 애니메이션만 시작 (타이머는 설정하지 않음)
      progressAnimationRef.current.setValue(0);
      Animated.timing(progressAnimationRef.current, {
        toValue: 1,
        duration,
        easing: Easing.linear,
        useNativeDriver: false,
      }).start();

      // 리스너 추가 (중복 방지)
      if (!progressListenerIdRef.current) {
        progressListenerIdRef.current = progressAnimationRef.current.addListener(({ value }) => {
          setAutoAdvanceProgress(value);
        });
      }

      return () => {
        // cleanup은 clearAutoAdvanceTimer에서 처리
      };
    }

    return () => clearAutoAdvanceTimer();
  }, [curSlideIndex, currentSlide?.autoAdvance?.enabled, lessonData.sliders.length, startAutoAdvance, clearAutoAdvanceTimer]);

  // 스텝 변경 시 TTS 큐 업데이트
  useEffect(() => {
    const currentStepModules = getStepModules(curSlideStep[curSlideIndex]);
    const ttsUrls = currentStepModules
      .filter(m => (m as any).tts)
      .map(m => (m as any).tts as string);
    
    if (ttsUrls.length > 0) {
      // 새로운 스텝의 TTS를 재생하기 위해 재생 상태 초기화
      setIsPlaying(false);
      setCurrentUrl(null);
      setTtsQueue(ttsUrls);
    } else {
      // TTS가 없으면 큐 비우기
      setTtsQueue([]);
      setCurrentUrl(null);
      setIsPlaying(false);
    }
  }, [curSlideIndex, curSlideStep, getStepModules, currentSlide?.modules?.length]);

  // 마지막 스텝 완료 시 자동 전환 (triggerAfterInteraction)
  useEffect(() => {
    // triggerAfterInteraction이 true이고 enabled가 true일 때만 처리
    if (!currentSlide?.autoAdvance?.enabled || !currentSlide.autoAdvance?.triggerAfterInteraction) {
      return;
    }

    // 다음 스텝 모듈이 있는지 확인
    const nextStepModules = currentSlide.modules.filter(
      (m) => m.visibility.type === 'step' && m.visibility.value === curSlideStep[curSlideIndex] + 1
    );

    // 다음 스텝 모듈이 없고, 현재 스텝이 1보다 크면 (마지막 스텝 완료) 자동 전환 시작
    if (nextStepModules.length === 0 && curSlideStep[curSlideIndex] > 1) {
      const duration = currentSlide.autoAdvance.duration || 3000;
      // 모듈 렌더링 완료를 위해 약간의 딜레이 후 시작
      const startDelay = setTimeout(() => {
        clearAutoAdvanceTimer();
        
        // 프로그레스 애니메이션
        progressAnimationRef.current.setValue(0);
        Animated.timing(progressAnimationRef.current, {
          toValue: 1,
          duration,
          easing: Easing.linear,
          useNativeDriver: false,
        }).start();

        // 리스너 추가 (중복 방지)
        if (!progressListenerIdRef.current) {
          progressListenerIdRef.current = progressAnimationRef.current.addListener(({ value }) => {
            setAutoAdvanceProgress(value);
          });
        }

        // 자동 다음 슬라이드
        autoAdvanceTimerRef.current = setTimeout(() => {
          if (hasNextSlide) {
            setCurSlideIndex(prev => prev + 1);
            setIsNextButtonEnabled(true);
            scrollViewRef.current?.scrollTo({ y: 0, animated: false });
          } else {
            console.log('🎉 레슨 완료!');
            navigation.goBack();
          }
        }, duration);
      }, 300);

      return () => {
        clearTimeout(startDelay);
      };
    }
  }, [curSlideStep, curSlideIndex, currentSlide, hasNextSlide, clearAutoAdvanceTimer, navigation]);

  // TTS 큐 재생 관리
  useEffect(() => {
    // 재생 중이거나 큐가 비어있으면 무시
    if (isPlaying || ttsQueue.length === 0) return;

    // 첫 번째 TTS 재생 시작
    const nextUrl = ttsQueue[0];
    setCurrentUrl(nextUrl);
    setIsPlaying(true);

    // trigger가 "tts"인 경우, TTS 시작과 함께 프로그레스 바 애니메이션 시작
    if (currentSlide?.autoAdvance?.enabled && (currentSlide.autoAdvance as any).trigger === 'tts') {
      console.log('🎵 TTS 프로그레스 바 애니메이션 시작');
      // TTS 길이를 모르므로 충분히 긴 시간으로 설정 (실제 TTS가 끝나면 handleTtsEnd에서 처리)
      const estimatedDuration = 15000; // 15초로 가정
      
      progressAnimationRef.current.setValue(0);
      
      // 리스너 추가 (중복 방지)
      if (!progressListenerIdRef.current) {
        progressListenerIdRef.current = progressAnimationRef.current.addListener(({ value }) => {
          setAutoAdvanceProgress(value);
        });
      }

      // 애니메이션 시작
      Animated.timing(progressAnimationRef.current, {
        toValue: 0.9, // 90%까지만 채움 (나머지는 TTS 끝날 때 채움)
        duration: estimatedDuration,
        easing: Easing.linear,
        useNativeDriver: false,
      }).start();
    }
  }, [ttsQueue, isPlaying, currentSlide]);

  // =========================
  // 🛠 핸들러 함수
  // =========================

  const handleLessonComplete = useCallback(() => {
    console.log('🎉 레슨 완료!');
    navigation.goBack();
  }, [navigation]);

  /**
   * 📌 handleNextSlide: 다음 슬라이드로 이동
   * - canGoNext 체크 없음 (이미 호출하는 곳에서 체크함)
   */
  const handleNextSlide = useCallback(() => {
    if (hasNextSlide) {
      setCurSlideIndex(prev => prev + 1);
      setIsNextButtonEnabled(true);
      scrollViewRef.current?.scrollTo({ y: 0, animated: false });
    } else {
      // 마지막 슬라이드면 학습 완료
      handleLessonComplete();
    }
  }, [hasNextSlide, handleLessonComplete]);

  /**
   * 📌 handlePrevSlide: 이전 슬라이드로 이동 (제약 없음)
   */
  const handlePrevSlide = useCallback(() => {
    if (curSlideIndex > 0) {
      setCurSlideIndex(prev => prev - 1);
      setIsNextButtonEnabled(true);
      scrollViewRef.current?.scrollTo({ y: 0, animated: false });
    }
  }, [curSlideIndex]);

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
      // (버튼 클릭 등으로 호출되므로 canGoNext와 무관)
      handleNextSlide();
    }
  }, [curSlideIndex, getNextStepModules, hasProblemModule, handleNextSlide]);

  // TTS 핸들러 함수들
  const handleTtsError = useCallback((err: any) => {
    console.warn('TTS 재생 오류:', err);
    setIsPlaying(false);
    // 다음 TTS 재생 시도
    setTtsQueue(prev => {
      if (prev.length > 1) {
        return prev.slice(1);
      } else {
        setCurrentUrl(null);
        return [];
      }
    });
  }, []);

  const handleTtsEnd = useCallback(() => {
    setIsPlaying(false);
    // 다음 TTS 재생
    setTtsQueue(prev => {
      if (prev.length > 1) {
        return prev.slice(1);
      } else {
        setCurrentUrl(null);
        
        // TTS 큐가 모두 끝났고, trigger가 "tts"인 경우 자동으로 다음 슬라이드로
        if (currentSlide?.autoAdvance?.enabled && (currentSlide.autoAdvance as any).trigger === 'tts') {
          console.log('✅ TTS 완료 - 프로그레스 바 마무리');
          const minDuration = (currentSlide.autoAdvance as any).minDuration || 0;
          
          // 리스너는 이미 추가되어 있음 (중복 방지)
          
          Animated.timing(progressAnimationRef.current, {
            toValue: 1,
            duration: minDuration,
            easing: Easing.linear,
            useNativeDriver: false,
          }).start(() => {
            // 애니메이션 완료 후 다음 슬라이드로
            handleNextSlide();
          });
        }
        
        return [];
      }
    });
  }, [currentSlide, handleNextSlide]);

  const handleExitPress = useCallback(() => {
    clearAutoAdvanceTimer();
    navigation.goBack();
  }, [clearAutoAdvanceTimer, navigation]);

  const handleActionButtonPress = useCallback(async (buttonId: string, action?: any) => {
    if (action?.type === 'executeCode') {
      const { s3Path, targetWebViewId } = action;
      // 항상 새로운 프리뷰 URL 요청 (forceRefresh: true)
      return await executeCodePreview(s3Path, targetWebViewId, true);
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

    // 리스너 추가 (중복 방지)
    if (!progressListenerIdRef.current) {
      progressListenerIdRef.current = progressAnimationRef.current.addListener(({ value }) => {
        setAutoAdvanceProgress(value);
      });
    }

    // 자동 다음 슬라이드
    autoAdvanceTimerRef.current = setTimeout(() => {
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
  // 🎮 제스처 핸들러
  // =========================

  /**
   * 📌 handleSwipe: 스와이프 제스처 처리 (JS 쓰레드에서 실행)
   */
  const handleSwipe = useCallback((translationX: number) => {
    if (translationX > 0) {
      // 오른쪽 스와이프 → 이전 슬라이드
      console.log('👉 이전 슬라이드로 이동');
      handlePrevSlide();
    } else {
      // 왼쪽 스와이프 → 다음 슬라이드 (canGoNext 체크)
      if (canGoNext(currentSlide)) {
        console.log('👈 다음 슬라이드로 이동');
        handleNextSlide();
      } else {
        console.log('⛔ 상호작용 필요: 다음 슬라이드 이동 불가');
      }
    }
  }, [currentSlide, handlePrevSlide, handleNextSlide, canGoNext]);

  /**
   * 📌 handleTap: 탭 제스처 처리 (JS 쓰레드에서 실행)
   */
  const handleTap = useCallback(() => {
    if (currentSlide?.autoAdvance?.enabled) {
      console.log('👆 탭: pause/resume 토글');
      togglePauseResume();
    }
  }, [currentSlide, togglePauseResume]);

  /**
   * 📌 Pan Gesture: 좌/우 스와이프로 슬라이드 이동
   * - 오른쪽 스와이프 (dx > 0): 이전 슬라이드
   * - 왼쪽 스와이프 (dx < 0): 다음 슬라이드 (canGoNext 체크)
   * - 임계값: 가로 이동 50px 이상, 가로 > 세로
   */
  const panGesture = Gesture.Pan()
    .onEnd((event) => {
      'worklet';
      const { translationX, translationY } = event;
      const SWIPE_THRESHOLD = 50; // 스와이프 임계값 (px)

      // 가로 이동이 세로 이동보다 크고, 임계값 이상이면 스와이프로 인식
      if (Math.abs(translationX) > Math.abs(translationY) && Math.abs(translationX) > SWIPE_THRESHOLD) {
        // UI 쓰레드에서 JS 쓰레드로 전환하여 함수 실행
        runOnJS(handleSwipe)(translationX);
      }
    });

  /**
   * 📌 Tap Gesture: 화면 탭으로 일시정지/재생 토글
   * - 상호작용 영역(버튼, 입력창 등)은 자동으로 제외됨
   *   (React Native의 터치 우선순위에 의해 버튼 등의 터치 이벤트가 먼저 처리됨)
   * - 여백 영역에서만 pause/resume 동작
   */
  const tapGesture = Gesture.Tap()
    .maxDistance(10) // 탭 판정 거리 (드래그와 구분)
    .onEnd(() => {
      'worklet';
      // UI 쓰레드에서 JS 쓰레드로 전환하여 함수 실행
      runOnJS(handleTap)();
    });

  /**
   * 📌 Gesture 통합: Pan과 Tap을 동시에 감지
   * - Pan이 우선 (스와이프 중에는 탭 무시)
   */
  const composedGesture = Gesture.Race(panGesture, tapGesture);

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
    <GestureHandlerRootView style={{ flex: 1 }}>
      <GestureDetector gesture={composedGesture}>
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
                  executeCodePreview={executeCodePreview}
                  currentSlideModules={currentSlide.modules}
                />
              </View>
            );
          })}
        </View>
      </ScrollView>

        {/* TTS 오디오 플레이어 */}
        {currentUrl && (
          <AudioPlayer
            audioUrl={currentUrl}
            paused={isPaused} // pause/resume 제어
            onLoadComplete={() => {}}
            onError={handleTtsError}
            onEnd={handleTtsEnd}
          />
        )}
        </SafeAreaView>
      </GestureDetector>
    </GestureHandlerRootView>
  );
};

export default LessonLearningScreenV4;
