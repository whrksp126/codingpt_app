import React from 'react';
import { View, StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useTheme } from './src/contexts/ThemeContext';
import v2, { applyUiFontFamily } from './src/theme/v2Tokens';
import { useUiFont, nativeUiFontFamily, applyGlobalTextFont } from './src/utils/uiFontSetting';
import { bootSyncAppearance } from './src/utils/appearanceSync';

// Context
import RootNavigator from './src/navigation/RootNavigator';
import { NavigationProvider } from './src/contexts/NavigationContext';
import { StoreProvider } from './src/contexts/StoreContext';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { LessonProvider } from './src/contexts/LessonContext';
import { UserProvider } from './src/contexts/UserContext';
import { ModalProvider } from './src/contexts/ModalContext';
import { ThemeProvider } from './src/contexts/ThemeContext';
import { WorkspaceStoreProvider } from './src/contexts/WorkspaceStoreContext';
import { WorkspaceShellProvider } from './src/contexts/WorkspaceShellContext';
import UiCommandBridge from './src/workspace/UiCommandBridge';
import { IdeProjectProvider } from './src/contexts/IdeProjectContext';
import pushService from './src/services/pushService';
import { usePairDeepLink } from './src/hooks/usePairDeepLink';

// Screen
import IndexScreen from './src/screens/IndexScreen';

// import RNBootSplash from 'react-native-bootsplash';

import "./global.css"; // nativewind

const USE_TEST_NAV = false; // 테스트 네비 비활성화

function Main() {
  // 로그인되면 푸시 초기화 + 모양 설정(계정 동기화) 서버 정본 당겨오기.
  const { isLoggedIn } = useAuth();
  React.useEffect(() => {
    if (isLoggedIn) { void pushService.initPush(); void bootSyncAppearance(); }
  }, [isLoggedIn]);
  // QR 페어링 딥링크 자동승인: 폰 카메라로 PC QR(codingpt://pair?code=) 스캔 → 앱 열림 → 자동 approve.
  usePairDeepLink();
  // 테마/인터페이스 글꼴: v2 토큰(색·sans)은 제자리 교체 → key 리마운트로 전 소비처가 새 값을 읽는다
  // (전환 페이드 오버레이가 리마운트를 가린다). 상태바 아이콘도 테마 연동.
  const { resolvedScheme } = useTheme();
  const uiFont = useUiFont();
  applyUiFontFamily(nativeUiFontFamily(uiFont)); // 렌더 전 멱등 적용(v2.font.sans 소비처)
  applyGlobalTextFont(nativeUiFontFamily(uiFont)); // 전역 기본 글꼴(fontFamily 미지정 Text 포함)
  return (
    <View key={`${resolvedScheme}:${uiFont}`} style={{ flex: 1, backgroundColor: v2.colors.base }}>
      <StatusBar barStyle={resolvedScheme === 'dark' ? 'light-content' : 'dark-content'} backgroundColor="transparent" translucent={true} />
      <LessonProvider>
        <ModalProvider>
          <WorkspaceStoreProvider>
            <WorkspaceShellProvider>
              {/* 원격 ui_command 실행 브리지 — 셸 컨텍스트 안에서 상주(렌더 없음) */}
              <UiCommandBridge />
              <IdeProjectProvider>
                <IndexScreen />
              </IdeProjectProvider>
            </WorkspaceShellProvider>
          </WorkspaceStoreProvider>
        </ModalProvider>
      </LessonProvider>
    </View>
  );
}

export default function App() {
  if (USE_TEST_NAV) return <RootNavigator />;
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <UserProvider>
          <StoreProvider>
            <AuthProvider>
              <NavigationProvider>
                <Main />
              </NavigationProvider>
            </AuthProvider>
          </StoreProvider>
        </UserProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}