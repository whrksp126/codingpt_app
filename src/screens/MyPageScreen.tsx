import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, Image } from 'react-native';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AuthStorage from '../utils/storage';
import { getTotalStudyDays } from '../utils/heatmapUtils';
import Button from '../components/Button';
import Heatmap from '../components/Heatmap';
import { useUser } from '../contexts/UserContext';
import { authService } from '../services/authService';
import userService from '../services/userService';
import { Gear } from 'phosphor-react-native';
import dayjs from 'dayjs';

interface MyPageScreenProps {
  navigation: any;
  onLogout: () => void;
}

const MyPageScreen: React.FC<MyPageScreenProps> = ({ navigation, onLogout }) => {
  const { user } = useUser(); // user 데이터
  const [heatmap, setHeatmap] = useState<Record<string, number>>({});

  useEffect(() => {
    const fetchHeatmap = async () => {
      try {
        const data  = await userService.getStudyHeatmap();
        setHeatmap(data);
      } catch (error) {
        console.error('잔디 데이터 불러오기 실패:', error);
      }
    };

    fetchHeatmap();
  }, []);

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
              console.log('로그아웃 요청 완료');
              // 2. Google 로그아웃
              try {
                await GoogleSignin.signOut();
                console.log('Google 로그아웃 완료');
              } catch (googleError) {
                console.log('Google 로그아웃 실패 (무시):', googleError);
                // Google 로그아웃 실패해도 계속 진행
              }
              // 3. 로컬 토큰 삭제
              await AsyncStorage.removeItem('accessToken');
              await AsyncStorage.removeItem('refreshToken');
              console.log('로컬 토큰 삭제 완료');
              // 4. 사용자 정보 삭제
              await AuthStorage.clearUserData();
              console.log('사용자 정보 삭제 완료');
              
              console.log('로그아웃 완료');
              
              // 4. App.tsx의 isLoggedIn 상태를 false로 변경
              onLogout();
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
    { name: 'Java',  icon: require('../assets/icons/java-icon.png') },
    { name: 'Nodejs', icon: require('../assets/icons/nodejs-icon.png') },
    // 필요시 더 추가
  ];

  return (
    <ScrollView className="flex-1 bg-white pt-5 px-[16px]">
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
        <TouchableOpacity>
          <Gear size={26} color="#555" weight="regular" />
        </TouchableOpacity>
      </View>

      {/* 개요 */}
      <View className="flex-col gap-y-[10px] py-[10px]">
        <Text className="font-bold text-[22px]">개요</Text>
        <View className="flex-row justify-between gap-x-[10px]">
          {/* 학습 일수 (🍀 → clover.png) */}
          <View className="flex-1 flex-row items-start border rounded-[10px] border-[#CCCCCC] p-[10px] gap-x-[6px]">
            <Image
              source={require('../assets/icons/clover.png')}
              className="w-[24px] h-[24px] mt-[5px]"
              resizeMode="contain"
            />
            <View className="flex-col gap-y-[4px]">
              <Text className="text-[#3C3C3C] font-bold text-[18px]">{user?.studyDays ?? 0}</Text>
              <Text className="text-[10px] text-[#777777]">학습 일수</Text>
            </View>
          </View>

          {/* 총 XP (⚡ → xp.png) */}
          <View className="flex-1 flex-row border rounded-[10px] border-[#CCCCCC] p-[10px] gap-x-[6px]">
            <Image
              source={require('../assets/icons/xp.png')}
              className="w-[24px] h-[24px] mt-[4px]"
              resizeMode="contain"
            />
            <View className="flex-col gap-y-[4px]">
              <Text className="text-[#3C3C3C] font-bold text-[18px]">{user.xp}</Text>
              <Text className="text-[10px] text-[#777777]">총 XP</Text>
            </View>
          </View>

          {/* 하트 (❤️ → heart.png) */}
          <View className="flex-1 flex-row border rounded-[10px] border-[#CCCCCC] p-[10px] gap-x-[6px]">
            <Image
              source={require('../assets/icons/heart.png')}
              className="w-[24px] h-[24px] mb-[5px]"
              resizeMode="contain"
            />
            <View className="flex-col gap-y-[4px]">
              <Text className="text-[#3C3C3C] font-bold text-[18px]">{user.heart}</Text>
              <Text className="text-[10px] text-[#777777]">하트</Text>
            </View>
          </View>
        </View>
      </View>

      {/* 잔디 */}
      <View className="flex-col gap-y-[10px] py-[10px]">
        <Text className="font-bold text-[22px]">잔디</Text>
        <View className="flex-row gap-x-[4px]">
          {Object.keys(heatmap).length > 0 ? (
            <Heatmap data={heatmap} />
          ) : (
            <Text className="text-[14px] text-gray-400">불러오는 중...</Text>
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
        <Button
          title="로그아웃"
          onPress={handleLogout}
          style={{
            backgroundColor: '#FFFFFF',
            borderColor: '#FE4C4A',
            borderWidth: 1
          }}
          textStyle={{ 
            color: '#FE4C4A',
            fontWeight: 'bold',
            fontSize: 20,
          }}
        />
      </View>
    </ScrollView>
  );
};

export default MyPageScreen;