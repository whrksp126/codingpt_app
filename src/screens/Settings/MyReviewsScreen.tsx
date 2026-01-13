import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl, ActivityIndicator, Image, Alert, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { CaretLeft } from '../../assets/SvgIcon';
import DefaultIconBtn from '../../components/Button/DefaultIconBtn';
import StarRating from '../../components/Review/StarRating';
import reviewService, { MyReview } from '../../services/reviewService';
import { Trash } from 'phosphor-react-native';
import { TouchableOpacity } from 'react-native';
import { useStore } from '../../contexts/StoreContext';
import type { Product } from '../../services/storeService';
import type { RootStackParamList } from '../../navigation/types';

// 카테고리 이름에 따른 아이콘 매핑
const getCategoryIcon = (categoryName: string) => {
  const code = categoryName.split('(')[0].trim(); // "HTML(태그의 정원)" → "HTML"
  switch (code) {
    case 'HTML':
      return require('../../assets/icons/html-5-icon.png');
    case 'CSS':
      return require('../../assets/icons/css-3-icon.png');
    case 'JS':
      return require('../../assets/icons/js-icon.png');
    default:
      return require('../../assets/icons/js-icon.png');
  }
};

// 헤더 컴포넌트
const Header: React.FC = () => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  return (
    <View className="w-full bg-white border-b border-[#cccccc]">
      <View
        className="flex-row items-center px-[16px] pb-[20px]"
        style={{ paddingTop: Math.max(insets.top, 10) }}
      >
        <DefaultIconBtn
          onPress={() => navigation.goBack()}
          size={35}
          enableHapticFeedback={true}
          enableSound={true}
          pressScale={0.85}
          pressOpacity={0.6}
          bounceScale={1.15}
        >
          <CaretLeft width={35} height={35} fill="#CCCCCC" />
        </DefaultIconBtn>
        <View className="flex-1 items-center justify-center">
          <Text className="text-[22px] font-bold text-[#111111]">내 후기</Text>
        </View>
        <View className="w-[35px]" />
      </View>
    </View>
  );
};

// 개별 리뷰 카드
interface MyReviewCardProps {
  review: MyReview;
  product?: Product;
  categoryName?: string;
  onPressCard: () => void;
  onPressDelete: (reviewId: number) => void;
}

const MyReviewCard: React.FC<MyReviewCardProps> = ({ review, product, categoryName, onPressCard, onPressDelete }) => {
  // 날짜 포맷팅
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}.${month}.${day}`;
  };

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
          onPress: () => onPressDelete(review.id),
        },
      ]
    );
  };

  const productName = product?.name || '알 수 없는 상품';
  const productIcon = getCategoryIcon(categoryName || '');

  return (
    <Pressable
      onPress={onPressCard}
      className="bg-white border border-[#EEEEEE] rounded-[12px] p-[16px] mb-[12px] active:opacity-70"
    >
      {/* 상품 정보 */}
      <View className="flex-row items-center mb-[12px] pb-[12px] border-b border-[#F0F0F0]">
        <View className="w-[40px] h-[40px] rounded-[8px] bg-[#F5F5F5] items-center justify-center mr-[10px] overflow-hidden">
          <Image
            source={productIcon}
            className="w-[30px] h-[30px]"
            resizeMode="contain"
          />
        </View>
        <View className="flex-1">
          <Text className="text-[14px] font-bold text-[#333333]" numberOfLines={1}>
            {productName}
          </Text>
        </View>
      </View>

      {/* 별점 + 날짜 + 삭제 버튼 */}
      <View className="flex-row items-center justify-between mb-[12px]">
        <View className="flex-row items-center">
          <StarRating rating={review.score} size={16} />
          <Text className="text-[12px] text-[#999999] ml-[10px]">
            {formatDate(review.createdAt)}
          </Text>
        </View>
        <TouchableOpacity
          onPress={(e) => {
            e.stopPropagation();
            handleDelete();
          }}
          className="p-[4px]"
        >
          <Trash size={18} color="#FF4444" />
        </TouchableOpacity>
      </View>

      {/* 후기 내용 */}
      <Text className="text-[14px] text-[#444444] leading-[20px]">
        {review.reviewText}
      </Text>
    </Pressable>
  );
};

// 빈 상태 컴포넌트
const EmptyState: React.FC = () => (
  <View className="flex-1 items-center justify-center py-[80px]">
    <Text className="text-[48px] mb-[16px]">📝</Text>
    <Text className="text-[18px] font-bold text-[#333333] mb-[8px]">
      작성한 후기가 없습니다
    </Text>
    <Text className="text-[14px] text-[#999999] text-center">
      수강한 강의에 후기를 남겨보세요!
    </Text>
  </View>
);

// 메인 화면
const MyReviewsScreen: React.FC = () => {
  const [reviews, setReviews] = useState<MyReview[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { productIndex, categoryIndex } = useStore();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  // 카드 클릭 시 상품 상세 페이지 후기 탭으로 이동
  const handlePressCard = useCallback((productId: number) => {
    const product = productIndex.get(productId);
    const categoryName = categoryIndex.get(productId) || '';

    if (product) {
      navigation.navigate('LessonFlow', {
        screen: 'LessonDetail',
        params: {
          id: product.id,
          name: product.name,
          icon: getCategoryIcon(categoryName),
          description: product.description,
          price: product.price,
          initialTab: '후기',
        },
      });
    }
  }, [navigation, productIndex, categoryIndex]);

  // 리뷰 목록 조회
  const fetchReviews = useCallback(async () => {
    try {
      const data = await reviewService.getMyReviews();
      setReviews(data);
    } catch (error) {
      console.error('내 후기 조회 실패:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // 초기 로딩
  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  // 새로고침
  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    fetchReviews();
  }, [fetchReviews]);

  // 리뷰 삭제
  const handleDeleteReview = useCallback(async (reviewId: number) => {
    try {
      const success = await reviewService.deleteReview(reviewId);
      if (success) {
        setReviews(prev => prev.filter(r => r.id !== reviewId));
        Alert.alert('완료', '후기가 삭제되었습니다.');
      } else {
        Alert.alert('오류', '후기 삭제에 실패했습니다.');
      }
    } catch (error) {
      console.error('후기 삭제 실패:', error);
      Alert.alert('오류', '후기 삭제 중 오류가 발생했습니다.');
    }
  }, []);

  // 로딩 상태
  if (isLoading) {
    return (
      <View className="flex-1 bg-white">
        <Header />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#58CC02" />
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-white">
      <Header />
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-[16px] pt-[16px] pb-[40px]"
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor="#58CC02"
          />
        }
      >
        {reviews.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <Text className="text-[14px] text-[#666666] mb-[16px]">
              총 {reviews.length}개의 후기를 작성했습니다
            </Text>
            {reviews.map(review => (
              <MyReviewCard
                key={review.id}
                review={review}
                product={productIndex.get(review.productId)}
                categoryName={categoryIndex.get(review.productId)}
                onPressCard={() => handlePressCard(review.productId)}
                onPressDelete={handleDeleteReview}
              />
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
};

export default MyReviewsScreen;

