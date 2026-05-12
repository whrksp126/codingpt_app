import React, { useEffect, useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Dimensions, StatusBar, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScrollView } from 'react-native-gesture-handler';

import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../contexts/ThemeContext';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { runOnJS, useSharedValue, withSpring } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import DefaultIconBtn from '../../components/Button/DefaultIconBtn';
import DefaultBtn from '../../components/Button/DefaultBtn';
import { X, Play, Pause } from '../../assets/SvgIcon';
import GestureIndicatorOverlay from '../../components/GestureIndicatorOverlay';

// 모듈 컴포넌트들
import { ParagraghComponentV2 } from '../../components/module/ParagraghV2';
import { PictureComponent } from '../../components/module/Picture';
import { WebViewComponent } from '../../components/module/WebView';
import { CodeComponent } from '../../components/module/Code';
import { CodeFillTheGapV2Component } from '../../components/module/CodeFillTheGapV2';
import { MultipleChoiceComponent } from '../../components/module/MultipleChoice';
import { TrueFalseChoiceComponent } from '../../components/module/TrueFalseChoice';
import { CharacterSpeechBubbleComponent } from '../../components/module/CharacterSpeechBubble';
import { MissionListComponent } from '../../components/module/MissionList';
import { TagDescriptionListComponent } from '../../components/module/TagDescriptionList';
import { HighlightParagraph } from '../../components/module/HighlightParagraph';
import { TerminalComponent } from '../../components/module/Terminal';

import { AudioPlayer } from '../../components/AudioPlayer';
import lessonService from '../../services/lessonService';
import { prefetchLessonAssets } from '../../utils/lessonPrefetch';

// html_00.json 데이터 import
import html_01 from '../../data/html_lesson/html_01.json';
import html_02 from '../../data/html_lesson/html_02.json';
import html_03 from '../../data/html_lesson/html_03.json';
import html_04 from '../../data/html_lesson/html_04.json';
import html_05 from '../../data/html_lesson/html_05.json';
import html_06 from '../../data/html_lesson/html_06.json';
import html_07 from '../../data/html_lesson/html_07.json';
import html_08 from '../../data/html_lesson/html_08.json';
import html_09 from '../../data/html_lesson/html_09.json';
import html_10 from '../../data/html_lesson/html_10.json';
import code_fill_test from '../../data/html_lesson/code_fill_test.json';
// css_00.json 데이터 import
import css_01 from '../../data/css_lesson/css_01.json';
import css_02 from '../../data/css_lesson/css_02.json';
import css_03 from '../../data/css_lesson/css_03.json';
import css_04 from '../../data/css_lesson/css_04.json';
import css_05 from '../../data/css_lesson/css_05.json';
import css_06 from '../../data/css_lesson/css_06.json';
import css_07 from '../../data/css_lesson/css_07.json';
import css_08 from '../../data/css_lesson/css_08.json';
import css_09 from '../../data/css_lesson/css_09.json';
import css_10 from '../../data/css_lesson/css_10.json';
// java_01.json 데이터 import
import java_terminal from '../../data/java_lesson/java_terminal.json';
import java_05 from '../../data/java_lesson/java_05.json';
// js_00.json 데이터 import
import code_auto_execute from '../../data/js_lesson/code_auto_execute.json';
import js_01 from '../../data/js_lesson/js_01.json';
import js_02 from '../../data/js_lesson/js_02.json';
import js_03 from '../../data/js_lesson/js_03.json';
import js_04 from '../../data/js_lesson/js_04.json';
import js_05 from '../../data/js_lesson/js_05.json';
import js_06 from '../../data/js_lesson/js_06.json';

interface VisibilityConfig {
  type: string;
  time?: number; // duration time
  showDelay?: number; // legacy support if needed
  hideDelay?: number;
  value?: number;
}

interface Speech {
  id: number;
  content?: string;
  image?: string;
  showCharacter?: boolean;
  visibility?: VisibilityConfig;
  tts?: string | { url: string; timestamps?: any };
  character?: {
    image: string;
    size?: { width: number; height: number };
  };
}

interface Module {
  id: number;
  type: 'paragraph' | 'webview' | 'code' | 'characterSpeechBubble' | 'missionList' | 'tagDescriptionList' | 'multipleChoice' | 'trueFalseChoice' | 'codeFillTheGapV2' | 'image' | 'terminal';
  displayType?: 'full' | 'profile';
  content?: string;
  src?: string;
  size?: 'sm' | 'md' | 'lg' | { width: number; height: number };
  alignX?: 'left' | 'center' | 'right';
  aspectRatio?: number;
  fit?: 'contain' | 'cover';
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
    content?: string;
    image?: string;
  };
  speeches?: Speech[]; // 여러 개의 말풍선
  showCharacter?: boolean; // 캐릭터 표시 여부
  title?: string; // missionList 제목
  items?: Array<{
    id: number;
    text: string;
    visibility?: VisibilityConfig;
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
  tts?: string | { url: string; timestamps?: any };
}

interface Slider {
  id: number;
  title: string;
  role?: string;
  background?: {
    colors: string[]; // HEX 또는 rgba
    locations?: number[]; // 0~1 사이의 위치 배열
    angle?: number; // 0~360도
  };
  modules: Module[];
}

interface Lesson {
  id: number;
  title: string;
  isCompleted: boolean;
  sliders: Slider[];
}

