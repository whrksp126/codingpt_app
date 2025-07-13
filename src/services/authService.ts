import { apiRequest } from '../utils/api';

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
}

export interface AuthCheckResponse {
  success: boolean;
  user?: {
    id: string;
    email: string;
    name: string;
  };
}

export const authService = {
  // Google ID 토큰으로 로그인
  login: (idToken: string) => 
    apiRequest<LoginResponse>('/api/users/login', { 
      method: 'POST', 
      body: { idToken } 
    }),

  // 액세스 토큰 유효성 확인
  check: (accessToken: string) => 
    apiRequest<AuthCheckResponse>('/api/users/verify', { 
      method: 'GET' 
    }),

  // 리프레시 토큰으로 액세스 토큰 갱신
  refresh: (refreshToken: string) => 
    apiRequest<{ accessToken: string }>('/api/users/refresh', { 
      method: 'POST', 
      body: { refreshToken } 
    }),

  // 로그아웃
  logout: () => 
    apiRequest('/api/users/logout', { 
      method: 'POST' 
    }),
}; 