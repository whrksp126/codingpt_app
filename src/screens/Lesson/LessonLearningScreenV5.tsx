import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, Dimensions, StatusBar, Platform, Alert, Keyboard, BackHandler, TouchableOpacity, unstable_batchedUpdates } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScrollView } from 'react-native-gesture-handler';

import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../contexts/ThemeContext';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { runOnJS, useSharedValue, withSpring, withTiming, Easing } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import DefaultIconBtn from '../../components/Button/DefaultIconBtn';
import { X, Play, Pause } from '../../assets/SvgIcon';

// 모듈 컴포넌트들 — 무거운 native 컴포넌트(WebView/Code/Terminal)는 React.memo 로 wrap.
// props (module/isActive/skipAnimation) 가 reference equal 일 때 자체 리렌더를 막아
// 슬라이드 전환 시 부모 리렌더로 인한 reconcile 비용을 차단한다 (이게 swipe latency 의 가장 큰 원인).
import { ParagraghComponentV2 as ParagraghComponentV2Raw } from '../../components/module/ParagraghV2';
import { PictureComponent } from '../../components/module/Picture';
import { WebViewComponent as WebViewComponentRaw } from '../../components/module/WebView';
import { CodeComponent as CodeComponentRaw } from '../../components/module/Code';
import { CodeFillTheGapV2Component } from '../../components/module/CodeFillTheGapV2';
import { MultipleChoiceComponent } from '../../components/module/MultipleChoice';
import { TrueFalseChoiceComponent } from '../../components/module/TrueFalseChoice';
import { CharacterSpeechBubbleComponent } from '../../components/module/CharacterSpeechBubble';
import { MissionListComponent } from '../../components/module/MissionList';
import { TagDescriptionListComponent } from '../../components/module/TagDescriptionList';
import { HighlightParagraph } from '../../components/module/HighlightParagraph';
import { TerminalComponent as TerminalComponentRaw } from '../../components/module/Terminal';

const ParagraghComponentV2 = React.memo(ParagraghComponentV2Raw);
const WebViewComponent = React.memo(WebViewComponentRaw);
const CodeComponent = React.memo(CodeComponentRaw);
const TerminalComponent = React.memo(TerminalComponentRaw);
import { ActionButtonComponent } from '../../components/module/ActionButton';
import { ActionButtonsComponent } from '../../components/module/ActionButtons';
import { useLesson } from '../../contexts/LessonContext';

import { AudioPlayer as AudioPlayerRaw } from '../../components/AudioPlayer';
// React.memo wrap — props 가 같으면 (audioUrl/paused/onProgress reference) 자체 render skip.
// 슬라이드 전환마다 부모가 리렌더되어도 AudioPlayer 가 불필요하게 render() 호출되지 않음.
const AudioPlayer = React.memo(AudioPlayerRaw);
import lessonService from '../../services/lessonService';
import { prefetchLessonAssets } from '../../utils/lessonPrefetch';
import { buildAnswerKey } from '../../utils/answerKey';
import { ModuleEnter } from '../../components/effects/ModuleEnter';
import { AnimatedSlideBackground } from '../../components/effects/AnimatedSlideBackground';
import { SlidePageContainer } from '../../components/effects/SlidePageContainer';
import { AnimatedSlideTitle } from '../../components/effects/AnimatedSlideTitle';
import { ProgressSegments } from '../../components/effects/ProgressSegments';
import { EdgeRadialGlow } from '../../components/effects/EdgeRadialGlow';
import { QuizGateToast } from '../../components/effects/QuizGateToast';
import BottomSheet from '../../components/Modal/BottomSheet';
import { ENABLE_AUTO_SCROLL } from '../../utils/featureFlags';

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

