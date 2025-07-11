import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import LoginScreen from '../screens/Auth/LoginScreen';
import SignupScreen from '../screens/Auth/SignupScreen';
import Config from 'react-native-config'; // .env 사용 시

import { GoogleSignin } from '@react-native-google-signin/google-signin';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

import { api } from '../utils/api';

interface AuthNavigatorProps {
  onLoginSuccess: () => void;
}

const AuthNavigator: React.FC<AuthNavigatorProps> = ({ onLoginSuccess }) => {
  const [currentScreen, setCurrentScreen] = useState('welcome');
  const [isLoading, setIsLoading] = useState(true);

  // GoogleSignin 초기화
  useEffect(() => {
    GoogleSignin.configure({
      webClientId: Config.GOOGLE_WEB_CLIENT_ID, // 또는 직접 문자열 입력
      offlineAccess: true, // refreshToken 발급 받기 위함
    });

    // 자동 로그인 체크 함수(앱이 실행되면 토큰 확인)
    const checkLoginStatus = async () => {
      try {
        // 수동 코드
        // const accessToken = await AsyncStorage.getItem('accessToken');
        // const refreshToken = await AsyncStorage.getItem('refreshToken');
  
        // if (!accessToken || !refreshToken) {
        //   setIsLoading(false);
        //   return; // 토큰 없으면 로그인 필요
        // }
  
        // // accessToken 유효성 확인
        // const response = await axios.get('http://10.0.2.2:3000/auth/me', {
        //   headers: {
        //     Authorization: `Bearer ${accessToken}`,
        //   }, 
        // });

        // fetch 기반 api 사용
        const refreshToken = await AsyncStorage.getItem('refreshToken');
        console.log('refreshToken?', refreshToken); // ← 디버깅 포인트
        const res = await api.auth.check();
        console.log('응답값...', res);
        if (res.success) {
          console.log('accessToken 유효함');
          console.log('자동 로그인 성공:', res);
          onLoginSuccess();
        } else {
          console.log('accessToken 만료 또는 유효하지 않음');
        }
      } catch (err) {
        console.log('자동 로그인 체크 중 오류:', err);
      } finally {
        setIsLoading(false);
      }
    };
  
    checkLoginStatus();
  }, []);

  // ✅ 서버로 idToken 전송 함수
  const sendIdTokenToServer = async (idToken: string) => {
    try {
      const response = await axios.post('http://10.0.2.2:3000/auth/login', {
        idToken,
      });

      const { accessToken, refreshToken } = response.data;
      console.log('Access Token:', accessToken);
      console.log('Refresh Token:', refreshToken);

      // ✅ 토큰 저장
      await AsyncStorage.setItem('accessToken', accessToken);
      await AsyncStorage.setItem('refreshToken', refreshToken);
      console.log('Access Token 저장 완료');
      console.log('Refresh Token 저장 완료');

      const accessToken1 = await AsyncStorage.getItem('accessToken');
      console.log('현재 저장된 accessToken:', accessToken1);

      onLoginSuccess(); // 로그인 성공 후 화면 전환
    } catch (error: any) {
      console.error('토큰 요청 실패:', error.response?.data || error.message);
    }
  };

  // ✅ 로그인 기능 구현
  const signInWithGoogle = async () => {
    try {
      await GoogleSignin.signOut(); // ✅ 먼저 로그아웃
      await GoogleSignin.hasPlayServices();
      await GoogleSignin.signIn(); // 실제 로그인
      const tokens = await GoogleSignin.getTokens();
      const idToken = tokens.idToken;
      const accessToken = tokens.accessToken;

      if (!idToken) {
        console.warn('ID Token이 존재하지 않습니다.');
        return;
      }

      console.log('ID Token:', idToken);
      //console.log('Access Token:', accessToken);

      // ✅ 로그인 성공 처리
      //onLoginSuccess();
      // 👉 백엔드로 idToken 전송
      await sendIdTokenToServer(idToken);
    } catch (error) {
      console.error('Google 로그인 실패:', error);
    }
  };

  const navigate = (screen: string) => {
    setCurrentScreen(screen);
  };

  // 프론트 구성
  const renderScreen = () => {
    const navigation = {
      navigate,
      goBack: () => setCurrentScreen('welcome'),
      replace: (screen: string) => setCurrentScreen(screen),
    };

    switch (currentScreen) {
      case 'welcome':
        return (
          <View style={styles.welcomeContainer}>
            <TouchableOpacity
              style={[styles.authButton, { backgroundColor: '#4285F4' }]}
              onPress={signInWithGoogle}
            >
              <Text style={styles.authButtonText}>Google 계정으로 로그인</Text>
            </TouchableOpacity>
          </View>
        );
      case 'login':
        return <LoginScreen navigation={navigation} />;
      case 'signup':
        return <SignupScreen navigation={navigation} />;
      default:
        return null;
    }
  };
  return <View style={styles.container}>{renderScreen()}</View>;
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  welcomeContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  authButton: {
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 8,
    marginBottom: 16,
    width: '100%',
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  authButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 12,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6C757D',
  },
});

export default AuthNavigator;

function setCurrentScreen(arg0: string) {
  throw new Error('Function not implemented.');
}
