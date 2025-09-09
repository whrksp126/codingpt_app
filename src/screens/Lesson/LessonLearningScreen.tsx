import React, { useEffect, useState, useRef } from 'react';
import { Pressable, ScrollView, Text, View, Image, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HeartStraight, X } from '../../assets/SvgIcon';
import { useNavigation } from '../../contexts/NavigationContext';
import { useHearts } from '../../contexts/HeartContext';
import { WebViewComponent } from '../../components/module/WebView';
import { ParagraghComponent } from '../../components/module/Paragragh';
import { CodeComponent } from '../../components/module/Code';
import { MultipleChoiceComponent } from '../../components/module/MultipleChoice';
import { CodeFillTheGapComponent } from '../../components/module/CodeFillTheGap';
import { PictureComponent } from '../../components/module/Picture';
import { LottieComponent } from '../../components/module/Lottie';
import { TerminalComponent } from '../../components/module/Terminal';
import HeartModal from '../../components/Modal/HeartModal';
import { ProgressBar } from '../../components/Progress/ProgressBar';
import { HeartCounter } from '../../components/Icon/HeartCounter';
import PagerView from 'react-native-pager-view';
import DefaultBtn from '../../components/Button/DefaultBtn';
import DefaultIconBtn from '../../components/Button/DefaultIconBtn';
import { AudioPlayer } from '../../components/AudioPlayer';

interface SlideModule{
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
  result?: any;       // 문제 모듈의 결과 데이터
  readonly?: boolean; // 복습용: 입력 비활성화
  tts?: string;       // TTS 오디오 URL
 
  // 탭 구조 터미널용
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
  modules: SlideModule[]
}

interface Lesson {
  id: number | string;
  title: string;
  sliders: Slide[];
  isCompleted: boolean;
}

