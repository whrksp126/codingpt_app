import React, { useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import LoginScreen from '../screens/Auth/LoginScreen';
import SignupScreen from '../screens/Auth/SignupScreen';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authService } from '../services/authService';

interface AuthNavigatorProps {
  onLoginSuccess: () => void;
}

const AuthNavigator: React.FC<AuthNavigatorProps> = ({ onLoginSuccess }) => {
  const [currentScreen, setCurrentScreen] = useState('login');
  const [isLoading, setIsLoading] = useState(true);

  // 자동 로그인 체크 함수(앱이 실행되면 토큰 확인)
  useEffect(() => {
    checkLoginStatus();
  }, []);

  const checkLoginStatus = async () => {
    try {
      const accessToken = await AsyncStorage.getItem('accessToken');
      if (!accessToken) {
        setIsLoading(false);
        return;
      }

      const res = await authService.check(accessToken);
      if (res.success) {
        onLoginSuccess();
      } 
    } catch (err) {
      console.log('자동 로그인 체크 중 오류:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const navigate = (screen: string) => {
    setCurrentScreen(screen);
  };

  // 로그인 성공 시 콜백
  const handleLoginSuccess = () => {
    onLoginSuccess();
  };

  // 프론트 구성
  const renderScreen = () => {
    const navigation = {
      navigate,
      goBack: () => setCurrentScreen('login'),
      replace: (screen: string) => setCurrentScreen(screen),
    };

    switch (currentScreen) {
      case 'login':
        return <LoginScreen navigation={navigation} onLoginSuccess={handleLoginSuccess} />;
      case 'signup':
        return <SignupScreen navigation={navigation} />;
      default:
        return <LoginScreen navigation={navigation} onLoginSuccess={handleLoginSuccess} />;
    }
  };

  if (isLoading) {
    return <View style={styles.container} />;
  }

  return <View style={styles.container}>{renderScreen()}</View>;
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
});

export default AuthNavigator;

function setCurrentScreen(arg0: string) {
  throw new Error('Function not implemented.');
}
