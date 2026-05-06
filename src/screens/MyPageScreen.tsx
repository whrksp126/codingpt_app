import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, Pressable } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gear, Lock } from 'phosphor-react-native';
import dayjs from 'dayjs';
import Heatmap from '../components/Heatmap';
import AchievementDetailModal, { AchievementDetail } from '../components/Modal/AchievementDetailModal';
import { useUser } from '../contexts/UserContext';
import { Clover, XP } from '../assets/SvgIcon';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import userService from '../services/userService';

type AchievementMeta = {
  code: string;
  name: string;
  icon: any;
  condition: string;
  unlockedDescription: string;
};

const ACHIEVEMENT_META: AchievementMeta[] = [
  {
    code: 'HTML',
    name: 'HTML',
    icon: require('../assets/icons/html-5-icon.png'),
    condition: 'HTML 카테고리의 심화 레슨을 1개 이상 완료하면 획득합니다.',
    unlockedDescription: 'HTML 심화 학습을 완료하셨습니다!',
  },
  {
    code: 'CSS',
    name: 'CSS',
    icon: require('../assets/icons/css-3-icon.png'),
    condition: 'CSS 카테고리의 심화 레슨을 1개 이상 완료하면 획득합니다.',
    unlockedDescription: 'CSS 심화 학습을 완료하셨습니다!',
  },
  {
    code: 'JS',
    name: 'JS',
    icon: require('../assets/icons/js-icon.png'),
    condition: 'JavaScript 카테고리의 심화 레슨을 1개 이상 완료하면 획득합니다.',
    unlockedDescription: 'JavaScript 심화 학습을 완료하셨습니다!',
  },
  {
    code: 'Python',
    name: 'Python',
    icon: require('../assets/icons/python-icon.png'),
    condition: 'Python 카테고리의 심화 레슨을 1개 이상 완료하면 획득합니다.',
    unlockedDescription: 'Python 심화 학습을 완료하셨습니다!',
  },
  {
    code: 'Java',
    name: 'Java',
    icon: require('../assets/icons/java-icon.png'),
    condition: 'Java 카테고리의 심화 레슨을 1개 이상 완료하면 획득합니다.',
    unlockedDescription: 'Java 심화 학습을 완료하셨습니다!',
  },
  {
    code: 'Nodejs',
    name: 'Nodejs',
    icon: require('../assets/icons/nodejs-icon.png'),
    condition: 'Node.js 카테고리의 심화 레슨을 1개 이상 완료하면 획득합니다.',
    unlockedDescription: 'Node.js 심화 학습을 완료하셨습니다!',
  },
];

