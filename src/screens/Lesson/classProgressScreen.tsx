import React, { useEffect, useMemo, useState, useRef } from 'react';
import { ScrollView, Pressable, Text, View, Image, Modal, Button, Alert, Animated, Easing } from 'react-native';
import { useUser } from '../../contexts/UserContext';
import { useLesson } from '../../contexts/LessonContext';
import { useNavigation } from '../../contexts/NavigationContext';
import { useHearts } from '../../contexts/HeartContext';
import { CaretLeft, ChatBubbleTail, Clover, HeartStraight, Notepad, Play, Star } from '../../assets/SvgIcon';
// import { html as fetchData } from '../../data/item/lesson_data.js';
import LessonDetailModal from '../../components/Modal/LessonDetailModal';
import AsyncStorage from '@react-native-async-storage/async-storage';
import CircleBtn from '../../components/Button/CircleBtn';
import DefaultIconBtn from '../../components/Button/DefaultIconBtn';
import { useModal } from '../../contexts/ModalContext';
import SampleFirstModal from '../../components/Modal/SampleFirstModal';
import SampleSecondModal from '../../components/Modal/SampleSecondModal';

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
    sections: (cls?.Sections ?? []).map((section: any) => {
      return {
        title: section?.name ?? '섹션 제목 없음',          // fetchData.sections[*].title
        progress: 0,                                     // 현재 레슨 인덱스(앱 로직에 맞게 갱신)
        // ↓ 레슨 평탄화
        lessons: (section?.Lessons ?? []).map((lesson: any) => {
          // Slides[0].contents 에 실제 표시용 데이터가 들어있다고 했으니 안전하게 꺼냄
          const firstSlide = (lesson?.Slides ?? [])[0] ?? {};
          const contents   = firstSlide?.contents ?? {};

          // contents 안에 구조가 케이스별로 다를 수 있어 방어코드로 안전하게 추출
          // - title 후보: contents.lessons?.[0]?.title || contents.title || lesson.name
          const contentsLesson0 = Array.isArray(contents?.lessons) ? contents.lessons[0] : null;
          const mergedTitle =
            contentsLesson0?.title ??
            contents?.title ??
            lesson?.name ??
            `Lesson ${lesson?.id ?? ''}`;

          // sliders는 fetchData에서 레슨 실행 모듈들 배열을 의미
          // - 위치 후보: contentsLesson0?.sliders || contents?.sliders || []
          const mergedSliders =
            (contentsLesson0?.sliders && Array.isArray(contentsLesson0.sliders))
              ? contentsLesson0.sliders
              : (Array.isArray(contents?.sliders) ? contents.sliders : []);

          // lesson의 id와 일치하는 status 찾기
          const lessonStatus = Array.isArray(statusList) 
            ? statusList.find((s: any) => s.lesson_id === lesson?.id)
            : null;
          // 완료 여부 판단
          const status = lessonStatus?.status;
          console.log('status : ', status);
          const isCompleted = status === 2? true : false;
          console.log('isCompleted : ', isCompleted);


          // 필요 없는 필드는 버리고, 필요한 것만 병합
          return {
            lessonId: lesson?.id,                // 📌 fetchData 요구사항: id는 Lessons.id와 일치
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


const ClassProgressScreen: React.FC = () => {
  const { user } = useUser();
  const { goBack, navigate } = useNavigation();
  const { openModal, pushModal } = useModal();
  const { hearts } = useHearts();
  const [classData, setClassData] = useState<any>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedLessonData, setSelectedLessonData] = useState<any>(null);
  const { activeProductId, getProduct } = useLesson();

  // 말풍선 애니메이션 상태
  const bubbleFloat = useRef(new Animated.Value(0)).current;

  // 말풍선 둥둥 떠다니는 애니메이션
  const startBubbleAnimation = () => {
    const createFloatingAnimation = () => {
      return Animated.sequence([
        Animated.timing(bubbleFloat, {
          toValue: -8,
          duration: 1500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(bubbleFloat, {
          toValue: 0,
          duration: 1500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]);
    };

    const loopAnimation = () => {
      createFloatingAnimation().start(() => {
        loopAnimation();
      });
    };

    loopAnimation();
  };

  // 샘플 모달 기능
  const handleSampleModal = async () => {
    try {
      console.log('첫 번째 모달 열기');
      
      // 첫 번째 모달 열기 (내부에서 두 번째 모달을 push로 열음)
      const result = await openModal(SampleFirstModal, {}, {
        enableBackdropClose: true,
        backgroundColor: 'bg-black/40',
        contentClassName: '',
      });

      console.log('모달 스택 결과:', result);

      if (result && result.action === 'confirm') {
        Alert.alert(
          '모달 스택 테스트 완료!',
          `최종 결과: ${result.message}\n데이터: ${JSON.stringify(result.data)}`,
          [{ text: '확인' }]
        );
      } else if (result && result.action === 'cancel') {
        Alert.alert('취소됨', result.message);
      } else if (result && result.action === 'back') {
        Alert.alert('이전 모달로 돌아감', result.message);
      } else if (result && result.action === 'backdrop_close') {
        Alert.alert('모달 닫힘', result.message);
      } else {
        console.log('모달이 취소되었거나 결과가 없습니다.');
      }
    } catch (error) {
      console.error('모달 처리 중 오류:', error);
      Alert.alert('오류', '모달 처리 중 오류가 발생했습니다.');
    }
  };

  useEffect(() => {
    // activeProductId가 없으면 홈으로 리다이렉트
    if (!activeProductId) {
      Alert.alert(
        '알림', 
        '강의 정보를 찾을 수 없습니다.\n홈화면으로 이동합니다.',
        [{ text: '확인', onPress: () => navigate('home') }]
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
        [{ text: '확인', onPress: () => navigate('home') }]
      );
      return;
    }

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
    setSelectedLessonData(lessonData); // 모달에 전달
    setModalVisible(true); // 모달 오픈
  }

  // 초기 로딩 중이면 아무것도 렌더링하지 않음
  if(classData === null) return null;

  return (
    <>
      {/* 헤더 */}
      <View className="flex-row justify-between items-center px-[16px] pb-[7px] pt-[20px]">
        {/* 상단 헤더: 뒤로가기 버튼 */}
        <DefaultIconBtn
          onPress={() => goBack()}
          size={35}
          enableHapticFeedback={true}
          enableSound={true}
          pressScale={0.85}
          pressOpacity={0.6}
          bounceScale={1.15}
        >
          <CaretLeft width={35} height={35} fill="#CCCCCC" />
        </DefaultIconBtn>
        
        <View className="flex-row items-center gap-x-[10px]">
          <Pressable 
            onPress={handleSampleModal}
            className="flex-row items-center gap-x-[5px]"
          >
            <Clover width={34} height={34} fill="#58CC02" />
            <Text className="text-[#58CC02] text-[18px] font-bold">{user?.studyDays ?? 0}</Text>
          </Pressable>
          <View className="flex-row items-center gap-x-[5px]">
            <HeartStraight width={34} height={34} fill="#EE5555" />
            <Text className="text-[#EE5555] text-[18px] font-bold">{hearts}</Text>
          </View>
        </View>
      </View>

      {/* 상단 카드 */}
      <View className="flex-col justify-between items-center px-[16px]">
        <View className="flex flex-row gap-[2px] rounded-[12px] bg-[#fff] overflow-hidden">
          {/* 현재 선택된(또는 진행 중인) 섹션 제목 노출 카드 */}
          <Pressable className="flex-1 h-[78px] px-[16px] bg-[#93D333]">
            <View className="pt-[12px]">
              <Text className="text-[#FFFFFF] text-[16px] font-[700] opacity-70">{classData.title}</Text>
              <Text className="text-[#FFFFFF] text-[19px] font-[700]">{classData.sections[0].title}</Text>
            </View>
          </Pressable>
          <Pressable
            
            className="items-center justify-center p-[16px] bg-[#93D333] rounded-r-[8px]"
          >
            <Notepad width={28} height={28} fill="#FFFFFF" />
          </Pressable>
        </View>
      </View>
      {/* ===== 본문: 섹션/레슨 리스트 ===== */}
      <ScrollView className="px-[16px]">
        {/* 섹션 레슨 리스트 */}
        {classData.sections.map((section: any, sectionIndex: number) => (
        <View key={`section_${sectionIndex}`}>
          {/* 섹션 타이틀 */}
          <View className="flex-row items-center gap-[16px] h-[82px]">
            <View className="flex-1 h-[2px] bg-[#ccc]" />
            <Text className="text-[#ccc] text-[19px] font-[700]">{section.title}</Text>
            <View className="flex-1 h-[2px] bg-[#ccc]" />
          </View>
          {/* 레슨 리스트 */}
          {section.lessons.map((lesson: any, lessonIndex: number) => {
            // ✅ 전역(모든 섹션) 중 하나라도 완료된 레슨이 있는가?
            const hasAnyCompleted = classData.sections.some((sec: any) =>
              sec.lessons.some((l: any) => l.isCompleted)
            );

            // ✅ 이 레슨이 "완료된 레슨의 바로 다음 레슨"(섹션 단위)인가?
            const prevLesson = section.lessons[lessonIndex - 1];
            const isNextAfterCompleted = !!prevLesson?.isCompleted && !lesson.isCompleted;

            // ✅ 전역 특수 규칙:
            // - 모든 섹션 통틀어 아직 완료된 레슨이 하나도 없고(!hasAnyCompleted)
            // - 현재 레슨이 "전체 첫 레슨"(sectionIndex === 0 && lessonIndex === 0)
            // - 그리고 아직 완료되지 않은 경우에만 표시
            const isGlobalFirstUnstarted =
              !hasAnyCompleted && sectionIndex === 0 && lessonIndex === 0 && !lesson.isCompleted;

            // ▶ 말풍선/플레이 표시 조건: (완료 다음 레슨) OR (전역 첫 미완료 레슨)
            const showStartCue = isNextAfterCompleted || isGlobalFirstUnstarted;

            // ✅ 버튼 배경색 규칙
            // - 완료된 레슨: 초록색 + ⭐ (Star)
            // - 완료된 레슨 다음 레슨: 초록색 + ▶ (Play)
            // - 그 외: 회색 + ⭐ (Star)
            const circleBgClass = lesson.isCompleted
              ? 'bg-[#93D333]'
              : isNextAfterCompleted
                ? 'bg-[#93D333]'
                : 'bg-[#CCCCCC]';

            return (
              <View key={`section_${sectionIndex}_lesson_${lessonIndex}`} className="px-[16px]">
                <View className="flex-col items-center justify-center">
                  {/* 🗨️ "시작" 말풍선 (전역 첫 미완료 or 완료다음레슨) */}
                  {showStartCue && (
                    <Animated.View 
                      className="relative w-[88px] p-[12px] border border-[#93D333] rounded-[12px] bg-[#F0FFE5]"
                      style={{
                        transform: [{ translateY: bubbleFloat }],
                      }}
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
                    backgroundColor={lesson.isCompleted || isNextAfterCompleted ? '#93D333' : '#E5E5E5'}
                    disabledBackgroundColor="#E5E5E5"
                    enableHapticFeedback={true}
                    enableSound={true}
                  >
                    {lesson.isCompleted ? (
                      <Star width={42} height={42} fill="#fff" />   // 완료 → ★
                    ) : showStartCue ? (
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
          visible={modalVisible}
          onClose={() => setModalVisible(false)}
        />
      )}
    </>
  );
};

export default ClassProgressScreen;