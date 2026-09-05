import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { apiRequest, api, refreshAccessToken } from '../utils/api';
import { BACK_URL, RELAY_WS_URL } from '../utils/service';
import * as i18n from '../i18n/index.ts';

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
  return i18n.t('모바일');
}
// 이 기기의 표시 이름(--on 타겟팅/기기 목록용). 정적(플랫폼 기반).
export function getDeviceLabel(): string { return deviceLabel(); }

// 이 기기의 계정 레지스트리 id(DaemonDevice) — 기기 타겟팅용. registerController 성공 시 채워지고
//  AsyncStorage 에 영속돼 다음 세션 접속 시 ui_hello 에 즉시 동봉된다(등록 완료 전이면 null).
const MY_DEVICE_ID_KEY = 'cpt.myDeviceId';
let myDeviceIdCache: number | null | undefined;
export async function getMyDeviceId(): Promise<number | null> {
  if (myDeviceIdCache !== undefined) return myDeviceIdCache;
  try { const v = await AsyncStorage.getItem(MY_DEVICE_ID_KEY); myDeviceIdCache = v ? Number(v) : null; } catch (_) { myDeviceIdCache = null; }
  return myDeviceIdCache ?? null;
}

// 컨트롤러(이 모바일/태블릿)를 계정에 등록 → "내 기기" 목록에 노출. 로그인/부팅 시 1회.
export async function registerController(): Promise<{ deviceId: number } | null> {
  const deviceUuid = await getDeviceUuid();
  const r = await apiRequest<{ deviceId: number }>('/api/daemon/devices/register', {
    method: 'POST',
    body: { deviceUuid, deviceName: deviceLabel(), platform: Platform.OS },
    silent: true,
  });
  if (r.success && r.data) {
    myDeviceIdCache = r.data.deviceId;
    try { await AsyncStorage.setItem(MY_DEVICE_ID_KEY, String(r.data.deviceId)); } catch (_) { /* noop */ }
    return r.data;
  }
  return null;
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
  // 그 호스트가 들고 있는 E2EE 열쇠 세대(0 = 열쇠 없음 = 평문). back listRunners 가 이미 내려준다
  //  (daemonRelayService.js:89). **표시 전용** — 자물쇠 배지 시드용이고 게이팅 근거가 아니다.
  e2eeEpoch?: number;
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
  if (!r.success || !r.data) throw new Error(r.error || r.message || i18n.t('데몬 상태를 불러올 수 없어요.'));
  const runners = r.data.runners || [];
  // 호스트별 자물쇠 배지 시드(계약 §2.7 "runner_status 는 캐치업이 필수다" 의 보강 경로).
  //  runner_status 팬아웃은 러너 **연결 시**와 hello 의 **값 변화 시** 둘뿐이라, 이미 붙어 있는 정상
  //  상태에서 앱을 다시 열면 프레임이 0건이고 배지가 '확인 중' 에 고착한다. 여기서 폴링 응답으로
  //  같은 값을 채워 그 구멍을 닫는다(두 경로는 상호 배타가 아니다).
  //  ⚠ 목록에 없는 호스트는 **건드리지 않는다** — 이 응답은 붙어 있는 러너만 담으므로 오프라인 오탐이
  //   원리적으로 불가능해야 한다(replayRunnerStatus 가 online:true 만 보내는 것과 같은 규율).
  //  ⚠ 지연 require = 순환 방지(hostLock 은 의존성이 없지만 규약을 맞춘다).
  try {
    const hostLock = require('./e2ee/hostLock').default;
    // 값이 바뀔 때만 내부에서 emit 한다(8초 폴링이 매번 리렌더를 부르지 않는다).
    for (const run of runners) {
      if (run && run.deviceId != null) hostLock.setHostE2eeEpoch(Number(run.deviceId), run.e2eeEpoch ?? 0);
    }
  } catch (_) { /* 시드는 보조 경로다 — 실패해도 runner_status 가 정본으로 채운다 */ }
  return { ...r.data, runners };
}

// M5 Slice4 — 활성 러너 전환(핸드오프). runnerId 또는 kind('local'|'cloud').
export async function activateRunner(target: number | { kind: 'local' | 'cloud' }): Promise<{ active: number; runners: DaemonRunner[] }> {
  const body = typeof target === 'number' ? { runnerId: target } : { kind: target.kind };
  const r = await apiRequest<{ active: number; runners: DaemonRunner[] }>('/api/daemon/runner/activate', { method: 'POST', body });
  if (!r.success || !r.data) throw new Error(r.error || r.message || i18n.t('러너를 전환할 수 없어요.'));
  return r.data;
}

// M5 Slice4 — 워크스페이스용 클라우드 러너 확보(프로비저닝+컨테이너 기동). 핸드오프 진입점.
//  needsManualRun=true 면 로컬 dev(docker.sock 없음) — back 콘솔의 docker run 명령으로 수동 기동.
// wasDormant=true 면 동면(scale-to-zero)에서 깨우는 콜드스타트 — 볼륨에 크레덴셜·코드가 이미 존재(재로그인·materialize 불필요).
export async function ensureCloudRunner(workspaceId: string): Promise<{ runnerId: number; launched: boolean; needsManualRun: boolean; wasDormant?: boolean }> {
  const r = await apiRequest<{ runnerId: number; launched: boolean; needsManualRun: boolean; wasDormant?: boolean }>('/api/daemon/runner/cloud/ensure', { method: 'POST', body: { workspaceId } });
  if (!r.success || !r.data) throw new Error(r.error || r.message || i18n.t('클라우드 러너를 준비할 수 없어요.'));
  return r.data;
}

// 페어링 코드 발급(레거시) — PC 에서 입력할 일회용 코드(10분).
export async function createPairCode(): Promise<{ code: string; expiresAt: string }> {
  const r = await apiRequest<{ code: string; expiresAt: string }>('/api/daemon/pair/code', { method: 'POST' });
  if (!r.success || !r.data?.code) throw new Error(r.error || r.message || i18n.t('페어링 코드를 발급할 수 없어요.'));
  return r.data;
}

