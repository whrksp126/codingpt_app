import React, { useEffect, useState, useRef } from 'react';
import { Pressable, ScrollView, Text, View, Image, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HeartStraight, X } from '../../assets/SvgIcon';
import { useNavigation } from '../../contexts/NavigationContext';
import { WebViewComponent } from '../../components/module/WebView';
import { ParagraghComponent } from '../../components/module/Paragragh';
import { CodeComponent } from '../../components/module/Code';
import { MultipleChoiceComponent } from '../../components/module/MultipleChoice';
import { CodeFillTheGapComponent } from '../../components/module/CodeFillTheGap';
import { PictureComponent } from '../../components/module/Picture';
import PagerView from 'react-native-pager-view';


interface SlideModule{
  id: number | string;
  type: 'paragraph' | 'image' | 'code' | 'webview' | 'multipleChoice' | 'codeFillTheGap';
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
  const insets = useSafeAreaInsets();

  const [curLesson, setCurLesson] = useState<Lesson | null>(lessonData);
  const [curSlideIndex, setCurSlideIndex] = useState<number>(0);
  const [visibleSlides, setVisibleSlides] = useState([lessonData?.sliders[0]]);
  // console.log('visibleSlides : ', visibleSlides); // 초기에 첫번째 슬라이드 데이터
  // sliders.length만큼 0을 넣어줍니다.
  const [curSlideStep, setCurSlideStep] = useState<number[]>(
    Array(lessonData?.sliders.length).fill(0)
  );
  // console.log('curSlideStep : ', curSlideStep); // 0번지에 2가 들어가고 나머진 0
  const [isModuleAdded, setIsModuleAdded] = useState<boolean>(false);
  const [isNextButtonEnabled, setIsNextButtonEnabled] = useState<boolean>(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const [webViewLoadCount, setWebViewLoadCount] = useState<number>(0);
  const [pendingGoToIndex, setPendingGoToIndex] = useState<number | null>(null);
  const [screenHeight, setScreenHeight] = useState<number>(0);
  const [scrollViewPaddingBottom, setScrollViewPaddingBottom] = useState<number>(0);
  const [headerHeight, setHeaderHeight] = useState<number>(0);
  const [buttonAreaHeight, setButtonAreaHeight] = useState<number>(0);
  const [newModuleHeight, setNewModuleHeight] = useState<number>(0);

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
    // console.log('다음 슬라이드로 넘어가면 visibleSlides', visibleSlides);
  }, [curLesson]);

  // 모듈 추가 시 스텝 증가(다음 스텝 모듈 표현)
  useEffect(() => {
    if(isModuleAdded){
      setSortCurSlideModules();
      setCurSlideStep(prev => {
        const updated = [...prev];
        updated[curSlideIndex] = (updated[curSlideIndex] || 0) + 1;
        return updated;
      });
      setIsModuleAdded(false);
    }
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
    }
  };

  // 다음 버튼 클릭 시 (확인 버튼)
  const onPressNext = () => {
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
      
      return calculatedPadding;
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
        <Pressable onPress={() => goBack()}><X width={35} height={35} fill="#ccc" /></Pressable>
        <View className="flex-1 bg-[#E5E5E5] rounded-[10px] overflow-hidden">
          <View className="h-[20px] rounded-[10px] bg-[#FFC800]"
            style={{ width: `${((visibleSlides.length) / curLesson.sliders.length) * 100}%` }} />
        </View>
        <View className="flex-row items-center gap-[5px]">
          <HeartStraight width={35} height={35} fill="#EE5555" />
          <Text className="text-[#EE5555] text-[18px] font-[700]">5</Text>
        </View>
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
                  <Text className="text-[#111] text-[18px] font-[700]">{slide.title || '제목 없음'}</Text>
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
                              key={`slide-${curSlideIndex}-module-${moduleIndex}`}
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
                              readonly={(module as any).readonly === true} // ✅ 복습모드 비활성
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
                                readonly={(module as any).readonly === true}   // ✅ 복습모드 비활성
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
                <Pressable 
                  onPress={onPressNext}
                  disabled={!isNextButtonEnabled || idx !== visibleSlides.length - 1}
                  className={`
                    flex items-center justify-center flex-1 
                    h-[50px] 
                    rounded-[10px] 
                    ${isNextButtonEnabled && idx === visibleSlides.length - 1 ? 'bg-[#58CC02]' : 'bg-[#E5E5E5]'}
                  `}>
                  <Text className={`
                    text-[18px] font-[700] text-center ${!isNextButtonEnabled || idx !== visibleSlides.length - 1 ? 'text-[#AFAFAF]' : 'text-[#fff] '}
                  `}>
                    확인
                  </Text>
                </Pressable>
              </View>
            </View>
          ))}
        </PagerView>
      </View>
    </>
  );
};

export default LessonLearningScreen;