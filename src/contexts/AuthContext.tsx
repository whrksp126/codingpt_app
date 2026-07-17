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
export const AuthContext = createContext<AuthContextProps>({
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

  // 현재 기기 로그아웃 — 서버/RC 호출이 실패하더라도(오프라인·미구성 등) 로컬 세션 정리와
  // isLoggedIn=false 는 반드시 수행되어야 한다. 각 원격 부수효과를 개별 try/catch 로 격리한다.
  // (과거: authService.logout() 나 purchasesService.reset() 에서 throw 시 토큰 삭제·상태 전환이
  //  통째로 건너뛰어져 "로그아웃이 안 되는" 버그가 있었음.)
  const logout = async () => {
    try { await authService.logout(); } catch (e) { console.log('서버 로그아웃 실패(무시):', e); }
    try { await purchasesService.reset(); } catch (e) { console.log('RC 리셋 실패(무시):', e); }
    try { await AsyncStorage.multiRemove(['accessToken', 'refreshToken']); } catch (e) { console.log('토큰 삭제 실패(무시):', e); }
    setIsLoggedIn(false);
  };

  return (
    <AuthContext.Provider value={{ isLoggedIn, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);