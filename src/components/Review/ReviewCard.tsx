import React from 'react';
import { View, Text, Image } from 'react-native';
import StarRating from './StarRating';

export interface Review {
  id: number;
  userId: number;
  userName: string;
  userAvatar?: string;
  rating: number;
  content: string;
  createdAt: string;
  lessonProgress?: number; // 수강 진도율
}

interface ReviewCardProps {
  review: Review;
}

/**
 * 개별 후기 카드 컴포넌트
 */
const ReviewCard: React.FC<ReviewCardProps> = ({ review }) => {
  // 날짜 포맷팅
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}.${month}.${day}`;
  };

  return (
    <View className="bg-white border border-[#EEEEEE] rounded-[12px] p-[16px] mb-[12px]">
      {/* 상단: 유저 정보 + 별점 */}
      <View className="flex-row items-center justify-between mb-[12px]">
        <View className="flex-row items-center">
          {/* 아바타 */}
          <View className="w-[40px] h-[40px] rounded-full bg-[#F0F0F0] items-center justify-center mr-[10px] overflow-hidden">
            {review.userAvatar ? (
              <Image
                source={{ uri: review.userAvatar }}
                className="w-full h-full"
                resizeMode="cover"
              />
            ) : (
              <Text className="text-[16px] font-bold text-[#999999]">
                {review.userName.charAt(0).toUpperCase()}
              </Text>
            )}
          </View>
          {/* 이름 + 날짜 */}
          <View>
            <Text className="text-[14px] font-bold text-[#333333]">
              {review.userName}
            </Text>
            <Text className="text-[11px] text-[#999999] mt-[2px]">
              {formatDate(review.createdAt)}
            </Text>
          </View>
        </View>
        {/* 별점 */}
        <StarRating rating={review.rating} size={14} />
      </View>

      {/* 후기 내용 */}
      <Text className="text-[14px] text-[#444444] leading-[20px]">
        {review.content}
      </Text>

      {/* 수강 진도 (선택적) */}
      {review.lessonProgress !== undefined && (
        <View className="mt-[10px] flex-row items-center">
          <View className="bg-[#F6FFF0] px-[8px] py-[3px] rounded-[4px]">
            <Text className="text-[10px] text-[#58CC02] font-medium">
              수강 진도 {review.lessonProgress}%
            </Text>
          </View>
        </View>
      )}
    </View>
  );
};

export default ReviewCard;

