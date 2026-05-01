import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AuthStorage from '../utils/storage';
import { Gear } from 'phosphor-react-native';
import dayjs from 'dayjs';
import Button from '../components/Button';
import Heatmap from '../components/Heatmap';
import DefaultBtn from '../components/Button/DefaultBtn';
import HeartModal from '../components/Modal/HeartModal';
import { useUser } from '../contexts/UserContext';
import { useAuth } from '../contexts/AuthContext';
import { useHearts } from '../contexts/HeartContext';
import { authService } from '../services/authService';
import { CodesandboxLogo, Clover, HeartStraight, Check, XP } from '../assets/SvgIcon';
import { useNavigation } from '@react-navigation/native';

const MyPageScreen = () => {
  const navigation = useNavigation();
  const { user, loading } = useUser(); // user 데이터
  const { logout } = useAuth();
  const { hearts, secondsToRefill } = useHearts(); // 하트 상태/남은시간
  const insets = useSafeAreaInsets();
  const [heartModalOpen, setHeartModalOpen] = useState(false);

  // 남은 시간 MM:SS 포맷(hearts<5일 때만 표시)
  const mmss = secondsToRefill != null
    ? `${String(Math.floor(secondsToRefill / 60)).padStart(2, '0')}:${String(secondsToRefill % 60).padStart(2, '0')}`
    : null;

  const handleLogout = async () => {
    Alert.alert(
      '로그아웃',
      '정말 로그아웃하시겠습니까?',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '로그아웃',
          style: 'destructive',
          onPress: async () => {
            try {
              // 1. 서버에 로그아웃 요청
              await authService.logout();
              // 2. Google 로그아웃
              try {
                await GoogleSignin.signOut();
              } catch (googleError) {
                console.log('Google 로그아웃 실패 (무시):', googleError);
                // Google 로그아웃 실패해도 계속 진행
              }
              // 3. 로컬 토큰 삭제
              await AsyncStorage.removeItem('accessToken');
              await AsyncStorage.removeItem('refreshToken');
              // 4. 사용자 정보 삭제
              await AuthStorage.clearUserData();

              // 4. App.tsx의 isLoggedIn 상태를 false로 변경
              logout();
            } catch (error) {
              console.error('로그아웃 실패:', error);
              Alert.alert('오류', '로그아웃 중 오류가 발생했습니다.');
            }
          }
        }
      ]
    );
  };

  if (!user) {
    return (
      <View className="flex-1 justify-center items-center">
        <Text>사용자 정보를 불러오는 중입니다...</Text>
      </View>
    );
  }

  const achievements = [
    { name: 'HTML', icon: require('../assets/icons/html-5-icon.png') },
    { name: 'CSS', icon: require('../assets/icons/css-3-icon.png') },
    { name: 'JS', icon: require('../assets/icons/js-icon.png') },
    { name: 'Python', icon: require('../assets/icons/python-icon.png') },
    { name: 'Java', icon: require('../assets/icons/java-icon.png') },
    { name: 'Nodejs', icon: require('../assets/icons/nodejs-icon.png') },
    // 필요시 더 추가
  ];

  return (
    <>
      <ScrollView
        className="flex-1 bg-white px-[16px]"
        style={{ paddingTop: Math.max(insets.top, 20) }}
      >
        {/* 상단 프로필 */}
        <View className="flex-row justify-between items-start my-[10px]">
          <View className="flex-row gap-x-[20px]">
            <View className="w-[60px] h-[60px] rounded-full bg-purple-600 items-center justify-center">
              <Text className="text-white text-[30px] font-bold">
                {user.nickname.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View className="flex-col gap-y-[10px]">
              <Text className="text-[22px] font-bold">{user.nickname}</Text>
              <Text className="text-[12px] text-[#CDCDCD]">{user.email}</Text>
              <Text className="text-[12px] text-[#CDCDCD]">
                {dayjs(user.created_at).format('YYYY년 M월 가입')}
              </Text>
            </View>
          </View>
          <TouchableOpacity onPress={() => navigation.navigate('Settings' as never)}>
            <Gear size={26} color="#555" weight="regular" />
          </TouchableOpacity>
        </View>

        {/* 개요 */}
        <View className="flex-col gap-y-[10px] py-[10px]">
          <Text className="font-bold text-[22px]">개요</Text>
          <View className="flex-row justify-between gap-x-[10px]">
            {/* 학습 일수 🍀 */}
            <View className="flex-1 flex-row items-start border rounded-[10px] border-[#CCCCCC] p-[10px] gap-x-[6px]">
              <Clover width={24} height={26} fill="#F0FFE5" stroke="#58CC02" strokeWidth={2} />
              <View className="flex-col gap-y-[4px]">
                <Text className="text-[#3C3C3C] font-bold text-[18px]">{user?.studyDays ?? 0}</Text>
                <Text className="text-[10px] text-[#777777]">학습 일수</Text>
              </View>
            </View>

            {/* 총 XP ⚡ */}
            <View className="flex-1 flex-row border rounded-[10px] border-[#CCCCCC] p-[10px] gap-x-[6px]">
              <XP width={24} height={24} fill="#FFC800" />
              <View className="flex-col gap-y-[4px]">
                <Text className="text-[#3C3C3C] font-bold text-[18px]">{user.xp}</Text>
                <Text className="text-[10px] text-[#777777]">총 XP</Text>
              </View>
            </View>

            {/* 하트 ❤️ */}
            <TouchableOpacity
              className="flex-1 flex-row border rounded-[10px] border-[#CCCCCC] p-[10px] gap-x-[6px]"
              onPress={() => setHeartModalOpen(true)}
              activeOpacity={0.7}
            >
              <HeartStraight width={24} height={24} fill="#EE5555" />
              <View className="flex-col gap-y-[4px]">
                <Text className="text-[#3C3C3C] font-bold text-[18px]">{hearts}</Text>
                <Text className="text-[10px] text-[#777777]">하트</Text>
                {/* hearts<5일 때만 MM:SS 보이기 */}
                {/* {hearts < 5 && mmss && (
                <Text className="text-[8px] text-[#606060]">{mmss}</Text>
              )} */}
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* 잔디 */}
        <View className="flex-col gap-y-[10px] py-[10px]">
          <Text className="font-bold text-[22px]">잔디</Text>
          <View className="flex-col gap-y-[8px]">
            {loading ? (
              <Text className="text-[14px] text-gray-400">로딩 중...</Text>
            ) : (
              <>
                <Heatmap data={user?.heatmap ?? {}} />
                {(!user?.heatmap || Object.keys(user.heatmap).length === 0) && (
                  <Text className="regular-14 Text-Black-Secondary text-center">
                    {user.xp > 0
                      ? '최근 학습 기록이 없어요. 잔디를 다시 심어보아요! 🌱'
                      : '아직 학습 기록이 없어요. 첫 잔디를 심어보세요! 🌱'}
                  </Text>
                )}
              </>
            )}
          </View>
        </View>

        {/* 업적 */}
        <View className="flex-col gap-y-[10px] py-[10px]">
          <Text className="font-bold text-[22px]">업적</Text>
          <View className="flex-row flex-wrap gap-[10px] justify-between">
            {achievements.map((item, index) => (
              <View key={index} className="w-[31%] items-center border rounded-[16px] border-[#CCCCCC] py-[10px]">
                <Image source={item.icon} className="w-[70px] h-[70px]" resizeMode="contain" />
              </View>
            ))}
          </View>
        </View>

        {/* 로그아웃 */}
        <View className="py-[50px]">
          <DefaultBtn
            onPress={handleLogout}
            text="로그아웃"
            buttonClassName="bg-white border border-[#FE4C4A] rounded-[10px] py-[15px] px-6 flex-row items-center justify-center"
            textClassName="text-[#FE4C4A] text-[20px] font-bold"
            enableHapticFeedback={true}
            enableSound={true}
            flex={false}
            shadowColor="#FE4C4A"
          />
        </View>
      </ScrollView>

      {/* 하트 상태 모달 */}
      <HeartModal
        visible={heartModalOpen}
        variant="info"                           // 상태 안내용
        onClose={() => setHeartModalOpen(false)} // 닫기
      />
    </>
  );
};

export default MyPageScreen;