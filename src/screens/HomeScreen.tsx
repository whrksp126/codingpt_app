import React, { useEffect, useState } from 'react';
import Config from 'react-native-config';
import { ScrollView, TouchableOpacity, Text, View, FlatList, Image } from 'react-native';
import LessonCard from '../components/LessonCard';
import { useUser } from '../contexts/UserContext';
import userService from '../services/userService';
import { getColorByCount, getRecentDays } from '../utils/heatmapUtils';
import { AnimatedCircularProgress } from 'react-native-circular-progress';

console.log(Config);

interface HomeScreenProps {
  navigation: any;
}

// 강의 항목 타입
interface Lesson {
  id: string;
  title: string;
  icon: any;
  progress: number;
}

const HomeScreen: React.FC<HomeScreenProps> = ({ navigation }) => {
  const { user } = useUser();
  const [heatmap, setHeatmap] = useState<Record<string, number>>({});
  const [recentCounts, setRecentCounts] = useState<number[]>([]);

  useEffect(() => {
    const fetchHeatmap = async () => {
      try {
        const data = await userService.getStudyHeatmap();
        setHeatmap(data);
  
        const recent = getRecentDays(data, 6); // 최근 6일
        setRecentCounts(recent);
      } catch (e) {
        console.error('홈 heatmap 데이터 가져오기 실패:', e);
      }
    };
  
    fetchHeatmap();
  }, []);

  const lessons: Lesson[] = [
    {
      id: '1',
      title: 'HTML 기초과정',
      icon: require('../assets/icons/html-5-icon.png'),
      progress: 75,
    },
    {
      id: '2',
      title: 'CSS 기초과정',
      icon: require('../assets/icons/css-3-icon.png'),
      progress: 25,
    },
  ];

  const recommendLessons: Lesson[] = [
    {
      id: '2',
      title: 'CSS 기초과정',
      icon: require('../assets/icons/css-3-icon.png'),
      progress: 25,
    },
    {
      id: '1',
      title: 'HTML 기초과정',
      icon: require('../assets/icons/html-5-icon.png'),
      progress: 75,
    },
  ];

  // 잔디: 체크 아이콘 조건부
  const checkIcon = require('../assets/icons/check.png');

  const handleLessonPress = (lessonId: string) => {
    navigation.navigate('LessonDetail', { lessonId });
  };

  // 학습 중인 클래스 구조
  const renderLesson = ({ item }: { item: Lesson }) => (
    <View className="flex-row items-center bg-white border border-[#CCCCCC] rounded-[16px] p-[10px] mt-[10px]">
      <Image 
        source={item.icon} 
        className="w-[70px] h-[70px] mr-3.5" 
        resizeMode="contain" 
      />
      <View className="flex-1 flex-col justify-between" style={{ minHeight: 60 }}>
        <Text className="text-[16px] font-bold text-[#111111]">{item.title}</Text>
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
    <ScrollView className="flex-1 bg-white pt-5">
      {/* 헤더 */}
      <View className="flex-row justify-between items-center pl-4 pr-4">
        <Image 
          source={require('../assets/icons/codingpt_logo_text.png')} 
          className="w-[133px]" 
          resizeMode="contain" 
        />
        <View className="flex-row items-center gap-x-[10px]">
          <View className="flex-row items-center gap-x-[5px]">
            <Image source={require('../assets/icons/clover.png')} className="w-[26.56px] h-[30.28px]" />
            <Text className="text-[#58CC02] text-[18px] font-bold">{user?.studyDays ?? 0}</Text>
          </View>
          <View className="flex-row items-center gap-x-[5px]">
            <Image source={require('../assets/icons/heart.png')} className="w-[29.75px] h-[25.51px]" />
            <Text className="text-[#EE5555] text-[18px] font-bold">5</Text>
          </View>
        </View>
      </View>

      {/* 구분선 */}
      <View className="border-b border-[#CCCCCC]" />

      {/***** 최근 레슨 학습하러 가기: 최근 학습이 없으면 상점으로 이동 *****/}
      <View className="items-center px-[16px] mt-[25px]">
        <View className="flex-row items-center bg-white p-4 gap-x-[20px]">
          <Image
            source={require('../assets/icons/html-5-icon.png')}
            className="w-[120px] h-[120px]"
            resizeMode="contain"
          />
          {/* 진행률 그래프 */}
          <View className="flex-1 items-center">
            <View className="flex-1 justify-center items-center bg-white">
              <AnimatedCircularProgress
                size={60} // 차트 너비/높이
                width={2} // 진행률 바의 두께
                fill={68} // 진행률 (0-100)
                tintColor="#58CC02" // 진행된 부분의 색상
                backgroundColor="#CCCCCC" // 미진행된 부분의 색상
                rotation={0} // 원형의 시작 위치 (0 = 12시 방향)
                lineCap="round" // 바의 끝 모양을 둥글게
              >
                {
                  (fill: number) => (
                    <Text className="text-[#58CC02] text-[24px] font-bold">
                      {`${Math.round(fill)}`}
                    </Text>
                  )
                }
              </AnimatedCircularProgress>
            </View>
            <Text className="text-[24px] font-bold text-[#111111] mt-[10px]">HTML 기초 과정</Text>
            <Text className="text-[14px] text-[#111111] mt-[10px] text-center">
              Web 개발을 처음 접하는 사람도 {"\n"}학습할 수 있어요!
            </Text>
          </View>
        </View>
        {/* 학습하러 가기 버튼 */}
        <View className="items-center mt-[14px] mb-[28px]">
          <TouchableOpacity
            className="bg-[#93D333] w-[236px] h-[46px] rounded-[50px] py-3 px-6 flex-row items-center justify-center"
            onPress={() => navigation.navigate('Curriculum')}
          >
            <Image
              source={require('../assets/icons/curriculum_logo.png')}
              className="w-[20px] h-[20px] mr-2"
              resizeMode="contain"
            />
            <Text className="text-white text-[18px] font-bold" style={{ marginTop: -3 }}>학습하러 가기</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/***** 학습 기록 *****/}
      <View className="flex-row items-center mt-[10px] mb-[10px] px-[10px]">
        <Text className="text-[16px] font-semibold text-[#111111] mr-[15px]">학습 기록</Text>
        <View className="flex-row gap-x-[10px]">
          {recentCounts.map((count, index) => (
            <View
              key={index}
              className="w-[38px] h-[38px] rounded-full justify-center items-center"
              style={{ backgroundColor: getColorByCount(count) }}
            >
              {count > 0 && (
                <Image source={checkIcon} className="w-[20px] h-[20px]" resizeMode="contain" />
              )}
            </View>
          ))}
        </View>
        <TouchableOpacity
            className="ml-auto"
            onPress={() => navigation.navigate('my')}
          >
            <Image source={require('../assets/icons/arrow_r.png')} className="w-[9px] h-[16.5px]" />
          </TouchableOpacity>
      </View>

      {/* 학습 중인 클래스 */}
      <View className="mt-[10px] px-[10px]">
        <View className="flex-row justify-between items-center">
          <Text className="text-[16px] font-semibold text-[#111111]">학습 중인 클래스</Text>
          <TouchableOpacity onPress={() => navigation.navigate('LessonList')}>
            <Image source={require('../assets/icons/arrow_r.png')} className="w-[9px] h-[16.5px]" />
          </TouchableOpacity>
        </View>

        {/* 강의 목록 */}
        <FlatList
          data={lessons}
          renderItem={renderLesson}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 10 }}
          showsVerticalScrollIndicator={false}
          scrollEnabled={false}
        />
      </View>

      {/* 추천 커리큘럼 */}
      <View className="mt-[10px] px-[10px]">
        <View className="flex-row justify-between items-center">
          <Text className="text-[16px] font-semibold text-[#111111]">추천 커리큘럼</Text>
          <TouchableOpacity onPress={() => navigation.navigate('LessonList')}>
            <Image source={require('../assets/icons/arrow_r.png')} className="w-[9px] h-[16.5px]" />
          </TouchableOpacity>
        </View>
      
        <View className="flex-row items-center bg-white border border-[#CCCCCC] rounded-[16px] p-[10px] mt-[10px]">
          <Image 
            source={require('../assets/icons/js-icon.png')}
            className="w-[70px] h-[70px] mr-3.5" 
            resizeMode="contain" 
          />
          <View className="flex-1 flex-col justify-between" style={{ minHeight: 70 }}>
            <Text className="text-[16px] font-bold text-[#111111]">자바스크립트 기초과정</Text>
            <Text className="text-[14px] font-medium text-[#111111]">프로그래밍을 처음 접하는 사람도 할 수 있어요! 자바스크립트란 무엇일까요?</Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
};

export default HomeScreen;