import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DeviceInfo from 'react-native-device-info';
import { apiRequest, api, refreshAccessToken } from '../utils/api';
import { BACK_URL } from '../utils/service';
import { getClientKey, getMyDeviceId, getDeviceLabel } from './daemonService';
import { UI_COMMAND_NAMES } from '../workspace/uiCommandNames';

// 이 앱의 버전(ui_hello 진단 필드). 네이티브 모듈이 없는 환경(테스트)에서도 죽지 않게 감싼다.
function appVersionLabel(): string | undefined {
  try { return String(DeviceInfo.getVersion() || '') || undefined; } catch (_) { return undefined; }
}

// 서버 동기화 알림 — REST(/api/notifications) + 실시간(notif_event, agent stream 채널 동승).
//  터미널 OSC/벨 등 기기에서 발생한 알림을 서버에 적재하고 전 기기에 팬아웃/읽음 동기화한다.

// ── 타입 ──
export interface NotifRow {
  id: number;
  source: string;
  kind?: string | null;
  title: string;
  subtitle?: string | null;
  body?: string | null;
  workspaceId?: string | null;
  wsName?: string | null;
  cwd?: string | null;
  win?: number | null;
  sessionId?: string | null;
  readAt?: string | null;
  createdAt?: string | null;
}

export interface CreateNotifPayload {
  source: string;
  kind?: string;
  title: string;
  subtitle?: string;
  body?: string;
  workspaceId?: string;
  wsName?: string;
  cwd?: string;
  win?: number;
  sessionId?: string;
}

// 읽음 처리 인자 — ids 지정 | pane 읽음 scope{cwd,win} | ws-수준 scope{cwd,win:null}.
export type MarkReadArg =
  | { ids: Array<number> }
  | { scope: { cwd: string; win: number | null } };

// notif_event 프레임의 event — new(새 알림) | read(읽음 동기화).
//  alertClientKey = 서버가 정한 "지금 소리/배너를 낼 present 기기"의 clientKey(없으면 null=자리비움→푸시).
//  alertForMe = 이 기기가 그 present 기기인지(emit 에서 내 clientKey 와 비교해 채움).
export type NotifEvent =
  | { kind: 'new'; notification: NotifRow; alertClientKey?: string | null; alertForMe?: boolean }
  | { kind: 'read'; ids: number[] };

// ── ui_command 브리지(원격 화면 조작) — agent stream WSS 동승 프레임 ──
//  수신: {type:'ui_command', uiId, cmd, params, executor} — executor=true 면 같은 소켓으로
//  {type:'ui_result', uiId, ok, result?, error?} 회신. SSE 폴백 경로에선 회신 불가 → 무시.
export interface UiCommandFrame {
  type: 'ui_command';
  uiId: string | number;
  cmd: string;
  params: Record<string, any>;
  executor?: boolean;
}

// ── runner_status(호스트 데몬 온/오프라인) — 백엔드가 러너 WS 접속/종료 즉시 팬아웃 ──
//  사이드바 온라인 점/오프라인 UX 를 라이브로 갱신한다(폴링 대기 없음).
export interface RunnerStatusEvent {
  deviceId: number;
  online: boolean;
  kind?: string;
  deviceName?: string;
  /** LAN 직결(기능4) 가능 여부 — 구 서버는 안 보낸다(undefined). 표시용이 아니라 승격 시도 힌트다. */
  lanCapable?: boolean;
  /** 그 호스트의 LAN 주소 세대. 바뀌면 = 인터페이스 변경 → 경로 재승격(revival) 트리거. */
  lanEpoch?: number;
  /** 그 호스트가 든 E2EE 열쇠 세대(0 = 열쇠 없음 = 그 PC 로 가는 트래픽은 평문). 구 back 은 안 보낸다. */
  e2eeEpoch?: number;
  /** 곧 업데이트로 재시작한다(아직 online). 원격 화면이 미리 문구를 준비하는 예고. */
  updating?: boolean;
  /** 오프라인 사유. 'updating' = 업데이트 재시작(20~30초 뒤 자동 복귀) — 고장이 아니다. */
  reason?: string;
  /** 그 PC 가 업데이트를 받아 두었다(적용만 남음) — 폰에서 원격 적용 버튼을 띄우는 근거. */
  updateReady?: boolean;
  /** 업데이트 목표 버전(표시용). */
  toVersion?: string;
}
let runnerStatusListener: ((e: RunnerStatusEvent) => void) | null = null;
export function setRunnerStatusListener(l: ((e: RunnerStatusEvent) => void) | null): void {
  runnerStatusListener = l;
}
function dispatchRunnerStatus(m: any): void {
  if (!m || m.type !== 'runner_status' || !m.event || typeof m.event.deviceId !== 'number') return;
  try { runnerStatusListener?.(m.event as RunnerStatusEvent); } catch (_) { /* 핸들러 오류가 소켓 루프를 깨지 않게 */ }
}