// QR 승인(넷플릭스 방식) — PC 화면의 QR/코드를 이 계정으로 승인해 기기를 등록한다.
//  PC 가 세션을 만들고 code 를 QR 로 표시 → 이 앱(로그인됨)이 그 code 를 승인 → PC 가 토큰을 받아 연결.
// PC QR 승인. E2EE(기능2): 응답에 그 PC 데몬의 기기 공개키(e2ee.ikX)가 실려 오면 열쇠를 전달할 수
//  있다 → 호출부가 QR 의 `k=`(지문) 와 대조한 뒤 grant 를 올린다. **추가 탭 0회**(설계 §3.2).
//  구 서버는 e2ee 를 안 실어 보낸다 → 그냥 기존 페어링(평문)으로 끝난다(무마찰).
export async function approvePairSession(code: string): Promise<{
  deviceId: number; deviceName: string;
  /** 그 PC 데몬의 E2EE 신원 공개키 + 계정 epoch. needsGrant=true 면 앱이 /pair/grant 로 봉인문을 올린다. */
  e2ee?: { ikX?: string; ikEd?: string | null; epoch?: number; needsGrant?: boolean } | null;
}> {
  const r = await apiRequest<{ deviceId: number; deviceName: string; e2ee?: { ikX?: string; ikEd?: string | null; epoch?: number; needsGrant?: boolean } | null }>('/api/daemon/pair/approve', {
    method: 'POST',
    body: { code: String(code || '').trim().toUpperCase() },
  });
  if (!r.success || !r.data?.deviceId) throw new Error(r.error || r.message || i18n.t('연결 코드가 유효하지 않거나 만료되었어요.'));
  return r.data;
}

export async function revokeDevice(deviceId: number): Promise<void> {
  const r = await apiRequest(`/api/daemon/devices/${deviceId}/revoke`, { method: 'POST' });
  if (!r.success) throw new Error(r.error || r.message || i18n.t('기기 해제에 실패했어요.'));
}

// 프로필(닉네임) 수정 — deviceToken/JWT. PATCH /api/daemon/me (PC settings.js 미러).
export async function updateNickname(nickname: string): Promise<void> {
  const r = await apiRequest('/api/daemon/me', { method: 'PATCH', body: { nickname } });
  if (!r.success) throw new Error(r.error || r.message || i18n.t('닉네임 저장에 실패했어요.'));
}

// 회원 탈퇴(토큰 기반, 본인 계정) — id 를 몰라도 확실히 탈퇴. 서버가 기기/클라우드/objectstore/DB 정리.
export async function deleteAccount(): Promise<void> {
  const r = await apiRequest('/api/daemon/account', { method: 'DELETE' });
  if (!r.success) throw new Error(r.error || r.message || i18n.t('회원 탈퇴에 실패했어요.'));
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
  if (!r.success || !r.data) throw new Error(r.error || r.message || i18n.t('기기 목록을 불러올 수 없어요.'));
  return { devices: r.data.devices || [], currentDeviceId: r.data.currentDeviceId ?? null };
}

export async function renameOwnDevice(deviceId: number, name: string): Promise<void> {
  const deviceUuid = await getDeviceUuid();
  const r = await apiRequest(`/api/daemon/devices/${deviceId}/name`, {
    method: 'PATCH',
    headers: { 'x-device-uuid': deviceUuid },
    body: { name: String(name || '').trim() },
  });
  if (!r.success) throw new Error(r.error || r.message || i18n.t('기기 별칭을 저장하지 못했어요.'));
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
  if (!r.success) throw new Error(r.error || r.message || i18n.t('워크스페이스 귀속에 실패했어요.'));
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
  // terminalProtocol 3 = CPT3(데몬 VT 정본 + 소유자 1명, codingpt_daemon/docs/terminal-v3-design.md). deviceName 은 소유권 표시용.
  const body: { cwd: string; paneId: string; win?: number; client: string; terminalProtocol: 3; deviceName: string; hostDeviceId?: number } = { cwd, paneId, client: await getClientKey(), terminalProtocol: 3, deviceName: deviceLabel(), ...hostBody(host) };
  if (Number.isInteger(win)) body.win = win;
  const r = await apiRequest<{ token: string }>('/api/daemon/terminal/start', { method: 'POST', body, timeoutMs: 15000 });
  if (!r.success || !r.data?.token) throw new Error(r.error || r.message || i18n.t('PC 터미널을 시작할 수 없어요.'));
  return r.data.token;
}

export function buildTerminalWsUrl(token: string): string {
  // 터미널 PTY 스트림(키 입력 경로) = 저지연 직결 릴레이(RELAY_WS_URL). REST 는 CF 유지.
  return `${RELAY_WS_URL}/api/daemon/terminal/${token}`;
}

// ── 멀티 터미널(tmux window) — 클라우드 ideService 와 동일한 window 스위칭 모델.
// 단일 PTY 스트림이 세션에 attach 돼 있고, select 로 활성 window 를 바꾸면 그 화면을 따라간다.
// 공유 풀 모델: 터미널 실체 = 워크스페이스 풀(primary tmux 세션)의 window(전 기기 공유, 이름 포함).
//  pane = 이 기기 전용 뷰 세션(link-window). list/new/close=풀, select(view)/unview=이 기기 pane.
// 터미널 목록 행 — index/name/command 는 데몬 pty.js:listTerminals 원천(name 은 window_name,
//  automatic-rename 이면 pane_title 그대로라 에이전트 글리프가 여기 실려 온다).
//  agent/agentState = 데몬이 **additive** 로 싣는 정규화된 에이전트 판정(Chat 토글 폴백 2순위).
//  구 데몬은 두 필드를 아예 보내지 않는다 → undefined = "모름"(부정 아님). back 은 pass-through 다
//  (daemonController.terminalList → callRpc 결과 그대로) 이므로 서버 수정 없이 도달한다.
export interface DaemonTerminalWindow {
  index: number; name: string; command: string; active?: boolean;
  agent?: string | boolean | null;
  /** 에이전트 이름('claude'|'codex'|'gemini'…). 채팅이 읽을 대화 로그 포맷을 정하는 근거. */
  agentName?: string | null;
  agentReady?: boolean | null;
  agentState?: string | null;
}

export async function listTerminals(cwd = '', host?: number | null): Promise<DaemonTerminalWindow[]> {
  const r = await apiRequest<{ windows: DaemonTerminalWindow[] }>(
    `/api/daemon/terminal/list?cwd=${encodeURIComponent(cwd)}${hostQS(host)}`,
    { method: 'GET', silent: true, timeoutMs: 15000 },
  );
  // 실패를 빈 목록으로 뭉개면 안 됨 — 리컨실러가 "전부 삭제됨"으로 오판해 레이아웃을 전멸시킨다.
  if (!r.success) throw new Error(r.error || r.message || i18n.t('터미널 목록 조회 실패'));
  return r.data?.windows || [];
}

// 풀 변이 카운터 — 리컨실러가 "조회 시작 후 풀이 바뀌었는지"를 판별해 스테일 스냅샷 적용을 막는다.
let poolMutations = 0;
export const poolMutationCount = (): number => poolMutations;

export async function newTerminal(cwd = '', paneId = '', host?: number | null): Promise<{ index: number; name: string }> {
  // 풀에 새 터미널 생성(전 기기에 나타남). 이름("터미널 N")은 데몬이 풀 기준으로 부여.
  // paneId — 요청 pane 의 클라이언트 크기로 창을 즉시 맞춰 첫 표시에서 리사이즈 재프롬프트가 안 쌓이게.
  const r = await apiRequest<{ index: number; name: string }>('/api/daemon/terminal/new', { method: 'POST', body: { cwd, paneId, client: await getClientKey(), ...hostBody(host) }, timeoutMs: 15000 });
  if (!r.success || !r.data) throw new Error(r.error || r.message || i18n.t('새 터미널을 열 수 없어요.'));
  poolMutations += 1;
  return r.data;
}

