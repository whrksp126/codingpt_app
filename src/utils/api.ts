import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';
import { BACK_URL } from './service';
import type { UsageStatus, SubscriptionPlan, SubscriptionInfo, PaymentReceipt } from '../types/billing';
import * as i18n from '../i18n/index.ts';


// HTTP 메서드 타입
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

// API 응답 타입
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  // 서버가 실어 준 구조화 실패 코드(errorResponse 의 publicDetail.code 또는 본문 code).
  //  ★ 문구(정규식)로 실패를 판정하지 않기 위한 채널이다 — 예: LAN 직결은 LAN_UNSUPPORTED /
  //    LAN_HOST_OFFLINE 를 코드로 구분해야 "호스트 오프라인" 오탐을 만들지 않는다.
  //  구 서버는 안 보내므로 undefined(기존 호출측은 이 필드를 읽지 않아 무영향).
  code?: string;
  status?: number;
}

// API 요청 옵션
interface RequestOptions {
  method: HttpMethod;
  headers?: Record<string, string>;
  body?: any;
  // 예상 가능한 실패(예: 없는 파일 읽기)에서 콘솔 에러 소음을 억제. 반환값은 그대로 {success:false}.
  silent?: boolean;
  // 요청 타임아웃(ms) — 릴레이/네트워크가 응답을 유실하면 fetch 가 무기한 매달리므로(터미널 로딩
  //  수 분 고착) 짧게 실패시키고 호출측 재시도에 맡긴다.
  timeoutMs?: number;
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

    let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
    if (options.timeoutMs) {
      const ctrl = new AbortController();
      config.signal = ctrl.signal;
      timeoutTimer = setTimeout(() => ctrl.abort(), options.timeoutMs);
    }
    let response: Response;
    try {
      response = await fetch(url, config);
    } finally {
      if (timeoutTimer) clearTimeout(timeoutTimer);
    }
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
      if (!options.silent) console.error('API 요청 실패:', {
        status: response.status,
        statusText: response.statusText,
        data: data,
      });
      // 구조화 코드(있으면)를 Error 에 붙여 catch 로 넘긴다 — 문구 파싱 대신 코드 분기용(additive).
      throw Object.assign(new Error(data.message || `HTTP ${response.status}: ${response.statusText}`), {
        code: typeof data?.code === 'string' ? data.code : (typeof data?.detail?.code === 'string' ? data.detail.code : undefined),
        status: response.status,
      });
    }

    return {
      success: true,
      data,
    };
  } catch (error) {
    if (!options.silent) console.error('API 요청 오류:', error);
    const anyErr = error as { code?: unknown; status?: unknown };
    return {
      success: false,
      error: error instanceof Error ? error.message : i18n.t('알 수 없는 오류'),
      ...(typeof anyErr?.code === 'string' ? { code: anyErr.code } : {}),
      ...(typeof anyErr?.status === 'number' ? { status: anyErr.status } : {}),
    };
  }
}

// 세션이 끝났음(재로그인 필요)을 앱 전역에 알리는 채널 — AuthContext 가 받아서 로그인 화면으로 되돌린다.
export const SESSION_EXPIRED_EVENT = 'cptSessionExpired';

// 갱신 중복 억제와 429 쿨다운.
//  ★ 2026-09-07 사고: 계정이 삭제돼 refresh 가 영구 실패하는데도 401 을 받은 호출부 6곳이
//    각자 재발급을 때려 분당 40여 건이 나갔고, /login 과 한 버킷이던 레이트리밋이 타서
//    같은 IP 의 PC 가 로그인조차 못 했다. 방어는 세 겹이다 —
//    (1) single-flight: 동시에 열 곳이 불러도 실제 요청은 1건
//    (2) 영구 실패면 저장된 토큰을 버린다 → 이후 호출은 아래 !refreshToken 에서 즉시 끝나 네트워크를 안 쓴다
//    (3) 429 면 Retry-After 만큼 아예 요청하지 않는다(불난 집에 부채질 금지)
let refreshInFlight: Promise<string | null> | null = null;
let refreshBlockedUntil = 0;

// 이 기기의 세션을 끝낸다 — 토큰을 지우는 게 핵심이다(재시도 루프를 구조적으로 끊는다).
async function endSession(reason: string): Promise<void> {
  console.warn('세션 종료 — 재로그인 필요:', reason);
  refreshBlockedUntil = 0;
  try { await AsyncStorage.multiRemove(['accessToken', 'refreshToken']); } catch (e) { /* 지워지지 않아도 계속 */ }
  try { DeviceEventEmitter.emit(SESSION_EXPIRED_EVENT, { reason }); } catch (e) { /* 리스너 없음 */ }
}

