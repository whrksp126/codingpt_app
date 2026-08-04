import React from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useTheme } from './src/contexts/ThemeContext';
import v2, { applyUiFontFamily } from './src/theme/v2Tokens';
import { useUiFont, nativeUiFontFamily, applyGlobalTextFont } from './src/utils/uiFontSetting';
import { bootSyncAppearance } from './src/utils/appearanceSync';
import { bootLang, useLangSetting } from './src/utils/langSetting';

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
  // 테마/인터페이스 글꼴: v2 토큰(색·sans)은 제자리 교체 + Main 재렌더 캐스케이드로 즉시 반영.
  // 리마운트(key) 금지 — 화면 상태·터미널 연결을 유지한 채 색/글꼴만 갈아입는다(전환 페이드가 스왑을 가림).
  // Main 은 useTheme/useUiFont 를 구독하므로 변경 시 재렌더되고, 하위 트리는 인라인 JSX 라 함께 재렌더된다
  // (셸에는 React.memo 가 없어 캐스케이드가 끝까지 내려감 — 새 컴포넌트에 memo 를 쓰면 테마 구독 필요).
  useTheme(); // 테마 재렌더 캐스케이드 구독(색 스왑). 상태바 제어는 ThemeContext 단일 소유.
  // 언어: 테마와 같은 재렌더 캐스케이드로 반영한다(리마운트 금지 — 터미널 연결·화면 상태 유지).
  //  문구는 전부 `i18n.t()` 를 **렌더 중에** 부르므로 다시 그리기만 하면 언어가 바뀐다.
  //  ⚠ 저장값을 읽기 전에 화면을 그리면 그 화면만 한국어로 굳는다 → 읽을 때까지 배경만 띄운다
  //   (AsyncStorage 한 번이라 체감되지 않는다. 스플래시가 이미 하는 일과 같은 성격).
  useLangSetting();
  const [langReady, setLangReady] = React.useState(false);
  React.useEffect(() => { void bootLang().finally(() => setLangReady(true)); }, []);
  const uiFont = useUiFont();
  applyUiFontFamily(nativeUiFontFamily(uiFont)); // 렌더 전 멱등 적용(v2.font.sans 소비처)
  applyGlobalTextFont(nativeUiFontFamily(uiFont)); // 전역 기본 글꼴(fontFamily 미지정 Text 포함)
  if (!langReady) return <View style={{ flex: 1, backgroundColor: v2.colors.base }} />;
  return (
    <View style={{ flex: 1, backgroundColor: v2.colors.base }}>
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