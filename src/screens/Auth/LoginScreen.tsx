import React, { useEffect, useState } from 'react';
import { View, Text, Alert, Image, ActivityIndicator, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import Svg, { Path } from 'react-native-svg';
import Config from 'react-native-config';

import PressableScale from '../../components/ui/PressableScale';
import ResponsiveContainer from '../../components/ui/ResponsiveContainer';

import { useUser } from '../../contexts/UserContext';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigation } from '../../contexts/NavigationContext';

import { authService } from '../../services/authService';
import { getOrCreateAnonId, setOnboardingSeen } from '../../utils/anonId';

import { v2Colors, v2Font } from '../../theme/v2Tokens';

// 구글 공식 4색 'G' 로고 (Google 브랜딩 가이드)
const GoogleGLogo: React.FC<{ size?: number }> = ({ size = 20 }) => (
  <Svg width={size} height={size} viewBox="0 0 48 48">
    <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </Svg>
);

// V2 다크 로그인 — 온보딩의 마지막 단계. 게스트("둘러보기") 없음.
const LoginScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { navigate } = useNavigation();
  const [loading, setLoading] = useState(false);
  const { refreshUser } = useUser();
  const { login } = useAuth();

  useEffect(() => {
    GoogleSignin.configure({
      webClientId: Config.GOOGLE_WEB_CLIENT_ID || '',
      iosClientId: Config.GOOGLE_IOS_CLIENT_ID || '',
      offlineAccess: true,
    });
  }, []);

  const signInWithGoogle = async () => {
    setLoading(true);
    try {
      await GoogleSignin.signOut(); // 캐시 삭제 후 재로그인
      await GoogleSignin.hasPlayServices();
      await GoogleSignin.signIn();
      const tokens = await GoogleSignin.getTokens();
      const idToken = tokens.idToken;
      if (!idToken) {
        Alert.alert('오류', 'ID Token이 존재하지 않습니다.');
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
      // 온보딩 익명 응답을 유저에 연결하기 위해 anonId 동봉
      const anonId = await getOrCreateAnonId();
      const response = await authService.login(idToken, anonId);
      if (response.success && response.data) {
        const { accessToken, refreshToken } = response.data;
        await login(accessToken, refreshToken); // context 내부에서 토큰 저장
        await setOnboardingSeen();              // 재진입 시 온보딩 스킵
        await refreshUser();                    // UserContext 저장
        navigate('home');
      } else {
        Alert.alert('로그인 실패', '서버 인증에 실패했습니다.');
      }
    } catch (error) {
      Alert.alert('로그인 실패', '서버 연결에 실패했습니다.');
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.hero}>
        <Image
          source={require('../../assets/icons/codingpt-logo.png')}
          style={styles.logo}
          resizeMode="contain"
        />
      </View>

      <View style={styles.footer}>
        <ResponsiveContainer maxWidth={380} innerStyle={{ gap: 10, alignItems: 'center' }}>
          <PressableScale
            onPress={signInWithGoogle}
            disabled={loading}
            android_ripple={{ color: 'rgba(0,0,0,0.06)' }}
            style={styles.googleBtn}
          >
            {loading ? (
              <ActivityIndicator color="#1F1F1F" />
            ) : (
              <>
                <GoogleGLogo size={20} />
                <Text style={styles.googleText}>Google로 계속하기</Text>
              </>
            )}
          </PressableScale>
          <Text style={styles.terms}>
            계속하면 <Text style={styles.termsStrong}>서비스 약관</Text>과{' '}
            <Text style={styles.termsStrong}>개인정보 처리방침</Text>에{'\n'}동의하게 돼요.
          </Text>
        </ResponsiveContainer>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: v2Colors.base,
  },
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingHorizontal: 32,
  },
  logo: {
    width: 112,
    height: 112,
  },
  footer: {
    paddingHorizontal: 32,
    paddingBottom: 36,
    gap: 10,
    alignItems: 'center',
  },
  googleBtn: {
    width: '100%',
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DADCE0',
  },
  googleText: {
    fontFamily: v2Font.sans,
    fontSize: 15,
    fontWeight: '600',
    color: '#1F1F1F',
  },
  terms: {
    textAlign: 'center',
    fontFamily: v2Font.sans,
    fontSize: 11.5,
    color: v2Colors.textDim,
    marginTop: 8,
    lineHeight: 18,
  },
  termsStrong: {
    color: v2Colors.text3,
  },
});

export default LoginScreen;
