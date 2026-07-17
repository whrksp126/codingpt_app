import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, Dimensions, StatusBar, Platform, Alert, Keyboard, BackHandler, TouchableOpacity, unstable_batchedUpdates } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScrollView } from 'react-native-gesture-handler';

import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../contexts/ThemeContext';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import DefaultIconBtn from '../../components/Button/DefaultIconBtn';
import { X } from '../../assets/SvgIcon';
import { LessonBottomBar, CenterMode, NextMode } from '../../components/lesson/LessonBottomBar';
import { haptic } from '../../animations/haptics';

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
import { ENABLE_AUTO_SCROLL, ENABLE_TYPING_HIGHLIGHT, ENABLE_EVENT_DRIVEN_TTS } from '../../utils/featureFlags';

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
  type: 'paragraph' | 'quote' | 'webview' | 'code' | 'characterSpeechBubble' | 'missionList' | 'tagDescriptionList' | 'multipleChoice' | 'trueFalseChoice' | 'codeFillTheGapV2' | 'image' | 'terminal' | 'simpleTerminal' | 'actionButton' | 'actionButtons';
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

// =====================================================================
// 📌 TTS 종료 기반 타이밍 헬퍼 (이벤트 기반 순차 러너용)
// =====================================================================
type TtsPlayback = { url: string; durationMs: number | null };

// onEnd 미발화(로드 실패/네트워크 행) 대비 안전타이머 여유 버퍼.
const TTS_SAFETY_BUFFER_MS = 3000;

// tts 데이터가 "실제 재생 가능"한지 판정하고 재생 메타를 반환.
// - enabled === false 또는 url 없음 → null (비-TTS 경로)
// - durationMs: tts.duration(초)이 있으면 ms 로, 없으면(레거시 문자열) null → 안전타이머 fallback
const getTtsPlayback = (tts: any): TtsPlayback | null => {
  if (!tts) return null;
  if (typeof tts === 'object' && tts.enabled === false) return null;
  const url = typeof tts === 'string' ? tts : tts?.url;
  if (!url || String(url).trim() === '') return null;
  const durSec = typeof tts === 'object' ? tts.duration : undefined;
  const durationMs = typeof durSec === 'number' && durSec > 0 ? Math.round(durSec * 1000) : null;
  return { url: String(url), durationMs };
};

// duration 미상(레거시 문자열 등)일 때 안전타이머용 추정 길이(ms).
// timestamps 마지막 end 를 쓰고, 없으면 보수적 고정값.
const estimateTtsMs = (tts: any): number => {
  const align = typeof tts === 'object' ? (tts?.timestamps?.alignment ?? tts?.timestamps) : null;
  const chars = align?.characters;
  const words = align?.words;
  const arr = (chars && chars.length ? chars : words) as Array<{ end?: number }> | undefined;
  if (arr && arr.length) {
    const last = arr[arr.length - 1]?.end;
    if (typeof last === 'number' && last > 0) return Math.round(last * 1000);
  }
  return 8000; // 보수적 fallback
};

// 채점/버튼 후 순차 등장 시 한 모듈이 머무는 시간(다음 등장/자동넘김 전까지).
// visibility.duration / 말풍선 누적 / 실제 TTS 길이 중 최댓값을 써서 TTS 가 잘리지 않게 한다.
const seqModuleDwellMs = (mod: any): number => {
  let dwell = mod?.visibility?.type === 'duration' ? (mod.visibility.time || 0) : 0;
  const ttsOf = (tts: any) => {
    const pb = getTtsPlayback(tts);
    if (!pb) return 0;
    return (pb.durationMs ?? estimateTtsMs(tts)) + 600; // 약간의 여유
  };
  if (mod?.speeches && Array.isArray(mod.speeches)) {
    const speechTotal = mod.speeches.reduce((sum: number, s: any) => {
      const d = s?.visibility?.type === 'duration' ? (s.visibility.time || 0) : 0;
      return sum + Math.max(d, ttsOf(s.tts));
    }, 0);
    dwell = Math.max(dwell, speechTotal);
  } else {
    dwell = Math.max(dwell, ttsOf(mod?.tts));
  }
  return dwell;
};

// 슬라이드 타입별 고정 콘셉 색(각 색 계열 700) — 관리자가 정의한 5종.
//  시작=초록 / 목표=앰버 / 개념=파랑 / 퀴즈=빨강 / 엔딩=보라
const SLIDE_ACCENTS = {
  green: '#08875D',  // 시작(intro)
  amber: '#B25E09',  // 목표(goal)
  blue: '#2F6FED',   // 개념(concept)
  red: '#E02D3C',    // 퀴즈(quiz)
  purple: '#8B54F7', // 엔딩(ending)
};

