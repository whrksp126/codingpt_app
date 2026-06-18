import React, { createContext, useState, useContext, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { User } from '../services/userService';
import userService from '../services/userService'; // 👈 서버에서 user 조회용 API 필요
import purchasesService from '../services/purchasesService';

interface UserContextType {
  user: User | null;
  setUser: (user: User | null | ((prev: User | null) => User | null)) => void;
  loading: boolean;
  refreshUser: () => Promise<void>; // 👈 상태 갱신용 함수 추가
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = async () => {
    try {
      const userInfo = await userService.getMe(); // 사용자 정보
      
      if (userInfo) {
        const [heatmap, studyDays] = await Promise.all([
          userService.getStudyHeatmap(), // 잔디 (최근 6개월)
          userService.getTotalStudyDays(), // 누적 학습일수 (전체 기간)
        ]);
        const finalUserData = { ...userInfo, heatmap, studyDays };

        setUser(finalUserData);
        // RC 인앱 구독을 우리 user.id 에 귀속(웹훅 app_user_id 매칭). IAP 비활성이면 no-op.
        purchasesService.identify(finalUserData.id);
      } else {
        setUser(null);
      }
    } catch (e) {
      console.warn('⚠️ [UserContext] 유저 정보 갱신 실패:', e);
      setUser(null);
    }
  };

  // user 상태 변경 추적
  useEffect(() => {

  }, [user]);

  useEffect(() => {
    (async () => {
      await refreshUser();
      setLoading(false);
    })();
  }, []);

  return (
    <UserContext.Provider value={{ user, setUser, loading, refreshUser }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = (): UserContextType => {
  const context = useContext(UserContext);
  if (!context) throw new Error('useUser must be used within a UserProvider');
  return context;
};