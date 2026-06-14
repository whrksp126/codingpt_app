import AsyncStorage from '@react-native-async-storage/async-storage';
import { BACK_URL } from './service';


// HTTP 메서드 타입
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

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
    const url = `${BACK_URL}${endpoint}`;
    console.log('API 요청 URL:', url);
    // console.log('API 요청 메서드:', options.method);
    // console.log('API 요청 바디:', options.body);

    const headers = await getAuthHeaders();
    // console.log('API 요청 헤더:', headers);

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
    // console.log('API 응답 상태:', response.status, response.statusText);
    // console.log('API 응답 헤더:', Object.fromEntries(response.headers.entries()));

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
        return apiRequest<T>(endpoint, cleanedOptions, false); // 한 번만 재시도
      }
    }

    const data = await response.json();
    console.log('API 응답 데이터:', data);

    if (!response.ok) {
      console.error('API 요청 실패:', {
        status: response.status,
        statusText: response.statusText,
        data: data,
      });
      throw new Error(data.message || `HTTP ${response.status}: ${response.statusText}`);
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
    const res = await fetch(`${BACK_URL}/api/users/refresh`, {
      method: 'POST',
      headers: getDefaultHeaders(),
      body: JSON.stringify({ refreshToken }),
    });

    if (!res.ok) throw new Error('재발급 실패');

    const data = await res.json();
    const newAccessToken = data.accessToken;
    const newRefreshToken = data.refreshToken;

    if (newAccessToken) {
      await AsyncStorage.setItem('accessToken', newAccessToken);
    }
    if (newRefreshToken) {
      await AsyncStorage.setItem('refreshToken', newRefreshToken);
    }

    return newAccessToken; // 새 토큰 반환
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

  // GitHub 연동
  github: {
    // 인가 URL 발급 (WebView 로 열기)
    getAuthorizeUrl: () =>
      apiRequest<{ authorizeUrl: string }>('/api/github/authorize', {
        method: 'GET',
      }),
    // 연동 상태 조회
    getStatus: () =>
      apiRequest<{ connected: boolean; login?: string; avatarUrl?: string; connectedAt?: string }>(
        '/api/github/status',
        { method: 'GET' },
      ),
    // 연동 해제
    disconnect: () =>
      apiRequest('/api/github/disconnect', {
        method: 'DELETE',
      }),
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
      apiRequest('/api/lessons', {
        method: 'GET',
      }),

    getSlidesByLesson: () => // test
      apiRequest('/api/lesson/slides', {
        method: 'GET',
      }),

    // RN 학습자용: 백엔드 DB에서 레슨 runtime 데이터 조회
    getLessonRuntime: (lessonId: number) =>
      apiRequest(`/api/lesson/runtime/${lessonId}`, {
        method: 'GET',
      }),

    getById: (id: number) =>
      apiRequest(`/api/myclass/${id}`, {
        method: 'GET',
      }),

    getProgress: (lessonId: string) =>
      apiRequest(`/api/lessons/${lessonId}/progress`, {
        method: 'GET',
      }),

    updateProgress: (lessonId: string, progress: number) =>
      apiRequest(`/api/lessons/${lessonId}/progress`, {
        method: 'PUT',
        body: { progress },
      }),

    getSlideCodeFillContent: (slideId: number) =>
      apiRequest<Array<{ content: string; id: number; slide_id: number }>>(`/api/lesson/slides/${slideId}/code-fill-gaps`, {
        method: 'GET',
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

    // 레슨 완료 + 결과 저장
    complete: (payload: {
      user_id: number;
      myclass_id: number;
      lesson_id: number;
      result: any;
    }) =>
      apiRequest(`/api/myclass/complete`, {
        method: 'PATCH',
        body: payload,
      }),

    // 학습 결과 조회
    getLessonResult: (userId: number, lessonId: number) =>
      apiRequest(`/api/myclass/${userId}/lesson/${lessonId}/result`, {
        method: 'GET',
      }),
  },

  // 사용자 관련
  user: {
    getMe: () =>
      apiRequest('/api/users/me', {
        method: 'GET',
      }),

    getProfile: () =>
      apiRequest('/api/users/profile', {
        method: 'GET',
      }),

    updateProfile: (data: any) =>
      apiRequest('/api/users/profile', {
        method: 'PUT',
        body: data,
      }),

    getStudyHeatmap: () =>
      apiRequest<Record<string, number>>(`/api/users/heatmap`, {
        method: 'GET',
      }),

    getTotalStudyDays: () =>
      apiRequest<{ success: boolean; data: number }>(`/api/users/study-days`, {
        method: 'GET',
      }),

    postStudyHeatmap: (payload: { user_id: number; product_id: number; section_id?: number; lesson_id: number }) =>
      apiRequest(`/api/users/heatmap`, {
        method: 'POST',
        body: payload,
      }),

    updateXp: (userId: number, xp: number) =>
      apiRequest(`/api/users/${userId}/xp`, {
        method: 'PATCH',
        body: { xp: xp },
      }),

    getAchievements: () =>
      apiRequest<Array<{ code: string; unlocked: boolean }>>('/api/users/achievements', {
        method: 'GET',
      }),
  },

  // 상품 후기 관련
  reviews: {
    // 특정 상품의 후기 목록 조회
    getByProductId: (productId: number) =>
      apiRequest<any>(`/api/reviews/product/${productId}`, {
        method: 'GET',
      }),

    // 내가 작성한 후기 목록 조회(mypage)
    getMyReviews: () =>
      apiRequest<any>('/api/reviews/my', {
        method: 'GET',
      }),

    // 후기 작성
    create: (data: { product_id: number; score: number; review_text: string }) =>
      apiRequest<any>('/api/reviews', {
        method: 'POST',
        body: data,
      }),

    // 후기 수정
    update: (reviewId: number, data: { score: number; review_text: string }) =>
      apiRequest<any>(`/api/reviews/${reviewId}`, {
        method: 'PUT',
        body: data,
      }),

    // 후기 삭제
    delete: (reviewId: number) =>
      apiRequest<any>(`/api/reviews/${reviewId}`, {
        method: 'DELETE',
      }),
  },

  // 코드 실행 관련
  executor: {
    /**
     * 코드 실행 SSE 스트리밍 요청 (로우 레벨 통신만 담당)
     */
    executeStream: async (
      data: { code: string; language: string; debug?: boolean },
      onStateChange: (xhr: XMLHttpRequest) => void,
      onError?: (error: any) => void
    ) => {
      try {
        const url = `${BACK_URL}/api/executor/execute`;
        const headers = await getAuthHeaders();

        const xhr = new XMLHttpRequest();
        xhr.open('POST', url);

        // 헤더 설정
        Object.entries(headers).forEach(([key, value]) => {
          xhr.setRequestHeader(key, value);
        });

        xhr.onreadystatechange = () => onStateChange(xhr);
        xhr.onerror = (e) => onError?.(e);

        xhr.send(JSON.stringify(data));
        return xhr;
      } catch (error) {
        console.error('SSE 스트림 요청 오류:', error);
        onError?.(error);
      }
    }
  },

  // 바이브코딩 에이전트 관련
  agent: {
    /**
     * 에이전트 질의 SSE 스트리밍 요청 (로우 레벨 통신만 담당)
     * body: { prompt, sessionId?, model? }
     */
    queryStream: async (
      data: { prompt: string; sessionId?: string; model?: string },
      onStateChange: (xhr: XMLHttpRequest) => void,
      onError?: (error: any) => void,
    ) => {
      try {
        const url = `${BACK_URL}/api/agent/query`;
        const headers = await getAuthHeaders();

        const xhr = new XMLHttpRequest();
        xhr.open('POST', url);
        Object.entries(headers).forEach(([key, value]) => {
          xhr.setRequestHeader(key, value);
        });
        xhr.onreadystatechange = () => onStateChange(xhr);
        xhr.onerror = (e) => onError?.(e);

        xhr.send(JSON.stringify(data));
        return xhr;
      } catch (error) {
        console.error('Agent SSE 스트림 요청 오류:', error);
        onError?.(error);
      }
    },
  },
};

export default api;