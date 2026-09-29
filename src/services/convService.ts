// convService.ts — 채팅 v2(conv.*) 전송 + push 분배 + caps.
//
// 계약 정본: codingpt_daemon/docs/chat-v2-design.md §3(push) · §4(RPC) · §4.0(REST 모양) · §9(게이팅).
//
// ★ 전송 규칙 — **평문 REST 하나만 쓴다**(`POST /api/daemon/conv`). 봉인 RPC 를 먼저 시도하고 실패하면
//  평문으로 내려가는 관용(sealedFs)을 여기에 쓰지 않는다: 봉인 요청이 타임아웃으로 끝났어도 PC 는 이미
//  실행했을 수 있고, 같은 메시지를 평문으로 한 번 더 보내면 에이전트가 **두 번** 받는다(taskService 머리주석과
//  같은 사고). conv_event 를 봉투로 싸는 것은 후속 과제다(§11).
//  2차 방어는 멱등 키다 — send/create 는 항상 `clientId` 를 싣고, 재시도는 **같은 clientId** 로 한다.
//
// ★ 실패는 HTTP 상태가 아니라 `detail.code` 로 분기한다(§4.0). back 은 데몬 오류를 전부 500 으로 돌려주고
//  code 만 다르다. 문구를 읽어 판정하지 않는다 — 문구는 번역되고 바뀐다.

import { apiRequest } from '../utils/api';
import { hostHasCap, getServerCaps, refreshHostCaps, subscribeHostCaps, capsLoaded } from './taskService';
import type { ConvFrame, ConvOpenResult, ConvEvent, Thread } from '../workspace/conv/convModel';

export const CONV_CAP = 'conv.v1';

/** back 릴레이 타임아웃(§8). 클라 HTTP 타임아웃은 이 값 + 5초 — back 의 TIMEOUT 이 먼저 도착해야 사유가 code 로 온다. */
const SLOW = new Set(['conv.create', 'conv.send', 'conv.open', 'conv.adopt', 'conv.toTerminal']);
const CLIENT_MARGIN_MS = 5000;
export function convTimeoutMs(method: string): number {
  return (SLOW.has(method) ? 30000 : 15000) + CLIENT_MARGIN_MS;
}

/** 읽기 — 전송 실패(도메인 code 아님)면 1회 다시 부른다. 변이는 자동으로 다시 보내지 않는다. */
const READS = new Set(['conv.caps', 'conv.list', 'conv.open', 'conv.since', 'conv.before', 'conv.detail', 'conv.commands']);
const RETRYABLE = new Set(['TIMEOUT', 'NETWORK']);

