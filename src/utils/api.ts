import AsyncStorage from '@react-native-async-storage/async-storage';

// API 기본 설정
//const API_BASE_URL = 'https://api.codingpt.com'; // TODO: 실제 API URL로 변경
const API_BASE_URL = 'http://10.0.2.2:3000'; // TODO: 실제 API URL로 변경

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
  console.log('[DEBUG] 가져온 accessToken:', typeof token, token);

  return {
    ...getDefaultHeaders(),
    ...(token && { Authorization: `Bearer ${token}` }),
  };
};

// API 요청 함수
async function apiRequest<T>(
  endpoint: string,
  options: RequestOptions,
  retry = true // 재시도 여부
): Promise<ApiResponse<T>> {
  try {
    const url = `${API_BASE_URL}${endpoint}`;
    console.log('재시도가 되었는지 확인', url);
    const headers = await getAuthHeaders(); // 비동기 처리
    // const headers = options.method === 'GET' 
    //   ? getDefaultHeaders() 
    //   : getAuthHeaders();

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
    console.log('받은 응답값 좀 보자', response);

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
        console.log('[재시도 요청] headers.Authorization:', cleanedOptions.headers?.Authorization);
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
    const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: getDefaultHeaders(),
      body: JSON.stringify({ refreshToken }),
    });

    if (!res.ok) throw new Error('재발급 실패');

    const data = await res.json();
    console.log('백엔드에서 재발급 요청하고 받은 데이터: ', data);
    console.log('accessToken 재발급 완료: ', data.accessToken);
    return data.accessToken; // 새 토큰 반환
  } catch (err) {
    console.error('accessToken 재발급 실패:', err);
    return null;
  }
}

// API 함수들
export const api = {
  // 인증 관련
  auth: {
    login: (email: string, password: string) =>
      apiRequest('/auth/login', {
        method: 'POST',
        body: { email, password },
      }),
    
    signup: (name: string, email: string, password: string) =>
      apiRequest('/auth/signup', {
        method: 'POST',
        body: { name, email, password },
      }),
    
    logout: () =>
      apiRequest('/auth/logout', {
        method: 'POST',
      }),

    check: () =>
      apiRequest('/auth/me', {
        method: 'GET',
      })
  },

  // 강의 관련
  lessons: {
    getAll: () =>
      apiRequest('/lessons', {
        method: 'GET',
      }),
    
    getById: (id: string) =>
      apiRequest(`/lessons/${id}`, {
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