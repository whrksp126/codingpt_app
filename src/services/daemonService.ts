import { apiRequest, api, refreshAccessToken } from '../utils/api';
import { BACK_URL } from '../utils/service';
import type { AgentEvent } from './agentService';

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

// PC 터미널 시작 — 데몬 오프라인이면 409. cwd(홈-기준 상대경로)를 주면 그 워크스페이스 폴더에서 시작.
export async function startTerminal(cwd = ''): Promise<string> {
  const r = await apiRequest<{ token: string }>('/api/daemon/terminal/start', { method: 'POST', body: { cwd } });
  if (!r.success || !r.data?.token) throw new Error(r.error || r.message || 'PC 터미널을 시작할 수 없어요.');
  return r.data.token;
}

export function buildTerminalWsUrl(token: string): string {
  const base = BACK_URL.replace(/^http/, 'ws').replace(/\/+$/, '');
  return `${base}/api/daemon/terminal/${token}`;
}

// ── 멀티 터미널(tmux window) — 클라우드 ideService 와 동일한 window 스위칭 모델.
// 단일 PTY 스트림이 세션에 attach 돼 있고, select 로 활성 window 를 바꾸면 그 화면을 따라간다.
export interface DaemonTerminalWindow { index: number; active: boolean; command: string; }

export async function listTerminals(cwd = ''): Promise<DaemonTerminalWindow[]> {
  const r = await apiRequest<{ windows: DaemonTerminalWindow[] }>(
    `/api/daemon/terminal/list?cwd=${encodeURIComponent(cwd)}`,
    { method: 'GET', silent: true },
  );
  return (r.success && r.data?.windows) ? r.data.windows : [];
}

export async function newTerminal(cwd = ''): Promise<{ index: number }> {
  const r = await apiRequest<{ index: number }>('/api/daemon/terminal/new', { method: 'POST', body: { cwd } });
  if (!r.success || !r.data) throw new Error(r.error || r.message || '새 터미널을 열 수 없어요.');
  return r.data;
}

export async function selectTerminal(cwd: string, index: number): Promise<void> {
  await apiRequest('/api/daemon/terminal/select', { method: 'POST', body: { cwd, index } });
}

export async function closeTerminal(cwd: string, index: number): Promise<void> {
  await apiRequest('/api/daemon/terminal/close', { method: 'POST', body: { cwd, index } });
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
  base64?: string;   // base64=1 로 읽은 경우 원본 바이트(이미지 미리보기)
  size: number;
  binary?: boolean;
  tooLarge?: boolean;
}

// 프로젝트 검색 결과(fs.grep) — path 는 검색 루트 기준 상대(IDE 트리 키와 동일).
export interface DaemonGrepMatch { path: string; line: number; col: number; text: string; }
export interface DaemonGrepResult { matches: DaemonGrepMatch[]; truncated: boolean; }

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

export async function fsRead(path: string, opts?: { base64?: boolean }): Promise<DaemonFsRead> {
  // silent: 없는 파일/삭제된 파일 읽기는 예상 가능한 실패라 콘솔 소음을 억제(호출부가 조용히 재시도/스킵).
  const qs = `path=${encodeURIComponent(path)}${opts?.base64 ? '&base64=1' : ''}`;
  const r = await apiRequest<DaemonFsRead>(`/api/daemon/fs/read?${qs}`, { method: 'GET', silent: true });
  if (!r.success || !r.data) throw new Error(r.error || r.message || '파일을 열 수 없어요.');
  return r.data;
}

