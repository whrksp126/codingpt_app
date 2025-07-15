import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
} from 'react-native';

interface StoreItem {
  id: string;
  title: string;
  icon: any;
  description: string;
  priceType: '무료' | '유료';
  lessonCount: number;
  category: 'HTML' | 'CSS' | 'JS';
}

const categoryDescriptions: Record<string, string> = {
  HTML: 'HTML은 웹 개발의 첫걸음이자 모든 구조의 시작입니다',
  CSS: '웹은 보이는 것이 전부다. 색, 공간, 움직임까지!',
  JS: '당신의 웹에 생명을 불어넣을 언어, JavaScript',
};

const getCategoryLabel = (key: string) => {
  if (key === 'HTML') return '태그의 정원';
  if (key === 'CSS') return '스타일 연구소';
  if (key === 'JS') return '로직의 숲';
  return '';
};

const StoreScreen = () => {
  const [filter, setFilter] = useState<'전체' | '무료' | '유료'>('전체');

  const lectures: StoreItem[] = [
    {
      id: '1',
      title: '웹 개발의 시작 HTML(기초)',
      icon: require('../assets/icons/html-5-icon.png'),
      description: '웹 개발 배우고 싶은 사람 다 모여라\n웹 개발의 시작 HTML!',
      priceType: '무료',
      lessonCount: 22,
      category: 'HTML',
    },
    {
      id: '2',
      title: 'HTML 완전 정복(심화)',
      icon: require('../assets/icons/html-5-icon.png'),
      description: '시맨틱 태그부터 접근성까지\n전문가처럼 쓰는 HTML의 기술',
      priceType: '유료',
      lessonCount: 32,
      category: 'HTML',
    },
    {
      id: '3',
      title: '스타일 산다 CSS(기초)',
      icon: require('../assets/icons/css-3-icon.png'),
      description: 'CSS가 쉬워지는 시간\n스타일 산다 CSS!',
      priceType: '무료',
      lessonCount: 32,
      category: 'CSS',
    },
    {
      id: '4',
      title: '스타일 산다 CSS(심화)',
      icon: require('../assets/icons/css-3-icon.png'),
      description: '애니메이션, 변수, 프레임워크까지\n한 단계 높은 스타일링',
      priceType: '유료',
      lessonCount: 35,
      category: 'CSS',
    },
    {
      id: '5',
      title: '처음 만나는 자바스크립트(기초)',
      icon: require('../assets/icons/js-icon.png'),
      description: '자바스크립트를 처음 배우는 분을 위한\nJS 초심자 커리큘럼',
      priceType: '무료',
      lessonCount: 41,
      category: 'JS',
    },
  ];

  const filteredLectures = lectures.filter(
    (lec) => filter === '전체' || lec.priceType === filter
  );

  const grouped = filteredLectures.reduce<Record<string, StoreItem[]>>((acc, cur) => {
    if (!acc[cur.category]) acc[cur.category] = [];
    acc[cur.category].push(cur);
    return acc;
  }, {});

  return (
    <View className="flex-1 bg-white pt-5">
      <Text className="text-[22px] font-bold mb-5 pl-4">상점</Text>

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

      <View className="border-b border-[#CCCCCC] my-5" />

      <FlatList
        data={Object.entries(grouped)}
        keyExtractor={([category]) => category}
        renderItem={({ item: [category, items] }) => (
          <View className="px-[16px] pb-[10px]">
            {/* 상품 카테고리 */}
            <Text className="text-[16px] font-bold text-[#FFC700] mb-1">
              {`${category}(${getCategoryLabel(category)})`}
            </Text>
            {/* 상품 카테고리 설명 */}
            <Text className="text-sm text-[#777777]">
              {categoryDescriptions[category]}
            </Text>

            {/* 상품 카드 */}
            {items.map((item) => (
              <View
                key={item.id}
                className="flex-row items-center bg-white p-[10px] border border-[#CCCCCC] rounded-[16px] mt-[10px]"
              >
                <Image
                  source={item.icon}
                  className="w-[70px] h-[70px] mr-[10px]"
                  resizeMode="contain"
                />
                <View className="flex-1">
                  <Text className="text-base font-bold text-[#111111]">{item.title}</Text>
                  <Text className="text-sm text-[#777777] mt-1 mb-2">
                    {item.description}
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
              </View>
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