// ── agent_state(기능3 2단계 — 데몬 에이전트 상태머신 push) ──
//  데몬 runner-core/agent-state.js 가 소유한 상태를 back 이 전 기기로 팬아웃한 프레임.
//  라우팅 키는 (hostDeviceId, cwd, win): cwd=데몬 홈-상대경로(=WorkspaceMeta.localPath),
//  win=tmux window index(=데몬 tid, 31-bit 안정 ID), hostDeviceId=back 이 스탬프한 conn.deviceId.
//  ★ 내용성 정보(요약/도구명/promptId)는 이 프레임에 실리지 않는다 — 순수 메타데이터다.
export interface AgentStateEvent {
  cwd: string;
  win: number;
  /** idle|working|permission|needsInput|gone — 데몬 내부 launching→idle / ended→gone 은 데몬이 접어서 보낸다. */
  state: string;
  agent?: string | null;
  version?: number;
  at?: number;
  sessionId?: string | null;
  source?: string;
  since?: number;
  /** back 이 스탬프(구 back 은 안 보낸다 → undefined = host 미상). */
  hostDeviceId?: number | null;
  kind?: string;
}
let agentStateListener: ((e: AgentStateEvent) => void) | null = null;
export function setAgentStateListener(l: ((e: AgentStateEvent) => void) | null): void {
  agentStateListener = l;
}
function dispatchAgentState(m: any): void {
  if (!m || m.type !== 'agent_state') return;
  const ev = m.event || m; // PC ui-channel 과 동일한 관용(event 없으면 프레임 자체)
  if (typeof ev.cwd !== 'string' || typeof ev.win !== 'number') return;
  try { agentStateListener?.(ev as AgentStateEvent); } catch (_) { /* 핸들러 오류가 소켓 루프를 깨지 않게 */ }
}

// 채널(WSS/SSE) 연결 시작 신호 — "그 사이의 push 를 놓쳤다"는 뜻이다.
//  push 로만 유지되는 휘발성 상태(agent_state)의 소비자는 이 신호에서 보유분을 폐기하고
//  폴백으로 내려가야 한다. 놓친 구간을 리플레이하지 않는 이 채널의 성질(subscribeNotifEvents 주석)상
//  "모르는 상태"를 계속 신뢰하면 에이전트가 끝났는데 켜진 채 굳는다.
let channelResetListener: (() => void) | null = null;
export function setChannelResetListener(l: (() => void) | null): void {
  channelResetListener = l;
}
function fireChannelReset(): void {
  try { channelResetListener?.(); } catch (_) { /* noop */ }
}

// ── 이 화면이 처리할 수 있는 신규 기능(ui_hello.caps) ──
//  서버/데몬이 "요청을 만들어도 되는가"를 버전이 아니라 능력 교집합으로 판정한다
//  (codingpt_back/config/caps.js, daemonRelayService.listUiClients().caps).
//  ★ 여기 선언한 능력의 UI 가 실제로 있어야 한다 — 없는 능력을 신고하면 서버가 이 기기를
//    "응답 가능한 화면"으로 세어 승인 카드가 아무 데도 안 뜨는 상태가 된다.
//  'agentstate.v1' = agent_state 프레임 수신기가 실제로 있다(dispatchAgentState → agentStateStore).
//   팬아웃 자체는 caps 로 게이팅되지 않지만(모르는 type 은 무시 = 안전), 진단·통계에 이 기기가 세어진다.
const CLIENT_CAPS = ['caps.v1', 'approval.v1', 'transcript.v1', 'agentstate.v1'];
// 종단간 암호화(기능2)는 **이 기기가 실제로 봉인/복호할 수 있을 때만** 신고한다(열쇠 승인 전엔 미신고).
//  지연 require = 순환 방지(e2ee 는 daemonService 를 lazy require 한다).
function e2eeCaps(): string[] {
  try { return require('./e2ee').default.clientCaps(); } catch (_) { return []; }
}