// ── 에이전트 관리(2026-07-27) — 이 PC 에 설치된 AI CLI ──────────────────────────
// 등급(tier)은 **PC/데몬과 같은 값**이다: 'full'(claude — 상태·원격승인·알림) / 'partial'(codex —
//  알림+원격승인, 훅은 codex 화면에서 1회 신뢰 필요·"다음부터 묻지 않기" 없음) / 'launch'(그 외 —
//  실행만). UI 는 이 값을 그대로 표시해야 한다. 뭉개면 사용자가 오지 않는 승인 카드를 기다린다.
export interface DaemonAgent {
  id: string;
  name: string;
  bin: string;
  tier: 'full' | 'partial' | 'launch';
  docs: string;
  install: { label: string; cmd: string }[];
  installed: boolean;
  path: string | null;
  version: string | null;
  wirable: boolean;
  wired: boolean;
  decided: boolean;
}
type AgentsReply = { agents: DaemonAgent[]; onboardedAt: string | null };

export async function listAgents(host?: number | null, refresh = false): Promise<AgentsReply> {
  const q = new URLSearchParams();
  if (refresh) q.set('refresh', '1');
  if (host != null) q.set('hostDeviceId', String(host));
  const r = await apiRequest<AgentsReply>(`/api/daemon/agents${q.toString() ? '?' + q.toString() : ''}`, { method: 'GET', silent: true, timeoutMs: 20000 });
  // 실패를 빈 목록으로 뭉개지 않는다(설치 안내 화면이 "아무것도 없음"으로 보이면 원인 추적 불가).
  if (!r.success || !r.data) throw new Error(r.error || r.message || i18n.t('에이전트 목록을 가져올 수 없어요.'));
  return { agents: r.data.agents || [], onboardedAt: r.data.onboardedAt || null };
}

export async function wireAgent(id: string, on: boolean, host?: number | null): Promise<AgentsReply> {
  const r = await apiRequest<AgentsReply>('/api/daemon/agents/wire', { method: 'POST', body: { id, on, ...hostBody(host) }, timeoutMs: 25000 });
  if (!r.success || !r.data) throw new Error(r.error || r.message || i18n.t('연동 설정을 바꿀 수 없어요.'));
  return { agents: r.data.agents || [], onboardedAt: r.data.onboardedAt || null };
}

export async function rescanAgents(host?: number | null, markOnboarded = false): Promise<AgentsReply> {
  const r = await apiRequest<AgentsReply>('/api/daemon/agents/rescan', { method: 'POST', body: { markOnboarded, ...hostBody(host) }, timeoutMs: 25000 });
  if (!r.success || !r.data) throw new Error(r.error || r.message || i18n.t('다시 확인할 수 없어요.'));
  return { agents: r.data.agents || [], onboardedAt: r.data.onboardedAt || null };
}

