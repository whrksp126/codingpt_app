import React, { useState, useEffect } from 'react';
import { View, Text, TextInput } from 'react-native';
import StarRating from './StarRating';
import DefaultBtn from '../Button/DefaultBtn';
import BottomSheet from '../Modal/BottomSheet';
import type { Review } from './ReviewCard';

interface ReviewFormProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (rating: number, content: string) => void;
  productName?: string;
  // 수정 모드용 props
  editMode?: boolean;
  editReview?: Review | null;
}

/**
 * 후기 작성/수정 폼 (BottomSheet 활용)
 */
const ReviewForm: React.FC<ReviewFormProps> = ({
  visible,
  onClose,
  onSubmit,
  productName = '강의',
  editMode = false,
  editReview = null,
}) => {
  const [rating, setRating] = useState(0);
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 모달이 열릴 때 수정 모드면 기존 데이터로 초기화
  useEffect(() => {
    if (visible) {
      if (editMode && editReview) {
        setRating(editReview.score);
        setContent(editReview.reviewText);
      } else {
        setRating(0);
        setContent('');
      }
      setIsSubmitting(false);
    }
  }, [visible, editMode, editReview]);

  // 모달이 닫힐 때 폼 초기화
  useEffect(() => {
    if (!visible) {
      setRating(0);
      setContent('');
      setIsSubmitting(false);
    }
  }, [visible]);

  const handleSubmit = async () => {
    if (rating === 0 || content.trim().length < 10) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(rating, content.trim());
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const isValid = rating > 0 && content.trim().length >= 10;

  const getRatingText = () => {
    switch (rating) {
      case 1: return '별로예요';
      case 2: return '그저 그래요';
      case 3: return '보통이에요';
      case 4: return '좋아요';
      case 5: return '최고예요!';
      default: return '별점을 선택해주세요';
    }
  };

  const title = editMode ? '후기 수정' : '후기 작성';
  const submitText = editMode 
    ? (isSubmitting ? '수정 중...' : '수정하기')
    : (isSubmitting ? '등록 중...' : '등록하기');

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={title}
      scrollable={false}
    >
      {/* 강의명 */}
      <Text className="text-[15px] text-[#666666] dark:text-[#9CA3AF] mb-[15px]">
        {editMode
          ? `${productName}에 대한 후기를 수정해주세요`
          : `${productName}에 대한 후기를 남겨주세요`
        }
      </Text>

      {/* 별점 선택 */}
      <View className="items-center mb-[25px]">
        <Text className="text-[15px] text-[#333333] dark:text-white mb-[10px]">
          강의는 어떠셨나요?
        </Text>
        <StarRating
          rating={rating}
          size={36}
          editable
          onRatingChange={setRating}
        />
        <Text className="text-[12px] text-[#999999] dark:text-[#9CA3AF] mt-[8px]">
          {getRatingText()}
        </Text>
      </View>

      {/* 후기 입력 */}
      <View className="mb-[20px]">
        <TextInput
          className="bg-[#F8F8F8] dark:bg-[#1B1F27] rounded-[12px] p-[15px] text-[15px] text-[#333333] dark:text-white min-h-[120px]"
          placeholder="강의에 대한 솔직한 후기를 남겨주세요 (최소 10자)"
          placeholderTextColor="#AAAAAA"
          multiline
          textAlignVertical="top"
          value={content}
          onChangeText={setContent}
          maxLength={500}
        />
        <Text className="text-[11px] text-[#999999] dark:text-[#9CA3AF] text-right mt-[5px]">
          {content.length}/500
        </Text>
      </View>

      {/* 제출 버튼 */}
      <DefaultBtn
        onPress={handleSubmit}
        text={submitText}
        disabled={!isValid || isSubmitting}
        buttonClassName={`rounded-[10px] py-[15px] ${isValid ? 'bg-[#58CC02]' : 'bg-[#CCCCCC]'}`}
        textClassName="text-white text-[16px] font-bold text-center"
        enableHapticFeedback
        enableSound
        flex={false}
      />
    </BottomSheet>
  );
};

export default ReviewForm;