// 프로젝트 폴더(root, 홈-기준 상대) 내 리터럴(대소문자무시) 검색. 데몬 오프라인이면 빈 결과.
export async function fsGrep(root: string, query: string): Promise<DaemonGrepResult> {
  const q = query.trim();
  if (!q) return { matches: [], truncated: false };
  const r = await apiRequest<DaemonGrepResult>(
    `/api/daemon/fs/grep?path=${encodeURIComponent(root)}&q=${encodeURIComponent(q)}`,
    { method: 'GET', silent: true },
  );
  return (r.success && r.data) ? r.data : { matches: [], truncated: false };
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

// ── 워크스페이스(Slice2) — PC 에 결정적 스캐폴드 ──
export interface DaemonWsRoot {
  root: string | null;        // 지정된 루트(홈-기준 상대). 미지정이면 null
  recommended: string;        // 권장 기본 루트(TCC 프롬프트 없는 위치, 예: CodingPT/workspaces)
  protected?: boolean;        // 현재 루트가 macOS 보호폴더(Documents 등) 안이면 true
}
// 지정된 워크스페이스 루트 + 권장 위치.
export async function wsGetRoot(): Promise<DaemonWsRoot> {
  const r = await apiRequest<DaemonWsRoot>('/api/daemon/ws/root', { method: 'GET' });
  if (!r.success || !r.data) throw new Error(r.error || r.message || '워크스페이스 루트를 조회할 수 없어요.');
  return { root: r.data.root ?? null, recommended: r.data.recommended || 'CodingPT/workspaces', protected: r.data.protected };
}
// 워크스페이스 루트 지정 — 존재하는 폴더만.
export async function wsSetRoot(path: string): Promise<string> {
  const r = await apiRequest<{ root: string }>('/api/daemon/ws/root', { method: 'POST', body: { path } });
  if (!r.success || !r.data?.root) throw new Error(r.error || r.message || '워크스페이스 루트를 지정할 수 없어요.');
  return r.data.root;
}
// 권장 루트(~/CodingPT/workspaces)를 생성하고 지정 — macOS 폴더 접근 프롬프트가 없는 위치.
export async function wsUseDefaultRoot(): Promise<string> {
  const r = await apiRequest<{ root: string }>('/api/daemon/ws/root/default', { method: 'POST', body: {} });
  if (!r.success || !r.data?.root) throw new Error(r.error || r.message || '권장 위치를 설정할 수 없어요.');
  return r.data.root;
}
export interface DaemonWsCreated { path: string; name: string; slug: string; gitInit: boolean; }
// 루트 아래 새 워크스페이스 폴더 스캐폴드(mkdir+git init+최소 템플릿). path 는 홈-기준 상대경로.
export async function wsCreate(name: string): Promise<DaemonWsCreated> {
  const r = await apiRequest<DaemonWsCreated>('/api/daemon/ws/create', { method: 'POST', body: { name } });
  if (!r.success || !r.data?.path) throw new Error(r.error || r.message || 'PC 에 워크스페이스를 만들 수 없어요.');
  return r.data;
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

// ── BYO 에이전트(M1) — 데몬이 사용자 claude 를 spawn. 커맨드는 REST, 이벤트는 아래 SSE(agent_event). ──
export interface DaemonAgentFrame { type: 'agent_event'; sessionId: string; seq: number; event: AgentEvent; }
export interface DaemonAgentSession { id: string; title: string; lastAt: string; turns: number; source: 'app' | 'external'; }

// 에이전트 시작 — claude spawn(+prompt/--resume). 반환 sessionId 는 claude session_id.
export async function startAgent(cwd: string, prompt?: string, resumeId?: string): Promise<{ sessionId: string }> {
  const r = await apiRequest<{ sessionId: string }>('/api/daemon/agent/start', { method: 'POST', body: { cwd, prompt, resumeId } });
  if (!r.success || !r.data?.sessionId) throw new Error(r.error || r.message || '에이전트를 시작할 수 없어요.');
  return r.data;
}
export async function inputAgent(sessionId: string, text: string): Promise<void> {
  const r = await apiRequest('/api/daemon/agent/input', { method: 'POST', body: { sessionId, text } });
  if (!r.success) throw new Error(r.error || r.message || '메시지를 보낼 수 없어요.');
}
export async function approveAgent(sessionId: string, requestId: string, decision: 'allow' | 'deny', message?: string): Promise<void> {
  await apiRequest('/api/daemon/agent/approve', { method: 'POST', body: { sessionId, requestId, decision, message } });
}
export async function interruptAgent(sessionId: string): Promise<void> {
  await apiRequest('/api/daemon/agent/interrupt', { method: 'POST', body: { sessionId }, silent: true });
}
export async function stopAgent(sessionId: string): Promise<void> {
  await apiRequest('/api/daemon/agent/stop', { method: 'POST', body: { sessionId }, silent: true });
}
export async function agentBacklog(sessionId: string, sinceSeq: number): Promise<DaemonAgentFrame[]> {
  const r = await apiRequest<{ events: DaemonAgentFrame[] }>(`/api/daemon/agent/backlog?sessionId=${encodeURIComponent(sessionId)}&sinceSeq=${sinceSeq}`, { method: 'GET', silent: true });
  return (r.success && r.data?.events) ? r.data.events : [];
}
// 이어받기 목록 — ~/.claude/projects 대화 로그(PC 터미널에서 하던 대화 포함). 데몬 오프라인이면 빈 배열.
export async function listAgentSessions(cwd: string): Promise<DaemonAgentSession[]> {
  const r = await apiRequest<{ sessions: DaemonAgentSession[] }>(`/api/daemon/agent/sessions?cwd=${encodeURIComponent(cwd)}`, { method: 'GET', silent: true });
  return (r.success && r.data?.sessions) ? r.data.sessions : [];
}

// 온보딩 점검 — claude/tmux 설치 여부. 로그인은 BYO 원칙상 자동 점검 안 함(사용자 소유·크레덴셜 미열람).
export interface DaemonDoctor {
  claude: { installed: boolean; version: string | null; bin: string; error?: string };
  tmux: { installed: boolean; path: string | null };
  platform?: string;
  login?: { probed: boolean };
}
export async function agentDoctor(): Promise<DaemonDoctor> {
  const r = await apiRequest<DaemonDoctor>('/api/daemon/agent/doctor', { method: 'GET', silent: true });
  if (!r.success || !r.data) throw new Error(r.error || r.message || '점검할 수 없어요.');
  return r.data;
}

/**
 * 에이전트 이벤트 SSE 구독 — 데몬 agent_event 프레임을 순번(seq)과 함께 흘린다.
 * fs_event 용 streamDaemonEvents 와 동일 스켈레톤(별도 구독, 백엔드가 팬아웃). @returns 해제 함수.
 */
export function subscribeDaemonAgentEvents(
  onFrame: (f: DaemonAgentFrame) => void,
  onError?: (msg: string) => void,
): () => void {
  let aborted = false;
  let xhr: XMLHttpRequest | undefined;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

  const processLine = (line: string) => {
    const t = line.trim();
    if (!t.startsWith('data:')) return;
    try {
      const msg = JSON.parse(t.substring(5).trim());
      if (msg && msg.type === 'agent_event') onFrame(msg as DaemonAgentFrame);
    } catch (_) { /* noop */ }
  };
  const scheduleReconnect = () => { if (aborted) return; if (reconnectTimer) clearTimeout(reconnectTimer); reconnectTimer = setTimeout(() => run(false), 3000); };
  const run = async (retried: boolean) => {
    let processedIndex = 0; let pendingLine = '';
    xhr = await api.daemon.eventStream(
      (x) => {
        if (aborted) return;
        if (x.readyState === 3 || x.readyState === 4) {
          const chunk = x.responseText.substring(processedIndex); processedIndex = x.responseText.length;
          const combined = pendingLine + chunk; const lines = combined.split('\n'); pendingLine = lines.pop() ?? '';
          lines.forEach(processLine);
        }
        if (x.readyState === 4) {
          if (x.status === 401 && !retried) { refreshAccessToken().then((tok) => { if (!aborted) { tok ? run(true) : onError?.('인증이 만료되었습니다.'); } }).catch(() => onError?.('인증 갱신 실패')); return; }
          scheduleReconnect();
        }
      },
      () => { if (!aborted) scheduleReconnect(); },
    );
  };
  run(false);
  return () => { aborted = true; if (reconnectTimer) clearTimeout(reconnectTimer); try { xhr?.abort(); } catch (_) { /* noop */ } };
}

export default { getStatus, createPairCode, revokeDevice, startTerminal, buildTerminalWsUrl, listTerminals, newTerminal, selectTerminal, closeTerminal, fsList, fsTree, fsRead, fsWrite, fsWatch, fsUnwatch, fsGrep, streamDaemonEvents, wsGetRoot, wsSetRoot, wsUseDefaultRoot, wsCreate, previewPorts, previewStart, buildDaemonPreviewUrl, startAgent, inputAgent, approveAgent, interruptAgent, stopAgent, agentBacklog, listAgentSessions, agentDoctor, subscribeDaemonAgentEvents };
