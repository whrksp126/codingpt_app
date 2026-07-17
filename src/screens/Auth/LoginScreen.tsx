import React, { useEffect, useState } from 'react';
import { View, Text, Alert, Image, ActivityIndicator, StyleSheet, Platform, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { appleAuth, appleAuthAndroid } from '@invertase/react-native-apple-authentication';
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

// Apple 공식 로고 (흰색 — 검은 버튼용)
const AppleLogo: React.FC<{ size?: number }> = ({ size = 20 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="#FFFFFF">
    <Path d="M17.05 12.04c-.03-2.85 2.33-4.22 2.44-4.28-1.33-1.95-3.4-2.22-4.14-2.25-1.76-.18-3.44 1.04-4.33 1.04-.89 0-2.27-1.02-3.73-.99-1.92.03-3.69 1.12-4.68 2.84-2 3.46-.51 8.58 1.43 11.39.95 1.38 2.08 2.92 3.56 2.87 1.43-.06 1.97-.92 3.7-.92 1.72 0 2.21.92 3.72.89 1.54-.03 2.51-1.4 3.45-2.79 1.09-1.6 1.54-3.15 1.56-3.23-.03-.02-2.99-1.15-3.02-4.56zM14.23 3.66c.79-.96 1.32-2.29 1.17-3.62-1.14.05-2.51.76-3.32 1.71-.73.85-1.37 2.2-1.2 3.5 1.27.1 2.57-.64 3.35-1.59z" />
  </Svg>
);

// V2 다크 로그인 — 온보딩의 마지막 단계. 게스트("둘러보기") 없음.
const LoginScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { navigate } = useNavigation();
  const [loading, setLoading] = useState(false);
  const { refreshUser } = useUser();
  const { login } = useAuth();

  // 이메일/PW 로그인(스토어 심사 데모 계정용) — 평소엔 접혀 있음.
  const [showEmail, setShowEmail] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

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
      await finishLogin(response);
    } catch (error) {
      Alert.alert('로그인 실패', '서버 연결에 실패했습니다.');
    }
  };

  // 로그인 응답 공통 처리 — 구글/애플 모두 동일.
  const finishLogin = async (response: Awaited<ReturnType<typeof authService.login>>) => {
    if (response.success && response.data) {
      const { accessToken, refreshToken } = response.data;
      await login(accessToken, refreshToken); // context 내부에서 토큰 저장
      await setOnboardingSeen();              // 재진입 시 온보딩 스킵
      await refreshUser();                    // UserContext 저장
      navigate('home');
    } else {
      Alert.alert('로그인 실패', '서버 인증에 실패했습니다.');
    }
  };

  // Apple 로그인 (iOS 네이티브) — identityToken + (첫 로그인 시) 이름을 서버로.
  const signInWithApple = async () => {
    setLoading(true);
    try {
      const resp = await appleAuth.performRequest({
        requestedOperation: appleAuth.Operation.LOGIN,
        requestedScopes: [appleAuth.Scope.FULL_NAME, appleAuth.Scope.EMAIL],
      });
      const { identityToken, fullName, authorizationCode } = resp;
      if (!identityToken) {
        Alert.alert('오류', 'Apple 인증 토큰이 없습니다.');
        return;
      }
      // 이름은 최초 1회만 제공됨 — 있으면 합쳐서 전달.
      const name = [fullName?.givenName, fullName?.familyName].filter(Boolean).join(' ').trim() || undefined;
      const anonId = await getOrCreateAnonId();
      // authorizationCode(최초 동의 시)는 서버가 refresh_token 으로 교환해 탈퇴 시 revoke(5.1.1(v)).
      const response = await authService.appleLogin(identityToken, name, anonId, authorizationCode || undefined);
      await finishLogin(response);
    } catch (error: any) {
      // 사용자가 시트를 취소한 경우는 조용히 무시.
      if (error?.code === appleAuth.Error.CANCELED) return;
      console.error('Apple 로그인 실패:', error);
      Alert.alert('로그인 실패', 'Apple 로그인 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 이메일/비밀번호 로그인 — 스토어 심사 데모 계정 전용.
  const signInWithEmail = async () => {
    if (!email.trim() || !password) {
      Alert.alert('알림', '이메일과 비밀번호를 입력해 주세요.');
      return;
    }
    setLoading(true);
    try {
      const response = await authService.loginLocal(email.trim(), password);
      await finishLogin(response);
    } catch (error) {
      Alert.alert('로그인 실패', '이메일 또는 비밀번호가 올바르지 않습니다.');
    } finally {
      setLoading(false);
    }
  };

  // Apple 로그인 (Android 웹플로우) — 네이티브 SDK 가 없어 브라우저로 Services ID 로그인.
  //  iOS 네이티브와 같은 Apple ID → 같은 apple_id(sub) → 같은 계정으로 연결(PC·iPad 동기화).
  //  백엔드는 iOS 와 동일한 /api/users/apple-login 을 재사용(audience 에 Services ID 허용).
  const signInWithAppleAndroid = async () => {
    setLoading(true);
    try {
      const state = Math.random().toString(36).slice(2) + Date.now().toString(36);
      appleAuthAndroid.configure({
        clientId: 'com.ghmate.codingpt.web',              // 웹 Services ID(백엔드 audience 허용)
        redirectUri: 'https://codingpt.ghmate.com',       // Services ID 에 등록된 Return URL
        responseType: appleAuthAndroid.ResponseType.ALL,  // id_token + code(교환·revoke 용)
        scope: appleAuthAndroid.Scope.ALL,                // name + email
        state,
      });
      const resp = await appleAuthAndroid.signIn();
      const identityToken = resp.id_token;
      if (!identityToken) {
        Alert.alert('오류', 'Apple 인증 토큰이 없습니다.');
        return;
      }
      const nm = resp.user?.name;
      const name = [nm?.firstName, nm?.lastName].filter(Boolean).join(' ').trim() || undefined;
      const anonId = await getOrCreateAnonId();
      const response = await authService.appleLogin(identityToken, name, anonId, resp.code || undefined);
      await finishLogin(response);
    } catch (error: any) {
      // 사용자가 브라우저를 닫아 취소한 경우는 조용히 무시.
      if (error?.message === appleAuthAndroid.Error.SIGNIN_CANCELLED) return;
      console.error('Apple 로그인(Android) 실패:', error);
      Alert.alert('로그인 실패', 'Apple 로그인 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
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
          {/* Apple 로그인 — iOS=네이티브, Android=웹플로우. Android 도 노출해야 Apple 계정이
              PC·iPad·Android 간에 이어짐(구글 로그인만 있으면 비공개 릴레이 이메일로 계정 분리됨). */}
          {(Platform.OS === 'ios' || appleAuthAndroid.isSupported) ? (
            <PressableScale
              onPress={Platform.OS === 'ios' ? signInWithApple : signInWithAppleAndroid}
              disabled={loading}
              android_ripple={{ color: 'rgba(255,255,255,0.12)' }}
              style={styles.appleBtn}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <AppleLogo size={19} />
                  <Text style={styles.appleText}>Apple로 계속하기</Text>
                </>
              )}
            </PressableScale>
          ) : null}
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

          {/* 이메일 로그인 — 스토어 심사 데모 계정용. 평소엔 접혀 있고 링크로만 노출. */}
          {showEmail ? (
            <View style={styles.emailBox}>
              <TextInput
                style={styles.input}
                placeholder="이메일"
                placeholderTextColor={v2Colors.textDim}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                autoCorrect={false}
                editable={!loading}
              />
              <TextInput
                style={styles.input}
                placeholder="비밀번호"
                placeholderTextColor={v2Colors.textDim}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                editable={!loading}
              />
              <PressableScale onPress={signInWithEmail} disabled={loading} style={styles.emailBtn}>
                {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.emailBtnText}>로그인</Text>}
              </PressableScale>
            </View>
          ) : (
            <Text style={styles.emailLink} onPress={() => setShowEmail(true)}>
              이메일로 로그인
            </Text>
          )}
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
  appleBtn: {
    width: '100%',
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#000000',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#000000',
  },
  appleText: {
    fontFamily: v2Font.sans,
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
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
  emailLink: {
    marginTop: 6,
    fontFamily: v2Font.sans,
    fontSize: 12.5,
    color: v2Colors.textDim,
    textDecorationLine: 'underline',
  },
  emailBox: {
    width: '100%',
    marginTop: 12,
    gap: 8,
  },
  input: {
    width: '100%',
    height: 50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: v2Colors.border,
    backgroundColor: v2Colors.surface,
    paddingHorizontal: 14,
    fontFamily: v2Font.sans,
    fontSize: 15,
    color: v2Colors.text,
  },
  emailBtn: {
    width: '100%',
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: v2Colors.accent,
    borderRadius: 12,
  },
  emailBtnText: {
    fontFamily: v2Font.sans,
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});

export default LoginScreen;