async function doRefreshAccessToken(): Promise<string | null> {
  const refreshToken = await AsyncStorage.getItem('refreshToken');
  if (!refreshToken) return null;
  if (Date.now() < refreshBlockedUntil) return null; // 쿨다운 중엔 요청 자체를 만들지 않는다

  let res: Response;
  try {
    res = await fetch(`${BACK_URL}/api/users/refresh`, {
      method: 'POST',
      headers: getDefaultHeaders(),
      body: JSON.stringify({ refreshToken }),
    });
  } catch (err) {
    console.error('accessToken 재발급 실패(네트워크):', err); // 오프라인 — 토큰은 그대로 두고 다음 기회에
    return null;
  }

  if (res.status === 429) {
    const retryAfter = Number(res.headers.get('retry-after'));
    refreshBlockedUntil = Date.now() + (Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 60000);
    console.warn('재발급 레이트리밋 — 쿨다운(초):', Math.round((refreshBlockedUntil - Date.now()) / 1000));
    return null;
  }

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const code = body?.detail?.code || body?.code;
    // 영구 실패(계정 삭제·세션 폐기·위조·만료) — 몇 번을 더 보내도 결과가 같다. 세션을 끝낸다.
    if (res.status === 401 || res.status === 403 || code === 'REFRESH_INVALID') {
      await endSession(`refresh ${res.status}${code ? ` ${code}` : ''}`);
      return null;
    }
    // 그 외(400/5xx)는 일시 실패로 보고 토큰을 유지한다.
    console.error('accessToken 재발급 실패:', res.status, body?.message || '');
    return null;
  }

  const data = await res.json().catch(() => null);
  const newAccessToken = data?.accessToken;
  const newRefreshToken = data?.refreshToken;
  if (newAccessToken) await AsyncStorage.setItem('accessToken', newAccessToken);
  if (newRefreshToken) await AsyncStorage.setItem('refreshToken', newRefreshToken);
  refreshBlockedUntil = 0;
  return newAccessToken || null;
}