// ── approval_event(기능1) / chat_event(기능5) — 승인·채팅 전용 서비스로 흘린다 ──
//  이 파일이 유일한 WSS/SSE 종단이라 새 소켓을 열지 않고 프레임만 분배한다(runnerStatus 패턴).
//  ⚠ 서비스 모듈을 정적 import 하지 않는 이유: approvalService/chatService 는 이 모듈을 쓰지 않지만
//   순환 위험을 남기지 않기 위해 지연 require 로 통일한다(pushService 관례와 동일).
//  ⚠ 봉투(env): 기능2 가 켜지면 데몬이 상세를 봉인해 `env` 로 보내고 라우팅 필드만 평문으로 남긴다.
//   여기서 한 번 개봉해 아래 서비스들이 **기존 모양 그대로** 받도록 한다(호출부 무수정).
//   개봉 실패(열쇠 없음)면 봉투를 버리고 평문 필드만 넘긴다 — 카드/채팅이 안 뜨는 것보다 낫다.
function unsealEvent(ev: any, hostDeviceId?: number | null): any {
  if (!ev || !ev.env) return ev;
  try {
    const opened = require('./e2ee').default.openEnvelope(ev.env, hostDeviceId ?? ev.hostDeviceId ?? null);
    if (opened && typeof opened === 'object') {
      const { env, ...rest } = ev;
      return { ...rest, ...(opened.r && typeof opened.r === 'object' ? opened.r : opened) };
    }
  } catch (_) { /* noop */ }
  const { env, ...rest } = ev;
  return rest;
}

function dispatchApproval(m: any): void {
  if (!m || m.type !== 'approval_event' || !m.event) return;
  try { require('./approvalService').dispatchApprovalEvent(unsealEvent(m.event)); } catch (_) { /* 핸들러 오류가 소켓 루프를 깨지 않게 */ }
}
function dispatchChat(m: any): void {
  if (!m || m.type !== 'chat_event' || !m.chatId) return;
  try { require('./chatService').dispatchChatEvent(unsealEvent(m)); } catch (_) { /* noop */ }
}

// ── device_approval_event(기능2) — 새 기기 열쇠 승인 요청/해소 팬아웃 ──
//  새 배관 없음: 이 파일의 단일 WSS 에 동승한 프레임을 e2ee 서비스로 흘린다(approval/chat 과 동형).
function dispatchDeviceApproval(m: any): void {
  if (!m || m.type !== 'device_approval_event' || !m.event) return;
  try { require('./e2ee').default.dispatchDeviceApprovalEvent(m.event); } catch (_) { /* noop */ }
}

let deviceUpdatedListener: (() => void) | null = null;
export function setDeviceUpdatedListener(l: (() => void) | null): void { deviceUpdatedListener = l; }
function dispatchDeviceUpdated(m: any): void {
  if (!m || m.type !== 'device_updated') return;
  try { deviceUpdatedListener?.(); } catch (_) { /* noop */ }
}

// ── account_deleted(다른 기기에서 회원 탈퇴) — 이 기기도 즉시 로컬 로그아웃 → 로그인 화면 ──
let accountDeletedListener: (() => void) | null = null;
export function setAccountDeletedListener(l: (() => void) | null): void {
  accountDeletedListener = l;
}
function dispatchAccountDeleted(m: any): void {
  if (!m || m.type !== 'account_deleted') return;
  try { accountDeletedListener?.(); } catch (_) { /* noop */ }
}

// 브리지(UiCommandBridge)가 등록하는 단일 리스너 — 프레임을 화면 조작으로 변환한다.
let uiCommandListener: ((f: UiCommandFrame) => void) | null = null;
export function setUiCommandListener(l: ((f: UiCommandFrame) => void) | null): void {
  uiCommandListener = l;
}
export function dispatchUiCommand(f: UiCommandFrame): void {
  try { uiCommandListener?.(f); } catch (_) { /* 핸들러 오류가 소켓 루프를 깨지 않게 */ }
}

// 현재 열린 notif WSS — ui_result/ui_activity 송신 채널(SSE 폴백이면 null = 송신 불가).
let uiSock: WebSocket | null = null;
function uiSend(payload: Record<string, unknown>): boolean {
  if (!uiSock || uiSock.readyState !== 1 /* OPEN */) return false;
  try { uiSock.send(JSON.stringify(payload)); return true; } catch (_) { return false; }
}

