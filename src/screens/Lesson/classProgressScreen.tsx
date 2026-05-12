import React, { useEffect, useMemo, useState, useRef } from 'react';
import { ScrollView, Pressable, Text, View, Image, Modal, Button, Alert, Platform } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useLesson } from '../../contexts/LessonContext';
import { useTheme } from '../../contexts/ThemeContext';
import { CaretLeft, ChatBubbleTail, Notepad, Play, Star } from '../../assets/SvgIcon';
// import { html as fetchData } from '../../data/item/lesson_data.js';
import LessonDetailModal from '../../components/Modal/LessonDetailModal';
import AsyncStorage from '@react-native-async-storage/async-storage';
import CircleBtn from '../../components/Button/CircleBtn';
import DefaultIconBtn from '../../components/Button/DefaultIconBtn';
import AnimatedPressable from '../../components/Button/AnimatedPressable';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { LessonFlowStackParamList } from '../../navigation/types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
// ✅ product -> fetchData 호환 구조로 변환
// - product.name        -> classData.title
// - Classes[0].Sections -> classData.sections[*]
// - Sections[*].Lessons -> sections[*].lessons[*]
// - Lessons[*].Slides[0].contents.* 를 lessons[*]에 병합(flatten)
function transformProductToClassData(product: any) {
  const cls = product?.Classes?.[0];
  const statusList = product?.status;


  console.log('statusList : ', statusList);
  // id 기준 오름차순
  // const flat = (product?.status ?? []).sort((a: any, b: any) => (a.id ?? 0) - (b.id ?? 0));
  // console.log('flat : ', flat);

  return {
    title: product?.name ?? '제목 없음',                  // fetchData.title
    description: product?.description ?? '',             // 필요 시 사용
    progress: 0,                                         // 현재 섹션 인덱스(앱 로직에 맞게 갱신)
    sections: (cls?.Sections ?? [])
      .sort((a: any, b: any) => (a.order_no ?? 0) - (b.order_no ?? 0))  // 섹션 정렬
      .map((section: any) => {
        return {
          title: section?.name ?? '섹션 제목 없음',          // fetchData.sections[*].title
          progress: 0,                                     // 현재 레슨 인덱스(앱 로직에 맞게 갱신)
          // ↓ 레슨 평탄화
          lessons: (section?.Lessons ?? [])
            .sort((a: any, b: any) => (a.order_no ?? 0) - (b.order_no ?? 0))  // 레슨 정렬
            .map((lesson: any) => {
              // Slides[*].contents 에 실제 표시용 데이터가 들어있다고 했으니 안전하게 꺼냄
              // 백엔드가 LessonSlideMap.order_no 로 정렬해서 내려주지만, 혹시를 위해 한 번 더 정렬.
              const rawSlides = Array.isArray(lesson?.Slides) ? lesson.Slides : [];
              const slides = [...rawSlides].sort(
                (a: any, b: any) =>
                  (a?.LessonSlideMap?.order_no ?? 0) - (b?.LessonSlideMap?.order_no ?? 0)
              );
              const firstSlide = slides[0] ?? {};
              const contents = firstSlide?.contents ?? {};

              // contents 안에 구조가 케이스별로 다를 수 있어 방어코드로 안전하게 추출
              // - title 후보: contents.lessons?.[0]?.title || contents.title || lesson.name
              const contentsLesson0 = Array.isArray(contents?.lessons) ? contents.lessons[0] : null;
              const mergedTitle =
                contentsLesson0?.title ??
                contents?.title ??
                lesson?.name ??
                `Lesson ${lesson?.id ?? ''}`;

              // sliders 추출:
              // 1) 레거시 nested format: contents.lessons[0].sliders 또는 contents.sliders
              // 2) 신규 per-slide format: 각 Slide.contents가 하나의 슬라이더 (background/role/modules 포함)
              let mergedSliders: any[];
              if (contentsLesson0?.sliders && Array.isArray(contentsLesson0.sliders)) {
                mergedSliders = contentsLesson0.sliders;
              } else if (Array.isArray(contents?.sliders)) {
                mergedSliders = contents.sliders;
              } else {
                mergedSliders = slides
                  .map((s: any, idx: number) => {
                    const c = s?.contents;
                    if (!c || typeof c !== 'object') return null;
                    return {
                      id: s?.id ?? idx,
                      title: c.title ?? '',
                      role: c.role,
                      background: c.background,
                      modules: Array.isArray(c.modules) ? c.modules : [],
                    };
                  })
                  .filter(Boolean);
              }

              // lesson의 id와 일치하는 status 찾기
              const lessonStatus = Array.isArray(statusList)
                ? statusList.find((s: any) => s.lesson_id === lesson?.id)
                : null;
              // 완료 여부 판단
              const status = lessonStatus?.status;
              console.log('status : ', status);
              const isCompleted = status === 2 ? true : false;
              console.log('isCompleted : ', isCompleted);


              // 필요 없는 필드는 버리고, 필요한 것만 병합
              return {
                lessonId: lesson?.id,          // 📌 fetchData 요구사항: id는 Lessons.id와 일치
                title: mergedTitle,            // 화면에 보일 제목
                isCompleted: isCompleted,      // 레슨 완료 여부(myclass_status)
                sliders: mergedSliders,        // 화면 모듈(없으면 [])
                myclassId: lessonStatus?.myclass_id,
                sectionId: section?.id,
                result: lessonStatus?.results, // 레슨 결과(복습 모드 시 필요)
              };
            }),
        };
      }),
  };
}

