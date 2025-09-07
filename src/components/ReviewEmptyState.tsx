import React from 'react';
import { View, Text } from 'react-native';
import { Star } from 'phosphor-react-native';

/**
 * 후기 탭 빈상태(Empty State)
 * - isEnrolled: 수강 중이면 "첫 후기 남기기", 아니면 "수강하고 후기 남기기" CTA 노출
 * - onPressWrite / onPressStudy: 상위 스크린의 액션을 주입받아 실행
 */
type Props = {
  isEnrolled?: boolean;
  onPressWrite?: () => void;
  onPressStudy?: () => void;
};

export default function ReviewEmptyState({
  isEnrolled,
  onPressWrite,
  onPressStudy,
}: Props) {
  return (
    <View className="py-5 justify-center items-center rounded-[16px] border border-[#BDEB8F] bg-[#F6FFF0]" style={{ paddingVertical: 20 }}>
      {/* 상단 별 아이콘 라인 */}
      <View className="flex-row mb-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star key={i} size={18} color="#CDEEA8" weight="fill" />
        ))}
      </View>

      {/* 타이틀 & 서브텍스트 */}
      <Text className="text-[18px] font-bold text-[#1B5E20]">아직 등록된 후기가 없어요 😊</Text>
      <Text className="text-[14px] text-[#606060] mt-1">첫 번째 후기를 남겨주세요!</Text>

      {/* CTA 영역 */}
      {/* <View className="mt-5 w-full">
        {isEnrolled ? (
          <DefaultBtn
            onPress={onPressWrite || (() => {})}
            text="첫 후기 남기기"
            buttonClassName="bg-[#58CC02] rounded-[10px] py-[12px]"
            textClassName="text-white text-[16px] font-bold"
            enableHapticFeedback
            enableSound
            flex={false}
          />
        ) : (
          <DefaultBtn
            onPress={onPressStudy || (() => {})}
            text="수강하고 후기 남기기"
            buttonClassName="bg-white border border-[#58CC02] rounded-[10px] py-[12px]"
            textClassName="text-[#58CC02] text-[16px] font-bold"
            enableHapticFeedback
            enableSound
            flex={false}
          />
        )}
      </View> */}
    </View>
  );
}