/** ui_command 실행 결과 회신 — executor 로 지정된 기기만 호출(WSS 미연결이면 조용히 드랍). */
export function sendUiResult(uiId: string | number, ok: boolean, result?: unknown, error?: string): void {
  uiSend({ type: 'ui_result', uiId, ok, ...(result !== undefined ? { result } : {}), ...(error ? { error } : {}) });
}

// 사용자 입력 신호 — 서버가 "최근 조작 기기(executor)"를 판단하는 힌트.
//  strong = 의도적 상호작용(터미널/화면 터치) → 짧은 스로틀(1s)로 executor 를 빠르게 이 기기로 가져온다.
//  (두 기기 화면을 다 켜둔 환경에서 "지금 조작하는 기기"가 곧바로 executor 가 되어야 프리뷰 분할이 그
//   기기에서만 뜬다.) 기본(weak) = 30s 스로틀(present 잔떨림·메시지 폭주 방지).
let lastUiActivityAt = 0;
export function sendUiActivity(strong = false): void {
  const now = Date.now();
  if (now - lastUiActivityAt < (strong ? 1000 : 30000)) return;
  if (uiSend({ type: 'ui_activity' })) lastUiActivityAt = now;
}

// 표면(프리뷰) 생명주기 전파 — "같이 닫힘". UI 로 프리뷰를 닫으면 back 에 알려 다른 기기도 previewClose 하게 한다.
//  (open 은 데몬 ui_command 브로드캐스트로 이미 양쪽에 열리지만, UI × 닫기는 로컬이라 전파 필요.)
//  applyingRemoteClose = 다른 기기가 보낸 close 를 이 기기가 실행 중 → 재전파 금지(루프 차단).
let applyingRemoteClose = false;
export function setApplyingRemoteClose(v: boolean): void { applyingRemoteClose = v; }
export function propagatePreviewClose(wsLocalPath: string): void {
  if (applyingRemoteClose || !wsLocalPath) return;
  uiSend({ type: 'surface_broadcast', cmd: 'previewClose', params: { ws: wsLocalPath } });
}

// 이 기기의 clientKey — 서버가 준 alertClientKey 와 비교해 "내가 present 기기인가"를 판단.
let myClientKey = '';
export function getMyClientKey(): string { return myClientKey; }

// 포그라운드/백그라운드 전환 신호 — 알림을 "지금 보고 있는 기기"로만 보내는 present 판정용.
//  AppState active → true, background/inactive → false. 소켓 미연결이면 다음 접속 시 ui_hello 가 foreground=true 로 시작.
export function sendPresence(active: boolean): void {
  uiSend({ type: 'presence', active });
}

// ── REST ──
export async function createNotification(payload: CreateNotifPayload): Promise<NotifRow> {
  const r = await apiRequest<NotifRow>('/api/notifications', { method: 'POST', body: payload, silent: true });
  if (!r.success || !r.data) throw new Error(r.error || r.message || '알림을 저장할 수 없어요.');
  return r.data;
}

export async function listNotifications(opts?: { limit?: number; beforeId?: number }): Promise<{ notifications: NotifRow[]; unreadCount: number }> {
  const qs = `limit=${opts?.limit ?? 50}${opts?.beforeId != null ? `&beforeId=${opts.beforeId}` : ''}`;
  const r = await apiRequest<{ notifications: NotifRow[]; unreadCount: number }>(`/api/notifications?${qs}`, { method: 'GET', silent: true });
  if (!r.success || !r.data) throw new Error(r.error || r.message || '알림을 불러올 수 없어요.');
  return { notifications: r.data.notifications || [], unreadCount: r.data.unreadCount || 0 };
}

export async function markRead(arg: MarkReadArg): Promise<{ ids: number[] }> {
  const r = await apiRequest<{ ids: number[] }>('/api/notifications/read', { method: 'POST', body: arg, silent: true });
  if (!r.success || !r.data) throw new Error(r.error || r.message || '읽음 처리에 실패했어요.');
  return r.data;
}

export async function markAllRead(): Promise<{ ids: number[] }> {
  const r = await apiRequest<{ ids: number[] }>('/api/notifications/read-all', { method: 'POST', body: {}, silent: true });
  if (!r.success || !r.data) throw new Error(r.error || r.message || '읽음 처리에 실패했어요.');
  return r.data;
}

/**
 * notif_event 구독 — 기존 agent stream(WSS) 채널에 동승한 {type:'notif_event'} 프레임만 콜백.
 *  subscribeDaemonAgentEvents 와 동일한 WSS 우선 + SSE 폴백 클로저(별도 소켓).
 *  놓친 구간은 리플레이하지 않는다(연결은 "지금부터", 과거분은 REST 재로드가 담당). @returns 해제 함수.
 */