type Props = NativeStackScreenProps<LessonFlowStackParamList, 'ClassProgress'>;

const ClassProgressScreen: React.FC<Props> = ({ navigation }) => {
  const [classData, setClassData] = useState<any>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedLessonData, setSelectedLessonData] = useState<any>(null);
  const { activeProductId, getProduct } = useLesson();
  const [curLessonData, setCurLessonData] = useState<any>(null);
  const insets = useSafeAreaInsets();
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';
  const inactiveLessonBg = isDark ? '#2A2F37' : '#E5E5E5';
  useEffect(() => {
    if (classData) {
      let found = false;
      for (const section of classData.sections) {
        for (const lesson of section.lessons) {
          if (!lesson.isCompleted) {
            setCurLessonData(lesson);
            found = true;
            break;
          }
        }
        if (found) break;
      }
      if (!found) setCurLessonData(null);
    }
  }, [classData]);

  // 말풍선 둥둥 떠다니는 애니메이션 (UI 스레드 무한 반복)
  const bubbleFloat = useSharedValue(0);
  const bubbleFloatStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: bubbleFloat.value }],
  }));

  const startBubbleAnimation = () => {
    bubbleFloat.value = withRepeat(
      withTiming(-8, {
        duration: 1500,
        easing: Easing.inOut(Easing.sin),
      }),
      -1,
      true,
    );
  };


  const onPressLessonOutlineButton = async () => {
    const lessonId = curLessonData?.lessonId ?? 0;
    navigation.navigate('LessonOutline', { lessonId });
  }

  useEffect(() => {
    // activeProductId가 없으면 홈으로 리다이렉트
    if (!activeProductId) {
      Alert.alert(
        '알림',
        '강의 정보를 찾을 수 없습니다.\n홈화면으로 이동합니다.',
        [{ text: '확인', onPress: () => navigation.getParent()?.navigate('Tabs', { screen: 'home', params: { screen: 'HomeScreen' } }) }]
      );
      return;
    }

    // 말풍선 애니메이션 시작
    startBubbleAnimation();

    const product = getProduct(activeProductId);

    // product가 없으면 홈으로 리다이렉트
    if (!product) {
      Alert.alert(
        '알림',
        '해당 강의를 찾을 수 없습니다.\n홈화면으로 이동합니다.',
        [{ text: '확인', onPress: () => navigation.getParent()?.navigate('Tabs', { screen: 'home', params: { screen: 'HomeScreen' } }) }]
      );
      return;
    }

    console.log("product,", product);
    const transformed = transformProductToClassData(product);
    console.log('transformed : ', transformed);
    setClassData(transformed);

    // 최근 학습 정보를 AsyncStorage에 저장
    saveRecentLessonData(product);

    // setClassData(fetchData.class_list[0]);
  }, [activeProductId]);

  // 최근 학습 정보 저장 함수
  const saveRecentLessonData = async (product: any) => {
    try {
      const recentLessonData = {
        productId: product.id,
        productName: product.name,
        timestamp: new Date().toISOString()
      };

      await AsyncStorage.setItem('recentLesson', JSON.stringify(recentLessonData));
      console.log('✅ 최근 학습 정보 저장 완료:', recentLessonData);
    } catch (error) {
      console.error('❌ 최근 학습 정보 저장 실패:', error);
    }
  };

  // 레슨 아이템 클릭 시 모달 오픈
  // - sectionIndex, lessonIndex로 classData에서 해당 lesson을 찾아 모달에 전달
  // - 모달 내부에서 "학습 시작" or "복습" 제어 예정(학습 여부는 추후 LessonContext/서버값 기반)
  const onPressLessonButton = (sectionIndex: number, lessonIndex: number) => {
    const lessonData = classData.sections[sectionIndex].lessons[lessonIndex]; // classData에서 해당 lesson을 찾아 모달에 전달
    console.log('모달에 전달된 레슨 데이터 lessonData : ', lessonData);
    setSelectedLessonData(lessonData); // 모달에 전달
    setModalVisible(true); // 모달 오픈
  }

  // 초기 로딩 중이면 아무것도 렌더링하지 않음
  if (classData === null) return null;

  return (
    <>
      {/* 헤더 */}
      <View className="flex-row justify-between items-center px-[16px] pb-[7px] pt-[20px] bg-white dark:bg-[#0A0D14]"
        style={{ paddingTop: insets.top }}
      >
        {/* 상단 헤더: 뒤로가기 버튼 */}
        <DefaultIconBtn
          onPress={() => navigation.goBack()}
          size={35}
          enableHapticFeedback={true}
          enableSound={true}
          pressScale={0.85}
          pressOpacity={0.6}
          bounceScale={1.15}
        >
          <CaretLeft width={35} height={35} fill="#CCCCCC" />
        </DefaultIconBtn>

        <View className="h-[40px]" />
      </View>

      {/* 상단 카드 */}
      <View className="flex-col justify-between items-center w-full px-[16px] bg-white dark:bg-[#0A0D14]">
        <View className="flex flex-row w-full gap-[2px] bg-white dark:bg-[#0A0D14]">
          {/* 현재 선택된(또는 진행 중인) 섹션 제목 노출 카드 */}
          <AnimatedPressable
            onPress={() => { }}
            className="flex-1 w-full h-[78px]"
            scaleValue={0.9}
            bounceValue={1.05}
          >
            {({ onPress, onPressIn, onPressOut, disabled }) => (
              <Pressable
                onPress={onPress}
                onPressIn={onPressIn}
                onPressOut={onPressOut}
                disabled={disabled}
                className="flex-1 w-full h-[78px] px-[16px] rounded-l-[12px] bg-[#93D333]"
              >
                <View className="pt-[12px]">
                  <Text className="text-[#FFFFFF] text-[16px] font-[700] opacity-70">{classData.title}</Text>
                  <Text className="text-[#FFFFFF] text-[19px] font-[700]">{classData.sections[0].title}</Text>
                </View>
              </Pressable>
            )}
          </AnimatedPressable>
          <AnimatedPressable
            onPress={onPressLessonOutlineButton}
            className="h-[78px]"
            scaleValue={0.9}
            bounceValue={1.05}
          >
            {({ onPress, onPressIn, onPressOut, disabled }) => (
              <Pressable
                onPress={onPress}
                onPressIn={onPressIn}
                onPressOut={onPressOut}
                disabled={disabled}
                className="items-center justify-center h-[78px] p-[16px] bg-[#93D333] rounded-r-[12px]"
              >
                <Notepad width={28} height={28} fill="#FFFFFF" />
              </Pressable>
            )}
          </AnimatedPressable>
        </View>
      </View>
      {/* ===== 본문: 섹션/레슨 리스트 ===== */}
      <ScrollView className="px-[16px] bg-white dark:bg-[#0A0D14]">
        {/* 섹션 레슨 리스트 */}
        {classData.sections.map((section: any, sectionIndex: number) => (
          <View key={`section_${sectionIndex}`}>
            {/* 섹션 타이틀 */}
            <View className="flex-row items-center gap-[16px] h-[82px]">
              <View className="flex-1 h-[2px] bg-[#ccc] dark:bg-[#3F444D]" />
              <Text className="text-[#ccc] dark:text-[#9CA3AF] text-[19px] font-[700]">{section.title}</Text>
              <View className="flex-1 h-[2px] bg-[#ccc] dark:bg-[#3F444D]" />
            </View>
            {/* 레슨 리스트 */}
            {section.lessons.map((lesson: any, lessonIndex: number) => {

              // ✅ 이 레슨이 "완료된 레슨의 바로 다음 레슨"(섹션 단위)인가?
              const prevLesson = section.lessons[lessonIndex - 1];
              const isNextAfterCompleted = !!prevLesson?.isCompleted && !lesson.isCompleted;

              return (
                <View key={`section_${sectionIndex}_lesson_${lessonIndex}`} className="px-[16px]">
                  <View className="flex-col items-center justify-center">
                    {/* 🗨️ "시작" 말풍선 (전역 첫 미완료 or 완료다음레슨) */}
                    {curLessonData?.lessonId === lesson.lessonId && (
                      <Animated.View
                        className="relative w-[88px] p-[12px] border border-[#93D333] rounded-[12px] bg-[#F0FFE5]"
                        style={bubbleFloatStyle}
                      >
                        <Text className="text-[#93D333] text-[17px] font-[700] text-center">시작</Text>
                        <View className="absolute bottom-[-6.5px] left-1/2" style={{ marginLeft: 8 }}>
                          <ChatBubbleTail width={8} height={7.5} fill="#93D333" bgColor="#F0FFE5" />
                        </View>
                      </Animated.View>
                    )}

                    {/* ⭕ 레슨 버튼 */}
                    <CircleBtn
                      onPress={() => onPressLessonButton(sectionIndex, lessonIndex)}
                      size={70}
                      backgroundColor={lesson.isCompleted || isNextAfterCompleted || curLessonData?.lessonId === lesson.lessonId ? '#93D333' : inactiveLessonBg}
                      disabledBackgroundColor={inactiveLessonBg}
                      enableHapticFeedback={true}
                      enableSound={true}
                    >
                      {lesson.isCompleted ? (
                        <Star width={42} height={42} fill="#fff" />   // 완료 → ★
                      ) : curLessonData?.lessonId === lesson.lessonId ? (
                        <Play width={42} height={42} fill="#fff" />   // 시작 후보 → ▶
                      ) : (
                        <Star width={42} height={42} fill="#fff" />   // 기본(회색) → ★
                      )}
                    </CircleBtn>
                  </View>
                </View>
              );
            })}
          </View>
        ))}
      </ScrollView>

      {/* 모달 */}
      {/* ===== 레슨 상세 모달 =====
          - 선택된 레슨(selectedLessonData)을 props로 전달
          - 내부에서 "학습 시작 / 복습" 분기 로직 구현 예정
            (추후: LessonContext or 서버의 myclass_status로 학습 여부 판단) */}
      {modalVisible && selectedLessonData && (
        <LessonDetailModal
          lessonData={selectedLessonData}
          curLessonData={curLessonData}
          visible={modalVisible}
          onClose={() => setModalVisible(false)}
        />
      )}
    </>
  );
};

export default ClassProgressScreen;