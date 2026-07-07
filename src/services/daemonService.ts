import { apiRequest } from '../utils/api';
import { BACK_URL } from '../utils/service';

// BYO-PC 데몬 — 사용자 PC의 codingpt_daemon 연결 상태/페어링/터미널.
// 터미널 ws 업그레이드는 Authorization 헤더를 못 싣으므로(WebView WS) 불투명 토큰이 인가 역할.

export interface DaemonDeviceInfo {
  deviceId: number;
  deviceName: string;
  platform: string | null;
  daemonVersion: string | null;
  lastSeenAt?: string | null;
  online: boolean;
}

export interface DaemonStatus {
  online: boolean;
  current: {
    deviceId: number;
    deviceName: string;
    platform: string | null;
    daemonVersion: string | null;
    connectedAt: string;
  } | null;
  devices: DaemonDeviceInfo[];
}

export async function getStatus(): Promise<DaemonStatus> {
  const r = await apiRequest<DaemonStatus>('/api/daemon/status', { method: 'GET' });
  if (!r.success || !r.data) throw new Error(r.error || r.message || '데몬 상태를 불러올 수 없어요.');
  return r.data;
}

// 페어링 코드 발급 — PC 에서 `codingpt-daemon pair` 로 입력할 일회용 코드(10분).
export async function createPairCode(): Promise<{ code: string; expiresAt: string }> {
  const r = await apiRequest<{ code: string; expiresAt: string }>('/api/daemon/pair/code', { method: 'POST' });
  if (!r.success || !r.data?.code) throw new Error(r.error || r.message || '페어링 코드를 발급할 수 없어요.');
  return r.data;
}

export async function revokeDevice(deviceId: number): Promise<void> {
  const r = await apiRequest(`/api/daemon/devices/${deviceId}/revoke`, { method: 'POST' });
  if (!r.success) throw new Error(r.error || r.message || '기기 해제에 실패했어요.');
}

// PC 터미널 시작 — 데몬 오프라인이면 409.
export async function startTerminal(): Promise<string> {
  const r = await apiRequest<{ token: string }>('/api/daemon/terminal/start', { method: 'POST' });
  if (!r.success || !r.data?.token) throw new Error(r.error || r.message || 'PC 터미널을 시작할 수 없어요.');
  return r.data.token;
}

export function buildTerminalWsUrl(token: string): string {
  const base = BACK_URL.replace(/^http/, 'ws').replace(/\/+$/, '');
  return `${base}/api/daemon/terminal/${token}`;
}

export default { getStatus, createPairCode, revokeDevice, startTerminal, buildTerminalWsUrl };
