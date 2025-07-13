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
import { authService } from '../../services/authService';

interface LoginScreenProps {
  navigation: any;
  onLoginSuccess?: () => void;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ navigation, onLoginSuccess }) => {
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    GoogleSignin.configure({
      webClientId: Config.GOOGLE_WEB_CLIENT_ID || 'your_web_client_id_here',
      offlineAccess: true,
    });
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
        const { accessToken, refreshToken } = response.data;
        await AsyncStorage.setItem('accessToken', accessToken);
        await AsyncStorage.setItem('refreshToken', refreshToken);
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
          className="w-64 h-36"
          resizeMode="contain"
        />
      </View>
      <View className="w-full px-3 pb-6">
        <TouchableOpacity
          className="bg-[#58CC02] rounded-2xl py-5 items-center justify-center w-full"
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