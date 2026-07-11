import React from 'react';
import { View, StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useTheme } from './src/contexts/ThemeContext';

// Context
import RootNavigator from './src/navigation/RootNavigator';
import { NavigationProvider } from './src/contexts/NavigationContext';
import { StoreProvider } from './src/contexts/StoreContext';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { LessonProvider } from './src/contexts/LessonContext';
import { UserProvider } from './src/contexts/UserContext';
import { ModalProvider } from './src/contexts/ModalContext';
import { ThemeProvider } from './src/contexts/ThemeContext';
import { AgentSessionProvider } from './src/contexts/AgentSessionContext';
import { WorkspaceStoreProvider } from './src/contexts/WorkspaceStoreContext';
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
  // 앱 셸은 다크 모던 고정 → 루트 배경 다크 + 상태바 아이콘 밝게(다크 배경에 보이도록).
  return (
    <View style={{ flex: 1, backgroundColor: '#0A0D14' }}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent={true} />
      <LessonProvider>
        <ModalProvider>
          <WorkspaceStoreProvider>
            <AgentSessionProvider>
              <IdeProjectProvider>
                <IndexScreen />
              </IdeProjectProvider>
            </AgentSessionProvider>
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