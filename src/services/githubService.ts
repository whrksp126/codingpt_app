import { api } from '../utils/api';

// GitHub 연동 상태
export interface GithubStatus {
  connected: boolean;
  login?: string;
  avatarUrl?: string;
  connectedAt?: string;
}

// GitHub 레포(레포 피커용) — 백엔드 githubService.listRepos 매핑과 일치.
export interface GithubRepo {
  id: number;
  name: string;
  fullName: string;
  private: boolean;
  defaultBranch: string;
  cloneUrl: string;
  htmlUrl: string;
  description: string | null;
  language: string | null;
  updatedAt: string | null;
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

  // 레포 목록 조회. 미연동(409)이면 null 반환 → 호출측이 연결 유도.
  async listRepos(): Promise<GithubRepo[] | null> {
    const res = await api.github.listRepos();
    if (!res.success || !res.data?.repos) return null;
    return res.data.repos as GithubRepo[];
  },
};

export default githubService;
