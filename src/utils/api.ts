import AsyncStorage from '@react-native-async-storage/async-storage';
import Config from 'react-native-config';
// API 기본 설정
const API_URL = Config.API_URL; 

// HTTP 메서드 타입
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

// API 응답 타입
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// API 요청 옵션
interface RequestOptions {
  method: HttpMethod;
  headers?: Record<string, string>;
  body?: any;
}

// 기본 헤더
const getDefaultHeaders = (): Record<string, string> => ({
  'Content-Type': 'application/json',
  'Accept': 'application/json',
});

// 토큰을 헤더에 추가
const getAuthHeaders = async (): Promise<Record<string, string>> => {
  const token = await AsyncStorage.getItem('accessToken');
  return {
    ...getDefaultHeaders(),
    ...(token && { Authorization: `Bearer ${token}` }),
  };
};

// API 요청 함수
export async function apiRequest<T>(
  endpoint: string,
  options: RequestOptions,
  retry = true // 재시도 여부
): Promise<ApiResponse<T>> {
  try {
    const url = `${API_URL}${endpoint}`;
    const headers = await getAuthHeaders(); 

    console.log('url...', url);
    const config: RequestInit = {
      method: options.method,
      headers: {
        ...headers,
        ...options.headers,
      },
    };

    if (options.body && options.method !== 'GET') {
      config.body = JSON.stringify(options.body);
    }

    const response = await fetch(url, config);
    console.log('response...', response);
    // access token 만료 시 refresh 시도
    if (response.status === 401 && retry) {
      const newAccessToken = await refreshAccessToken();
      if (newAccessToken) {
        await AsyncStorage.setItem('accessToken', newAccessToken);
        // ✅ 기존 headers 제거 후 재시도
        const cleanedOptions: RequestOptions = {
          method: options.method,
          body: options.body,
          headers: await getAuthHeaders(), // ✅ 새 accessToken을 반영한 헤더로 갱신
        };
        console.log('cleanedOptions...', cleanedOptions);
        return apiRequest<T>(endpoint, cleanedOptions, false); // 한 번만 재시도
      }
    }

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'API 요청 실패');
    }

    return {
      success: true,
      data,
    };
  } catch (error) {
    console.error('API 요청 오류:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '알 수 없는 오류',
    };
  }
}

// refreshToken으로 accessToken 재발급
async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = await AsyncStorage.getItem('refreshToken');
  if (!refreshToken) return null;

  try {
    const res = await fetch(`${API_URL}/api/users/refresh`, {
      method: 'POST',
      headers: getDefaultHeaders(),
      body: JSON.stringify({ refreshToken }),
    });

    if (!res.ok) throw new Error('재발급 실패');

    const data = await res.json();
    return data.accessToken; // 새 토큰 반환
  } catch (err) {
    console.error('accessToken 재발급 실패:', err);
    return null;
  }
}

// 인증 관련: 로그인 여부 확인 함수
export const checkLoggedIn = async (): Promise<{ loggedIn: boolean; userId?: number }> => {
  const token = await AsyncStorage.getItem('accessToken');
  if (!token) return { loggedIn: false };

  const res = await api.auth.check(token);
  if (res.success && res.data?.id) {
    return { loggedIn: true, userId: res.data.id };
  }

  return { loggedIn: false };
};

// API 함수들
export const api = {
  // 인증 관련
  auth: {
    check: (token: string) =>
      apiRequest<{ id: number }>('/api/users/verify', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
  },

  // 상점 관련
  stores: {
    getAll: () =>
      apiRequest('/api/store', {
        method: 'GET',
      })
  },

  // 강의 관련
  lessons: {
    getAll: () =>
      apiRequest('/lessons', {
        method: 'GET',
      }),
    
    getById: (id: number) =>
      apiRequest(`/api/myclass/${id}`, {
        method: 'GET',
      }),
    
    getProgress: (lessonId: string) =>
      apiRequest(`/lessons/${lessonId}/progress`, {
        method: 'GET',
      }),
    
    updateProgress: (lessonId: string, progress: number) =>
      apiRequest(`/lessons/${lessonId}/progress`, {
        method: 'PUT',
        body: { progress },
      }),
  },

  // 내 강의 관련
  myclass: {
    checkEnrolled: (userId: number, productId: number) =>
      apiRequest(`/api/myclass/check?user_id=${userId}&product_id=${productId}`, {
        method: 'GET',
    }),

    getAllMyclass: (userId: number) =>
      apiRequest(`/api/myclass/${userId}`, {
        method: 'GET',
    }),

    postMyclass: (data: any) =>
      apiRequest(`/api/myclass`, {
        method: 'POST',
        body: data,
    }),
  },

  // 사용자 관련
  user: {
    getProfile: () =>
      apiRequest('/user/profile', {
        method: 'GET',
      }),
    
    updateProfile: (data: any) =>
      apiRequest('/user/profile', {
        method: 'PUT',
        body: data,
      }),
  },
};

export default api;