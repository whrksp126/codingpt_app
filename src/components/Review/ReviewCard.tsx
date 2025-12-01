import React from 'react';
import { View, Text, Image, TouchableOpacity } from 'react-native';
import { PencilSimple } from 'phosphor-react-native';
import StarRating from './StarRating';

export interface Review {
  id: number;
  userId: number;
  userName: string;
  userAvatar?: string;
  score: number;
  reviewText: string;
  createdAt: string;
}

interface ReviewCardProps {
  review: Review;
  isMyReview?: boolean;
  onPressEdit?: (review: Review) => void;
}

/**
 * 개별 후기 카드 컴포넌트
 */
const ReviewCard: React.FC<ReviewCardProps> = ({ review, isMyReview = false, onPressEdit }) => {
  // 날짜 포맷팅
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}.${month}.${day}`;
  };

  const CardContent = (
    <>
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
            <View className="flex-row items-center">
              <Text className="text-[14px] font-bold text-[#333333]">
                {review.userName}
              </Text>
            </View>
            <Text className="text-[11px] text-[#999999] mt-[2px]">
              {formatDate(review.createdAt)}
            </Text>
          </View>
        </View>
        {/* 별점 + 수정 버튼 */}
        <View className="flex-row items-center">
          <StarRating rating={review.score} size={14} />
          {isMyReview && onPressEdit && (
            <TouchableOpacity
              onPress={() => onPressEdit(review)}
              className="ml-[8px] p-[4px]"
            >
              <PencilSimple size={16} color="#58CC02" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* 후기 내용 */}
      <Text className="text-[14px] text-[#444444] leading-[20px]">
        {review.reviewText}
      </Text>
    </>
  );

  // 내 리뷰인 경우 터치 가능하게
  if (isMyReview && onPressEdit) {
    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => onPressEdit(review)}
        className="bg-white border border-[#58CC02] rounded-[12px] p-[16px] mb-[12px]"
      >
        {CardContent}
      </TouchableOpacity>
    );
  }

  return (
    <View className="bg-white border border-[#EEEEEE] rounded-[12px] p-[16px] mb-[12px]">
      {CardContent}
    </View>
  );
};

export default ReviewCard;

