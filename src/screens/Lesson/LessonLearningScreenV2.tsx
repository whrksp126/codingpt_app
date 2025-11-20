import React, { useEffect, useState, useRef } from 'react';
import { Pressable, ScrollView, Text, View, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from '../../assets/SvgIcon';
import { useHearts } from '../../contexts/HeartContext';
import HeartModal from '../../components/Modal/HeartModal';
import { ProgressBar } from '../../components/Progress/ProgressBar';
import { HeartCounter } from '../../components/Icon/HeartCounter';
import PagerView from 'react-native-pager-view';
import DefaultBtn from '../../components/Button/DefaultBtn';
import DefaultIconBtn from '../../components/Button/DefaultIconBtn';
import { AudioPlayer } from '../../components/AudioPlayer';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { LessonFlowStackParamList } from '../../navigation/types';
import js_01 from '../../data/lessons/js_01.json';

// 모듈 컴포넌트들
import { ParagraghComponent } from '../../components/module/Paragragh';
import { PictureComponent } from '../../components/module/Picture';
import { CodeComponent } from '../../components/module/Code';
import { WebViewComponent } from '../../components/module/WebView';
import { MultipleChoiceComponent } from '../../components/module/MultipleChoice';
import { CodeFillTheGapComponent } from '../../components/module/CodeFillTheGap';
import { TerminalComponent } from '../../components/module/Terminal';
import { LottieComponent } from '../../components/module/Lottie';

// =========================
// 🔷 타입 정의
// =========================

interface SlideModule {
  id: number | string;
  type: 'paragraph' | 'image' | 'code' | 'webview' | 'multipleChoice' | 'codeFillTheGap' | 'terminal';
  content: string;
  visibility: {
    type: string;
    value: number;
  };
  options?: {
    label: string;
    isCorrect: boolean;
  }[];
  result?: any;
  readonly?: boolean;
  tts?: string;
  files?: Array<{
    name: string;
    language: 'js' | 'py';
    script: Array<{ type: 'input' | 'output'; text: string }>;
    autoRun?: boolean;
    typingDelay?: number;
  }>;
}

interface Slide {
  id: number | string;
  title: string;
  role?: string;
  modules: SlideModule[];
}

interface Lesson {
  id: number | string;
  title: string;
  sliders: Slide[];
  isCompleted: boolean;
}

type Props = NativeStackScreenProps<LessonFlowStackParamList, 'LessonLearning'>;

// =========================
// 🔷 모듈 렌더러 컴포넌트
// =========================
interface ModuleRendererProps {
  module: any;
  slideIndex: number;
  moduleIndex: number;
  curLesson: Lesson | null;
  setCurLesson: React.Dispatch<React.SetStateAction<Lesson | null>>;
  setIsNextButtonEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  insets: any;
  headerHeight: number;
  buttonAreaHeight: number;
  isActive: boolean;
}

/**
 * 모듈 렌더러 컴포넌트
 * - 각 모듈 타입에 따라 적절한 컴포넌트를 렌더링
 */
const ModuleRendererInner: React.FC<ModuleRendererProps> = (props) => {
  const {
    module,
    slideIndex,
    moduleIndex,
    curLesson,
    setCurLesson,
    setIsNextButtonEnabled,
    insets,
    headerHeight,
    buttonAreaHeight,
    isActive,
  } = props;

  // 🔹 프리렌더 대상 타입 (WebView, Code, Terminal)
  const isPreloadType =
    module.type === 'webview' ||
    module.type === 'code' ||
    module.type === 'terminal' ||
    module.type === 'codeFillTheGap';

  console.log(
    '🔁 ModuleRenderer render:', module.type,
    'slideIndex =', slideIndex,
    'moduleIndex =', moduleIndex,
    'isActive =', isActive
  );

  if (!isPreloadType && !isActive) {
    return null;
  }
  
  switch (module.type) {
    case 'paragraph':
      return <ParagraghComponent module={module} />;

    case 'image':
      return <PictureComponent module={module} />;

    case 'lottie':
      return <LottieComponent module={module} />;

    case 'code':
      return (
        <CodeComponent 
          module={module}
          onLoadComplete={() => {
            // TODO: WebView 로드 완료 처리
          }}
          isActive={isActive}
        />
      );

    case 'webview':
      return (
        <WebViewComponent 
          module={module} 
          onLoadComplete={() => {
            // TODO: WebView 로드 완료 처리
          }}
          safeAreaInsets={insets}
          headerHeight={headerHeight}
          buttonAreaHeight={buttonAreaHeight}
          isActive={isActive}
        />
      );

    case 'multipleChoice':
      return (
        <MultipleChoiceComponent 
          setIsNextButtonEnabled={setIsNextButtonEnabled}
          curSlideIndex={slideIndex}
          moduleIndex={moduleIndex}
          curLesson={curLesson}
          setCurLesson={setCurLesson}
        />
      );

    case 'codeFillTheGap':
      return (
        <CodeFillTheGapComponent 
          setIsNextButtonEnabled={setIsNextButtonEnabled}
          curSlideIndex={slideIndex}
          moduleIndex={moduleIndex}
          curLesson={curLesson}
          setCurLesson={setCurLesson}
          onLoadComplete={() => {
            // TODO: WebView 로드 완료 처리
          }}
          isActive={isActive}
        />
      );

    case 'terminal':
      return (
        <TerminalComponent
          module={module}
          onLoadComplete={() => {
            // TODO: 로드 완료 처리
          }}
          isActive={isActive}
        />
      );

    default:
      return null;
  }
};

/**
 * memo로 감싼 래퍼 컴포넌트
 * - curLesson 변화는 비교에서 일부러 제외해서
 *   "실제 module 객체가 바뀐 것"만 보고 리렌더 여부를 결정
 */
const ModuleRenderer = React.memo(
  ModuleRendererInner,
  (prev, next) => {
    // 1) 모듈 타입이 바뀌면 무조건 다시 렌더
    if (prev.module.type !== next.module.type) return false;

    // 2) module 객체가 같은 경우 → 해당 모듈 내용 안 바뀜
    //    (보기 선택/정답 체크 시에는 해당 모듈만 새 객체로 복사되므로, 여기서 걸린다)
    const isSameModule = prev.module === next.module;

    // 3) 슬라이드 인덱스 / 모듈 인덱스 / 레이아웃 관련 값이 같다면 그대로 재사용
    const isSamePosition =
      prev.slideIndex === next.slideIndex &&
      prev.moduleIndex === next.moduleIndex &&
      prev.headerHeight === next.headerHeight &&
      prev.buttonAreaHeight === next.buttonAreaHeight &&
      prev.insets?.top === next.insets?.top &&
      prev.insets?.bottom === next.insets?.bottom;

    const isSameActive = prev.isActive === next.isActive; // 현재 화면에 보여줄지 여부

    // 4) set 함수는 일반적으로 동일 참조이므로 비교에 포함
    const isSameHandlers =
      prev.setCurLesson === next.setCurLesson &&
      prev.setIsNextButtonEnabled === next.setIsNextButtonEnabled;

    // ❗ 여기서 curLesson은 비교에 "포함하지 않는다"
    // - MultipleChoice / CodeFillTheGap는 보기 선택 시 해당 module 객체를 새로 만들어서 넣기 때문에
    //   → module 참조가 바뀌고, 위의 isSameModule이 false가 되어 자동으로 리렌더됨
    // - paragraph / image / lottie / code / webview / terminal 은
    //   module 객체가 그대로이면 curLesson이 바뀌어도 다시 렌더할 필요가 없음

    return isSameModule && isSamePosition && isSameHandlers && isSameActive;
  }
);

// =========================
// 🔷 메인 컴포넌트
// =========================

const LessonLearningScreenV2: React.FC<Props> = ({ route, navigation }) => {
  // =========================
  // 📌 기본 설정
  // =========================
  const lessonData = js_01.lessons[0];
//   console.log('lessonData', lessonData);
//   const { lessonData: lessonDataOriginal } = route.params as any;
//   const lessonData = JSON.parse(JSON.stringify(lessonDataOriginal));
  const insets = useSafeAreaInsets();
  const pagerRef = useRef<PagerView>(null);
  const scrollViewRef = useRef<ScrollView>(null);

  // =========================
  // 📌 하트 관련 상태
  // =========================
  const { hearts, spendOne } = useHearts();
  const [depletedOpen, setDepletedOpen] = useState(false);
  const [previousHearts, setPreviousHearts] = useState(hearts);

  // =========================
  // 📌 레슨/슬라이드 관련 상태
  // =========================
  const [curLesson, setCurLesson] = useState<Lesson | null>(lessonData as Lesson);
  const [curSlideIndex, setCurSlideIndex] = useState<number>(0);
  const [visibleSlides, setVisibleSlides] = useState<Slide[]>(
    lessonData?.sliders[0] ? [lessonData.sliders[0] as Slide] : []
  );
  const [curSlideStep, setCurSlideStep] = useState<number[]>(
    Array(lessonData?.sliders.length).fill(1) // step은 1부터 시작
  );
  const [isNextButtonEnabled, setIsNextButtonEnabled] = useState<boolean>(false);
  const [isReviewMode, setIsReviewMode] = useState<boolean>(false);
  const [pendingGoToIndex, setPendingGoToIndex] = useState<number | null>(null);
  const [isModuleAdded, setIsModuleAdded] = useState<boolean>(false);

  // =========================
  // 📌 레이아웃 관련 상태
  // =========================
  const [screenHeight, setScreenHeight] = useState<number>(0);
  const [headerHeight, setHeaderHeight] = useState<number>(0);
  const [buttonAreaHeight, setButtonAreaHeight] = useState<number>(0);
  const [scrollViewPaddingBottom, setScrollViewPaddingBottom] = useState<number>(0);

  // =========================
  // 📌 TTS 관련 상태
  // =========================
  const [ttsQueue, setTtsQueue] = useState<string[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);

  // =========================
  // 🎬 초기화 Effect
  // =========================
  
  // 초기 진입: 첫 스텝에 문제 없으면 버튼 활성화
  useEffect(() => {
    const currentStepModules = getStepModules(curSlideStep[curSlideIndex]);
    const hasProblem = hasProblemModule(currentStepModules);
    if (!hasProblem) {
      setIsNextButtonEnabled(true);
    } else {
      setIsNextButtonEnabled(false);
    }

    // 첫 스텝 TTS 큐 초기화
    const ttsUrls = currentStepModules
      .filter(m => m.tts)
      .map(m => m.tts as string);
    if (ttsUrls.length > 0) {
      setTtsQueue(ttsUrls);
    }
  }, []);

  // 슬라이드 변경 감지 - 새 슬라이드로 이동 시 버튼 상태 자동 업데이트
  useEffect(() => {
    if (curSlideIndex < visibleSlides.length) {
      const currentStepModules = getStepModules(curSlideStep[curSlideIndex]);
      const hasProblem = hasProblemModule(currentStepModules);
      // console.log('🔄 슬라이드 변경 - 버튼 상태 업데이트:', { 
      //   slideIndex: curSlideIndex, 
      //   step: curSlideStep[curSlideIndex],
      //   hasProblem 
      // });
      setIsNextButtonEnabled(!hasProblem);
      
      // TTS 초기화 (새 슬라이드의 TTS는 스텝 Effect에서 처리)
      setIsPlaying(false);
      setCurrentUrl(null);
    }
  }, [curSlideIndex, visibleSlides.length]);

  // 학습 종료 감지 - 모든 슬라이드 완료 시 학습 완료 처리
  useEffect(() => {
    // console.log('📊 curSlideIndex 변경:', curSlideIndex, '/ 총:', curLesson?.sliders?.length);
    if (curSlideIndex > (curLesson?.sliders?.length ?? 0) - 1) {
      console.log('✅ 학습 종료 감지');
      handleLessonComplete();
    }
  }, [curSlideIndex]);

  // 페이지 이동 처리 - 새 슬라이드가 추가된 뒤에만 페이지 이동
  useEffect(() => {
    if (pendingGoToIndex !== null && visibleSlides.length > pendingGoToIndex) {
      // console.log('🎬 슬라이드 이동:', pendingGoToIndex);
      // 렌더가 완료된 다음 프레임에 이동 (마운트 보장)
      requestAnimationFrame(() => {
        pagerRef.current?.setPage(pendingGoToIndex);
        setPendingGoToIndex(null);
      });
    }
  }, [visibleSlides.length, pendingGoToIndex]);

  // 모듈 추가 후 스텝 증가 처리 (채점 후 해설 모듈 표시)
  useEffect(() => {
    if (!isModuleAdded) return;

    setIsModuleAdded(false); // 플래그 리셋

    // 다음 프레임에 스텝 증가 (레슨 데이터 업데이트 후)
    requestAnimationFrame(() => {
      setCurSlideStep(prev => {
        const updated = [...prev];
        updated[curSlideIndex] = (updated[curSlideIndex] || 1) + 1;
        return updated;
      });
    });
  }, [isModuleAdded, curSlideIndex]);

  // 스텝 변경 시 TTS 큐 업데이트
  useEffect(() => {
    const currentStepModules = getStepModules(curSlideStep[curSlideIndex]);
    const ttsUrls = currentStepModules
      .filter(m => m.tts)
      .map(m => m.tts as string);
    
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    curSlideIndex, 
    curSlideStep, 
    // curLesson 전체가 아닌 현재 슬라이드의 모듈 개수만 감지 (보기 선택 시 재실행 방지)
    curLesson?.sliders[curSlideIndex]?.modules?.length
  ]);

  // 스텝 변경 시 자동 스크롤
  useEffect(() => {
    if (scrollViewRef.current && curSlideStep[curSlideIndex] > 1) {
      // 렌더링 완료 후 스크롤 (새 모듈이 화면에 추가된 후)
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [curSlideStep[curSlideIndex]]);

  // TTS 큐 재생 관리
  useEffect(() => {
    // 재생 중이거나 큐가 비어있으면 무시
    if (isPlaying || ttsQueue.length === 0) return;

    // 첫 번째 TTS 재생 시작
    const nextUrl = ttsQueue[0];
    setCurrentUrl(nextUrl);
    setIsPlaying(true);
  }, [ttsQueue, isPlaying]);

  // =========================
  // 🔧 유틸리티 함수들
  // =========================

  // 특정 스텝의 모듈들 가져오기
  const getStepModules = (step: number): SlideModule[] => {
    if (!curLesson) return [];
    const stepModules = curLesson.sliders[curSlideIndex]?.modules
      .filter((m) => m?.visibility?.type === 'step' && m.visibility.value === step) || [];
    return stepModules;
  };

  // 문제 모듈이 있는지 확인
  const hasProblemModule = (modules: SlideModule[]): boolean => {
    return modules.some(m => m.type === 'multipleChoice' || m.type === 'codeFillTheGap');
  };

  // 문제 모듈 찾기
  const getProblemModule = (modules: SlideModule[]): SlideModule | null => {
    const found = modules.find(m => m.type === 'multipleChoice' || m.type === 'codeFillTheGap');
    return found || null;
  };

  // =========================
  // 🛠 핸들러 함수들
  // =========================

  // 학습 완료 처리
  const handleLessonComplete = () => {
    console.log('🎉 학습 완료 처리');
    if (isReviewMode) {
      navigation.goBack();
      return;
    }
    const finalLessonData = {
      ...lessonData,
      sliders: curLesson?.sliders || [],
      isCompleted: true,
      completedAt: new Date().toISOString(),
    };
    console.log('🎉 학습 완료 - 최종 데이터:', finalLessonData);
    // TODO: 리포트 페이지로 이동
    // navigation.navigate('LessonReport', { curLesson: finalLessonData });
  };

  // 오답 처리
  const handleWrongAnswer = async () => {
    const willDeplete = hearts <= 1;
    const ok = await spendOne();
    if (!ok || willDeplete) {
      setDepletedOpen(true);
    }
  };

  // 객관식 문제 채점
  const handleMultipleChoiceGrading = (problemModule: SlideModule, problemModuleId: number) => {
    const result = problemModule.result;

    if (!curLesson) return;

    const newLesson = { ...curLesson } as any;
    const newSliders = [...newLesson.sliders];
    const curSlider = { ...newSliders[curSlideIndex] };
    const newModules = [...curSlider.modules];

    // 1) step 밀기 + 채점
    for (let i = 0; i < newModules.length; i++) {
      const module = newModules[i];
      const moduleStep = module.visibility?.value ?? 0;

      // (1) 현재 스텝보다 뒤에 있는 모듈은 step을 뒤로 미룸
      if (moduleStep > curSlideStep[curSlideIndex]) {
        newModules[i] = {
          ...module,
          visibility: {
            ...module.visibility,
            value: moduleStep + (result.totalStep || 0),
          }
        };
      }

      // (2) 문제 모듈이면 정답 결과 반영
      if (i === problemModuleId && Array.isArray((module as any).questions)) {
        const newModule = { ...module } as any;
        newModule.questions = newModule.questions.map((q: any) => ({
          ...q,
          answer: {
            ...q.answer,
            isCorrect: q.answer.answer === q.answer.userAnswer
          }
        }));
        newModules[i] = newModule;
      }
    }

    // 2) 전체 정답 여부 계산 (모든 문항이 맞아야 true)
    const target = newModules[problemModuleId] as any;
    const isAllCorrect =
      Array.isArray(target?.questions) &&
      target.questions.every((q: any) => q?.answer?.isCorrect === true);

    // 3) result.modules 조건 필터링
    const filteredResultModules = (result.modules ?? []).filter((mod: any) => {
      if (mod?.condition === 'correct') return isAllCorrect;
      if (mod?.condition === 'wrong') return !isAllCorrect;
      return true; // condition이 없으면 전부 통과
    });

    // 4) 해설 모듈들 step 위치 조정해서 추가
    const resultModules = filteredResultModules.map((mod: any) => ({
      ...mod,
      visibility: {
        ...mod.visibility,
        value: (mod.visibility?.value ?? 0) + curSlideStep[curSlideIndex]
      }
    }));

    // 5) 오답이면 하트 차감
    if (!isAllCorrect) {
      console.log('❌ 오답 - 하트 차감');
      handleWrongAnswer();
    }

    // 6) 레슨 데이터 업데이트 + step 순서대로 정렬
    curSlider.modules = [...newModules, ...resultModules].sort((a, b) => {
      const stepA = a.visibility?.value ?? 0;
      const stepB = b.visibility?.value ?? 0;
      return stepA - stepB; // step 오름차순 정렬
    });
    newSliders[curSlideIndex] = curSlider;
    newLesson.sliders = newSliders;

    setCurLesson(newLesson);
    
    // 🔥 중요: visibleSlides도 함께 업데이트해야 화면에 반영됨
    setVisibleSlides(prev => {
      const updated = [...prev];
      updated[curSlideIndex] = newSliders[curSlideIndex];
      // console.log('📺 visibleSlides 업데이트:', updated[curSlideIndex]);
      return updated;
    });
    
    // 7) 모듈 추가 완료 플래그 설정 (Effect에서 스텝 증가 처리)
    setIsModuleAdded(true);
    setIsNextButtonEnabled(true);
  };

  // 코드 빈칸 채우기 문제 채점
  const handleCodeFillTheGapGrading = (problemModule: SlideModule, problemModuleId: number) => {
    const result = problemModule.result;

    if (!curLesson) return;

    const newLesson = { ...curLesson } as any;
    const newSliders = [...newLesson.sliders];
    const curSlider = { ...newSliders[curSlideIndex] };
    const newModules = [...curSlider.modules];

    // 1) step 밀기 + 채점
    for (let i = 0; i < newModules.length; i++) {
      const module = newModules[i];
      const moduleStep = module.visibility?.value ?? 0;

      // (1) 현재 스텝보다 뒤에 있는 모듈은 step을 뒤로 미룸
      if (moduleStep > curSlideStep[curSlideIndex]) {
        newModules[i] = {
          ...module,
          visibility: {
            ...module.visibility,
            value: moduleStep + (result.totalStep || 0),
          }
        };
      }

      // (2) 문제 모듈이면 정답 결과 반영
      if (i === problemModuleId && Array.isArray((module as any).files)) {
        const newModule = { ...module } as any;
        newModule.files = newModule.files.map((file: any) => ({
          ...file,
          answers: file.answers.map((ansObj: any) => ({
            ...ansObj,
            isCorrect: ansObj.answer === ansObj.userAnswer,
          }))
        }));
        newModules[i] = newModule;
      }
    }

    // 2) 전체 정답 여부 계산
    const target = newModules[problemModuleId] as any;
    const isAllCorrect =
      Array.isArray(target?.files) &&
      target.files.every((file: any) =>
        Array.isArray(file.answers) &&
        file.answers.every((ans: any) => ans.isCorrect === true)
      );

    // 3) result.modules 조건 필터링
    const filteredResultModules = (result.modules ?? []).filter((mod: any) => {
      if (mod?.condition === 'correct') return isAllCorrect;
      if (mod?.condition === 'wrong') return !isAllCorrect;
      return true; // condition이 없으면 전부 통과
    });

    // 4) 해설 모듈들 step 위치 조정해서 추가
    const resultModules = filteredResultModules.map((mod: any) => ({
      ...mod,
      visibility: {
        ...mod.visibility,
        value: (mod.visibility?.value ?? 0) + curSlideStep[curSlideIndex]
      }
    }));

    // 5) 오답이면 하트 차감
    if (!isAllCorrect) {
      console.log('❌ 오답 - 하트 차감');
      handleWrongAnswer();
    }

    // 6) 레슨 데이터 업데이트 + step 순서대로 정렬
    curSlider.modules = [...newModules, ...resultModules].sort((a, b) => {
      const stepA = a.visibility?.value ?? 0;
      const stepB = b.visibility?.value ?? 0;
      return stepA - stepB; // step 오름차순 정렬
    });
    newSliders[curSlideIndex] = curSlider;
    newLesson.sliders = newSliders;

    setCurLesson(newLesson);
    
    // 🔥 중요: visibleSlides도 함께 업데이트해야 화면에 반영됨
    setVisibleSlides(prev => {
      const updated = [...prev];
      updated[curSlideIndex] = newSliders[curSlideIndex];
      // console.log('📺 visibleSlides 업데이트 (코드빈칸):', updated[curSlideIndex]);
      return updated;
    });
    
    // 7) 모듈 추가 완료 플래그 설정 (Effect에서 스텝 증가 처리)
    setIsModuleAdded(true);
    setIsNextButtonEnabled(true);
  };

  // 다음 슬라이드로 이동
  const goToNextSlide = () => {
    if (visibleSlides.length < (curLesson?.sliders?.length ?? 0)) {
      const nextIndex = visibleSlides.length; // 새 슬라이드 index
      const nextSlide = curLesson?.sliders[nextIndex];
      if (nextSlide) {
        setVisibleSlides(prev => [...prev, nextSlide]);
        setPendingGoToIndex(nextIndex); // 이동 예약
      }
    }
  };

  // 다음 버튼 클릭
  const handleNextPress = () => {
    console.log('📍 현재 상태:', {
      curSlideIndex,
      curStep: curSlideStep[curSlideIndex],
      isReviewMode
    });

    // 복습 모드면 그냥 넘김
    if (isReviewMode) {
      const nextStepModules = getStepModules(curSlideStep[curSlideIndex] + 1);
      if (nextStepModules && nextStepModules.length > 0) {
        console.log('📖 복습모드 - 다음 스텝으로');
        setCurSlideStep(prev => {
          const updated = [...prev];
          updated[curSlideIndex] = (updated[curSlideIndex] || 1) + 1;
          return updated;
        });
      } else {
        console.log('📖 복습모드 - 다음 슬라이드로');
        setCurSlideIndex(curSlideIndex + 1);
        goToNextSlide();
      }
      return;
    }

    // 학습 모드: 현재 스텝 모듈 확인
    const currentStepModules = getStepModules(curSlideStep[curSlideIndex]);
    const problemModule = getProblemModule(currentStepModules);

    if (problemModule) {
      // 문제 모듈의 인덱스 찾기
      const problemModuleId = curLesson?.sliders[curSlideIndex].modules.findIndex(
        (module) => module.id === problemModule.id
      ) ?? 0;

      // 이미 채점된 문제인지 확인
      const isAlreadyGraded = (curLesson?.sliders[curSlideIndex].modules[problemModuleId] as any)?.isCorrect !== undefined;

      if (isAlreadyGraded) {
        // 채점 완료된 경우: 다음 스텝으로
        const nextStepModules = getStepModules(curSlideStep[curSlideIndex] + 1);
        if (nextStepModules && nextStepModules.length > 0) {
          setCurSlideStep(prev => {
            const updated = [...prev];
            updated[curSlideIndex] = (updated[curSlideIndex] || 1) + 1;
            return updated;
          });
        } else {
          setCurSlideIndex(curSlideIndex + 1);
          goToNextSlide();
        }
        return;
      }

      // 채점 로직 실행
      if (problemModule.type === 'multipleChoice') {
        handleMultipleChoiceGrading(problemModule, problemModuleId);
      } else if (problemModule.type === 'codeFillTheGap') {
        handleCodeFillTheGapGrading(problemModule, problemModuleId);
      }
      return;
    }

    // 문제가 없는 경우: 다음 스텝으로 이동
    const nextStepModules = getStepModules(curSlideStep[curSlideIndex] + 1);
    
    if (nextStepModules.length > 0) {
      // 다음 스텝이 있는 경우
      setCurSlideStep(prev => {
        const updated = [...prev];
        updated[curSlideIndex] = (updated[curSlideIndex] || 1) + 1;
        return updated;
      });

      // 다음 스텝에 문제가 있는지 확인
      const nextHasProblem = hasProblemModule(nextStepModules);
      if (nextHasProblem) {
        setIsNextButtonEnabled(false);
      } else {
        setIsNextButtonEnabled(true);
      }
    } else {
      // 다음 스텝이 없는 경우: 다음 슬라이드로
      setCurSlideIndex(curSlideIndex + 1);
      goToNextSlide();
    }
  };

  // 나가기 버튼 클릭
  const handleExitPress = () => {
    navigation.goBack();
  };

  // TTS 핸들러
  const handleTtsEnd = () => {
    setIsPlaying(false);
    
    // 큐에서 재생 완료된 TTS 제거
    setTtsQueue(prev => {
      const updated = prev.slice(1);
      return updated;
    });
  };

  const handleTtsError = (err: any) => {
    console.warn('🎵 TTS 재생 오류:', err);
    setIsPlaying(false);
    
    // 오류 발생 시에도 큐에서 제거하고 다음으로 진행
    setTtsQueue(prev => prev.slice(1));
  };

  // =========================
  // 🎨 렌더링
  // =========================

  if (!curLesson) return null;

  return (
    <>
      {/* 상단 헤더 */}
      <View 
        className="flex-row items-center gap-[16px] h-[50px] px-[16px] border-b border-[#ccc]"
        onLayout={(event) => {
          const { height } = event.nativeEvent.layout;
          setHeaderHeight(height);
        }}
      >
        {/* 나가기 버튼 */}
        <DefaultIconBtn
          onPress={handleExitPress}
          size={35}
          enableHapticFeedback={true}
          enableSound={true}
          pressScale={0.85}
          pressOpacity={0.6}
          bounceScale={1.15}
        >
          <X width={35} height={35} fill="#ccc" />
        </DefaultIconBtn>

        {/* 프로그레스 바 */}
        <View className="flex-1">
          <ProgressBar
            current={visibleSlides.length}
            total={curLesson?.sliders.length || 1}
            height={20}
            backgroundColor="#E5E5E5"
            progressColor="#FFC800"
            borderRadius={10}
            animated={true}
          />
        </View>

        {/* 하트 카운터 */}
        <HeartCounter
          value={hearts}
          previousValue={previousHearts}
          size={35}
          color="#EE5555"
          textSize={18}
          textColor="#EE5555"
          animated={true}
        />
      </View>

      {/* 본문 (슬라이드 컨텐츠) */}
      <View style={{ flex: 1 }}>
        <PagerView
          ref={pagerRef}
          style={{ flex: 1 }}
          initialPage={0}
          onPageSelected={e => setCurSlideIndex(e.nativeEvent.position)}
        >
          {visibleSlides.map((slide, idx) => (
            <View key={`slide-${idx}`} className="flex-1">
              <ScrollView 
                ref={scrollViewRef}
                className="flex-1"
                contentContainerStyle={{ paddingBottom: scrollViewPaddingBottom }}
              >
                 <View className="flex-col gap-[20px] px-[16px] pt-[20px]">
                   {/* 슬라이드 제목 */}
                   <Text className="text-[#111] text-[18px] font-[700]">
                     {slide.role || slide.title || ""}
                   </Text>
 
                   {/* 모듈 렌더링 */}
                   {slide.modules.map((module: any, moduleIndex: number) => {
                      const visibility = module.visibility;
                      const isStepType = visibility?.type === 'step';
                      const stepValue = isStepType ? visibility.value : null;

                      // ✅ 이 모듈이 현재 스텝에서 화면에 보여져야 하는지 여부
                      const isActive =
                        isStepType
                          ? stepValue <= curSlideStep[idx]   // 기존 filter 조건과 동일
                          : true;

                      // ✅ 프리로드 대상 모듈 타입 정의
                      const isPreloadType =
                        module.type === 'webview' ||
                        module.type === 'code' ||
                        module.type === 'terminal' ||
                        module.type === 'codeFillTheGap' ;

                      // ✅ 이 모듈을 마운트할지 결정
                      const shouldMount = isPreloadType
                        ? (
                            isStepType
                              ? stepValue <= curSlideStep[idx] + 1 // 현재 스텝 + 1까지는 미리 마운트 (프리렌더)
                              : true
                          )
                        : isActive; // 나머지 모듈은 isActive일 때만 마운트

                      if (!shouldMount) return null; // 마운트할 필요가 없으면 완전히 렌더하지 않음

                      return (
                        <ModuleRenderer
                          key={`slide-${idx}-module-${moduleIndex}`}
                          module={module}
                          slideIndex={idx}
                          moduleIndex={moduleIndex}
                          curLesson={curLesson}
                          setCurLesson={setCurLesson}
                          setIsNextButtonEnabled={setIsNextButtonEnabled}
                          insets={insets}
                          headerHeight={headerHeight}
                          buttonAreaHeight={buttonAreaHeight}
                          isActive={isActive}   // 현재 화면에 보여줄지 여부
                        />
                      );
                    })}
                 </View>
              </ScrollView>

              {/* 하단 버튼 */}
              <View 
                className="flex-row items-center gap-[16px] p-[16px]"
                onLayout={(event) => {
                  const { height } = event.nativeEvent.layout;
                  setButtonAreaHeight(height);
                }}
              >
                <DefaultBtn
                  onPress={handleNextPress}
                  text="확인"
                  disabled={!isNextButtonEnabled || idx !== visibleSlides.length - 1}
                  buttonClassName={`
                    flex items-center justify-center 
                    h-[50px] 
                    rounded-[10px] 
                    ${isNextButtonEnabled && idx === visibleSlides.length - 1 ? 'bg-[#58CC02]' : 'bg-[#E5E5E5]'}
                  `}
                  textClassName={`
                    text-[18px] font-[700] text-center 
                    ${!isNextButtonEnabled || idx !== visibleSlides.length - 1 ? 'text-[#AFAFAF]' : 'text-[#fff]'}
                  `}
                  enableHapticFeedback={true}
                  enableSound={true}
                />
              </View>
            </View>
          ))}
        </PagerView>
      </View>

      {/* TTS 오디오 플레이어 */}
      {currentUrl && (
        <AudioPlayer
          audioUrl={currentUrl}
          onLoadComplete={() => {}}
          onError={handleTtsError}
          onEnd={handleTtsEnd}
        />
      )}

      {/* 하트 소진 모달 */}
      <HeartModal
        visible={depletedOpen}
        variant="depleted"
        onClose={() => setDepletedOpen(false)}
        onPressGoBack={() => {
          navigation.goBack();
        }}
      />
    </>
  );
};

export default LessonLearningScreenV2;