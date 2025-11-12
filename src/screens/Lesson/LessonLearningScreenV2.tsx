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
// 🔷 메인 컴포넌트
// =========================

const LessonLearningScreenV2: React.FC<Props> = ({ route, navigation }) => {
  // =========================
  // 📌 기본 설정
  // =========================
  const lessonData = html_01.lessons[0];
  console.log('lessonData', lessonData);
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
  const [visibleSlides, setVisibleSlides] = useState([lessonData?.sliders[0]]);
  const [curSlideStep, setCurSlideStep] = useState<number[]>(
    Array(lessonData?.sliders.length).fill(0)
  );
  const [isNextButtonEnabled, setIsNextButtonEnabled] = useState<boolean>(false);
  const [isReviewMode, setIsReviewMode] = useState<boolean>(false);

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
  
  // 복습 모드 설정
//   useEffect(() => {
//     if (lessonData?.isCompleted === true) {
//       setIsReviewMode(true);
//     }
//   }, [lessonData?.isCompleted]);

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

//   // 학습 종료 감지
//   useEffect(() => {
//     if (curSlideIndex > (curLesson?.sliders?.length ?? 0) - 1) {
//       handleLessonComplete();
//     }
//   }, [curSlideIndex]);

  // =========================
  // 🛠 핸들러 함수들
  // =========================

  // 학습 완료 처리
//   const handleLessonComplete = () => {
//     if (isReviewMode) {
//       navigation.goBack();
//       return;
//     }

//     const finalLessonData = {
//       ...lessonDataOriginal,
//       sliders: curLesson?.sliders || [],
//       isCompleted: true,
//       completedAt: new Date().toISOString(),
//       id: lessonDataOriginal.lessonId,
//       title: lessonDataOriginal.title,
//       myclassId: lessonDataOriginal.myclassId,
//       sectionId: lessonDataOriginal.sectionId,
//     };

//     console.log("학습 종료 - 최종 데이터:", finalLessonData);
//     // TODO: 리포트 페이지로 이동
//     // navigation.navigate('LessonReport', { curLesson: finalLessonData });
//   };

  // 오답 처리
  const handleWrongAnswer = async () => {
    const willDeplete = hearts <= 1;
    const ok = await spendOne();
    if (!ok || willDeplete) {
      setDepletedOpen(true);
    }
  };

  // 다음 버튼 클릭
  const handleNextPress = () => {
    console.log("다음 버튼 클릭");
    // TODO: 다음 스텝/슬라이드 로직 구현
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

                  {/* TODO: 모듈 렌더링 영역 */}
                  <View className="bg-[#F5F5F5] p-[16px] rounded-[10px]">
                    <Text className="text-[#999] text-[14px]">
                      모듈 렌더링 영역 (추후 구현)
                    </Text>
                  </View>
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