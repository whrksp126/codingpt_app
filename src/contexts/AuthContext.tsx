import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import BootSplash from 'react-native-bootsplash';
import { authService } from '../services/authService';
import purchasesService from '../services/purchasesService';
import daemonService from '../services/daemonService';

// 로그인 상태 관리 인터페이스
interface AuthContextProps {
  isLoggedIn: boolean;
  login: (accessToken: string, refreshToken: string) => Promise<void>;
  logout: () => Promise<void>;
  loading: boolean;
}

// 컨텍스트 생성
const AuthContext = createContext<AuthContextProps>({
  isLoggedIn: false,
  login: async () => {},
  logout: async () => {},
  loading: true,
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkLogin = async () => {
      try {
        const token = await AsyncStorage.getItem('accessToken');
        if (!token) return;

        const res = await authService.check(token);
        if (res.success) {
          setIsLoggedIn(true);
        }
      } catch (err) {
        console.log('자동 로그인 실패:', err);
      } finally {
        setLoading(false);
        BootSplash.hide({ fade: true }); // ✅ 상태 판별 끝난 후 스플래시 종료
      }
    };

    checkLogin();
  }, []);

  // 로그인 상태가 되면 이 기기를 컨트롤러로 등록 → 다른 기기의 "내 기기" 목록에 노출(멀티기기).
  useEffect(() => {
    if (isLoggedIn) {
      daemonService.registerController().catch(() => {});
    }
  }, [isLoggedIn]);

  const login = async (accessToken: string, refreshToken: string) => {
    await AsyncStorage.setItem('accessToken', accessToken);
    await AsyncStorage.setItem('refreshToken', refreshToken);
    setIsLoggedIn(true);
  };

  const logout = async () => {
    await authService.logout();
    await purchasesService.reset(); // RC 사용자 귀속 해제
    await AsyncStorage.multiRemove(['accessToken', 'refreshToken']);
    setIsLoggedIn(false);
  };

  return (
    <AuthContext.Provider value={{ isLoggedIn, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);