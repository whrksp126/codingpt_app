import { apiRequest, api, refreshAccessToken } from '../utils/api';
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

// ── 파일시스템(P1) — 데몬 홈 루트 아래 탐색/열기/저장 ──
export interface DaemonFsEntry {
  name: string;
  path: string;   // 데몬 루트(홈) 기준 상대경로
  dir: boolean;
  text: boolean;  // 편집 가능한 텍스트 파일인지
}

export interface DaemonFsList { root: string; items: DaemonFsEntry[]; }
export interface DaemonFsRead {
  path: string;
  content?: string;
  size: number;
  binary?: boolean;
  tooLarge?: boolean;
}

export async function fsList(path = ''): Promise<DaemonFsList> {
  const r = await apiRequest<DaemonFsList>(`/api/daemon/fs/list?path=${encodeURIComponent(path)}`, { method: 'GET' });
  if (!r.success || !r.data) throw new Error(r.error || r.message || '폴더를 불러올 수 없어요.');
  return r.data;
}

// 선택 폴더(root) 아래 파일 flat 목록 — 모바일 IDE 소스로 소비(경로는 root 기준 상대).
export interface DaemonFsTree { root: string; items: { path: string; text: boolean }[]; truncated?: boolean; }
export async function fsTree(root = ''): Promise<DaemonFsTree> {
  const r = await apiRequest<DaemonFsTree>(`/api/daemon/fs/tree?path=${encodeURIComponent(root)}`, { method: 'GET' });
  if (!r.success || !r.data) throw new Error(r.error || r.message || '프로젝트를 불러올 수 없어요.');
  return r.data;
}

export async function fsRead(path: string): Promise<DaemonFsRead> {
  // silent: 없는 파일/삭제된 파일 읽기는 예상 가능한 실패라 콘솔 소음을 억제(호출부가 조용히 재시도/스킵).
  const r = await apiRequest<DaemonFsRead>(`/api/daemon/fs/read?path=${encodeURIComponent(path)}`, { method: 'GET', silent: true });
  if (!r.success || !r.data) throw new Error(r.error || r.message || '파일을 열 수 없어요.');
  return r.data;
}

export async function fsWrite(path: string, content: string): Promise<{ path: string; size: number }> {
  const r = await apiRequest<{ path: string; size: number }>('/api/daemon/fs/write', { method: 'POST', body: { path, content } });
  if (!r.success || !r.data) throw new Error(r.error || r.message || '저장에 실패했어요.');
  return r.data;
}

// 특정 디렉토리 변경 감시 등록/해제(단일). 이벤트는 streamDaemonEvents 로 수신.
export async function fsWatch(path: string): Promise<void> {
  await apiRequest('/api/daemon/fs/watch', { method: 'POST', body: { path } });
}
export async function fsUnwatch(): Promise<void> {
  await apiRequest('/api/daemon/fs/unwatch', { method: 'POST', body: {} });
}

// ── 프리뷰(P2) — PC dev 서버를 폰 웹뷰로 ──
// PC 에서 LISTEN 중인 포트 감지 + 그 포트로의 무인증 프록시 토큰 발급.
export async function previewPorts(): Promise<number[]> {
  const r = await apiRequest<{ ports: number[] }>('/api/daemon/preview/ports', { method: 'GET' });
  if (!r.success || !r.data) throw new Error(r.error || r.message || 'PC 포트를 조회할 수 없어요.');
  return r.data.ports || [];
}
export async function previewStart(port: number): Promise<{ token: string; url: string; port: number }> {
  const r = await apiRequest<{ token: string; url: string; port: number }>('/api/daemon/preview/start', { method: 'POST', body: { port } });
  if (!r.success || !r.data?.token) throw new Error(r.error || r.message || '미리보기를 시작할 수 없어요.');
  return r.data;
}
export function buildDaemonPreviewUrl(token: string): string {
  return `${BACK_URL.replace(/\/+$/, '')}/api/daemon/preview/${token}/`;
}

export interface DaemonFsEvent {
  type: 'fs_event';
  event: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir';
  path: string; // 데몬 루트(홈) 기준 상대경로
}

/**
 * 파일 변경 이벤트 SSE 구독 — claude 등이 PC 파일 수정 시 즉시 통지.
 * 연결이 끊기면(데몬 재시작/네트워크) 자동 재연결. @returns 구독 해제 함수.
 */
export function streamDaemonEvents(
  onEvent: (e: DaemonFsEvent) => void,
  onError?: (msg: string) => void,
): () => void {
  let aborted = false;
  let xhr: XMLHttpRequest | undefined;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

  const processLine = (line: string) => {
    const t = line.trim();
    if (!t.startsWith('data:')) return; // 주석(: ka) 무시
    try {
      const msg = JSON.parse(t.substring(5).trim());
      if (msg && msg.type === 'fs_event') onEvent(msg as DaemonFsEvent);
    } catch (_) { /* 파싱 실패 무시 */ }
  };

  const scheduleReconnect = () => {
    if (aborted) return;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => run(false), 3000);
  };

  const run = async (retried: boolean) => {
    let processedIndex = 0;
    let pendingLine = '';
    xhr = await api.daemon.eventStream(
      (x) => {
        if (aborted) return;
        if (x.readyState === 3 || x.readyState === 4) {
          const chunk = x.responseText.substring(processedIndex);
          processedIndex = x.responseText.length;
          const combined = pendingLine + chunk;
          const lines = combined.split('\n');
          pendingLine = lines.pop() ?? '';
          lines.forEach(processLine);
        }
        if (x.readyState === 4) {
          if (x.status === 401 && !retried) {
            refreshAccessToken()
              .then((tok) => { if (!aborted) { tok ? run(true) : onError?.('인증이 만료되었습니다.'); } })
              .catch(() => onError?.('인증 갱신 실패'));
            return;
          }
          scheduleReconnect(); // 정상 종료(데몬 끊김 등) → 재연결
        }
      },
      () => { if (!aborted) { scheduleReconnect(); } },
    );
  };

  run(false);
  return () => {
    aborted = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    try { xhr?.abort(); } catch (_) { /* noop */ }
  };
}

export default { getStatus, createPairCode, revokeDevice, startTerminal, buildTerminalWsUrl, fsList, fsTree, fsRead, fsWrite, fsWatch, fsUnwatch, streamDaemonEvents, previewPorts, previewStart, buildDaemonPreviewUrl };
