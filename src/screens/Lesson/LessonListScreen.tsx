import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
} from 'react-native';

// 강의 항목 타입
interface Lesson {
  id: string;
  title: string;
  icon: any;
  date: string;
  progress: number;
}

const LessonListScreen = () => {
  const [filter, setFilter] = useState<'전체' | '수강중' | '수강완료'>('전체');

  const lessons: Lesson[] = [
    {
      id: '1',
      title: '웹 개발의 시작 HTML(기초)',
      icon: require('../../assets/icons/html-5-icon.png'),
      date: '1일 전',
      progress: 75,
    },
    {
      id: '2',
      title: '스타일 산다 CSS(기초)',
      icon: require('../../assets/icons/css-3-icon.png'),
      date: '1일 전',
      progress: 75,
    },
    {
      id: '3',
      title: '처음 만나는 자바스크립트(기초)',
      icon: require('../../assets/icons/js-icon.png'),
      date: '1일 전',
      progress: 75,
    },
    {
      id: '4',
      title: '파이썬 알고리즘 & 자동화(심화)',
      icon: require('../../assets/icons/python-icon.png'),
      date: '1일 전',
      progress: 100,
    },
  ];

  const filteredLessons = lessons.filter((lesson) => {
    if (filter === '전체') return true;
    if (filter === '수강중') return lesson.progress < 100;
    if (filter === '수강완료') return lesson.progress === 100;
    return true;
  });

  {/* 강의 구조 */}
  const renderLesson = ({ item }: { item: Lesson }) => (
    <View className="flex-row items-center bg-white border border-[#CCCCCC] rounded-[16px] p-2.5 mb-2.5">
      <Image source={item.icon} className="w-[70px] h-[70px] mr-3.5" resizeMode="contain" />
      <View className="flex-1">
        <Text className="text-base font-bold text-[#111111]">{item.title}</Text>
        <Text className="text-sm text-[#777777] mb-2.5">{item.date}</Text>
        <Text
          className={`text-[10px] ml-1 ${
            item.progress === 100
              ? 'text-[#027FCC]' : 'text-[#58CC02]'
          }`}
        >
          {item.progress}%
        </Text>
        <View className="h-2.5 rounded-full bg-[#F5F5F5] mt-0.5">
          <View
            className="h-2.5 rounded-full bg-[#FFC700]"
            style={{ width: `${item.progress}%` }}
          />
        </View>
      </View>
    </View>
  );

  return (
    <View className="flex-1 bg-white pt-5">
      <Text className="text-[22px] font-bold mb-5 pl-4">내 강의</Text>

      {/* 레슨 상태 필터 */}
      <View className="flex-row justify-start pl-4">
        {['전체', '수강중', '수강완료'].map((label) => (
          <TouchableOpacity
            key={label}
            className={`rounded-full border border-[#606060] px-3.5 py-1 mr-2 ${
              filter === label ? 'bg-[#606060]' : 'bg-white'
            }`}
            onPress={() => setFilter(label as typeof filter)}
          >
            <Text
              className={`text-base ${
                filter === label ? 'text-white' : 'text-[#606060]'
              }`}
            >
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 구분선 */}
      <View className="border-b border-[#CCCCCC] my-5" />

      {/* 강의 목록 */}
      <FlatList
        data={filteredLessons}
        renderItem={renderLesson}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 16 }}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
};

export default LessonListScreen;
