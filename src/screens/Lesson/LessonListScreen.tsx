// 내 강의 페이지
import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { useUser } from '../../contexts/UserContext';
import { useLesson } from '../../contexts/LessonContext';
import { parseLessonList, getIconByTitle, ParsedLesson } from '../../utils/lessonUtils';
import LessonDetailScreen from './LessonDetailScreen';
import { CompositeNavigationProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { RootStackParamList, LearnTabStackParamList, TabsParamList } from '../../navigation/types';

type LessonListNav = CompositeNavigationProp<
  NativeStackNavigationProp<RootStackParamList>,
  CompositeNavigationProp<
    NativeStackNavigationProp<LearnTabStackParamList, 'MyLessonsScreen'>,
    BottomTabNavigationProp<TabsParamList>
  >
>;

const LessonListScreen: React.FC<{ navigation: LessonListNav }> = ({ navigation }) => {
  const { user } = useUser();
  const { lessons, loading: lessonLoading } = useLesson();

  const [filter, setFilter] = useState<'전체' | '수강중' | '수강완료'>('전체');

  // 전체 강의 리스트 가공
  const parsedLessons = useMemo(() => parseLessonList(lessons), [lessons]);

  // 필터 적용 + 아이콘 매핑
  const filteredLessons: (ParsedLesson & { icon: any })[] = useMemo(() => {
    return parsedLessons
      .filter((lesson) => {
        if (filter === '전체') return true;
        return lesson.status === filter;
      })
      .map((lesson) => ({
        ...lesson,
        icon: getIconByTitle(lesson.title),
      }));
  }, [parsedLessons, filter]);

  // LessonDetailScreen을 "풀시트"로 띄우는 오프너
  const openLessonDetailSheet = useCallback((payload: {
    id: number;
    name: string;
    icon: any;
    description: string;
    price: number;
    date?: string;
    progress?: number;
  }) => {
    navigation.navigate('LessonFlow', {
      screen: 'LessonDetail',
      params: {
        id: payload.id,
        name: payload.name,
        icon: payload.icon,
        description: payload.description,
        price: payload.price,
      },
    });
  }, []);

  // 강의 카드 렌더링 (터치 시 풀시트로 상세 열기)
  const renderLesson = useCallback(({ item }: { item: ParsedLesson & { icon: any } }) => {
    // lessons에서 원본 product 찾아 route.params 구성
    const product = lessons.find((c) => c.id === Number(item.id));
    if (!product) return null;

    return (
      <TouchableOpacity
        onPress={() =>
          openLessonDetailSheet({
            id: product.id,
            name: product.name,
            icon: item.icon,
            description: product.description,
            price: product.price,
            date: item.date,
            progress: item.progress,
          })
        }
        className="flex-row items-center bg-white border border-[#CCCCCC] rounded-[16px] p-2.5 mb-2.5"
      >
        <Image source={item.icon} className="w-[70px] h-[70px] mr-3.5" resizeMode="contain" />
        <View className="flex-1">
          <Text className="text-base font-bold text-[#111111]">{item.title}</Text>
          <Text className="text-sm text-[#777777] mb-2.5">{item.date}</Text>
          <Text
            className={`text-[10px] ml-1 ${
              item.progress === 100 ? 'text-[#027FCC]' : 'text-[#58CC02]'
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
      </TouchableOpacity>
    );
  }, [lessons, openLessonDetailSheet]);

  // 5) 로딩 상태
  if (lessonLoading) {
    return (
      <View className="flex-1 justify-center items-center bg-white">
        <ActivityIndicator size="large" color="#58CC02" />
        <Text className="mt-2 text-gray-600">강의 목록을 불러오는 중...</Text>
      </View>
    );
  }

  // 6) 화면
  return (
    <View className="flex-1 bg-white pt-5">
      <Text className="text-[22px] font-bold mb-5 pl-4">내 강의</Text>

      {/* 탭 필터 */}
      <View className="flex-row justify-start pl-4">
        {['전체', '수강중', '수강완료'].map((label) => (
          <TouchableOpacity
            key={label}
            className={`rounded-full border border-[#606060] px-3.5 py-1 mr-2 ${
              filter === label ? 'bg-[#606060]' : 'bg-white'
            }`}
            onPress={() => setFilter(label as typeof filter)}
          >
            <Text className={`text-base ${filter === label ? 'text-white' : 'text-[#606060]'}`}>
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
