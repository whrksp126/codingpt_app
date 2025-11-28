import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, Image, ScrollView, Alert, Pressable, FlatList } from 'react-native';
import { Star } from 'phosphor-react-native';
import { useUser } from '../../contexts/UserContext';
import { useStore } from '../../contexts/StoreContext';
import { useLesson } from '../../contexts/LessonContext';
import lessonService from '../../services/lessonService';
import reviewService from '../../services/reviewService';
import type { Product, StoreCategory } from '../../services/storeService';
import { countSectionsAndLessons } from '../../utils/lessonUtils';
import { CaretLeft, ListNumbers, Files, SealQuestion, TerminalWindow, TreeStructure } from '../../assets/SvgIcon';
import DefaultIconBtn from '../../components/Button/DefaultIconBtn';
import DefaultBtn from '../../components/Button/DefaultBtn';
import ClassIntroShowcase from '../../components/ClassIntro';
import ClassOutline from '../../components/ClassOutline';
import { ReviewSection, type Review } from '../../components/Review';
import { showcaseByProductName } from '../../data/class/classIntro_data';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { LessonFlowStackParamList } from '../../navigation/types';

// 관련상품 아이템 타입 정의
interface RelatedProductItem {
  id: number;
  name: string;
  icon: any;
  description: string;
  price: number;
  priceType: '무료' | '유료';
  lessonCount: number;
  category: string;
  categoryDescription: string;
}

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
      return require('../../assets/icons/js-icon.png'); // 나중에 변경
  }
};

type Props = NativeStackScreenProps<LessonFlowStackParamList, 'LessonDetail'>;

