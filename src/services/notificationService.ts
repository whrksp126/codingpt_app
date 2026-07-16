import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiRequest, api, refreshAccessToken } from '../utils/api';
import { BACK_URL } from '../utils/service';
import { getClientKey } from './daemonService';

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
export type NotifEvent =
  | { kind: 'new'; notification: NotifRow }
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

// 사용자 입력 신호 — 서버가 "최근 조작 기기"를 판단하는 힌트. 30초 스로틀 내장.
let lastUiActivityAt = 0;
export function sendUiActivity(): void {
  const now = Date.now();
  if (now - lastUiActivityAt < 30000) return;
  if (uiSend({ type: 'ui_activity' })) lastUiActivityAt = now;
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
    if (!m || m.type !== 'notif_event' || !m.event) return;
    const ev = m.event;
    if (ev.kind === 'new' && ev.notification) onEvent(ev as NotifEvent);
    else if (ev.kind === 'read' && Array.isArray(ev.ids)) onEvent(ev as NotifEvent);
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
      getClientKey().then((k) => {
        if (aborted || ws !== sock || sock.readyState !== 1) return;
        try { sock.send(JSON.stringify({ type: 'ui_hello', clientKey: k, kind: 'mobile' })); } catch (_) { /* noop */ }
      }).catch(() => { /* noop */ });
    };
    sock.onmessage = (ev: WebSocketMessageEvent) => {
      if (aborted) return;
      let m: any; try { m = JSON.parse(String(ev.data)); } catch (_) { return; }
      emit(m);
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

export default { createNotification, listNotifications, markRead, markAllRead, subscribeNotifEvents, setUiCommandListener, dispatchUiCommand, sendUiResult, sendUiActivity };
