import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, Image } from 'react-native';
import StoreService, { StoreCategory, Product } from '../services/storeService';

// 렌더링에 사용할 항목 타입 정의
interface StoreItem { // product
  id: string;
  title: string;
  icon: any;
  description: string;
  price: number;
  priceType: '무료' | '유료';
  lessonCount: number;
  category: string;              // storecategory.name
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
    default:
      return require('../assets/icons/js-icon.png'); // 나중에 변경
  }
};

const StoreScreen  = ({ navigation }: any) => {
  const [storeItems, setStoreItems] = useState<StoreItem[]>([]);
  const [filter, setFilter] = useState<'전체' | '무료' | '유료'>('전체');

  useEffect(() => {
    const fetchStores = async () => {
      const categories = await StoreService.getAllStores();

      // 백엔드에서 받은 카테고리/상품 데이터를 가공하여 렌더링용 StoreItem으로 변환
      const parsed: StoreItem[] = categories.flatMap((category: StoreCategory) =>
        category.Products.map((product: Product) => ({
          id: product.id.toString(),
          title: product.name,
          icon: getCategoryIcon(category.name),
          description: product.description,
          price: product.price,
          priceType: product.price === 0 ? '무료' : '유료',
          lessonCount: 0, // 향후 백엔드에서 강의 수 내려오면 반영
          category: category.name,
          categoryDescription: category.description,
        }))
      );

      setStoreItems(parsed);
    };

    fetchStores();
  }, []);

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

  return (
    <View className="flex-1 bg-white pt-5">
      <Text className="text-[22px] font-bold mb-5 pl-4">상점</Text>

      {/* 상단 필터 버튼 (전체 / 무료 / 유료) */}
      <View className="flex-row justify-start pl-4">
        {['전체', '무료', '유료'].map((label) => (
          <TouchableOpacity
            key={label}
            onPress={() => setFilter(label as typeof filter)}
            className={`rounded-full border border-[#606060] px-3.5 py-1 mr-2 ${
              filter === label ? 'bg-[#606060]' : 'bg-white'
            }`}
          >
            <Text
              className={`text-base ${
                filter === label ? 'text-white' : 'text-gray-600'
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
            <Text className="text-[16px] font-bold text-[#FFC700] mb-1">
              {categoryName}
            </Text>
            {/* 카테고리 설명 */}
            <Text className="text-sm text-[#777777]">{description}</Text>

            {/* 상품 카드 목록 */}
            {items.map((item) => (
              <TouchableOpacity
                onPress={() => navigation.navigate('lessonDetail', item)}
                key={item.id}
                className="flex-row items-center bg-white p-[10px] border border-[#CCCCCC] rounded-[16px] mt-[10px]"
              >
                <Image
                  source={item.icon}
                  className="w-[70px] h-[70px] mr-[10px]"
                  resizeMode="contain"
                />
                <View className="flex-1">
                  <Text className="text-base font-bold text-[#111111]">
                    {item.title}
                  </Text>
                  <Text className="text-sm text-[#777777] mt-1 mb-2">
                    {item.description.replace(/\\n/g, '\n')}
                  </Text>
                  <View className="flex-row items-center space-x-2">
                    <Text
                      className={`text-[10px] px-[5px] py-[1px] rounded-[2px] overflow-hidden ${
                        item.priceType === '무료'
                          ? 'text-[#58CC02] bg-[#F0FFE5]'
                          : 'text-[#027FCC] bg-[#EDF8FF]'
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