const LessonLearningScreen: React.FC<{ route: any }> = ({ route }) => {
  // ✅ route 파라미터 확장
  // - mode: 'learn' | 'review'
  // - myclassId, lessonId: 저장에 필요
  // - reviewResults: 복습일 때 주입할 저장된 결과(JSON)
  const { lessonData } = route.params; // 레슨 데이터

  const pagerRef = useRef<PagerView>(null);
  const { goBack, navigate } = useNavigation();

  // 하트 관련 상태
  const { hearts, spendOne } = useHearts(); // 하트 컨텍스트
  const [depletedOpen, setDepletedOpen] = useState(false); // 하트 소진 모달
  const [previousHearts, setPreviousHearts] = useState(hearts); // 이전 하트 수 (애니메이션용)

  const insets = useSafeAreaInsets();

  // 레슨 관련 상태
  const [curLesson, setCurLesson] = useState<Lesson | null>(lessonData);
  const [curSlideIndex, setCurSlideIndex] = useState<number>(0);
  const [visibleSlides, setVisibleSlides] = useState([lessonData?.sliders[0]]);
  const [curSlideStep, setCurSlideStep] = useState<number[]>(
    Array(lessonData?.sliders.length).fill(0)
  );
  const [isModuleAdded, setIsModuleAdded] = useState<boolean>(false);
  const [isNextButtonEnabled, setIsNextButtonEnabled] = useState<boolean>(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const [webViewLoadCount, setWebViewLoadCount] = useState<number>(0);
  const [pendingGoToIndex, setPendingGoToIndex] = useState<number | null>(null);
  const [screenHeight, setScreenHeight] = useState<number>(0);
  const [scrollViewPaddingBottom, setScrollViewPaddingBottom] = useState<number>(0);
  
  // 프로그래스 바는 별도 컴포넌트로 분리됨
  const [headerHeight, setHeaderHeight] = useState<number>(0);
  const [buttonAreaHeight, setButtonAreaHeight] = useState<number>(0);
  const [newModuleHeight, setNewModuleHeight] = useState<number>(0);


// =========================
// 🔊 Δ-감지 + TTS 직렬 재생 상태/유틸
// =========================
const [renderedMap, setRenderedMap] = useState<Record<string, Set<string>>>({});
const [ttsQueue, setTtsQueue] = useState<string[]>([]);
const [isPlaying, setIsPlaying] = useState(false);
const [currentUrl, setCurrentUrl] = useState<string | null>(null);

const getSlideId = (idx: number) => String(curLesson?.sliders?.[idx]?.id ?? idx);


// 모듈을 "슬라이드ID::모듈인덱스" 키로 식별 (id 중복 안전)
const makeModuleKey = (slideId: string, moduleIndex: number) => `${slideId}::${moduleIndex}`;

// 현재 슬라이드에서 step 이하로 "보이는" 모듈 키들
const getVisibleModuleKeys = (lesson: Lesson, slideIndex: number, stepAtSlide: number) => {
  const slide = lesson.sliders[slideIndex];
  if (!slide) return [];
  const sid = getSlideId(slideIndex);
  const keys: string[] = [];
  slide.modules.forEach((m, i) => {
    if (m.visibility?.type === 'step' && (m.visibility?.value ?? 0) <= stepAtSlide) {
      keys.push(makeModuleKey(sid, i));
    }
  });
  return keys;
};

// 키 배열을 실제 모듈로 매핑 (모듈 인덱스로 접근)
const getModulesByKeys = (lesson: Lesson, slideIndex: number, keys: string[]) => {
  const slide = lesson.sliders[slideIndex];
  if (!slide) return [];
  const sid = getSlideId(slideIndex);
  return keys.map(k => {
    // k: `${sid}::${index}`
    const [, idxStr] = k.split('::');
    const mi = Number(idxStr);
    return slide.modules[mi];
  }).filter(Boolean);
};

const ttsEnqueue = (urls: string[]) => {
  if (!urls?.length) return;
  setTtsQueue(prev => [...prev, ...urls]);
};
const playNextFromQueue = () => {
  setTtsQueue(prev => {
    if (prev.length === 0) {
      setCurrentUrl(null);
      setIsPlaying(false);
      return prev;
    }
    const [first, ...rest] = prev;
    setCurrentUrl(first);
    setIsPlaying(true);
    return rest;
  });
};

// 👉 재생 중이던 TTS 즉시 중단 + 큐 제거
const hardStopTTS = () => {
  setTtsQueue([]);        // 대기열 비우기
  setIsPlaying(false);    // 내부 상태 리셋
  setCurrentUrl(null);    // AudioPlayer 언마운트 -> 즉시 정지
};

useEffect(() => {
  if (!isPlaying && ttsQueue.length > 0) {
    playNextFromQueue();
  }
}, [ttsQueue, isPlaying]);

// 프로그래스 바 애니메이션은 ProgressBar 컴포넌트에서 처리

// 하트 값 변경 감지 (애니메이션용)
useEffect(() => {
  if (hearts !== previousHearts) {
    // 하트 값이 변경되었을 때 이전 값 업데이트
    const timer = setTimeout(() => {
      setPreviousHearts(hearts);
    }, 1000); // 애니메이션 완료 후 업데이트

    return () => clearTimeout(timer);
  }
}, [hearts, previousHearts]);

const handleTtsLoad = () => {};
const handleTtsError = (err: any) => {
  console.warn('TTS 재생 오류:', err);
  setIsPlaying(false);
  playNextFromQueue();
};
const handleTtsEnd = () => {
  setIsPlaying(false);
  playNextFromQueue();
};


  // 오답 처리 → 하트 차감 → 0개면 모달
  const onWrongAnswer = async () => {
    // 차감 전 이미 1개 이하면, 소진 확정
    const willDeplete = hearts <= 1;
    const ok = await spendOne(); // 서버 반영
    if (!ok || willDeplete) {
      setDepletedOpen(true);
    }
  };

  // util: 현재 스텝에 문제 모듈 존재 여부
  const hasProblemInStep = (slideIndex: number, step: number) => {
    const mods = curLesson?.sliders[slideIndex]?.modules ?? [];
    const stepMods = mods.filter(m => m.visibility?.type === 'step' && m.visibility?.value === step);
    return !!stepMods.find(m => m.type === 'multipleChoice' || m.type === 'codeFillTheGap');
  };

  useEffect(() => {
    console.log('visibleSlides : ', visibleSlides);
  }, [visibleSlides]);



  // 복습(리뷰)일 때: results 오버레이
  // useEffect(() => {
  //   if (!curLesson) return;

  //   const rmap = curLesson?.result?.modules || {}; // { "sliderId#moduleId": {...} }
  //   const patched = {
  //     ...curLesson,
  //     isCompleted: true,
  //     sliders: curLesson.sliders.map((s) => ({
  //       ...s,
  //       modules: s.modules.map((m) => {
  //         const key = `${s.id}#${m.id}`;
  //         const picked = rmap[key];
  //         if (!picked) return m; // 결과 없는 모듈은 그대로

  //         // 공통: 읽기 전용
  //         const base: SlideModule = { ...m, readonly: true };

  //         if (m.type === 'multipleChoice') {
  //           // questions[].answer.userAnswer, isCorrect 주입
  //           const newModule: any = { ...base };
  //           newModule.questions = (newModule.questions || []).map((q: any) => ({
  //             ...q,
  //             answer: {
  //               ...q.answer,
  //               userAnswer: picked.userAnswer,
  //               isCorrect: picked.isCorrect
  //             }
  //           }));
  //           return newModule;
  //         }

  //         if (m.type === 'codeFillTheGap') {
  //           const newModule: any = { ...base };
  //           newModule.files = (newModule.files || []).map((f: any) => ({
  //             ...f,
  //             isInteractive: false,
  //             answers: (f.answers || []).map((a: any, idx: number) => ({
  //               ...a,
  //               userAnswer: picked.answers?.[idx] ?? a.userAnswer,
  //               optionElIndex: picked.optionElIndex?.[idx] ?? a.optionElIndex
  //             }))
  //           }));
  //           return newModule;
  //         }

  //         // paragraph/webview 등은 readonly만
  //         return base;
  //       })
  //     }))
  //   } as Lesson;

  //   setCurLesson(patched);
  //   setIsNextButtonEnabled(true); // 리뷰는 항상 다음 가능
  // }, [lessonData]);

  // 화면 높이 측정 및 화면 회전 감지
  useEffect(() => {
    const updateScreenHeight = () => {
      const { height } = Dimensions.get('window');
      setScreenHeight(height);
    };

    // 초기 설정
    updateScreenHeight();

    // 화면 회전 감지
    const subscription = Dimensions.addEventListener('change', updateScreenHeight);

    return () => subscription?.remove();
  }, []);

  // 화면 높이, 세이프 에어리어, 헤더/버튼 영역 높이, 새 모듈 높이 변경 시 ScrollView 패딩 업데이트
  useEffect(() => {
    const newPadding = calculateScrollViewPadding();
    setScrollViewPaddingBottom(newPadding);
  }, [screenHeight, insets.top, insets.bottom, headerHeight, buttonAreaHeight, newModuleHeight]);



  // 초기 진입: 첫 스텝에 문제 없으면 버튼 활성화
  useEffect(() => {
    const mods = getStepModules(curSlideStep[curSlideIndex]);
    const hasProblem = !!getProblemModule(mods || []);
    if (!hasProblem) setIsNextButtonEnabled(true);
  }, []);

  // 슬라이드 변경 시 보이기 목록 갱신
  useEffect(() => { // 다음 슬라이드로 넘어가면
    setVisibleSlides(curLesson?.sliders.slice(0, visibleSlides.length) || []);
  }, [curLesson]);

  // 모듈 추가 시 스텝 증가(다음 스텝 모듈 표현)
  useEffect(() => {
    if (!isModuleAdded) return;
  
    // ✅ 혹시 모를 중복 호출 방지(상태 변경 전에 false로 내려서 재진입 차단)
    setIsModuleAdded(false);
  
    setSortCurSlideModules();
    setCurSlideStep(prev => {
      const updated = [...prev];
      updated[curSlideIndex] = (updated[curSlideIndex] || 0) + 1;
      return updated;
    });
  }, [isModuleAdded]);


  // 학습 종료 감지
  useEffect(() => {
    console.log('curSlideIndex changed =>', curSlideIndex);
    if(curSlideIndex > (curLesson?.sliders?.length ?? 0) - 1){
      console.log("학습 종료 감지");
      navigate('lessonReport', { curLesson });
    }
  }, [curSlideIndex]);

  // 새 슬라이드가 추가된 뒤에만 페이지 이동
  useEffect(() => {
    if (pendingGoToIndex !== null && visibleSlides.length > pendingGoToIndex) {
      // 렌더가 완료된 다음 프레임에 이동 (마운트 보장)
      requestAnimationFrame(() => {
        pagerRef.current?.setPage(pendingGoToIndex);
        setPendingGoToIndex(null);
      });
    }
  }, [visibleSlides.length, pendingGoToIndex]);

  const setSortCurSlideModules = () => {
    setCurLesson(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        sliders: prev.sliders.map(slider => ({
          ...slider,
          modules: slider.modules.sort((a: SlideModule, b: SlideModule) => {
            return (a.visibility?.value ?? 0) - (b.visibility?.value ?? 0);
          })
        }))
      }
    })
  }

  // step이 끝나면 다음 슬라이드 추가 및 이동
  const goToNextSlide = () => {
    if (visibleSlides.length < (curLesson?.sliders?.length ?? 0)) {
      const nextIndex = visibleSlides.length; // 새 슬라이드 index
      setVisibleSlides(prev => [...prev, curLesson?.sliders[prev.length]]);
      setPendingGoToIndex(nextIndex); // 이동 예약

      // 🔊 새 슬라이드 보임 집합 초기화
      const sid = getSlideId(nextIndex);
      setRenderedMap(prev => ({ ...prev, [sid]: new Set<string>() }));
    }
  };

  // 다음 버튼 클릭 시 (확인 버튼)
  const onPressNext = async () => {
    // 🔊 새 모듈 적용 직전, 진행 중인 오디오 즉시 중단
    hardStopTTS();
    // 리뷰 모드면 그냥 넘김
    if (curLesson?.isCompleted === true) {
      const nextStepModules = getStepModules(curSlideStep[curSlideIndex] + 1);
      if (nextStepModules && nextStepModules.length > 0) {
        setCurSlideStep(prev => {
          const updated = [...prev];
          updated[curSlideIndex] = (updated[curSlideIndex] || 0) + 1;
          return updated;
        });
      } else {
        setCurSlideIndex(curSlideIndex + 1);
        goToNextSlide();
      }
      return;
    }

    // 학습 모드
    const curStepModules = getStepModules(curSlideStep[curSlideIndex]);
    const problemModule = getProblemModule(curStepModules || []);
    if(problemModule){
      // 현재 스텝에 문제가 포함된 경우
      const problemModuleId= curLesson?.sliders[curSlideIndex].modules.findIndex((module) => module.id === problemModule.id) ?? 0;

      if((curLesson?.sliders[curSlideIndex].modules[problemModuleId] as any)?.isCorrect === undefined) {

        if(problemModule.type === 'multipleChoice'){
          const result = problemModule.result;
          setIsModuleAdded(true);
          
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
            // (3) 나머지는 그대로
          }

          // 2) 전체 정답 여부 계산 (모든 문항이 맞아야 true)
          const target = newModules[problemModuleId] as any;
          const isAllCorrect =
            Array.isArray(target?.questions) &&
            target.questions.every((q: any) => q?.answer?.isCorrect === true);

          console.log({ isAllCorrect, target });

          // 3) result.modules 조건 필터링 (condition 없으면 전부 통과 → 기존 데이터 호환)
          const filteredResultModules = (result.modules ?? []).filter((mod: any) => {
            if (mod?.condition === 'correct') return isAllCorrect;
            if (mod?.condition === 'wrong') return !isAllCorrect;
            return true;
          });

          // 서버에서 받은 모듈들(해설 등) step 위치 조정해서 추가
          const resultModules = filteredResultModules.map((mod: any) => ({
            ...mod,
            visibility: {
              ...mod.visibility,
              value: (mod.visibility?.value ?? 0) + curSlideStep[curSlideIndex]
            }
          }));

          if (!isAllCorrect) {
            await onWrongAnswer();
          }

          curSlider.modules = [...newModules, ...resultModules];
          newSliders[curSlideIndex] = curSlider;
          newLesson.sliders = newSliders;

          setCurLesson(newLesson);
          setIsModuleAdded(true);
          setIsNextButtonEnabled(true);
        }

        if(problemModule.type === 'codeFillTheGap'){
          const result = problemModule.result;
          setIsModuleAdded(true);

          const newLesson = { ...curLesson } as any;
          const newSliders = [...newLesson.sliders];
          const curSlider = { ...newSliders[curSlideIndex] };
          const newModules = [...curSlider.modules];

          // 1) step 밀기 + 채점 (for 루프)
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
            // (3) 나머지는 그대로
          }

          // 2) 루프가 끝난 뒤에 전체 정답 여부 계산
          const target = newModules[problemModuleId] as any; // codeFillTheGap 모듈
          const isAllCorrect =
            Array.isArray(target?.files) &&
            target.files.every((file: any) =>
              Array.isArray(file.answers) &&
              file.answers.every((ans: any) => ans.isCorrect === true)
            );
          
          // 3) result.modules에서 condition에 맞는 것만 선택
          const filteredResultModules = (result.modules ?? []).filter((mod: any) => {
            if (mod?.condition === 'correct') return isAllCorrect;
            if (mod?.condition === 'wrong') return !isAllCorrect;
            return true; // condition이 없으면 그대로 통과
          });
          
          // 4) step 보정해서 붙이기
          const resultModules = filteredResultModules.map((mod: any) => ({
            ...mod,
            visibility: {
              ...mod.visibility,
              value: (mod.visibility?.value ?? 0) + curSlideStep[curSlideIndex]
            }
          }));
          
          if (!isAllCorrect) {
            await onWrongAnswer();
          }
          // console.log({ isAllCorrect, resultModulesLen: resultModules.length, raw: result.modules });

          curSlider.modules = [...newModules, ...resultModules];
          newSliders[curSlideIndex] = curSlider;
          newLesson.sliders = newSliders;

          setCurLesson(newLesson);
          setIsModuleAdded(true);
          setIsNextButtonEnabled(true);
        }
      } else {
        // 채점 완료된 경우: 다음 스텝 모듈 출력
        const nextStepModules = getStepModules(curSlideStep[curSlideIndex] + 1);
        if (nextStepModules && nextStepModules.length > 0) {
          // 다음 스텝이 있는 경우
          setCurSlideStep(prev => {
            const updated = [...prev];
            updated[curSlideIndex] = (updated[curSlideIndex] || 0) + 1;
            return updated;
          })
        } else {
          // 다음 스텝이 없는 경우
          goToNextSlide();
        }
      }
    } else {
      // 현재 스텝이 문제가 없는 경우: 다음 스텝 모듈 출력
      const nextStepModules = getStepModules(curSlideStep[curSlideIndex] + 1)
      if(nextStepModules.length > 0){
        // 다음 스텝이 있는 경우, 다음 스탭 모듈 출력
        setCurSlideStep(prev => {
          const updated = [...prev];
          updated[curSlideIndex] = (updated[curSlideIndex] || 0) + 1;
          return updated;
        })
        // 다음 스탭에 문제가 있는 경우: 확인 버튼 비활성화
        const problemModule = getProblemModule(nextStepModules || []);
        if(problemModule){
          setIsNextButtonEnabled(false); // 확인 버튼 비활성화
        }
      } else {
        // 다음 스텝이 없는 경우
        setCurSlideIndex(curSlideIndex + 1);
        goToNextSlide(); // 다음 슬라이드로 이동
      }
    }
  }

  // modules에서 특정 스텝 데이터만 조회 (현재 슬라이드의 특정 스텝 모듈만)
  const getStepModules = (step: number) => {
    const stepModules = curLesson?.sliders[curSlideIndex].modules
      .filter((m) => m?.visibility?.type === 'step' && m.visibility.value === step) || [];
    return stepModules
  };

  // 새로운 모듈이 추가될 때 스크롤을 맨 아래로 이동
  useEffect(() => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [webViewLoadCount]);

  // =========================
  // 🔊 Δ-감지(TTS) 이펙트
  // =========================
  useEffect(() => {
    if (!curLesson) return;
  
    const sid = getSlideId(curSlideIndex);
    const prevShown = new Set(renderedMap[sid] ?? []);
    const nowShownKeys = getVisibleModuleKeys(curLesson, curSlideIndex, curSlideStep[curSlideIndex] ?? 0);
  
    // 이번 변화로 "처음 보이게 된" 모듈 키들
    const deltaKeys = nowShownKeys.filter(k => !prevShown.has(k));
    if (deltaKeys.length === 0) return;
  
    // 등장 순서: (1) step 오름차순, (2) 모듈 인덱스 오름차순
    const deltaModules = getModulesByKeys(curLesson, curSlideIndex, deltaKeys)
      .map((m, i) => ({ m, k: deltaKeys[i] }))
      .sort((a, b) => {
        const va = a.m.visibility?.value ?? 0;
        const vb = b.m.visibility?.value ?? 0;
        if (va !== vb) return va - vb;
        // 같은 step이면 모듈 인덱스 비교
        const ia = Number(a.k.split('::')[1]);
        const ib = Number(b.k.split('::')[1]);
        return ia - ib;
      })
      .map(x => x.m);
  
    const newTts = deltaModules
      .map(m => (m as any).tts)
      .filter((u: string | undefined) => typeof u === 'string' && u.length > 0) as string[];
  
    ttsEnqueue(newTts);
  
    setRenderedMap(prev => ({
      ...prev,
      [sid]: new Set(nowShownKeys),
    }));
  }, [
    curLesson,
    curSlideIndex,
    visibleSlides.length,
    curSlideStep[curSlideIndex],
  ]);

  // 문제 유형 모듈 찾기
  const getProblemModule = (modules: SlideModule[]) => {
    const found = modules.find(m => m.type === 'multipleChoice' || m.type === 'codeFillTheGap');
    return found ? found : null;
  };

  // ScrollView 패딩 계산 함수
  const calculateScrollViewPadding = () => {
    if (!screenHeight || !headerHeight || !buttonAreaHeight) return 0;
    
    // 세이프 에어리어를 제외한 실제 사용 가능한 화면 높이
    const safeAreaHeight = screenHeight - insets.top - insets.bottom;
    
    // 실제 측정된 헤더와 버튼 영역 높이를 제외한 실제 슬라이드 영역 높이
    const availableSlideHeight = safeAreaHeight - headerHeight - buttonAreaHeight;
    
    // 새 모듈의 높이가 실제로 측정되었다면 그 높이를 기준으로 패딩 계산
    if (newModuleHeight > 0) {
      // 화면에 보이는 ScrollView 높이 - 새 모듈 높이 - 상단 여유공간(20px) = 필요한 패딩 바텀
      const topMargin = 20;
      const calculatedPadding = availableSlideHeight - newModuleHeight - topMargin;
      
      return Math.max(0, calculatedPadding);
    }
    
    // 새 모듈 높이가 아직 측정되지 않았다면 패딩 없음
    return 0;
  };

  // ---------- ★ 결과 추출(JSON) ----------
  function extractResultsFromLesson(lesson: Lesson, lid?: number | string) {
    const modules: Record<string, any> = {};
    (lesson.sliders || []).forEach((s) => {
      (s.modules || []).forEach((m: any) => {
        if (m.type === 'multipleChoice' && Array.isArray(m.questions)) {
          const ua = m.questions?.[0]?.answer?.userAnswer ?? null;
          const ic = m.questions?.[0]?.answer?.isCorrect ?? null;
          if (ua !== null) modules[`${s.id}#${m.id}`] = { type: 'multipleChoice', userAnswer: ua, isCorrect: ic };
        }
        if (m.type === 'codeFillTheGap' && Array.isArray(m.files)) {
          const answers = m.files?.[0]?.answers?.map((a: any) => a.userAnswer ?? null) || [];
          const optionElIndex = m.files?.[0]?.answers?.map((a: any) => a.optionElIndex ?? null) || [];
          if (answers.some((v: any) => v !== null)) {
            modules[`${s.id}#${m.id}`] = { type: 'codeFillTheGap', answers, optionElIndex };
          }
        }
      });
    });
    console.log('결과 추출 완료')
    console.log('lesson.id : ', lesson.id);
    console.log('lid : ', lid);
    console.log('completed_at : ', new Date().toISOString());
    console.log('extractResultsFromLesson : ', modules);

    return {
      lesson_id: lid ?? lesson.id,
      completed_at: new Date().toISOString(),
      modules
    };
  }
  
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
        <DefaultIconBtn
          onPress={() => goBack()}
          size={35}
          enableHapticFeedback={true}
          enableSound={true}
          pressScale={0.85}
          pressOpacity={0.6}
          bounceScale={1.15}
        >
          <X width={35} height={35} fill="#ccc" />
        </DefaultIconBtn>
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
        <HeartCounter
          value={hearts}
          previousValue={previousHearts}
          size={35}
          color="#EE5555"
          textSize={18}
          textColor="#EE5555"
          animated={true}
          onAnimationComplete={() => {
            console.log('하트 카운터 애니메이션 완료!');
          }}
        />
      </View>

      {/* 본문(슬라이드 컨텐츠) */}
      <View style={{ flex: 1 }}>
        <PagerView
          ref={pagerRef}
          style={{ flex: 1 }}
          initialPage={0}
          onPageSelected={e => setCurSlideIndex(e.nativeEvent.position)}
        >
          {visibleSlides.map((slide, idx) => (
            <View key={`slide-${idx}`} className="flex-1" >
              <ScrollView 
                ref={scrollViewRef} 
                className="flex-1"
                contentContainerStyle={{ paddingBottom: scrollViewPaddingBottom }}
              >
                <View className="flex-col gap-[20px] px-[16px] pt-[20px]">
                  <Text className="text-[#111] text-[18px] font-[700]">{slide.role || slide.title || ""}</Text>
                  {slide.modules
                    .filter((module: any) => (module.visibility?.type === 'step' ? module.visibility.value <= curSlideStep[idx] : true))
                    .map((module: any, moduleIndex: any, filteredModules: any[]) => {
                      const isLastModule = moduleIndex === filteredModules.length - 1;
                      
                      switch (module.type) {
                        case 'paragraph':
                          return (
                            <View 
                              key={`slide-${idx}-module-${moduleIndex}`}
                              onLayout={(event) => {
                                const { height } = event.nativeEvent.layout;
                                // 마지막 모듈이거나 높이가 변경되었을 때만 업데이트
                                if (isLastModule && height !== newModuleHeight) {
                                  setNewModuleHeight(height);
                                }
                              }}
                            >      
                              <ParagraghComponent module={module} />
                            </View>
                          );
                        case 'image':
                          return (
                            <View 
                              key={`slide-${idx}-module-${moduleIndex}`}
                              onLayout={(event) => {
                                const { height } = event.nativeEvent.layout;
                                // 마지막 모듈이거나 높이가 변경되었을 때만 업데이트
                                if (isLastModule && height !== newModuleHeight) {
                                  setNewModuleHeight(height);
                                }
                              }}
                            >
                              <PictureComponent module={module} />
                            </View>
                          );
                        case 'lottie':
                          return (
                            <View 
                              key={`slide-${idx}-module-${moduleIndex}`}
                              onLayout={(event) => {
                                const { height } = event.nativeEvent.layout;
                                // 마지막 모듈이거나 높이가 변경되었을 때만 업데이트
                                if (isLastModule && height !== newModuleHeight) {
                                  setNewModuleHeight(height);
                                }
                              }}
                            >
                              <LottieComponent module={module} />
                            </View>
                          );
                        case 'code':
                          return (
                            <View 
                              key={`slide-${idx}-module-${moduleIndex}`}
                              onLayout={(event) => {
                                const { height } = event.nativeEvent.layout;
                                // 마지막 모듈이거나 높이가 변경되었을 때만 업데이트
                                if (isLastModule && height !== newModuleHeight) {
                                  setNewModuleHeight(height);
                                }
                              }}
                            >
                              <CodeComponent 
                                module={module}
                                onLoadComplete={() => {
                                  setWebViewLoadCount(prev => prev + 1);
                                }}
                              />
                            </View>
                          );

                        case 'webview':
                          return (
                            <View 
                              key={`slide-${idx}-module-${moduleIndex}`}
                              onLayout={(event) => {
                                const { height } = event.nativeEvent.layout;
                                // 마지막 모듈이거나 높이가 변경되었을 때만 업데이트
                                if (isLastModule && height !== newModuleHeight) {
                                  setNewModuleHeight(height);
                                }
                              }}
                            >
                              <WebViewComponent 
                                module={module} 
                                onLoadComplete={() => {
                                  setWebViewLoadCount(prev => prev + 1);
                                }}
                                safeAreaInsets={insets}
                                headerHeight={headerHeight}
                                buttonAreaHeight={buttonAreaHeight}
                              />
                            </View>
                          );
                        case 'multipleChoice':
                          return (
                            <View 
                              key={`slide-${idx}-module-${moduleIndex}`}
                              onLayout={(event) => {
                                const { height } = event.nativeEvent.layout;
                                // 마지막 모듈이거나 높이가 변경되었을 때만 업데이트
                                if (isLastModule && height !== newModuleHeight) {
                                  setNewModuleHeight(height);
                                }
                              }}
                            >
                            <MultipleChoiceComponent 
                              setIsNextButtonEnabled={setIsNextButtonEnabled}
                              curSlideIndex={idx}
                              moduleIndex={moduleIndex}
                              curLesson={curLesson}
                              setCurLesson={setCurLesson}
                            />
                            </View>
                          );
                        case 'codeFillTheGap':
                          return (
                            <View 
                              key={`slide-${idx}-module-${moduleIndex}`}
                              onLayout={(event) => {
                                const { height } = event.nativeEvent.layout;
                                // 마지막 모듈이거나 높이가 변경되었을 때만 업데이트
                                if (isLastModule && height !== newModuleHeight) {
                                  setNewModuleHeight(height);
                                }
                              }}
                            >
                              <CodeFillTheGapComponent 
                                setIsNextButtonEnabled={setIsNextButtonEnabled}
                                curSlideIndex={idx}
                                moduleIndex={moduleIndex}
                                curLesson={curLesson}
                                setCurLesson={setCurLesson}
                                onLoadComplete={() => {
                                  setWebViewLoadCount(prev => prev + 1);
                                }}
                              />
                            </View>
                          );
                        case 'terminal':
                          return (
                            <View 
                              key={`slide-${idx}-module-${moduleIndex}`}
                              onLayout={(event) => {
                                const { height } = event.nativeEvent.layout;
                                // 마지막 모듈이거나 높이가 변경되었을 때만 업데이트
                                if (isLastModule && height !== newModuleHeight) {
                                  setNewModuleHeight(height);
                                }
                              }}
                            >
                              <TerminalComponent 
                                module={module}
                                onLoadComplete={() => {
                                  setWebViewLoadCount(prev => prev + 1);
                                }}
                              />
                            </View>
                          );
                      default:
                        return null;
                    }
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
                  onPress={onPressNext}
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

      {/* 🔊 숨김 AudioPlayer: TTS 큐 직렬 재생 */}
      {currentUrl && (
        <AudioPlayer
          audioUrl={currentUrl}
          onLoadComplete={handleTtsLoad}
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
          navigate('classProgress'); // ✅ 결과 저장 없이 강의 목록으로 이동
        }}
      />

    </>
  );
};

export default LessonLearningScreen;