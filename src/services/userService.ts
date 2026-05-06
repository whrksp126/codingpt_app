import api from '../utils/api';
import { authStorage } from '../utils/storage';

// 사용자 타입 정의
// export interface User {
//   id: string;
//   name: string;
//   email: string;
//   avatar?: string;
//   joinDate: string;
//   totalLessons: number;
//   completedLessons: number;
//   totalTime: string;
//   streak: number;
// }
export interface User {
  id: number;
  email: string;
  created_at: string;
  profile_img: string | null;
  nickname: string;
  xp: number;
  heatmap?: Record<string, number>; // ✅ 히트맵 데이터 추가
  studyDays?: number; // ✅ 총 학습일수 추가
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
  // 사용자 정보 가져오기
  async getMe(): Promise<User | null> {
    try {
      const response = await api.user.getMe();
      const userData = response.data as User;
      return userData;
    } catch (error) {
      console.error('❌ [userService] 사용자 정보 가져오기 실패:', error);
      return null;
    }
  }

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
  // async getStats(): Promise<UserStats | null> {
  //   try {
  //     const profile = await this.getProfile();
  //     if (profile) {
  //       return {
  //         totalLessons: profile.totalLessons,
  //         completedLessons: profile.completedLessons,
  //         totalTime: profile.totalTime,
  //         streak: profile.streak,
  //         averageScore: 85, // TODO: 실제 평균 점수 계산
  //       };
  //     }
  //     return null;
  //   } catch (error) {
  //     console.error('통계 가져오기 실패:', error);
  //     return null;
  //   }
  // }

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
      return true;
    } catch (error) {
      console.error('연속 학습일 업데이트 실패:', error);
      return false;
    }
  }

  // 사용자 학습 heatmap 데이터 가져오기
  async getStudyHeatmap(): Promise<Record<string, number>> {
    try {
      const response = await api.user.getStudyHeatmap();
      const heatmapArray = response.data?.data;

      if (response.success && Array.isArray(heatmapArray)) {
        // 배열을 Record<string, number>로 변환
        const result: Record<string, number> = {};
        heatmapArray.forEach(({ date, count }) => {
          result[date] = count;
        });
        return result;
      }

      return {};
    } catch (error) {
      console.error('❌ [userService] Heatmap 데이터 가져오기 실패:', error);
      return {};
    }
  }

  // 누적 학습일수 조회 (전체 기간)
  async getTotalStudyDays(): Promise<number> {
    try {
      const response = await api.user.getTotalStudyDays();
      const studyDays = response.data?.data;
      if (response.success && typeof studyDays === 'number') {
        return studyDays;
      }
      return 0;
    } catch (error) {
      console.error('❌ [userService] 학습일수 조회 실패:', error);
      return 0;
    }
  }

  // 사용자 학습 heatmap 데이터 저장
  async postStudyHeatmap(params: { userId: number; productId: number; sectionId: number; lessonId: number }): Promise<any> {
    try {
      const response = await api.user.postStudyHeatmap({
        user_id: params.userId,
        product_id: params.productId,
        section_id: params.sectionId,
        lesson_id: params.lessonId,
      });
      console.log("Heatmap 데이터 저장 response,", response);
      if (response.success && response.data) {
        return response.data;
      }
      return false;
    }
    catch (error) {
      console.error('❌ [userService] Heatmap 데이터 저장 실패:', error);
      return false;
    }
  }

  // 사용자 경험치(XP) 업데이트
  async updateXp(userId: number, xp: number): Promise<any> {
    try {
      console.log("XP 업데이트 data,", xp);
      const response = await api.user.updateXp(userId, xp);
      console.log("XP 업데이트 response,", response);
      return response.data;
    } catch (error) {
      console.error('❌ [userService] 경험치 업데이트 실패:', error);
      return false;
    }
  }

  // 업적 조회 (카테고리별 심화 레슨 1개라도 완료 시 unlocked)
  async getAchievements(): Promise<Array<{ code: string; unlocked: boolean }>> {
    try {
      const response = await api.user.getAchievements();
      const data = (response as any)?.data?.data ?? (response as any)?.data;
      if (Array.isArray(data)) return data;
      return [];
    } catch (error) {
      console.error('❌ [userService] 업적 조회 실패:', error);
      return [];
    }
  }
}

export default new UserService();