const LessonLearningScreenV5: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute();
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';

  // 학습 페이지: 슬라이드 배경이 밝아 항상 dark-content로 강제.
  // 화면 포커스가 떠나면 시스템 테마에 맞는 기본값으로 복원하여 다른 화면에 누수되지 않도록 한다.
  useFocusEffect(
    useCallback(() => {
      StatusBar.setBarStyle('dark-content', true);
      if (Platform.OS === 'android') {
        StatusBar.setBackgroundColor('transparent');
        StatusBar.setTranslucent(true);
      }
      return () => {
        StatusBar.setBarStyle(isDark ? 'light-content' : 'dark-content', true);
      };
    }, [isDark])
  );
  const scrollViewRef = useRef<ScrollView>(null);
  const modulePositionsRef = useRef<Record<number, number>>({});
  const { height: SCREEN_HEIGHT } = Dimensions.get('window');
  const [visibleModules, setVisibleModules] = useState<Set<number>>(new Set());
  const [isLastButtonVisible, setIsLastButtonVisible] = useState(false);
  const [visibleSpeechIds, setVisibleSpeechIds] = useState<Set<string>>(new Set()); // moduleId-speechId 형태
  const [visibleMissionItemIds, setVisibleMissionItemIds] = useState<Set<string>>(new Set()); // moduleId-missionItemId 형태
  const [currentSliderIndex, setCurrentSliderIndex] = useState(0);
  // 각 슬라이더별로 표시된 모듈 ID 목록을 저장 (깜빡임 방지)
  const [sliderVisibleModules, setSliderVisibleModules] = useState<Map<number, Set<number>>>(new Map());
  const [sliderVisibleSpeechIds, setSliderVisibleSpeechIds] = useState<Map<number, Set<string>>>(new Map());
  const [sliderVisibleMissionItemIds, setSliderVisibleMissionItemIds] = useState<Map<number, Set<string>>>(new Map());
  const timeoutRefs = useRef<NodeJS.Timeout[]>([]);
  // 자동 슬라이드 넘김 타이머
  const autoAdvanceTimerRef = useRef<NodeJS.Timeout | null>(null);
  // 일시정지/재생 관련 상태
  const [isPaused, setIsPaused] = useState(false);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const [currentAudioUrl, setCurrentAudioUrl] = useState<string>('');
  const [currentAudioTime, setCurrentAudioTime] = useState(0);
  const [maxReachedIndex, setMaxReachedIndex] = useState(0);
  const terminalRefs = useRef<Record<number, any>>({});

  // 슬라이드 변경 시 maxReachedIndex 업데이트
  useEffect(() => {
    if (currentSliderIndex > maxReachedIndex) {
      setMaxReachedIndex(currentSliderIndex);
    }
  }, [currentSliderIndex, maxReachedIndex]);

  const playTTS = useCallback((ttsData?: string | { url: string; enabled?: boolean }) => {
    if (!ttsData) {
      console.log('playTTS: ttsData가 없습니다');
      return;
    }
    // 관리자에서 TTS 토글을 OFF 한 경우(enabled:false)는 백엔드가 strip 하지만,
    // 누락 시 backstop 으로 RN 에서도 한 번 더 막는다.
    if (typeof ttsData === 'object' && ttsData.enabled === false) {
      console.log('playTTS: TTS가 비활성화되어 있습니다');
      return;
    }
    const url = typeof ttsData === 'string' ? ttsData : ttsData.url;
    console.log('playTTS 호출:', url);
    if (url && url.trim() !== '') {
      setCurrentAudioUrl(url);
    } else {
      console.log('playTTS: URL이 비어있습니다');
    }
  }, []);
  const pausedAtRef = useRef<number | null>(null); // pause 시작 시각 (타임스탬프)
  const timerStartTimeRef = useRef<number | null>(null); // 타이머 시작 시각
  const timerDurationRef = useRef<number | null>(null); // 타이머 전체 지속 시간

  /**
   * 📌 scrollToModule: 특정 모듈로 스크롤하여 화면 중앙에 배치
   * - 첫 번째 모듈(index 0)은 상단 고정
   * - 두 번째 모듈부터는 모듈의 상단이 화면의 중앙에 위치하도록 스크롤
   */
  const scrollToModule = useCallback((moduleId: number, index: number) => {
    const yPos = modulePositionsRef.current[moduleId];
    if (yPos === undefined || !scrollViewRef.current) return;

    if (index === 0) {
      scrollViewRef.current.scrollTo({ y: 0, animated: true });
    } else {
      // 모듈의 상단이 화면 중앙에 위치하도록 계산
      // yPos: 스크롤 뷰 내에서의 모듈 Y 좌표
      // SCREEN_HEIGHT / 2: 화면 높이의 절반만큼 위로 올려서 상단이 중앙에 오게 함
      const targetY = Math.max(0, yPos - SCREEN_HEIGHT / 2 + 100); // 100은 여유 공간(헤더 등 고려)
      scrollViewRef.current.scrollTo({ y: targetY, animated: true });
    }
  }, [SCREEN_HEIGHT]);

  // 모듈/말풍선 렌더링 타이머 추적 (일시정지/재생 지원)
  const moduleTimersRef = useRef<Array<{
    timeout: NodeJS.Timeout | null;
    startTime: number;
    delay: number;
    moduleId: number;
    speechId?: number;
    missionItemId?: number;
    type?: 'show' | 'duration'; // 'show': 표시 타이머, 'duration': duration 대기 타이머
    sliderIndex: number
  }>>([]);

  // =========================
  // 📌 레슨/슬라이드 관련 상태
  // =========================
  // 우선순위: route.params.lessonData(직접 주입) > route.params.lessonId(백엔드 API fetch) > html_01 fallback.
  // lessonId가 있으면 백엔드 /api/lesson/runtime/:id 로부터 DB 데이터를 가져와 교체한다.
  const [curLesson, setCurLesson] = useState<Lesson>(() => {
    const routeLessonData = (route.params as any)?.lessonData;
    if (routeLessonData) {
      if (routeLessonData.sliders) {
        return JSON.parse(JSON.stringify(routeLessonData));
      }
      const contents = routeLessonData?.Slides?.[0]?.contents;
      if (contents?.sliders) {
        return JSON.parse(JSON.stringify(contents));
      }
    }
    return JSON.parse(JSON.stringify(html_01.lessons[0]));
  });

  // lessonId가 있으면 백엔드 DB에서 최신 데이터를 가져와 항상 교체 (관리자 변경사항 반영)
  // lessonData가 함께 주어진 경우 그것을 즉시 부트스트랩으로 쓰고, fetch 완료 시 fresh data로 덮어쓴다.
  // 단, runtime 응답에는 lessonId/myclassId/sectionId 가 없으므로 route.params 또는 기존 curLesson 의
  // 메타 필드를 병합해서 보존한다 — LessonReport 에서 completeLessonWithResult 호출에 필요.
  useEffect(() => {
    const routeLessonId = (route.params as any)?.lessonId;
    const routeMyclassId = (route.params as any)?.myclassId;
    if (!routeLessonId) return;
    let cancelled = false;
    lessonService.getLessonRuntime(Number(routeLessonId)).then((data) => {
      if (cancelled || !data) return;
      setCurLesson((prev) => {
        const fresh = JSON.parse(JSON.stringify(data));
        return {
          ...fresh,
          lessonId: (prev as any)?.lessonId ?? Number(routeLessonId),
          myclassId: (prev as any)?.myclassId ?? routeMyclassId,
          sectionId: (prev as any)?.sectionId,
        };
      });
      setCurrentSliderIndex(0);
    });
    return () => { cancelled = true; };
  }, [route.params]);

  const currentSlider: Slider = curLesson.sliders[currentSliderIndex];

  // 레슨 진입 직후 모든 슬라이드의 이미지/오디오를 백그라운드 prefetch.
  // 첫 렌더 깜빡임을 줄이고 슬라이드 전환 시 자산을 즉시 표시하기 위함.
  useEffect(() => {
    prefetchLessonAssets(curLesson);
  }, [curLesson.id]);

  // =========================
  // 🔧 유틸리티 함수
  // =========================

  /**
   * 📌 hasQuizModule: 퀴즈 모듈(multipleChoice/trueFalseChoice/codeFillTheGapV2) 존재 여부 확인
   */
  const hasQuizModule = (modules: Module[]): boolean => {
    return modules.some(m => m.type === 'multipleChoice' || m.type === 'trueFalseChoice' || m.type === 'codeFillTheGapV2');
  };

  /**
   * 📌 isQuizCompleted: 퀴즈 모듈이 완료되었는지 확인
   * - 퀴즈 모듈이 없으면 true (완료로 간주)
   * - 퀴즈 모듈이 있으면 모든 질문이 제출되었는지 확인 (isCorrect가 null이 아니면 제출됨)
   * - result 모듈이 있으면 완료로 간주
   */
  const isQuizCompleted = useCallback((slider: Slider): boolean => {
    const quizModules = slider.modules.filter(m =>
      m.type === 'multipleChoice' ||
      m.type === 'trueFalseChoice' ||
      m.type === 'codeFillTheGapV2'
    );

    // 퀴즈 모듈이 없으면 완료로 간주
    if (quizModules.length === 0) {
      return true;
    }

    // 모든 퀴즈 모듈의 모든 질문이 제출되었는지 확인
    const allCompleted = quizModules.every(module => {
      if (module.type === 'multipleChoice' || module.type === 'trueFalseChoice') {
        const questions = module.questions || [];
        return questions.every((q: any) => q.answer?.isCorrect !== null && q.answer?.isCorrect !== undefined);
      }
      if (module.type === 'codeFillTheGapV2') {
        const answers = (module as any).answers || [];
        const requireAllCorrect = (module as any).requireAllCorrect || false;
        const hasCorrectIncorrectResult = !!((module as any).correctResult || (module as any).incorrectResult);

        // correctResult/incorrectResult가 있으면 채점 완료 시 제출 완료로 간주
        if (hasCorrectIncorrectResult) {
          return answers.every((ans: any) => ans.isCorrect !== null && ans.isCorrect !== undefined);
        }

        // requireAllCorrect가 true이면 모든 답이 정답이어야 함
        if (requireAllCorrect) {
          return answers.every((ans: any) => ans.isCorrect === true);
        }

        // 기본: 채점이 완료되었으면 완료로 간주
        return answers.every((ans: any) => ans.isCorrect !== null && ans.isCorrect !== undefined);
      }
      return true;
    });

    return allCompleted;
  }, []);

  /**
   * 📌 clearAutoAdvanceTimer: 자동 넘김 타이머만 정리
   */
  const clearAutoAdvanceTimer = useCallback(() => {
    if (autoAdvanceTimerRef.current) {
      clearTimeout(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = null;
    }
  }, []);

  /**
   * 📌 goToSlide: 슬라이드 인덱스 변경 + visible 상태 동기 리셋
   * - currentSliderIndex만 바꾸면, 같은 렌더 사이클에서 visibleModules는 이전 값으로 남아
   *   새 슬라이드의 모듈 중 ID가 겹치는 것이 잠깐 보였다 사라지는 깜빡임이 발생.
   * - 인덱스 변경과 함께 visible 상태도 같이 set해서, React 18의 자동 배칭으로 단일 렌더에 적용되도록 한다.
   */
  const goToSlide = useCallback((newIndex: number) => {
    const savedModules = sliderVisibleModules.get(newIndex);
    const savedSpeeches = sliderVisibleSpeechIds.get(newIndex);
    const savedMissions = sliderVisibleMissionItemIds.get(newIndex);

    setVisibleModules(savedModules ? new Set(savedModules) : new Set());
    setVisibleSpeechIds(savedSpeeches ? new Set(savedSpeeches) : new Set());
    setVisibleMissionItemIds(savedMissions ? new Set(savedMissions) : new Set());
    setCurrentSliderIndex(newIndex);
  }, [sliderVisibleModules, sliderVisibleSpeechIds, sliderVisibleMissionItemIds]);

  /**
   * 📌 resetAutoAdvanceState: 자동 넘김 관련 모든 상태 초기화
   */
  const resetAutoAdvanceState = useCallback(() => {
    clearAutoAdvanceTimer();
    setRemainingMs(null);
    pausedAtRef.current = null;
    timerStartTimeRef.current = null;
    timerDurationRef.current = null;
  }, [clearAutoAdvanceTimer]);

  /**
   * 📌 startAutoAdvance: 자동 슬라이드 넘김 시작
   * - 모든 모듈이 렌더링된 후 일정 시간(기본 2초) 후 다음 슬라이드로 이동
   * - pause/resume 지원
   */
  const startAutoAdvance = useCallback((delayAfterRender: number = 2000) => {
    // 마지막 슬라이드면 자동 넘김하지 않음
    if (currentSliderIndex >= curLesson.sliders.length - 1) {
      return;
    }

    // 일시정지 상태면 타이머를 시작하지 않음
    if (isPaused) {
      return;
    }

    clearAutoAdvanceTimer();

    // 타이머 시작 시간 및 지속 시간 저장
    timerStartTimeRef.current = Date.now();
    timerDurationRef.current = delayAfterRender;

    // 모든 모듈 렌더링 완료 후 일정 시간 대기 후 다음 슬라이드로
    autoAdvanceTimerRef.current = setTimeout(() => {
      goToSlide(currentSliderIndex + 1);
      scrollViewRef.current?.scrollTo({ y: 0, animated: false });
      clearAutoAdvanceTimer();
    }, delayAfterRender);
  }, [currentSliderIndex, curLesson.sliders.length, clearAutoAdvanceTimer, isPaused, goToSlide]);

  useEffect(() => {
    // 슬라이드 변경 시 자동 넘김 관련 모든 상태 초기화 (일시정지 포함)
    resetAutoAdvanceState();

    // 애니메이션 값 초기화
    translateX.value = 0;
    opacity.value = 1;

    // 이전 타이머들 정리
    timeoutRefs.current.forEach((timeout) => clearTimeout(timeout));
    timeoutRefs.current = [];

    // 현재 슬라이드의 모듈 렌더링 타이머만 정리 (다른 슬라이드 타이머는 유지)
    moduleTimersRef.current = moduleTimersRef.current.filter((timerInfo) => {
      if (timerInfo.sliderIndex === currentSliderIndex) {
        if (timerInfo.timeout) {
          clearTimeout(timerInfo.timeout);
        }
        return false; // 현재 슬라이드 타이머 제거
      }
      return true; // 다른 슬라이드 타이머 유지
    });

    const slider = curLesson.sliders[currentSliderIndex];
    if (!slider) return;

    // 현재 슬라이더가 이미 렌더링되었는지 확인
    const savedVisibleModules = sliderVisibleModules.get(currentSliderIndex);
    const savedVisibleSpeechIds = sliderVisibleSpeechIds.get(currentSliderIndex);
    const savedVisibleMissionItemIds = sliderVisibleMissionItemIds.get(currentSliderIndex);

    if (savedVisibleModules) {
      // 이미 일부 모듈이 렌더링된 슬라이더: 저장된 모듈은 즉시 표시
      setVisibleModules(new Set(savedVisibleModules));
      if (savedVisibleSpeechIds) {
        setVisibleSpeechIds(new Set(savedVisibleSpeechIds));
      }
      if (savedVisibleMissionItemIds) {
        setVisibleMissionItemIds(new Set(savedVisibleMissionItemIds));
      }
    } else {
      // 처음 렌더링하는 슬라이더: 빈 상태로 시작
      setVisibleModules(new Set());
      setVisibleSpeechIds(new Set());
      setVisibleMissionItemIds(new Set());
    }

    // 저장되지 않은 모듈들을 순차적으로 표시
    let cumulativeDelay = 0; // 누적 딜레이 시간

    // 슬라이드 내 첫 퀴즈(multipleChoice/trueFalseChoice/codeFillTheGapV2) 모듈 이후의 일반 모듈은
    // 채점 핸들러(handleMultipleChoiceSubmit/handleTrueFalseChoiceSubmit/handleCodeFillTheGapSubmit)가
    // result 모듈과 함께 직접 등장시키므로 여기서는 스케줄링에서 제외한다.
    const firstQuizIdx = slider.modules.findIndex(
      (m) => m.type === 'multipleChoice' || m.type === 'trueFalseChoice' || m.type === 'codeFillTheGapV2',
    );

    slider.modules.forEach((module, moduleIdx) => {
      if (firstQuizIdx !== -1 && moduleIdx > firstQuizIdx && !(module as any).manualRender) {
        return;
      }
      // 1. 현재 모듈(또는 말풍선 그룹)이 시작되는 시점 계산
      const currentModuleStartDelay = cumulativeDelay;

      // 2. 모듈의 Duration (다음 모듈이 나올 때까지의 시간) 계산
      // 기본적으로 visibility.time 사용, 없으면 0
      let moduleDuration = 0;
      if (module.visibility?.type === 'duration') {
        moduleDuration = module.visibility.time || 0;
      }

      // Speeches가 있는 경우 (characterSpeechBubble)
      if (module.type === 'characterSpeechBubble' && module.speeches) {
        // manualRender 플래그가 있으면 이펙트에서의 스케줄링 스킵 (submit handler에서 처리됨)
        if ((module as any).manualRender) {
          // 다음 모듈을 위해 duration만 누적 (필요한 경우)
          // result 모듈은 보통 마지막이므로 누적 여부가 크게 중요하지 않을 수 있으나,
          // 안전하게 누적 로직은 유지하거나, 아예 스킵해도 됨.
          // 여기서는 스킵.
          return;
        }

        // 0. 모듈(캐릭터/배경)은 즉시 등장해야 함 (딜레이 없이)
        if (!savedVisibleModules?.has(module.id)) {
          const moduleTimeout = setTimeout(() => {
            setVisibleModules((prev) => {
              if (prev.has(module.id)) return prev;
              const newSet = new Set(prev).add(module.id);
              setSliderVisibleModules((prevMap) => {
                const newMap = new Map(prevMap);
                const currentSet = newMap.get(currentSliderIndex) || new Set<number>();
                currentSet.add(module.id);
                newMap.set(currentSliderIndex, currentSet);
                return newMap;
              });
              return newSet;
            });
            setTimeout(() => {
              scrollToModule(module.id, slider.modules.findIndex(m => m.id === module.id));
            }, 100);
            if (module.tts) playTTS(module.tts);
            // 타이머 목록에서 이 표시 타이머 제거
            moduleTimersRef.current = moduleTimersRef.current.filter(t =>
              !(t.moduleId === module.id && t.type === 'show' && t.speechId === undefined)
            );
          }, currentModuleStartDelay);

          timeoutRefs.current.push(moduleTimeout);
          moduleTimersRef.current.push({
            timeout: moduleTimeout,
            startTime: Date.now(),
            delay: currentModuleStartDelay,
            moduleId: module.id,
            type: 'show',
            sliderIndex: currentSliderIndex
          });
        }

        // 1. 첫 번째 말풍선은 1초(1000ms) 후에 등장
        let speechCumulativeDelay = 1000;

        module.speeches.forEach((speech, speechIndex) => {
          // 말풍선 각각의 visibility.time을 duration으로 사용
          const speechDuration = (speech.visibility?.type === 'duration' ? speech.visibility.time : 0) || 0;

          const speechKey = `${module.id}-${speech.id}`;
          if (savedVisibleSpeechIds?.has(speechKey)) {
            // 이미 표시된 말풍선이면 누적 시간만 더함 (다음 말풍선 타이밍 위해)
            speechCumulativeDelay += speechDuration;
            return;
          }

          // 말풍선 표시 타이밍: 모듈 시작 시간 + 이 말풍선 이전까지의 말풍선 duration 합
          const showDelay = currentModuleStartDelay + speechCumulativeDelay;

          const timeout = setTimeout(() => {
            setVisibleSpeechIds((prev) => {
              const newSet = new Set(prev).add(speechKey);
              setSliderVisibleSpeechIds((prevMap) => {
                const newMap = new Map(prevMap);
                const currentSet = newMap.get(currentSliderIndex) || new Set<string>();
                currentSet.add(speechKey);
                newMap.set(currentSliderIndex, currentSet);
                return newMap;
              });
              return newSet;
            });

            // 모듈 자체 표시 로직은 위에서 별도로 처리했으므로 여기서는 말풍선만 처리하거나 안전장치로 둠
            // (이미 위에서 처리했으므로 생략 가능하나, 혹시 모를 타이밍 이슈 대비 유지하되 중복 실행은 setVisibleModules 내부 로직이 막아줌)
            setVisibleModules((prev) => {
              if (prev.has(module.id)) return prev;
              // ... (위와 동일 로직)
              const newSet = new Set(prev).add(module.id);
              setSliderVisibleModules((prevMap) => {
                const newMap = new Map(prevMap);
                const currentSet = newMap.get(currentSliderIndex) || new Set<number>();
                currentSet.add(module.id);
                newMap.set(currentSliderIndex, currentSet);
                return newMap;
              });
              return newSet;
            });

            setTimeout(() => {
              scrollToModule(module.id, slider.modules.findIndex(m => m.id === module.id));
            }, 100);
            if (speech.tts) playTTS(speech.tts);

            // 표시 타이머 제거
            moduleTimersRef.current = moduleTimersRef.current.filter(t =>
              !(t.moduleId === module.id && t.speechId === speech.id && t.type === 'show')
            );

            // duration 대기 타이머 추가 (마지막 말풍선이 아니고 duration이 있는 경우)
            if (speechDuration > 0 && speechIndex < module.speeches!.length - 1) {
              const durationTimeout = setTimeout(() => {
                // duration 타이머도 제거
                moduleTimersRef.current = moduleTimersRef.current.filter(t =>
                  !(t.moduleId === module.id && t.speechId === speech.id && t.type === 'duration')
                );
              }, speechDuration);

              timeoutRefs.current.push(durationTimeout);
              moduleTimersRef.current.push({
                timeout: durationTimeout,
                startTime: Date.now(),
                delay: speechDuration,
                moduleId: module.id,
                speechId: speech.id,
                type: 'duration',
                sliderIndex: currentSliderIndex
              });
            }

          }, showDelay);

          timeoutRefs.current.push(timeout);
          moduleTimersRef.current.push({
            timeout,
            startTime: Date.now(),
            delay: showDelay,
            moduleId: module.id,
            speechId: speech.id,
            type: 'show',
            sliderIndex: currentSliderIndex
          });

          // 다음 말풍선을 위해 duration 누적
          speechCumulativeDelay += speechDuration;
        });

        // 모듈의 총 Duration은 말풍선들의 총 Duration으로 간주
        moduleDuration = Math.max(moduleDuration, speechCumulativeDelay);

      } else if (module.type === 'missionList' && module.items) {
        // MissionList 인 경우: 아이템별 duration 처리

        // manualRender 플래그 체크
        if ((module as any).manualRender) {
          return;
        }

        // 0. 모듈(미션 프레임)은 즉시 등장
        if (!savedVisibleModules?.has(module.id)) {
          const moduleTimeout = setTimeout(() => {
            setVisibleModules((prev) => {
              if (prev.has(module.id)) return prev;
              const newSet = new Set(prev).add(module.id);
              setSliderVisibleModules((prevMap) => {
                const newMap = new Map(prevMap);
                const currentSet = newMap.get(currentSliderIndex) || new Set<number>();
                currentSet.add(module.id);
                newMap.set(currentSliderIndex, currentSet);
                return newMap;
              });
              return newSet;
            });
            setTimeout(() => {
              scrollToModule(module.id, slider.modules.findIndex(m => m.id === module.id));
            }, 100);
            if (module.tts) playTTS(module.tts);
            // 표시 타이머 제거
            moduleTimersRef.current = moduleTimersRef.current.filter(t =>
              !(t.moduleId === module.id && t.type === 'show' && t.missionItemId === undefined)
            );
          }, currentModuleStartDelay);

          timeoutRefs.current.push(moduleTimeout);
          moduleTimersRef.current.push({
            timeout: moduleTimeout,
            startTime: Date.now(),
            delay: currentModuleStartDelay,
            moduleId: module.id,
            type: 'show',
            sliderIndex: currentSliderIndex
          });
        }

        // 1. 첫 번째 미션 아이템은 1초(1000ms) 후에 등장
        let itemCumulativeDelay = 1000;

        module.items.forEach((item: any, itemIndex: number) => {
          // 아이템 각각의 visibility.time을 duration으로 사용
          const itemDuration = (item.visibility?.type === 'duration' ? item.visibility.time : 0) || 0;
          const itemKey = `${module.id}-${item.id}`;

          if (savedVisibleMissionItemIds?.has(itemKey)) {
            itemCumulativeDelay += itemDuration;
            return;
          }

          const showDelay = currentModuleStartDelay + itemCumulativeDelay;

          const timeout = setTimeout(() => {
            setVisibleMissionItemIds((prev) => {
              const newSet = new Set(prev).add(itemKey);
              setSliderVisibleMissionItemIds((prevMap) => {
                const newMap = new Map(prevMap);
                const currentSet = newMap.get(currentSliderIndex) || new Set<string>();
                currentSet.add(itemKey);
                newMap.set(currentSliderIndex, currentSet);
                return newMap;
              });
              return newSet;
            });

            // 모듈 자체도 표시 (안전장치)
            setVisibleModules((prev) => {
              if (prev.has(module.id)) return prev;
              const newSet = new Set(prev).add(module.id);
              setSliderVisibleModules((prevMap) => {
                const newMap = new Map(prevMap);
                const currentSet = newMap.get(currentSliderIndex) || new Set<number>();
                currentSet.add(module.id);
                newMap.set(currentSliderIndex, currentSet);
                return newMap;
              });
              return newSet;
            });

            setTimeout(() => {
              scrollToModule(module.id, slider.modules.findIndex(m => m.id === module.id));
            }, 100);

            // 표시 타이머 제거
            moduleTimersRef.current = moduleTimersRef.current.filter(t =>
              !(t.moduleId === module.id && t.missionItemId === item.id && t.type === 'show')
            );

            // duration 대기 타이머 추가 (마지막 아이템이 아니고 duration이 있는 경우)
            if (itemDuration > 0 && itemIndex < module.items!.length - 1) {
              const durationTimeout = setTimeout(() => {
                // duration 타이머도 제거
                moduleTimersRef.current = moduleTimersRef.current.filter(t =>
                  !(t.moduleId === module.id && t.missionItemId === item.id && t.type === 'duration')
                );
              }, itemDuration);

              timeoutRefs.current.push(durationTimeout);
              moduleTimersRef.current.push({
                timeout: durationTimeout,
                startTime: Date.now(),
                delay: itemDuration,
                moduleId: module.id,
                missionItemId: item.id,
                type: 'duration',
                sliderIndex: currentSliderIndex
              });
            }

          }, showDelay);

          timeoutRefs.current.push(timeout);
          moduleTimersRef.current.push({
            timeout,
            startTime: Date.now(),
            delay: showDelay,
            moduleId: module.id,
            missionItemId: item.id,
            type: 'show',
            sliderIndex: currentSliderIndex
          });

          itemCumulativeDelay += itemDuration;
        });

        // 모듈의 총 Duration은 아이템들의 총 Duration으로 간주 (또는 모듈 자체 duration과 비교)
        // 여기서는 아이템들의 합으로 처리
        moduleDuration = Math.max(moduleDuration, itemCumulativeDelay);

      } else {
        // 일반 모듈 (Speeches 없음)

        // manualRender 플래그 체크
        if ((module as any).manualRender) {
          return; // 스킵
        }

        if (savedVisibleModules?.has(module.id)) {
          // 이미 표시된 경우, 다음 모듈을 위해 duration만 누적하고 패스
          cumulativeDelay += moduleDuration;
          return;
        }

        const showDelay = currentModuleStartDelay;

        const timeout = setTimeout(() => {
          setVisibleModules((prev) => {
            const newSet = new Set(prev).add(module.id);
            setSliderVisibleModules((prevMap) => {
              const newMap = new Map(prevMap);
              const currentSet = newMap.get(currentSliderIndex) || new Set<number>();
              currentSet.add(module.id);
              newMap.set(currentSliderIndex, currentSet);
              return newMap;
            });
            return newSet;
          });
          setTimeout(() => {
            scrollToModule(module.id, slider.modules.findIndex(m => m.id === module.id));
          }, 100);
          playTTS(module.tts);

          // 표시 타이머 제거
          moduleTimersRef.current = moduleTimersRef.current.filter(t =>
            !(t.moduleId === module.id && t.type === 'show')
          );

          // duration 대기 타이머 추가 (duration이 있는 경우)
          if (moduleDuration > 0) {
            const durationTimeout = setTimeout(() => {
              // duration 타이머도 제거
              moduleTimersRef.current = moduleTimersRef.current.filter(t =>
                !(t.moduleId === module.id && t.type === 'duration')
              );
            }, moduleDuration);

            timeoutRefs.current.push(durationTimeout);
            moduleTimersRef.current.push({
              timeout: durationTimeout,
              startTime: Date.now(),
              delay: moduleDuration,
              moduleId: module.id,
              type: 'duration',
              sliderIndex: currentSliderIndex
            });
          }
        }, showDelay);

        timeoutRefs.current.push(timeout);
        moduleTimersRef.current.push({
          timeout,
          startTime: Date.now(),
          delay: showDelay,
          moduleId: module.id,
          type: 'show',
          sliderIndex: currentSliderIndex
        });
      }

      // 다음 모듈 시작 시간 = 현재 모듈 시작 시간 + 현재 모듈 duration
      cumulativeDelay += moduleDuration;
    });

    return () => {
      timeoutRefs.current.forEach((timeout) => clearTimeout(timeout));
      timeoutRefs.current = [];
      resetAutoAdvanceState();
    };
  }, [currentSliderIndex, curLesson.sliders, resetAutoAdvanceState, playTTS]);

  // 모든 모듈 렌더링 완료 감지 및 자동 넘김 시작
  useEffect(() => {
    const slider = curLesson.sliders[currentSliderIndex];
    if (!slider) return;

    const hasQuiz = hasQuizModule(slider.modules);
    if (hasQuiz) {
      const hasResultModules = slider.modules.some(m => m.visibility?.type === 'step');
      if (!hasResultModules) return;
    }

    // 단순화를 위해: 모든 모듈이 다 표시되었는지 체크
    const allRequiredVisible = slider.modules.every(m => {
      if (m.type === 'characterSpeechBubble' && m.speeches) {
        return m.speeches.every(s => visibleSpeechIds.has(`${m.id}-${s.id}`));
      }
      if (m.type === 'missionList' && m.items) {
        return m.items.every((item: any) => visibleMissionItemIds.has(`${m.id}-${item.id}`));
      }
      return visibleModules.has(m.id);
    });

    if (allRequiredVisible) {
      // 마지막 모듈의 duration 찾기
      const lastModule = slider.modules[slider.modules.length - 1];
      let lastDuration = 0;

      if (lastModule) {
        if (lastModule.type === 'characterSpeechBubble' && lastModule.speeches) {
          const lastSpeech = lastModule.speeches[lastModule.speeches.length - 1];
          lastDuration = (lastSpeech.visibility?.type === 'duration' ? lastSpeech.visibility.time : 0) || 0;
        } else if (lastModule.type === 'missionList' && lastModule.items) {
          // MissionList의 마지막 아이템 duration
          const lastItem = lastModule.items[lastModule.items.length - 1];
          lastDuration = (lastItem.visibility?.type === 'duration' ? lastItem.visibility.time : 0) || 0;
        } else {
          lastDuration = (lastModule.visibility?.type === 'duration' ? lastModule.visibility.time : 0) || 0;
        }
      }

      const waitTime = lastDuration > 0 ? lastDuration : 2000;

      if (currentSliderIndex === curLesson.sliders.length - 1) {
        // 마지막 슬라이드인 경우: waitTime 후 버튼 표시
        const timer = setTimeout(() => {
          setIsLastButtonVisible(true);
          scrollViewRef.current?.scrollToEnd({ animated: true });
        }, waitTime);
        timeoutRefs.current.push(timer);
      } else {
        startAutoAdvance(waitTime);
      }
    }

    return () => clearAutoAdvanceTimer();
  }, [visibleModules, visibleSpeechIds, visibleMissionItemIds, currentSliderIndex, curLesson.sliders, startAutoAdvance]);

  /**
   * 📌 pauseModuleRendering: 모듈 렌더링 일시정지
   */
  const pauseModuleRendering = useCallback(() => {
    const now = Date.now();
    moduleTimersRef.current.forEach((timerInfo) => {
      const elapsed = now - timerInfo.startTime;
      const remaining = timerInfo.delay - elapsed;

      if (remaining > 0) {
        // 타이머 취소
        if (timerInfo.timeout) {
          clearTimeout(timerInfo.timeout);
          // timeoutRefs에서도 제거
          timeoutRefs.current = timeoutRefs.current.filter(t => t !== timerInfo.timeout);
        }
        // 남은 시간 업데이트
        timerInfo.delay = remaining;
        // timeout 속성을 null로 설정 (재생 시 새로 생성)
        timerInfo.timeout = null;
      }
    });
  }, []);

  /**
   * 📌 resumeModuleRendering: 모듈 렌더링 재생
   */
  const resumeModuleRendering = useCallback(() => {
    const now = Date.now();
    const timersToResume = moduleTimersRef.current.filter(t => t.delay > 0);

    if (timersToResume.length === 0) {
      return;
    }

    const currentSlider = curLesson.sliders[currentSliderIndex];

    timersToResume.forEach((timerInfo) => {
      // 남은 시간으로 새 타이머 시작
      timerInfo.startTime = now;
      const sliderIndex = timerInfo.sliderIndex;
      const moduleId = timerInfo.moduleId;
      const delay = timerInfo.delay;
      const timerType = timerInfo.type;
      const speechId = timerInfo.speechId;
      const missionItemId = timerInfo.missionItemId;

      timerInfo.timeout = setTimeout(() => {
        if (timerType === 'duration') {
          // duration 타이머는 제거만 함
          moduleTimersRef.current = moduleTimersRef.current.filter(t =>
            !(t.moduleId === moduleId && t.speechId === speechId && t.missionItemId === missionItemId && t.type === 'duration')
          );
          return;
        }

        // 'show' 타이머: 모듈/말풍선/아이템 표시
        const speechKey = speechId !== undefined ? `${moduleId}-${speechId}` : null;
        const missionItemKey = missionItemId !== undefined ? `${moduleId}-${missionItemId}` : null;

        if (speechKey) {
          setVisibleSpeechIds((prev) => {
            const newSet = new Set(prev).add(speechKey);
            setSliderVisibleSpeechIds((prevMap) => {
              const newMap = new Map(prevMap);
              const currentSet = newMap.get(sliderIndex) || new Set<string>();
              currentSet.add(speechKey);
              newMap.set(sliderIndex, currentSet);
              return newMap;
            });
            return newSet;
          });

          // TTS 재생 (speech)
          const module = currentSlider?.modules.find(m => m.id === moduleId);
          if (module?.type === 'characterSpeechBubble' && module.speeches) {
            const speech = module.speeches.find(s => s.id === speechId);
            if (speech?.tts) {
              playTTS(speech.tts);
            }
          }
        }

        if (missionItemKey) {
          setVisibleMissionItemIds((prev) => {
            const newSet = new Set(prev).add(missionItemKey);
            setSliderVisibleMissionItemIds((prevMap) => {
              const newMap = new Map(prevMap);
              const currentSet = newMap.get(sliderIndex) || new Set<string>();
              currentSet.add(missionItemKey);
              newMap.set(sliderIndex, currentSet);
              return newMap;
            });
            return newSet;
          });
        }

        setVisibleModules((prev) => {
          const newSet = new Set(prev).add(moduleId);
          setSliderVisibleModules((prevMap) => {
            const newMap = new Map(prevMap);
            const currentSet = newMap.get(sliderIndex) || new Set<number>();
            currentSet.add(moduleId);
            newMap.set(sliderIndex, currentSet);
            return newMap;
          });
          return newSet;
        });

        // TTS 재생 (module)
        if (!speechKey && !missionItemKey) {
          const module = currentSlider?.modules.find(m => m.id === moduleId);
          if (module?.tts) {
            playTTS(module.tts);
          }
        }

        // 스크롤 중앙으로
        setTimeout(() => {
          scrollToModule(moduleId, curLesson.sliders[currentSliderIndex].modules.findIndex(m => m.id === moduleId));
        }, 100);

        // 표시 타이머 목록에서 제거
        moduleTimersRef.current = moduleTimersRef.current.filter(t =>
          !(t.moduleId === moduleId && t.speechId === speechId && t.missionItemId === missionItemId && t.type === 'show')
        );
      }, delay);
      timeoutRefs.current.push(timerInfo.timeout);
    });
  }, [currentSliderIndex, curLesson.sliders, playTTS]);

  /**
   * 📌 pauseAutoAdvance: 자동 넘김 일시정지
   * - 현재 진행률 저장
   * - 남은 시간 계산
   * - 타이머 중지
   */
  const pauseAutoAdvance = useCallback(() => {
    if (isPaused) {
      return;
    }

    // 모듈 렌더링 타이머가 있으면 모듈 렌더링 일시정지
    if (moduleTimersRef.current.length > 0) {
      pauseModuleRendering();
      setIsPaused(true);
      pausedAtRef.current = Date.now();
      return;
    }

    // 자동 넘김 타이머가 있으면 일시정지
    if (autoAdvanceTimerRef.current && timerStartTimeRef.current && timerDurationRef.current) {
      const elapsed = Date.now() - timerStartTimeRef.current;
      const remaining = timerDurationRef.current - elapsed;

      if (remaining > 0) {
        // 타이머 제거
        clearTimeout(autoAdvanceTimerRef.current);
        autoAdvanceTimerRef.current = null;

        // pause 상태 저장
        setIsPaused(true);
        setRemainingMs(remaining);
        pausedAtRef.current = Date.now();
      }
    }
  }, [isPaused, pauseModuleRendering]);

  /**
   * 📌 resumeAutoAdvance: 자동 넘김 재개
   * - 저장된 남은 시간으로 타이머 재시작
   */
  const resumeAutoAdvance = useCallback(() => {
    if (!isPaused) {
      return;
    }

    // 마지막 슬라이드면 재개하지 않음
    if (currentSliderIndex >= curLesson.sliders.length - 1) {
      return;
    }

    // 모듈 렌더링 타이머가 있으면 모듈 렌더링 재생
    if (moduleTimersRef.current.length > 0) {
      resumeModuleRendering();
      setIsPaused(false);
      pausedAtRef.current = null;
      return;
    }

    // 자동 넘김 타이머 재시작
    if (remainingMs !== null && remainingMs > 0) {
      timerStartTimeRef.current = Date.now();
      timerDurationRef.current = remainingMs;

      autoAdvanceTimerRef.current = setTimeout(() => {
        goToSlide(currentSliderIndex + 1);
        scrollViewRef.current?.scrollTo({ y: 0, animated: false });
        clearAutoAdvanceTimer();
      }, remainingMs);

      // pause 상태 해제
      setIsPaused(false);
      setRemainingMs(null);
      pausedAtRef.current = null;
    } else {
      // 타이머가 없고 남은 시간도 없으면 일시정지 상태만 해제
      setIsPaused(false);
      pausedAtRef.current = null;
    }
  }, [isPaused, remainingMs, currentSliderIndex, curLesson.sliders.length, clearAutoAdvanceTimer, resumeModuleRendering, goToSlide]);

  /**
   * 📌 togglePauseResume: 탭으로 일시정지/재생 토글
   */
  const togglePauseResume = useCallback(() => {
    // 마지막 슬라이드면 동작하지 않음
    if (currentSliderIndex >= curLesson.sliders.length - 1) {
      return;
    }

    // 모듈 렌더링 중이거나 자동 넘김 타이머가 있거나 일시정지 상태면 동작
    const hasModuleTimers = moduleTimersRef.current.length > 0;
    const hasAutoAdvanceTimer = autoAdvanceTimerRef.current !== null;
    const canToggle = hasModuleTimers || hasAutoAdvanceTimer || isPaused;

    if (!canToggle) {
      return;
    }

    if (isPaused) {
      resumeAutoAdvance();
    } else {
      pauseAutoAdvance();
    }
  }, [isPaused, currentSliderIndex, curLesson.sliders.length, pauseAutoAdvance, resumeAutoAdvance]);


  /**
   * 📌 handleSwipe: 스와이프 제스처 처리 (JS 쓰레드에서 실행)
   */
  const handleSwipe = useCallback((direction: 'left' | 'right') => {
    if (direction === 'left') {
      // 다음 슬라이드로 이동
      if (currentSliderIndex < curLesson.sliders.length - 1) {
        // 퀴즈 모듈이 있고 완료되지 않았으면 이동 차단
        if (hasQuizModule(currentSlider.modules) && !isQuizCompleted(currentSlider)) {
          return;
        }
        setIsPaused(true);
        goToSlide(currentSliderIndex + 1);
        scrollViewRef.current?.scrollTo({ y: 0, animated: false });
      }
    } else {
      // 이전 슬라이드로 이동 (항상 허용)
      if (currentSliderIndex > 0) {
        setIsPaused(true);
        goToSlide(currentSliderIndex - 1);
        scrollViewRef.current?.scrollTo({ y: 0, animated: false });
      }
    }
  }, [currentSliderIndex, curLesson.sliders, currentSlider, hasQuizModule, isQuizCompleted, goToSlide]);

  // Pan 제스처를 위한 shared values
  const translateX = useSharedValue(0);
  const opacity = useSharedValue(1);

  /**
   * 📌 Pan Gesture: 좌우 스와이프로 슬라이드 이동
   */
  const panGesture = Gesture.Pan()
    .activeOffsetX([-10, 10]) // 수평 방향으로 10픽셀 이상 이동해야 활성화
    .failOffsetY([-10, 10]) // 수직 방향으로 10픽셀 이상 이동하면 실패 (스크롤 우선)
    .onUpdate((e) => {
      'worklet';
      // 수평 이동만 처리
      translateX.value = e.translationX;
      // 이동 거리에 따라 약간의 투명도 변화 (선택사항)
      opacity.value = Math.max(0.95, 1 - Math.abs(e.translationX) / 1000);
    })
    .onEnd((e) => {
      'worklet';
      const threshold = 50; // 최소 이동 거리 (픽셀)

      if (Math.abs(e.translationX) > threshold) {
        if (e.translationX < 0) {
          // 왼쪽으로 스와이프: 다음 슬라이드
          runOnJS(handleSwipe)('left');
        } else {
          // 오른쪽으로 스와이프: 이전 슬라이드
          runOnJS(handleSwipe)('right');
        }
      }

      // 애니메이션으로 원래 위치로 복귀
      translateX.value = withSpring(0);
      opacity.value = withSpring(1);
    });

  /**
   * 📌 Tap Gesture 제거 (헤더 버튼으로 대체)
   */
  // const tapGesture = Gesture.Tap() ... 제거됨

  // 제스처 조합 (좌우 스와이프만 유지)
  const composedGesture = panGesture;

  const handleExitPress = () => {
    clearAutoAdvanceTimer();
    navigation.goBack();
  };

  /**
   * 📌 handleLessonComplete: 마지막 슬라이드에서 학습 완료 처리
   * - LessonReportPage로 이동하면서 isCompleted: true 마킹
   * - LessonReportPage 내부에서 completeLessonWithResult API 호출 → 서버 저장
   */
  const handleLessonComplete = useCallback(() => {
    clearAutoAdvanceTimer();
    (navigation as any).navigate('LessonReport', {
      curLesson: {
        ...curLesson,
        isCompleted: true,
        completedAt: new Date().toISOString(),
      },
    });
  }, [navigation, curLesson, clearAutoAdvanceTimer]);

  // 퀴즈 채점 완료 후 (1) condition 으로 result 모듈을 필터링하여 퀴즈 직후에 insert,
  // (2) result 모듈 → 퀴즈 이후 원래 모듈 순으로 순차 등장, (3) 모두 끝나면 다음 슬라이드 자동 진행.
  // multipleChoice / trueFalseChoice 공용.
  const runQuizPostGradingSequence = (
    problemModule: any,
    expectedType: 'multipleChoice' | 'trueFalseChoice',
  ) => {
    if (!problemModule || problemModule.type !== expectedType) {
      return;
    }

    // 사용자의 정답 여부 (questions 모두 정답이면 true)
    const questions = problemModule.questions || [];
    const isCorrect = questions.length > 0 && questions.every(
      (q: any) => q.answer?.isCorrect === true,
    );

    // condition 필터 — undefined/legacy 'always'는 항상 등장으로 호환 처리
    const allResultModules = (problemModule.result?.modules) || [];
    const filteredResultModules = allResultModules.filter((m: any) => {
      if (m.condition === 'correct') return isCorrect;
      if (m.condition === 'wrong') return !isCorrect;
      return true;
    });

    // 현재 슬라이더의 퀴즈 인덱스와, 퀴즈 이후의 원래(=manualRender 아닌) 모듈들
    const quizIdx = currentSlider.modules.findIndex((m) => m.id === problemModule.id);
    const remainingOriginalModules = currentSlider.modules
      .slice(quizIdx + 1)
      .filter((m: any) => !m.manualRender);

    const resultModulesWithFlag = filteredResultModules.map((m: any) => ({
      ...m,
      manualRender: true,
    }));

    // result 모듈을 퀴즈 바로 다음에 insert (시각적 순서: 퀴즈 → result → 원래 모듈)
    if (resultModulesWithFlag.length > 0) {
      const newLesson = { ...curLesson };
      const newSliders = [...newLesson.sliders];
      const originalModules = [...newSliders[currentSliderIndex].modules];
      const insertIdx = quizIdx + 1;
      const newModulesArray = [
        ...originalModules.slice(0, insertIdx),
        ...resultModulesWithFlag,
        ...originalModules.slice(insertIdx),
      ];
      newSliders[currentSliderIndex] = {
        ...newSliders[currentSliderIndex],
        modules: newModulesArray,
      };
      newLesson.sliders = newSliders;
      setCurLesson(newLesson);
    }

    // 순차 등장 시퀀스: result 모듈 → 퀴즈 이후 원래 모듈
    const sequence = [...resultModulesWithFlag, ...remainingOriginalModules];
    let cumulativeDelay = 0;

    sequence.forEach((mod: any) => {
      const showDelay = cumulativeDelay;
      let moduleDuration = mod.visibility?.type === 'duration' ? mod.visibility.time : 0;

      if (mod.speeches) {
        const totalSpeechDuration = mod.speeches.reduce((sum: number, speech: any) => {
          return sum + (speech.visibility?.type === 'duration' ? speech.visibility.time : 0);
        }, 0);
        moduleDuration = Math.max(moduleDuration, totalSpeechDuration);
      }

      setTimeout(() => {
        setVisibleModules((prev) => new Set(prev).add(mod.id));

        setSliderVisibleModules((prev) => {
          const newMap = new Map(prev);
          const currentSet = newMap.get(currentSliderIndex) || new Set<number>();
          currentSet.add(mod.id);
          newMap.set(currentSliderIndex, currentSet);
          return newMap;
        });

        if (mod.tts && !mod.speeches) {
          playTTS(mod.tts);
        }

        if (mod.speeches) {
          let speechCumulativeDelay = 0;
          mod.speeches.forEach((speech: any) => {
            const speechShowDelay = speechCumulativeDelay;
            const speechDuration = speech.visibility?.type === 'duration' ? speech.visibility.time : 0;
            setTimeout(() => {
              const speechKey = `${mod.id}-${speech.id}`;
              setVisibleSpeechIds((prev) => new Set(prev).add(speechKey));
              setSliderVisibleSpeechIds((prev) => {
                const newMap = new Map(prev);
                const currentSet = newMap.get(currentSliderIndex) || new Set<string>();
                currentSet.add(speechKey);
                newMap.set(currentSliderIndex, currentSet);
                return newMap;
              });
              if (speech.tts) {
                playTTS(speech.tts);
              }
            }, speechShowDelay);
            speechCumulativeDelay += speechDuration;
          });
        }

        // 스크롤 — 최신 슬라이더에서 인덱스 다시 조회 (insert 후 위치 보정)
        setTimeout(() => {
          const latestSlider = curLesson.sliders[currentSliderIndex];
          const idxInSlider = latestSlider?.modules.findIndex((m: any) => m.id === mod.id) ?? -1;
          scrollToModule(mod.id, idxInSlider);
        }, 100);
      }, showDelay);

      cumulativeDelay += moduleDuration;
    });

    // 일시정지 해제 + 자동 넘김 예약 (sequence가 비어 있어도 다음 슬라이드로 넘어가도록)
    setIsPaused(false);
    const delayAfterRender = 2000;
    setTimeout(() => {
      startAutoAdvance(cumulativeDelay + delayAfterRender);
    }, 0);
  };

  const handleMultipleChoiceSubmit = (completedModuleId: number) => {
    const problemModule = currentSlider.modules.find((m) => m.id === completedModuleId);
    runQuizPostGradingSequence(problemModule, 'multipleChoice');
  };

  // codeFillTheGapV2 완료 후 result 모듈 + 퀴즈 이후 원래 모듈을 순차 등장시킨다.
  // OX/사지선다(runQuizPostGradingSequence)와 동일한 흐름이되, codeFillTheGapV2 만의 특화 처리
  // (correctResult/incorrectResult 분기, {{userAnswer_X}} 치환, 터미널 스트림) 유지.
  const handleCodeFillTheGapSubmit = (completedModuleId: number, isCorrect: boolean = true) => {
    const problemModule = currentSlider.modules.find((m) => m.id === completedModuleId);
    if (!problemModule || problemModule.type !== 'codeFillTheGapV2') {
      return;
    }

    // 1. problemModule 내부의 answers 배열에서 사용자가 입력한 값들을 추출
    const userAnswers = (problemModule as any).answers?.map((ans: any) => ans.userAnswer || '') || [];

    // 2. result 추출 — correctResult/incorrectResult 가 있으면 isCorrect 에 따라 분기.
    //    셋 다 없으면 result 모듈은 비어있고, 퀴즈 이후 원래 모듈만 시퀀스.
    const hasAnyResult = (problemModule as any).result || (problemModule as any).correctResult || (problemModule as any).incorrectResult;
    let resultModules: any[] = [];
    if (hasAnyResult) {
      const result = isCorrect
        ? ((problemModule as any).correctResult || (problemModule as any).result)
        : ((problemModule as any).incorrectResult || (problemModule as any).result);
      resultModules = JSON.parse(JSON.stringify(result?.modules || []));

      // 3. resultModules 내부의 텍스트에 있는 {{userAnswer_X}} 를 실제 유저 입력값으로 치환
      const replacePlaceholders = (obj: any): any => {
        if (typeof obj === 'string') {
          return obj.replace(/\{\{userAnswer_(\d+)\}\}/g, (match, p1) => {
            const index = parseInt(p1, 10);
            return userAnswers[index] !== undefined ? userAnswers[index] : match;
          });
        } else if (Array.isArray(obj)) {
          return obj.map(item => replacePlaceholders(item));
        } else if (obj !== null && typeof obj === 'object') {
          const newObj: any = {};
          for (const key in obj) {
            newObj[key] = replacePlaceholders(obj[key]);
          }
          return newObj;
        }
        return obj;
      };
      resultModules = resultModules.map((mod: any) => replacePlaceholders(mod));
    }

    // result 모듈에는 수동 렌더 플래그
    const resultModulesWithFlag = resultModules.map((m: any) => ({ ...m, manualRender: true }));

    // 4. 현재 슬라이더 내 퀴즈 인덱스 + 퀴즈 이후의 원래(=manualRender 아닌) 모듈 계산
    const quizIdx = currentSlider.modules.findIndex((m) => m.id === problemModule.id);
    const remainingOriginalModules = currentSlider.modules
      .slice(quizIdx + 1)
      .filter((m: any) => !m.manualRender);

    // 5. result 모듈을 퀴즈 바로 다음에 insert (시각적 순서: 퀴즈 → result → 원래 모듈)
    if (resultModulesWithFlag.length > 0) {
      const newLesson = { ...curLesson };
      const newSliders = [...newLesson.sliders];
      const originalModules = [...newSliders[currentSliderIndex].modules];
      const insertIdx = quizIdx + 1;
      const newModulesArray = [
        ...originalModules.slice(0, insertIdx),
        ...resultModulesWithFlag,
        ...originalModules.slice(insertIdx),
      ];
      newSliders[currentSliderIndex] = {
        ...newSliders[currentSliderIndex],
        modules: newModulesArray,
      };
      newLesson.sliders = newSliders;
      setCurLesson(newLesson);
    }

    // --- [STEP 1] 백엔드 코드 실행 API 호출 (SSE 스트림) ---
    // 터미널 모듈을 찾아서 치환된 코드를 추출합니다.
    const terminalModule = resultModules.find((m: any) => m.type === 'terminal');
    if (terminalModule && terminalModule.script) {
      const inputStep = terminalModule.script.find((s: any) => s.type === 'input');
      if (inputStep) {
        const codeToExecute = inputStep.text;
        const language = terminalModule.language || 'js';

        // 터미널 WebView가 준비될 때까지 대기 후 스트림 시작
        const startStream = () => {
          lessonService.streamCodeExecution(
            codeToExecute,
            language,
            (data) => {
              console.log(`[HtmlLessonScreen] 📥 스트림 데이터 수신:`, data);

              // 데이터 추출 (data.data가 있는 경우만 처리)
              let text = data.data;
              if (!text) return;

              // output, error 타입만 터미널에 표시
              const isError = data.type === 'error';
              if (data.type !== 'output' && !isError) return;

              // xterm.js 줄바꿈 호환성 (\n -> \r\n)
              text = text.replace(/\n/g, '\r\n');

              const terminal = terminalRefs.current[terminalModule.id];
              console.log(`[HtmlLessonScreen] 🎯 터미널 전송 시도: ID=${terminalModule.id}, Ref존재=${!!terminal}, isError=${isError}, Text=${text.substring(0, 20)}`);

              if (terminal) {
                terminal.addStreamText(text, isError);
              } else {
                // 터미널 컴포넌트 마운트가 지연될 경우를 대비한 2차 방어 (버퍼링은 Terminal.tsx 내부에서 수행)
                console.warn(`[HtmlLessonScreen] ⏳ 터미널 Ref 미준비, 300ms 후 재시도...`);
                setTimeout(() => {
                  terminalRefs.current[terminalModule.id]?.addStreamText(text, isError);
                }, 300);
              }
            },
            (error) => {
              console.error(`[HtmlLessonScreen] ❌ 스트림 에러:`, error);
              const errorMsg = `\r\n\x1b[31m[Error] ${error}\x1b[0m\r\n`;
              terminalRefs.current[terminalModule.id]?.addStreamText(errorMsg, true);
            },
            () => {
              console.log(`[HtmlLessonScreen] 🏁 스트림 완료`);
            }
          );
        };

        // 터미널 WebView 준비 대기 (최대 10초, 200ms 간격 폴링)
        let pollCount = 0;
        const maxPolls = 50;
        const pollInterval = 200;
        const waitForTerminalReady = () => {
          const terminal = terminalRefs.current[terminalModule.id];
          if (terminal) {
            console.log(`[HtmlLessonScreen] ✅ 터미널 Ref 준비 완료, 스트림 시작 (${pollCount * pollInterval}ms 대기)`);
            // WebView 내부 xterm.js 로딩 대기를 위해 추가 지연
            setTimeout(startStream, 1500);
          } else if (pollCount < maxPolls) {
            pollCount++;
            setTimeout(waitForTerminalReady, pollInterval);
          } else {
            console.warn(`[HtmlLessonScreen] ⚠️ 터미널 대기 타임아웃, 강제 스트림 시작`);
            startStream();
          }
        };
        waitForTerminalReady();
      }
    }
    // ------------------------------------

    // 6. result 모듈 → 퀴즈 이후 원래 모듈 순서로 순차 등장
    const sequence = [...resultModulesWithFlag, ...remainingOriginalModules];
    let cumulativeDelay = 0;

    sequence.forEach((mod: any) => {
      const showDelay = cumulativeDelay;
      let moduleDuration = mod.visibility?.type === 'duration' ? mod.visibility.time : 0;

      // Speeches가 있는 경우 총 duration 계산
      if (mod.speeches) {
        const totalSpeechDuration = mod.speeches.reduce((sum: number, speech: any) => {
          return sum + (speech.visibility?.type === 'duration' ? speech.visibility.time : 0);
        }, 0);
        moduleDuration = Math.max(moduleDuration, totalSpeechDuration);
      }

      setTimeout(() => {
        setVisibleModules((prev) => new Set(prev).add(mod.id));

        setSliderVisibleModules((prev) => {
          const newMap = new Map(prev);
          const currentSet = newMap.get(currentSliderIndex) || new Set<number>();
          currentSet.add(mod.id);
          newMap.set(currentSliderIndex, currentSet);
          return newMap;
        });

        if (mod.tts && !mod.speeches) {
          playTTS(mod.tts);
        }

        if (mod.speeches) {
          let speechCumulativeDelay = 0;
          mod.speeches.forEach((speech: any) => {
            const speechShowDelay = speechCumulativeDelay;
            const speechDuration = speech.visibility?.type === 'duration' ? speech.visibility.time : 0;
            setTimeout(() => {
              const speechKey = `${mod.id}-${speech.id}`;
              setVisibleSpeechIds((prev) => new Set(prev).add(speechKey));
              setSliderVisibleSpeechIds((prev) => {
                const newMap = new Map(prev);
                const currentSet = newMap.get(currentSliderIndex) || new Set<string>();
                currentSet.add(speechKey);
                newMap.set(currentSliderIndex, currentSet);
                return newMap;
              });
              if (speech.tts) {
                playTTS(speech.tts);
              }
            }, speechShowDelay);
            speechCumulativeDelay += speechDuration;
          });
        }

        // 스크롤 — insert 후 위치 보정 위해 최신 슬라이더에서 인덱스 다시 조회
        setTimeout(() => {
          const latestSlider = curLesson.sliders[currentSliderIndex];
          const idxInSlider = latestSlider?.modules.findIndex((m: any) => m.id === mod.id) ?? -1;
          scrollToModule(mod.id, idxInSlider);
        }, 100);
      }, showDelay);

      cumulativeDelay += moduleDuration;
    });

    // 7. 일시정지 해제 + 자동 넘김 예약 (sequence 가 비어있어도 다음 슬라이드로 넘어가도록)
    setIsPaused(false);
    const delayAfterRender = 2000;
    setTimeout(() => {
      startAutoAdvance(cumulativeDelay + delayAfterRender);
    }, 0);
  };

  const handleTrueFalseChoiceSubmit = (completedModuleId: number) => {
    const problemModule = currentSlider.modules.find((m) => m.id === completedModuleId);
    runQuizPostGradingSequence(problemModule, 'trueFalseChoice');
  };

  const renderModule = (module: Module) => {
    const isVisible = visibleModules.has(module.id);

    // step 기반 모듈은 항상 표시 (result에서 추가된 모듈)
    const isStepBased = module.visibility?.type === 'step';

    // 🔹 프리로드 대상 모듈 타입 정의 (화면에 보이기 전 미리 마운트되어야 하는 모듈)
    const isPreloadType = module.type === 'webview' || module.type === 'code' || module.type === 'codeFillTheGapV2' || module.type === 'terminal';

    const shouldMount = isPreloadType
      ? true  // 프리로드 타입은 항상 마운트 (현재 슬라이더 내 모든 모듈)
      : (isVisible || isStepBased); // 일반 모듈은 visibleModules에 있을 때만 마운트

    if (!shouldMount) {
      return null;
    }

    // 🔹 isActive: 실제로 화면에 보여줄지 여부 (프리로드된 모듈은 false)
    const isActive = isVisible || isStepBased;

    // 현재 슬라이더가 이미 렌더링되었는지 확인 (애니메이션 스킵용)
    // const isSliderAlreadyRendered = sliderVisibleModules.has(currentSliderIndex);
    // result 모듈은 항상 애니메이션 실행 (처음 나타나는 것이므로)
    // const shouldSkipAnimation = isSliderAlreadyRendered && !isStepBased;

    // Reanimated를 사용하므로 내부 애니메이션은 모두 스킵
    const shouldSkipAnimation = true;
    const isRevisiting = currentSliderIndex < maxReachedIndex;

    let content = null;

    switch (module.type) {
      case 'paragraph':
        // TTS 데이터와 타임스탬프가 있는 경우 HighlightParagraph 사용
        const ttsData = module.tts;
        const hasTimestamps = typeof ttsData === 'object' && ttsData?.timestamps;
        const isCurrentAudio = typeof ttsData === 'object' && ttsData.url === currentAudioUrl;


        if (hasTimestamps && !isRevisiting) {
          content = (
            <HighlightParagraph
              module={module as any}
              currentAudioTime={isCurrentAudio ? currentAudioTime : 0}
            />
          );
        } else {
          content = <ParagraghComponentV2 module={module as any} skipAnimation={shouldSkipAnimation} />;
        }
        break;

      case 'webview':
        content = (
          <WebViewComponent
            module={module}
            isActive={isActive}
            skipAnimation={shouldSkipAnimation}
          />
        );
        break;

      case 'code':
        content = (
          <CodeComponent
            module={module as any}
            isActive={isActive}
            skipAnimation={shouldSkipAnimation}
          />
        );
        break;

      case 'terminal':
        content = (
          <TerminalComponent
            ref={(el) => {
              if (el) terminalRefs.current[module.id] = el;
            }}
            module={module as any}
            isActive={isActive}
            onLoadComplete={() => {
              console.log('terminal load complete');
            }}
          />
        );
        break;

      case 'characterSpeechBubble':
        content = (
          <CharacterSpeechBubbleComponent
            module={module as any}
            visibleSpeechIds={visibleSpeechIds}
            currentAudioTime={currentAudioTime}
            currentAudioUrl={currentAudioUrl}
            highlightDisabled={isRevisiting}
          />
        );
        break;

      case 'missionList':
        content = (
          <MissionListComponent
            module={module as any}
            visibleItemIds={visibleMissionItemIds}
          />
        );
        break;

      case 'tagDescriptionList':
        content = <TagDescriptionListComponent module={module as any} />;
        break;

      case 'multipleChoice':
        content = (
          <MultipleChoiceComponent
            curSlideIndex={currentSliderIndex}
            moduleIndex={currentSlider.modules.findIndex((m) => m.id === module.id)}
            curLesson={curLesson as any}
            setCurLesson={setCurLesson}
            isReviewMode={false}
            onSubmitComplete={handleMultipleChoiceSubmit}
            skipAnimation={shouldSkipAnimation}
          />
        );
        break;

      case 'trueFalseChoice':
        content = (
          <TrueFalseChoiceComponent
            curSlideIndex={currentSliderIndex}
            moduleIndex={currentSlider.modules.findIndex((m) => m.id === module.id)}
            curLesson={curLesson as any}
            setCurLesson={setCurLesson}
            isReviewMode={false}
            onSubmitComplete={handleTrueFalseChoiceSubmit}
            skipAnimation={shouldSkipAnimation}
          />
        );
        break;

      case 'codeFillTheGapV2':
        content = (
          <CodeFillTheGapV2Component
            curSlideIndex={currentSliderIndex}
            moduleIndex={currentSlider.modules.findIndex((m) => m.id === module.id)}
            curLesson={curLesson as any}
            setCurLesson={setCurLesson}
            isReviewMode={false}
            onSubmitComplete={handleCodeFillTheGapSubmit}
            isActive={isActive}
          />
        );
        break;

      case 'image':
        content = <PictureComponent module={module as any} />;
        break;

      default:
        return null;
    }

    // 프리로드되어 보이지 않아야 할 때는 height 0, opacity 0으로 숨김
    // Reanimated View로 감싸서 진입 애니메이션 적용
    if (!isActive) {
      if (isPreloadType) {
        // 프리로드 타입은 렌더링하되 숨김
        return (
          <View key={`module-${module.id}`} style={{ height: 0, opacity: 0, overflow: 'hidden' }}>
            {content}
          </View>
        );
      }
      return null;
    }

    return (
      <View
        key={`module-${module.id}`}
        className="mb-[60px]"
        onLayout={(event) => {
          modulePositionsRef.current[module.id] = event.nativeEvent.layout.y;
        }}
      >
        {content}
      </View>
    );
  };

  // 모듈들을 렌더링하는 함수
  const renderModules = () => {
    return currentSlider.modules.map((module) => {
      return renderModule(module);
    });
  };

  // 배경 그라데이션 렌더링 함수
  const renderBackground = (background?: Slider['background']) => {
    if (!background || !Array.isArray(background.colors) || background.colors.length === 0) return null;

    const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

    // 피그마 각도를 SVG 좌표로 변환
    // 피그마: 0도 = 위에서 아래, 90도 = 왼쪽에서 오른쪽
    // SVG: x1, y1, x2, y2 (0~1 또는 0%~100%)
    const angle = background.angle || 180; // 기본값: 위에서 아래
    const radians = (angle * Math.PI) / 180;
    const x1 = 0.5 - Math.sin(radians) * 0.5;
    const y1 = 0.5 + Math.cos(radians) * 0.5;
    const x2 = 0.5 + Math.sin(radians) * 0.5;
    const y2 = 0.5 - Math.cos(radians) * 0.5;

    const locations = background.locations ||
      background.colors.map((_, index) => index / (background.colors.length - 1));

    return (
      <View style={StyleSheet.absoluteFillObject}>
        <Svg
          width={SCREEN_WIDTH}
          height={SCREEN_HEIGHT}
          style={StyleSheet.absoluteFillObject}
        >
          <Defs>
            <LinearGradient
              id="slideGradient"
              x1={`${x1 * 100}%`}
              y1={`${y1 * 100}%`}
              x2={`${x2 * 100}%`}
              y2={`${y2 * 100}%`}
            >
              {background.colors.map((color, index) => (
                <Stop
                  key={index}
                  offset={`${(locations[index] || index / (background.colors.length - 1)) * 100}%`}
                  stopColor={color}
                />
              ))}
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#slideGradient)" />
        </Svg>
      </View>
    );
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/* StatusBar는 useFocusEffect에서 imperative하게 처리 — 다른 화면으로 누수 방지 */}
      {renderBackground(currentSlider.background)}

      <GestureDetector gesture={composedGesture}>
        <View
          className="flex-1"
        >
          {/* Header */}
          <View
            className="px-4 mb-[10px]"
            style={{ paddingTop: Math.max(insets.top, 16) }}
          >
            <View className="flex-row items-center gap-3">
              {/* Exit Button - 좌측으로 이동 */}
              <DefaultIconBtn
                onPress={handleExitPress}
                size={32}
                enableHapticFeedback
              >
                <X width={24} height={24} fill="#6C757D" />
              </DefaultIconBtn>

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

              {/* Pause/Resume Button - 우측에 추가 */}
              <DefaultIconBtn
                onPress={togglePauseResume}
                size={32}
                enableHapticFeedback
              >
                {isPaused ? (
                  <Play width={24} height={24} fill="#08875D" />
                ) : (
                  <Pause width={24} height={24} fill="#6C757D" />
                )}
              </DefaultIconBtn>
            </View>
            <Text className="bold-16 text-Text-Black_Secondary tracking-[-0.32px]">
              {curLesson.sliders[currentSliderIndex].title}
            </Text>
          </View>

          {/* Content */}
          <ScrollView
            ref={scrollViewRef}
            className="flex-1"
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingVertical: 20,
              paddingBottom: SCREEN_HEIGHT / 2 // 마지막 모듈도 중앙에 올 수 있도록 패딩 추가
            }}
            showsVerticalScrollIndicator={false}
            simultaneousHandlers={[]}
          >
            {renderModules()}

            {/* 마지막 슬라이드 완료 시 버튼 표시 */}
            {currentSliderIndex === curLesson.sliders.length - 1 && isLastButtonVisible && (
              <View className="gap-3">
                <DefaultBtn
                  onPress={handleLessonComplete}
                  text="다음 레슨 바로가기"
                  flex={false}
                  buttonClassName="flex items-center justify-center h-[56px] rounded-[10px] bg-[#8B54F7]"
                  textClassName="bold-16 text-white tracking-[-0.32px] text-center"
                  shadowColor="#8B54F7"
                />
                <DefaultBtn
                  onPress={handleLessonComplete}
                  text="학습 종료"
                  flex={false}
                  buttonClassName="flex items-center justify-center h-[56px] rounded-[10px] bg-[#F8F5FF]"
                  textClassName="bold-16 text-[#8B54F7] tracking-[-0.32px] text-center"
                  shadowColor="#8B54F7"
                />
              </View>
            )}
          </ScrollView>

          {/* Gesture Indicator Overlay */}
          <GestureIndicatorOverlay
            translateX={translateX}
            isPaused={isPaused}
            hasActiveTimers={
              moduleTimersRef.current.length > 0 ||
              autoAdvanceTimerRef.current !== null ||
              isPaused
            }
            canGoLeft={currentSliderIndex > 0}
            canGoRight={currentSliderIndex < curLesson.sliders.length - 1}
          />
          <AudioPlayer
            key={currentAudioUrl}
            audioUrl={currentAudioUrl}
            paused={isPaused}
            onProgress={({ currentTime }) => setCurrentAudioTime(currentTime)}
          />
        </View>
      </GestureDetector>
    </GestureHandlerRootView>
  );
};

export default LessonLearningScreenV5;

