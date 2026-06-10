import { api } from '../utils/api';

// GitHub 연동 상태
export interface GithubStatus {
  connected: boolean;
  login?: string;
  avatarUrl?: string;
  connectedAt?: string;
}

export const githubService = {
  // 연동 상태 조회
  async getStatus(): Promise<GithubStatus> {
    const res = await api.github.getStatus();
    if (!res.success || !res.data) {
      return { connected: false };
    }
    return res.data;
  },

  // OAuth 인가 URL 발급 (WebView 로 연다)
  async getAuthorizeUrl(): Promise<string | null> {
    const res = await api.github.getAuthorizeUrl();
    if (!res.success || !res.data?.authorizeUrl) return null;
    return res.data.authorizeUrl;
  },

  // 연동 해제
  async disconnect(): Promise<boolean> {
    const res = await api.github.disconnect();
    return res.success;
  },
};

export default githubService;
