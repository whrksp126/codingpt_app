import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import { Star } from 'phosphor-react-native';

interface StarRatingProps {
  rating: number;
  maxRating?: number;
  size?: number;
  editable?: boolean;
  onRatingChange?: (rating: number) => void;
  activeColor?: string;
  inactiveColor?: string;
}

/**
 * 별점 표시/선택 컴포넌트
 * - editable: true면 별점 선택 가능, false면 표시만
 * - onRatingChange: 별점 변경 시 콜백
 */
const StarRating: React.FC<StarRatingProps> = ({
  rating,
  maxRating = 5,
  size = 20,
  editable = false,
  onRatingChange,
  activeColor = '#FFC700',
  inactiveColor = '#CCCCCC',
}) => {
  const handlePress = (index: number) => {
    if (editable && onRatingChange) {
      onRatingChange(index + 1);
    }
  };

  return (
    <View className="flex-row items-center">
      {Array.from({ length: maxRating }).map((_, index) => {
        const isFilled = index < rating;
        const StarComponent = (
          <Star
            key={index}
            size={size}
            color={isFilled ? activeColor : inactiveColor}
            weight="fill"
          />
        );

        if (editable) {
          return (
            <TouchableOpacity
              key={index}
              onPress={() => handlePress(index)}
              activeOpacity={0.7}
              className="mr-1"
            >
              {StarComponent}
            </TouchableOpacity>
          );
        }

        return (
          <View key={index} className="mr-1">
            {StarComponent}
          </View>
        );
      })}
    </View>
  );
};

export default StarRating;

