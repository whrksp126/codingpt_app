import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, LayoutAnimation, Platform, UIManager } from 'react-native';
import { CaretLeft } from '../assets/SvgIcon'; // 좌/우 아이콘 대체로 사용 (필요 시 다른 아이콘으로 변경)
import { useStore } from '../contexts/StoreContext';

/**
 * 코스 목차(섹션/레슨) 아코디언
 * - productId로 StoreContext의 productIndex에서 product를 즉시 조회
 *
 * 사용처: LessonDetailScreen.tsx의 "목차" 탭
 */

// 안드로이드에서 LayoutAnimation 사용 허용
// if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
//   UIManager.setLayoutAnimationEnabledExperimental(true);
// }

type ClassOutlineProps = {
  productId: number;
};

export function ClassOutline({ productId }: ClassOutlineProps) {
  const { productIndex } = useStore(); // productId → product O(1) 조회용 맵 :contentReference[oaicite:2]{index=2}
  console.log("ClassOutline productIndex,", productIndex);
  console.log("ClassOutline productId,", productId);
  const product: any = productIndex.get(productId);
  console.log("ClassOutline product,", product);

  // ──────────────────────────────────────────────────────────
  // 1) product에서 섹션/레슨 안전하게 뽑기
  //    - 데이터 구조: product.Classes[0].Sections[].Lessons[]
  // ──────────────────────────────────────────────────────────
  const sections = useMemo(() => {
    console.log("ClassOutline product.Classes:", product?.Classes);
    const classes = product?.Classes;
    if (!Array.isArray(classes) || classes.length === 0) {
      console.log("Classes 배열이 없거나 비어있음");
      return [];
    }
    
    const firstClass = classes[0];
    console.log("ClassOutline firstClass:", firstClass);
    const sections = firstClass?.Sections;
    console.log("ClassOutline sections:", sections);
    
    return Array.isArray(sections) ? sections : [];
  }, [product]);

  // 섹션 이름/레슨 이름 필드
  const getSectionId = (sec: any, idx: number) => sec?.id ?? `sec-${idx}`;

  // 펼침 상태 관리 (기본은 전체 펼침 — 한 번 초기화 이후엔 사용자 선택 유지)
  const [open, setOpen] = useState<Set<number | string>>(new Set());
  const initializedRef = useRef(false);
  useEffect(() => {
    if (initializedRef.current) return;
    if (sections.length === 0) return;
    const all = new Set<number | string>();
    sections.forEach((sec: any, idx: number) => all.add(getSectionId(sec, idx)));
    setOpen(all);
    initializedRef.current = true;
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

  console.log("ClassOutline 렌더링 - sections.length:", sections.length);
  console.log("ClassOutline 렌더링 - sections:", sections);

  return (
    <View className="mt-1 border border-[#CCCCCC] dark:border-[#3F444D] rounded-[12px] p-4">
        <View>
          <Text className="text-[14px] font-medium text-[#111111] dark:text-white mb-2">📌 '{product.name}'에서는 이런 레슨을 배워요!</Text>
        </View>
      {sections.length === 0 ? (
        <View className="rounded-[12px] border border-[#E5E5E5] dark:border-[#3F444D] p-4">
          <Text className="text-[14px] text-[#606060] dark:text-[#9CA3AF]">아직 등록된 목차가 없어요.</Text>
          <Text className="text-[12px] text-[#999] dark:text-[#9CA3AF] mt-2">디버그: productId={productId}, product={product ? '존재' : '없음'}</Text>
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
                className="rounded-[14px] border border-[#58CC02] bg-[#F0FFE5] dark:bg-[#1F3018]"
                style={{ paddingVertical: 10, paddingHorizontal: 20 }}
              >
                <View className="flex-row items-center justify-between">
                  <Text className="text-[16px] font-semibold text-[#111111] dark:text-white">
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
                      <Text className="text-[14px] text-[#606060] dark:text-[#9CA3AF]">레슨이 없어요.</Text>
                    </View>
                  ) : (
                    lessons.map((ls: any, lIdx: number) => (
                      <View
                        key={String(getLessonId(ls, lIdx))}
                        className="flex-row items-center justify-between mt-2 px-4 py-1"
                      >
                        {/* • 불릿 모양 */}
                        <View className="w-[6px] h-[6px] rounded-full bg-[#58CC02] mr-3" />
                        <Text className="flex-1 text-[16px] text-[#111] dark:text-white font-medium">{getLessonTitle(ls)}</Text>
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
  );
}

export default ClassOutline;