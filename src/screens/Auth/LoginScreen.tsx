import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Alert,
  TouchableOpacity,
  Image,
  SafeAreaView,
} from 'react-native';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import Config from 'react-native-config';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useUser } from '../../contexts/UserContext';
import AuthStorage from '../../utils/storage';
import { authService } from '../../services/authService';
import BootSplash from 'react-native-bootsplash';

interface LoginScreenProps {
  navigation: any;
  onLoginSuccess?: () => void;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ navigation, onLoginSuccess }) => {
  const [loading, setLoading] = useState(false);
  const { setUser } = useUser(); // Context setter 불러오기

  useEffect(() => {
    const init = async () => {
      GoogleSignin.configure({
        webClientId: Config.GOOGLE_WEB_CLIENT_ID || 'your_web_client_id_here',
        offlineAccess: true,
      });
  
      // 스플래시 숨기기 (temp)
      await BootSplash.hide({ fade: true });
    };
  
    init();
  }, []);

  const signInWithGoogle = async () => {
    setLoading(true);
    try {
      await GoogleSignin.signOut();
      await GoogleSignin.hasPlayServices();
      await GoogleSignin.signIn();
      const tokens = await GoogleSignin.getTokens();
      const idToken = tokens.idToken;
      if (!idToken) {
        Alert.alert('오류', 'ID Token이 존재하지 않습니다.');
        setLoading(false);
        return;
      }
      await sendIdTokenToServer(idToken);
    } catch (error) {
      console.error('Google 로그인 실패:', error);
      Alert.alert('로그인 실패', 'Google 로그인 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const sendIdTokenToServer = async (idToken: string) => {
    try {
      const response = await authService.login(idToken);
      if (response.success && response.data) {
        const { accessToken, refreshToken, user } = response.data;

        if (!user) {
          Alert.alert('로그인 실패', '사용자 정보를 가져올 수 없습니다.');
          return; // ❗ 로그인 흐름 중단
        }
        
        // 1. 토큰 저장
        await AsyncStorage.setItem('accessToken', accessToken);
        await AsyncStorage.setItem('refreshToken', refreshToken);

        // 2. 사용자 정보 저장
        await AuthStorage.setUserData(user); // AsyncStorage
        setUser(user); // Context 저장

        // 3. 다음 화면 이동
        if (onLoginSuccess) {
          onLoginSuccess();
        } else {
          navigation.replace('Home');
        }
      } else {
        Alert.alert('로그인 실패', '서버 인증에 실패했습니다.');
      }
    } catch (error: any) {
      Alert.alert('로그인 실패', '서버 연결에 실패했습니다.');
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 justify-center items-center">
        <Image
          source={require('../../assets/icons/codingpt_logo_01.png')}
          className="w-60 h-32"
          resizeMode="contain"
        />
      </View>
      <View className="w-full px-5 pb-[34px]">
        <TouchableOpacity
          className="bg-[#58CC02] rounded-[10px] py-4 items-center justify-center w-full"
          onPress={signInWithGoogle}
          disabled={loading}
          activeOpacity={0.8}
        >
          <Text className="text-white text-lg font-bold">
            {loading ? '로그인 중...' : '구글 로그인'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

export default LoginScreen; 