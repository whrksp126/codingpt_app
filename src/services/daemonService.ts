import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { apiRequest, api, refreshAccessToken } from '../utils/api';
import { BACK_URL } from '../utils/service';

// 이 기기의 안정 식별자(컨트롤러 등록/현재기기 표시용) — 최초 1회 생성 후 영구 보관.
const DEVICE_UUID_KEY = 'cpt.deviceUuid';
export async function getDeviceUuid(): Promise<string> {
  let u = await AsyncStorage.getItem(DEVICE_UUID_KEY);
  if (!u) {
    u = `ctl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 10)}`;
    await AsyncStorage.setItem(DEVICE_UUID_KEY, u);
  }
  return u;
}

// 터미널 세션용 짧은 기기 키(안정) — pane tmux 세션을 기기별로 분리한다.
//  같은 세션에 여러 기기가 attach 하면 tmux 가 화면 크기를 클라이언트끼리 공유해(작은 기기 기준
//  점선 여백) 어느 기기도 풀사이즈를 못 쓴다 → 기기마다 자기 세션 = 자기 크기.
let clientKeyCache: string | null = null;
export async function getClientKey(): Promise<string> {
  if (clientKeyCache) return clientKeyCache;
  const u = await getDeviceUuid();
  clientKeyCache = u.replace(/[^A-Za-z0-9]/g, '').slice(-10) || 'dev';
  return clientKeyCache;
}

function deviceLabel(): string {
  if (Platform.OS === 'ios') return (Platform as any).isPad ? 'iPad' : 'iPhone';
  if (Platform.OS === 'android') return 'Android';
  return '모바일';
}

// 컨트롤러(이 모바일/태블릿)를 계정에 등록 → "내 기기" 목록에 노출. 로그인/부팅 시 1회.
export async function registerController(): Promise<{ deviceId: number } | null> {
  const deviceUuid = await getDeviceUuid();
  const r = await apiRequest<{ deviceId: number }>('/api/daemon/devices/register', {
    method: 'POST',
    body: { deviceUuid, deviceName: deviceLabel(), platform: Platform.OS },
    silent: true,
  });
  return r.success && r.data ? r.data : null;
}

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

// 연결된 러너(M5) — 로컬 데몬 + 클라우드 컨테이너가 공존. active=현재 RPC 라우팅 대상.
export interface DaemonRunner {
  deviceId: number;
  kind: 'local' | 'cloud';
  deviceName: string;
  platform: string | null;
  active: boolean;
  connectedAt: number;
}

export interface DaemonStatus {
  online: boolean;
  // 클라우드 러너 제공 여부(백엔드 CLOUD_RUNNER_ENABLED). false/누락이면 앱은 클라우드 생성/전환 진입점을 숨긴다.
  cloudEnabled?: boolean;
  current: {
    deviceId: number;
    deviceName: string;
    platform: string | null;
    daemonVersion: string | null;
    connectedAt: string;
  } | null;
  runners: DaemonRunner[]; // M5: 연결된 러너 목록(local+cloud, active 표식)
  devices: DaemonDeviceInfo[];
}

export async function getStatus(): Promise<DaemonStatus> {
  const r = await apiRequest<DaemonStatus>('/api/daemon/status', { method: 'GET' });
  if (!r.success || !r.data) throw new Error(r.error || r.message || '데몬 상태를 불러올 수 없어요.');
  return { ...r.data, runners: r.data.runners || [] };
}

// M5 Slice4 — 활성 러너 전환(핸드오프). runnerId 또는 kind('local'|'cloud').
export async function activateRunner(target: number | { kind: 'local' | 'cloud' }): Promise<{ active: number; runners: DaemonRunner[] }> {
  const body = typeof target === 'number' ? { runnerId: target } : { kind: target.kind };
  const r = await apiRequest<{ active: number; runners: DaemonRunner[] }>('/api/daemon/runner/activate', { method: 'POST', body });
  if (!r.success || !r.data) throw new Error(r.error || r.message || '러너를 전환할 수 없어요.');
  return r.data;
}

