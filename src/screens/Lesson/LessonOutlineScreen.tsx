import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, Pressable, LayoutAnimation, Platform, UIManager, ScrollView } from 'react-native';
import { CaretLeft } from '../../assets/SvgIcon'; // 좌/우 아이콘 대체로 사용 (필요 시 다른 아이콘으로 변경)
import { useLesson } from '../../contexts/LessonContext';
import DefaultIconBtn from '../../components/Button/DefaultIconBtn';
import { useNavigation } from '../../contexts/NavigationContext';
import { useUser } from '../../contexts/UserContext';
import { useHearts } from '../../contexts/HeartContext';
import { Clover, HeartStraight } from '../../assets/SvgIcon';


export function LessonOutlineScreen() {
  const { activeProductId, getProduct } = useLesson();
  const { goBack } = useNavigation();
  const { user } = useUser();
  const { hearts } = useHearts();

  const product = getProduct(activeProductId ?? 0);
  const sections = useMemo(() => {
    const classes = product?.Classes;
    if (!Array.isArray(classes) || classes.length === 0) {
      return [];
    }
    
    const firstClass = classes[0];
    const sections = firstClass?.Sections;
    
    return Array.isArray(sections) ? sections : [];
  }, [product]);

  // 펼침 상태 관리 (여러 섹션 동시 펼침 허용) - 처음부터 모든 섹션 열어두기
  const [open, setOpen] = useState<Set<number | string>>(new Set());

  // 모든 섹션을 처음부터 열어두기
  useEffect(() => {
    if (sections.length > 0) {
      const allSectionIds = sections.map((sec: any, idx: number) => getSectionId(sec, idx));
      setOpen(new Set(allSectionIds));
    }
  }, [sections]);

  const toggle = (sectionId: number | string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen(prev => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  };

  // 섹션 이름/레슨 이름 필드
  const getSectionTitle = (sec: any) => sec?.name ?? '이름 없는 섹션';
  const getSectionId = (sec: any, idx: number) => sec?.id ?? `sec-${idx}`;
  const getLessons = (sec: any) => {
    const l = sec?.Lessons ?? [];
    if (!Array.isArray(l)) return [];
    
    // order_no 순서대로 정렬
    return l.sort((a: any, b: any) => {
      const orderA = a?.order_no ?? 0;
      const orderB = b?.order_no ?? 0;
      return orderA - orderB;
    });
  };
  const getLessonTitle = (ls: any) => ls?.name ?? '이름 없는 레슨';
  const getLessonId = (ls: any, idx: number) => ls?.id ?? `lesson-${idx}`;


  return (
    <View className="flex-1 bg-white">
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

      {/* 스크롤 가능한 콘텐츠 */}
      <ScrollView 
        className="flex-1"
        showsVerticalScrollIndicator={true}
        contentContainerStyle={{ paddingBottom: 20 }}
      >
        <View className="mt-1 p-4">
          <View>
            <Text className="text-[14px] font-medium text-[#111111] mb-2">📌 '{product?.name}'에서는 이런 레슨을 배워요!</Text>
          </View>
          {sections.length === 0 ? (
            <View className="rounded-[12px] border border-[#E5E5E5] p-4">
              <Text className="text-[14px] text-[#606060]">아직 등록된 목차가 없어요.</Text>
              <Text className="text-[12px] text-[#999] mt-2">디버그: productId={activeProductId}, product={product ? '존재' : '없음'}</Text>
            </View>
          ) : (
            sections.map((sec: any, sIdx: number) => {
              const secId = getSectionId(sec, sIdx);
              const isOpen = open.has(secId);
              const lessons = getLessons(sec);

              return (
                <View key={String(secId)} className="mt-3">
                  {/* 섹션 헤더 (연두색 카드) */}
                  <Pressable
                    onPress={() => toggle(secId)}
                    className={`rounded-[14px] border ${isOpen ? 'border-[#58CC02]' : 'border-[#58CC02]'} bg-[#F0FFE5]`}
                    style={{ paddingVertical: 10, paddingHorizontal: 20 }}
                  >
                    <View className="flex-row items-center justify-between">
                      <Text className="text-[16px] font-semibold text-[#111111]">
                        {getSectionTitle(sec)}
                      </Text>
                      {/* 화살표 아이콘 (닫힘: 왼쪽, 열림: 아래로 보이도록 회전) */}
                      <View style={{ transform: [{ rotate: isOpen ? '270deg' : '180deg' }] }}>
                        <CaretLeft width={24} height={24} fill="#777777" />
                      </View>
                    </View>
                  </Pressable>

                  {/* 펼친 상태일 때 레슨 리스트 표시 */}
                  {isOpen && (
                    <View className="pl-4 pr-2 mb-2">
                      {lessons.length === 0 ? (
                        <View className="px-3 py-3">
                          <Text className="text-[14px] text-[#606060]">레슨이 없어요.</Text>
                        </View>
                      ) : (
                        lessons.map((ls: any, lIdx: number) => (
                          <View
                            key={String(getLessonId(ls, lIdx))}
                            className="flex-row items-center justify-between mt-2 px-4 py-1"
                          >
                            {/* • 불릿 모양 */}
                            <View className="w-[6px] h-[6px] rounded-full bg-[#58CC02] mr-3" />
                            <Text className="flex-1 text-[16px] text-[#111] font-medium">{getLessonTitle(ls)}</Text>
                          </View>
                        ))
                      )}
                    </View>
                  )}
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </View>
  );
}

export default LessonOutlineScreen;