export function subscribeNotifEvents(
  onEvent: (e: NotifEvent) => void,
  onError?: (msg: string) => void,
  // ui_command 프레임 콜백 — WSS 연결일 때만 호출(SSE 폴백은 회신 불가라 처리하지 않는다).
  onUiCommand?: (f: UiCommandFrame) => void,
): () => void {
  let aborted = false;
  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let sseUnsub: (() => void) | null = null;
  let everOpened = false;
  let preOpenFails = 0;

  const emit = (m: any) => {
    // 모양 설정(계정 동기화) — 다른 기기서 변경 → 즉시 silent 적용(재푸시 없음)
    if (m && m.type === 'appearance_event') {
      try { require('../utils/appearanceSync').applyRemoteAppearance(m.event && m.event.appearance); } catch (_) { /* noop */ }
      return;
    }
    if (!m || m.type !== 'notif_event' || !m.event) return;
    const ev = m.event;
    if (ev.kind === 'new' && ev.notification) {
      // 내가 present 기기(서버가 지정)일 때만 소리/햅틱을 낸다 — 나머지 기기는 뱃지만.
      ev.alertForMe = !!(ev.alertClientKey && myClientKey && ev.alertClientKey === myClientKey);
      onEvent(ev as NotifEvent);
    } else if (ev.kind === 'read' && Array.isArray(ev.ids)) onEvent(ev as NotifEvent);
  };

  const scheduleReconnect = () => {
    if (aborted) return;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => void connect(), 3000);
  };
  const fallbackToSse = () => {
    if (aborted || sseUnsub) return;
    sseUnsub = subscribeNotifEventsSse(onEvent, onError);
  };
  const connect = async () => {
    if (aborted || sseUnsub) return;
    let tok: string | null = null;
    try { tok = await AsyncStorage.getItem('accessToken'); } catch (_) { tok = null; }
    if (!tok) { tok = await refreshAccessToken().catch(() => null); }
    if (!tok) { fallbackToSse(); return; }
    const base = BACK_URL.replace(/^http/, 'ws').replace(/\/+$/, '');
    let sock: WebSocket;
    // client=mobile — 백엔드가 발신 기기/에코 대상을 구분하는 스트림 식별 파라미터.
    try { sock = new WebSocket(`${base}/api/daemon/agent/stream?token=${encodeURIComponent(tok)}&client=mobile`); }
    catch (_) { preOpenFails += 1; if (preOpenFails >= 2 && !everOpened) fallbackToSse(); else scheduleReconnect(); return; }
    ws = sock;
    let openedThis = false;
    sock.onopen = () => {
      openedThis = true; everOpened = true; preOpenFails = 0;
      // 이 채널로만 유지되는 휘발성 push 상태는 재연결 시점에 신뢰할 근거가 없다 → 소비자에게 폐기 통지.
      fireChannelReset();
      // attach(지금부터) — 알림 과거분은 REST listNotifications 재로드가 채우므로 리플레이 불필요.
      try { sock.send(JSON.stringify({ type: 'attach', lastRseq: -1 })); } catch (_) { /* noop */ }
      // ui_command 회신/활동 신호 채널로 이 소켓을 지정 + 접속 인사(기기 식별).
      uiSock = sock;
      Promise.all([getClientKey(), getMyDeviceId()]).then(([k, deviceId]) => {
        myClientKey = k; // present 판정(alertClientKey 비교)용
        if (aborted || ws !== sock || sock.readyState !== 1) return;
        // 기기 식별 + 타겟팅용 id/이름 동봉(deviceId 는 등록 전이면 null — deviceName/kind 로도 매칭 가능).
        // appVersion 은 **진단 전용**(분기 금지 — 기능 분기는 항상 caps). 서버가 "누가 어떤 조합을
        //  쓰는지" 를 아는 유일한 단서다(구 클라는 안 보냄 → 서버에서 '알 수 없음').
        //  uiCmds = "이 화면이 실제로 실행할 수 있는 ui_command" — 서버가 명령을 보낼 화면을 고를 때
        //   쓴다. 신고하지 않으면 서버가 할 줄 모르는 화면으로 보내 조용히 실패한다(실사고).
        try { sock.send(JSON.stringify({ type: 'ui_hello', clientKey: k, kind: 'mobile', deviceId: deviceId ?? undefined, deviceName: getDeviceLabel(), caps: [...CLIENT_CAPS, ...e2eeCaps()], appVersion: appVersionLabel(), uiCmds: UI_COMMAND_NAMES })); } catch (_) { /* noop */ }
        // 접속 시 포그라운드 여부를 즉시 보고(재접속이 백그라운드 중일 수 있음).
        try { sock.send(JSON.stringify({ type: 'presence', active: AppState.currentState === 'active' })); } catch (_) { /* noop */ }
      }).catch(() => { /* noop */ });
    };
    sock.onmessage = (ev: WebSocketMessageEvent) => {
      if (aborted) return;
      let m: any; try { m = JSON.parse(String(ev.data)); } catch (_) { return; }
      emit(m);
      dispatchRunnerStatus(m); // 호스트 온/오프라인 라이브 반영
      dispatchAccountDeleted(m); // 원격 탈퇴 → 즉시 로그아웃
      dispatchApproval(m);      // 승인 카드 등장/회수(기능1)
      dispatchChat(m);          // 채팅 델타(기능5)
      dispatchDeviceApproval(m); // 새 기기 열쇠 승인 요청/회수(기능2)
      dispatchDeviceUpdated(m); // 기기 별칭 변경 → 목록 정본 재조회
      dispatchAgentState(m);    // 에이전트 상태머신 push(기능3) — Chat 토글 판정 1순위
      // ui_command 프레임 통과 — WSS 전용(회신 채널이 있는 경로).
      if (m && m.type === 'ui_command' && m.cmd) onUiCommand?.(m as UiCommandFrame);
    };
    sock.onerror = () => { /* onclose 가 뒤따른다 */ };
    sock.onclose = async () => {
      if (uiSock === sock) uiSock = null;
      if (aborted) return;
      if (!openedThis) {
        // 이번 연결이 안 열림 = 토큰 만료/서버 거부 가능성 → 토큰 리프레시 후 재시도.
        await refreshAccessToken().catch(() => null);
        if (!everOpened) { preOpenFails += 1; if (preOpenFails >= 2) { fallbackToSse(); return; } }
        scheduleReconnect(); return;
      }
      scheduleReconnect();
    };
  };
  void connect();
  return () => {
    aborted = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (uiSock && uiSock === ws) uiSock = null;
    try { ws?.close(); } catch (_) { /* noop */ }
    if (sseUnsub) { try { sseUnsub(); } catch (_) { /* noop */ } }
  };
}