// 현재 슬라이드 기준 keep-alive 마운트 윈도우 반경.
// 예: 10 → 현재 ±10 = 최대 21개 슬라이드 동시 마운트.
// 윈도우가 너무 작으면 WebView 등이 unmount → remount 되며 다시 로딩 (사용자 swipe 후 빈 화면).
// 무거운 컴포넌트(WebView/Code/Terminal)는 React.memo 로 보호되어 매 부모 리렌더 시
// 자체 reconcile 비용이 없으므로, 윈도우를 크게 잡아도 swipe latency 가 늘지 않는다.
const SLIDE_KEEP_ALIVE_WINDOW = 10;

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
  type: 'paragraph' | 'quote' | 'webview' | 'code' | 'characterSpeechBubble' | 'missionList' | 'tagDescriptionList' | 'multipleChoice' | 'trueFalseChoice' | 'codeFillTheGapV2' | 'image' | 'terminal' | 'simpleTerminal' | 'actionButton';
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
  const { getNextLesson } = useLesson();

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
  // 이전 슬라이드 keep-alive 를 위해 ScrollView 와 모든 위치 ref 를 슬라이드별로 분리.
  // scrollViewRefs[sliderIdx] = 해당 슬라이드의 ScrollView ref.
  const scrollViewRefs = useRef<Record<number, ScrollView | null>>({});
  // modulePositionsRef[sliderIdx][moduleId] = y
  const modulePositionsRef = useRef<Record<number, Record<number, number>>>({});
  // 캐릭터 말풍선의 각 speech 위치. key = `${sliderIdx}-${moduleId}-${speechId}` (또는 `${sliderIdx}-${moduleId}`)
  const speechRelativeYRef = useRef<Record<string, number>>({});
  // 미션 리스트의 각 item 위치. key = `${sliderIdx}-${moduleId}-${itemId}`
  const missionItemRelativeYRef = useRef<Record<string, number>>({});
  const keyboardHeightRef = useRef<number>(0);
  // 정·오답 그래픽 피드백 — EdgeRadialGlow 의 색상만 다르게 사용.
  // 'correct' = 정답(녹색), 'wrong' = 오답(빨강), null = 비활성.
  const [flashKind, setFlashKind] = useState<'correct' | 'wrong' | null>(null);
  // 학습 페이지 토스트 — 퀴즈 미해결 시 좌측 swipe 차단 안내 등에 사용.
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  // 종료 확인 시트 — X 버튼 / Android 물리 back / iOS swipe-back 시 진행 중 학습을 보호하기 위해 표시.
  const [showExitSheet, setShowExitSheet] = useState(false);
  // navigation.dispatch 를 beforeRemove 리스너 안에서 사용하기 위한 ref.
  const allowExitNavigationRef = useRef(false);
  const { height: SCREEN_HEIGHT } = Dimensions.get('window');

  // 키보드 노출 중에는 자동 스크롤 시 키보드 높이만큼 추가 보정해서 모듈이 가려지지 않게 함.
  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        keyboardHeightRef.current = e.endCoordinates?.height ?? 0;
      },
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        keyboardHeightRef.current = 0;
      },
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);
  const [visibleModules, setVisibleModules] = useState<Set<number>>(new Set());
  const [visibleSpeechIds, setVisibleSpeechIds] = useState<Set<string>>(new Set()); // moduleId-speechId 형태
  const [visibleMissionItemIds, setVisibleMissionItemIds] = useState<Set<string>>(new Set()); // moduleId-missionItemId 형태
  const [currentSliderIndex, setCurrentSliderIndex] = useState(0);
  // 이전 슬라이드 인덱스 — SlideContent 의 direction (좌·우) 계산용
  const prevSliderIndexRef = useRef(0);
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
  // onProgress 핸들러 안정화 — inline 함수면 매 render 마다 새 reference 라
  // React.memo 가 AudioPlayer 의 props 비교에서 변경으로 인식해서 render skip 안 됨.
  const handleAudioProgress = useCallback(({ currentTime }: { currentTime: number }) => {
    setCurrentAudioTime(currentTime);
  }, []);
  const [maxReachedIndex, setMaxReachedIndex] = useState(0);
  // 현재 진행 중인 슬라이드 전환의 방향 (forward = 다음으로, backward = 이전으로)
  const [slideDirection, setSlideDirection] = useState<'forward' | 'backward'>('forward');
  const terminalRefs = useRef<Record<number, any>>({});
  // 일반 슬라이드의 터미널 모듈은 visible 되는 순간 자동 실행 — 중복 실행 방지용 트리거 추적.
  // 슬라이드 변경 시 초기화돼서 재방문 시 다시 실행된다.
  const triggeredTerminalsRef = useRef<Set<number>>(new Set());

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

  // 모듈 등장 시 모듈 상단이 viewport 40% 지점(골든존)에 오도록 부드럽게 스크롤.
  // 현재 currentSliderIndex 의 ScrollView 만 활성. 위치 ref 는 슬라이드별로 분리되어 있음.
  const scrollToModule = useCallback((moduleId: number, _index: number) => {
    if (!ENABLE_AUTO_SCROLL) return;
    const sliderIdx = currentSliderIndex;
    const y = modulePositionsRef.current[sliderIdx]?.[moduleId];
    if (y == null) return;
    const kbHeight = keyboardHeightRef.current ?? 0;
    const targetY = Math.max(0, y - SCREEN_HEIGHT * 0.4 + kbHeight * 0.5);
    scrollViewRefs.current[sliderIdx]?.scrollTo({ y: targetY, animated: true });
  }, [SCREEN_HEIGHT, currentSliderIndex]);

  const scrollToSpeech = useCallback((moduleId: number, speechId: number | string) => {
    if (!ENABLE_AUTO_SCROLL) return;
    const sliderIdx = currentSliderIndex;
    const moduleY = modulePositionsRef.current[sliderIdx]?.[moduleId];
    if (moduleY == null) return;
    const key = `${sliderIdx}-${moduleId}-${speechId}`;
    const fallbackKey = `${sliderIdx}-${moduleId}`;
    const relY = speechRelativeYRef.current[key] ?? speechRelativeYRef.current[fallbackKey] ?? 0;
    const kbHeight = keyboardHeightRef.current ?? 0;
    const targetY = Math.max(0, moduleY + relY - SCREEN_HEIGHT * 0.4 + kbHeight * 0.5);
    scrollViewRefs.current[sliderIdx]?.scrollTo({ y: targetY, animated: true });
  }, [SCREEN_HEIGHT, currentSliderIndex]);

  const scrollToMissionItem = useCallback((moduleId: number, itemId: number) => {
    if (!ENABLE_AUTO_SCROLL) return;
    const sliderIdx = currentSliderIndex;
    const moduleY = modulePositionsRef.current[sliderIdx]?.[moduleId];
    if (moduleY == null) return;
    const key = `${sliderIdx}-${moduleId}-${itemId}`;
    const relY = missionItemRelativeYRef.current[key] ?? 0;
    const kbHeight = keyboardHeightRef.current ?? 0;
    const targetY = Math.max(0, moduleY + relY - SCREEN_HEIGHT * 0.4 + kbHeight * 0.5);
    scrollViewRefs.current[sliderIdx]?.scrollTo({ y: targetY, animated: true });
  }, [SCREEN_HEIGHT, currentSliderIndex]);

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

  // 학습 페이지 진입 시 모듈 자동 스케줄링이 가능한 상태인지 추적.
  // lessonId 만 받은 경우 백엔드 fetch 완료 전까지 메인 스케줄링 effect 가 실행되면,
  // 첫 effect 가 sliderVisibleModules[0] 에 모듈 ID 를 추가 → fetch 완료 후 setCurLesson(fresh)
  // 로 effect 재실행 시 isRevisit=true 로 잘못 판정되어 ▶ 를 눌러야만 후속 모듈이 등장하는 버그가 발생.
  // lessonData 가 즉시 들어왔거나 lessonId 가 없는 fallback 경로면 곧바로 ready.
  const [isLessonReady, setIsLessonReady] = useState<boolean>(() => {
    const params = route.params as any;
    return !params?.lessonId || !!params?.lessonData;
  });

  // 첫 mount 인지 추적. fetch 완료로 effect 가 재실행될 때 isRevisit 가 잘못 true 가 되는 것을 막는 안전망.
  const isFirstMountRef = useRef(true);

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
      setIsLessonReady(true);
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
        // requireAllCorrect가 true 이면 모든 답이 정답이어야 함, 아니면 채점이 끝난(모든 답에 isCorrect 설정된) 시점에 완료로 간주.
        if (requireAllCorrect) {
          return answers.every((ans: any) => ans.isCorrect === true);
        }
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
    const isRevisit = !!savedModules;

    // 한 번의 reconcile 로 모든 슬라이드 전환 상태를 set.
    // main useEffect 의 setState 들 (visible*, isPaused) 도 여기서 통합 처리해서
    // commit 이 두 번 일어나지 않게 한다 — 이게 swipe latency 의 가장 큰 원인이었음.
    // runOnJS 콜백 안에서는 React 18 자동 배칭이 동작하지 않아 unstable_batchedUpdates 명시 필요.
    unstable_batchedUpdates(() => {
      setSlideDirection(newIndex >= currentSliderIndex ? 'forward' : 'backward');
      setVisibleModules(savedModules ? new Set(savedModules) : new Set());
      setVisibleSpeechIds(savedSpeeches ? new Set(savedSpeeches) : new Set());
      setVisibleMissionItemIds(savedMissions ? new Set(savedMissions) : new Set());
      setCurrentSliderIndex(newIndex);
      // 재방문은 자동 일시정지로 시작 — 사용자가 ▶ 를 눌러야 안 본 모듈 등장.
      setIsPaused(isRevisit);
    });
  }, [sliderVisibleModules, sliderVisibleSpeechIds, sliderVisibleMissionItemIds, currentSliderIndex]);

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
      clearAutoAdvanceTimer();
    }, delayAfterRender);
  }, [currentSliderIndex, curLesson.sliders.length, clearAutoAdvanceTimer, isPaused, goToSlide]);

  useEffect(() => {
    // lessonId fetch 가 아직 끝나지 않았다면 스케줄링 보류 — fetch 완료 후 effect 재실행 시 시작.
    if (!isLessonReady) return;

    // 슬라이드 변경 시 자동 넘김 관련 모든 상태 초기화 (일시정지 포함)
    resetAutoAdvanceState();

    // 애니메이션 값 초기화
    translateX.value = 0;
    opacity.value = 1;

    // 이전 타이머들 정리
    timeoutRefs.current.forEach((timeout) => clearTimeout(timeout));
    timeoutRefs.current = [];

    // 모든 슬라이드의 모듈 타이머를 정리 — 빠른 슬라이드 넘김 시 이전 슬라이드의
    // setTimeout 콜백이 발화해 현재 슬라이드 visibleModules 에 다른 슬라이드의
    // moduleId 가 잘못 추가되는 race condition 방지.
    moduleTimersRef.current.forEach((timerInfo) => {
      if (timerInfo.timeout) {
        clearTimeout(timerInfo.timeout);
      }
    });
    moduleTimersRef.current = [];

    const slider = curLesson.sliders[currentSliderIndex];
    if (!slider) return;

    // 현재 슬라이더가 이미 렌더링되었는지 확인
    const savedVisibleModules = sliderVisibleModules.get(currentSliderIndex);
    const savedVisibleSpeechIds = sliderVisibleSpeechIds.get(currentSliderIndex);
    const savedVisibleMissionItemIds = sliderVisibleMissionItemIds.get(currentSliderIndex);

    // 재방문 여부 — visibility 큐의 첫 모듈 delay 정규화에만 사용.
    // setVisibleModules / setVisibleSpeechIds / setVisibleMissionItemIds / setIsPaused 는
    // goToSlide 에서 이미 한 batch 로 처리했으므로 여기서는 setState 호출하지 않는다.
    // (중복 setState 가 commit 을 두 번 일으켜 swipe latency 의 절반을 차지했음.)
    //
    // 강화: (1) 첫 mount 는 절대 revisit 이 아님 — lessonId fetch 완료로 effect 가 재실행될 때
    //       부분적으로 채워진 캐시를 보고 revisit 으로 오판하는 것을 막는다.
    //       (2) 슬라이드의 모든 모듈이 캐시에 들어있을 때만 revisit 으로 인정 — 빠른 swipe 로
    //       슬라이드를 떠나 부분 캐시만 남은 경우 fresh 진입으로 재취급.
    const isRevisit = !isFirstMountRef.current
      && !!savedVisibleModules
      && savedVisibleModules.size >= slider.modules.length;

    // 재방문 시 미방문 모듈/말풍선/아이템의 첫 등장 delay 를 normalize 하기 위한 offset.
    // 슬라이드 시작 시점 기준의 누적 delay 에서 firstUnvisitedShowDelay 를 빼고 REVISIT_FIRST_DELAY 를 더해
    // "▶ 누르면 잠시 뒤 첫 미방문이 등장하고 이후 자연스러운 간격으로 이어짐" 을 구현.
    const REVISIT_FIRST_DELAY = 200;
    let firstUnvisitedShowDelay = -1;
    const normalizeDelay = (rawDelay: number) => {
      if (!isRevisit) return rawDelay;
      if (firstUnvisitedShowDelay === -1) firstUnvisitedShowDelay = rawDelay;
      return Math.max(REVISIT_FIRST_DELAY, rawDelay - firstUnvisitedShowDelay + REVISIT_FIRST_DELAY);
    };

    // 재방문이면 timeout 없이 큐잉만 — 사용자가 ▶ 누르면 resumeModuleRendering 이 setTimeout 생성.
    // (resumeModuleRendering 은 timeout: null, delay 인 'show' 타이머를 그대로 처리.)
    type TimerMeta = {
      moduleId: number;
      speechId?: number;
      missionItemId?: number;
      type: 'show' | 'duration';
    };
    const scheduleShow = (callback: () => void, rawDelay: number, meta: TimerMeta) => {
      const delay = normalizeDelay(rawDelay);
      if (isRevisit) {
        moduleTimersRef.current.push({
          timeout: null,
          startTime: Date.now(),
          delay,
          sliderIndex: currentSliderIndex,
          ...meta,
        });
      } else {
        const t = setTimeout(callback, delay);
        timeoutRefs.current.push(t);
        moduleTimersRef.current.push({
          timeout: t,
          startTime: Date.now(),
          delay,
          sliderIndex: currentSliderIndex,
          ...meta,
        });
      }
    };

    // 저장되지 않은 모듈들을 순차적으로 표시
    let cumulativeDelay = 0; // 누적 딜레이 시간

    // 슬라이드 내 첫 게이트(퀴즈 또는 actionButton — role !== 'default') 모듈 이후의 일반 모듈은
    // 해당 핸들러(handleMultipleChoiceSubmit/handleTrueFalseChoiceSubmit/handleCodeFillTheGapSubmit/handleActionButtonClick)가
    // 직접 등장시키므로 여기서는 스케줄링에서 제외한다.
    // actionButton 의 기본 동작은 'gate' — role 미설정인 legacy 데이터도 게이트로 간주.
    const firstGateIdx = slider.modules.findIndex(
      (m: any) =>
        m.type === 'multipleChoice'
        || m.type === 'trueFalseChoice'
        || m.type === 'codeFillTheGapV2'
        || (m.type === 'actionButton' && m.role !== 'default'),
    );

    slider.modules.forEach((module, moduleIdx) => {
      if (firstGateIdx !== -1 && moduleIdx > firstGateIdx && !(module as any).manualRender) {
        return;
      }
      // 등장 트리거(afterGrading / afterButtonClick)가 있으면 초기 스케줄링 제외 —
      // 이벤트 발생 시점에 handleActionButtonClick / runQuizPostGradingSequence /
      // handleCodeFillTheGapSubmit 에서 setVisibleModules 로 추가.
      if ((module as any).trigger) {
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
          scheduleShow(() => {
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
            }, 50);
            if (module.tts) playTTS(module.tts);
            // 타이머 목록에서 이 표시 타이머 제거
            moduleTimersRef.current = moduleTimersRef.current.filter(t =>
              !(t.moduleId === module.id && t.type === 'show' && t.speechId === undefined)
            );
          }, currentModuleStartDelay, { moduleId: module.id, type: 'show' });
        }

        // 1. 첫 번째 말풍선 지연 — ModuleEnter 컨테이너 등장을 skip 했으므로 빠르게 등장.
        //    250ms 가 SpeechItem 내부 200ms delay 와 합쳐 자연스럽게 모듈 진입과 한 흐름이 된다.
        let speechCumulativeDelay = 250;

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

          scheduleShow(() => {
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
              // 말풍선 단위로 스크롤 — 각 speech 가 viewport 40% 지점에 오도록.
              // entrance 애니메이션 + onLayout 보고 시간을 고려해 100ms 후 호출.
              scrollToSpeech(module.id, speech.id);
            }, 50);
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
          }, showDelay, { moduleId: module.id, speechId: speech.id, type: 'show' });

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
          scheduleShow(() => {
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
            }, 50);
            if (module.tts) playTTS(module.tts);
            // 표시 타이머 제거
            moduleTimersRef.current = moduleTimersRef.current.filter(t =>
              !(t.moduleId === module.id && t.type === 'show' && t.missionItemId === undefined)
            );
          }, currentModuleStartDelay, { moduleId: module.id, type: 'show' });
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

          scheduleShow(() => {
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
              // 미션 아이템 단위로 스크롤 — 각 item 이 viewport 40% 지점에 오도록.
              scrollToMissionItem(module.id, item.id);
            }, 50);

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
          }, showDelay, { moduleId: module.id, missionItemId: item.id, type: 'show' });

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

        scheduleShow(() => {
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
          }, 50);
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
        }, showDelay, { moduleId: module.id, type: 'show' });
      }

      // 다음 모듈 시작 시간 = 현재 모듈 시작 시간 + 현재 모듈 duration
      cumulativeDelay += moduleDuration;
    });

    // 재방문 시 setIsPaused(true) 는 goToSlide 의 batch 에 통합됨 — 여기서 호출 안 함.
    // (호출하면 commit 두 번 → swipe latency 100ms+ 추가)

    // 첫 mount 가드 해제 — 이후 effect 재실행은 모두 일반 경로.
    isFirstMountRef.current = false;

    return () => {
      timeoutRefs.current.forEach((timeout) => clearTimeout(timeout));
      timeoutRefs.current = [];
      resetAutoAdvanceState();
    };
  }, [currentSliderIndex, curLesson.sliders, resetAutoAdvanceState, playTTS, isLessonReady]);

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

      // 마지막 슬라이드에서는 자동 진행하지 않음 — 슬라이드의 actionButton(s) 모듈로 사용자가 명시적으로 종료/이동.
      if (currentSliderIndex < curLesson.sliders.length - 1) {
        startAutoAdvance(waitTime);
      }
    }

    return () => clearAutoAdvanceTimer();
  }, [visibleModules, visibleSpeechIds, visibleMissionItemIds, currentSliderIndex, curLesson.sliders, startAutoAdvance]);

  /**
   * 📌 pauseModuleRendering: 모듈 렌더링 일시정지
   * - 현재 슬라이드의 타이머만 pause. 다른 슬라이드의 잔존 타이머는 영향 없음.
   */
  const pauseModuleRendering = useCallback(() => {
    const now = Date.now();
    moduleTimersRef.current.forEach((timerInfo) => {
      if (timerInfo.sliderIndex !== currentSliderIndex) return;
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
  }, [currentSliderIndex]);

  /**
   * 📌 resumeModuleRendering: 모듈 렌더링 재생
   * - 현재 슬라이드의 큐잉된 타이머만 재시작. 다른 슬라이드 타이머가 발화해
   *   현재 visibleModules 에 잘못 추가되는 race condition 차단.
   */
  const resumeModuleRendering = useCallback(() => {
    const now = Date.now();
    const timersToResume = moduleTimersRef.current.filter(
      t => t.delay > 0 && t.sliderIndex === currentSliderIndex,
    );

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
        }, 50);

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
   * 📌 findNextIncompleteSliderIndex: 현재 인덱스 이후에서 모듈이 다 재생되지 않은 첫 슬라이드 인덱스를 반환.
   * - 비교 기준: sliderVisibleModules.get(i).size < sliders[i].modules.length
   * - 모두 재생된 경우 null.
   */
  const findNextIncompleteSliderIndex = useCallback(
    (fromIndex: number): number | null => {
      const sliders = curLesson?.sliders ?? [];
      for (let i = fromIndex + 1; i < sliders.length; i++) {
        const totalModules = sliders[i]?.modules?.length ?? 0;
        const visibleCount = sliderVisibleModules.get(i)?.size ?? 0;
        if (visibleCount < totalModules) return i;
      }
      return null;
    },
    [curLesson?.sliders, sliderVisibleModules],
  );

  /**
   * 📌 togglePauseResume: 탭으로 일시정지/재생 토글.
   * 활성 타이머가 없는 = 현재 슬라이드 모듈이 다 재생된 상태에서는,
   * 다음 미완료 슬라이드로 점프 + 자동 재생 재개.
   */
  const togglePauseResume = useCallback(() => {
    // 모듈 렌더링 중이거나 자동 넘김 타이머가 있거나 일시정지 상태면 토글 동작
    const hasModuleTimers = moduleTimersRef.current.length > 0;
    const hasAutoAdvanceTimer = autoAdvanceTimerRef.current !== null;
    const canToggle = hasModuleTimers || hasAutoAdvanceTimer || isPaused;

    if (canToggle) {
      if (currentSliderIndex >= curLesson.sliders.length - 1) return;
      if (isPaused) {
        resumeAutoAdvance();
      } else {
        pauseAutoAdvance();
      }
      return;
    }

    // Fallback: 모든 모듈이 끝나서 더 이상 토글할 타이머가 없는 상황.
    // → 다음 미완료 슬라이드로 점프하고 자동 재생 흐름을 재개한다.
    const next = findNextIncompleteSliderIndex(currentSliderIndex);
    if (next !== null) {
      setIsPaused(false);
      goToSlide(next);
    }
  }, [
    isPaused,
    currentSliderIndex,
    curLesson.sliders.length,
    pauseAutoAdvance,
    resumeAutoAdvance,
    findNextIncompleteSliderIndex,
    goToSlide,
  ]);


  /**
   * 📌 handleSwipe: 스와이프 제스처 처리 (JS 쓰레드에서 실행)
   */
  const handleSwipe = useCallback((direction: 'left' | 'right') => {
    if (direction === 'left') {
      // 다음 슬라이드로 이동
      if (currentSliderIndex < curLesson.sliders.length - 1) {
        // 퀴즈 모듈이 있고 완료되지 않았으면 이동 차단 + 안내 토스트
        if (hasQuizModule(currentSlider.modules) && !isQuizCompleted(currentSlider)) {
          setToastMsg('퀴즈를 풀어야 다음으로 넘어갈 수 있어요');
          return;
        }
        // 첫 진입이면 자동 재생, 재방문이면 goToSlide 가 setIsPaused(true) 처리.
        goToSlide(currentSliderIndex + 1);
      }
    } else {
      // 이전 슬라이드로 이동 (항상 허용) — 재방문이면 goToSlide 가 일시정지 처리.
      if (currentSliderIndex > 0) {
        goToSlide(currentSliderIndex - 1);
      }
    }
  }, [currentSliderIndex, curLesson.sliders, currentSlider, hasQuizModule, isQuizCompleted, goToSlide]);

  // Pan 제스처를 위한 shared values
  const translateX = useSharedValue(0);
  const opacity = useSharedValue(1);

  /**
   * 📌 Pan Gesture: 좌우 스와이프로 슬라이드 이동
   * useMemo 로 안정화 — handleSwipe 가 안 바뀌면 매 렌더마다 새 Gesture 객체를 만들지 않음.
   * 매 렌더 시 GestureDetector 에 새 객체를 넘기면 native 측에서 핸들러를 재등록하는 비용이 있음.
   */
  const panGesture = useMemo(() =>
    Gesture.Pan()
      .activeOffsetX([-10, 10])
      .failOffsetY([-10, 10])
      .onUpdate((e) => {
        'worklet';
        translateX.value = e.translationX;
        opacity.value = Math.max(0.95, 1 - Math.abs(e.translationX) / 1000);
      })
      .onEnd((e) => {
        'worklet';
        const threshold = 50;
        if (Math.abs(e.translationX) > threshold) {
          if (e.translationX < 0) {
            runOnJS(handleSwipe)('left');
          } else {
            runOnJS(handleSwipe)('right');
          }
        }
        translateX.value = withTiming(0, { duration: 120, easing: Easing.out(Easing.cubic) });
        opacity.value = withTiming(1, { duration: 120, easing: Easing.out(Easing.cubic) });
      }),
    [translateX, opacity, handleSwipe],
  );

  /**
   * 📌 Tap Gesture 제거 (헤더 버튼으로 대체)
   */
  // const tapGesture = Gesture.Tap() ... 제거됨

  // 제스처 조합 (좌우 스와이프만 유지)
  const composedGesture = panGesture;

  const handleExitPress = () => {
    // 자동 넘김 / 모듈 등장 일시정지 + 오디오까지 모두 멈춤 후 종료 확인 시트 표시.
    // setIsPaused(true) 를 명시적으로 호출해야 idle 상태(타이머 없음)에서도 AudioPlayer 의 paused prop 이
    // 갱신되어 TTS 가 즉시 멈춘다.
    pauseAutoAdvance();
    pauseModuleRendering();
    setIsPaused(true);
    setShowExitSheet(true);
  };

  const cancelExit = useCallback(() => {
    setShowExitSheet(false);
  }, []);

  const confirmExit = useCallback(() => {
    setShowExitSheet(false);
    clearAutoAdvanceTimer();
    // beforeRemove 가드를 우회하기 위해 ref 플래그 set 후 goBack.
    allowExitNavigationRef.current = true;
    navigation.goBack();
  }, [clearAutoAdvanceTimer, navigation]);

  // Android 물리 back / iOS swipe-back / 헤더 네이티브 back 모두 가로채서 시트 띄움.
  useEffect(() => {
    const sub = (navigation as any).addListener('beforeRemove', (e: any) => {
      if (allowExitNavigationRef.current) return; // confirmExit 경유는 통과
      e.preventDefault();
      pauseAutoAdvance();
      pauseModuleRendering();
      setIsPaused(true);
      setShowExitSheet(true);
    });
    return sub;
  }, [navigation, pauseAutoAdvance, pauseModuleRendering]);

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android') return;
      const onBack = () => {
        pauseAutoAdvance();
        pauseModuleRendering();
        setIsPaused(true);
        setShowExitSheet(true);
        return true; // 기본 동작 차단
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
      return () => sub.remove();
    }, [pauseAutoAdvance, pauseModuleRendering]),
  );

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

  // navigate_next_lesson 액션: 같은 클래스의 다음 레슨으로 이동. 다음 레슨이 없으면 안내 후 학습 종료로 폴백.
  const handleNavigateNextLesson = useCallback(() => {
    clearAutoAdvanceTimer();
    const currentLessonId = (curLesson as any).lessonId ?? curLesson.id;
    const next = currentLessonId != null ? getNextLesson(Number(currentLessonId)) : null;

    if (!next) {
      Alert.alert('마지막 레슨입니다', '학습 결과 화면으로 이동합니다.', [
        {
          text: '확인',
          onPress: () => {
            (navigation as any).navigate('LessonReport', {
              curLesson: {
                ...curLesson,
                isCompleted: true,
                completedAt: new Date().toISOString(),
              },
            });
          },
        },
      ]);
      return;
    }

    (navigation as any).navigate('LessonReport', {
      curLesson: {
        ...curLesson,
        isCompleted: true,
        completedAt: new Date().toISOString(),
      },
      nextLessonId: next.lesson.id,
    });
  }, [navigation, curLesson, clearAutoAdvanceTimer, getNextLesson]);

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

    // 정·오답 그래픽 피드백 — 화면 가장자리 라디얼 글로우, 색상만 다름 (정답=녹색, 오답=빨강).
    setFlashKind(isCorrect ? 'correct' : 'wrong');
    setTimeout(() => setFlashKind(null), 900);

    // 현재 슬라이더의 퀴즈 인덱스와, 퀴즈 이후의 원래(=manualRender 아닌, trigger 없는) 모듈들
    const quizIdx = currentSlider.modules.findIndex((m) => m.id === problemModule.id);
    const remainingOriginalModules = currentSlider.modules
      .slice(quizIdx + 1)
      .filter((m: any) => !m.manualRender && !m.trigger);

    // trigger 메타로 이 퀴즈에 매칭되는 평면 모듈. 평면 어디에든 있을 수 있어 스크롤이 끊기므로,
    // 채점 시점에 quizIdx+1 위치로 재배치 + manualRender 부여 (이전 result.modules insert 방식 미러).
    const triggeredModules = findTriggeredModules(currentSlider, problemModule.id, 'afterGrading', isCorrect);
    const triggeredWithFlag = triggeredModules.map((m: any) => ({ ...m, manualRender: true }));

    if (triggeredWithFlag.length > 0) {
      const triggeredIds = new Set(triggeredWithFlag.map((m: any) => m.id));
      const newLesson = { ...curLesson };
      const newSliders = [...newLesson.sliders];
      const originalModules = [...newSliders[currentSliderIndex].modules];
      const withoutTriggered = originalModules.filter((m: any) => !triggeredIds.has(m.id));
      const quizIdxInFiltered = withoutTriggered.findIndex((m: any) => m.id === problemModule.id);
      const insertIdx = quizIdxInFiltered + 1;
      const newModulesArray = [
        ...withoutTriggered.slice(0, insertIdx),
        ...triggeredWithFlag,
        ...withoutTriggered.slice(insertIdx),
      ];
      newSliders[currentSliderIndex] = {
        ...newSliders[currentSliderIndex],
        modules: newModulesArray,
      };
      newLesson.sliders = newSliders;
      setCurLesson(newLesson);
    }

    // 순차 등장 시퀀스: 재배치된 trigger 모듈 → 퀴즈 이후 원래 모듈
    const sequence = [...triggeredWithFlag, ...remainingOriginalModules];
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
        }, 50);
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

  // 터미널 모듈의 스크립트(어드민에서 입력된 코드)를 백엔드 executor 로 실행해
  // 결과 stream 을 해당 터미널 WebView 로 전달.
  // 다중 탭(files[]) → 첫 번째 파일, 단일 탭(루트 script[]) → 그대로 사용.
  // 어드민 codeToScript() 가 라인 단위로 type:'input' 분리 저장하므로 filter+join 으로 코드 전체 복원.
  const runTerminalCode = useCallback((terminalModule: any) => {
    let scriptArr: any[] | undefined;
    let scriptLang: string | undefined;
    if (Array.isArray(terminalModule.files) && terminalModule.files.length > 0) {
      const firstFile = terminalModule.files[0];
      scriptArr = firstFile?.script;
      scriptLang = firstFile?.language;
    } else if (Array.isArray(terminalModule.script)) {
      scriptArr = terminalModule.script;
      scriptLang = terminalModule.language;
    }

    const codeToExecute = (scriptArr || [])
      .filter((s: any) => !s?.type || s.type === 'input')
      .map((s: any) => s?.text || '')
      .join('\n');

    if (!codeToExecute.trim()) return;

    const language = scriptLang || 'js';

    // 캐시 우선 — 백엔드가 stale 검증해서 보내므로 존재 시 그대로 신뢰. 다중 탭은 첫 탭의 cachedResult, 단일은 모듈 자체.
    const cachedResult = (Array.isArray(terminalModule.files) && terminalModule.files.length > 0)
      ? terminalModule.files[0]?.cachedResult
      : terminalModule.cachedResult;

    const startStream = () => {
      lessonService.runCachedOrStream({
        code: codeToExecute,
        language,
        cachedResult,
        executionMode: terminalModule.executionMode,
        onMessage: (data) => {
          let text = data.data;
          if (!text) return;
          const isError = data.type === 'error';
          if (data.type !== 'output' && !isError) return;
          text = text.replace(/\n/g, '\r\n');
          terminalRefs.current[terminalModule.id]?.addStreamText(text, isError);
        },
        onError: (error) => {
          const errorMsg = `\r\n\x1b[31m[Error] ${error}\x1b[0m\r\n`;
          terminalRefs.current[terminalModule.id]?.addStreamText(errorMsg, true);
        },
        onComplete: () => {},
      });
    };

    // 터미널 WebView 준비 대기 (최대 10초, 200ms 폴링)
    let pollCount = 0;
    const maxPolls = 50;
    const pollInterval = 200;
    const waitForTerminalReady = () => {
      const terminal = terminalRefs.current[terminalModule.id];
      if (terminal) {
        setTimeout(startStream, 1500);
      } else if (pollCount < maxPolls) {
        pollCount++;
        setTimeout(waitForTerminalReady, pollInterval);
      } else {
        startStream();
      }
    };
    waitForTerminalReady();
  }, []);

  // simpleTerminal: linkedModuleId 가 가리키는 code 모듈의 코드를 실행하거나, codeFillTheGapV2 와 연결된
  // 경우 학생 answers 로 빈칸을 합성해 실행. cachedResult/cachedResults 우선 사용.
  // afterGrading 트리거인 경우 학생 입력값으로 initialCommand 토큰 치환 적용.
  const runSimpleTerminalModule = useCallback((stModule: any, slider: any) => {
    const linkedId = stModule.linkedModuleId;
    if (linkedId == null) return;
    const linked = slider.modules.find((m: any) => String(m.id) === String(linkedId));
    if (!linked) return;

    // initialCommand 출력 (트리거가 afterGrading 이면 학생 답으로 토큰 치환)
    const renderInitialCommand = () => {
      if (!stModule.initialCommand) return;
      let text = String(stModule.initialCommand);
      const trig = stModule.trigger;
      if (trig?.type === 'afterGrading') {
        const sourceQuiz = slider.modules.find((m: any) => String(m.id) === String(trig.sourceModuleId));
        const userAnswers = (sourceQuiz?.answers || []).map((a: any) => a?.userAnswer ?? '');
        text = text.replace(/\{\{userAnswer_(\d+)\}\}/g, (mm: string, n: string) => {
          const i = parseInt(n, 10);
          return userAnswers[i] !== undefined ? String(userAnswers[i]) : mm;
        });
      }
      const line = `$ ${text}\r\n`;
      terminalRefs.current[stModule.id]?.addStreamText(line, false);
    };

    let codeToExecute = '';
    let language = 'javascript';
    let cachedResult: any = undefined;

    if (linked.type === 'code') {
      const files = (linked.files || []) as Array<{ language?: string; content?: string }>;
      codeToExecute = files.map((f) => f?.content || '').join('\n');
      language = files[0]?.language || 'javascript';
      cachedResult = stModule.cachedResult;
    } else if (linked.type === 'codeFillTheGapV2') {
      const plainCode = String(linked.plainCode || '');
      const blanks = (linked.blanks || []) as Array<{ start: number; end: number }>;
      const answers = (linked.answers || []) as Array<{ userAnswer?: any }>;
      const ordered = blanks
        .map((b, i) => ({ b, i }))
        .sort((a, x) => x.b.start - a.b.start);
      let out = plainCode;
      for (const { b, i } of ordered) {
        const replacement = answers[i]?.userAnswer ?? '';
        out = out.slice(0, b.start) + String(replacement) + out.slice(b.end);
      }
      codeToExecute = out;
      language = linked.language || 'javascript';
      const answerKey = buildAnswerKey(answers as any);
      cachedResult = stModule.cachedResults?.[answerKey];
    } else {
      return;
    }
    if (!codeToExecute.trim()) return;

    const startStream = () => {
      renderInitialCommand();
      lessonService.runCachedOrStream({
        code: codeToExecute,
        language,
        cachedResult,
        executionMode: stModule.executionMode,
        onMessage: (data) => {
          let text = data.data;
          if (!text) return;
          const isError = data.type === 'error';
          if (data.type !== 'output' && !isError) return;
          text = text.replace(/\n/g, '\r\n');
          terminalRefs.current[stModule.id]?.addStreamText(text, isError);
        },
        onError: (error) => {
          const errorMsg = `\r\n\x1b[31m[Error] ${error}\x1b[0m\r\n`;
          terminalRefs.current[stModule.id]?.addStreamText(errorMsg, true);
        },
        onComplete: () => {},
      });
    };

    let pollCount = 0;
    const maxPolls = 50;
    const pollInterval = 200;
    const waitForTerminalReady = () => {
      const terminal = terminalRefs.current[stModule.id];
      if (terminal) {
        setTimeout(startStream, 1500);
      } else if (pollCount < maxPolls) {
        pollCount++;
        setTimeout(waitForTerminalReady, pollInterval);
      } else {
        startStream();
      }
    };
    waitForTerminalReady();
  }, []);

  // 등장 트리거 평가 — 슬라이드 내 trigger 메타가 매칭되는 모듈 목록 반환.
  const findTriggeredModules = useCallback(
    (slider: any, sourceId: number | string, eventType: 'afterGrading' | 'afterButtonClick', isCorrect: boolean) => {
      return (slider?.modules || []).filter((m: any) => {
        const t = m.trigger;
        if (!t || t.type !== eventType) return false;
        if (String(t.sourceModuleId) !== String(sourceId)) return false;
        if (eventType === 'afterGrading' && t.branch && t.branch !== 'all') {
          return t.branch === 'correct' ? isCorrect : !isCorrect;
        }
        return true;
      });
    },
    [],
  );

  // actionButton 클릭:
  //   1) afterButtonClick 트리거 매칭 모듈을 buttonIdx+1 위치로 재배치 + manualRender 부여.
  //   2) role='gate' 인 경우 → 버튼 이후 자동 시퀀스에서 빠져있던 원래 모듈도 시퀀스에 합류.
  //   3) sequence(trigger → remaining)를 cumulativeDelay 누적해 순차 등장.
  // 액션 분기: action.type 에 따라 학습 종료 / 다음 레슨 이동을 우선 실행.
  // 이외(executeCode/undefined/모르는 type)는 기존 trigger 시퀀스 로직으로 폴백.
  const runActionByType = useCallback((action: any): boolean => {
    if (!action || typeof action !== 'object') return false;
    if (action.type === 'end_lesson') { handleLessonComplete(); return true; }
    if (action.type === 'navigate_next_lesson') { handleNavigateNextLesson(); return true; }
    return false;
  }, [handleLessonComplete, handleNavigateNextLesson]);

  const handleActionButtonClick = useCallback((sourceId: number | string, overrideAction?: any) => {
    const slider = curLesson.sliders[currentSliderIndex];
    if (!slider) return;
    const sourceMod: any = slider.modules.find((m: any) => String(m.id) === String(sourceId));
    if (!sourceMod) return;

    // 1) 우선 액션 분기: navigate_next_lesson / end_lesson 은 즉시 처리 후 종료.
    //    actionButtons 처럼 module 자체 action 이 아니라 버튼별 action 인 경우 overrideAction 으로 받음.
    const effectiveAction = overrideAction ?? sourceMod.action;
    if (runActionByType(effectiveAction)) return;

    // actionButton 기본 동작은 게이트 — role 미설정 / 'gate' 둘 다 게이트로 처리. 'default' 만 논블록.
    const isGate = sourceMod.role !== 'default';

    const triggered = findTriggeredModules(slider, sourceId, 'afterButtonClick', true);
    const triggeredWithFlag = triggered.map((m: any) => ({ ...m, manualRender: true }));

    // 게이트가 아니고 trigger 모듈도 없으면 처리할 게 없음
    if (triggeredWithFlag.length === 0 && !isGate) return;

    // 1) 재배치: trigger 모듈을 buttonIdx+1 로 이동 + manualRender 부여
    let buttonIdx = slider.modules.findIndex((m: any) => String(m.id) === String(sourceId));
    if (triggeredWithFlag.length > 0) {
      const triggeredIds = new Set(triggeredWithFlag.map((m: any) => m.id));
      const newLesson = { ...curLesson };
      const newSliders = [...newLesson.sliders];
      const originalModules = [...newSliders[currentSliderIndex].modules];
      const withoutTriggered = originalModules.filter((m: any) => !triggeredIds.has(m.id));
      const buttonIdxInFiltered = withoutTriggered.findIndex((m: any) => String(m.id) === String(sourceId));
      const insertIdx = buttonIdxInFiltered + 1;
      const newModulesArray = [
        ...withoutTriggered.slice(0, insertIdx),
        ...triggeredWithFlag,
        ...withoutTriggered.slice(insertIdx),
      ];
      newSliders[currentSliderIndex] = {
        ...newSliders[currentSliderIndex],
        modules: newModulesArray,
      };
      newLesson.sliders = newSliders;
      setCurLesson(newLesson);
      buttonIdx = buttonIdxInFiltered;
    }

    // 2) 게이트면 버튼 이후 원래 모듈도 시퀀스 합류 (trigger 가진 모듈은 trigger 이벤트로만 등장)
    const remainingOriginal = isGate
      ? slider.modules.slice(buttonIdx + 1).filter((m: any) => !m.manualRender && !m.trigger)
      : [];

    const sequence = [...triggeredWithFlag, ...remainingOriginal];
    let cumulativeDelay = 0;

    sequence.forEach((mod: any) => {
      const showDelay = cumulativeDelay;
      let moduleDuration = mod.visibility?.type === 'duration' ? (mod.visibility.time || 0) : 0;
      if (mod.speeches) {
        const totalSpeechDuration = mod.speeches.reduce((sum: number, speech: any) => {
          return sum + (speech.visibility?.type === 'duration' ? (speech.visibility.time || 0) : 0);
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

        if (mod.tts && !mod.speeches) playTTS(mod.tts);

        if (mod.speeches) {
          let speechCumulativeDelay = 0;
          mod.speeches.forEach((speech: any) => {
            const speechShowDelay = speechCumulativeDelay;
            const speechDuration = speech.visibility?.type === 'duration' ? (speech.visibility.time || 0) : 0;
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
              if (speech.tts) playTTS(speech.tts);
            }, speechShowDelay);
            speechCumulativeDelay += speechDuration;
          });
        }

        setTimeout(() => {
          const latestSlider = curLesson.sliders[currentSliderIndex];
          const idxInSlider = latestSlider?.modules.findIndex((m: any) => m.id === mod.id) ?? -1;
          scrollToModule(mod.id, idxInSlider);
        }, 50);
      }, showDelay);

      cumulativeDelay += moduleDuration;
    });
  }, [curLesson, currentSliderIndex, findTriggeredModules, playTTS, scrollToModule, runActionByType]);

  // 일반 슬라이드의 terminal/simpleTerminal 모듈은 visible 되는 순간 자동으로 코드 실행 트리거.
  // manualRender 플래그가 있더라도 trigger(afterButtonClick/afterGrading)로 등장한 simpleTerminal 도
  // 결과를 출력해야 하므로 가드하지 않는다. triggeredTerminalsRef 가 중복 실행을 방지함.
  useEffect(() => {
    const slider = curLesson.sliders[currentSliderIndex];
    if (!slider) return;
    visibleModules.forEach((mid) => {
      if (triggeredTerminalsRef.current.has(mid)) return;
      const module = slider.modules.find((m: any) => m.id === mid);
      if (!module) return;
      if (module.type === 'terminal') {
        triggeredTerminalsRef.current.add(mid);
        runTerminalCode(module);
      } else if (module.type === 'simpleTerminal') {
        triggeredTerminalsRef.current.add(mid);
        runSimpleTerminalModule(module, slider);
      }
    });
  }, [visibleModules, currentSliderIndex, curLesson.sliders, runTerminalCode, runSimpleTerminalModule]);

  // 슬라이드 변경 시 트리거 기록 초기화 — 슬라이드 재방문 시 다시 실행되도록.
  useEffect(() => {
    triggeredTerminalsRef.current = new Set();
  }, [currentSliderIndex]);

  // codeFillTheGapV2 완료 후 trigger=afterGrading 매칭 모듈 + 퀴즈 이후 원래 모듈을 순차 등장.
  // simpleTerminal 의 코드 실행 + 토큰 치환은 runSimpleTerminalModule 에서 visible 시점에 자동 처리.
  const handleCodeFillTheGapSubmit = (completedModuleId: number, isCorrect: boolean = true) => {
    const problemModule = currentSlider.modules.find((m) => m.id === completedModuleId);
    if (!problemModule || problemModule.type !== 'codeFillTheGapV2') {
      return;
    }

    // 정·오답 그래픽 피드백 — 화면 가장자리 라디얼 글로우, 색상만 다름 (정답=녹색, 오답=빨강).
    setFlashKind(isCorrect ? 'correct' : 'wrong');
    setTimeout(() => setFlashKind(null), 900);

    // 현재 슬라이더 내 퀴즈 인덱스 + 퀴즈 이후 trigger 없는 원래 모듈 계산.
    // result/allResult/correctResult/incorrectResult 합치는 legacy 분기는 모두 제거됨 — trigger 평가로 단일화.
    const quizIdx = currentSlider.modules.findIndex((m) => m.id === problemModule.id);
    const remainingOriginalModules = currentSlider.modules
      .slice(quizIdx + 1)
      .filter((m: any) => !m.manualRender && !m.trigger);

    // trigger 메타로 이 빈칸채우기에 매칭되는 평면 모듈 (simpleTerminal 등).
    // 채점 시점에 quizIdx+1 위치로 재배치 + manualRender 부여 — 자동 스크롤이 자연스럽게 source 직후로.
    // simpleTerminal 의 SSE 스트림은 visible 되는 순간 runSimpleTerminalModule 이 자동 처리.
    const triggeredModules = findTriggeredModules(currentSlider, problemModule.id, 'afterGrading', isCorrect);
    const triggeredWithFlag = triggeredModules.map((m: any) => ({ ...m, manualRender: true }));

    if (triggeredWithFlag.length > 0) {
      const triggeredIds = new Set(triggeredWithFlag.map((m: any) => m.id));
      const newLesson = { ...curLesson };
      const newSliders = [...newLesson.sliders];
      const originalModules = [...newSliders[currentSliderIndex].modules];
      const withoutTriggered = originalModules.filter((m: any) => !triggeredIds.has(m.id));
      const quizIdxInFiltered = withoutTriggered.findIndex((m: any) => m.id === problemModule.id);
      const insertIdx = quizIdxInFiltered + 1;
      const newModulesArray = [
        ...withoutTriggered.slice(0, insertIdx),
        ...triggeredWithFlag,
        ...withoutTriggered.slice(insertIdx),
      ];
      newSliders[currentSliderIndex] = {
        ...newSliders[currentSliderIndex],
        modules: newModulesArray,
      };
      newLesson.sliders = newSliders;
      setCurLesson(newLesson);
    }

    const sequence = [...triggeredWithFlag, ...remainingOriginalModules];
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
        }, 50);
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

  const renderModule = (
    module: Module,
    moduleIdxInSlider: number,
    sliderIdx: number,
    visibleModulesFor: Set<number>,
    visibleSpeechIdsFor: Set<string>,
    visibleMissionItemIdsFor: Set<string>,
  ) => {
    const isActiveSlide = sliderIdx === currentSliderIndex;
    const slider = curLesson.sliders[sliderIdx];
    const isVisible = visibleModulesFor.has(module.id);

    // step 기반 모듈은 항상 표시 (result에서 추가된 모듈)
    const isStepBased = module.visibility?.type === 'step';

    // 🔹 프리로드 대상 모듈 타입 정의 (화면에 보이기 전 미리 마운트되어야 하는 모듈)
    const isPreloadType = module.type === 'webview' || module.type === 'code' || module.type === 'codeFillTheGapV2' || module.type === 'terminal' || module.type === 'simpleTerminal';

    const shouldMount = isPreloadType
      ? true  // 프리로드 타입은 항상 마운트 (현재 슬라이더 내 모든 모듈)
      : (isVisible || isStepBased); // 일반 모듈은 visibleModules에 있을 때만 마운트

    if (!shouldMount) {
      return null;
    }

    // 🔹 isActive: 실제로 화면에 보여줄지 여부 (프리로드된 모듈은 false)
    const isActive = isVisible || isStepBased;

    const shouldSkipAnimation = true;
    // 재방문 / 비활성 슬라이드 모두 entrance 스킵 (즉시 final state)
    const isRevisiting = !isActiveSlide || sliderIdx < maxReachedIndex;

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

      case 'quote': {
        const wrappedQuote = {
          ...module,
          type: 'paragraph',
          iconHidden: true,
          content: `<div class="callout-box">${module.content ?? ''}</div>`,
        };
        content = <ParagraghComponentV2 module={wrappedQuote as any} skipAnimation={shouldSkipAnimation} />;
        break;
      }

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

      case 'simpleTerminal':
        // 연결된 code/codeFillTheGapV2 의 실행 결과 표시 — runSimpleTerminalModule 에서 자동 트리거.
        content = (
          <TerminalComponent
            ref={(el) => {
              if (el) terminalRefs.current[module.id] = el;
            }}
            module={{
              height: (module as any).height || 120,
              files: [{
                name: 'output',
                language: 'js',
                script: [],
                showInput: false,
                autoRun: false,
              }],
            } as any}
            isActive={isActive}
          />
        );
        break;

      case 'actionButton':
        content = (
          <ActionButtonComponent
            module={module as any}
            onPress={() => handleActionButtonClick(module.id)}
          />
        );
        break;

      case 'actionButtons':
        content = (
          <ActionButtonsComponent
            module={module as any}
            onButtonPress={(_buttonId, action) => handleActionButtonClick(module.id, action)}
          />
        );
        break;

      case 'characterSpeechBubble':
        content = (
          <CharacterSpeechBubbleComponent
            module={module as any}
            visibleSpeechIds={visibleSpeechIdsFor}
            currentAudioTime={currentAudioTime}
            currentAudioUrl={currentAudioUrl}
            highlightDisabled={isRevisiting}
            onSpeechLayout={(speechKey, y) => {
              speechRelativeYRef.current[`${sliderIdx}-${speechKey}`] = y;
            }}
            skipEnter={isRevisiting}
          />
        );
        break;

      case 'missionList':
        content = (
          <MissionListComponent
            module={module as any}
            visibleItemIds={visibleMissionItemIdsFor}
            onItemLayout={(itemKey, y) => {
              missionItemRelativeYRef.current[`${sliderIdx}-${itemKey}`] = y;
            }}
            skipEnter={isRevisiting}
          />
        );
        break;

      case 'tagDescriptionList':
        content = <TagDescriptionListComponent module={module as any} />;
        break;

      case 'multipleChoice':
        content = (
          <MultipleChoiceComponent
            curSlideIndex={sliderIdx}
            moduleIndex={slider.modules.findIndex((m) => m.id === module.id)}
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
            curSlideIndex={sliderIdx}
            moduleIndex={slider.modules.findIndex((m) => m.id === module.id)}
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
            curSlideIndex={sliderIdx}
            moduleIndex={slider.modules.findIndex((m) => m.id === module.id)}
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

    // isPreloadType 모듈은 항상 ModuleEnter wrap 유지 (isActive=false 일 때 height:0 으로 자리 미차지)
    // → WebView/Code/Terminal 등의 unmount/remount 로 인한 재로딩 방지.
    // 일반 모듈은 isActive=false 면 null 반환 (마운트 자체 안 함).
    if (!isActive && !isPreloadType) {
      return null;
    }

    // 캐릭터 말풍선은 ModuleEnter 의 컨테이너 fade/slide 를 스킵 — 첫 말풍선(SpeechItem)
    // 자체가 등장 애니메이션을 갖고 있어 컨테이너 entrance 와 분리되어 어색했음.
    // 모듈이 등장하자마자 첫 말풍선이 짧은 delay 후 등장하는 한 흐름으로 통합.
    const skipModuleEnter = isRevisiting || module.type === 'characterSpeechBubble';

    return (
      <ModuleEnter
        key={`module-${module.id}`}
        isActive={isActive}
        skipEnter={skipModuleEnter}
        index={moduleIdxInSlider}
        style={{ marginBottom: 60 }}
        onLayout={(event) => {
          if (!modulePositionsRef.current[sliderIdx]) {
            modulePositionsRef.current[sliderIdx] = {};
          }
          modulePositionsRef.current[sliderIdx][module.id] = event.nativeEvent.layout.y;
        }}
      >
        {content}
      </ModuleEnter>
    );
  };

  // 슬라이드별 모듈 렌더 — 이전 슬라이드는 sliderVisible*Ids 캐시를 기반으로 즉시 final state.
  const renderModulesForSlider = (sliderIdx: number) => {
    const isActiveSlide = sliderIdx === currentSliderIndex;
    const slider = curLesson.sliders[sliderIdx];
    if (!slider) return null;
    // active 슬라이드는 라이브 state, 이전 슬라이드는 캐시된 set 사용
    const visibleModulesFor = isActiveSlide
      ? visibleModules
      : (sliderVisibleModules.get(sliderIdx) ?? new Set<number>());
    const visibleSpeechIdsFor = isActiveSlide
      ? visibleSpeechIds
      : (sliderVisibleSpeechIds.get(sliderIdx) ?? new Set<string>());
    const visibleMissionItemIdsFor = isActiveSlide
      ? visibleMissionItemIds
      : (sliderVisibleMissionItemIds.get(sliderIdx) ?? new Set<string>());

    return slider.modules.map((module, idx) =>
      renderModule(module, idx, sliderIdx, visibleModulesFor, visibleSpeechIdsFor, visibleMissionItemIdsFor),
    );
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

  const direction = currentSliderIndex - prevSliderIndexRef.current;
  // direction 계산 직후 ref 동기화 — 다음 렌더에 사용
  useEffect(() => {
    prevSliderIndexRef.current = currentSliderIndex;
  }, [currentSliderIndex]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/* 슬라이드 전환 시 배경 그라디언트 cross-fade morph. 양방향 모두 자연스럽게 morph. */}
      <AnimatedSlideBackground
        background={currentSlider.background}
        transitionKey={currentSliderIndex}
      />

      <GestureDetector gesture={composedGesture}>
        <View
          className="flex-1"
        >
          {/* Header — 슬라이드 전환과 무관하게 항상 고정 */}
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

              {/* Progress Bar — 글로우 채움 + 끝 동그라미 bounce */}
              <ProgressSegments
                total={curLesson.sliders.length}
                currentIndex={currentSliderIndex}
              />

              {/* Pause/Resume Button */}
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
            <AnimatedSlideTitle
              transitionKey={currentSliderIndex}
              direction={slideDirection}
            >
              <Text className="bold-16 text-Text-Black_Secondary tracking-[-0.32px]">
                {curLesson.sliders[currentSliderIndex].title}
              </Text>
            </AnimatedSlideTitle>
          </View>

          {/* Content — 현재 슬라이드 기준 ±SLIDE_KEEP_ALIVE_WINDOW 슬라이드만 마운트(keep-alive 윈도우).
              슬라이드를 다 본 상태(maxReachedIndex 큰 상태)에서 모든 슬라이드를 동시에 마운트하면
              WebView/Terminal/Code 같은 무거운 모듈이 잔뜩 마운트돼서 슬라이드 변경마다
              React reconciliation 비용이 폭증 → 강제 이동 시 1~2초 latency 의 원인.
              윈도우 안 슬라이드만 마운트하여 reconcile 대상을 줄이고, 윈도우 밖은 unmount.
              윈도우 안에서는 여전히 native state (WebView 등) 가 보존됨. */}
          <View style={{ flex: 1, position: 'relative' }}>
            {Array.from({ length: maxReachedIndex + 1 }).map((_, sliderIdx) => {
              const distanceFromActive = Math.abs(sliderIdx - currentSliderIndex);
              if (distanceFromActive > SLIDE_KEEP_ALIVE_WINDOW) return null;
              const isActiveSlide = sliderIdx === currentSliderIndex;
              return (
                <SlidePageContainer
                  key={`slider-page-${sliderIdx}`}
                  isActive={isActiveSlide}
                  zIndex={isActiveSlide ? 2 : 1}
                  direction={slideDirection}
                >
                  <ScrollView
                    ref={(ref) => { scrollViewRefs.current[sliderIdx] = ref; }}
                    className="flex-1"
                    contentContainerStyle={{
                      paddingHorizontal: 16,
                      paddingVertical: 20,
                      paddingBottom: SCREEN_HEIGHT / 2,
                    }}
                    showsVerticalScrollIndicator={false}
                    scrollEnabled={isActiveSlide}
                    simultaneousHandlers={[]}
                  >
                    {renderModulesForSlider(sliderIdx)}
                  </ScrollView>
                </SlidePageContainer>
              );
            })}
          </View>

          {/* 슬라이드 전환 모션(horizontal slide + parallax) 자체가 방향감을 주므로
              별도 사이드 글로우/베일은 두지 않음 (Apple HIG 톤 — 보조 인디케이터 최소화). */}
          <AudioPlayer
            key={currentAudioUrl}
            audioUrl={currentAudioUrl}
            paused={isPaused}
            onProgress={handleAudioProgress}
          />
        </View>
      </GestureDetector>

      {/* 정·오답 시 화면 가장자리 라디얼 글로우 — 정답=녹색, 오답=빨강. 인터랙션에 영향 X */}
      <EdgeRadialGlow
        active={flashKind !== null}
        color={flashKind === 'correct' ? '#08875D' : '#E02D3C'}
      />

      {/* 학습 페이지 토스트 — 퀴즈 미해결 시 슬라이드 차단 안내 */}
      <QuizGateToast
        visible={!!toastMsg}
        message={toastMsg ?? ''}
        onHide={() => setToastMsg(null)}
      />

      {/* 종료 확인 시트 — X / Android back / iOS swipe-back 모두에서 활성화 */}
      <BottomSheet
        visible={showExitSheet}
        onClose={cancelExit}
        showHeader={false}
        scrollable={false}
        statusBarTranslucent
      >
        <View style={exitSheetStyles.body}>
          <Text style={exitSheetStyles.title}>학습을 종료하시겠어요?</Text>
          <Text style={exitSheetStyles.desc}>
            진행 중인 학습이 있어요.{'\n'}나가면 진행 상태가 저장되지 않을 수 있어요.
          </Text>
          <TouchableOpacity
            style={exitSheetStyles.destructiveBtn}
            onPress={confirmExit}
            activeOpacity={0.85}
          >
            <Text style={exitSheetStyles.destructiveBtnText}>종료하기</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={exitSheetStyles.neutralBtn}
            onPress={cancelExit}
            activeOpacity={0.85}
          >
            <Text style={exitSheetStyles.neutralBtnText}>취소</Text>
          </TouchableOpacity>
        </View>
      </BottomSheet>
    </GestureHandlerRootView>
  );
};

const exitSheetStyles = StyleSheet.create({
  body: {
    paddingTop: 4,
    // BottomSheet 의 contentContainer paddingVertical: 20 을 상쇄해 시각적 여백을 줄임.
    // modalContainer 의 paddingBottom: 40 (SafeArea 보호) 은 유지.
    marginBottom: -20,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111111',
    textAlign: 'center',
    marginBottom: 12,
    fontFamily: 'PretendardVariable',
  },
  desc: {
    fontSize: 14,
    lineHeight: 22,
    color: '#6C757D',
    textAlign: 'center',
    marginBottom: 24,
    fontFamily: 'PretendardVariable',
  },
  // 주요(파괴) 액션 — 종료하기는 학습을 끝내는 강한 액션이므로 빨간색.
  destructiveBtn: {
    backgroundColor: '#E02D3C',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 10,
  },
  destructiveBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'PretendardVariable',
  },
  // 보조 액션 — 취소는 현재 상태 유지이므로 회색 톤.
  neutralBtn: {
    backgroundColor: '#F8F9FC',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  neutralBtnText: {
    color: '#6C757D',
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'PretendardVariable',
  },
});

export default LessonLearningScreenV5;

