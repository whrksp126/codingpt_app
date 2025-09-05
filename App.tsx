import React, { useEffect } from 'react';
import { ActivityIndicator, View, StatusBar } from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';

// Context
import { NavigationProvider } from './src/contexts/NavigationContext';
import { StoreProvider } from './src/contexts/StoreContext';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { LessonProvider } from './src/contexts/LessonContext';
import { UserProvider } from './src/contexts/UserContext';
import { ModalProvider } from './src/contexts/ModalContext';
import { HeartsProvider } from './src/contexts/HeartContext';

// Navigation
import AuthNavigator from './src/navigation/AuthNavigator';
import AppNavigator from './src/navigation/AppNavigator';

import RNBootSplash from 'react-native-bootsplash';


import "./global.css"; // nativewind

function Main() {
  const { isLoggedIn, loading } = useAuth();

  useEffect(() => {
    console.log("App.tsx useEffect");
    RNBootSplash.hide({ fade: true });
  }, []);

  if (loading) {
    return (
      <View className="flex-1 justify-center items-center bg-white">
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      {isLoggedIn ? (
        <LessonProvider>
          <ModalProvider>
            <HeartsProvider>
              <AppNavigator />
            </HeartsProvider>
          </ModalProvider>
        </LessonProvider>
      ) : (
        <AuthNavigator />
      )}
    </SafeAreaView>
  );
}

export default function App() {
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