// AsyncStorage를 사용한 로컬 스토리지 유틸리티
import AsyncStorage from '@react-native-async-storage/async-storage';

const USER_DATA_KEY = 'userData';

// 사용자 데이터 인터페이스 정의
export interface User {
  id: number;
  email: string;
  created_at: string;
  profile_img: string | null;
  nickname: string;
  xp: number;
  heart: number;
}

export const AuthStorage = {
  /**
   * 사용자 데이터 저장 (객체는 JSON 문자열로 변환하여 저장)
   * @param {User} userData - 저장할 사용자 데이터 객체
   */
  setUserData: async (userData: User) => {
    try {
      await AsyncStorage.setItem(USER_DATA_KEY, JSON.stringify(userData));
    } catch (error) {
      console.error('Error saving user data:', error);
    }
  },

  /**
   * 사용자 데이터 가져오기 (JSON 문자열을 객체로 변환)
   * @returns {Promise<User | null>} - 저장된 사용자 데이터 객체 또는 null
   */
  getUserData: async (): Promise<User | null> => {
    try {
      const jsonValue = await AsyncStorage.getItem(USER_DATA_KEY);
      return jsonValue != null ? JSON.parse(jsonValue) : null;
    } catch (error) {
      console.error('Error getting user data:', error);
      return null;
    }
  },

  /**
   * 사용자 데이터 삭제 (로그아웃 시)
   */
  clearUserData: async () => {
    try {
      await AsyncStorage.removeItem(USER_DATA_KEY);
    } catch (error) {
      console.error('Error clearing user data:', error);
    }
  }
}

// 스토리지 키 상수
export const STORAGE_KEYS = {
  AUTH_TOKEN: 'authToken',
  USER_DATA: 'userData',
  LESSON_PROGRESS: 'lessonProgress',
  SETTINGS: 'settings',
  RECENT_LESSONS: 'recentLessons',
} as const;

// 기본 스토리지 함수들 (AsyncStorage 설치 전 임시 구현)
export const storage = {
  // 데이터 저장
  setItem: async (key: string, value: any): Promise<void> => {
    try {
      // TODO: AsyncStorage.setItem(key, JSON.stringify(value)) 사용
      console.log('Storage setItem:', key, value);
    } catch (error) {
      console.error('Storage setItem error:', error);
      throw error;
    }
  },

  // 데이터 가져오기
  getItem: async <T>(key: string): Promise<T | null> => {
    try {
      // TODO: const value = await AsyncStorage.getItem(key) 사용
      console.log('Storage getItem:', key);
      return null;
    } catch (error) {
      console.error('Storage getItem error:', error);
      return null;
    }
  },

  // 데이터 삭제
  removeItem: async (key: string): Promise<void> => {
    try {
      // TODO: AsyncStorage.removeItem(key) 사용
      console.log('Storage removeItem:', key);
    } catch (error) {
      console.error('Storage removeItem error:', error);
      throw error;
    }
  },

  // 모든 데이터 삭제
  clear: async (): Promise<void> => {
    try {
      // TODO: AsyncStorage.clear() 사용
      console.log('Storage clear');
    } catch (error) {
      console.error('Storage clear error:', error);
      throw error;
    }
  },
};

// 인증 관련 스토리지 함수들
export const authStorage = {
  // 토큰 저장
  setToken: (token: string) => storage.setItem(STORAGE_KEYS.AUTH_TOKEN, token),
  
  // 토큰 가져오기
  getToken: () => storage.getItem<string>(STORAGE_KEYS.AUTH_TOKEN),
  
  // 토큰 삭제
  removeToken: () => storage.removeItem(STORAGE_KEYS.AUTH_TOKEN),
  
  // 사용자 데이터 저장
  setUserData: (userData: any) => storage.setItem(STORAGE_KEYS.USER_DATA, userData),
  
  // 사용자 데이터 가져오기
  getUserData: () => storage.getItem(STORAGE_KEYS.USER_DATA),
  
  // 사용자 데이터 삭제
  removeUserData: () => storage.removeItem(STORAGE_KEYS.USER_DATA),
  
  // 로그아웃 (모든 인증 데이터 삭제)
  logout: async () => {
    await authStorage.removeToken();
    await authStorage.removeUserData();
  },
};

// 강의 진행률 관련 스토리지 함수들
export const lessonStorage = {
  // 강의 진행률 저장
  setProgress: (lessonId: string, progress: number) => {
    return storage.setItem(`${STORAGE_KEYS.LESSON_PROGRESS}_${lessonId}`, progress);
  },
  
  // 강의 진행률 가져오기
  getProgress: (lessonId: string) => {
    return storage.getItem<number>(`${STORAGE_KEYS.LESSON_PROGRESS}_${lessonId}`);
  },
  
  // 모든 강의 진행률 가져오기
  getAllProgress: async () => {
    // TODO: AsyncStorage.getAllKeys()와 AsyncStorage.multiGet() 사용
    return {};
  },
  
  // 최근 학습한 강의 저장
  setRecentLesson: (lessonId: string) => {
    return storage.getItem<string[]>(STORAGE_KEYS.RECENT_LESSONS).then((recent) => {
      const recentLessons = recent || [];
      const updated = [lessonId, ...recentLessons.filter(id => id !== lessonId)].slice(0, 10);
      return storage.setItem(STORAGE_KEYS.RECENT_LESSONS, updated);
    });
  },
  
  // 최근 학습한 강의 가져오기
  getRecentLessons: () => {
    return storage.getItem<string[]>(STORAGE_KEYS.RECENT_LESSONS);
  },
};

// 설정 관련 스토리지 함수들
export const settingsStorage = {
  // 설정 저장
  setSettings: (settings: any) => storage.setItem(STORAGE_KEYS.SETTINGS, settings),
  
  // 설정 가져오기
  getSettings: () => storage.getItem(STORAGE_KEYS.SETTINGS),
  
  // 특정 설정 업데이트
  updateSetting: async (key: string, value: any) => {
    const settings = await settingsStorage.getSettings() || {};
    (settings as any)[key] = value;
    return settingsStorage.setSettings(settings);
  },
};

export default AuthStorage;