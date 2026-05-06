import React from 'react';
import { View, Text, Image, TouchableOpacity, Alert } from 'react-native';
import { PencilSimple, Trash } from 'phosphor-react-native';
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
  onPressDelete?: (reviewId: number) => void;
}

/**
 * 개별 후기 카드 컴포넌트
 */
const ReviewCard: React.FC<ReviewCardProps> = ({ review, isMyReview = false, onPressEdit, onPressDelete }) => {
  // 삭제 확인 알림
  const handleDelete = () => {
    Alert.alert(
      '후기 삭제',
      '정말 삭제하시겠습니까?',
      [
        { text: '취소', style: 'cancel' },
        { 
          text: '삭제', 
          style: 'destructive',
          onPress: () => onPressDelete?.(review.id)
        },
      ]
    );
  };

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
          <View className="w-[40px] h-[40px] rounded-full bg-[#F0F0F0] dark:bg-[#2A2F37] items-center justify-center mr-[10px] overflow-hidden">
            {review.userAvatar ? (
              <Image
                source={{ uri: review.userAvatar }}
                className="w-full h-full"
                resizeMode="cover"
              />
            ) : (
              <Text className="text-[16px] font-bold text-[#999999] dark:text-[#9CA3AF]">
                {review.userName.charAt(0).toUpperCase()}
              </Text>
            )}
          </View>
          {/* 이름 + 날짜 */}
          <View>
            <View className="flex-row items-center">
              <Text className="text-[14px] font-bold text-[#333333] dark:text-white">
                {review.userName}
              </Text>
            </View>
            <Text className="text-[11px] text-[#999999] dark:text-[#9CA3AF] mt-[2px]">
              {formatDate(review.createdAt)}
            </Text>
          </View>
        </View>
        {/* 별점 + 수정/삭제 버튼 */}
        <View className="flex-row items-center">
          <StarRating rating={review.score} size={14} />
          {isMyReview && (
            <View className="flex-row items-center ml-[8px]">
              {onPressEdit && (
                <TouchableOpacity
                  onPress={() => onPressEdit(review)}
                  className="p-[4px]"
                >
                  <PencilSimple size={16} color="#58CC02" />
                </TouchableOpacity>
              )}
              {onPressDelete && (
                <TouchableOpacity
                  onPress={handleDelete}
                  className="p-[4px] ml-[4px]"
                >
                  <Trash size={16} color="#FF4444" />
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      </View>

      {/* 후기 내용 */}
      <Text className="text-[14px] text-[#444444] dark:text-[#D1D5DB] leading-[20px]">
        {review.reviewText}
      </Text>
    </>
  );

  // 내 리뷰인 경우
  if (isMyReview && onPressEdit) {
    return (
      <View className="bg-white dark:bg-[#1B1F27] border border-[#58CC02] rounded-[12px] p-[16px] mb-[12px]">
        {CardContent}
      </View>
    );
  }

  return (
    <View className="bg-white dark:bg-[#1B1F27] border border-[#EEEEEE] dark:border-[#3F444D] rounded-[12px] p-[16px] mb-[12px]">
      {CardContent}
    </View>
  );
};

export default ReviewCard;

