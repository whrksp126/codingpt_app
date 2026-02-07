import React, { useMemo, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../contexts/StoreContext';
import type { Product, StoreCategory } from '../services/storeService';
// import LessonDetailScreen from './Lesson/LessonDetailScreen';

import { CompositeNavigationProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { RootStackParamList, StoreTabStackParamList, TabsParamList } from '../navigation/types';

type StoreNav = CompositeNavigationProp<
  NativeStackNavigationProp<RootStackParamList>,
  CompositeNavigationProp<
    NativeStackNavigationProp<StoreTabStackParamList, 'StoreScreen'>,
    BottomTabNavigationProp<TabsParamList>
  >
>;

type Props = {
  navigation: StoreNav;
};

// 렌더링에 사용할 항목 타입 정의
interface StoreItem { // product
  id: number;
  name: string;
  icon: any;
  description: string;
  price: number;
  priceType: '무료' | '유료';
  lessonCount: number;
  category: string;                       // storecategory.name
  categoryDescription: string;   // storecategory.description
}

// 카테고리 이름에 따른 아이콘 매핑
const getCategoryIcon = (categoryName: string) => {
  const code = categoryName.split('(')[0].trim(); // "HTML(태그의 정원)" → "HTML"
  switch (code) {
    case 'HTML':
      return require('../assets/icons/html-5-icon.png');
    case 'CSS':
      return require('../assets/icons/css-3-icon.png');
    case 'JS':
      return require('../assets/icons/js-icon.png');
    case 'JAVA':
      return require('../assets/icons/java-icon.png');
    default:
      return require('../assets/icons/js-icon.png'); // 나중에 변경
  }
};

const StoreScreen: React.FC<Props> = ({ navigation }) => {
  const { storeData, loading } = useStore();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<'전체' | '무료' | '유료'>('전체');

  // StoreCategory[] → StoreItem[] 변환 (useMemo로 캐싱)
  const storeItems: StoreItem[] = useMemo(() => {
    return storeData.flatMap((category: StoreCategory) =>
      (category.Products || []).map((product: Product) => ({
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
  }, [storeData]);

  // 필터링 처리
  const filteredLectures = storeItems.filter(
    (item) => filter === '전체' || item.priceType === filter
  );

  // 카테고리별로 StoreItem 그룹화
  const grouped = filteredLectures.reduce<
    Record<string, { items: StoreItem[]; description: string }>
  >((acc, cur) => {
    if (!acc[cur.category]) {
      acc[cur.category] = {
        items: [],
        description: cur.categoryDescription,
      };
    }
    acc[cur.category].items.push(cur);
    return acc;
  }, {});

  // 상품 클릭 시 스택으로 LessonDetail 이동 (필요 파라미터 전달)

  if (loading) {
    return (
      <View className="flex-1 justify-center items-center bg-white">
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View
      className="flex-1 bg-white"
      style={{ paddingTop: insets.top }}
    >
      <Text className="text-[22px] font-bold mb-5 pl-4">상점</Text>

      {/* 상단 필터 버튼 (전체 / 무료 / 유료) */}
      <View className="flex-row justify-start pl-4">
        {['전체', '무료', '유료'].map((label) => (
          <TouchableOpacity
            key={label}
            onPress={() => setFilter(label as typeof filter)}
            className={`rounded-full border border-[#606060] px-3.5 py-1 mr-2 ${filter === label ? 'bg-[#606060]' : 'bg-white'
              }`}
          >
            <Text
              className={`text-base ${filter === label ? 'text-white' : 'text-gray-600'
                }`}
            >
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 구분선 */}
      <View className="border-b border-[#CCCCCC] my-5" />

      {/* 카테고리별 상품 리스트 */}
      <FlatList
        data={Object.entries(grouped)}
        keyExtractor={([categoryName]) => categoryName}
        renderItem={({ item: [categoryName, { items, description }] }) => (
          <View className="px-[16px] pb-[10px]">
            {/* 카테고리명 */}
            <Text className="text-[16px] font-bold text-[#FFC700] mb-1">{categoryName}</Text>
            {/* 카테고리 설명 */}
            <Text className="text-sm text-[#777777]">{description}</Text>

            {/* 상품 카드 목록 */}
            {items.map((item) => (
              <TouchableOpacity
                key={item.id}
                className="flex-row items-center bg-white p-[10px] border border-[#CCCCCC] rounded-[16px] mt-[10px]"
                onPress={() =>
                  navigation.navigate('LessonFlow', {
                    screen: 'LessonDetail',
                    params: {
                      id: item.id,
                      name: item.name,
                      icon: item.icon,
                      description: item.description,
                      price: item.price,
                    },
                  })
                }
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
                      className={`text-[10px] px-[5px] py-[1px] rounded-[2px] overflow-hidden ${item.priceType === '무료' ? 'text-[#58CC02] bg-[#F0FFE5]' : 'text-[#027FCC] bg-[#EDF8FF]'
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
            ))}
          </View>
        )}
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
};

export default StoreScreen;