// refreshToken으로 accessToken 재발급 — 동시 호출은 한 건으로 합쳐진다.
export async function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;
  const run = doRefreshAccessToken()
    .catch((err) => { console.error('accessToken 재발급 실패:', err); return null; })
    .finally(() => { refreshInFlight = null; });
  refreshInFlight = run;
  return run;
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

  // BYO-PC 데몬
  daemon: {
    /** 파일 변경 이벤트 SSE(GET) — 로우 레벨 XHR 통신만 담당(파서는 daemonService) */
    eventStream: async (
      onStateChange: (xhr: XMLHttpRequest) => void,
      onError?: (error: any) => void,
    ) => {
      try {
        const url = `${BACK_URL}/api/daemon/events`;
        const headers = await getAuthHeaders();
        const xhr = new XMLHttpRequest();
        xhr.open('GET', url);
        Object.entries(headers).forEach(([key, value]) => { xhr.setRequestHeader(key, value); });
        xhr.onreadystatechange = () => onStateChange(xhr);
        xhr.onerror = (e) => onError?.(e);
        xhr.send();
        return xhr;
      } catch (error) {
        onError?.(error);
      }
    },
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
    // 레포 목록(GitHub에서 열기 피커). 미연동(409)은 정상 상태라 에러 토스트를 띄우지 않는다(silent).
    listRepos: () =>
      apiRequest<{ repos: unknown[] }>('/api/github/repos', { method: 'GET', silent: true }),
    // 연동 해제
    disconnect: () =>
      apiRequest('/api/github/disconnect', {
        method: 'DELETE',
      }),
  },

  // 푸시 알림 기기 등록/해제(M3-3)
  push: {
    register: (body: { token: string; platform: string; provider?: string; alertWhenPcActive?: boolean }) =>
      apiRequest<{ id: number; platform: string; enabled: boolean }>('/api/push/register', { method: 'POST', body, silent: true }),
    unregister: (token: string) =>
      apiRequest<{ removed: number }>('/api/push/unregister', { method: 'POST', body: { token }, silent: true }),
    // 라우팅 토글(PC 사용 중 폰 무음) — 사용자의 모든 기기 일괄 갱신.
    setPreferences: (alertWhenPcActive: boolean) =>
      apiRequest<{ updated: number; alertWhenPcActive: boolean }>('/api/push/preferences', { method: 'POST', body: { alertWhenPcActive }, silent: true }),
  },

  // 모양 설정(계정 전체 동기화) — {uiFont, codeFont, termStyle}. PATCH 시 서버가 전 기기 팬아웃.
  appearance: {
    get: () =>
      apiRequest<{ appearance: Record<string, string> | null }>('/api/daemon/me', { method: 'GET', silent: true }),
    update: (appearance: Record<string, string>) =>
      apiRequest<{ appearance: Record<string, string> | null }>('/api/daemon/me', { method: 'PATCH', body: { appearance }, silent: true }),
  },

  // 사용량 미터링
  usage: {
    getStatus: () =>
      apiRequest<UsageStatus>('/api/usage/status', { method: 'GET' }),
    getHistory: (page = 1, limit = 20) =>
      apiRequest('/api/usage/history?page=' + page + '&limit=' + limit, { method: 'GET' }),
  },

  // 구독
  subscription: {
    getPlans: () => apiRequest<SubscriptionPlan[]>('/api/subscription/plans', { method: 'GET' }),
    getMine: () => apiRequest<SubscriptionInfo | null>('/api/subscription/me', { method: 'GET' }),
    // 해지(기본: 기간 말 해지 — 그때까지 이용 가능). 웹(portone) 구독만. 스토어 구독은 store_managed 에러.
    cancel: (reason?: string) =>
      apiRequest<SubscriptionInfo>('/api/subscription/cancel', { method: 'POST', body: { reason: reason || null } }),
    // 해지 취소(재개) — 기간 말 해지 예약을 되돌림.
    resume: () =>
      apiRequest<{ resumed: boolean; storeManaged?: boolean }>('/api/subscription/resume', { method: 'POST', body: {} }),
  },

  // 청구 (월 구독)
  billing: {
    // 앱→웹 핸드오프: 토큰 대신 일회용 코드(hc)를 받아 웹이 서버에서 교환(URL 토큰 노출 방지)
    createWebSession: () =>
      apiRequest<{ code?: string; token?: string; webUrl: string }>('/api/billing/web-session', { method: 'POST', body: {} }),
    // 스토어 IAP 구매 직후 즉시 동기화(RevenueCat entitlement → 플랜 반영). 웹훅 지연 보정.
    iapSync: () =>
      apiRequest<{ active: boolean; plan?: string }>('/api/billing/iap/sync', { method: 'POST', body: {} }),
    // 결제 내역(영수증). paginatedResponse → { data: PaymentReceipt[], pagination }
    getPayments: (page = 1, limit = 30) =>
      apiRequest<{ data: PaymentReceipt[] }>(`/api/billing/payments?page=${page}&limit=${limit}`, { method: 'GET' }),
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
     * body: { prompt, sessionId?, model?, projectId?, files?, autoApprove? }
     */
    queryStream: async (
      data: { prompt: string; sessionId?: string; model?: string; projectId?: string; files?: { path: string; content: string }[]; autoApprove?: boolean; mode?: 'chat' | 'code' },
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

    /** 수정 승인/거부 응답 — diff 모달에서 호출. 대기 중인 에이전트 도구 실행을 풀어준다. */
    resolvePermission: (requestId: string, decision: 'allow' | 'deny', message?: string) =>
      apiRequest<{ requestId: string; decision: string }>('/api/agent/permission', {
        method: 'POST',
        body: { requestId, decision, message },
      }),

    /** 샌드박스 터미널 — 임의 셸 명령 SSE 스트리밍 (로우 레벨 통신만 담당) */
    execStream: async (
      data: { command: string; cwd?: string; projectId?: string },
      onStateChange: (xhr: XMLHttpRequest) => void,
      onError?: (error: any) => void,
    ) => {
      try {
        const url = `${BACK_URL}/api/agent/exec`;
        const headers = await getAuthHeaders();
        const xhr = new XMLHttpRequest();
        xhr.open('POST', url);
        Object.entries(headers).forEach(([key, value]) => { xhr.setRequestHeader(key, value); });
        xhr.onreadystatechange = () => onStateChange(xhr);
        xhr.onerror = (e) => onError?.(e);
        xhr.send(JSON.stringify(data));
        return xhr;
      } catch (error) {
        console.error('Sandbox exec SSE 스트림 요청 오류:', error);
        onError?.(error);
      }
    },
  },
};

export default api;