import React from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';

// Context
import TestRootNavigator from './src/navigation/TestNavigator';
import { NavigationProvider } from './src/contexts/NavigationContext';
import { StoreProvider } from './src/contexts/StoreContext';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { LessonProvider } from './src/contexts/LessonContext';
import { UserProvider } from './src/contexts/UserContext';
import { ModalProvider } from './src/contexts/ModalContext';
import { HeartsProvider } from './src/contexts/HeartContext';

// Screen
import IndexScreen from './src/screens/IndexScreen';

// import RNBootSplash from 'react-native-bootsplash';

import "./global.css"; // nativewind

const USE_TEST_NAV = true; // ✅ 테스트 끝나면 false로 끄고 기존 네비로 전환

function Main() {
  return (
    <SafeAreaView className="flex-1 bg-white">
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      <LessonProvider>
        <ModalProvider>
          <HeartsProvider>
            <IndexScreen />
          </HeartsProvider>
        </ModalProvider>
      </LessonProvider>
    </SafeAreaView>
  );
}

export default function App() {
  if (USE_TEST_NAV) return <TestRootNavigator />;
  return (
    <SafeAreaProvider>
      <UserProvider>
        <StoreProvider>
          <AuthProvider>
            <NavigationProvider>
              <Main />
            </NavigationProvider>
          </AuthProvider>
        </StoreProvider>
      </UserProvider>
    </SafeAreaProvider>
  );
}