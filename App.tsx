import React, { useState } from 'react';
import { SafeAreaView } from 'react-native';
import { AuthProvider } from './src/contexts/AuthContext';
import { LessonProvider } from './src/contexts/LessonContext';
import { UserProvider } from './src/contexts/UserContext';
import "./global.css"; // nativewind

// Navigation
import AuthNavigator from './src/navigation/AuthNavigator';
import AppNavigator from './src/navigation/AppNavigator';


function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const handleLoginSuccess = () => {
    setIsLoggedIn(true);
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
  };

  return (
    <UserProvider>
      <AuthProvider>
        <LessonProvider>
          <SafeAreaView className="flex-1 bg-gray-50">
            {isLoggedIn ? (
              <AppNavigator onLogout={handleLogout} />
            ) : (
              <AuthNavigator onLoginSuccess={handleLoginSuccess} />
            )}
          </SafeAreaView>
        </LessonProvider>
      </AuthProvider>
    </UserProvider>
  );
}

export default App;

// export default function App() {
//   return <Myclass />;
// }