export class ConvError extends Error {
  code: string;
  status: number;
  constructor(message: string, code: string, status = 0) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function toConvError(e: any, fallback = 'CONV_ERROR'): ConvError {
  if (e instanceof ConvError) return e;
  const code = typeof e?.code === 'string' && e.code ? e.code : fallback;
  return new ConvError(String(e?.message || code), code, typeof e?.status === 'number' ? e.status : 0);
}

const hostBody = (host?: number | null) => (host != null ? { hostDeviceId: host } : {});

async function once<T>(method: string, params: Record<string, unknown>, host: number | null | undefined): Promise<T> {
  const r = await apiRequest<T>('/api/daemon/conv', {
    method: 'POST',
    body: { method, params, ...hostBody(host) },
    timeoutMs: convTimeoutMs(method),
    silent: true,
  });
  if (r.success && r.data !== undefined && r.data !== null) {
    // 성공은 데몬 결과가 최상위다(§4.0). 그래도 code 가 실려 있으면 실패다 — 구 back 이 200 으로 감싸 보낸 경우.
    const d = r.data as any;
    //  ⚠ `ok:false` 는 실패가 아니다 — conv.send·conv.interrupt 는 거절 사유를 code 로 실은 **정상 응답**을 준다.
    if (d && typeof d === 'object' && typeof d.code === 'string' && d.code && d.success === false) {
      throw new ConvError(String(d.message || d.code), d.code, r.status || 200);
    }
    return r.data as T;
  }
  let code = r.code || '';
  if (!code) {
    if (r.status === 409) code = 'DAEMON_OFFLINE';
    else if (r.status === 403) code = 'CONV_DISABLED';
    else if (r.status === 404) code = 'SERVER_NEEDS_UPDATE';      // 라우트 자체가 없는 구 back
    else if (!r.status) code = /abort/i.test(String(r.error || '')) ? 'TIMEOUT' : 'NETWORK';
    else code = 'CONV_ERROR';
  }
  throw new ConvError(String(r.error || r.message || code), code, r.status || 0);
}

/** conv.* 단일 진입점. host = 그 대화가 있는 PC 의 deviceId. */
export async function convRpc<T = any>(method: string, params: Record<string, unknown>, host: number | null | undefined): Promise<T> {
  try {
    return await once<T>(method, params, host);
  } catch (e) {
    const err = toConvError(e);
    if (READS.has(method) && RETRYABLE.has(err.code)) {
      return once<T>(method, params, host).catch((e2) => { throw toConvError(e2); });
    }
    throw err;
  }
}

// ── 메서드 래퍼(§4 표) — 화면이 메서드명 문자열을 흩뿌리지 않게 ─────────────────

export interface ConvCaps { enabled: boolean; agents: { id: string; label: string; available: boolean; version?: string }[]; modes: string[]; maxLive: number }
export interface ConvCommand { name: string; desc: string }

export const caps = (host: number | null) => convRpc<ConvCaps>('conv.caps', {}, host);
export const list = (host: number | null, p: { cwd?: string; limit?: number; includeExternal?: boolean } = {}) =>
  convRpc<{ threads: Thread[] }>('conv.list', p, host);
export const create = (host: number | null, p: { cwd: string; agent?: string; mode?: string; model?: string; text?: string; clientId?: string; attachments?: unknown[] }) =>
  convRpc<{ thread: Thread; seq?: number }>('conv.create', p as Record<string, unknown>, host);
// cwd — 우리 색인에 없는 대화(목록의 external:true = 터미널에서 만든 대화)를 처음 열 때 데몬이 세션 파일을 찾는 근거다(§4).
export const open = (host: number | null, threadId: string, o: { limit?: number; cwd?: string } = {}) =>
  convRpc<ConvOpenResult>('conv.open', { threadId, ...(o.limit ? { limit: o.limit } : {}), ...(o.cwd ? { cwd: o.cwd } : {}) }, host);
export const since = (host: number | null, threadId: string, sinceSeq: number) =>
  convRpc<ConvOpenResult>('conv.since', { threadId, sinceSeq }, host);
export const before = (host: number | null, threadId: string, beforeSeq: number, limit?: number) =>
  convRpc<{ events: ConvEvent[]; floorSeq: number; more?: boolean }>('conv.before', { threadId, beforeSeq, ...(limit ? { limit } : {}) }, host);
export const send = (host: number | null, p: { threadId: string; clientId: string; text: string; attachments?: unknown[] }) =>
  // ★ `{ok:false, status:'failed', code}` 도 **정상 응답(200)**이다(§4.1) — 에이전트에 전달하지 않고 거절한 것
  //   (터미널에서만 쓸 수 있는 명령 등). 던지지 않고 그대로 돌려준다: 화면은 실패 버블이 아니라 안내를 그린다.
  convRpc<{ ok: boolean; status: 'sent' | 'queued' | 'failed'; seq?: number; code?: string }>('conv.send', p as Record<string, unknown>, host);
export const respond = (host: number | null, p: {
  threadId: string; reqId: string; decision: 'allow' | 'deny' | 'answer';
  always?: boolean; message?: string; answers?: Record<string, string | string[]>; by?: string;
}) => convRpc<{ ok: boolean }>('conv.respond', p as Record<string, unknown>, host);
export const interrupt = (host: number | null, threadId: string) =>
  convRpc<{ ok: boolean; interrupted: boolean; code?: string }>('conv.interrupt', { threadId }, host);
export const set = (host: number | null, threadId: string, p: { mode?: string; model?: string; title?: string }) =>
  convRpc<{ thread: Thread }>('conv.set', { threadId, ...p }, host);
export const stop = (host: number | null, threadId: string) => convRpc<{ ok: boolean }>('conv.stop', { threadId }, host);
export const remove = (host: number | null, threadId: string) => convRpc<{ ok: boolean }>('conv.remove', { threadId }, host);
export const detail = (host: number | null, threadId: string, key: string) =>
  convRpc<{ text: string; raw?: unknown }>('conv.detail', { threadId, key }, host);
export const commands = (host: number | null, p: { threadId?: string; cwd?: string }) =>
  convRpc<{ items: ConvCommand[] }>('conv.commands', p, host);
export const toTerminal = (host: number | null, threadId: string) =>
  convRpc<{ ok: boolean; cwd: string; agent?: string; command: string; args?: string[] }>('conv.toTerminal', { threadId }, host);
export const adopt = (host: number | null, cwd: string, tid: number) =>
  convRpc<{ thread: Thread }>('conv.adopt', { cwd, tid }, host);

// ── conv_event 분배 ────────────────────────────────────────────────────────
//  notificationService 의 단일 WSS(+SSE 폴백)에 동승한 프레임을 여기로 흘린다(approval/chat 과 같은 패턴).
//  이 채널은 놓친 구간을 다시 보내 주지 않는다 → 받는 쪽이 seq 로 틈을 알아채고 conv.since 로 메운다.
type ConvListener = (f: ConvFrame) => void;
const listeners = new Set<ConvListener>();

export function addConvEventListener(fn: ConvListener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
export function dispatchConvEvent(f: ConvFrame): void {
  if (!f || typeof f !== 'object') return;
  for (const fn of [...listeners]) { try { fn(f); } catch (_) { /* 한 화면의 오류가 다른 화면을 막지 않게 */ } }
}
/** 테스트·진단용 — 지금 듣고 있는 화면 수. */
export function convListenerCount(): number { return listeners.size; }

// ── caps(§9) — 데몬 caps ∩ 서버 caps ∩ 이 앱 ─────────────────────────────────
//  조회·캐시는 taskService 의 호스트 caps 한 벌을 쓴다(GET /api/daemon/status 를 기능마다 따로 부르지 않는다).

/** 그 PC 에서 채팅을 쓸 수 있는가 — true / false / null(아직 모름). 모름을 "없음"으로 단정하지 않는다. */
export function hostSupportsConv(host: number | null | undefined): boolean | null {
  return hostHasCap(host, CONV_CAP);
}
/** 서버가 채팅을 껐는가(킬스위치) — true = 꺼짐. 모르면 false. */
export function serverDisabledConv(): boolean {
  const sc = getServerCaps();
  return !!sc && !sc.includes(CONV_CAP);
}
/**
 * 서버가 에이전트 실행 인자(`POST /api/daemon/agents/launch` 의 args)를 데몬까지 넘기는가 — 서버 cap `launchargs.v1`.
 *  채팅 → 터미널 이어가기의 전제다(§6.1·§4.4). 모르면(구 back) false: 인자가 떨어지면 새 대화가 실행된다.
 */
export const LAUNCH_ARGS_CAP = 'launchargs.v1';
export function serverForwardsLaunchArgs(): boolean {
  const sc = getServerCaps();
  return !!sc && sc.includes(LAUNCH_ARGS_CAP);
}
export { refreshHostCaps, subscribeHostCaps, capsLoaded };

export default {
  CONV_CAP, convRpc, convTimeoutMs, toConvError,
  caps, list, create, open, since, before, send, respond, interrupt, set, stop, remove, detail, commands, toTerminal, adopt,
  addConvEventListener, dispatchConvEvent, convListenerCount,
  hostSupportsConv, serverDisabledConv, serverForwardsLaunchArgs, refreshHostCaps, subscribeHostCaps, capsLoaded,
};