const MyPageScreen = () => {
  const navigation = useNavigation();
  const { user, loading } = useUser(); // user 데이터
  const insets = useSafeAreaInsets();
  const [unlockedSet, setUnlockedSet] = useState<Set<string>>(new Set());
  const [selectedAchievement, setSelectedAchievement] = useState<AchievementDetail | null>(null);
  const [achievementModalVisible, setAchievementModalVisible] = useState(false);

  useFocusEffect(
    React.useCallback(() => {
      let cancelled = false;
      userService.getAchievements().then((items) => {
        if (cancelled) return;
        const unlocked = new Set(items.filter((i) => i.unlocked).map((i) => i.code));
        setUnlockedSet(unlocked);
      });
      return () => {
        cancelled = true;
      };
    }, [])
  );

  if (!user) {
    return (
      <View className="flex-1 justify-center items-center bg-white dark:bg-[#0A0D14]">
        <Text className="text-[#111111] dark:text-white">사용자 정보를 불러오는 중입니다...</Text>
      </View>
    );
  }

  const achievements = ACHIEVEMENT_META.map((m) => ({
    ...m,
    unlocked: unlockedSet.has(m.code),
  }));

  return (
    <>
      <ScrollView
        className="flex-1 bg-white dark:bg-[#0A0D14] px-[16px]"
        style={{ paddingTop: Math.max(insets.top, 20) }}
      >
        {/* 상단 프로필 */}
        <Animated.View
          entering={FadeInDown.springify().damping(14)}
          className="flex-row justify-between items-start my-[10px]"
        >
          <View className="flex-row gap-x-[20px]">
            <View className="w-[60px] h-[60px] rounded-full bg-purple-600 items-center justify-center">
              <Text className="text-white text-[30px] font-bold">
                {user.nickname.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View className="flex-col gap-y-[10px]">
              <Text className="text-[22px] font-bold text-[#111111] dark:text-white">{user.nickname}</Text>
              <Text className="text-[12px] text-[#CDCDCD] dark:text-[#9CA3AF]">{user.email}</Text>
              <Text className="text-[12px] text-[#CDCDCD] dark:text-[#9CA3AF]">
                {dayjs(user.created_at).format('YYYY년 M월 가입')}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            onPress={() =>
              (navigation as any).navigate('SettingsFlow', { screen: 'Settings' })
            }
          >
            <Gear size={26} color="#888" weight="regular" />
          </TouchableOpacity>
        </Animated.View>

        {/* 개요 */}
        <Animated.View
          entering={FadeInDown.springify().damping(14).delay(60)}
          className="flex-col gap-y-[10px] py-[10px]"
        >
          <Text className="font-bold text-[22px] text-[#111111] dark:text-white">개요</Text>
          <View className="flex-row gap-x-[10px]">
            {/* 학습 일수 */}
            <View className="flex-1 flex-row items-start border rounded-[10px] border-[#CCCCCC] dark:border-[#3F444D] p-[10px] gap-x-[6px]">
              <Clover width={24} height={26} fill="#F0FFE5" stroke="#58CC02" strokeWidth={2} />
              <View className="flex-col gap-y-[4px]">
                <Text className="text-[#3C3C3C] dark:text-[#E1E6EF] font-bold text-[18px]">{user?.studyDays ?? 0}</Text>
                <Text className="text-[10px] text-[#777777] dark:text-[#9CA3AF]">학습 일수</Text>
              </View>
            </View>

            {/* 총 XP */}
            <View className="flex-1 flex-row border rounded-[10px] border-[#CCCCCC] dark:border-[#3F444D] p-[10px] gap-x-[6px]">
              <XP width={24} height={24} fill="#FFC800" />
              <View className="flex-col gap-y-[4px]">
                <Text className="text-[#3C3C3C] dark:text-[#E1E6EF] font-bold text-[18px]">{user.xp}</Text>
                <Text className="text-[10px] text-[#777777] dark:text-[#9CA3AF]">총 XP</Text>
              </View>
            </View>
          </View>
        </Animated.View>

        {/* 잔디 */}
        <Animated.View
          entering={FadeInDown.springify().damping(14).delay(120)}
          className="flex-col gap-y-[10px] py-[10px]"
        >
          <Text className="font-bold text-[22px] text-[#111111] dark:text-white">잔디</Text>
          <View className="flex-col gap-y-[8px]">
            {loading ? (
              <Text className="text-[14px] text-gray-400 dark:text-[#9CA3AF]">로딩 중...</Text>
            ) : (
              <>
                <Heatmap data={user?.heatmap ?? {}} />
                {(!user?.heatmap || Object.keys(user.heatmap).length === 0) && (
                  <Text className="regular-14 text-[#3C3C3C] dark:text-[#E1E6EF] text-center">
                    {user.xp > 0
                      ? '최근 학습 기록이 없어요. 잔디를 다시 심어보아요!'
                      : '아직 학습 기록이 없어요. 첫 잔디를 심어보세요!'}
                  </Text>
                )}
              </>
            )}
          </View>
        </Animated.View>

        {/* 업적 */}
        <Animated.View
          entering={FadeInDown.springify().damping(14).delay(180)}
          className="flex-col gap-y-[10px] py-[10px] pb-[40px]"
        >
          <Text className="font-bold text-[22px] text-[#111111] dark:text-white">업적</Text>
          <View className="flex-row flex-wrap gap-[10px] justify-between">
            {achievements.map((item, index) => (
              <Pressable
                key={index}
                onPress={() => {
                  setSelectedAchievement(item);
                  setAchievementModalVisible(true);
                }}
                className={`w-[31%] items-center justify-center border rounded-[16px] py-[10px] ${item.unlocked ? 'border-[#CCCCCC] dark:border-[#3F444D] bg-white dark:bg-[#1B1F27]' : 'border-[#E5E5E5] dark:border-[#3F444D] bg-[#F5F5F5] dark:bg-[#23272F]'}`}
              >
                <View className="relative w-[70px] h-[70px] items-center justify-center">
                  <Image
                    source={item.icon}
                    className="w-[70px] h-[70px]"
                    resizeMode="contain"
                    style={{ opacity: item.unlocked ? 1 : 0.3 }}
                  />
                  {!item.unlocked && (
                    <View className="absolute inset-0 items-center justify-center">
                      <Lock size={26} color="#888" weight="fill" />
                    </View>
                  )}
                </View>
              </Pressable>
            ))}
          </View>
        </Animated.View>
      </ScrollView>

      {achievementModalVisible && (
        <AchievementDetailModal
          visible={achievementModalVisible}
          achievement={selectedAchievement}
          onClose={() => setAchievementModalVisible(false)}
        />
      )}
    </>
  );
};

export default MyPageScreen;
