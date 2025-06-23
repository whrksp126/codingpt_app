import React, { useState } from 'react';
import { SafeAreaView, StyleSheet } from 'react-native';
import { AuthProvider } from './src/contexts/AuthContext';
import { LessonProvider } from './src/contexts/LessonContext';

// Navigation
import AuthNavigator from './src/navigation/AuthNavigator';
import AppNavigator from './src/navigation/AppNavigator';

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const handleLoginSuccess = () => {
    setIsLoggedIn(true);
  };

  return (
    <AuthProvider>
      <LessonProvider>
        <SafeAreaView style={styles.container}>
          {isLoggedIn ? (
            <AppNavigator />
          ) : (
            <AuthNavigator onLoginSuccess={handleLoginSuccess} />
          )}
        </SafeAreaView>
      </LessonProvider>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
});

export default App;