/**
 * notif_event SSE 구독(폴백) — /api/daemon/events 스트림의 notif_event 프레임 필터.
 *  daemonService 의 agent/sync SSE 폴백과 동일 스켈레톤(별도 구독, 백엔드가 팬아웃). @returns 해제 함수.
 */
function subscribeNotifEventsSse(
  onEvent: (e: NotifEvent) => void,
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
      dispatchRunnerStatus(msg); // SSE 폴백에서도 호스트 온/오프라인 반영
      dispatchAccountDeleted(msg);
      // 승인/채팅도 SSE 폴백으로 온다(back fanoutApprovalEvent/fanoutChatEvent 가 양쪽에 보낸다).
      dispatchApproval(msg);
      dispatchChat(msg);
      dispatchAgentState(msg); // 에이전트 상태 push 도 SSE 폴백으로 온다(back 이 양쪽에 팬아웃)
      if (msg && msg.type === 'notif_event' && msg.event) {
        const ev = msg.event;
        if (ev.kind === 'new' && ev.notification) onEvent(ev as NotifEvent);
        else if (ev.kind === 'read' && Array.isArray(ev.ids)) onEvent(ev as NotifEvent);
      }
    } catch (_) { /* noop */ }
  };
  const scheduleReconnect = () => { if (aborted) return; if (reconnectTimer) clearTimeout(reconnectTimer); reconnectTimer = setTimeout(() => run(false), 3000); };
  const run = async (retried: boolean) => {
    let processedIndex = 0; let pendingLine = '';
    fireChannelReset(); // SSE 폴백도 "지금부터" 스트림 — 재시작 구간의 push 는 유실됐다.
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

export default { createNotification, listNotifications, markRead, markAllRead, subscribeNotifEvents, setUiCommandListener, dispatchUiCommand, sendUiResult, sendUiActivity, sendPresence, getMyClientKey, setRunnerStatusListener, setAccountDeletedListener, setDeviceUpdatedListener, setAgentStateListener, setChannelResetListener, setApplyingRemoteClose, propagatePreviewClose };