// M5 Slice4 — 워크스페이스용 클라우드 러너 확보(프로비저닝+컨테이너 기동). 핸드오프 진입점.
//  needsManualRun=true 면 로컬 dev(docker.sock 없음) — back 콘솔의 docker run 명령으로 수동 기동.
// wasDormant=true 면 동면(scale-to-zero)에서 깨우는 콜드스타트 — 볼륨에 크레덴셜·코드가 이미 존재(재로그인·materialize 불필요).
export async function ensureCloudRunner(workspaceId: string): Promise<{ runnerId: number; launched: boolean; needsManualRun: boolean; wasDormant?: boolean }> {
  const r = await apiRequest<{ runnerId: number; launched: boolean; needsManualRun: boolean; wasDormant?: boolean }>('/api/daemon/runner/cloud/ensure', { method: 'POST', body: { workspaceId } });
  if (!r.success || !r.data) throw new Error(r.error || r.message || '클라우드 러너를 준비할 수 없어요.');
  return r.data;
}

// 페어링 코드 발급(레거시) — PC 에서 입력할 일회용 코드(10분).
export async function createPairCode(): Promise<{ code: string; expiresAt: string }> {
  const r = await apiRequest<{ code: string; expiresAt: string }>('/api/daemon/pair/code', { method: 'POST' });
  if (!r.success || !r.data?.code) throw new Error(r.error || r.message || '페어링 코드를 발급할 수 없어요.');
  return r.data;
}

// QR 승인(넷플릭스 방식) — PC 화면의 QR/코드를 이 계정으로 승인해 기기를 등록한다.
//  PC 가 세션을 만들고 code 를 QR 로 표시 → 이 앱(로그인됨)이 그 code 를 승인 → PC 가 토큰을 받아 연결.
export async function approvePairSession(code: string): Promise<{ deviceId: number; deviceName: string }> {
  const r = await apiRequest<{ deviceId: number; deviceName: string }>('/api/daemon/pair/approve', {
    method: 'POST',
    body: { code: String(code || '').trim().toUpperCase() },
  });
  if (!r.success || !r.data?.deviceId) throw new Error(r.error || r.message || '연결 코드가 유효하지 않거나 만료되었어요.');
  return r.data;
}

export async function revokeDevice(deviceId: number): Promise<void> {
  const r = await apiRequest(`/api/daemon/devices/${deviceId}/revoke`, { method: 'POST' });
  if (!r.success) throw new Error(r.error || r.message || '기기 해제에 실패했어요.');
}

// ── 멀티기기(계정 중심) — 설계: codingpt_back/docs/multi-device-design.md ──

// 계정의 기기 하나. id='cloud' 는 항상 켜진 논리 클라우드 호스트.
export interface AccountDevice {
  id: number | string;
  name: string;
  platform: string | null;
  role: 'host' | 'controller';
  runnerKind: 'local' | 'cloud';
  online: boolean;
  lastSeenAt?: string | null;
  isCurrent?: boolean;
  virtual?: boolean;
  createdAt?: string | null;
}

// 계정의 모든 기기(호스트 PC들 + 항상 켜진 클라우드 호스트) — "내 기기".
export async function listDevices(): Promise<{ devices: AccountDevice[]; currentDeviceId: number | null }> {
  const deviceUuid = await getDeviceUuid(); // 헤더로 넘겨 이 기기를 현재기기로 표시
  const r = await apiRequest<{ devices: AccountDevice[]; currentDeviceId: number | null }>('/api/daemon/devices', { method: 'GET', headers: { 'x-device-uuid': deviceUuid } });
  if (!r.success || !r.data) throw new Error(r.error || r.message || '기기 목록을 불러올 수 없어요.');
  return { devices: r.data.devices || [], currentDeviceId: r.data.currentDeviceId ?? null };
}

// 워크스페이스 세션 상태(이어받기) — 열린 터미널/IDE/프리뷰 + 레이아웃.
export interface WorkspaceSessionEnvelope {
  version?: number;
  updatedAt?: string;
  updatedBy?: 'pc' | 'mobile' | 'unknown';
  session: unknown | null;
}
export async function getWorkspaceSession(wsId: string): Promise<WorkspaceSessionEnvelope | null> {
  const r = await apiRequest<WorkspaceSessionEnvelope>(`/api/daemon/workspaces/${encodeURIComponent(wsId)}/session`, { method: 'GET' });
  if (!r.success) return null;
  return r.data || null;
}
export async function putWorkspaceSession(wsId: string, session: unknown, updatedBy: 'mobile' | 'pc' = 'mobile'): Promise<void> {
  await apiRequest(`/api/daemon/workspaces/${encodeURIComponent(wsId)}/session`, { method: 'PUT', body: { session, updatedBy } });
}

