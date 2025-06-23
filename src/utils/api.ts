// API 기본 설정
const API_BASE_URL = 'https://api.codingpt.com'; // TODO: 실제 API URL로 변경

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
const getAuthHeaders = (): Record<string, string> => {
  const token = localStorage.getItem('authToken'); // TODO: AsyncStorage 사용
  return {
    ...getDefaultHeaders(),
    ...(token && { Authorization: `Bearer ${token}` }),
  };
};

// API 요청 함수
async function apiRequest<T>(
  endpoint: string,
  options: RequestOptions
): Promise<ApiResponse<T>> {
  try {
    const url = `${API_BASE_URL}${endpoint}`;
    const headers = options.method === 'GET' 
      ? getDefaultHeaders() 
      : getAuthHeaders();

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