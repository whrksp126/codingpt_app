import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';
import BootSplash from 'react-native-bootsplash';
import { SESSION_EXPIRED_EVENT } from '../utils/api';
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

/** 서버가 토큰을 명시적으로 거절했는가(세션 없음). 상태 코드가 없으면(네트워크 실패) 거절이 아니다. */
export function isRejected(status?: number | null): boolean {
  return status === 401 || status === 403;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkLogin = async () => {
      try {
        const token = await AsyncStorage.getItem('accessToken');
        if (!token) return;

        const res = await authService.check(token);
        // 토큰을 서버가 **거절했을 때만**(401/403) 로그인 화면으로 보낸다. 네트워크 실패·5xx 는 판정 불가라
        //  로그인 상태로 두고, 이후 요청의 토큰 갱신이 영구 실패하면 SESSION_EXPIRED 가 로그아웃시킨다.
        //  (2026-09-30 실기: 앱 시작 순간 네트워크가 흔들려 verify 가 실패하자 멀쩡한 세션이 로그인 화면으로 튕겼다)
        if (res.success || !isRejected(res.status)) {
          setIsLoggedIn(true);
        }
      } catch (err) {
        console.log('자동 로그인 확인 실패(네트워크) — 세션 유지:', err);
        setIsLoggedIn(true);
      } finally {
        setLoading(false);
        BootSplash.hide({ fade: true }); // ✅ 상태 판별 끝난 후 스플래시 종료
      }
    };

    checkLogin();
  }, []);

  // 토큰 갱신이 영구 실패하면(계정 삭제·세션 폐기·만료) api.ts 가 토큰을 버리고 이 이벤트를 쏜다.
  //  화면을 로그인 상태로 두면 폴링이 계속 돌며 죽은 세션을 두들기게 되므로 즉시 로그아웃 상태로 되돌린다.
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(SESSION_EXPIRED_EVENT, () => setIsLoggedIn(false));
    return () => sub.remove();
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