const LessonDetailScreen: React.FC<Props> = ({ route, navigation }) => {
  const { user } = useUser();
  const { lessons, reloadLessons, setActiveProduct } = useLesson();
  const { productIndex, storeData } = useStore();

  console.log("LessonDetailScreen route,", route);
  console.log("LessonDetailScreen user,", user);
  console.log("LessonDetailScreen lessons,", lessons);
  console.log("LessonDetailScreen productIndex,", productIndex);

  // 네비게이션 파라미터 (product)
  const { id, name, icon, description, price } = route.params as {
    id: number;
    name: string;
    icon: any;
    description: string;
    price: number;
  };

  const productId = Number(id);

  // StoreContext에서 집계값(단일 출처) 조회
  const productFromStore = productIndex.get(productId);
  const sectionCount = productFromStore?.sectionCount ?? 0; // 목차 개수
  const lessonCount = productFromStore?.lessonCount ?? 0;   // 레슨 개수

  // 수강 여부 확인
  const isEnrolled = useMemo(() => lessons.some(l => l.id === productId), [lessons, productId]);

  // 후기 상태 관리
  const [reviews, setReviews] = useState<Review[]>([]);
  const [isLoadingReviews, setIsLoadingReviews] = useState(false);

  // 후기 목록 로드
  // const loadReviews = useCallback(async () => {
  //   setIsLoadingReviews(true);
  //   try {
  //     const data = await reviewService.getReviewsByProductId(productId);
  //     setReviews(data);
  //   } catch (error) {
  //     console.error('후기 로드 실패:', error);
  //   } finally {
  //     setIsLoadingReviews(false);
  //   }
  // }, [productId]);

  // // 컴포넌트 마운트 시 후기 로드
  // useEffect(() => {
  //   loadReviews();
  // }, [loadReviews]);

  // 후기 작성 핸들러
  const handleSubmitReview = useCallback(async (score: number, reviewText: string) => {
    try {
      const newReview = await reviewService.createReview(productId, score, reviewText);
      // console.log("====> handleSubmitReview newReview,", newReview);
      if (newReview) {
        // 새 후기를 목록 맨 앞에 추가
        setReviews(prev => [newReview, ...prev]);
        Alert.alert('성공', '후기가 등록되었습니다.');
      } else {
        Alert.alert('오류', '후기 등록에 실패했습니다.');
      }
    } catch (error) {
      console.error('후기 등록 실패:', error);
      Alert.alert('오류', '후기 등록 중 문제가 발생했습니다.');
      throw error; // ReviewForm에서 처리할 수 있도록
    }
  }, [productId]);

  // 평균 평점 계산
  // const averageRating = useMemo(() => {
  //   if (reviews.length === 0) return 0;
  //   return reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
  // }, [reviews]);

  // 관련상품 데이터 처리 (현재 상품 제외)
  const relatedProducts: RelatedProductItem[] = useMemo(() => {
    return storeData.flatMap((category: StoreCategory) =>
      (category.Products || [])
        .filter((product: Product) => product.id !== productId) // 현재 상품 제외
        .map((product: Product) => ({
          id: product.id,
          name: product.name,
          icon: getCategoryIcon(category.name),
          description: product.description,
          price: product.price,
          priceType: product.price === 0 ? '무료' : '유료',
          lessonCount: product.lessonCount ?? 0,
          category: category.name,
          categoryDescription: category.description,
        }))
    );
  }, [storeData, productId]);

  // 탭 구성
  const [activeTab, setActiveTab] = useState('강의소개');
  const tabs = ['강의소개', '목차', '관련상품', '후기'];

  // 상세 화면에서 재사용할 route payload (최소)
  const item = { id: productId, name, icon, description, price };

  // 수강 등록 핸들러
  const handleEnroll = async () => {
    try {
      const registered = await lessonService.postMyclass(user!.id, id);
      if (registered) {
        await reloadLessons(); // ✅ 즉시 반영
        setActiveProduct(productId);     // ✅ 선택 상태 저장
        navigation.navigate('ClassProgress', { productId });
        
      } else {
        Alert.alert('수강 등록 실패');
      }
    } catch (err) {
      console.error(err);
      Alert.alert('오류', '수강 등록 중 문제가 발생했습니다.');
    }
  };

  const goStudy = () => {
    setActiveProduct(productId);         // ✅ 선택 상태 저장
    navigation.navigate('ClassProgress', { productId });
  };

  // 관련상품 클릭 핸들러
  const handleRelatedProductPress = (relatedItem: RelatedProductItem) => {
    navigation.push('LessonDetail', {
      id: relatedItem.id,
      name: relatedItem.name,
      icon: relatedItem.icon,
      description: relatedItem.description,
      price: relatedItem.price,
    });
  };

  return (
    <View className="flex-1 bg-white">
      <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
        {/* 상단 헤더: 뒤로가기 버튼 */}
        <View className="flex-row items-center justfy-between bg-white px-[20px] pt-[20px] pb-[20px] gap-x-[20px]">
          <DefaultIconBtn
            onPress={() => navigation.goBack()}
            size={35}
            enableHapticFeedback={true}
            enableSound={true}
            pressScale={0.85}
            pressOpacity={0.6}
            bounceScale={1.15}
            className="mt-[5px]"
          >
            <CaretLeft width={35} height={35} fill="#CCCCCC" />
          </DefaultIconBtn>
          <Text className="text-[22px] font-bold text-[#111111]">{name}</Text>
        </View>

        {/* 강의 기본 정보 */}
        <View className="px-[16px] py-[20px]">
          <View className="flex-row items-center gap-x-[10px]">
            <Image source={icon} className="w-[50px] h-[50px] mt-1" resizeMode="contain" />
            <Text className="text-[27px] font-bold text-black">{name}</Text>
          </View>
          <Text className="text-[15px] text-[#606060] mt-1">{description.replace(/\\n/g, ' ')}</Text>
          <View className="border border-[#CCCCCC] rounded-[16px] px-[40px] py-[10px] my-[30px]">
            <View className="flex-row justify-between items-center">
              {[
                { label: '목차', value: sectionCount, icon: <ListNumbers width={18} height={18} fill="#000000" /> },
                { label: '레슨', value: lessonCount, icon: <Files width={18} height={18} fill="#000000" /> },
                { label: '퀴즈', value: 60, icon: <SealQuestion width={18} height={18} fill="#000000" /> },
                { label: '코드 실습', value: 60, icon: <TerminalWindow width={18} height={18} fill="#000000" /> },
                { label: '프로젝트', value: 0, icon: <TreeStructure width={18} height={18} fill="#000000" /> },
              ].map((item, idx) => (
                <View key={idx} className="items-center flex-1">
                  <View className="mb-[6px]">{item.icon}</View>
                  <Text className="text-[10px] font-medium text-[#777777]">{item.label}</Text>
                  <Text className="text-[10px] font-medium text-[#58CC02] mt-1">{item.value}개</Text>
                </View>
              ))}
            </View>
          </View>
          {/* 학습하기 버튼 */}
          <View className="mb-[30px]">
            <DefaultBtn
              onPress={() => {
                if (isEnrolled) {
                  setActiveProduct(productId);      // ✅ 선택 상태 저장
                  navigation.navigate('ClassProgress', { productId });
                } else {
                  handleEnroll();
                }
              }}
              text={isEnrolled ? '이어서 학습하기' : '수강신청하기'}
              buttonClassName="bg-[#58CC02] rounded-[10px] py-[15px] px-6 flex-row items-center justify-center"
              textClassName="text-white text-[18px] font-bold mt-[-3px]"
              enableHapticFeedback={true}
              enableSound={true}
              flex={false}
            />
          </View>
          <View className="flex-row items-center space-x-1">
            {/* 별 아이콘 5개 */}
            {Array.from({ length: 5 }).map((_, idx) => (
              <Star key={idx} size={16} color="#cccccc" weight="fill" /> // FFC700
              // <Star 
              //   key={idx} 
              //   size={16} 
              //   color={idx < Math.round(averageRating) ? "#FFC700" : "#cccccc"} 
              //   weight="fill" 
              // />
            ))}

            {/* 평점, 후기, 수강생 */}
            <Text className="text-[10px] text-black ml-[5px] pb-[4px]">
              <Text className="underline">0</Text> 후기 {reviews.length}개
              {/* <Text className="underline">
                ({averageRating > 0 ? averageRating.toFixed(1) : '0'}) 후기 {reviews.length}개
              </Text>{' '} */}
              {/* <Text className="">수강생 3,000명</Text> */}
            </Text>
          </View>
          <Text className="font-bold text-[27px]">{price.toLocaleString()}원</Text>
        </View>

        {/* 탭 메뉴 */}
        <View className="flex-row border-b border-[#CCCCCC]">
          {tabs.map((tab) => {
            const isActive = activeTab === tab;
            return (
              <TouchableOpacity
                key={tab}
                className={`flex-1 items-center py-3 ${isActive ? 'border-b-2 border-[#58CC02]' : ''}`}
                onPress={() => setActiveTab(tab)}
              >
                <Text className={`text-[18px] font-semibold ${isActive ? 'text-[#58CC02]' : 'text-black'}`}>
                  {tab}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* 탭 내용 */}
        <View className="px-4 py-6">
          {activeTab === '강의소개' && (
            <ClassIntroShowcase blocks={showcaseByProductName(name)} />
          )}
          {activeTab === '목차' && (
            <ClassOutline productId={productId} />
          )}
          {activeTab === '관련상품' && (
            <View className="flex-1">
              {relatedProducts.length > 0 ? (
                <FlatList
                  data={relatedProducts}
                  keyExtractor={(item) => item.id.toString()}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      className="flex-row items-center bg-white p-[10px] border border-[#CCCCCC] rounded-[16px] mb-[10px]"
                      onPress={() => handleRelatedProductPress(item)}
                    >
                      <Image
                        source={item.icon}
                        className="w-[70px] h-[70px] mr-[10px]"
                        resizeMode="contain"
                      />
                      <View className="flex-1">
                        <Text className="text-base font-bold text-[#111111]">
                          {item.name}
                        </Text>
                        <Text className="text-sm text-[#777777] mt-1 mb-2">
                          {item.description.replace(/\\n/g, '\n')}
                        </Text>
                        <View className="flex-row items-center space-x-2">
                          <Text
                            className={`text-[10px] px-[5px] py-[1px] rounded-[2px] overflow-hidden ${
                              item.priceType === '무료' ? 'text-[#58CC02] bg-[#F0FFE5]' : 'text-[#027FCC] bg-[#EDF8FF]'
                            }`}
                          >
                            {item.priceType}
                          </Text>
                          <Text className="text-[10px] ml-[10px] px-[5px] py-[1px] rounded-[2px] bg-[#F5F5F5] text-[#777777]">
                            {item.lessonCount}강
                          </Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  )}
                  showsVerticalScrollIndicator={false}
                  scrollEnabled={false}
                />
              ) : (
                <Text className="text-sm text-gray-600 text-center py-8">
                  관련 상품이 없습니다.
                </Text>
              )}
            </View>
          )}
          {activeTab === '후기' && (
            <ReviewSection
              productId={productId}
              productName={name}
              isEnrolled={isEnrolled}
              reviews={reviews}
              onSubmitReview={handleSubmitReview}
              onPressEnroll={handleEnroll}
            />
          )}
        </View>
      </ScrollView>
    </View>
  );
};

export default LessonDetailScreen;