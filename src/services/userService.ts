import api from '../utils/api';
import { authStorage } from '../utils/storage';

// 사용자 타입 정의
export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  joinDate: string;
  totalLessons: number;
  completedLessons: number;
  totalTime: string;
  streak: number;
}

export interface UserProfile {
  name: string;
  email: string;
  avatar?: string;
}

export interface UserStats {
  totalLessons: number;
  completedLessons: number;
  totalTime: string;
  streak: number;
  averageScore: number;
}

// 사용자 서비스 클래스
class UserService {
  // 사용자 프로필 가져오기
  async getProfile(): Promise<User | null> {
    try {
      const response = await api.user.getProfile();
      if (response.success && response.data) {
        return response.data as User;
      }
      return null;
    } catch (error) {
      console.error('프로필 가져오기 실패:', error);
      return null;
    }
  }

  // 사용자 프로필 업데이트
  async updateProfile(profile: UserProfile): Promise<boolean> {
    try {
      const response = await api.user.updateProfile(profile);
      return response.success;
    } catch (error) {
      console.error('프로필 업데이트 실패:', error);
      return false;
    }
  }

  // 사용자 통계 가져오기
  async getStats(): Promise<UserStats | null> {
    try {
      const profile = await this.getProfile();
      if (profile) {
        return {
          totalLessons: profile.totalLessons,
          completedLessons: profile.completedLessons,
          totalTime: profile.totalTime,
          streak: profile.streak,
          averageScore: 85, // TODO: 실제 평균 점수 계산
        };
      }
      return null;
    } catch (error) {
      console.error('통계 가져오기 실패:', error);
      return null;
    }
  }

  // 로그인
  async login(email: string, password: string): Promise<{ success: boolean; user?: User; error?: string }> {
    try {
      const response = await api.auth.login(email, password);
      
      if (response.success && response.data) {
        const userData = response.data as any;
        
        // 토큰 저장
        if (userData.token) {
          await authStorage.setToken(userData.token);
        }
        
        // 사용자 데이터 저장
        if (userData.user) {
          await authStorage.setUserData(userData.user);
          return { success: true, user: userData.user };
        }
      }
      
      return { success: false, error: '로그인 실패' };
    } catch (error) {
      console.error('로그인 실패:', error);
      return { success: false, error: '로그인 중 오류가 발생했습니다.' };
    }
  }

  // 회원가입
  async signup(name: string, email: string, password: string): Promise<{ success: boolean; user?: User; error?: string }> {
    try {
      const response = await api.auth.signup(name, email, password);
      
      if (response.success && response.data) {
        const userData = response.data as any;
        
        // 토큰 저장
        if (userData.token) {
          await authStorage.setToken(userData.token);
        }
        
        // 사용자 데이터 저장
        if (userData.user) {
          await authStorage.setUserData(userData.user);
          return { success: true, user: userData.user };
        }
      }
      
      return { success: false, error: '회원가입 실패' };
    } catch (error) {
      console.error('회원가입 실패:', error);
      return { success: false, error: '회원가입 중 오류가 발생했습니다.' };
    }
  }

  // 로그아웃
  async logout(): Promise<boolean> {
    try {
      // 서버에 로그아웃 요청
      await api.auth.logout();
      
      // 로컬 데이터 삭제
      await authStorage.logout();
      
      return true;
    } catch (error) {
      console.error('로그아웃 실패:', error);
      // 로컬 데이터는 삭제
      await authStorage.logout();
      return true;
    }
  }

  // 토큰 확인
  async checkAuth(): Promise<boolean> {
    try {
      const token = await authStorage.getToken();
      if (!token) {
        return false;
      }
      
      // TODO: 토큰 유효성 검증 API 호출
      return true;
    } catch (error) {
      console.error('인증 확인 실패:', error);
      return false;
    }
  }

  // 저장된 사용자 데이터 가져오기
  async getStoredUser(): Promise<User | null> {
    try {
      const userData = await authStorage.getUserData();
      return userData as User | null;
    } catch (error) {
      console.error('저장된 사용자 데이터 가져오기 실패:', error);
      return null;
    }
  }

  // 학습 시간 업데이트
  async updateLearningTime(minutes: number): Promise<boolean> {
    try {
      // TODO: 서버에 학습 시간 업데이트 API 호출
      console.log('학습 시간 업데이트:', minutes);
      return true;
    } catch (error) {
      console.error('학습 시간 업데이트 실패:', error);
      return false;
    }
  }

  // 연속 학습일 업데이트
  async updateStreak(): Promise<boolean> {
    try {
      // TODO: 서버에 연속 학습일 업데이트 API 호출
      console.log('연속 학습일 업데이트');
      return true;
    } catch (error) {
      console.error('연속 학습일 업데이트 실패:', error);
      return false;
    }
  }
}

export default new UserService(); 