// hex → 색상환 hue(0~360) + 채도. 무채색/파싱불가면 null.
const hexHueSat = (hex: string): { h: number; s: number } | null => {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(String(hex).trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  let r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    if (max === r) h = (((g - b) / d) % 6 + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h, s };
};

// 현재 슬라이드의 고정 콘셉 색 — 슬라이드 첫(아이콘) 모듈의 icon.fill 이 그 슬라이드의 700 색이다.
//   (시작 #08875D / 목표 #B25E09 / 개념 #2F6FED / 퀴즈 #E02D3C / 엔딩 #8B54F7)
// 아이콘이 없으면 배경 색조로 5색 중 최근접 매칭(폴백).
const getSlideAccent = (slider: any): string => {
  if (!slider) return SLIDE_ACCENTS.green;
  const mods: any[] = slider.modules || [];
  const iconFill: string | undefined = mods.find((m) => m?.icon?.fill)?.icon?.fill;
  if (iconFill && /^#?[0-9a-fA-F]{6}$/.test(String(iconFill).trim())) {
    const v = String(iconFill).trim();
    return v.startsWith('#') ? v : `#${v}`;
  }

  // 폴백: 배경에서 가장 또렷한 색의 hue → 5색 최근접.
  const colors: string[] = slider.background?.colors || [];
  let bestHue: number | null = null, bestSat = -1;
  for (const c of colors) {
    const hs = hexHueSat(c);
    if (hs && hs.s > bestSat) { bestSat = hs.s; bestHue = hs.h; }
  }
  if (bestHue === null || bestSat < 0.08) return SLIDE_ACCENTS.green;
  const cand = [
    { h: 160, c: SLIDE_ACCENTS.green },
    { h: 30, c: SLIDE_ACCENTS.amber },
    { h: 220, c: SLIDE_ACCENTS.blue },
    { h: 355, c: SLIDE_ACCENTS.red },
    { h: 262, c: SLIDE_ACCENTS.purple },
  ];
  let best = cand[0], bestD = 999;
  for (const k of cand) {
    const diff = Math.abs(bestHue - k.h);
    const dist = Math.min(diff, 360 - diff);
    if (dist < bestD) { bestD = dist; best = k; }
  }
  return best.c;
};

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
  // 채점 결과 텍스트(하단 바) — 정답/오답. 다음 모듈로 넘어갈 때 제거.
  const [gradeResult, setGradeResult] = useState<'correct' | 'wrong' | null>(null);
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
  // 현재 재생 중인 오디오의 전체 길이(초) — 모듈 진행바를 "실제 재생" 기반으로 채우기 위해 사용.
  const [currentAudioDuration, setCurrentAudioDuration] = useState(0);
  // AudioPlayer 의 key 에 포함되는 nonce — 매 playTTS 마다 증가시켜, 같은 url 을 다시 재생해도
  // 컴포넌트가 remount 되어 항상 "처음부터" 재생되게 한다(이어재생 시 중앙부터 잇는 문제 방지).
  const [audioNonce, setAudioNonce] = useState(0);
  // onProgress 핸들러 안정화 — inline 함수면 매 render 마다 새 reference 라
  // React.memo 가 AudioPlayer 의 props 비교에서 변경으로 인식해서 render skip 안 됨.
  const handleAudioProgress = useCallback(({ currentTime, seekableDuration }: { currentTime: number; seekableDuration?: number }) => {
    setCurrentAudioTime(currentTime);
    if (typeof seekableDuration === 'number' && seekableDuration > 0) {
      setCurrentAudioDuration(seekableDuration);
    }
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
    if (url && url.trim() !== '') {
      // 같은 url 이 아주 짧은 구간(600ms) 안에 다시 트리거되면 remount(처음부터 재시작)를 막는다.
      // (미션→말풍선 전환 등에서 동일 TTS 가 두 번 호출돼 "0.5초 재생 후 재시작"되던 문제 방지)
      const now = Date.now();
      if (url === lastPlayRef.current.url && now - lastPlayRef.current.at < 600) {
        return;
      }
      lastPlayRef.current = { url, at: now };
      setCurrentAudioUrl(url);
      setCurrentAudioTime(0);
      setCurrentAudioDuration(0); // 새 오디오 — 길이는 onProgress 가 보고할 때까지 미상
      setAudioNonce((n) => n + 1); // 같은 url 이어도 remount → 처음부터 재생
    } else {
      console.log('playTTS: URL이 비어있습니다');
    }
  }, []);
  // playTTS 중복 트리거 방지용 (마지막 재생 url/시각).
  const lastPlayRef = useRef<{ url: string; at: number }>({ url: '', at: 0 });

  // 재생 중인 TTS 를 즉시 정지(슬라이드 이동 등). url 을 비우면 AudioPlayer 가 remount 되어 멈춘다.
  const stopTTS = useCallback(() => {
    setCurrentAudioUrl('');
    setCurrentAudioTime(0);
    setCurrentAudioDuration(0);
    setAudioNonce((n) => n + 1);
    lastPlayRef.current = { url: '', at: 0 }; // 정지 후엔 같은 url 도 즉시 재생 허용
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

  // =========================================================================
  // 📌 이벤트 기반 순차 러너 (TTS 종료 후 유지 시간 모델)
  // - TTS 가 있는 슬라이드는 고정 setTimeout 배치 대신, 실제 재생 종료(onEnd) 이벤트를
  //   기다린 뒤 "유지 시간"(visibility.time 재해석)만큼 더 보여주고 다음 항목을 등장시킨다.
  // - TTS 없는 슬라이드는 runnerActiveRef=false 로 기존 배치 경로를 그대로 사용(회귀 방지).
  // =========================================================================
  type PausableTimer = {
    timeout: NodeJS.Timeout | null;
    startedAt: number;
    remaining: number;
    gen: number;
    cb: () => void;
  };
  type PendingTts = {
    url: string;
    gen: number;
    phase: 'playing' | 'holding';
    holdMs: number;
    // playing: 안전타이머 / holding: 유지시간 타이머 (둘 다 PausableTimer 형태)
    safety: PausableTimer | null;
    hold: PausableTimer | null;
  };
  const appearanceQueueRef = useRef<any[]>([]); // AppearanceItem[]
  const queueCursorRef = useRef(0);
  const runnerGenRef = useRef(0);          // 슬라이드/리셋마다 증가 → stale 콜백 무효화
  const runnerActiveRef = useRef(false);   // 현재 슬라이드가 러너로 구동되는지
  const runnerStartedRef = useRef(false);  // 재방문 시 ▶ 전까지 false
  const pendingTtsRef = useRef<PendingTts | null>(null);
  const enterTimerRef = useRef<PausableTimer | null>(null);   // 항목 등장 전 진입 갭
  const fixedTimerRef = useRef<PausableTimer | null>(null);   // 비-TTS 항목의 고정 대기
  const runStepRef = useRef<((gen: number) => void) | null>(null); // 현재 슬라이드의 러너 진입점(메인 effect 가 세팅)
  // 완료된 슬라이드 인덱스 집합 — "완료" = 스케줄러(러너/배치)가 큐 끝까지 도달(마지막 TTS·유지까지).
  // TTS 재생 중 이탈하면 미완료로 남아, 재생 버튼 시 다시 찾아가 끊긴 TTS 를 처음부터 재생한다.
  const completedSlidersRef = useRef<Set<number>>(new Set());
  // 재생 버튼으로 미완료 슬라이드로 점프할 때, 그 슬라이드 effect 가 러너를 빌드한 뒤 즉시 시작하도록 하는 플래그.
  const pendingAutoStartRef = useRef(false);
  // "현재 슬라이드 초기화" 시 원본(모듈 순서 + 퀴즈 답)으로 되돌리기 위한 신선한 스냅샷. 레슨 로드 1회 보관.
  const originalSlidersRef = useRef<any[] | null>(null);
  const snapshotKeyRef = useRef<string | null>(null);

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
  // lessonId 가 있으면 백엔드 fetch 완료 전까지 스케줄러를 보류한다.
  //   - lessonData 부트스트랩이 있어도 그것으로 먼저 스케줄링하면(과거 동작) 첫 모듈을 등장시켜
  //     visible 상태를 오염시키고, fetch 후 재실행 시 reset 이 그 모듈의 TTS onEnd 대기를 날리고
  //     큐 빌드에서 "이미 본 모듈"로 제외해 다음 모듈이 TTS 종료 전에 등장하는 버그가 생긴다.
  //   - 따라서 lessonId 가 있으면 fetch 결과(성공/실패 무관, 아래 effect) 로 단 한 번만 스케줄링한다.
  //     부트스트랩 데이터는 렌더(정적 표시)에만 쓰이고 타이머는 신선한 DB 데이터에서만 시작.
  const [isLessonReady, setIsLessonReady] = useState<boolean>(() => {
    const params = route.params as any;
    return !params?.lessonId;
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
      if (cancelled) return;
      if (data) {
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
      }
      // 성공/실패(데이터 없음) 무관하게 스케줄링 개시 — 데이터가 없으면 부트스트랩(lessonData/fallback)으로 진행.
      // (이 한 번의 ready 전환이 신선한 데이터에서의 유일한 스케줄링 실행을 보장 → 이중 실행 레이스 제거)
      setIsLessonReady(true);
    }).catch(() => {
      if (!cancelled) setIsLessonReady(true);
    });
    return () => { cancelled = true; };
  }, [route.params]);

  // 레슨 데이터가 준비되면 신선한 원본 슬라이드를 1회 스냅샷(초기화 복원용).
  // 채점/버튼클릭으로 curLesson 이 변형되어도(같은 키) 재스냅샷하지 않는다.
  useEffect(() => {
    if (!isLessonReady) return;
    const key = String((curLesson as any)?.lessonId ?? curLesson?.id ?? 'x');
    if (snapshotKeyRef.current === key && originalSlidersRef.current) return;
    if (snapshotKeyRef.current !== key) {
      originalSlidersRef.current = JSON.parse(JSON.stringify(curLesson.sliders));
      snapshotKeyRef.current = key;
    }
  }, [isLessonReady, curLesson]);

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

  // =========================================================================
  // 📌 퀴즈 상태 헬퍼 — 하단 액션 바의 "채점하기" 흐름에 사용.
  // =========================================================================
  const isQuizType = (m: any): boolean =>
    m?.type === 'multipleChoice' || m?.type === 'trueFalseChoice' || m?.type === 'codeFillTheGapV2';

  // 게이트(퀴즈 / actionButton role!=='default') — 이후 모듈은 게이트 해소 후 등장.
  const isGateModule = (m: any): boolean =>
    isQuizType(m) || (m?.type === 'actionButton' && m?.role !== 'default');

  // codeFillTheGapV2 의 빈칸 답 배열 — V2(module.answers) 우선, 없으면 V1(files[].answers) 평탄화.
  const getCodeFillAnswers = (m: any): any[] => {
    if (Array.isArray(m?.answers) && m.answers.length) return m.answers;
    if (Array.isArray(m?.files)) return m.files.flatMap((f: any) => f?.answers || []);
    return [];
  };

  // 사용자가 답을 모두 선택/입력했는지 (채점 가능 상태)
  const isQuizAnswered = (m: any): boolean => {
    if (m?.type === 'multipleChoice' || m?.type === 'trueFalseChoice') {
      const qs = m.questions || [];
      return qs.length > 0 && qs.every((q: any) => q.answer?.userAnswer !== null && q.answer?.userAnswer !== undefined);
    }
    if (m?.type === 'codeFillTheGapV2') {
      const a = getCodeFillAnswers(m);
      return a.length > 0 && a.every((x: any) => x.userAnswer !== null && x.userAnswer !== undefined);
    }
    return false;
  };

  // 이미 채점되었는지 (isCorrect 가 채워졌는지)
  const isQuizGraded = (m: any): boolean => {
    if (m?.type === 'multipleChoice' || m?.type === 'trueFalseChoice') {
      const qs = m.questions || [];
      return qs.length > 0 && qs.every((q: any) => q.answer?.isCorrect !== null && q.answer?.isCorrect !== undefined);
    }
    if (m?.type === 'codeFillTheGapV2') {
      const a = getCodeFillAnswers(m);
      return a.length > 0 && a.every((x: any) => x.isCorrect !== null && x.isCorrect !== undefined);
    }
    return false;
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
  const goToSlide = useCallback((newIndex: number, autoPlay = false) => {
    const savedModules = sliderVisibleModules.get(newIndex);
    const savedSpeeches = sliderVisibleSpeechIds.get(newIndex);
    const savedMissions = sliderVisibleMissionItemIds.get(newIndex);
    const isRevisit = !!savedModules;

    // 슬라이드 이동 시 재생 중이던 TTS 즉시 정지 — 옛 오디오가 다음/이전 슬라이드로 이어지는 것 방지.
    stopTTS();
    // 진행 중이던 채점 후 순차 등장(seq) 중단.
    if (seqRef.current?.safety) clearTimeout(seqRef.current.safety);
    seqRef.current = null;

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
      setGradeResult(null); // 슬라이드 이동 시 채점 결과 텍스트 제거
      // 재방문은 기본적으로 자동 일시정지로 시작(사용자가 ▶ 를 눌러야 안 본 모듈 등장).
      // 단, autoPlay(재생 버튼으로 미완료 슬라이드 점프)면 즉시 재생.
      setIsPaused(autoPlay ? false : isRevisit);
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

  // 러너가 큐 종료 시점에 stale 없이 최신 startAutoAdvance 를 호출하기 위한 미러 ref.
  const startAutoAdvanceRef = useRef(startAutoAdvance);
  startAutoAdvanceRef.current = startAutoAdvance;

  useEffect(() => {
    // lessonId fetch 가 아직 끝나지 않았다면 스케줄링 보류 — fetch 완료 후 effect 재실행 시 시작.
    if (!isLessonReady) return;

    // 슬라이드 변경 시 자동 넘김 관련 모든 상태 초기화 (일시정지 포함)
    resetAutoAdvanceState();

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

    // 이벤트 기반 러너 리셋 — 세대 증가로 이전 슬라이드의 늦은 onEnd/타이머 콜백 무효화.
    runnerGenRef.current += 1;
    if (seqRef.current?.safety) clearTimeout(seqRef.current.safety);
    seqRef.current = null;
    clearRunner();
    runnerActiveRef.current = false;
    runnerStartedRef.current = false;
    queueCursorRef.current = 0;
    appearanceQueueRef.current = [];
    runStepRef.current = null;

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

    // 재생 버튼으로 미완료 슬라이드에 점프해 온 경우 — 이 effect 에서 즉시 재생을 개시해야 한다.
    // 러너/배치 양쪽에서 1회 소비.
    const forcePlay = pendingAutoStartRef.current;
    pendingAutoStartRef.current = false;

    // =====================================================================
    // 📌 이벤트 기반 러너 경로 — 슬라이드에 "블로킹 TTS"(일반 모듈/말풍선/미션아이템에
    //    enabled TTS)가 있으면, 고정 setTimeout 배치 대신 실제 onEnd 를 기다리는 순차 러너로 구동.
    //    그렇지 않은 슬라이드는 아래 기존 배치 경로를 100% 그대로 사용(회귀 방지).
    // =====================================================================
    {
      // duration / ttsHold 둘 다 time(ms) 를 가진다. (duration=등장 후 고정, ttsHold=TTS 종료 후 유지)
      const durTime = (v: any) => ((v?.type === 'duration' || v?.type === 'ttsHold') ? (v.time || 0) : 0);
      // blockOnTts: 실제 TTS onEnd 를 기다리는 항목은 visibility.type==='ttsHold' 일 때만.
      // (duration 은 TTS 가 있어도 고정 time 으로 진행 → 길면 잘림: 작가의 명시적 선택)
      const isTtsHold = (v: any) => v?.type === 'ttsHold';

      const markModuleVisible = (moduleId: number) => {
        setVisibleModules((prev) => {
          if (prev.has(moduleId)) return prev;
          const next = new Set(prev).add(moduleId);
          setSliderVisibleModules((m) => {
            const nm = new Map(m);
            const s = nm.get(currentSliderIndex) || new Set<number>();
            s.add(moduleId);
            nm.set(currentSliderIndex, s);
            return nm;
          });
          return next;
        });
      };
      const markSpeechVisible = (key: string) => {
        setVisibleSpeechIds((prev) => {
          const next = new Set(prev).add(key);
          setSliderVisibleSpeechIds((m) => {
            const nm = new Map(m);
            const s = nm.get(currentSliderIndex) || new Set<string>();
            s.add(key);
            nm.set(currentSliderIndex, s);
            return nm;
          });
          return next;
        });
      };
      const markMissionVisible = (key: string) => {
        setVisibleMissionItemIds((prev) => {
          const next = new Set(prev).add(key);
          setSliderVisibleMissionItemIds((m) => {
            const nm = new Map(m);
            const s = nm.get(currentSliderIndex) || new Set<string>();
            s.add(key);
            nm.set(currentSliderIndex, s);
            return nm;
          });
          return next;
        });
      };

      // 등장 순서를 평탄화한 큐 — 기존 배치 로직과 동일한 제외 규칙(게이트 이후/trigger/manualRender/이미 본 항목).
      const firstGateIdx = slider.modules.findIndex(
        (m: any) =>
          m.type === 'multipleChoice'
          || m.type === 'trueFalseChoice'
          || m.type === 'codeFillTheGapV2'
          || (m.type === 'actionButton' && m.role !== 'default'),
      );

      // 모든 등장 항목을 순서대로 평탄화하되 방문 여부(visited)를 함께 기록(제외하지 않음).
      // 재개(이어재생) 시 마지막으로 본 blocking-TTS 항목을 다시 포함해 그 TTS 를 처음부터 재생하기 위함.
      const allItems: any[] = [];
      slider.modules.forEach((module, moduleIdx) => {
        if (firstGateIdx !== -1 && moduleIdx > firstGateIdx && !(module as any).manualRender) return;
        if ((module as any).trigger) return;
        if ((module as any).manualRender) return;

        const moduleIndexOf = () => slider.modules.findIndex((m) => m.id === module.id);

        if (module.type === 'characterSpeechBubble' && module.speeches) {
          allItems.push({
            visited: !!savedVisibleModules?.has(module.id),
            blockOnTts: false, tts: module.tts, holdMs: 0, fixedDelay: 0, enterGapMs: 0,
            show: () => { markModuleVisible(module.id); setTimeout(() => scrollToModule(module.id, moduleIndexOf()), 50); },
          });
          module.speeches.forEach((speech, speechIndex) => {
            const key = `${module.id}-${speech.id}`;
            const t = durTime(speech.visibility);
            allItems.push({
              visited: !!savedVisibleSpeechIds?.has(key),
              blockOnTts: isTtsHold(speech.visibility), tts: speech.tts, holdMs: t, fixedDelay: t, enterGapMs: speechIndex === 0 ? 250 : 0,
              show: () => { markSpeechVisible(key); markModuleVisible(module.id); setTimeout(() => scrollToSpeech(module.id, speech.id), 50); },
            });
          });
        } else if (module.type === 'missionList' && module.items) {
          allItems.push({
            visited: !!savedVisibleModules?.has(module.id),
            blockOnTts: false, tts: module.tts, holdMs: 0, fixedDelay: 0, enterGapMs: 0,
            show: () => { markModuleVisible(module.id); setTimeout(() => scrollToModule(module.id, moduleIndexOf()), 50); },
          });
          module.items.forEach((item: any, itemIndex: number) => {
            const key = `${module.id}-${item.id}`;
            const t = durTime(item.visibility);
            allItems.push({
              visited: !!savedVisibleMissionItemIds?.has(key),
              blockOnTts: isTtsHold(item.visibility), tts: item.tts, holdMs: t, fixedDelay: t, enterGapMs: itemIndex === 0 ? 1000 : 0,
              show: () => { markMissionVisible(key); markModuleVisible(module.id); setTimeout(() => scrollToMissionItem(module.id, item.id), 50); },
            });
          });
        } else {
          const t = durTime(module.visibility);
          allItems.push({
            visited: !!savedVisibleModules?.has(module.id),
            blockOnTts: isTtsHold(module.visibility), tts: module.tts, holdMs: t, fixedDelay: t, enterGapMs: 0,
            show: () => { markModuleVisible(module.id); setTimeout(() => scrollToModule(module.id, moduleIndexOf()), 50); },
          });
        }
      });

      // 재개 모드: 첫 mount 가 아니고 이 슬라이드에 이미 본 항목이 있으면 = 이어재생/replay.
      const hasSavedProgress = !!((savedVisibleModules?.size) || (savedVisibleSpeechIds?.size) || (savedVisibleMissionItemIds?.size));
      const runnerResumeMode = !isFirstMountRef.current && hasSavedProgress;

      let queue: any[];
      if (runnerResumeMode) {
        // 마지막으로 본 항목 인덱스 — 그것이 끊긴 blocking-TTS 면 그 항목부터(처음부터 재생),
        // 아니면 다음 미방문 항목부터 이어간다.
        let lastVisitedIdx = -1;
        for (let i = 0; i < allItems.length; i++) if (allItems[i].visited) lastVisitedIdx = i;
        const replayLast = lastVisitedIdx >= 0
          && allItems[lastVisitedIdx].blockOnTts
          && !!getTtsPlayback(allItems[lastVisitedIdx].tts);
        const resumeStart = replayLast ? lastVisitedIdx : lastVisitedIdx + 1;
        queue = allItems.slice(resumeStart);
      } else {
        queue = allItems.filter((it) => !it.visited);
      }

      const hasBlockingTts = ENABLE_EVENT_DRIVEN_TTS && queue.some((it) => it.blockOnTts && getTtsPlayback(it.tts));

      if (hasBlockingTts) {
        // 재개 시 첫 항목은 너무 급하지 않게 — 200ms 보장.
        if (runnerResumeMode && queue.length > 0) {
          queue[0] = { ...queue[0], enterGapMs: Math.max(queue[0].enterGapMs, 200) };
        }

        appearanceQueueRef.current = queue;
        runnerActiveRef.current = true;
        runnerStartedRef.current = false;
        queueCursorRef.current = 0;

        const runStep = (gen: number) => {
          if (gen !== runnerGenRef.current) return;
          const q = appearanceQueueRef.current;
          const idx = queueCursorRef.current;
          if (idx >= q.length) {
            // 큐 종료(마지막 항목의 TTS 종료 + 유지까지 완료) → 러너 비활성화.
            runnerActiveRef.current = false;
            // 게이트(퀴즈/actionButton) 없는 슬라이드는 이 시점이 "완료" — 완료 집합에 기록.
            // (게이트 슬라이드는 사용자 응답 → runQuizPostGradingSequence → 완료감지 effect 가 완료 처리)
            if (firstGateIdx === -1) {
              completedSlidersRef.current.add(currentSliderIndex);
              // 다음 슬라이드로 자동 넘김 킥(마지막 슬라이드 제외).
              if (currentSliderIndex < curLesson.sliders.length - 1) {
                startAutoAdvanceRef.current?.(0);
              }
            }
            return;
          }
          const item = q[idx];
          const proceed = () => {
            if (gen !== runnerGenRef.current) return;
            pendingTtsRef.current = null;
            queueCursorRef.current += 1;
            runStep(gen);
          };
          const arm = (holderRef: React.MutableRefObject<any>, ms: number, cb: () => void) => {
            if (ms <= 0) { cb(); return; }
            const timer: any = { timeout: null, startedAt: Date.now(), remaining: ms, gen, cb };
            timer.timeout = setTimeout(() => {
              if (gen !== runnerGenRef.current) return;
              if (holderRef.current === timer) holderRef.current = null;
              cb();
            }, ms);
            holderRef.current = timer;
          };
          const onEnter = () => {
            if (gen !== runnerGenRef.current) return;
            item.show();
            const pb = getTtsPlayback(item.tts);
            if (pb && item.blockOnTts) {
              playTTS(item.tts);
              const safetyMs = (pb.durationMs ?? estimateTtsMs(item.tts)) + TTS_SAFETY_BUFFER_MS;
              const safety: any = { timeout: null, startedAt: Date.now(), remaining: safetyMs, gen, cb: () => handleTtsFinished(pb.url, gen, true) };
              safety.timeout = setTimeout(() => { if (gen !== runnerGenRef.current) return; handleTtsFinished(pb.url, gen, true); }, safetyMs);
              pendingTtsRef.current = { url: pb.url, gen, phase: 'playing', holdMs: item.holdMs, safety, hold: null };
              // 실제 종료는 AudioPlayer.onEnd → handleTtsFinished → finishHoldAndAdvance(cursor 증분)
            } else {
              // 비블로킹(컨테이너 / duration+TTS / ttsHold-무TTS): TTS 있으면 재생만(fire-and-forget),
              // 고정 시간(fixedDelay) 후 다음으로. duration 항목은 TTS 가 길면 여기서 잘린다(작가 선택).
              if (pb) playTTS(item.tts);
              arm(fixedTimerRef, item.fixedDelay, proceed);
            }
          };
          arm(enterTimerRef, item.enterGapMs, onEnter);
        };
        runStepRef.current = runStep;

        // 신규(fresh) 슬라이드는 즉시 시작. 재개 모드는 기본적으로 ▶ 대기하지만,
        // 재생 버튼으로 점프해 온 경우(forcePlay)는 즉시 시작 + 일시정지 해제.
        const shouldAutoStart = !runnerResumeMode || forcePlay;
        if (shouldAutoStart) {
          if (forcePlay) setIsPaused(false);
          runnerStartedRef.current = true;
          queueCursorRef.current = 0;
          runStep(runnerGenRef.current);
        }
        // 그 외(재개 + 점프아님): goToSlide 가 setIsPaused(true) 했고, ▶(resumeQueueRunner)가 시작한다.

        isFirstMountRef.current = false;
        return () => {
          clearRunner();
          resetAutoAdvanceState();
        };
      }
      // 블로킹 TTS 없음 → 아래 기존 배치 경로로 진행.
    }

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
    // 점프 재생(forcePlay)이면 재방문이어도 즉시 타이머를 돌린다(▶ 대기 X). 일시정지도 해제.
    if (forcePlay) setIsPaused(false);
    const scheduleShow = (callback: () => void, rawDelay: number, meta: TimerMeta) => {
      const delay = normalizeDelay(rawDelay);
      if (isRevisit && !forcePlay) {
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

    // 이벤트 기반 러너가 구동 중이면 여기서 autoAdvance 를 시작하지 않는다 —
    // 마지막 항목이 visible 돼도 그 TTS 가 아직 재생 중일 수 있으므로,
    // 러너가 큐 종료(onEnd + 유지) 시점에 직접 startAutoAdvance 를 킥한다.
    if (runnerActiveRef.current) return;

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
      // 배치/게이트 슬라이드의 "완료" 지점 — 완료 집합에 기록(러너 슬라이드는 러너가 직접 기록).
      completedSlidersRef.current.add(currentSliderIndex);

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
   * 📌 fireShowTimer: 'show' 타이머 1건을 즉시 발화(모듈/말풍선/아이템 표시 + TTS + 스크롤).
   * - resumeModuleRendering(예약 후 발화) 과 advanceToNextModule(빨리감기, 즉시 발화) 가 공유.
   */
  const fireShowTimer = useCallback((timerInfo: {
    moduleId: number; speechId?: number; missionItemId?: number; sliderIndex: number;
  }, skipTts = false) => {
    const { moduleId, speechId, missionItemId, sliderIndex } = timerInfo;
    const sliderLocal = curLesson.sliders[sliderIndex];
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
      const module = sliderLocal?.modules.find(m => m.id === moduleId);
      if (!skipTts && module?.type === 'characterSpeechBubble' && module.speeches) {
        const speech = module.speeches.find(s => s.id === speechId);
        if (speech?.tts) playTTS(speech.tts);
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

    if (!skipTts && !speechKey && !missionItemKey) {
      const module = sliderLocal?.modules.find(m => m.id === moduleId);
      if (module?.tts) playTTS(module.tts);
    }

    setTimeout(() => {
      scrollToModule(moduleId, sliderLocal?.modules.findIndex(m => m.id === moduleId) ?? -1);
    }, 50);

    // 발화한 show 타이머는 목록에서 제거
    moduleTimersRef.current = moduleTimersRef.current.filter(t =>
      !(t.moduleId === moduleId && t.speechId === speechId && t.missionItemId === missionItemId && t.type === 'show')
    );
  }, [curLesson.sliders, playTTS, scrollToModule]);

  // =========================================================================
  // 📌 순차 등장 러너 (채점/버튼 후) — 추정 시간이 아니라 "실제 오디오 재생 종료"를 기다린 뒤 다음으로.
  //    각 unit 을 등장시키고 TTS 를 재생, AudioPlayer.onEnd(또는 안전타이머) 가 올 때까지 대기.
  // =========================================================================
  const isPausedRef = useRef(isPaused);
  isPausedRef.current = isPaused;
  // AudioPlayer onEnd/onError 를 안정 참조로 만들기 위한 미러 ref (재렌더로 인한 remount 방지).
  const currentAudioUrlRef = useRef(currentAudioUrl);
  currentAudioUrlRef.current = currentAudioUrl;
  const handleSeqAudioEndedRef = useRef<(url: string) => void>(() => {});

  type SeqUnit = { moduleId: number; speechId?: number; missionItemId?: number; tts: any };
  const seqRef = useRef<{
    units: SeqUnit[]; idx: number; gen: number; sliderIndex: number;
    waitUrl: string | null; safety: NodeJS.Timeout | null; onDone: (() => void) | null;
  } | null>(null);
  const seqRunStepRef = useRef<(() => void) | null>(null);

  const clearSeq = useCallback(() => {
    if (seqRef.current?.safety) clearTimeout(seqRef.current.safety);
    seqRef.current = null;
  }, []);

  // 모듈 리스트를 등장 단위(모듈/말풍선/미션아이템)로 평탄화.
  const buildRevealUnits = (modules: any[]): SeqUnit[] => {
    const units: SeqUnit[] = [];
    modules.forEach((mod: any) => {
      if (mod.type === 'characterSpeechBubble' && mod.speeches) {
        units.push({ moduleId: mod.id, tts: null });
        mod.speeches.forEach((s: any) => units.push({ moduleId: mod.id, speechId: s.id, tts: s.tts }));
      } else if (mod.type === 'missionList' && mod.items) {
        units.push({ moduleId: mod.id, tts: null });
        mod.items.forEach((it: any) => units.push({ moduleId: mod.id, missionItemId: it.id, tts: it.tts }));
      } else {
        units.push({ moduleId: mod.id, tts: mod.tts });
      }
    });
    return units;
  };

  const advanceSeq = () => {
    const s = seqRef.current;
    if (!s) return;
    if (s.safety) { clearTimeout(s.safety); s.safety = null; }
    s.idx += 1;
    seqRunStepRef.current?.();
  };

  const runSeqStep = () => {
    const s = seqRef.current;
    if (!s) return;
    if (s.gen !== runnerGenRef.current) { clearSeq(); return; }
    if (s.idx >= s.units.length) { const d = s.onDone; clearSeq(); d?.(); return; }
    const unit = s.units[s.idx];
    fireShowTimer({ moduleId: unit.moduleId, speechId: unit.speechId, missionItemId: unit.missionItemId, sliderIndex: s.sliderIndex }, true);

    const pb = getTtsPlayback(unit.tts);
    // 안전타이머: 일시정지 중이면 대기(폴링), 오디오 onEnd 가 먼저 오면 그쪽이 진행.
    const armSafety = (ms: number) => {
      const tick = () => {
        if (!seqRef.current || seqRef.current !== s) return;
        if (isPausedRef.current) { s.safety = setTimeout(tick, 300); return; }
        advanceSeq();
      };
      s.safety = setTimeout(tick, ms);
    };

    if (pb) {
      playTTS(unit.tts);
      s.waitUrl = pb.url;
      // 실제 종료(onEnd)를 기다리되, 길이+버퍼의 안전타이머로 hang 방지.
      armSafety((pb.durationMs ?? estimateTtsMs(unit.tts)) + TTS_SAFETY_BUFFER_MS);
    } else {
      s.waitUrl = null;
      armSafety(350); // TTS 없는 unit 은 짧게.
    }
  };
  seqRunStepRef.current = runSeqStep;

  // AudioPlayer.onEnd 에서 호출 — 현재 대기 중인 seq unit 의 TTS 가 끝났으면 다음으로.
  const handleSeqAudioEnded = (url: string) => {
    const s = seqRef.current;
    if (!s || !s.waitUrl || url !== s.waitUrl) return;
    advanceSeq();
  };
  handleSeqAudioEndedRef.current = handleSeqAudioEnded;

  // 모듈들을 실제 오디오 종료 기반으로 순차 등장시키고, 끝나면 onDone.
  const startSequentialReveal = (modules: any[], onDone: () => void) => {
    const units = buildRevealUnits(modules);
    if (units.length === 0) { onDone(); return; }
    if (seqRef.current?.safety) clearTimeout(seqRef.current.safety);
    seqRef.current = {
      units, idx: 0, gen: runnerGenRef.current, sliderIndex: currentSliderIndex,
      waitUrl: null, safety: null, onDone,
    };
    setIsPaused(false);
    runSeqStep();
  };

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
        // 'show' 타이머: 모듈/말풍선/아이템 표시 (fireShowTimer 공용)
        fireShowTimer({ moduleId, speechId, missionItemId, sliderIndex });
      }, delay);
      timeoutRefs.current.push(timerInfo.timeout);
    });
  }, [currentSliderIndex, curLesson.sliders, playTTS, fireShowTimer]);

  // =========================================================================
  // 📌 이벤트 기반 러너 제어 콜백 (안정 참조)
  // =========================================================================
  /**
   * finishHoldAndAdvance: TTS 종료 후 유지 시간이 끝나 다음 항목으로 진행.
   */
  const finishHoldAndAdvance = useCallback((gen: number) => {
    if (gen !== runnerGenRef.current) return;
    const p = pendingTtsRef.current;
    if (p?.hold?.timeout) clearTimeout(p.hold.timeout);
    pendingTtsRef.current = null;
    queueCursorRef.current += 1;
    runStepRef.current?.(gen);
  }, []);

  /**
   * handleTtsFinished: TTS 실제 재생 종료(onEnd) 또는 안전타이머/onError 발화 시 호출.
   * - playing → holding 으로 전이, holdMs(유지시간) 후 다음 항목.
   * - onEnd 와 안전타이머가 둘 다 와도 phase 가드로 1회만 진행.
   */
  const handleTtsFinished = useCallback((endedUrl: string, gen: number, fromSafety = false) => {
    const p = pendingTtsRef.current;
    if (!p) return;
    if (gen !== runnerGenRef.current || p.gen !== gen) return; // 떠난 슬라이드의 늦은 발화 무시
    if (!fromSafety && p.url !== endedUrl) return;             // 다른 오디오의 onEnd 무시
    if (p.phase !== 'playing') return;                         // 이중 발화 방지
    if (p.safety?.timeout) { clearTimeout(p.safety.timeout); p.safety.timeout = null; }
    p.phase = 'holding';
    if (p.holdMs <= 0) { finishHoldAndAdvance(gen); return; }
    const hold: typeof p.hold = { timeout: null, startedAt: Date.now(), remaining: p.holdMs, gen, cb: () => finishHoldAndAdvance(gen) };
    hold.timeout = setTimeout(() => { if (gen !== runnerGenRef.current) return; finishHoldAndAdvance(gen); }, p.holdMs);
    p.hold = hold;
  }, [finishHoldAndAdvance]);

  // AudioPlayer onEnd/onError 안정 콜백 — ref 로 최신 url/seq 핸들러를 읽어 매 렌더마다 새 함수가 안 만들어지게 한다.
  // (인라인 함수를 쓰면 progress tick 마다 AudioPlayer 가 재렌더 → source 재생성 → 재로드/재시작 버그)
  const handleAudioEnd = useCallback(() => {
    const url = currentAudioUrlRef.current;
    handleTtsFinished(url, runnerGenRef.current);
    handleSeqAudioEndedRef.current?.(url);
  }, [handleTtsFinished]);
  const handleAudioError = useCallback(() => {
    const url = currentAudioUrlRef.current;
    handleTtsFinished(url, runnerGenRef.current, true);
    handleSeqAudioEndedRef.current?.(url);
  }, [handleTtsFinished]);

  /**
   * clearRunner: 러너의 모든 타이머 정리(슬라이드 리셋/언마운트 시).
   */
  const clearRunner = useCallback(() => {
    if (enterTimerRef.current?.timeout) clearTimeout(enterTimerRef.current.timeout);
    if (fixedTimerRef.current?.timeout) clearTimeout(fixedTimerRef.current.timeout);
    const p = pendingTtsRef.current;
    if (p?.safety?.timeout) clearTimeout(p.safety.timeout);
    if (p?.hold?.timeout) clearTimeout(p.hold.timeout);
    enterTimerRef.current = null;
    fixedTimerRef.current = null;
    pendingTtsRef.current = null;
  }, []);

  /**
   * pauseQueueRunner: 진입갭/고정대기/유지시간/안전 타이머를 모두 freeze (남은시간 보존).
   * 오디오 자체는 AudioPlayer 의 paused(isPaused) prop 으로 멈춘다.
   */
  const pauseQueueRunner = useCallback(() => {
    if (!runnerActiveRef.current) return;
    const now = Date.now();
    [enterTimerRef, fixedTimerRef].forEach((ref) => {
      const t = ref.current;
      if (t?.timeout) {
        clearTimeout(t.timeout);
        t.remaining = Math.max(0, t.remaining - (now - t.startedAt));
        t.timeout = null;
      }
    });
    const p = pendingTtsRef.current;
    if (p) {
      const t = p.phase === 'holding' ? p.hold : p.safety;
      if (t?.timeout) {
        clearTimeout(t.timeout);
        t.remaining = Math.max(0, t.remaining - (now - t.startedAt));
        t.timeout = null;
      }
    }
  }, []);

  /**
   * resumeQueueRunner: freeze 된 타이머를 남은시간으로 재개.
   * - 재방문 첫 ▶: 아직 시작 안 했으면 러너를 처음부터 시작.
   */
  const resumeQueueRunner = useCallback(() => {
    if (!runnerActiveRef.current) return;
    if (!runnerStartedRef.current) {
      runnerStartedRef.current = true;
      queueCursorRef.current = 0;
      runStepRef.current?.(runnerGenRef.current);
      return;
    }
    const gen = runnerGenRef.current;
    const now = Date.now();
    [enterTimerRef, fixedTimerRef].forEach((ref) => {
      const t = ref.current;
      if (t && !t.timeout && t.remaining > 0) {
        t.startedAt = now;
        t.timeout = setTimeout(() => {
          if (gen !== runnerGenRef.current) return;
          if (ref.current === t) ref.current = null;
          t.cb();
        }, t.remaining);
      }
    });
    const p = pendingTtsRef.current;
    if (p) {
      if (p.phase === 'holding' && p.hold && !p.hold.timeout) {
        p.hold.startedAt = now;
        p.hold.timeout = setTimeout(() => { if (gen !== runnerGenRef.current) return; finishHoldAndAdvance(gen); }, p.hold.remaining);
      } else if (p.phase === 'playing' && p.safety && !p.safety.timeout) {
        p.safety.startedAt = now;
        p.safety.timeout = setTimeout(() => { if (gen !== runnerGenRef.current) return; handleTtsFinished(p.url, gen, true); }, p.safety.remaining);
      }
    }
  }, [finishHoldAndAdvance, handleTtsFinished]);

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

    // 이벤트 기반 러너가 활성이면 러너를 일시정지 (오디오는 isPaused 로 멈춤)
    if (runnerActiveRef.current) {
      pauseQueueRunner();
      setIsPaused(true);
      pausedAtRef.current = Date.now();
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
      return;
    }

    // 어떤 타이머도 없지만 TTS 가 재생 중인 빈 구간 — isPaused 만 세팅해 오디오를 멈춘다.
    // (이 fallback 이 없으면 정지를 눌러도 isPaused 가 안 바뀌어 TTS 가 계속 재생됨)
    setIsPaused(true);
    pausedAtRef.current = Date.now();
  }, [isPaused, pauseModuleRendering, pauseQueueRunner]);

  // 화면이 blur 될 때(모바일 IDE 진입 · 뒤로가기 등) 재생 중인 TTS 를 정지하고 자동진행을 freeze.
  // 복귀 시 자동 재개는 하지 않음 — 멈춘 상태로 두고 사용자가 재생 버튼으로 재개.
  useFocusEffect(
    useCallback(() => {
      return () => {
        stopTTS();
        pauseAutoAdvance();
      };
    }, [stopTTS, pauseAutoAdvance]),
  );

  /**
   * 📌 resumeAutoAdvance: 자동 넘김 재개
   * - 저장된 남은 시간으로 타이머 재시작
   */
  const resumeAutoAdvance = useCallback(() => {
    if (!isPaused) {
      return;
    }

    // 이벤트 기반 러너가 활성이면 러너를 재개 (재방문 첫 ▶ 면 러너 시작)
    if (runnerActiveRef.current) {
      resumeQueueRunner();
      setIsPaused(false);
      pausedAtRef.current = null;
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
  }, [isPaused, remainingMs, currentSliderIndex, curLesson.sliders.length, clearAutoAdvanceTimer, resumeModuleRendering, resumeQueueRunner, goToSlide]);

  /**
   * 📌 findFirstIncompleteFrom: fromIndex(포함)부터 앞으로 가며 "완료되지 않은" 첫 슬라이드 인덱스 반환.
   * - 완료 = completedSlidersRef 에 기록됨(스케줄러가 큐 끝/마지막 TTS·유지까지 도달).
   * - 모두 완료면 null.
   */
  const findFirstIncompleteFrom = useCallback(
    (fromIndex: number): number | null => {
      const sliders = curLesson?.sliders ?? [];
      for (let i = Math.max(0, fromIndex); i < sliders.length; i++) {
        if (!completedSlidersRef.current.has(i)) return i;
      }
      return null;
    },
    [curLesson?.sliders],
  );

  /**
   * 📌 togglePauseResume: 탭/버튼으로 일시정지·재생 토글.
   * - 재생 중이면 일시정지(+TTS 정지는 pause 가 처리).
   * - 일시정지/유휴면 "재생": 현재부터 앞으로 첫 미완료 슬라이드를 찾아가 거기서 이어재생한다.
   *   (현재 슬라이드가 미완료면 그 자리에서 이어재생 — 러너는 끊긴 TTS 를 처음부터 재생)
   */
  const togglePauseResume = useCallback(() => {
    const hasModuleTimers = moduleTimersRef.current.length > 0;
    const hasRunner = runnerActiveRef.current;
    const hasAutoAdvanceTimer = autoAdvanceTimerRef.current !== null;
    // TTS 재생 중(currentAudioUrl 존재)도 "재생 중"으로 본다 — 타이머 사이 빈 구간에 정지를 눌렀을 때
    // resume 분기로 빠져 다음 슬라이드로 점프하던 버그 방지.
    const hasAudio = currentAudioUrl !== '';
    const isPlaying = !isPaused && (hasModuleTimers || hasRunner || hasAutoAdvanceTimer || hasAudio);

    // 재생 중 → 일시정지
    if (isPlaying) {
      pauseAutoAdvance();
      return;
    }

    // 일시정지/유휴 → 재생: 현재(포함)부터 앞으로 첫 미완료 슬라이드 탐색
    const target = findFirstIncompleteFrom(currentSliderIndex);
    if (target === null) {
      // 전부 완료 — 정지 상태만 해제
      setIsPaused(false);
      return;
    }
    if (target === currentSliderIndex) {
      // 현재 슬라이드가 미완료 → 그 자리에서 이어재생
      setIsPaused(false);
      if (runnerActiveRef.current) resumeQueueRunner();
      else resumeAutoAdvance();
    } else {
      // 앞쪽 미완료 슬라이드로 점프 + 자동 시작(끊긴 TTS 처음부터 재생)
      pendingAutoStartRef.current = true;
      goToSlide(target, true);
    }
  }, [
    isPaused,
    currentAudioUrl,
    currentSliderIndex,
    findFirstIncompleteFrom,
    pauseAutoAdvance,
    resumeAutoAdvance,
    resumeQueueRunner,
    goToSlide,
  ]);


  // =========================================================================
  // 📌 하단 액션 바 제어 — 좌우 스와이프 대체. 모든 슬라이드/모듈 이동을 버튼으로 일원화.
  // =========================================================================

  /**
   * 📌 getActiveQuiz: 현재 슬라이드에서 visible 이고 아직 채점되지 않은 퀴즈 모듈.
   * - 하단 가운데 버튼의 퀴즈 모드(정답 선택/입력 → 채점하기) 판단에 사용.
   */
  const getActiveQuiz = (): any | null => {
    const slider = curLesson.sliders[currentSliderIndex];
    if (!slider) return null;
    return slider.modules.find((m: any) => isQuizType(m) && visibleModules.has(m.id) && !isQuizGraded(m)) || null;
  };

  /**
   * 📌 runnerFastForward: 이벤트 러너가 현재 대기 중인 것(진입갭/고정대기/TTS/유지)을 즉시 끝내고
   *    다음 항목을 등장시킨다. 자동 재생은 그대로 이어진다.
   */
  const runnerFastForward = (gen: number) => {
    if (gen !== runnerGenRef.current) return;
    // 아직 시작 전(재방문 ▶ 대기)이면 첫 항목부터 시작.
    if (!runnerStartedRef.current) {
      runnerStartedRef.current = true;
      queueCursorRef.current = 0;
      runStepRef.current?.(gen);
      return;
    }
    // 1) 진입 갭 대기 중 → 즉시 onEnter(다음 항목 등장 + TTS/대기 시작)
    const et = enterTimerRef.current;
    if (et && (et.timeout || et.remaining > 0)) {
      if (et.timeout) clearTimeout(et.timeout);
      enterTimerRef.current = null;
      et.cb();
      return;
    }
    // 2) 비블로킹 고정 대기 중 → 다음 항목으로
    const ft = fixedTimerRef.current;
    if (ft && (ft.timeout || ft.remaining > 0)) {
      if (ft.timeout) clearTimeout(ft.timeout);
      fixedTimerRef.current = null;
      stopTTS();
      ft.cb();
      return;
    }
    // 3) TTS 재생/유지 중 → 정지하고 다음 항목으로
    const p = pendingTtsRef.current;
    if (p) {
      if (p.safety?.timeout) { clearTimeout(p.safety.timeout); p.safety.timeout = null; }
      if (p.hold?.timeout) { clearTimeout(p.hold.timeout); p.hold.timeout = null; }
      stopTTS();
      finishHoldAndAdvance(gen);
      return;
    }
    // 4) 유휴 → 커서만 증분하여 다음 step
    queueCursorRef.current += 1;
    runStepRef.current?.(gen);
  };

  /**
   * 📌 advanceToNextModule: "다음 모듈로 넘어가기" — 현재 슬라이드의 다음 타임라인 모듈을 즉시 등장.
   * - 미채점 퀴즈가 떠 있으면 차단(채점 먼저).
   * - 더 등장할 모듈이 없으면 다음 슬라이드로.
   */
  const advanceToNextModule = () => {
    // 미채점 퀴즈가 있으면 진행 차단 (채점하기 버튼으로 유도).
    if (getActiveQuiz()) return;

    setGradeResult(null); // 다음 모듈로 넘어가면 채점 결과 텍스트 제거
    setIsPaused(false);

    // 러너 경로
    if (runnerActiveRef.current) {
      runnerFastForward(runnerGenRef.current);
      return;
    }

    // 고정 배치 경로 — 현재 슬라이드의 미발화 show 타이머 중 잔여 최소 1건을 즉시 발화.
    const showTimers = moduleTimersRef.current.filter(
      t => t.type === 'show' && t.sliderIndex === currentSliderIndex,
    );
    if (showTimers.length === 0) {
      // 더 나올 모듈 없음 → 다음 슬라이드로 (마지막이면 무시).
      if (currentSliderIndex < curLesson.sliders.length - 1) {
        goToSlide(currentSliderIndex + 1, true);
      }
      return;
    }
    // 잔여 시간 기준 정규화 후 가장 가까운 것을 발화, 나머지는 이어서 재생.
    pauseModuleRendering();
    const nearest = showTimers.reduce((a, b) => (b.delay < a.delay ? b : a));
    // 막 발화 직전(remaining<=0 라 pause 가 건드리지 않은)인 타이머의 중복 발화 방지.
    if (nearest.timeout) {
      clearTimeout(nearest.timeout);
      timeoutRefs.current = timeoutRefs.current.filter(t => t !== nearest.timeout);
      nearest.timeout = null;
    }
    // nearest 를 목록에서 제거하고 즉시 발화 (fireShowTimer 가 자체적으로 show 제거하지만 안전하게 선제거)
    moduleTimersRef.current = moduleTimersRef.current.filter(t => t !== nearest);
    fireShowTimer({
      moduleId: nearest.moduleId,
      speechId: nearest.speechId,
      missionItemId: nearest.missionItemId,
      sliderIndex: nearest.sliderIndex,
    });
    resumeModuleRendering();
  };

  /**
   * 📌 restartCurrentSlide: 현재 슬라이드 완전 초기화 — 모듈 등장 + 퀴즈 답/채점 결과를 원본으로 되돌려 처음부터 재생.
   */
  const restartCurrentSlide = () => {
    const idx = currentSliderIndex;
    // 1) 타이머/러너 정리
    timeoutRefs.current.forEach((t) => clearTimeout(t));
    timeoutRefs.current = [];
    moduleTimersRef.current.forEach((t) => { if (t.timeout) clearTimeout(t.timeout); });
    moduleTimersRef.current = [];
    clearRunner();
    clearSeq();
    resetAutoAdvanceState();
    clearAutoAdvanceTimer();
    stopTTS();
    // 2) 러너 상태 리셋
    runnerGenRef.current += 1;
    runnerActiveRef.current = false;
    runnerStartedRef.current = false;
    queueCursorRef.current = 0;
    appearanceQueueRef.current = [];
    runStepRef.current = null;
    // 3) visible 캐시 제거
    completedSlidersRef.current.delete(idx);
    triggeredTerminalsRef.current = new Set();
    setSliderVisibleModules((m) => { const n = new Map(m); n.delete(idx); return n; });
    setSliderVisibleSpeechIds((m) => { const n = new Map(m); n.delete(idx); return n; });
    setSliderVisibleMissionItemIds((m) => { const n = new Map(m); n.delete(idx); return n; });
    setVisibleModules(new Set());
    setVisibleSpeechIds(new Set());
    setVisibleMissionItemIds(new Set());
    // 4) 원본 슬라이드 복원(모듈 순서 + 답/채점 리셋) → curLesson.sliders 참조 변경으로 메인 effect 재실행 → fresh 스케줄.
    const pristine = originalSlidersRef.current?.[idx];
    if (pristine) {
      setCurLesson((prev: any) => {
        const next = { ...prev };
        const sliders = [...next.sliders];
        sliders[idx] = JSON.parse(JSON.stringify(pristine));
        next.sliders = sliders;
        return next;
      });
    }
    // 5) 자동 재생
    setGradeResult(null);
    pendingAutoStartRef.current = true;
    setIsPaused(false);
  };

  const handleExitPress = () => {
    // 자동 넘김 / 모듈 등장 일시정지 + 오디오까지 모두 멈춤 후 종료 확인 시트 표시.
    // setIsPaused(true) 를 명시적으로 호출해야 idle 상태(타이머 없음)에서도 AudioPlayer 의 paused prop 이
    // 갱신되어 TTS 가 즉시 멈춘다.
    pauseAutoAdvance();
    pauseModuleRendering();
    pauseQueueRunner();
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
      pauseQueueRunner();
      setIsPaused(true);
      setShowExitSheet(true);
    });
    return sub;
  }, [navigation, pauseAutoAdvance, pauseModuleRendering, pauseQueueRunner]);

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android') return;
      const onBack = () => {
        pauseAutoAdvance();
        pauseModuleRendering();
        pauseQueueRunner();
        setIsPaused(true);
        setShowExitSheet(true);
        return true; // 기본 동작 차단
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
      return () => sub.remove();
    }, [pauseAutoAdvance, pauseModuleRendering, pauseQueueRunner]),
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

    // 순차 등장 시퀀스: 재배치된 trigger 모듈 → 퀴즈 이후 원래 모듈.
    // 실제 오디오 재생 종료를 기다려 하나씩 등장(추정 시간 미사용). 모두 끝나면 텍스트 제거 + 자동 넘김.
    const sequence = [...triggeredWithFlag, ...remainingOriginalModules];
    setIsPaused(false);
    // insert 한 setCurLesson 이 커밋된 뒤 시작하도록 0ms 지연.
    setTimeout(() => {
      startSequentialReveal(sequence, () => {
        setGradeResult(null);
        startAutoAdvance(2000);
      });
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
      // TTS 길이를 반영한 머무는 시간 — TTS 가 잘리지 않도록.
      const moduleDuration = seqModuleDwellMs(mod);

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
            const sd = speech.visibility?.type === 'duration' ? (speech.visibility.time || 0) : 0;
            const sp = getTtsPlayback(speech.tts);
            const speechDuration = Math.max(sd, sp ? (sp.durationMs ?? estimateTtsMs(speech.tts)) + 600 : 0);
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

    // 실제 오디오 재생 종료 기반 순차 등장 → 끝나면 채점 텍스트 제거 + 자동 넘김.
    const sequence = [...triggeredWithFlag, ...remainingOriginalModules];
    setIsPaused(false);
    setTimeout(() => {
      startSequentialReveal(sequence, () => {
        setGradeResult(null);
        startAutoAdvance(2000);
      });
    }, 0);
  };

  const handleTrueFalseChoiceSubmit = (completedModuleId: number) => {
    const problemModule = currentSlider.modules.find((m) => m.id === completedModuleId);
    runQuizPostGradingSequence(problemModule, 'trueFalseChoice');
  };

  /**
   * 📌 handleQuizGrade: 하단 "채점하기" 버튼 — 현재 슬라이드의 visible 미채점 퀴즈를 채점.
   * - 각 퀴즈 모듈의 isCorrect 를 in-place 로 채워 넣고(기존 자식 채점과 동일 패턴),
   *   기존 후처리 핸들러(runQuizPostGradingSequence / handleCodeFillTheGapSubmit)를 트리거한다.
   */
  const handleQuizGrade = () => {
    const quiz = getActiveQuiz();
    if (!quiz || !isQuizAnswered(quiz)) return;

    if (quiz.type === 'multipleChoice' || quiz.type === 'trueFalseChoice') {
      let allCorrect = true;
      (quiz.questions || []).forEach((q: any) => {
        const isC = q.answer?.userAnswer === q.answer?.answer;
        if (!isC) allCorrect = false;
        if (q.answer) q.answer.isCorrect = isC; // in-place (currentSlider 클로저가 즉시 반영)
      });
      allCorrect ? haptic.success() : haptic.error();
      setGradeResult(allCorrect ? 'correct' : 'wrong');
      setCurLesson((prev: any) => ({ ...prev })); // graded 스타일 반영 위한 리렌더
      if (quiz.type === 'multipleChoice') handleMultipleChoiceSubmit(quiz.id);
      else handleTrueFalseChoiceSubmit(quiz.id);
      return;
    }

    if (quiz.type === 'codeFillTheGapV2') {
      const answers = getCodeFillAnswers(quiz);
      let allCorrect = true;
      answers.forEach((a: any) => {
        const isC = (a.userAnswer ?? '').trim() === (a.correctAnswer ?? '').trim();
        if (!isC) allCorrect = false;
        a.isCorrect = isC; // in-place
      });
      const requireAllCorrect = !!quiz.requireAllCorrect;
      const hasCorrectIncorrectResult = !!(quiz.correctResult || quiz.incorrectResult);
      allCorrect ? haptic.success() : haptic.error();
      setGradeResult(allCorrect ? 'correct' : 'wrong');
      setCurLesson((prev: any) => ({ ...prev }));

      // requireAllCorrect 인데 오답이면 진행하지 않고 다시 풀도록 안내 (빈칸 탭 → 재선택).
      if (requireAllCorrect && !allCorrect && !hasCorrectIncorrectResult) {
        setToastMsg('틀린 답이 있어요. 다시 한번 확인해보세요');
        return;
      }
      handleCodeFillTheGapSubmit(quiz.id, allCorrect);
    }
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


        if (ENABLE_TYPING_HIGHLIGHT && hasTimestamps && !isRevisiting) {
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
        // 엔딩 액션(다음 레슨/학습 종료)은 하단 액션 바로 이동 — 콘텐츠에는 렌더하지 않음.
        if ((module as any).action?.type === 'end_lesson' || (module as any).action?.type === 'navigate_next_lesson') {
          return null;
        }
        content = (
          <ActionButtonComponent
            module={module as any}
            onPress={() => handleActionButtonClick(module.id)}
          />
        );
        break;

      case 'actionButtons':
        // actionButtons(복수)는 엔딩 버튼 그룹 — 하단 액션 바로 이동.
        return null;

      case 'characterSpeechBubble':
        content = (
          <CharacterSpeechBubbleComponent
            module={module as any}
            visibleSpeechIds={visibleSpeechIdsFor}
            currentAudioTime={currentAudioTime}
            currentAudioUrl={currentAudioUrl}
            highlightDisabled={isRevisiting || !ENABLE_TYPING_HIGHLIGHT}
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

  // =========================================================================
  // 📌 하단 액션 바 파생 상태 (가운데 버튼 모드 / 다음 버튼 모드 / 모듈 진행도 / 엔딩 버튼)
  // =========================================================================
  const activeQuiz = getActiveQuiz();
  let centerMode: CenterMode;
  let quizPrompt: string | undefined;
  if (activeQuiz) {
    if (isQuizAnswered(activeQuiz)) {
      centerMode = 'quiz-grade';
    } else {
      centerMode = 'quiz-disabled';
      quizPrompt = activeQuiz.type === 'codeFillTheGapV2' ? '정답을 입력하세요' : '정답을 선택하세요';
    }
  } else {
    centerMode = isPaused ? 'play' : 'pause';
  }

  const isLastSlide = currentSliderIndex >= curLesson.sliders.length - 1;

  // 모듈 진행도 — 등장한 unit 수 대비 비율. 단, 현재 재생 중인 마지막 unit 은 실제 오디오 재생
  // 진행률(currentAudioTime / 길이)만큼만 채워 "실제 재생"을 그대로 따라가게 한다(추정 시간 미사용).
  // 미채점 퀴즈가 떠 있으면 그 unit 만큼은 채우지 않는다(꽉 차지 않게).
  const progressInfo = useMemo(() => {
    const slider = curLesson.sliders[currentSliderIndex];
    if (!slider) return { target: 0, appeared: 0, total: 1 };
    const firstGateIdx = slider.modules.findIndex((m: any) => isGateModule(m));
    const gateResolved = firstGateIdx === -1
      ? true
      : slider.modules.some((m: any, i: number) => i > firstGateIdx && (visibleModules.has(m.id) || (m as any).manualRender));

    // 등장 순서대로 unit 평탄화 (+ 등장 여부)
    const units: { appeared: boolean }[] = [];
    slider.modules.forEach((m: any, i: number) => {
      let willAppear: boolean;
      if (m.manualRender) willAppear = true;
      else if (m.trigger) willAppear = false;
      else if (firstGateIdx === -1 || i <= firstGateIdx) willAppear = true;
      else willAppear = gateResolved;
      if (!willAppear) return;

      if (m.type === 'characterSpeechBubble' && m.speeches) {
        units.push({ appeared: visibleModules.has(m.id) });
        m.speeches.forEach((s: any) => units.push({ appeared: visibleSpeechIds.has(`${m.id}-${s.id}`) }));
      } else if (m.type === 'missionList' && m.items) {
        units.push({ appeared: visibleModules.has(m.id) });
        m.items.forEach((it: any) => units.push({ appeared: visibleMissionItemIds.has(`${m.id}-${it.id}`) }));
      } else {
        units.push({ appeared: visibleModules.has(m.id) });
      }
    });

    const total = Math.max(units.length, 1);
    const appeared = units.filter(u => u.appeared).length;

    // 채움 = (이전 unit 들은 완료) + (마지막 등장 unit 의 진행률).
    // 마지막 unit 진행률(lastFraction):
    //  - 미채점 퀴즈: 0 (채점 전까지 미완료 → 꽉 안 참)
    //  - 오디오 재생 중: 실제 재생률(재생시간/길이). 일시정지여도 그 값 그대로 freeze.
    //  - 오디오 로딩 중(url 있고 길이 미상): 0 (막 시작 — 다음 모듈로 넘어가도 over-fill 방지)
    //  - 오디오 없음: 1 (말없는 모듈/재생 끝나 정지됨 → 완료로 간주)
    let lastFraction: number;
    if (activeQuiz) {
      lastFraction = 0;
    } else if (currentAudioUrl !== '' && currentAudioDuration > 0) {
      lastFraction = Math.max(0, Math.min(1, currentAudioTime / currentAudioDuration));
    } else if (currentAudioUrl !== '') {
      lastFraction = 0;
    } else {
      lastFraction = 1;
    }
    const filled = appeared === 0 ? 0 : Math.max(0, appeared - 1) + lastFraction;
    return { target: filled / total, appeared, total };
  }, [curLesson.sliders, currentSliderIndex, visibleModules, visibleSpeechIds, visibleMissionItemIds, activeQuiz, isPaused, currentAudioUrl, currentAudioTime, currentAudioDuration]);

  // 현재 슬라이드 완전 재생 여부 — 모든 unit 등장 + 미채점 퀴즈 없음.
  const isSlideComplete = progressInfo.appeared >= progressInfo.total && !activeQuiz;
  // 완료된 슬라이드면 "다음 슬라이드", 아니면(새로고침 직후 포함) "다음 모듈".
  const nextMode: NextMode = isSlideComplete ? 'next-slide' : 'next-module';

  // 현재 슬라이드의 고정 콘셉 색상 — 슬라이드 타입(시작/목표/개념/퀴즈/엔딩)별 700 색.
  const slideAccent = getSlideAccent(currentSlider);

  // 엔딩 액션 버튼 — visible 한 actionButtons(복수) 또는 종료/다음레슨 actionButton 을 하단 바로 이동.
  const endingModule: any = currentSlider?.modules.find((m: any) =>
    (m.type === 'actionButtons' && visibleModules.has(m.id)) ||
    (m.type === 'actionButton' && visibleModules.has(m.id) &&
      (m.action?.type === 'end_lesson' || m.action?.type === 'navigate_next_lesson')),
  ) || null;
  const endingButtons: { id: string; text: string; action?: any; style?: any }[] | null = endingModule
    ? (endingModule.type === 'actionButtons'
        ? (endingModule.buttons || [])
        : [{ id: String(endingModule.id), text: endingModule.text, action: endingModule.action, style: endingModule.style }])
    : null;

  const onNextPress = () => {
    if (nextMode === 'next-slide') {
      if (!isLastSlide) goToSlide(currentSliderIndex + 1, true);
    } else {
      advanceToNextModule();
    }
  };

  const onEndingPress = (button: { id: string; action?: any }) => {
    if (!endingModule) return;
    handleActionButtonClick(endingModule.id, button.action);
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/* 슬라이드 전환 시 배경 그라디언트 cross-fade morph. 양방향 모두 자연스럽게 morph. */}
      <AnimatedSlideBackground
        background={currentSlider.background}
        transitionKey={currentSliderIndex}
      />

      {/* 헤더 — in-flow(하단 바와 동일). 콘텐츠 ScrollView 가 헤더 아래에서 끝나 클리핑되므로
          WebView 등 콘텐츠가 헤더 위로 못 올라온다(제목 가림/그라데이션 잘림 문제 제거). */}
      <View
        className="px-4"
        style={{ paddingTop: insets.top, paddingBottom: 0 }}
      >
        <View className="flex-row">
          <ProgressSegments
            total={curLesson.sliders.length}
            currentIndex={currentSliderIndex}
          />
        </View>
        <View className="flex-row items-center gap-3 mt-[4px]">
          <DefaultIconBtn
            onPress={handleExitPress}
            size={32}
            enableHapticFeedback
          >
            <X width={24} height={24} fill="#6C757D" />
          </DefaultIconBtn>
          <AnimatedSlideTitle
            transitionKey={currentSliderIndex}
            direction={slideDirection}
          >
            <Text className="bold-16 text-Text-Black_Secondary tracking-[-0.32px]">
              {curLesson.sliders[currentSliderIndex].title}
            </Text>
          </AnimatedSlideTitle>
        </View>
      </View>

      {/* Content — 헤더와 하단 바 사이 영역만 채움. 위/아래 둘 다 in-flow 라 콘텐츠가 그 영역으로 못 넘어온다.
          현재 슬라이드 기준 ±SLIDE_KEEP_ALIVE_WINDOW 슬라이드만 마운트(keep-alive 윈도우). */}
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
                ref={(ref) => { scrollViewRefs.current[sliderIdx] = ref as never; }}
                className="flex-1"
                contentContainerStyle={{
                  paddingHorizontal: 16,
                  paddingTop: 20,
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

      <AudioPlayer
        audioUrl={currentAudioUrl}
        paused={isPaused}
        playToken={audioNonce}
        onProgress={handleAudioProgress}
        onEnd={handleAudioEnd}
        onError={handleAudioError}
      />

      {/* 하단 액션 바 — in-flow(절대배치 아님). 위 콘텐츠 영역(ScrollView)이 바 위에서 끝나
          클리핑되므로, WebView 등 콘텐츠가 바/세이프에어리어로 절대 내려오지 못한다(비침 방지). */}
      <LessonBottomBar
        canGoPrev={currentSliderIndex > 0}
        onPrev={() => { if (currentSliderIndex > 0) goToSlide(currentSliderIndex - 1); }}
        onRestart={restartCurrentSlide}
        centerMode={centerMode}
        quizPrompt={quizPrompt}
        onCenterPress={centerMode === 'quiz-grade' ? handleQuizGrade : togglePauseResume}
        nextMode={nextMode}
        canGoNext={activeQuiz ? false : (nextMode === 'next-slide' ? !isLastSlide : true)}
        onNext={onNextPress}
        moduleProgress={progressInfo.target}
        progressKey={currentSliderIndex}
        accentColor={slideAccent}
        gradeResult={gradeResult}
        endingButtons={endingButtons}
        onEndingPress={onEndingPress}
        insetsBottom={insets.bottom}
      />

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