/** 이미 만든 터미널(index)에서 에이전트를 실행. 셸 준비 대기는 데몬이 판정한다(ready 로 회신). */
export async function launchAgent(cwd: string, index: number, id: string, host?: number | null): Promise<{ ok: boolean; ready?: boolean; busy?: boolean; command?: string }> {
  const r = await apiRequest<{ ok: boolean; ready?: boolean; busy?: boolean; command?: string }>('/api/daemon/agents/launch', { method: 'POST', body: { cwd, index, id, ...hostBody(host) }, timeoutMs: 30000 });
  if (!r.success || !r.data) throw new Error(r.error || r.message || i18n.t('에이전트를 실행할 수 없어요.'));
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

// ── 봉인 RPC 경유 fs(기능2 E2EE) ────────────────────────────────
//  서버가 파일 내용·경로·grep 결과를 보지 못하게 봉투로 감싸 보낸다(설계 §2.5).
//  ★ 폴백 규율: 봉인이 **불가능/미지원**일 때만 기존 평문 REST 로 내려간다(mayFallback 판정).
//    진짜 실패(파일 없음·권한·타임아웃)는 절대 삼키지 않고 throw 한다 — 빈 결과를 돌려주면
//    리컨실러가 "터미널 0개"로 오판해 레이아웃을 지운 과거 사고가 재현된다(설계 §6-5).
async function sealedFs<T>(method: string, params: Record<string, unknown>, host?: number | null, timeoutMs?: number): Promise<T | null> {
  const e2ee = require('./e2ee').default as typeof import('./e2ee').default;
  //  rpcAvailable = 열쇠/정책 OK + "서버 미지원" 네거티브 캐시가 만료됨(404 왕복 반복 방지).
  if (!e2ee.rpcAvailable()) {
    // policy='required' 에서는 평문으로 내려가지 않는다(다운그레이드 차단) — 사유를 그대로 보여준다.
    const gate = e2ee.gateReason();
    if (gate) throw new Error(gate);
    return null; // 평문 경로로(기본 'preferred' = 무마찰)
  }
  try {
    return await e2ee.sealedRpc<T>(method, params, { hostDeviceId: host ?? null, timeoutMs });
  } catch (e) {
    if (e2ee.mayFallback(e)) return null; // 구 데몬/미지원 → 평문 폴백(무마찰)
    throw e;
  }
}

// ── LAN 직결 경유 fs(기능4 F2) ──────────────────────────────────────────
//  우선순위: ① LAN 직결(서버를 아예 안 지남) → ② 봉인 RPC(서버 경유·내용 비공개) → ③ 평문 REST.
//  ★ null = "LAN 을 쓰지 않는다"는 **정상 분기**다. 진짜 실패(파일 없음/권한)는 lanLink.rpc 가 throw 하고
//    그대로 위로 올라간다 — 빈 결과로 뭉개면 리컨실러가 오판해 레이아웃을 지운다(설계 §5.3).
//  ★ 대상 호스트가 명시되지 않은 호출(host==null = 활성 러너 라우팅)은 직결하지 않는다: 어느 PC 인지
//    서버만 알고 있어 grant 대상을 특정할 수 없다.
//  ★ fs.watch/unwatch 는 **절대** LAN 으로 보내지 않는다 — 데몬 fs.js 의 watcher 가 프로세스 전역
//    단일이라 LAN watch 가 릴레이 watch 를 죽여 IDE 라이브 동기화가 조용히 깨진다(설계 §5.6).
async function lanFs<T>(method: string, params: Record<string, unknown>, host?: number | null, timeoutMs?: number): Promise<T | null> {
  if (host == null) return null;
  try {
    // E2EE 정책이 'required' 면 평문 LAN leg 를 쓰지 않는다(다운그레이드 금지) — 봉인 경로 유지.
    //  판정은 lanLink.plaintextAllowed() 한 곳에 있다(화면 영상도 같은 규칙을 쓴다).
    const lan = require('./lanLink').default as typeof import('./lanLink').default;
    if (!lan.plaintextAllowed()) return null;
  } catch (_) { /* e2ee 미초기화 — 계속 진행 */ }
  const lanLink = require('./lanLink').default as typeof import('./lanLink').default;
  if (!lanLink.shouldDirect(host, 'rpc')) { lanLink.maybePromote(host); return null; }
  return lanLink.rpc<T>(host, method, params, timeoutMs);
}

// ── 코드 리뷰(2026-08-04) ──
// 세션은 **그 워크스페이스를 호스팅하는 PC 데몬 메모리**에 있다. 서버는 중계만 한다.
//  조회가 POST 인 이유: `ws:''`(홈 루트)가 쿼리스트링 헬퍼에서 조용히 사라진다.
export interface ReviewSubmissionFile {
  path: string;
  verdict: string;
  hunks: { index: number; decision: string }[];
  comments: { hunk: number; side: 'old' | 'new'; line: number | null; text: string }[];
}


// ── 모바일 화면(에뮬레이터·시뮬레이터·붙어 있는 실기기) ──────────────────────
export interface EmulatorDevice {
  id: string;                       // `android:<serial>` | `avd:<이름>` | `ios:<udid>`
  kind: 'android' | 'ios';
  name: string;
  state: 'booted' | 'shutdown' | string;
  physical?: boolean;
  /**
   * AVD 이름 — 꺼진 것과 켜진 것을 **잇는 유일한 끈**이다.
   *  꺼져 있을 땐 `avd:Pixel_9a`, 켜지면 `android:emulator-5554` 로 id 가 통째로 바뀌기 때문에,
   *  "켜기"를 누른 화면은 이 이름으로 새 행을 찾아 따라가야 한다(2026-08-05 실사고).
   */
  avdName?: string;
  //  keys = 이 기기가 **실제로 받는** 버튼줄(안드로이드 3버튼 / iOS 홈·잠금·Siri). 화면은 이것만 그린다.
  caps?: { frame?: boolean; input?: boolean; inputHint?: string; keys?: string[] };
}
export async function emulatorList(host?: number | null) {
  const r = await apiRequest<{ devices: EmulatorDevice[]; tools: Record<string, boolean> }>('/api/daemon/emulator/list', {
    method: 'POST',
    body: { ...(host != null ? { hostDeviceId: host } : {}) },
  });
  if (!r.success) throw new Error(r.error || r.message || i18n.t('기기 목록을 불러오지 못했어요.'));
  return r.data as { devices: EmulatorDevice[]; tools: Record<string, boolean> };
}
export async function emulatorFrame(id: string, opts: { maxWidth?: number; quality?: number }, host?: number | null) {
  const r = await apiRequest<{ mime: string; base64: string; width: number; height: number; bytes: number }>('/api/daemon/emulator/frame', {
    method: 'POST',
    body: { id, ...opts, ...(host != null ? { hostDeviceId: host } : {}) },
  });
  if (!r.success) throw new Error(r.error || r.message || i18n.t('화면을 가져오지 못했어요.'));
  return r.data as { mime: string; base64: string; width: number; height: number; bytes: number };
}
/**
 * 조작 한 번. **LAN 직결이 열려 있으면 그 길로 간다** — 서버를 아예 안 지난다.
 *
 * ★ 왜(2026-08-06 실측): 프로덕션 back 왕복이 **260~490ms**(Cloudflare + 홈서버)다. 영상은 이미
 *  LAN 직결(96~109ms)로 흐르는데 손가락만 그 왕복을 타고 있어서, 30fps 로 움직이는 그림 위에서
 *  손끝이 0.3초 뒤에 따라왔다 — 폰에서 "스와이프가 굼뜨다" 던 체감의 정체다(PC 는 데몬과 같은
 *  기계라 이 왕복이 애초에 없다). 등급은 영상과 같은 'emu' 다(데몬 lan.js EMU_RPC_ALLOW 주석).
 * ★ LAN 이 없거나 끊기면 **조용히** 릴레이로 간다(null = 정상 분기). 문구를 만들지 않는다.
 */
export async function emulatorInput(body: Record<string, unknown>, host?: number | null) {
  if (host != null) {
    try {
      const lanLink = require('./lanLink').default as typeof import('./lanLink').default;
      //  게이트는 영상(openEmu)과 **같은 것**을 쓴다 — lanLink.emuRpc 주석 참고.
      const viaLan = await lanLink.emuRpc<{ ok: boolean }>(host, 'emulator.input', { ...body }, 8000);
      if (viaLan) return viaLan;
    } catch (e) {
      //  데몬이 돌려준 논리 실패(보낼 수 없는 키 등)는 그대로 올린다 — 릴레이로 다시 보내 봐야 같다.
      throw new Error(String((e as Error)?.message || e));
    }
  }
  const r = await apiRequest<{ ok: boolean }>('/api/daemon/emulator/input', {
    method: 'POST',
    body: { ...body, ...(host != null ? { hostDeviceId: host } : {}) },
  });
  if (!r.success) throw new Error(r.error || r.message || i18n.t('조작을 보내지 못했어요.'));
  return r.data;
}
/**
 * 라이브 화면(H.264) 표 — 바이트는 WS 로만 흐른다(`buildEmulatorStreamWsUrl`).
 *  안드로이드만 된다. iOS 시뮬레이터는 이 인코더 경로가 없어 프레임 폴링을 쓴다.
 */
export async function emulatorStreamToken(id: string, host?: number | null): Promise<string> {
  const r = await apiRequest<{ token: string }>('/api/daemon/emulator/stream', {
    method: 'POST', body: { id, ...hostBody(host) }, silent: true, timeoutMs: 15000,
  });
  if (!r.success || !r.data?.token) throw new Error(r.error || r.message || i18n.t('라이브 화면을 열 수 없어요.'));
  return r.data.token;
}
export function buildEmulatorStreamWsUrl(token: string): string {
  return `${BACK_URL.replace(/^http/, 'ws')}/api/daemon/emustream/${encodeURIComponent(token)}`;
}

/**
 * 직접 연결(WebRTC) — 외부망에서 서버를 우회하는 경로.
 *  시그널링(offer/answer)만 back 을 지나고 **영상은 안 지난다**. 그래서 P2P 가 뚫리면
 *  서버 부하가 0 이고, 안 뚫리면 TURN 이 중계한다(그때도 우리가 아는 홈서버다).
 *
 *  ICE 후보는 SDP 안에 이미 들어 있다(non-trickle) — 왕복 두 번으로 끝난다.
 */
export async function turnCredentials(): Promise<{ iceServers: unknown[] }> {
  const r = await apiRequest<{ iceServers: unknown[] }>('/api/daemon/turn/credentials', {
    method: 'POST', body: {}, silent: true, timeoutMs: 10000,
  });
  if (!r.success || !r.data) return { iceServers: [] };   // 꺼져 있으면 조용히 다른 경로로
  return { iceServers: r.data.iceServers || [] };
}

export async function emulatorWebrtcOffer(id: string, host?: number | null): Promise<{ sessionId: string; sdp: string; width?: number; height?: number }> {
  const r = await apiRequest<{ sessionId: string; sdp: string; width?: number; height?: number }>('/api/daemon/emulator/webrtc/offer', {
    method: 'POST', body: { id, ...hostBody(host) }, silent: true, timeoutMs: 30000,
  });
  if (!r.success || !r.data?.sdp) throw new Error(r.error || r.message || i18n.t('직접 연결을 열 수 없어요.'));
  return r.data;
}

export async function emulatorWebrtcAnswer(sessionId: string, sdp: string, host?: number | null): Promise<void> {
  await apiRequest('/api/daemon/emulator/webrtc/answer', {
    method: 'POST', body: { sessionId, sdp, ...hostBody(host) }, silent: true, timeoutMs: 20000,
  });
}

export async function emulatorWebrtcClose(sessionId: string, host?: number | null): Promise<void> {
  await apiRequest('/api/daemon/emulator/webrtc/close', {
    method: 'POST', body: { sessionId, ...hostBody(host) }, silent: true, timeoutMs: 10000,
  });
}

export async function emulatorPower(id: string, action: 'boot' | 'shutdown', host?: number | null) {
  const r = await apiRequest<{ ok: boolean }>('/api/daemon/emulator/power', {
    method: 'POST',
    body: { id, action, ...(host != null ? { hostDeviceId: host } : {}) },
  });
  if (!r.success) throw new Error(r.error || r.message || i18n.t('기기를 켜지 못했어요.'));
  return r.data;
}

export async function reviewSubmit(id: string, files: ReviewSubmissionFile[], note?: string, host?: number | null) {
  const r = await apiRequest<{ ok: boolean }>('/api/daemon/review/submit', {
    method: 'POST',
    body: { id, files, note, ...(host != null ? { hostDeviceId: host } : {}) },
  });
  if (!r.success) throw new Error(r.error || r.message || i18n.t('리뷰를 보내지 못했어요.'));
  return r.data;
}
export async function reviewCancel(id: string, reason?: string, host?: number | null) {
  const r = await apiRequest<{ ok: boolean }>('/api/daemon/review/cancel', {
    method: 'POST',
    body: { id, reason, ...(host != null ? { hostDeviceId: host } : {}) },
  });
  if (!r.success) throw new Error(r.error || r.message || i18n.t('리뷰를 취소하지 못했어요.'));
  return r.data;
}

export async function fsList(path = '', host?: number | null): Promise<DaemonFsList> {
  const direct = await lanFs<DaemonFsList>('fs.list', { path }, host);
  if (direct) return direct;
  const sealed = await sealedFs<DaemonFsList>('fs.list', { path }, host);
  if (sealed) return sealed;
  const r = await apiRequest<DaemonFsList>(`/api/daemon/fs/list?path=${encodeURIComponent(path)}${hostQS(host)}`, { method: 'GET' });
  if (!r.success || !r.data) throw new Error(r.error || r.message || i18n.t('폴더를 불러올 수 없어요.'));
  return r.data;
}

// 선택 폴더(root) 아래 파일 flat 목록 — 모바일 IDE 소스로 소비(경로는 root 기준 상대).
export interface DaemonFsTree { root: string; items: { path: string; text: boolean }[]; truncated?: boolean; }
export async function fsTree(root = '', host?: number | null): Promise<DaemonFsTree> {
  const direct = await lanFs<DaemonFsTree>('fs.tree', { path: root }, host);
  if (direct) return direct;
  const sealed = await sealedFs<DaemonFsTree>('fs.tree', { path: root }, host);
  if (sealed) return sealed;
  const r = await apiRequest<DaemonFsTree>(`/api/daemon/fs/tree?path=${encodeURIComponent(root)}${hostQS(host)}`, { method: 'GET' });
  if (!r.success || !r.data) throw new Error(r.error || r.message || i18n.t('프로젝트를 불러올 수 없어요.'));
  return r.data;
}

export async function fsRead(path: string, opts?: { base64?: boolean; host?: number | null }): Promise<DaemonFsRead> {
  const direct = await lanFs<DaemonFsRead>('fs.read', { path, base64: !!opts?.base64 }, opts?.host);
  if (direct) return direct;
  const sealed = await sealedFs<DaemonFsRead>('fs.read', { path, base64: !!opts?.base64 }, opts?.host);
  if (sealed) return sealed;
  // silent: 없는 파일/삭제된 파일 읽기는 예상 가능한 실패라 콘솔 소음을 억제(호출부가 조용히 재시도/스킵).
  const qs = `path=${encodeURIComponent(path)}${opts?.base64 ? '&base64=1' : ''}${hostQS(opts?.host)}`;
  const r = await apiRequest<DaemonFsRead>(`/api/daemon/fs/read?${qs}`, { method: 'GET', silent: true });
  if (!r.success || !r.data) throw new Error(r.error || r.message || i18n.t('파일을 열 수 없어요.'));
  return r.data;
}

// 프로젝트 폴더(root, 홈-기준 상대) 내 리터럴(대소문자무시) 검색. 데몬 오프라인이면 빈 결과.
export async function fsGrep(root: string, query: string, host?: number | null): Promise<DaemonGrepResult> {
  const q = query.trim();
  if (!q) return { matches: [], truncated: false };
  const direct = await lanFs<DaemonGrepResult>('fs.grep', { path: root, query: q }, host, 20000);
  if (direct) return direct;
  const sealed = await sealedFs<DaemonGrepResult>('fs.grep', { path: root, query: q }, host, 20000);
  if (sealed) return sealed;
  const r = await apiRequest<DaemonGrepResult>(
    `/api/daemon/fs/grep?path=${encodeURIComponent(root)}&q=${encodeURIComponent(q)}${hostQS(host)}`,
    { method: 'GET', silent: true },
  );
  return (r.success && r.data) ? r.data : { matches: [], truncated: false };
}

export async function fsWrite(path: string, content: string, host?: number | null, opts?: { base64?: boolean }): Promise<{ path: string; size: number; absPath?: string }> {
  // base64=true — 바이너리(이미지 첨부 등)를 base64 로 실어 보내면 데몬이 디코드해 저장(6MB 상한).
  //  응답 absPath(절대경로)는 터미널 첨부 플로우가 경로 삽입에 사용(fs.write 와이어 계약).
  // 자동저장(800ms)이 가장 잦은 왕복이라 LAN 이득이 크다 — 직결 → 봉인 → 평문 순서.
  const direct = await lanFs<{ path: string; size: number; absPath?: string }>('fs.write', { path, content, base64: !!opts?.base64 }, host);
  if (direct) return direct;
  const sealed = await sealedFs<{ path: string; size: number; absPath?: string }>('fs.write', { path, content, base64: !!opts?.base64 }, host);
  if (sealed) return sealed;
  const r = await apiRequest<{ path: string; size: number; absPath?: string }>('/api/daemon/fs/write', {
    method: 'POST',
    body: { path, content, ...(opts?.base64 ? { base64: true } : {}), ...hostBody(host) },
  });
  if (!r.success || !r.data) throw new Error(r.error || r.message || i18n.t('저장에 실패했어요.'));
  return r.data;
}

// ── fs 변형(생성/이름변경/삭제) — IDE 파일트리 조작 ──
export async function fsMkdir(path: string, host?: number | null): Promise<{ path: string }> {
  const sealed = await sealedFs<{ path: string }>('fs.mkdir', { path }, host);
  if (sealed) return sealed;
  const r = await apiRequest<{ path: string }>('/api/daemon/fs/mkdir', { method: 'POST', body: { path, ...hostBody(host) } });
  if (!r.success || !r.data) throw new Error(r.error || r.message || i18n.t('폴더 생성에 실패했어요.'));
  return r.data;
}
export async function fsCreateFile(path: string, host?: number | null): Promise<{ path: string }> {
  const sealed = await sealedFs<{ path: string }>('fs.createFile', { path }, host);
  if (sealed) return sealed;
  const r = await apiRequest<{ path: string }>('/api/daemon/fs/create', { method: 'POST', body: { path, ...hostBody(host) } });
  if (!r.success || !r.data) throw new Error(r.error || r.message || i18n.t('파일 생성에 실패했어요.'));
  return r.data;
}
export async function fsRename(path: string, dest: string, host?: number | null): Promise<{ path: string }> {
  const sealed = await sealedFs<{ path: string }>('fs.rename', { path, dest }, host);
  if (sealed) return sealed;
  const r = await apiRequest<{ path: string }>('/api/daemon/fs/rename', { method: 'POST', body: { path, dest, ...hostBody(host) } });
  if (!r.success || !r.data) throw new Error(r.error || r.message || i18n.t('이름 변경에 실패했어요.'));
  return r.data;
}
export async function fsDelete(path: string, host?: number | null): Promise<{ path: string; deleted: boolean }> {
  const sealed = await sealedFs<{ path: string; deleted: boolean }>('fs.delete', { path }, host);
  if (sealed) return sealed;
  const r = await apiRequest<{ path: string; deleted: boolean }>('/api/daemon/fs/delete', { method: 'POST', body: { path, ...hostBody(host) } });
  if (!r.success || !r.data) throw new Error(r.error || r.message || i18n.t('삭제에 실패했어요.'));
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
  if (!r.success || !r.data) throw new Error(r.error || r.message || i18n.t('워크스페이스 루트를 조회할 수 없어요.'));
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
  if (!r.success || !r.data) throw new Error(r.error || r.message || i18n.t('전체 디스크 접근을 변경할 수 없어요.'));
  return r.data.allowFullDisk === true;
}
// 워크스페이스 루트 지정 — 존재하는 폴더만.
export async function wsSetRoot(path: string): Promise<string> {
  const r = await apiRequest<{ root: string }>('/api/daemon/ws/root', { method: 'POST', body: { path } });
  if (!r.success || !r.data?.root) throw new Error(r.error || r.message || i18n.t('워크스페이스 루트를 지정할 수 없어요.'));
  return r.data.root;
}

export interface DaemonWsCreated { path: string; name: string; slug: string; gitInit?: boolean; designated?: boolean; remoteUrl?: string; }
// 워크스페이스 생성/지정.
//  · path 지정(designate): 선택한 폴더 "자체"를 워크스페이스로 사용(하위폴더 생성 X, 이름=폴더명). ← 기본 흐름
//  · (레거시) name+parentPath: 부모 아래 <name> 하위폴더 스캐폴드.
export async function wsCreate(opts: { name?: string; path?: string; parentPath?: string; host?: number | null }): Promise<DaemonWsCreated> {
  const body: { name?: string; path?: string; parentPath?: string; hostDeviceId?: number } = { ...hostBody(opts.host) };
  if (opts.name) body.name = opts.name;
  if (opts.path) body.path = opts.path;
  if (opts.parentPath) body.parentPath = opts.parentPath;
  const r = await apiRequest<DaemonWsCreated>('/api/daemon/ws/create', { method: 'POST', body });
  if (!r.success || !r.data?.path) throw new Error(r.error || r.message || i18n.t('PC 에 워크스페이스를 지정할 수 없어요.'));
  return r.data;
}

export interface DaemonWsCloned { path: string; name: string; slug: string; owner: string; repo: string; remoteUrl?: string; }
// GitHub 레포를 선택한 부모 폴더 아래로 git clone. url=레포 clone URL(https). name 미지정이면 레포명.
//  parentPath: 사용자가 고르는 목적지 부모. clone 은 네트워크 fetch라 오래 걸릴 수 있음(백엔드 타임아웃 120s).
export async function wsClone(url: string, name?: string, parentPath?: string): Promise<DaemonWsCloned> {
  const body: { url: string; name?: string; parentPath?: string } = { url, name };
  if (parentPath) body.parentPath = parentPath;
  const r = await apiRequest<DaemonWsCloned>('/api/daemon/ws/clone', { method: 'POST', body });
  if (!r.success || !r.data?.path) throw new Error(r.error || r.message || i18n.t('레포를 가져올 수 없어요.'));
  return r.data;
}

// ── 프리뷰(P2) — PC dev 서버를 폰 웹뷰로 ──
// PC 에서 LISTEN 중인 포트 감지 + 그 포트로의 무인증 프록시 토큰 발급.
export async function previewPorts(cwd = '', host?: number | null): Promise<number[]> {
  // cwd(워크스페이스 폴더, 홈-기준 상대) — 그 폴더 안에서 실행 중인 프로세스의 포트만 감지.
  const qs = `?cwd=${encodeURIComponent(cwd)}${hostQS(host)}`;
  const r = await apiRequest<{ ports: number[] }>(`/api/daemon/preview/ports${qs}`, { method: 'GET', silent: true });
  if (!r.success || !r.data) throw new Error(r.error || r.message || i18n.t('PC 포트를 조회할 수 없어요.'));
  return r.data.ports || [];
}
/** 열린 포트 한 줄 — 번호만으로는 뭐가 뭔지 못 고르니 프로세스 이름을 함께 받는다. */
export type OpenPort = { port: number; pid?: number; command?: string };

/**
 * 포트 목록(상세). `previewPorts` 와 **같은 라우트**를 쓰고, 응답에 추가된 필드를 읽을 뿐이다.
 *
 * · items  : 이 워크스페이스 폴더 안에서 도는 프로세스의 포트
 * · others : 그 밖에서 열린 포트
 *
 * ★ others 가 왜 필요한가(2026-08-04 실측): 사용자의 dev 서버(front·back·admin)는 전부 Docker 가
 *  띄운다. Docker 프로세스의 작업 폴더는 워크스페이스가 아니라서 items 에 **한 개도 안 잡힌다**.
 *  others 없이는 이 사용자에게 목록이 늘 비어 보인다.
 */
export async function previewPortsDetail(cwd = '', host?: number | null): Promise<{ items: OpenPort[]; others: OpenPort[] }> {
  const qs = `?cwd=${encodeURIComponent(cwd)}${hostQS(host)}`;
  const r = await apiRequest<{ ports?: number[]; items?: OpenPort[]; others?: OpenPort[] }>(
    `/api/daemon/preview/ports${qs}`, { method: 'GET', silent: true, timeoutMs: 15000 });
  if (!r.success || !r.data) throw new Error(r.error || r.message || i18n.t('PC 포트를 조회할 수 없어요.'));
  const d = r.data;
  return {
    // 구 데몬 폴백 — 번호만 올 수 있다(추가 필드는 전부 additive 였다).
    items: Array.isArray(d.items) ? d.items : (d.ports || []).map((p) => ({ port: p })),
    others: Array.isArray(d.others) ? d.others : [],
  };
}

export async function previewStart(port: number, host?: number | null): Promise<{ token: string; url: string; port: number }> {
  const r = await apiRequest<{ token: string; url: string; port: number }>('/api/daemon/preview/start', { method: 'POST', body: { port, ...hostBody(host) } });
  if (!r.success || !r.data?.token) throw new Error(r.error || r.message || i18n.t('미리보기를 시작할 수 없어요.'));
  return r.data;
}
export function buildDaemonPreviewUrl(token: string): string {
  return `${BACK_URL.replace(/\/+$/, '')}/api/daemon/preview/${token}/`;
}

// ── 로컬 포트 포워딩 — 폰 127.0.0.1:<port> TCP ↔ back WS ↔ PC dev 서버(portForwarder 가 소비) ──
//  경로형 프록시(previewStart)와 달리 페이지 오리진이 진짜 http://localhost:<port> 가 되어
//  상대경로 /api 충돌·절대주소 localhost 문제가 근본 해결된다. 토큰=(port, PC)당 재사용, TTL 1h(사용 시 연장).
export async function forwardStart(port: number, hostDeviceId: number | null): Promise<{ token: string }> {
  const r = await apiRequest<{ token: string; port: number }>('/api/daemon/forward/start', { method: 'POST', body: { port, ...hostBody(hostDeviceId) } });
  if (!r.success || !r.data?.token) throw new Error(r.error || r.message || i18n.t('포트 포워딩을 시작할 수 없어요.'));
  return { token: r.data.token };
}
// ── LAN 직결 소개장(기능4) ──────────────────────────────────────────────
//  같은 Wi-Fi 의 대상 PC 로 raw TCP 직결하기 위한 단명 grant + 사설 IP 후보를 서버에서 받는다.
//  서버는 이 요청과 동시에 대상 데몬에 grant 를 미리 통지하므로, 사용자 마찰(코드 입력/스캔)이 0 이다.
//  ★ 실패는 예외가 아니라 **정상 분기**다: code 로만 판정하고, 어떤 경우에도 호출측이
//    "호스트 오프라인" UX 를 켜지 않는다(문구 정규식 판정 경로에 절대 넘기지 말 것 — 설계 §5.3).
export interface LanEndpoint { host: string; port: number; family: number }
export interface LanGrant {
  grantId: string; secret: string; expiresAt: string; ttlMs: number;
  scopes: string[]; hostDeviceId: number; machineId: string | null;
  proto: number; lanEpoch: number; endpoints: LanEndpoint[];
}
export type LanGrantResult =
  | { ok: true; grant: LanGrant }
  /** unsupported = 서버 스위치 off·구 데몬·클라우드 러너(정상) · offline = 대상 PC 미연결 · error = 그 외 */
  | { ok: false; reason: 'unsupported' | 'offline' | 'error' };

export async function lanGrant(hostDeviceId: number | null, scopes: string[], kind: 'mobile' | 'pc' = 'mobile'): Promise<LanGrantResult> {
  const body = { clientKey: await getClientKey(), kind, scopes, ...hostBody(hostDeviceId) };
  const r = await apiRequest<LanGrant>('/api/daemon/lan/grant', { method: 'POST', body, silent: true, timeoutMs: 8000 });
  if (r.success && r.data && Array.isArray(r.data.endpoints) && r.data.endpoints.length) {
    return { ok: true, grant: r.data };
  }
  if (r.code === 'LAN_UNSUPPORTED' || r.status === 404 || r.status === 501) return { ok: false, reason: 'unsupported' };
  if (r.code === 'LAN_HOST_OFFLINE') return { ok: false, reason: 'offline' };
  return { ok: false, reason: 'error' };
}

export function buildForwardWsUrl(token: string): string {
  // TCP 연결 1개당 WS 1개(양방향 raw 바이너리 파이프) — 터미널 WS 와 같은 저지연 릴레이 base.
  return `${RELAY_WS_URL}/api/daemon/forward/${token}`;
}

export interface UiClient { clientKey: string; deviceId: number | null; deviceName: string; kind: string; foreground: boolean; lastActivityAt: number; executor: boolean }
// 접속 중인 UI 클라이언트(기기) 목록 — 프리뷰 핸드오프 "보내기" 대상 선택용.
export async function listUiClients(): Promise<UiClient[]> {
  const r = await apiRequest<{ clients: UiClient[] }>('/api/daemon/ui/clients', { method: 'GET', silent: true });
  if (!r.success || !r.data) return [];
  return r.data.clients || [];
}

/**
 * 그 PC 에 "지금 업데이트 적용" 을 원격으로 지시한다.
 *  사용자는 PC 앞에 없는 채로 폰에서 작업하는 일이 많다 — 그때 "PC 를 업데이트하세요" 안내만 주면
 *  PC 앞에 갈 때까지 아무것도 못 하므로 여기서 바로 걸 수 있어야 한다.
 *  진행 상황은 이어지는 runner_status(업데이트 중 → 오프라인 → 온라인)가 화면에 반영한다.
 *  @returns 'sent' | 'no_client'(그 PC 화면이 접속 중이 아님) | 'not_ready'(받아 둔 게 없음) | 'error'
 */
export async function pcUpdateNow(deviceId: number): Promise<string> {
  const r = await apiRequest<{ result: string }>('/api/daemon/pc/update', {
    method: 'POST', body: { deviceId }, silent: true,
  });
  if (!r.success || !r.data) return 'error';
  return r.data.result || 'error';
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
              .then((tok) => { if (!aborted) { tok ? run(true) : onError?.(i18n.t('인증이 만료되었습니다.')); } })
              .catch(() => onError?.(i18n.t('인증 갱신 실패')));
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
  if (!r.success || !r.data) throw new Error(r.error || r.message || i18n.t('점검할 수 없어요.'));
  return r.data;
}

// ── BYO 로그인(M5 Slice2) — 활성 러너(클라우드 컨테이너/PC)에서 사용자 claude 계정 로그인 ──
// 크레덴셜(토큰)은 그 러너에만 안착. 앱은 인증 URL 을 인앱브라우저로 열고, 콜백페이지에서
// 사용자가 복사한 인증 코드를 되돌려줄 뿐이다. runnerId 미지정 시 활성 러너로 라우팅.
// 로그인 시작 → 인증 URL(사용자가 인앱브라우저로 열어야 함). PTY 는 코드 입력 대기 상태로 유지.
export async function agentLoginStart(opts?: { runnerId?: number; useConsole?: boolean }): Promise<{ url: string; authMethod?: string }> {
  const r = await apiRequest<{ url: string; authMethod?: string }>('/api/daemon/agent/login', { method: 'POST', body: { runnerId: opts?.runnerId, useConsole: opts?.useConsole } });
  if (!r.success || !r.data?.url) throw new Error(r.error || r.message || i18n.t('로그인을 시작할 수 없어요.'));
  return r.data;
}
// 인증 코드 제출 → 로그인 완료(진위는 러너의 auth status 로 확정).
export async function agentLoginSubmit(code: string, opts?: { runnerId?: number }): Promise<{ ok: boolean; message?: string; status?: DaemonLoginStatus }> {
  const r = await apiRequest<{ ok: boolean; message?: string; status?: DaemonLoginStatus }>('/api/daemon/agent/login/submit', { method: 'POST', body: { code, runnerId: opts?.runnerId } });
  if (!r.success || !r.data) throw new Error(r.error || r.message || i18n.t('코드를 제출할 수 없어요.'));
  return r.data;
}
export async function agentLoginCancel(opts?: { runnerId?: number }): Promise<void> {
  await apiRequest('/api/daemon/agent/login/cancel', { method: 'POST', body: { runnerId: opts?.runnerId }, silent: true });
}
export async function agentLoginStatus(opts?: { runnerId?: number }): Promise<DaemonLoginStatus> {
  const qs = opts?.runnerId != null ? `?runnerId=${opts.runnerId}` : '';
  const r = await apiRequest<DaemonLoginStatus>(`/api/daemon/agent/login/status${qs}`, { method: 'GET', silent: true });
  if (!r.success || !r.data) throw new Error(r.error || r.message || i18n.t('로그인 상태를 확인할 수 없어요.'));
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
  if (!r.success || !r.data) throw new Error(r.error || r.message || i18n.t('체크포인트를 만들 수 없어요.'));
  return r.data;
}
// 다른 폴더(러너)에 복원 — targetCwd 는 데몬 홈-기준 상대경로. 충돌이면 result.conflict=true.
export async function syncMaterialize(workspaceId: string, opts: { checkpointId?: string; targetCwd: string; reinstall?: boolean }): Promise<MaterializeResult> {
  const r = await apiRequest<MaterializeResult>('/api/daemon/sync/materialize', { method: 'POST', body: { workspaceId, ...opts } });
  if (!r.success || !r.data) throw new Error(r.error || r.message || i18n.t('복원할 수 없어요.'));
  return r.data;
}
export async function syncStatus(workspaceId: string, cwd?: string): Promise<SyncStatus> {
  const qs = `workspaceId=${encodeURIComponent(workspaceId)}${cwd ? `&cwd=${encodeURIComponent(cwd)}` : ''}`;
  const r = await apiRequest<SyncStatus>(`/api/daemon/sync/status?${qs}`, { method: 'GET', silent: true });
  if (!r.success || !r.data) throw new Error(r.error || r.message || i18n.t('상태를 확인할 수 없어요.'));
  return r.data;
}
export async function syncResolve(workspaceId: string, opts: { conflictId: string; choices?: { path: string; side: 'local' | 'cloud' }[]; bulk?: 'local' | 'cloud' }): Promise<{ resolved: number; rescueBranch: string; head: string }> {
  const r = await apiRequest<{ resolved: number; rescueBranch: string; head: string }>('/api/daemon/sync/resolve', { method: 'POST', body: { workspaceId, ...opts } });
  if (!r.success || !r.data) throw new Error(r.error || r.message || i18n.t('충돌을 해결할 수 없어요.'));
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
          if (x.status === 401 && !retried) { refreshAccessToken().then((tok) => { if (!aborted) { tok ? run(true) : onError?.(i18n.t('인증이 만료되었습니다.')); } }).catch(() => onError?.(i18n.t('인증 갱신 실패'))); return; }
          scheduleReconnect();
        }
      },
      () => { if (!aborted) scheduleReconnect(); },
    );
  };
  run(false);
  return () => { aborted = true; if (reconnectTimer) clearTimeout(reconnectTimer); try { xhr?.abort(); } catch (_) { /* noop */ } };
}