// 로컬 워크스페이스를 이 기기(호스트)에 귀속 — 모바일은 보통 호스트가 아니라 계약 유지용.
export async function claimWorkspace(wsId: string): Promise<unknown> {
  const r = await apiRequest<unknown>(`/api/daemon/workspaces/${encodeURIComponent(wsId)}/claim`, { method: 'POST' });
  if (!r.success) throw new Error(r.error || r.message || '워크스페이스 귀속에 실패했어요.');
  return r.data;
}

// ── 대상 호스트 지정(hostDeviceId) — 멀티 PC 직통 규약 ──
//  지정 시 "활성 러너" 전환 없이 그 PC 로 직결(터미널 device-start 와 동일). 미지정=기존 활성 러너.
//  기기마다 보는 워크스페이스가 달라도 서로 활성 포인터를 뺏지 않게 fs/프리뷰/터미널 전부 명시한다.
const hostQS = (host?: number | null) => (host != null ? `&hostDeviceId=${host}` : '');
const hostBody = (host?: number | null) => (host != null ? { hostDeviceId: host } : {});

// PC 터미널 시작 — 데몬 오프라인이면 409. cwd(홈-기준 상대경로)를 주면 그 워크스페이스 폴더에서 시작.
export async function startTerminal(cwd = '', paneId = '', win?: number, host?: number | null): Promise<string> {
  // paneId — pane 별 독립 tmux 세션(여러 터미널 pane 이 각자 다른 window 동시 표시). 없으면 공유 세션.
  // win — 이 pane 이 표시할 window(정수). 미리 확보해 넘기면 데몬이 attach 와 동시에 select(경쟁 방지).
  // client — 기기 키. 세션을 기기별로 분리(다기기 동시 attach 시 tmux 크기 공유/점선 여백 방지).
  const body: { cwd: string; paneId: string; win?: number; client: string; hostDeviceId?: number } = { cwd, paneId, client: await getClientKey(), ...hostBody(host) };
  if (Number.isInteger(win)) body.win = win;
  const r = await apiRequest<{ token: string }>('/api/daemon/terminal/start', { method: 'POST', body, timeoutMs: 15000 });
  if (!r.success || !r.data?.token) throw new Error(r.error || r.message || 'PC 터미널을 시작할 수 없어요.');
  return r.data.token;
}

export function buildTerminalWsUrl(token: string): string {
  const base = BACK_URL.replace(/^http/, 'ws').replace(/\/+$/, '');
  return `${base}/api/daemon/terminal/${token}`;
}

// ── 멀티 터미널(tmux window) — 클라우드 ideService 와 동일한 window 스위칭 모델.
// 단일 PTY 스트림이 세션에 attach 돼 있고, select 로 활성 window 를 바꾸면 그 화면을 따라간다.
// 공유 풀 모델: 터미널 실체 = 워크스페이스 풀(primary tmux 세션)의 window(전 기기 공유, 이름 포함).
//  pane = 이 기기 전용 뷰 세션(link-window). list/new/close=풀, select(view)/unview=이 기기 pane.
export interface DaemonTerminalWindow { index: number; name: string; command: string; active?: boolean; }

export async function listTerminals(cwd = '', host?: number | null): Promise<DaemonTerminalWindow[]> {
  const r = await apiRequest<{ windows: DaemonTerminalWindow[] }>(
    `/api/daemon/terminal/list?cwd=${encodeURIComponent(cwd)}${hostQS(host)}`,
    { method: 'GET', silent: true, timeoutMs: 15000 },
  );
  // 실패를 빈 목록으로 뭉개면 안 됨 — 리컨실러가 "전부 삭제됨"으로 오판해 레이아웃을 전멸시킨다.
  if (!r.success) throw new Error(r.error || r.message || '터미널 목록 조회 실패');
  return r.data?.windows || [];
}

// 풀 변이 카운터 — 리컨실러가 "조회 시작 후 풀이 바뀌었는지"를 판별해 스테일 스냅샷 적용을 막는다.
let poolMutations = 0;
export const poolMutationCount = (): number => poolMutations;

export async function newTerminal(cwd = '', paneId = '', host?: number | null): Promise<{ index: number; name: string }> {
  // 풀에 새 터미널 생성(전 기기에 나타남). 이름("터미널 N")은 데몬이 풀 기준으로 부여.
  // paneId — 요청 pane 의 클라이언트 크기로 창을 즉시 맞춰 첫 표시에서 리사이즈 재프롬프트가 안 쌓이게.
  const r = await apiRequest<{ index: number; name: string }>('/api/daemon/terminal/new', { method: 'POST', body: { cwd, paneId, client: await getClientKey(), ...hostBody(host) }, timeoutMs: 15000 });
  if (!r.success || !r.data) throw new Error(r.error || r.message || '새 터미널을 열 수 없어요.');
  poolMutations += 1;
  return r.data;
}

