import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, Alert } from 'react-native';
import { Star, PencilSimple, SortAscending } from 'phosphor-react-native';
import ReviewCard, { Review } from './ReviewCard';
import ReviewForm from './ReviewForm';
import StarRating from './StarRating';
import DefaultBtn from '../Button/DefaultBtn';

interface ReviewSectionProps {
  productId: number;
  productName: string;
  isEnrolled: boolean;
  reviews?: Review[];
  onSubmitReview?: (rating: number, content: string) => Promise<void>;
  onPressEnroll?: () => void;
}

type SortType = 'latest' | 'rating';

/**
 * 후기 섹션 메인 컴포넌트
 * - 후기 목록 표시
 * - 후기 작성 기능
 * - 통계 요약
 * - 정렬 기능
 */
const ReviewSection: React.FC<ReviewSectionProps> = ({
  productId,
  productName,
  isEnrolled,
  reviews = [],
  onSubmitReview,
  onPressEnroll,
}) => {
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [sortType, setSortType] = useState<SortType>('latest');

  // 통계 계산
  const stats = useMemo(() => {
    if (reviews.length === 0) {
      return { average: 0, total: 0, distribution: [0, 0, 0, 0, 0] };
    }

    const total = reviews.length;
    const sum = reviews.reduce((acc, r) => acc + r.rating, 0);
    const average = sum / total;

    // 별점 분포 (5점 ~ 1점)
    const distribution = [5, 4, 3, 2, 1].map(
      (rating) => reviews.filter((r) => r.rating === rating).length
    );

    return { average, total, distribution };
  }, [reviews]);

  // 정렬된 후기 목록
  const sortedReviews = useMemo(() => {
    const sorted = [...reviews];
    if (sortType === 'latest') {
      sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } else {
      sorted.sort((a, b) => b.rating - a.rating);
    }
    return sorted;
  }, [reviews, sortType]);

  // 후기 작성 핸들러
  const handleSubmitReview = useCallback(async (rating: number, content: string) => {
    if (onSubmitReview) {
      await onSubmitReview(rating, content);
    }
  }, [onSubmitReview]);

  // 후기 작성 버튼 클릭
  const handlePressWrite = () => {
    if (!isEnrolled) {
      Alert.alert(
        '수강 필요',
        '후기를 작성하려면 먼저 강의를 수강해주세요.',
        [
          { text: '취소', style: 'cancel' },
          { text: '수강하기', onPress: onPressEnroll },
        ]
      );
      return;
    }
    setIsFormVisible(true);
  };

  // 후기가 없을 때 빈 상태
  if (reviews.length === 0) {
    return (
      <View>
        {/* 빈 상태 */}
        <View className="py-[30px] justify-center items-center rounded-[16px] border border-[#BDEB8F] bg-[#F6FFF0]">
          <View className="flex-row mb-[12px]">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} size={22} color="#CDEEA8" weight="fill" />
            ))}
          </View>
          <Text className="text-[18px] font-bold text-[#1B5E20]">
            아직 등록된 후기가 없어요 😊
          </Text>
          <Text className="text-[14px] text-[#606060] mt-[6px]">
            첫 번째 후기를 남겨주세요!
          </Text>

          {/* CTA 버튼 */}
          <View className="mt-[20px] w-full px-[20px]">
            {isEnrolled ? (
              <DefaultBtn
                onPress={handlePressWrite}
                text="첫 후기 남기기"
                buttonClassName="bg-[#58CC02] rounded-[10px] py-[12px]"
                textClassName="text-white text-[16px] font-bold text-center"
                enableHapticFeedback
                enableSound
                flex={false}
              />
            ) : (
              <DefaultBtn
                onPress={onPressEnroll || (() => {})}
                text="수강하고 후기 남기기"
                buttonClassName="bg-white border border-[#58CC02] rounded-[10px] py-[12px]"
                textClassName="text-[#58CC02] text-[16px] font-bold text-center"
                enableHapticFeedback
                enableSound
                flex={false}
              />
            )}
          </View>
        </View>

        {/* 후기 작성 모달 */}
        <ReviewForm
          visible={isFormVisible}
          onClose={() => setIsFormVisible(false)}
          onSubmit={handleSubmitReview}
          productName={productName}
        />
      </View>
    );
  }

  return (
    <View>
      {/* 통계 요약 */}
      <View className="bg-[#FAFAFA] rounded-[16px] p-[20px] mb-[20px]">
        <View className="flex-row items-center">
          {/* 평균 별점 */}
          <View className="items-center mr-[30px]">
            <Text className="text-[42px] font-bold text-[#111111]">
              {stats.average.toFixed(1)}
            </Text>
            <StarRating rating={Math.round(stats.average)} size={16} />
            <Text className="text-[12px] text-[#999999] mt-[4px]">
              {stats.total}개의 후기
            </Text>
          </View>

          {/* 별점 분포 */}
          <View className="flex-1">
            {[5, 4, 3, 2, 1].map((rating, index) => {
              const count = stats.distribution[index];
              const percentage = stats.total > 0 ? (count / stats.total) * 100 : 0;
              return (
                <View key={rating} className="flex-row items-center mb-[4px]">
                  <Text className="text-[11px] text-[#666666] w-[20px]">{rating}점</Text>
                  <View className="flex-1 h-[8px] bg-[#EEEEEE] rounded-full mx-[8px] overflow-hidden">
                    <View
                      className="h-full bg-[#FFC700] rounded-full"
                      style={{ width: `${percentage}%` }}
                    />
                  </View>
                  <Text className="text-[11px] text-[#999999] w-[25px] text-right">
                    {count}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      </View>

      {/* 정렬 + 후기작성 버튼 */}
      <View className="flex-row items-center justify-between mb-[15px]">
        <View className="flex-row items-center">
          <TouchableOpacity
            className={`flex-row items-center mr-[15px] ${sortType === 'latest' ? 'opacity-100' : 'opacity-50'}`}
            onPress={() => setSortType('latest')}
          >
            <SortAscending size={16} color="#666666" />
            <Text className="text-[13px] text-[#666666] ml-[4px]">최신순</Text>
          </TouchableOpacity>
          <TouchableOpacity
            className={`flex-row items-center ${sortType === 'rating' ? 'opacity-100' : 'opacity-50'}`}
            onPress={() => setSortType('rating')}
          >
            <Star size={16} color="#666666" weight="fill" />
            <Text className="text-[13px] text-[#666666] ml-[4px]">별점순</Text>
          </TouchableOpacity>
        </View>

        {isEnrolled && (
          <TouchableOpacity
            className="flex-row items-center bg-[#58CC02] px-[12px] py-[6px] rounded-[8px]"
            onPress={handlePressWrite}
          >
            <PencilSimple size={14} color="#FFFFFF" />
            <Text className="text-[12px] text-white font-bold ml-[4px]">후기 쓰기</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* 후기 목록 */}
      <FlatList
        data={sortedReviews}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => <ReviewCard review={item} />}
        scrollEnabled={false}
        showsVerticalScrollIndicator={false}
      />

      {/* 수강 안내 (미수강자) */}
      {!isEnrolled && (
        <View className="mt-[10px] p-[15px] bg-[#FFF8E1] rounded-[12px]">
          <Text className="text-[13px] text-[#FF8F00] text-center">
            수강 후 후기를 작성할 수 있어요!
          </Text>
        </View>
      )}

      {/* 후기 작성 모달 */}
      <ReviewForm
        visible={isFormVisible}
        onClose={() => setIsFormVisible(false)}
        onSubmit={handleSubmitReview}
        productName={productName}
      />
    </View>
  );
};

export default ReviewSection;

