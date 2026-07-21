import React from 'react';
import { View, StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useTheme } from './src/contexts/ThemeContext';
import v2 from './src/theme/v2Tokens';

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
  // 로그인되면 푸시 초기화(M3-3 선골격: 현재 no-op, 네이티브 messaging 연동 후 토큰 등록 수행).
  const { isLoggedIn } = useAuth();
  React.useEffect(() => { if (isLoggedIn) void pushService.initPush(); }, [isLoggedIn]);
  // QR 페어링 딥링크 자동승인: 폰 카메라로 PC QR(codingpt://pair?code=) 스캔 → 앱 열림 → 자동 approve.
  usePairDeepLink();
  // 테마: v2 토큰 팔레트는 ThemeProvider 가 제자리 교체 → key 리마운트로 전 소비처가 새 값을 읽는다
  // (전환 페이드 오버레이가 리마운트를 가린다). 상태바 아이콘도 테마 연동.
  const { resolvedScheme } = useTheme();
  return (
    <View key={resolvedScheme} style={{ flex: 1, backgroundColor: v2.colors.base }}>
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