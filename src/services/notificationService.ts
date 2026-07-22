import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiRequest, api, refreshAccessToken } from '../utils/api';
import { BACK_URL } from '../utils/service';
import { getClientKey, getMyDeviceId, getDeviceLabel } from './daemonService';

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
}
let runnerStatusListener: ((e: RunnerStatusEvent) => void) | null = null;
export function setRunnerStatusListener(l: ((e: RunnerStatusEvent) => void) | null): void {
  runnerStatusListener = l;
}
function dispatchRunnerStatus(m: any): void {
  if (!m || m.type !== 'runner_status' || !m.event || typeof m.event.deviceId !== 'number') return;
  try { runnerStatusListener?.(m.event as RunnerStatusEvent); } catch (_) { /* 핸들러 오류가 소켓 루프를 깨지 않게 */ }
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

// ── 프리뷰 세션 핸드오프(P3) — pull(handoff_request)/push(handoff_push) 프레임 왕복 ──
let handoffSeq = 0;
const handoffPending = new Map<string, { resolve: (v: any) => void; timer: ReturnType<typeof setTimeout> }>();
function newHandoffReqId(): string { handoffSeq += 1; return 'mb-' + Date.now() + '-' + handoffSeq; }
// back 이 회신한 handoff_payload/handoff_ack 를 대기 Promise 로 전달(onmessage 에서 호출).
function resolveHandoff(reqId: string, msg: any): void {
  const p = handoffPending.get(reqId);
  if (!p) return;
  clearTimeout(p.timer); handoffPending.delete(reqId); p.resolve(msg);
}
function sendHandoff(frame: Record<string, unknown>, timeoutMs: number): Promise<any> {
  return new Promise((resolve) => {
    const reqId = String(frame.reqId);
    if (!uiSock || uiSock.readyState !== 1) { resolve({ ok: false, error: '서버에 연결돼 있지 않아요' }); return; }
    const timer = setTimeout(() => { handoffPending.delete(reqId); resolve({ ok: false, error: '응답 시간 초과' }); }, timeoutMs);
    handoffPending.set(reqId, { resolve, timer });
    if (!uiSend(frame)) { clearTimeout(timer); handoffPending.delete(reqId); resolve({ ok: false, error: '전송 실패' }); }
  });
}
/** 이어받기(pull) — 다른 기기의 프리뷰 매니페스트 요청. {ok, manifest?, from?, error?}. */
export function requestHandoff(kind: 'preview' | 'ide' = 'preview'): Promise<any> {
  return sendHandoff({ type: 'handoff_request', reqId: newHandoffReqId(), kind }, 20000);
}
/** 보내기(push) — 이 기기 매니페스트를 지정 기기에 복원 요청. {ok, error?}. */
export function pushHandoff(target: { deviceId?: number; clientKey?: string }, manifest: unknown, wsLocalPath?: string): Promise<any> {
  return sendHandoff({ type: 'handoff_push', reqId: newHandoffReqId(), target, manifest, ws: wsLocalPath }, 25000);
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
      // attach(지금부터) — 알림 과거분은 REST listNotifications 재로드가 채우므로 리플레이 불필요.
      try { sock.send(JSON.stringify({ type: 'attach', lastRseq: -1 })); } catch (_) { /* noop */ }
      // ui_command 회신/활동 신호 채널로 이 소켓을 지정 + 접속 인사(기기 식별).
      uiSock = sock;
      Promise.all([getClientKey(), getMyDeviceId()]).then(([k, deviceId]) => {
        myClientKey = k; // present 판정(alertClientKey 비교)용
        if (aborted || ws !== sock || sock.readyState !== 1) return;
        // 기기 식별 + 타겟팅용 id/이름 동봉(deviceId 는 등록 전이면 null — deviceName/kind 로도 매칭 가능).
        try { sock.send(JSON.stringify({ type: 'ui_hello', clientKey: k, kind: 'mobile', deviceId: deviceId ?? undefined, deviceName: getDeviceLabel() })); } catch (_) { /* noop */ }
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
      // ui_command 프레임 통과 — WSS 전용(회신 채널이 있는 경로).
      if (m && m.type === 'ui_command' && m.cmd) onUiCommand?.(m as UiCommandFrame);
      // 핸드오프 응답 — 대기 중인 pull/push Promise 로 전달.
      if (m && (m.type === 'handoff_payload' || m.type === 'handoff_ack') && m.reqId) resolveHandoff(String(m.reqId), m);
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

export default { createNotification, listNotifications, markRead, markAllRead, subscribeNotifEvents, setUiCommandListener, dispatchUiCommand, sendUiResult, sendUiActivity, sendPresence, getMyClientKey, setRunnerStatusListener, setAccountDeletedListener, setApplyingRemoteClose, propagatePreviewClose, requestHandoff, pushHandoff };
