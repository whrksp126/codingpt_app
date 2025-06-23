import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import LoginScreen from '../screens/Auth/LoginScreen';
import SignupScreen from '../screens/Auth/SignupScreen';

interface AuthNavigatorProps {
  onLoginSuccess: () => void;
}

const AuthNavigator: React.FC<AuthNavigatorProps> = ({ onLoginSuccess }) => {
  const [currentScreen, setCurrentScreen] = useState('welcome');

  const navigate = (screen: string) => {
    setCurrentScreen(screen);
  };

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
            <Text style={styles.welcomeTitle}>코딩 PT에 오신 것을 환영합니다</Text>
            <Text style={styles.welcomeSubtitle}>로그인하여 학습을 시작하세요</Text>
            
            <TouchableOpacity
              style={styles.authButton}
              onPress={onLoginSuccess}
            >
              <Text style={styles.authButtonText}>게스트로 시작하기</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.authButton}
              onPress={() => navigate('login')}
            >
              <Text style={styles.authButtonText}>로그인</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.authButton}
              onPress={() => navigate('signup')}
            >
              <Text style={styles.authButtonText}>회원가입</Text>
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

  return (
    <View style={styles.container}>
      {renderScreen()}
    </View>
  );
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
  welcomeTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#212529',
    textAlign: 'center',
    marginBottom: 8,
  },
  welcomeSubtitle: {
    fontSize: 16,
    color: '#6C757D',
    textAlign: 'center',
    marginBottom: 48,
  },
  authButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 8,
    marginBottom: 16,
    width: '100%',
    alignItems: 'center',
  },
  authButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default AuthNavigator; 