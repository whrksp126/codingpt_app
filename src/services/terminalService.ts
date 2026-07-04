import { apiRequest } from '../utils/api';
import { BACK_URL } from '../utils/service';

// 인터랙티브 PTY 터미널 — 인증된 /start 로 토큰 발급 후, 그 토큰으로 ws 업그레이드.
// ws 업그레이드는 Authorization 헤더를 못 싣으므로(WebView/네이티브 WS) 불투명 토큰이 인가 역할.

export async function startTerminal(projectId: string): Promise<string> {
  const r = await apiRequest<{ token: string }>('/api/terminal/start', {
    method: 'POST',
    body: { projectId },
  });
  if (!r.success || !r.data?.token) throw new Error(r.error || r.message || '터미널을 시작할 수 없어요.');
  return r.data.token;
}

// BACK_URL(http/https) → ws/wss 스킴 치환 + 토큰 경로.
export function buildTerminalWsUrl(token: string): string {
  const base = BACK_URL.replace(/^http/, 'ws').replace(/\/+$/, '');
  return `${base}/api/terminal/${token}`;
}

export default { startTerminal, buildTerminalWsUrl };
