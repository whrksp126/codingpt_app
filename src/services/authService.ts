import { apiRequest } from '../utils/api';
import type { User } from '../services/userService';

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
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
  // Google ID 토큰으로 로그인 (anonId 동봉 시 온보딩 익명 응답을 유저에 연결)
  login: (idToken: string, anonId?: string) =>
    apiRequest<LoginResponse>('/api/users/login', {
      method: 'POST',
      body: { idToken, anonId }
    }),

  // Apple identity 토큰으로 로그인 (name·authorizationCode 는 첫 로그인에만 Apple 이 제공 → 함께 전달)
  appleLogin: (identityToken: string, name?: string, anonId?: string, authorizationCode?: string) =>
    apiRequest<LoginResponse>('/api/users/apple-login', {
      method: 'POST',
      body: { identityToken, name, anonId, authorizationCode }
    }),

  // 이메일/비밀번호 로그인 (심사용 데모 계정 + 일반 이메일 가입자)
  loginLocal: (email: string, password: string) =>
    apiRequest<LoginResponse>('/api/users/login-local', {
      method: 'POST',
      body: { email, password }
    }),

  // 웹 이메일 로그인/회원가입 핸드오프 코드 교환 (openAuth 로 받은 code → 토큰)
  redeemHandoff: (code: string) =>
    apiRequest<LoginResponse>('/api/users/handoff/redeem', {
      method: 'POST',
      body: { code }
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

  // 회원 탈퇴
  deleteUser: (userId: number) =>
    apiRequest(`/api/users/${userId}`, {
      method: 'DELETE',
    }),
};