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
import html_01 from '../../data/lessons/html_01.json';

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
}

/**
 * 모듈 렌더러 컴포넌트
 * - 각 모듈 타입에 따라 적절한 컴포넌트를 렌더링
 */
const ModuleRenderer: React.FC<ModuleRendererProps> = ({
  module,
  slideIndex,
  moduleIndex,
  curLesson,
  setCurLesson,
  setIsNextButtonEnabled,
  insets,
  headerHeight,
  buttonAreaHeight,
}) => {
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
        />
      );

    case 'terminal':
      return (
        <TerminalComponent 
          module={module}
          onLoadComplete={() => {
            // TODO: 로드 완료 처리
          }}
        />
      );

    default:
      return null;
  }
};

// =========================
// 🔷 메인 컴포넌트
// =========================

const LessonLearningScreenV2: React.FC<Props> = ({ route, navigation }) => {
  // =========================
  // 📌 기본 설정
  // =========================
  const lessonData = html_01.lessons[0];
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
    // console.log('🎯 초기화 - currentStepModules:', currentStepModules);
    const hasProblem = hasProblemModule(currentStepModules);
    // console.log('🎯 초기화 - hasProblem:', hasProblem);
    if (!hasProblem) {
    //   console.log('첫 스텝에 문제 없으면 버튼 활성화');
      setIsNextButtonEnabled(true);
    } else {
    //   console.log('첫 스텝에 문제 있으면 버튼 비활성화');
      setIsNextButtonEnabled(false);
    }
  }, []);

  // 복습 모드 설정
//   useEffect(() => {
//     if (lessonData?.isCompleted === true) {
//       setIsReviewMode(true);
//     }
//   }, [lessonData?.isCompleted]);

  // 슬라이드 변경 감지 - 새 슬라이드로 이동 시 버튼 상태 자동 업데이트
  useEffect(() => {
    if (curSlideIndex < visibleSlides.length) {
      const currentStepModules = getStepModules(curSlideStep[curSlideIndex]);
      const hasProblem = hasProblemModule(currentStepModules);
      console.log('🔄 슬라이드 변경 - 버튼 상태 업데이트:', { 
        slideIndex: curSlideIndex, 
        step: curSlideStep[curSlideIndex],
        hasProblem 
      });
      setIsNextButtonEnabled(!hasProblem);
    }
  }, [curSlideIndex, visibleSlides.length]);

//   // 화면 높이 측정
//   useEffect(() => {
//     const updateScreenHeight = () => {
//       const { height } = Dimensions.get('window');
//       setScreenHeight(height);
//     };
//     updateScreenHeight();
//     const subscription = Dimensions.addEventListener('change', updateScreenHeight);
//     return () => subscription?.remove();
//   }, []);

//   // 하트 값 변경 감지
//   useEffect(() => {
//     if (hearts !== previousHearts) {
//       const timer = setTimeout(() => {
//         setPreviousHearts(hearts);
//       }, 1000);
//       return () => clearTimeout(timer);
//     }
//   }, [hearts, previousHearts]);

  // 학습 종료 감지 - 모든 슬라이드 완료 시 학습 완료 처리
  useEffect(() => {
    console.log('📊 curSlideIndex 변경:', curSlideIndex, '/ 총:', curLesson?.sliders?.length);
    if (curSlideIndex > (curLesson?.sliders?.length ?? 0) - 1) {
      console.log('✅ 학습 종료 감지');
      handleLessonComplete();
    }
  }, [curSlideIndex]);

  // 페이지 이동 처리 - 새 슬라이드가 추가된 뒤에만 페이지 이동
  useEffect(() => {
    if (pendingGoToIndex !== null && visibleSlides.length > pendingGoToIndex) {
      console.log('🎬 슬라이드 이동:', pendingGoToIndex);
      // 렌더가 완료된 다음 프레임에 이동 (마운트 보장)
      requestAnimationFrame(() => {
        pagerRef.current?.setPage(pendingGoToIndex);
        setPendingGoToIndex(null);
      });
    }
  }, [visibleSlides.length, pendingGoToIndex]);

  // =========================
  // 🔧 유틸리티 함수들
  // =========================

  // 특정 스텝의 모듈들 가져오기
  const getStepModules = (step: number): SlideModule[] => {
    if (!curLesson) return [];
    // console.log('curLesson', curLesson);
    // console.log('curSlideIndex', curSlideIndex);
    // console.log('step', step);
    const stepModules = curLesson.sliders[curSlideIndex]?.modules
      .filter((m) => m?.visibility?.type === 'step' && m.visibility.value === step) || [];
    // console.log('stepModules', stepModules);
    return stepModules;
  };

  // 문제 모듈이 있는지 확인
  const hasProblemModule = (modules: SlideModule[]): boolean => {
    // console.log('modules', modules);
    // console.log('module type', modules.map(m => m.type));
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

  // 다음 슬라이드로 이동
  const goToNextSlide = () => {
    console.log('➡️ 다음 슬라이드 이동 시도');
    if (visibleSlides.length < (curLesson?.sliders?.length ?? 0)) {
      const nextIndex = visibleSlides.length; // 새 슬라이드 index
      const nextSlide = curLesson?.sliders[nextIndex];
      if (nextSlide) {
        console.log('✅ 새 슬라이드 추가:', nextIndex);
        setVisibleSlides(prev => [...prev, nextSlide]);
        setPendingGoToIndex(nextIndex); // 이동 예약
      }
    }
  };

  // 다음 버튼 클릭
  const handleNextPress = () => {
    console.log('🔵 다음 버튼 클릭');
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
      console.log('❓ 문제 모듈 발견:', problemModule.type);
      // TODO: 다음 단계에서 문제 채점 로직 구현
      console.log('⚠️ 문제 채점 로직은 다음 단계에서 구현');
      return;
    }

    // 문제가 없는 경우: 다음 스텝으로 이동
    const nextStepModules = getStepModules(curSlideStep[curSlideIndex] + 1);
    
    if (nextStepModules.length > 0) {
      // 다음 스텝이 있는 경우
      console.log('✅ 다음 스텝 모듈 있음:', nextStepModules.length, '개');
      setCurSlideStep(prev => {
        const updated = [...prev];
        updated[curSlideIndex] = (updated[curSlideIndex] || 1) + 1;
        console.log('📈 스텝 증가:', updated[curSlideIndex] - 1, '→', updated[curSlideIndex]);
        return updated;
      });

      // 다음 스텝에 문제가 있는지 확인
      const nextHasProblem = hasProblemModule(nextStepModules);
      if (nextHasProblem) {
        console.log('❗ 다음 스텝에 문제 있음 - 버튼 비활성화');
        setIsNextButtonEnabled(false);
      } else {
        console.log('✅ 다음 스텝에 문제 없음 - 버튼 활성화');
        setIsNextButtonEnabled(true);
      }
    } else {
      // 다음 스텝이 없는 경우: 다음 슬라이드로
      console.log('🎬 다음 스텝 없음 - 슬라이드 이동');
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
    // TODO: 다음 TTS 재생
  };

  const handleTtsError = (err: any) => {
    console.warn('TTS 재생 오류:', err);
    setIsPlaying(false);
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
                   {slide.modules
                     .filter((module: any) => 
                       module.visibility?.type === 'step' 
                         ? module.visibility.value <= curSlideStep[idx] 
                         : true
                     )
                     .map((module: any, moduleIndex: number) => (
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
                       />
                     ))}
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