export default { getStatus, activateRunner, ensureCloudRunner, createPairCode, approvePairSession, revokeDevice, renameOwnDevice, updateNickname, deleteAccount, listDevices, registerController, getDeviceUuid, getClientKey, getWorkspaceSession, putWorkspaceSession, claimWorkspace, startTerminal, buildTerminalWsUrl, listTerminals, poolMutationCount, newTerminal, selectTerminal, unviewTerminal, closeTerminal, listAgents, wireAgent, rescanAgents, launchAgent, reviewSubmit, reviewCancel, emulatorList, emulatorFrame, emulatorInput, emulatorPower, emulatorStreamToken, buildEmulatorStreamWsUrl, turnCredentials, emulatorWebrtcOffer, emulatorWebrtcAnswer, emulatorWebrtcClose, fsList, fsTree, fsRead, fsWrite, fsMkdir, fsCreateFile, fsRename, fsDelete, fsWatch, fsUnwatch, fsGrep, streamDaemonEvents, wsGetRoot, wsSetRoot, wsSetFullDisk, wsCreate, wsClone, previewPorts, previewPortsDetail, previewStart, buildDaemonPreviewUrl, forwardStart, buildForwardWsUrl, lanGrant, listUiClients, pcUpdateNow, agentDoctor, agentLoginStart, agentLoginSubmit, agentLoginCancel, agentLoginStatus, syncCheckpoint, syncMaterialize, syncStatus, syncResolve, listCheckpoints, subscribeDaemonSyncEvents };