export async function selectTerminal(cwd: string, index: number, paneId = '', claim = false, host?: number | null): Promise<void> {
  // = view: 이 pane 뷰 세션에 풀 window(index)를 링크 + 선택(탭 전환/드롭 이동 공용).
  //  claim=true(사용자 터치/포커스/탭 클릭)일 때만 창 크기를 이 기기로 리사이즈 — 자동 경로
  //  (리컨실러 반영·재접속 보정)까지 크기를 주장하면 기기 간 크기 뺏기가 반복돼 셸 프롬프트가 쌓인다.
  await apiRequest('/api/daemon/terminal/select', { method: 'POST', body: { cwd, index, paneId, client: await getClientKey(), claim, ...hostBody(host) }, silent: true, timeoutMs: 15000 });
}

export async function unviewTerminal(cwd: string, index: number, paneId: string, host?: number | null): Promise<void> {
  // pane 뷰에서 탭 제거(풀 터미널은 보존) — 드래그 이동의 src 측/레이아웃 정리.
  await apiRequest('/api/daemon/terminal/unview', { method: 'POST', body: { cwd, index, paneId, client: await getClientKey(), ...hostBody(host) }, silent: true, timeoutMs: 15000 });
}

export async function closeTerminal(cwd: string, index: number, host?: number | null): Promise<void> {
  // 풀에서 완전 삭제 — 모든 기기에서 사라진다.
  await apiRequest('/api/daemon/terminal/close', { method: 'POST', body: { cwd, index, client: await getClientKey(), ...hostBody(host) }, timeoutMs: 15000 });
  poolMutations += 1;
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

export async function fsList(path = '', host?: number | null): Promise<DaemonFsList> {
  const r = await apiRequest<DaemonFsList>(`/api/daemon/fs/list?path=${encodeURIComponent(path)}${hostQS(host)}`, { method: 'GET' });
  if (!r.success || !r.data) throw new Error(r.error || r.message || '폴더를 불러올 수 없어요.');
  return r.data;
}

// 선택 폴더(root) 아래 파일 flat 목록 — 모바일 IDE 소스로 소비(경로는 root 기준 상대).
export interface DaemonFsTree { root: string; items: { path: string; text: boolean }[]; truncated?: boolean; }
export async function fsTree(root = '', host?: number | null): Promise<DaemonFsTree> {
  const r = await apiRequest<DaemonFsTree>(`/api/daemon/fs/tree?path=${encodeURIComponent(root)}${hostQS(host)}`, { method: 'GET' });
  if (!r.success || !r.data) throw new Error(r.error || r.message || '프로젝트를 불러올 수 없어요.');
  return r.data;
}

export async function fsRead(path: string, opts?: { base64?: boolean; host?: number | null }): Promise<DaemonFsRead> {
  // silent: 없는 파일/삭제된 파일 읽기는 예상 가능한 실패라 콘솔 소음을 억제(호출부가 조용히 재시도/스킵).
  const qs = `path=${encodeURIComponent(path)}${opts?.base64 ? '&base64=1' : ''}${hostQS(opts?.host)}`;
  const r = await apiRequest<DaemonFsRead>(`/api/daemon/fs/read?${qs}`, { method: 'GET', silent: true });
  if (!r.success || !r.data) throw new Error(r.error || r.message || '파일을 열 수 없어요.');
  return r.data;
}

// 프로젝트 폴더(root, 홈-기준 상대) 내 리터럴(대소문자무시) 검색. 데몬 오프라인이면 빈 결과.
export async function fsGrep(root: string, query: string, host?: number | null): Promise<DaemonGrepResult> {
  const q = query.trim();
  if (!q) return { matches: [], truncated: false };
  const r = await apiRequest<DaemonGrepResult>(
    `/api/daemon/fs/grep?path=${encodeURIComponent(root)}&q=${encodeURIComponent(q)}${hostQS(host)}`,
    { method: 'GET', silent: true },
  );
  return (r.success && r.data) ? r.data : { matches: [], truncated: false };
}

export async function fsWrite(path: string, content: string, host?: number | null): Promise<{ path: string; size: number }> {
  const r = await apiRequest<{ path: string; size: number }>('/api/daemon/fs/write', { method: 'POST', body: { path, content, ...hostBody(host) } });
  if (!r.success || !r.data) throw new Error(r.error || r.message || '저장에 실패했어요.');
  return r.data;
}

// ── fs 변형(생성/이름변경/삭제) — IDE 파일트리 조작 ──
export async function fsMkdir(path: string, host?: number | null): Promise<{ path: string }> {
  const r = await apiRequest<{ path: string }>('/api/daemon/fs/mkdir', { method: 'POST', body: { path, ...hostBody(host) } });
  if (!r.success || !r.data) throw new Error(r.error || r.message || '폴더 생성에 실패했어요.');
  return r.data;
}
export async function fsCreateFile(path: string, host?: number | null): Promise<{ path: string }> {
  const r = await apiRequest<{ path: string }>('/api/daemon/fs/create', { method: 'POST', body: { path, ...hostBody(host) } });
  if (!r.success || !r.data) throw new Error(r.error || r.message || '파일 생성에 실패했어요.');
  return r.data;
}
export async function fsRename(path: string, dest: string, host?: number | null): Promise<{ path: string }> {
  const r = await apiRequest<{ path: string }>('/api/daemon/fs/rename', { method: 'POST', body: { path, dest, ...hostBody(host) } });
  if (!r.success || !r.data) throw new Error(r.error || r.message || '이름 변경에 실패했어요.');
  return r.data;
}
export async function fsDelete(path: string, host?: number | null): Promise<{ path: string; deleted: boolean }> {
  const r = await apiRequest<{ path: string; deleted: boolean }>('/api/daemon/fs/delete', { method: 'POST', body: { path, ...hostBody(host) } });
  if (!r.success || !r.data) throw new Error(r.error || r.message || '삭제에 실패했어요.');
  return r.data;
}

// 특정 디렉토리 변경 감시 등록/해제(단일). 이벤트는 streamDaemonEvents 로 수신.
export async function fsWatch(path: string, host?: number | null): Promise<void> {
  await apiRequest('/api/daemon/fs/watch', { method: 'POST', body: { path, ...hostBody(host) } });
}
export async function fsUnwatch(): Promise<void> {
  await apiRequest('/api/daemon/fs/unwatch', { method: 'POST', body: {} });
}

// ── 워크스페이스(Slice2) — PC 에 결정적 스캐폴드 ──
//  위치는 항상 사용자가 피커에서 직접 선택(추천 위치 강제/유도 없음 — 사용자 확정 스펙).
export interface DaemonWsRoot {
  root: string | null;        // (구) 영구 루트(홈-기준 상대). 미지정이면 null
  protected?: boolean;        // 현재 루트가 macOS 보호폴더(Documents 등) 안이면 true
  lastParent?: string | null; // 마지막으로 워크스페이스를 만든 부모 폴더(피커 기본값)
  allowFullDisk?: boolean;    // 전체 디스크 접근 모드(홈 밖 탐색 허용)
}
// 마지막 선택 부모 폴더/전체디스크 여부 조회(피커 시작 위치용).
export async function wsGetRoot(): Promise<DaemonWsRoot> {
  const r = await apiRequest<DaemonWsRoot>('/api/daemon/ws/root', { method: 'GET' });
  if (!r.success || !r.data) throw new Error(r.error || r.message || '워크스페이스 루트를 조회할 수 없어요.');
  return {
    root: r.data.root ?? null,
    protected: r.data.protected,
    lastParent: r.data.lastParent ?? null,
    allowFullDisk: r.data.allowFullDisk === true,
  };
}
// 전체 디스크 접근 토글(홈 jail 완화). FDA 부여는 사용자 몫(안내 필요).
export async function wsSetFullDisk(enabled: boolean): Promise<boolean> {
  const r = await apiRequest<{ allowFullDisk: boolean }>('/api/daemon/ws/fulldisk', { method: 'POST', body: { enabled } });
  if (!r.success || !r.data) throw new Error(r.error || r.message || '전체 디스크 접근을 변경할 수 없어요.');
  return r.data.allowFullDisk === true;
}
// 워크스페이스 루트 지정 — 존재하는 폴더만.
export async function wsSetRoot(path: string): Promise<string> {
  const r = await apiRequest<{ root: string }>('/api/daemon/ws/root', { method: 'POST', body: { path } });
  if (!r.success || !r.data?.root) throw new Error(r.error || r.message || '워크스페이스 루트를 지정할 수 없어요.');
  return r.data.root;
}

export interface DaemonWsCreated { path: string; name: string; slug: string; gitInit?: boolean; designated?: boolean; remoteUrl?: string; }
// 워크스페이스 생성/지정.
//  · path 지정(designate): 선택한 폴더 "자체"를 워크스페이스로 사용(하위폴더 생성 X, 이름=폴더명). ← 기본 흐름
//  · (레거시) name+parentPath: 부모 아래 <name> 하위폴더 스캐폴드.
export async function wsCreate(opts: { name?: string; path?: string; parentPath?: string }): Promise<DaemonWsCreated> {
  const body: { name?: string; path?: string; parentPath?: string } = {};
  if (opts.name) body.name = opts.name;
  if (opts.path) body.path = opts.path;
  if (opts.parentPath) body.parentPath = opts.parentPath;
  const r = await apiRequest<DaemonWsCreated>('/api/daemon/ws/create', { method: 'POST', body });
  if (!r.success || !r.data?.path) throw new Error(r.error || r.message || 'PC 에 워크스페이스를 지정할 수 없어요.');
  return r.data;
}

export interface DaemonWsCloned { path: string; name: string; slug: string; owner: string; repo: string; remoteUrl?: string; }
// GitHub 레포를 선택한 부모 폴더 아래로 git clone. url=레포 clone URL(https). name 미지정이면 레포명.
//  parentPath: 사용자가 고르는 목적지 부모. clone 은 네트워크 fetch라 오래 걸릴 수 있음(백엔드 타임아웃 120s).
export async function wsClone(url: string, name?: string, parentPath?: string): Promise<DaemonWsCloned> {
  const body: { url: string; name?: string; parentPath?: string } = { url, name };
  if (parentPath) body.parentPath = parentPath;
  const r = await apiRequest<DaemonWsCloned>('/api/daemon/ws/clone', { method: 'POST', body });
  if (!r.success || !r.data?.path) throw new Error(r.error || r.message || '레포를 가져올 수 없어요.');
  return r.data;
}

// ── 프리뷰(P2) — PC dev 서버를 폰 웹뷰로 ──
// PC 에서 LISTEN 중인 포트 감지 + 그 포트로의 무인증 프록시 토큰 발급.
export async function previewPorts(cwd = '', host?: number | null): Promise<number[]> {
  // cwd(워크스페이스 폴더, 홈-기준 상대) — 그 폴더 안에서 실행 중인 프로세스의 포트만 감지.
  const qs = `?cwd=${encodeURIComponent(cwd)}${hostQS(host)}`;
  const r = await apiRequest<{ ports: number[] }>(`/api/daemon/preview/ports${qs}`, { method: 'GET', silent: true });
  if (!r.success || !r.data) throw new Error(r.error || r.message || 'PC 포트를 조회할 수 없어요.');
  return r.data.ports || [];
}
export async function previewStart(port: number, host?: number | null): Promise<{ token: string; url: string; port: number }> {
  const r = await apiRequest<{ token: string; url: string; port: number }>('/api/daemon/preview/start', { method: 'POST', body: { port, ...hostBody(host) } });
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

// 온보딩 점검 — claude/tmux 설치 여부 + 로그인 상태. 로그인 확인은 claude 자체 `auth status`
// (토큰 미노출·loggedIn/계정 라벨만)로만 — 크레덴셜 파일은 데몬이 열지 않는다(BYO).
export interface DaemonLoginStatus {
  loggedIn: boolean;
  authMethod?: string | null;      // 'claude.ai' | 'console' 등
  email?: string | null;
  subscriptionType?: string | null; // 'max' | 'pro' 등
}
export interface DaemonDoctor {
  claude: { installed: boolean; version: string | null; bin: string; error?: string };
  tmux: { installed: boolean; path: string | null };
  platform?: string;
  login?: DaemonLoginStatus & { probed: boolean };
}
export async function agentDoctor(): Promise<DaemonDoctor> {
  const r = await apiRequest<DaemonDoctor>('/api/daemon/agent/doctor', { method: 'GET', silent: true });
  if (!r.success || !r.data) throw new Error(r.error || r.message || '점검할 수 없어요.');
  return r.data;
}

// ── BYO 로그인(M5 Slice2) — 활성 러너(클라우드 컨테이너/PC)에서 사용자 claude 계정 로그인 ──
// 크레덴셜(토큰)은 그 러너에만 안착. 앱은 인증 URL 을 인앱브라우저로 열고, 콜백페이지에서
// 사용자가 복사한 인증 코드를 되돌려줄 뿐이다. runnerId 미지정 시 활성 러너로 라우팅.
// 로그인 시작 → 인증 URL(사용자가 인앱브라우저로 열어야 함). PTY 는 코드 입력 대기 상태로 유지.
export async function agentLoginStart(opts?: { runnerId?: number; useConsole?: boolean }): Promise<{ url: string; authMethod?: string }> {
  const r = await apiRequest<{ url: string; authMethod?: string }>('/api/daemon/agent/login', { method: 'POST', body: { runnerId: opts?.runnerId, useConsole: opts?.useConsole } });
  if (!r.success || !r.data?.url) throw new Error(r.error || r.message || '로그인을 시작할 수 없어요.');
  return r.data;
}
// 인증 코드 제출 → 로그인 완료(진위는 러너의 auth status 로 확정).
export async function agentLoginSubmit(code: string, opts?: { runnerId?: number }): Promise<{ ok: boolean; message?: string; status?: DaemonLoginStatus }> {
  const r = await apiRequest<{ ok: boolean; message?: string; status?: DaemonLoginStatus }>('/api/daemon/agent/login/submit', { method: 'POST', body: { code, runnerId: opts?.runnerId } });
  if (!r.success || !r.data) throw new Error(r.error || r.message || '코드를 제출할 수 없어요.');
  return r.data;
}
export async function agentLoginCancel(opts?: { runnerId?: number }): Promise<void> {
  await apiRequest('/api/daemon/agent/login/cancel', { method: 'POST', body: { runnerId: opts?.runnerId }, silent: true });
}
export async function agentLoginStatus(opts?: { runnerId?: number }): Promise<DaemonLoginStatus> {
  const qs = opts?.runnerId != null ? `?runnerId=${opts.runnerId}` : '';
  const r = await apiRequest<DaemonLoginStatus>(`/api/daemon/agent/login/status${qs}`, { method: 'GET', silent: true });
  if (!r.success || !r.data) throw new Error(r.error || r.message || '로그인 상태를 확인할 수 없어요.');
  return r.data;
}

// ── 동기화(M4) — objectstore git-bundle 체크포인트/머티리얼라이즈/충돌 ──────────────
export interface DaemonCheckpoint {
  id?: string; checkpointId?: string; reason?: string; at?: string;
  baseCommit?: string | null; commit?: string | null;
  bundleKey?: string; sessionKey?: string | null;
  sizeBytes?: number; hasSession?: boolean;
  skipped?: boolean; unchanged?: boolean; // 변경 없어 중복제거된 경우(자동 체크포인트).
}
export interface SyncStatus {
  state: 'clean' | 'syncing' | 'conflict';
  base: string | null; head: string | null; dirty: boolean;
  lastCheckpointId?: string | null; lastAt?: string | null;
}
export interface MaterializeResult {
  checkpointId: string; targetCwd: string;
  restored?: boolean; restoredSessions?: number; baseCommit?: string | null;
  conflict?: boolean; conflictId?: string; files?: string[]; merged?: boolean;
}
export interface SyncConflictFile { path: string; kind: 'text' | 'binary'; }
// 데몬 sync 이벤트 프레임(진행/상태/충돌) — 백엔드가 sync_event 로 팬아웃.
export interface DaemonSyncEvent {
  type: 'sync_progress' | 'sync_status' | 'sync_conflict';
  phase?: 'checkpoint' | 'upload' | 'materialize' | 'reinstall' | 'wake' | 'dormant';
  state?: 'clean' | 'syncing' | 'conflict';
  checkpointId?: string; conflictId?: string; pct?: number;
  head?: string; base?: string | null; lastCheckpointId?: string;
  files?: SyncConflictFile[]; canBulkPick?: boolean;
}

// 체크포인트 생성 — shadow 커밋 + 번들 업로드(데몬↔objectstore 직결). workspaceId 로 소유권/manifest 키.
// cwd: 스냅샷 대상 폴더 오버라이드(역방향 핸드오프 — 클라우드 실폴더서 찍기). 미지정=워크스페이스 localPath.
// background=true: 즉시 accepted 응답 — 대형 번들은 압축+업로드가 분 단위라 동기 대기는 CF 524 타임아웃.
//  자동 트리거처럼 결과를 안 쓰는 호출은 background 로. 완료는 sync_event/체크포인트 목록으로 확인.
export async function syncCheckpoint(workspaceId: string, reason = 'manual', cwd?: string, background = false): Promise<DaemonCheckpoint> {
  const r = await apiRequest<DaemonCheckpoint>('/api/daemon/sync/checkpoint', { method: 'POST', body: { workspaceId, reason, cwd, background } });
  if (!r.success || !r.data) throw new Error(r.error || r.message || '체크포인트를 만들 수 없어요.');
  return r.data;
}
// 다른 폴더(러너)에 복원 — targetCwd 는 데몬 홈-기준 상대경로. 충돌이면 result.conflict=true.
export async function syncMaterialize(workspaceId: string, opts: { checkpointId?: string; targetCwd: string; reinstall?: boolean }): Promise<MaterializeResult> {
  const r = await apiRequest<MaterializeResult>('/api/daemon/sync/materialize', { method: 'POST', body: { workspaceId, ...opts } });
  if (!r.success || !r.data) throw new Error(r.error || r.message || '복원할 수 없어요.');
  return r.data;
}
export async function syncStatus(workspaceId: string, cwd?: string): Promise<SyncStatus> {
  const qs = `workspaceId=${encodeURIComponent(workspaceId)}${cwd ? `&cwd=${encodeURIComponent(cwd)}` : ''}`;
  const r = await apiRequest<SyncStatus>(`/api/daemon/sync/status?${qs}`, { method: 'GET', silent: true });
  if (!r.success || !r.data) throw new Error(r.error || r.message || '상태를 확인할 수 없어요.');
  return r.data;
}
export async function syncResolve(workspaceId: string, opts: { conflictId: string; choices?: { path: string; side: 'local' | 'cloud' }[]; bulk?: 'local' | 'cloud' }): Promise<{ resolved: number; rescueBranch: string; head: string }> {
  const r = await apiRequest<{ resolved: number; rescueBranch: string; head: string }>('/api/daemon/sync/resolve', { method: 'POST', body: { workspaceId, ...opts } });
  if (!r.success || !r.data) throw new Error(r.error || r.message || '충돌을 해결할 수 없어요.');
  return r.data;
}
export async function listCheckpoints(workspaceId: string): Promise<{ head: unknown; checkpoints: DaemonCheckpoint[] }> {
  const r = await apiRequest<{ head: unknown; checkpoints: DaemonCheckpoint[] }>(`/api/daemon/sync/checkpoints?workspaceId=${encodeURIComponent(workspaceId)}`, { method: 'GET', silent: true });
  return (r.success && r.data) ? r.data : { head: null, checkpoints: [] };
}

/**
 * 동기화 이벤트(sync_progress/sync_status/sync_conflict) 구독 — SSE(/api/daemon/events)의 sync_event 프레임 필터.
 *  백엔드 fanoutSyncEvent 가 SSE+WSS 양쪽에 보낸다. 여기선 독립 SSE 로 받아 진행/충돌 UI 를 갱신한다.
 *  fs_event 용 streamDaemonEvents 와 동일 스켈레톤(별도 구독, 팬아웃). @returns 해제 함수.
 */
export function subscribeDaemonSyncEvents(
  onSync: (e: DaemonSyncEvent) => void,
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
      if (msg && msg.type === 'sync_event' && msg.event) onSync(msg.event as DaemonSyncEvent);
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

export default { getStatus, activateRunner, ensureCloudRunner, createPairCode, approvePairSession, revokeDevice, listDevices, registerController, getDeviceUuid, getClientKey, getWorkspaceSession, putWorkspaceSession, claimWorkspace, startTerminal, buildTerminalWsUrl, listTerminals, poolMutationCount, newTerminal, selectTerminal, unviewTerminal, closeTerminal, fsList, fsTree, fsRead, fsWrite, fsMkdir, fsCreateFile, fsRename, fsDelete, fsWatch, fsUnwatch, fsGrep, streamDaemonEvents, wsGetRoot, wsSetRoot, wsSetFullDisk, wsCreate, wsClone, previewPorts, previewStart, buildDaemonPreviewUrl, agentDoctor, agentLoginStart, agentLoginSubmit, agentLoginCancel, agentLoginStatus, syncCheckpoint, syncMaterialize, syncStatus, syncResolve, listCheckpoints, subscribeDaemonSyncEvents };
