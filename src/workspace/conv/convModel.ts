import * as i18n from '../../i18n/index.ts';
import { buildRows, mediaRefOf, toolLabel, type ChatMsg, type ChatQuestion, type ChatRowModel } from '../chatModel';
// convModel.ts — 채팅 v2(구조화 대화)의 **순수 모델**. RN 의존성 0(jest 로 직접 검증한다).
//
// 계약 정본: codingpt_daemon/docs/chat-v2-design.md — §2(데이터 모델) · §3(push) · §4(RPC) · §10(클라 규칙).
//  PC 도 같은 규칙으로 움직인다. 규칙을 바꿀 땐 문서를 먼저 고친다.
//
// 이 파일이 지키는 것:
//  ① **push 는 힌트, pull 이 정본.** 영속 이벤트는 seq 가 이어질 때만 적용하고, 틈이 보이면 아무것도
//     적용하지 않은 채 "다시 받아라"(need:'since')만 돌려준다. 틈을 건너뛰고 적용하면 그 사이의 승인 요청·
//     메시지가 **영영 화면에 안 뜬다**(다음 프레임은 다시 이어져 보이므로 회복할 계기가 없다).
//  ② 메시지·요청은 key/id 로 접는다(upsert). 같은 key 의 뒤 이벤트가 앞을 대체하되 **자리는 처음 나타난
//     곳**에 남는다 — 'queued' → 'sent' 로 바뀐 내 말풍선이 대화 끝으로 튀어 내려가면 안 된다.
//  ③ 델타는 off 가 내 누적 길이와 맞을 때만 이어 붙인다. 어긋난 조각을 붙이면 글자가 빠지거나 겹친
//     문장이 그대로 굳는다(완성 msg 가 오기 전까지 사용자는 그걸 읽는다).
//  ④ 낙관 버블은 clientId 로만 짝짓는다. v1 처럼 본문 앞 200자로 맞추지 않는다 — 같은 말을 두 번 보내면
//     한쪽이 사라졌다.

// ── 와이어 타입(§2) ─────────────────────────────────────────────────────────

export type ThreadState = 'idle' | 'working' | 'waiting' | 'stopped' | 'error';
export type ThreadOwner = 'chat' | 'terminal' | 'none';

/** §4.5 — 턴 끝·assistant usage 로 갱신. 필드는 전부 null 일 수 있다(모름). contextPct 는 0~100 정수. */
export interface ThreadUsage { contextTokens?: number | null; contextMax?: number | null; contextPct?: number | null; costUsd?: number | null; model?: string | null }

export interface Thread {
  id: string;
  agent?: string;
  cwd?: string;
  title?: string;
  titleSet?: boolean;
  createdAt?: number;
  lastAt?: number;
  state?: ThreadState;
  owner?: ThreadOwner;
  ownerTid?: number | null;
  mode?: string;
  model?: string | null;
  /** 추론 강도('' = CLI 기본값). PC conv-view 와 같은 필드. */
  effort?: string | null;
  headSeq?: number;
  pending?: number;
  preview?: string;
  usage?: ThreadUsage | null;
  external?: boolean;
}

/** v1 ChatMsg 와 같은 모양 + 안정 key. ts 는 ISO 문자열이거나 epoch ms(데몬 구현에 따라 — 둘 다 받는다). */
export interface ConvMsg extends Omit<ChatMsg, 'ts'> {
  key: string;
  ts?: string | number | null;
  clientId?: string;
  status?: 'queued' | 'sent' | 'failed';
  turn?: number;
  parent?: string | null;
}

export type ConvReqStatus = 'pending' | 'allowed' | 'denied' | 'answered' | 'canceled';

export interface ConvReq {
  id: string;
  kind: 'permission' | 'question' | 'plan';
  tool?: string;
  toolUseId?: string | null;
  summary?: string;
  detail?: string | null;
  relPath?: string | null;
  diff?: { kind: string; oldContent?: string; newContent?: string; truncated?: boolean } | null;
  inputPreview?: Record<string, unknown> | null;
  questions?: ChatQuestion[];
  plan?: string;
  alwaysLabel?: string | null;
  status: ConvReqStatus;
  /** true = "허용하고 다음부터 묻지 않기" 로 허용됨. */
  always?: boolean;
  reason?: string;
  by?: string;
  requestedAt?: number;
  resolvedAt?: number;
  turn?: number;
}

// `first` — upsert(둘째 판부터)에만 실린다: 그 key 가 **처음 나온** seq(§2.2). 행의 자리는 `first ?? seq` 다.
//  pull 응답(open/since/before)은 **접은 스냅샷**이라 같은 key 의 옛 줄이 빠져 있다 → seq 가 띄엄띄엄하다.
//  그때 자리를 알려 주는 것이 이 값뿐이다(없으면 'queued'→'sent' 로 바뀐 말풍선이 뒤로 밀린다).
export type ConvEvent =
  | { seq: number; ts?: number; op: 'msg'; msg: ConvMsg; first?: number; uuid?: string }
  | { seq: number; ts?: number; op: 'turn'; phase: 'start' | 'end'; turn: number; ok?: boolean; subtype?: string; interrupted?: boolean; durationMs?: number; usage?: Record<string, number>; costUsd?: number }
  | { seq: number; ts?: number; op: 'req'; req: ConvReq; first?: number }
  | { seq: number; ts?: number; op: 'state'; state?: ThreadState; mode?: string; model?: string | null; usage?: ThreadUsage | null; owner?: ThreadOwner; ownerTid?: number | null; title?: string; titleSet?: boolean; pending?: number }
  | { seq: number; ts?: number; op: 'notice'; level: 'info' | 'warn' | 'error'; code?: string; text?: string };

export interface ConvDelta { key: string; kind: 'text' | 'thinking'; off: number; text: string }

export interface ConvFrame {
  type?: 'conv_event';
  threadId?: string;
  /** back 이 붙인다 — 프레임이 온 PC. 내 탭의 호스트와 다르면 남의 대화다(§3). */
  hostDeviceId?: number | null;
  headSeq?: number;
  events?: ConvEvent[];
  delta?: ConvDelta;
  thread?: Thread;
  control?: { kind: 'gone' | 'deleted'; threadId?: string };
}

export interface LiveBlock { key: string; kind: 'text' | 'thinking'; text: string }

export interface ConvOpenResult {
  thread?: Thread | null;
  events?: ConvEvent[];
  headSeq?: number;
  floorSeq?: number;
  /** 완성 전 블록 `[{key, kind, text}]`(§4.4). */
  live?: unknown;
  /** 지금 열려 있는 요청 `[ConvReq]` — 개수가 아니다(개수는 thread.pending). */
  pending?: unknown;
  more?: boolean;
  /** conv.since 전용 — 내가 아는 로그가 데몬 것이 아니다. 로컬 상태를 버리고 이 응답으로 바꾼다. */
  reset?: boolean;
}

// ── 클라 상태 ───────────────────────────────────────────────────────────────

/** 턴 끝·안내 — 메시지가 아닌데 대화 흐름 안에 자리를 갖는 것들. */
export interface ConvMark {
  seq: number;
  ts: number;
  kind: 'turn' | 'notice';
  turn?: number;
  ok?: boolean;
  interrupted?: boolean;
  durationMs?: number;
  subtype?: string;
  level?: 'info' | 'warn' | 'error';
  code?: string;
  text?: string;
}

export type OutStatus = 'sending' | 'sent' | 'queued' | 'failed';

/** 낙관 버블 — 보낸 **원문을 버블이 보관**한다(§10.2). 입력칸은 이미 비었으므로 여기가 유일한 사본이다. */
export interface Outgoing {
  clientId: string;
  /** 화면에 보이는 글(첨부 토큰 포함 원문). */
  text: string;
  /** 실제로 보낸 글(토큰 → 인용 경로로 바꾼 것). 다시 시도도 이 값을 그대로 보낸다. */
  sendText: string;
  at: number;
  status: OutStatus;
  /** 실패 사유 code(문구가 아니다). */
  code?: string;
  tries: number;
  /** 함께 보낸 첨부(conv.send/create 의 attachments). 다시 시도도 같은 목록을 보낸다. */
  attachments?: ConvAttachment[];
}

export interface ConvState {
  threadId: string | null;
  thread: Thread | null;
  /** 지금까지 **빠짐없이** 적용한 마지막 seq. conv.since 의 sinceSeq. */
  headSeq: number;
  /** 들고 있는 가장 오래된 seq(이보다 앞은 conv.before 로). 0/1 = 처음까지 다 받았다. */
  floorSeq: number;
  msgs: Record<string, ConvMsg>;
  /** key → 그 key 가 **처음 나타난** seq. 자리(정렬)와 표시용 안정 seq 의 근거. */
  first: Record<string, number>;
  /** first 오름차순 key 목록. */
  order: string[];
  reqs: Record<string, ConvReq>;
  reqSeq: Record<string, number>;
  marks: ConvMark[];
  live: Record<string, LiveBlock>;
  /** 진행 중인 턴(없으면 null). startedAt = 경과 시간 표시의 기준. */
  turn: { n: number; startedAt: number; seq: number } | null;
  /** thread 필드를 마지막으로 바꾼 state 이벤트의 seq — 옛 이벤트(conv.before)가 새 값을 덮지 않게. */
  stateSeq: number;
  outbox: Outgoing[];
  /** 서버가 실패로 적은 내 메시지의 사유(clientId → code) — 전송 회신이 알려 준 것만. 버튼을 정하는 근거. */
  failCodes: Record<string, string>;
  /** 사용자가 [삭제] 한 실패 메시지 key — 로그는 데몬 것이라 못 지운다. 이 기기에서만 감춘다. */
  hiddenKeys: Record<string, true>;
  gone: null | 'gone' | 'deleted';
}

export function emptyState(threadId: string | null = null): ConvState {
  return {
    threadId, thread: null, headSeq: 0, floorSeq: 0,
    msgs: {}, first: {}, order: [], reqs: {}, reqSeq: {}, marks: [], live: {},
    turn: null, stateSeq: 0, outbox: [], failCodes: {}, hiddenKeys: {}, gone: null,
  };
}

/** epoch ms / ISO 문자열 → epoch ms. 모르면 0. */
export function tsOf(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v) { const n = Date.parse(v); return Number.isFinite(n) ? n : 0; }
  return 0;
}

const seqOk = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n > 0;

/** 사용자 메시지의 clientId — 필드가 정본이고, 없으면 key('u:'+clientId)에서 읽는다. */
export function clientIdOf(m: Pick<ConvMsg, 'key' | 'clientId' | 'role'>): string | null {
  if (m.clientId) return m.clientId;
  if (m.role === 'user' && typeof m.key === 'string' && m.key.startsWith('u:')) return m.key.slice(2) || null;
  return null;
}

/** conv.open/since 의 live — 배열이든 key→블록 맵이든 받는다(문서가 모양을 못박지 않았다). */
export function normalizeLive(v: unknown): Record<string, LiveBlock> {
  const out: Record<string, LiveBlock> = {};
  const put = (x: any, k?: string) => {
    if (!x || typeof x !== 'object') return;
    const key = String(x.key || k || '');
    if (!key) return;
    out[key] = { key, kind: x.kind === 'thinking' ? 'thinking' : 'text', text: typeof x.text === 'string' ? x.text : '' };
  };
  if (Array.isArray(v)) v.forEach((x) => put(x));
  else if (v && typeof v === 'object') for (const k of Object.keys(v as object)) put((v as any)[k], k);
  return out;
}

function insertSorted(order: string[], first: Record<string, number>, key: string): string[] {
  const s = first[key];
  // 거의 항상 맨 뒤다(새 메시지) — 뒤에서부터 찾는다.
  let i = order.length;
  while (i > 0 && first[order[i - 1]] > s) i -= 1;
  const next = order.slice();
  next.splice(i, 0, key);
  return next;
}

/**
 * 이벤트를 상태에 접는다 — **순서·중복에 무관하게 같은 결과**(멱등)여야 한다.
 *  push·since·before·캐시가 같은 구간을 겹쳐 배달할 수 있고, 어느 쪽이 먼저 오는지는 정해져 있지 않다.
 *  head/floor 는 여기서 건드리지 않는다(틈 판정은 부르는 쪽 몫 — 접는 일과 섞으면 규칙이 흐려진다).
 */
export function ingestEvents(state: ConvState, events: ConvEvent[] | null | undefined, opts?: { derive?: boolean }): ConvState {
  if (!Array.isArray(events) || !events.length) return state;
  let msgs = state.msgs; let first = state.first; let order = state.order;
  let reqs = state.reqs; let reqSeq = state.reqSeq;
  let marks = state.marks; let live = state.live; let outbox = state.outbox;
  let thread = state.thread; let stateSeq = state.stateSeq; let turn = state.turn;
  let touched = false;
  // 상태 따라가기(아래 맨 끝)에 쓰는 표식 — 이번 묶음에서 본 턴 끝과, 상태를 직접 말한 state 이벤트의 seq.
  let turnEndSeq = 0;
  let saidStateSeq = 0;
  let reqTouched = false;

  for (const ev of events) {
    if (!ev || !seqOk(ev.seq)) continue;
    if (ev.op === 'msg' && ev.msg && typeof ev.msg.key === 'string' && ev.msg.key) {
      const key = ev.msg.key;
      const cur = msgs[key];
      const firstSeq = Math.min(seqOk(ev.first) ? ev.first : ev.seq, first[key] ?? Infinity);
      const newer = !cur || ev.seq >= cur.seq;
      if (first[key] !== firstSeq) {
        if (first === state.first) first = { ...first };
        const had = first[key] !== undefined;
        first[key] = firstSeq;
        order = insertSorted(had ? order.filter((k) => k !== key) : order, first, key);
        touched = true;
      }
      if (newer && !(cur && cur.seq === ev.seq)) {
        if (msgs === state.msgs) msgs = { ...msgs };
        msgs[key] = { ...ev.msg, seq: ev.seq, ts: ev.msg.ts ?? ev.ts ?? null };
        touched = true;
      }
      // 완성된 블록이 왔다 = 초안은 끝났다(같은 key 의 msg 가 초안을 대체한다, §2.5).
      if (live[key]) {
        if (live === state.live) live = { ...live };
        delete live[key];
        touched = true;
      }
      // 서버가 내 메시지를 기록했다 → 낙관 버블을 걷는다. 단 'failed' 는 남긴다(다시 시도·삭제는 버블의 몫).
      const cid = clientIdOf(ev.msg);
      if (cid && ev.msg.status !== 'failed' && outbox.some((o) => o.clientId === cid)) {
        outbox = outbox.filter((o) => o.clientId !== cid);
        touched = true;
      }
      continue;
    }
    if (ev.op === 'req' && ev.req && typeof ev.req.id === 'string' && ev.req.id) {
      const id = ev.req.id;
      if (reqSeq[id] !== undefined && reqSeq[id] >= ev.seq) continue;
      if (reqs === state.reqs) { reqs = { ...reqs }; reqSeq = { ...reqSeq }; }
      reqs[id] = { ...ev.req, requestedAt: ev.req.requestedAt ?? ev.ts ?? 0 };
      reqSeq[id] = ev.seq;
      touched = true;
      reqTouched = true;
      continue;
    }
    if (ev.op === 'turn') {
      if (ev.phase === 'start') {
        if (!turn || ev.seq > turn.seq) {
          // 이 턴의 끝을 이미 봤으면(옛 구간을 뒤늦게 받음) 되살리지 않는다.
          const ended = marks.some((m) => m.kind === 'turn' && m.turn === ev.turn && m.seq > ev.seq);
          if (!ended && ev.seq > stateSeqOfEnd(marks)) { turn = { n: ev.turn, startedAt: ev.ts || 0, seq: ev.seq }; touched = true; }
        }
        continue;
      }
      if (marks.some((m) => m.seq === ev.seq)) continue;
      marks = insertMark(marks, {
        seq: ev.seq, ts: ev.ts || 0, kind: 'turn', turn: ev.turn, ok: ev.ok, interrupted: ev.interrupted,
        durationMs: ev.durationMs, subtype: ev.subtype,
      });
      if (turn && ev.seq > turn.seq) turn = null;
      // 턴이 끝났는데 자라는 블록은 없다 — 남은 초안은 완성 msg 를 못 받은 잔해다.
      if (Object.keys(live).length) live = {};
      if (ev.seq > turnEndSeq) turnEndSeq = ev.seq;
      touched = true;
      continue;
    }
    if (ev.op === 'state') {
      if (ev.seq <= stateSeq) continue;
      stateSeq = ev.seq;
      const patch: Partial<Thread> = {};
      if (ev.state !== undefined) { patch.state = ev.state; saidStateSeq = ev.seq; }
      if (ev.mode !== undefined) patch.mode = ev.mode;
      if (ev.model !== undefined) patch.model = ev.model;
      if (ev.usage !== undefined) patch.usage = ev.usage;
      if (ev.owner !== undefined) patch.owner = ev.owner;
      if (ev.ownerTid !== undefined) patch.ownerTid = ev.ownerTid;
      if (ev.title !== undefined) patch.title = ev.title;
      if (ev.titleSet !== undefined) patch.titleSet = ev.titleSet;
      if (ev.pending !== undefined) patch.pending = ev.pending;
      thread = { ...(thread || { id: state.threadId || '' }), ...patch };
      // 프로세스가 내려갔거나 죽었다 — 턴 끝 이벤트를 못 받았어도 "작업 중"에 굳지 않는다.
      if (turn && ev.seq > turn.seq && (ev.state === 'idle' || ev.state === 'stopped' || ev.state === 'error')) turn = null;
      touched = true;
      continue;
    }
    if (ev.op === 'notice') {
      if (marks.some((m) => m.seq === ev.seq)) continue;
      marks = insertMark(marks, { seq: ev.seq, ts: ev.ts || 0, kind: 'notice', level: ev.level, code: ev.code, text: ev.text });
      touched = true;
    }
  }
  if (!touched) return state;
  // ── 상태 따라가기 ──
  //  working/waiting 전이는 state 이벤트로 오지 **않는다**(§2.2) — turn·req 이벤트가 이미 말해 준다:
  //   turn start → working · 열린 요청이 있으면 waiting · turn end → idle(그 뒤의 state 이벤트가 error 라면 그쪽).
  //  thread 힌트·pull 응답의 state 는 보조다(부르는 쪽이 이 뒤에 덮는다).
  if (opts?.derive !== false && (turn !== state.turn || turnEndSeq || reqTouched)) {
    let st = thread?.state;
    const hasOpen = Object.keys(reqs).some((id) => reqs[id].status === 'pending');
    if (turn) st = hasOpen ? 'waiting' : 'working';
    else if (turnEndSeq && turnEndSeq > saidStateSeq) st = st === 'error' && saidStateSeq ? st : 'idle';
    else if (st === 'working' || st === 'waiting') st = hasOpen ? 'waiting' : 'working';
    else if (hasOpen && reqTouched) st = 'waiting';
    if (st !== thread?.state) thread = { ...(thread || { id: state.threadId || '' }), state: st };
  }
  return { ...state, msgs, first, order, reqs, reqSeq, marks, live, outbox, thread, stateSeq, turn };
}

function insertMark(marks: ConvMark[], m: ConvMark): ConvMark[] {
  let i = marks.length;
  while (i > 0 && marks[i - 1].seq > m.seq) i -= 1;
  const next = marks.slice();
  next.splice(i, 0, m);
  return next;
}
/** 마지막 턴 끝의 seq(없으면 0) — 그보다 앞선 turn start 는 이미 끝난 턴이다. */
function stateSeqOfEnd(marks: ConvMark[]): number {
  for (let i = marks.length - 1; i >= 0; i--) if (marks[i].kind === 'turn') return marks[i].seq;
  return 0;
}

/** 이벤트 묶음이 seq 로 빈틈없이 이어지는가(오름차순 +1). */
export function isContiguous(events: ConvEvent[]): boolean {
  for (let i = 0; i < events.length; i++) {
    if (!events[i] || !seqOk(events[i].seq)) return false;
    if (i > 0 && events[i].seq !== events[i - 1].seq + 1) return false;
  }
  return true;
}

export type Need = 'none' | 'since';

/**
 * push 프레임 하나를 적용한다(§3·§10.1). need:'since' 면 부르는 쪽이 conv.since 를 부른다.
 *  host = 이 탭의 호스트. 프레임의 hostDeviceId 가 있고 다르면 **남의 PC 의 대화**라 버린다.
 */
export function applyPush(state: ConvState, frame: ConvFrame | null | undefined, host?: number | null): { state: ConvState; need: Need } {
  if (!frame || typeof frame !== 'object') return { state, need: 'none' };
  if (host != null && frame.hostDeviceId != null && Number(frame.hostDeviceId) !== Number(host)) return { state, need: 'none' };
  const tid = frame.threadId || frame.control?.threadId || null;
  if (!state.threadId || tid !== state.threadId) return { state, need: 'none' };

  if (frame.control) {
    const k = frame.control.kind;
    if (k === 'gone' || k === 'deleted') return { state: state.gone === k ? state : { ...state, gone: k }, need: 'none' };
    return { state, need: 'none' };
  }
  let next = state;
  let need: Need = 'none';
  if (frame.thread && typeof frame.thread === 'object') {
    // 목록 갱신 힌트 — 제목·상태·preview. 모드/상태는 state 이벤트가 정본이지만, 힌트가 더 새 소식일 수 있다
    //  (내가 틈 때문에 이벤트를 못 받은 사이). 틀려도 다음 since 가 바로잡는다.
    next = { ...next, thread: { ...(next.thread || { id: state.threadId }), ...frame.thread } };
    // 가져온 과거(터미널에서 이어 간 대화)는 push 되지 않는다(§4.3 — 수천 건일 수 있다). 힌트의 headSeq 가
    //  내 것보다 크면 내가 모르는 이벤트가 있다 → 당겨 온다. 같은 프레임에 이벤트가 실려 있으면 그쪽이 판정한다.
    const hs = frame.thread.headSeq;
    if (seqOk(hs) && hs > next.headSeq && !(Array.isArray(frame.events) && frame.events.length)) need = 'since';
  }
  if (Array.isArray(frame.events) && frame.events.length) {
    const evs = frame.events;
    if (!isContiguous(evs)) need = 'since';
    else {
      const head = next.headSeq;
      const lastSeq = evs[evs.length - 1].seq;
      if (lastSeq <= head) { /* 전부 이미 받은 구간(중복 배달) — 버린다 */ }
      else if (evs[0].seq > head + 1) need = 'since';   // 틈 — 아무것도 적용하지 않는다
      else {
        // 앞부분이 겹치는 프레임 — 아는 구간은 건너뛰고 이어지는 뒷부분만 적용한다.
        const fresh = evs.filter((e) => e.seq > head);
        next = { ...ingestEvents(next, fresh), headSeq: lastSeq };
      }
    }
  }
  if (frame.delta && need === 'none') {
    const r = applyDelta(next, frame.delta);
    next = r.state; need = r.need;
  }
  return { state: next, need };
}

/** 델타 한 조각(§2.5). off 가 어긋나면 붙이지 않고 since 를 요구한다. */
export function applyDelta(state: ConvState, d: ConvDelta): { state: ConvState; need: Need } {
  if (!d || typeof d.key !== 'string' || !d.key || typeof d.text !== 'string') return { state, need: 'none' };
  // 이미 완성본을 가진 블록의 늦은 조각 — 버린다(완성본이 정본).
  if (state.msgs[d.key]) return { state, need: 'none' };
  const off = Number.isInteger(d.off) && d.off >= 0 ? d.off : -1;
  const cur = state.live[d.key];
  const have = cur ? cur.text.length : 0;
  const kind = d.kind === 'thinking' ? 'thinking' : 'text';
  if (off === have) {
    if (!d.text && cur) return { state, need: 'none' };
    return { state: { ...state, live: { ...state.live, [d.key]: { key: d.key, kind, text: (cur ? cur.text : '') + d.text } } }, need: 'none' };
  }
  // 이미 받은 구간의 재배달(글자까지 같다) — 조용히 버린다. 이걸 틈으로 보면 since 가 헛돈다.
  if (off >= 0 && off < have && cur && cur.text.slice(off, off + d.text.length) === d.text) return { state, need: 'none' };
  return { state, need: 'since' };
}

/**
 * conv.open 결과 — 상태를 통째로 갈아 끼운다. 낙관 버블은 남긴다(아직 서버에 없을 수 있다).
 *  ★ 단 **늦게 도착한 응답**은 갈아 끼우지 않는다: 요청을 보낸 뒤 push 가 먼저 와서 내 head 가 응답의 head 보다
 *   앞서 있으면, 응답은 내가 아는 것보다 옛 사진이다. 그걸로 덮으면 head·상태·자라던 글이 뒤로 돌아간다 →
 *   옛 이벤트만 채워 넣는다(force = reset 처럼 "무조건 교체"일 때).
 */
export function applyOpen(state: ConvState, res: ConvOpenResult | null | undefined, threadId: string, opts?: { force?: boolean }): ConvState {
  const base: ConvState = { ...emptyState(threadId), outbox: state.outbox, failCodes: state.failCodes, hiddenKeys: state.hiddenKeys };
  if (!res) return base;
  const resHead = seqOk(res.headSeq) ? res.headSeq : 0;
  if (!opts?.force && state.threadId === threadId && state.headSeq > 0 && state.headSeq > resHead) {
    const merged = ingestEvents(state, res.events || [], { derive: false });
    const floor = seqOk(res.floorSeq) ? res.floorSeq : 1;
    return { ...merged, floorSeq: merged.floorSeq > 0 ? Math.min(merged.floorSeq, floor) : floor };
  }
  // ★ pull 응답은 **접은 스냅샷**이다 — seq 가 띄엄띄엄한 것이 정상이다(연속성은 push 프레임에만 요구한다).
  let next = ingestEvents({ ...base, thread: res.thread || null }, res.events || []);
  // 이벤트가 접은 thread 필드보다 응답의 thread 가 새 소식이다(지금 이 순간의 상태).
  if (res.thread) next = { ...next, thread: { ...(next.thread || {}), ...res.thread } };
  const seqs = (res.events || []).map((e) => e.seq).filter(seqOk);
  const maxSeq = seqs.length ? Math.max(...seqs) : 0;
  const head = res.more ? maxSeq : Math.max(resHead, maxSeq);
  next = syncPending(next, res.pending, !res.more, head);
  return {
    ...next,
    // more:true(512KB 예산으로 잘림) 면 받은 데까지만 head 다 — 나머지는 since 가 이어 받는다.
    headSeq: head,
    // floorSeq: 데몬이 준 값이 정본이다 — **더 앞이 없으면 1**(§4). 받은 첫 이벤트의 seq 로 추측하지 않는다:
    //  접은 스냅샷은 첫 줄의 seq 가 1 이 아니어도 그 앞이 없을 수 있다(앞 줄이 전부 접혀 빠졌다).
    floorSeq: seqOk(res.floorSeq) ? res.floorSeq : 1,
    live: res.more ? {} : normalizeLive(res.live),
    turn: workingOf(next.thread) ? next.turn : null,
  };
}

/**
 * 응답의 pending(지금 열려 있는 요청 전부)과 맞춘다.
 *  · 목록에 있는데 내가 모르는 요청 → 들인다(이벤트 창 밖의 오래된 요청도 도크에 떠야 한다).
 *  · full=true(끝까지 받은 응답)이고 내가 대기 중으로 아는데 목록에 없다 → 닫혔다. 닫는 이벤트를 놓쳤어도
 *    답할 수 없는 카드(유령 카드)가 남지 않는다.
 *  · 단 **응답보다 뒤에 push 로 온 요청**(seq > upTo)은 건드리지 않는다 — 응답이 만들어질 때는 없던 요청이다.
 */
function syncPending(state: ConvState, pending: unknown, full: boolean, upTo: number): ConvState {
  if (!Array.isArray(pending)) return state;
  const open = new Set<string>();
  const add: ConvEvent[] = [];
  for (const r of pending) {
    if (!r || typeof r !== 'object' || typeof (r as ConvReq).id !== 'string') continue;
    const req = r as ConvReq;
    open.add(req.id);
    if (state.reqs[req.id]) continue;    // 이벤트로 이미 받았다(그쪽이 더 새 상태일 수 있다)
    // seq 를 모른다 → 1 로 둔다: 뒤에 오는 **어떤** req 이벤트도 이걸 덮을 수 있어야 한다.
    add.push({ seq: 1, ts: req.requestedAt || 0, op: 'req', req: { ...req, status: req.status || 'pending' } });
  }
  let next = ingestEvents(state, add, { derive: false });
  if (full) {
    let reqs = next.reqs;
    for (const id of Object.keys(reqs)) {
      if (reqs[id].status !== 'pending' || open.has(id)) continue;
      if ((next.reqSeq[id] || 0) > upTo) continue;
      if (reqs === next.reqs) reqs = { ...reqs };
      reqs[id] = { ...reqs[id], status: 'canceled' };
    }
    if (reqs !== next.reqs) next = { ...next, reqs };
  }
  return next;
}

/**
 * conv.since 결과.
 *  · `reset:true` = 내가 아는 로그가 데몬 것이 아니다(삭제 후 재생성 등) → 응답으로 **통째 교체**한다.
 *    부르는 쪽은 캐시도 버린다(reset 플래그). 로그가 바뀐 것을 알리는 길은 이것 하나다.
 *  · 접은 구간이라 seq 가 띄엄띄엄할 수 있다 — 틈으로 보지 않는다(연속성 검사는 push 프레임에만 한다).
 *    검사하면 upsert 가 한 번이라도 있는 대화에서 since 때마다 다시 열기가 되풀이된다.
 *  · 서버 head 가 내 head 보다 **작은** 응답 = 늦게 도착한 응답이다(그 사이 push 를 먼저 적용했다). 다시 열지 않는다.
 *    head·상태·자라던 글을 되돌리지 않고, 모르던 이벤트가 있으면 그것만 채운다.
 *  · more 면 **마지막 이벤트의 seq** 가 다음 sinceSeq 다(그 줄은 절대 접히지 않는다).
 */
export function applySince(state: ConvState, res: ConvOpenResult | null | undefined): { state: ConvState; more: boolean; reset: boolean } {
  if (!res) return { state, more: false, reset: false };
  if (res.reset && state.threadId) {
    return { state: applyOpen(state, { ...res, more: false }, state.threadId, { force: true }), more: false, reset: true };
  }
  const srvHead = seqOk(res.headSeq) ? res.headSeq : 0;
  const fresh = (res.events || []).filter((e) => e && seqOk(e.seq) && e.seq > state.headSeq).sort((a, b) => a.seq - b.seq);
  if (srvHead && srvHead < state.headSeq) {
    return { state: ingestEvents(state, fresh, { derive: false }), more: false, reset: false };
  }
  let next = ingestEvents(state, fresh);
  if (res.thread) next = { ...next, thread: { ...(next.thread || {}), ...res.thread } };
  const last = fresh.length ? fresh[fresh.length - 1].seq : state.headSeq;
  // more 인데 받은 게 없으면 앞으로 나아갈 수 없다(같은 요청을 끝없이 되풀이한다) → 끝난 것으로 친다.
  const more = !!res.more && last > state.headSeq;
  const head = more ? last : Math.max(last, srvHead);
  next = syncPending(next, res.pending, !more, head);
  next = {
    ...next,
    headSeq: head,
    // live 는 통째 교체 — 서버가 "지금 자라고 있는 블록"을 안다. 이어 받을 게 남았으면 아직 믿을 수 없다.
    live: more ? next.live : dropDone(normalizeLive(res.live), next.msgs),
    turn: workingOf(next.thread) ? next.turn : (more ? next.turn : null),
  };
  return { state: next, more, reset: false };
}

function dropDone(live: Record<string, LiveBlock>, msgs: Record<string, ConvMsg>): Record<string, LiveBlock> {
  const out: Record<string, LiveBlock> = {};
  for (const k of Object.keys(live)) if (!msgs[k]) out[k] = live[k];
  return out;
}

/** conv.before 결과 — 앞쪽에 붙인다. head 는 건드리지 않는다. */
export function applyBefore(state: ConvState, res: { events?: ConvEvent[]; floorSeq?: number } | null | undefined): ConvState {
  if (!res) return state;
  const evs = (res.events || []).filter((e) => e && seqOk(e.seq));
  // 옛 이벤트다 — 지금 상태(작업 중·대기 중)를 이것으로 다시 정하지 않는다.
  const next = ingestEvents(state, evs, { derive: false });
  // floorSeq: 데몬이 준 값이 정본이다(더 앞이 없으면 1, §4). 안 주면 더 앞이 없는 것으로 친다 — 추측하지 않는다.
  const floor = seqOk(res.floorSeq) ? res.floorSeq : 1;
  // 받은 게 없으면 더 앞은 없다 — floor 를 1 로 내려 "처음까지 받았다"로 굳힌다(안 그러면 당길 때마다 또 부른다).
  return { ...next, floorSeq: evs.length ? Math.min(floor, state.floorSeq || floor) : 1 };
}

/** 이전 내역이 더 있는가. */
export function hasOlder(state: ConvState): boolean { return state.floorSeq > 1; }

// ── 낙관 버블 상태 기계(§10.2) ──────────────────────────────────────────────
//  sending ──(접수)──▶ sent | queued ──(서버 msg 도착)──▶ 사라짐(서버 행이 대체)
//     └────(오류·타임아웃·오프라인)──▶ failed ──(다시 시도, 같은 clientId)──▶ sending

/** 이 clientId 의 메시지를 서버가 이미 (실패 아닌 상태로) 갖고 있는가. */
export function serverHas(state: ConvState, clientId: string): boolean {
  const m = state.msgs['u:' + clientId];
  if (m && m.status !== 'failed') return true;
  for (const k of state.order) {
    const x = state.msgs[k];
    if (x && x.clientId === clientId && x.status !== 'failed') return true;
  }
  return false;
}

export function addOutgoing(state: ConvState, o: { clientId: string; text: string; sendText?: string; at: number; offline?: boolean; attachments?: ConvAttachment[] }): ConvState {
  if (state.outbox.some((x) => x.clientId === o.clientId)) return state;
  const item: Outgoing = {
    clientId: o.clientId, text: o.text, sendText: o.sendText ?? o.text, at: o.at,
    ...(o.attachments && o.attachments.length ? { attachments: o.attachments.slice(0, ATTACH_MAX) } : {}),
    // 오프라인이면 보내지 않고 처음부터 실패로 둔다(§10.2 4) — 원문은 버블이 들고 있다.
    status: o.offline ? 'failed' : 'sending', ...(o.offline ? { code: 'DAEMON_OFFLINE' } : {}), tries: o.offline ? 0 : 1,
  };
  return { ...state, outbox: [...state.outbox, item] };
}

/**
 * 에이전트에 전달하지 않고 거절된 전송(200 응답의 `{ok:false, status:'failed', code}`, §4.1) —
 *  예: 터미널에서만 쓸 수 있는 명령. 오류가 아니라 **안내**다: 버블을 걷고(다시 보내도 같은 결과다) 사유를 적어 둔다.
 *  그 메시지는 서버가 'failed' 로 기록하므로 행으로는 남는다.
 */
export function sendRejected(state: ConvState, clientId: string, code: string): ConvState {
  const next = dropOutgoing(state, clientId);
  return { ...next, failCodes: { ...next.failCodes, [clientId]: code || 'UNKNOWN' } };
}

/** 다시 보내도 같은 결과인 사유 — [다시 시도] 를 그리지 않는다. */
export function isRetryable(code: string | null | undefined): boolean {
  return String(code || '') !== 'TERMINAL_ONLY_COMMAND';
}

/**
 * 서버가 실패로 적은 내 메시지를 다시 보낸다(프로세스가 도달 확인 전에 죽었다 등) — 같은 clientId 로.
 *  버블을 새로 세워 그 행을 대신 그린다. 서버가 같은 key 를 queued/sent 로 upsert 하면 버블이 걷힌다.
 */
export function reviveFailed(state: ConvState, key: string, now: number): { state: ConvState; clientId: string | null } {
  const m = state.msgs[key];
  const cid = m ? clientIdOf(m) : null;
  if (!m || !cid || m.status !== 'failed' || state.outbox.some((o) => o.clientId === cid)) return { state, clientId: null };
  // 첨부 줄은 떼어 attachments 로 다시 보낸다 — 본문째 보내면 데몬이 첨부 메타 없이 줄만 다시 적는다.
  const { body, files } = msgAttachments(m);
  const item: Outgoing = {
    clientId: cid, text: body, sendText: body, at: now, status: 'sending', tries: 1,
    ...(files.length ? { attachments: files } : {}),
  };
  const failCodes = { ...state.failCodes }; delete failCodes[cid];
  return { state: { ...state, outbox: [...state.outbox, item], failCodes }, clientId: cid };
}

/** 실패한 서버 행을 이 기기에서 감춘다([삭제]). */
export function hideKey(state: ConvState, key: string): ConvState {
  if (state.hiddenKeys[key]) return state;
  return { ...state, hiddenKeys: { ...state.hiddenKeys, [key]: true } };
}

/** 전송이 접수됐다. 서버 msg 가 이미 와 있으면 버블은 이미 걷혔다(아무 일도 없다). */
export function sendAccepted(state: ConvState, clientId: string, status: 'sent' | 'queued' | string | undefined): ConvState {
  if (serverHas(state, clientId)) return dropOutgoing(state, clientId);
  const st: OutStatus = status === 'queued' ? 'queued' : 'sent';
  return patchOutgoing(state, clientId, { status: st, code: undefined });
}

/**
 * 전송이 실패했다(오류·타임아웃). 단 서버가 그 메시지를 이미 갖고 있으면 **성공한 것**이다 —
 *  타임아웃 뒤에도 데몬은 성공했을 수 있다(§4.0). 그때 실패로 그리면 사용자가 다시 보내 두 번 실행된다.
 */
export function sendFailed(state: ConvState, clientId: string, code: string): ConvState {
  if (serverHas(state, clientId)) return dropOutgoing(state, clientId);
  return patchOutgoing(state, clientId, { status: 'failed', code: code || 'UNKNOWN' });
}

/** 다시 시도 — **같은 clientId**(멱등 키). 실패 상태일 때만 보낸다(연타가 전송 두 번이 되지 않게). */
export function retryOutgoing(state: ConvState, clientId: string): { state: ConvState; send: Outgoing | null } {
  const cur = state.outbox.find((o) => o.clientId === clientId);
  if (!cur || cur.status !== 'failed') return { state, send: null };
  const next = patchOutgoing(state, clientId, { status: 'sending', code: undefined, tries: cur.tries + 1 });
  return { state: next, send: next.outbox.find((o) => o.clientId === clientId) || null };
}

export function dropOutgoing(state: ConvState, clientId: string): ConvState {
  if (!state.outbox.some((o) => o.clientId === clientId)) return state;
  return { ...state, outbox: state.outbox.filter((o) => o.clientId !== clientId) };
}

function patchOutgoing(state: ConvState, clientId: string, patch: Partial<Outgoing>): ConvState {
  let hit = false;
  const outbox = state.outbox.map((o) => {
    if (o.clientId !== clientId) return o;
    hit = true;
    const n = { ...o, ...patch };
    if (patch.code === undefined) delete n.code;
    return n;
  });
  return hit ? { ...state, outbox } : state;
}

/** 화면에 그릴 낙관 버블 — 서버 행이 대신 그려지는 것은 뺀다. */
export function visibleOutbox(state: ConvState): Outgoing[] {
  return state.outbox.filter((o) => !serverHas(state, o.clientId));
}

// ── 요청(§2.4·§10.8) ───────────────────────────────────────────────────────

/** 대기 중 요청 — 오래된 것부터(도크는 첫 번째를 그리고 "n개 더"를 단다). */
export function pendingReqs(state: ConvState): ConvReq[] {
  const out: ConvReq[] = [];
  for (const id of Object.keys(state.reqs)) if (state.reqs[id].status === 'pending') out.push(state.reqs[id]);
  return out.sort((a, b) => ((a.requestedAt || 0) - (b.requestedAt || 0)) || ((state.reqSeq[a.id] || 0) - (state.reqSeq[b.id] || 0)));
}

/** 내가 방금 답한 요청을 낙관적으로 닫는다 — 서버의 req upsert 가 곧 같은 값으로 덮는다. */
export function closeReqLocal(state: ConvState, reqId: string, status: ConvReqStatus): ConvState {
  const r = state.reqs[reqId];
  if (!r || r.status !== 'pending') return state;
  return { ...state, reqs: { ...state.reqs, [reqId]: { ...r, status } } };
}

// ── 턴 상태 ────────────────────────────────────────────────────────────────

function workingOf(t: Thread | null | undefined): boolean {
  return !!t && (t.state === 'working' || t.state === 'waiting');
}

/** 에이전트가 지금 일하는 중인가 — 전송 버튼이 중단 버튼이 되는 근거(§10.3). */
export function isWorking(state: ConvState): boolean {
  if (state.gone) return false;
  if (state.turn) return true;
  return workingOf(state.thread);
}

/** 응답을 기다리는 중인가(승인·질문) — 이때는 "작업 중" 줄 대신 도크가 말한다. */
export function isWaiting(state: ConvState): boolean {
  return pendingReqs(state).length > 0 || state.thread?.state === 'waiting';
}

/**
 * 지금 무엇을 하는 중인가 — 결과가 아직 안 붙은 가장 최근 도구의 제목. 없으면 null("작업 중"만 보인다).
 *  자라는 글(text 델타)이 있으면 null — 글이 나오고 있는데 "읽기 x.ts" 가 남아 있으면 거짓말이다.
 */
export function workingLabel(state: ConvState): { kind: 'tool' | 'thinking'; text: string } | null {
  const lives = Object.keys(state.live).map((k) => state.live[k]);
  if (lives.some((l) => l.kind === 'text' && l.text)) return null;
  const done = new Set<string>();
  for (let i = state.order.length - 1; i >= 0 && i >= state.order.length - 60; i--) {
    const m = state.msgs[state.order[i]];
    if (!m) continue;
    if (m.kind === 'tool_result' && m.result?.toolUseId) { done.add(m.result.toolUseId); continue; }
    if (m.kind === 'tool_use' && m.tool) {
      if (m.tool.id && done.has(m.tool.id)) return lives.length ? { kind: 'thinking', text: '' } : null;
      return { kind: 'tool', text: toolLabel(m as unknown as ChatMsg) };
    }
    if (m.role === 'assistant' && m.kind === 'text') break;
    if (m.role === 'user' && (m.kind === 'text' || m.kind === 'slash')) break;
  }
  return lives.some((l) => l.kind === 'thinking') ? { kind: 'thinking', text: '' } : null;
}

/** 자라는 블록 — 목록 **밖**(footer)에서 그린다. 완성되면 목록으로 들어간다. */
export function liveBlocks(state: ConvState): LiveBlock[] {
  return Object.keys(state.live).map((k) => state.live[k]).filter((l) => !state.msgs[l.key]);
}

/**
 * 지금 받아 올 때인가. 부르는 쪽은 **화면에 떠 있는 동안에만**(탭 활성 + 앱 포그라운드) 이 판정을 돌린다.
 *  ① 폴백 폴링(§10.1) — 15초(작업 중 5초). push 가 3초 안에 왔으면 건너뛴다.
 *  ② 보고 있다는 신호(§4.4) — push 가 살아 있어도 **20초마다 1회**는 부른다. 데몬은 "최근 30초 안에
 *     open/since 를 부른 기기"를 보는 기기로 친다(§7). push 가 잘 와서 ①이 계속 건너뛰어지면 작업이 30초를
 *     넘기는 순간 보고 있는 화면에 "작업 완료" 알림이 울린다.
 */
export const POLL_IDLE_MS = 15000;
export const POLL_BUSY_MS = 5000;
export const PUSH_FRESH_MS = 3000;
export const VIEW_PING_MS = 20000;
export function pollDue(now: number, lastPushAt: number, lastPullAt: number, working: boolean): boolean {
  if (now - lastPullAt >= VIEW_PING_MS) return true;
  if (lastPushAt && now - lastPushAt < PUSH_FRESH_MS) return false;
  return now - lastPullAt >= (working ? POLL_BUSY_MS : POLL_IDLE_MS);
}

// ── 표시 행 ────────────────────────────────────────────────────────────────

export type ConvItem =
  | { t: 'msg'; key: string; row: ChatRowModel; queued: boolean; ts: number; text: string;
      /** 서버가 실패로 적은 내 메시지 — 사유 code(모르면 'UNKNOWN'). 없으면 실패가 아니다. */
      failed?: string; msgKey?: string }
  | { t: 'turn'; key: string; mark: ConvMark }
  | { t: 'notice'; key: string; mark: ConvMark }
  | { t: 'out'; key: string; item: Outgoing };

/** 행 재사용 캐시 — 같은 재료로 만든 행은 **같은 객체**를 돌려줘 memo 된 행이 다시 그려지지 않게 한다. */
export interface ItemCache {
  chat: WeakMap<ConvMsg, ChatMsg>;
  items: Map<string, ConvItem>;
}
export function newItemCache(): ItemCache { return { chat: new WeakMap(), items: new Map() }; }

/** ConvMsg → 기존 행 렌더러가 아는 ChatMsg. seq 는 **표시용 안정 seq**(그 key 가 처음 나타난 seq). */
export function toChatMsg(m: ConvMsg, displaySeq: number, cache?: ItemCache): ChatMsg {
  const hit = cache?.chat.get(m);
  if (hit && hit.seq === displaySeq) return hit;
  const t = tsOf(m.ts);
  const out = { ...(m as unknown as ChatMsg), seq: displaySeq, ts: t ? new Date(t).toISOString() : null } as ChatMsg;
  cache?.chat.set(m, out);
  return out;
}

function sameRow(a: ChatRowModel, b: ChatRowModel): boolean {
  if (a.msg !== b.msg || a.result !== b.result || a.resultSeq !== b.resultSeq) return false;
  const ga = a.group; const gb = b.group;
  if (!ga && !gb) return true;
  if (!ga || !gb || ga.length !== gb.length) return false;
  for (let i = 0; i < ga.length; i++) if (!sameRow(ga[i], gb[i])) return false;
  return true;
}

/**
 * 상태 → 목록 항목. 도구 묶기·결과 흡수·접힘은 v1 규칙(chatModel.buildRows)을 **그대로** 쓴다.
 *  · 행 key 는 ConvMsg.key 다 — upsert 로 seq 가 바뀌어도 행이 다시 마운트되지 않는다.
 *  · 답을 기다리는 질문은 목록에서 뺀다(도크가 같은 선택지를 그리고 있다 — 두 번 보이면 안 된다).
 *  · 자라는 블록(live)은 여기 없다. 글자마다 목록 데이터를 새로 만들지 않기 위해서다.
 */
export function buildItems(state: ConvState, cache?: ItemCache): ConvItem[] {
  const chat: ChatMsg[] = [];
  const keyOfSeq = new Map<number, string>();
  const src = new Map<number, ConvMsg>();
  const hideFailed = new Set(state.outbox.map((o) => o.clientId));
  for (const key of state.order) {
    const m = state.msgs[key];
    if (!m) continue;
    // 서버가 'failed' 로 적은 내 메시지 — 낙관 버블이 남아 있으면 그쪽이 대신 그린다. 사용자가 지운 것은 감춘다.
    if (m.status === 'failed') {
      if (state.hiddenKeys[key]) continue;
      const cid = clientIdOf(m);
      if (cid && hideFailed.has(cid)) continue;
    }
    const seq = state.first[key] ?? m.seq;
    chat.push(toChatMsg(m, seq, cache));
    keyOfSeq.set(seq, key);
    src.set(seq, m);
  }
  const waitingTool = new Set<string>();
  let waitingQuestion = false;
  for (const r of pendingReqs(state)) {
    if (r.kind === 'question') { waitingQuestion = true; if (r.toolUseId) waitingTool.add(r.toolUseId); }
  }
  const rekey = (r: ChatRowModel): ChatRowModel => {
    const k = keyOfSeq.get(r.msg.seq) || r.key;
    const group = r.group ? r.group.map(rekey) : undefined;
    return { ...r, key: r.group ? 'g:' + (group![0]?.key || k) : k, ...(group ? { group } : {}) };
  };
  const out: ConvItem[] = [];
  const marks = state.marks;
  let mi = 0;
  const pushMarksBefore = (seq: number) => {
    while (mi < marks.length && marks[mi].seq < seq) out.push(markItem(marks[mi++], cache));
  };
  for (const raw of buildRows(chat)) {
    const m = raw.msg;
    if (m.kind === 'question' && !raw.result && waitingQuestion) {
      const id = m.tool?.id;
      if (!waitingTool.size || (id && waitingTool.has(id))) continue;
    }
    const row = rekey(raw);
    // 묶음 행은 마지막 구성원의 자리까지를 차지한다 — 그 사이의 표식(턴 끝)은 묶음 뒤로 간다.
    pushMarksBefore(m.seq);
    const s = src.get(m.seq);
    const item: ConvItem = { t: 'msg', key: 'm:' + row.key, row, queued: !!s && s.status === 'queued', ts: s ? tsOf(s.ts) : 0, text: m.text || '' };
    if (s && s.status === 'failed' && !row.group) {
      const cid = clientIdOf(s);
      item.failed = (cid && state.failCodes[cid]) || 'UNKNOWN';
      item.msgKey = s.key;
    }
    out.push(reuse(item, cache));
  }
  while (mi < marks.length) out.push(markItem(marks[mi++], cache));
  for (const o of visibleOutbox(state)) {
    // key 는 서버 행과 **같은 값** — 서버 msg 가 버블을 대체할 때 목록의 그 칸이 그대로 남는다.
    out.push(reuse({ t: 'out', key: 'm:u:' + o.clientId, item: o }, cache));
  }
  if (cache) {
    const alive = new Set(out.map((i) => i.key));
    for (const k of [...cache.items.keys()]) if (!alive.has(k)) cache.items.delete(k);
  }
  return out;
}

function markItem(mark: ConvMark, cache?: ItemCache): ConvItem {
  return reuse(mark.kind === 'turn' ? { t: 'turn', key: 't:' + mark.seq, mark } : { t: 'notice', key: 'n:' + mark.seq, mark }, cache);
}

function reuse(item: ConvItem, cache?: ItemCache): ConvItem {
  if (!cache) return item;
  const prev = cache.items.get(item.key);
  if (prev && prev.t === item.t) {
    if (item.t === 'msg' && prev.t === 'msg' && prev.queued === item.queued && prev.ts === item.ts && prev.failed === item.failed && sameRow(prev.row, item.row)) return prev;
    if (item.t === 'out' && prev.t === 'out' && prev.item === item.item) return prev;
    if ((item.t === 'turn' || item.t === 'notice') && (prev.t === 'turn' || prev.t === 'notice') && prev.mark === item.mark) return prev;
  }
  cache.items.set(item.key, item);
  return item;
}

// ── 캐시용 직렬화(§10.9) ───────────────────────────────────────────────────

export const CACHE_MAX_EVENTS = 300;

/**
 * 상태 → 이벤트 목록(최근 limit 개). 접힌 뒤의 모습만 담는다(같은 key 의 옛 upsert 는 이미 의미가 없다).
 *  데몬의 접은 스냅샷과 **같은 모양**이다: upsert 된 줄에는 `first`(그 key 의 자리)가 실린다.
 */
export function exportEvents(state: ConvState, limit = CACHE_MAX_EVENTS): { events: ConvEvent[]; floorSeq: number; headSeq: number } {
  const evs: ConvEvent[] = [];
  for (const key of state.order) {
    const m = state.msgs[key];
    if (m) evs.push({ seq: m.seq, ts: tsOf(m.ts), op: 'msg', msg: m, ...(state.first[key] !== undefined && state.first[key] !== m.seq ? { first: state.first[key] } : {}) });
  }
  for (const id of Object.keys(state.reqs)) evs.push({ seq: state.reqSeq[id] || 1, ts: state.reqs[id].requestedAt || 0, op: 'req', req: state.reqs[id] });
  for (const k of state.marks) {
    if (k.kind === 'turn') evs.push({ seq: k.seq, ts: k.ts, op: 'turn', phase: 'end', turn: k.turn || 0, ok: k.ok, interrupted: k.interrupted, durationMs: k.durationMs, subtype: k.subtype });
    else evs.push({ seq: k.seq, ts: k.ts, op: 'notice', level: k.level || 'info', code: k.code, text: k.text });
  }
  evs.sort((a, b) => a.seq - b.seq);
  const cut = evs.length > limit ? evs.slice(evs.length - limit) : evs;
  const dropped = evs.length > limit;
  return {
    events: cut,
    floorSeq: dropped && cut.length ? Math.max(cut[0].seq, state.floorSeq) : state.floorSeq,
    headSeq: state.headSeq,
  };
}

/** 캐시 → 상태. live·turn 은 되살리지 않는다(그 순간의 것이고, 곧 since 가 채운다). */
export function importSnapshot(threadId: string, snap: { thread?: Thread | null; events?: ConvEvent[]; headSeq?: number; floorSeq?: number } | null | undefined): ConvState {
  const base = emptyState(threadId);
  if (!snap) return base;
  const next = ingestEvents({ ...base, thread: snap.thread || null }, snap.events || [], { derive: false });
  return {
    ...next,
    thread: snap.thread ? { ...(next.thread || {}), ...snap.thread } : next.thread,
    headSeq: seqOk(snap.headSeq) ? snap.headSeq : 0,
    floorSeq: seqOk(snap.floorSeq) ? snap.floorSeq : 0,
    live: {}, turn: null,
  };
}

// ── 표시 문구 ──────────────────────────────────────────────────────────────

/** 걸린 시간 — '8초' / '3분 20초' / '1시간 5분'. */
export function fmtDuration(ms: number | null | undefined): string {
  const total = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  if (total < 60) return i18n.t('{n}초', { n: total });
  const min = Math.floor(total / 60);
  if (min < 60) { const s = total % 60; return s ? i18n.t('{m}분 {s}초', { m: min, s }) : i18n.t('{n}분', { n: min }); }
  const h = Math.floor(min / 60); const m = min % 60;
  return m ? i18n.t('{h}시간 {m}분', { h, m }) : i18n.t('{n}시간', { n: h });
}

/** 상대 시각 — 목록의 "마지막 활동". now·at 은 epoch ms. */
export function fmtAgo(at: number | null | undefined, now: number): string {
  const t = Number(at) || 0;
  if (!t) return '';
  const d = Math.max(0, now - t);
  if (d < 60000) return i18n.t('방금');
  const min = Math.floor(d / 60000);
  if (min < 60) return i18n.t('{n}분 전', { n: min });
  const h = Math.floor(min / 60);
  if (h < 24) return i18n.t('{n}시간 전', { n: h });
  const day = Math.floor(h / 24);
  if (day < 7) return i18n.t('{n}일 전', { n: day });
  const dt = new Date(t);
  return `${dt.getFullYear()}.${dt.getMonth() + 1}.${dt.getDate()}`;
}

/** 턴 끝 요약 한 줄. */
export function turnSummary(mark: ConvMark): string {
  const d = mark.durationMs ? fmtDuration(mark.durationMs) : '';
  if (mark.interrupted) return d ? i18n.t('중단됨 · {d}', { d }) : i18n.t('중단됨');
  if (mark.ok === false) return d ? i18n.t('오류로 끝남 · {d}', { d }) : i18n.t('오류로 끝남');
  return d ? i18n.t('{d} 걸림', { d }) : '';
}

/** 오류 code → 사용자 문구. **code 로만 분기한다**(서버 문구를 파싱하지 않는다, §4). */
export function errorText(code: string | null | undefined): string {
  switch (String(code || '')) {
    case 'DAEMON_OFFLINE': return i18n.t('PC가 꺼져 있거나 연결이 끊겼어요.');
    case 'TIMEOUT': return i18n.t('PC의 응답이 늦어요. 잠시 후 다시 시도해 주세요.');
    case 'NETWORK': return i18n.t('네트워크에 연결할 수 없어요.');
    case 'CONV_DISABLED': return i18n.t('지금은 채팅을 쓸 수 없어요.');
    case 'SERVER_NEEDS_UPDATE': return i18n.t('서버가 아직 채팅을 지원하지 않아요.');
    case 'AGENT_UNAVAILABLE': return i18n.t('이 PC에 에이전트가 설치되어 있지 않아요.');
    case 'AGENT_NOT_LOGGED_IN': return i18n.t('PC에서 에이전트에 먼저 로그인해 주세요.');
    case 'THREAD_NOT_FOUND': return i18n.t('대화를 찾을 수 없어요.');
    case 'THREAD_BUSY': return i18n.t('작업이 끝난 뒤에 할 수 있어요.');
    case 'THREAD_BUSY_IN_TERMINAL': return i18n.t('이 대화는 터미널에서 사용 중이에요.');
    case 'REQ_NOT_PENDING': return i18n.t('이미 처리된 요청이에요.');
    case 'TOO_MANY_LIVE': return i18n.t('동시에 진행 중인 대화가 너무 많아요. 하나가 끝난 뒤 다시 시도해 주세요.');
    case 'START_FAILED': return i18n.t('에이전트를 시작하지 못했어요.');
    case 'BAD_REQUEST': return i18n.t('요청이 올바르지 않아요.');
    case 'TERMINAL_ONLY_COMMAND': return i18n.t('이 명령은 터미널에서만 쓸 수 있어요.');
    case 'ADOPT_FAILED': return i18n.t('터미널의 에이전트를 끝내지 못해 가져오지 못했어요.');
    case 'CONTROL_TIMEOUT': return i18n.t('에이전트가 응답하지 않아요. 잠시 후 다시 시도해 주세요.');
    case 'CONTROL_FAILED': return i18n.t('에이전트가 요청을 받아들이지 않았어요.');
    case 'UNKNOWN': return i18n.t('전달되지 않았어요.');
    default: return i18n.t('요청을 처리하지 못했어요.');
  }
}

// ── 권한 모드(§2.1 Thread.mode) ────────────────────────────────────────────
// v1(터미널 채팅)의 알약은 TUI 화면 문구를 그대로 쓴다('auto mode on') — 화면을 미러하는 것이라 그렇다.
//  v2 는 터미널이 없다. 사용자가 읽는 말로 적는다(PC 와 같은 문구).
export interface ConvModeItem { id: string; symbol: string; label: string; desc: string; hidden?: boolean }

export function convModes(): ConvModeItem[] {
  return [
    { id: 'default', symbol: '', label: i18n.t('매번 물어보기'), desc: i18n.t('매번 승인받고 진행') },
    { id: 'acceptEdits', symbol: '', label: i18n.t('파일 수정은 자동 허용'), desc: i18n.t('파일 편집은 자동 수락') },
    { id: 'plan', symbol: '', label: i18n.t('계획만 세우기'), desc: i18n.t('계획만, 변경 안 함') },
    { id: 'auto', symbol: '', label: i18n.t('자동'), desc: i18n.t('안전한 작업은 자동 진행') },
    // 아래 둘은 위험하거나 드문 모드다 — 지금 그 모드일 때만 목록에 낀다(모르고 고르지 않게).
    { id: 'bypassPermissions', symbol: '', label: i18n.t('모두 허용'), desc: i18n.t('모든 승인 건너뜀'), hidden: true },
    { id: 'dontAsk', symbol: '', label: i18n.t('묻지 않고 거절'), desc: i18n.t('미리 허용한 것만 실행'), hidden: true },
  ];
}
/** 모드 id → 표시 이름. 모르는 id 는 id 그대로(빈칸보다 낫다). */
export function convModeLabel(id: string | null | undefined): string {
  const s = String(id || 'default');
  return convModes().find((m) => m.id === s)?.label || s;
}
/** 목록에 그릴 선택지 — 데몬이 알려 준 모드(conv.caps.modes)가 있으면 그 안에서만. 숨김은 지금 그 모드일 때만. */
export function convModeChoices(current: string | null | undefined, allowed?: Array<string | { id?: string }> | null): ConvModeItem[] {
  const cur = String(current || 'default');
  const ids = Array.isArray(allowed) ? allowed.map((x) => (typeof x === 'string' ? x : x && x.id)).filter((x): x is string => !!x) : [];
  const ok = ids.length ? new Set(ids) : null;
  const out = convModes().filter((m) => (m.id === cur) || (!m.hidden && (!ok || ok.has(m.id))));
  // 모르는 모드(미래의 데몬)여도 지금 값은 목록에 있어야 한다 — 체크가 사라지면 무엇이 켜져 있는지 알 수 없다.
  if (!out.some((m) => m.id === cur)) out.push({ id: cur, symbol: '', label: cur, desc: '' });
  return out;
}

/**
 * 안내(notice) 한 줄. 아는 code 면 **우리 문구**다 — 데몬의 글은 한국어뿐이라, 다른 언어 화면에서 그 줄만
 *  한국어로 남는다. 모르는 code 는 데몬이 준 글을 그대로 보여 준다(없는 것보다 낫다). PC conv-model.js 와 같은 표.
 */
export function noticeText(code: string | null | undefined, text: string | null | undefined): string {
  switch (String(code || '')) {
    case 'TERMINAL_ONLY_COMMAND': return i18n.t('이 명령은 터미널에서만 쓸 수 있어요.');
    case 'PROCESS_EXIT': return i18n.t('에이전트가 예기치 않게 종료됐어요.');
    case 'START_FAILED': return i18n.t('에이전트를 시작하지 못했어요.');
    case 'TURN_FAILED': return i18n.t('작업을 끝내지 못했어요.');
    case 'AGENT_NOT_LOGGED_IN': return i18n.t('PC에서 에이전트에 먼저 로그인해 주세요.');
    case 'RATE_LIMITED': return i18n.t('사용 한도에 걸렸어요. 잠시 후 다시 시도해 주세요.');
    case 'IMPORT_TRUNCATED': return i18n.t('대화가 길어 최근 부분만 가져왔어요.');
    case 'MODEL_NEXT_START': return i18n.t('모델 변경은 다음 시작부터 적용돼요.');
    default: return String(text || '');
  }
}

/** 새 대화의 임시 제목 — 첫 사용자 메시지 앞 60자(데몬과 같은 규칙, §2.1). */
export function titleFrom(text: string): string {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, 60);
}

/** 멱등 키 — 보안 난수가 필요한 값이 아니다(같은 대화 안에서 겹치지만 않으면 된다). */
export function newClientId(now = Date.now()): string {
  const r = () => Math.floor(Math.random() * 0xffffffff).toString(36).padStart(7, '0');
  return `c${now.toString(36)}${r()}${r()}`;
}

/** ConvReq → 기존 승인 카드(QuestionDock)가 아는 모양. 응답은 카드에 주입한 콜백이 conv.respond 로 보낸다. */
export function reqToApproval(req: ConvReq, thread: Thread | null, cwd: string): {
  id: string; agent: string; tool: string; summary: string; detail?: string | null; alwaysLabel?: string | null;
  inputPreview?: Record<string, unknown> | null; diff?: ConvReq['diff']; relPath?: string | null; cwd: string; win: null;
  toolUseId?: string | null; requestedAt: number; deadlineAt: number;
  prompt: { kind: 'choice' | 'permission'; questions?: ChatQuestion[]; plan?: string };
} {
  const choice = req.kind === 'question' || req.kind === 'plan';
  return {
    id: req.id,
    agent: thread?.agent || 'claude',
    tool: req.tool || (req.kind === 'plan' ? 'ExitPlanMode' : req.kind === 'question' ? 'AskUserQuestion' : ''),
    summary: req.summary || '',
    detail: req.detail ?? null,
    alwaysLabel: req.alwaysLabel ?? null,
    inputPreview: req.inputPreview ?? null,
    diff: req.diff ?? null,
    relPath: req.relPath ?? null,
    cwd, win: null,
    toolUseId: req.toolUseId ?? null,
    requestedAt: req.requestedAt || 0,
    deadlineAt: 0,   // 요청에는 마감이 없다(§2.4)
    prompt: choice
      ? { kind: 'choice', ...(req.kind === 'question' ? { questions: req.questions || [] } : {}), ...(req.plan ? { plan: req.plan } : {}) }
      : { kind: 'permission' },
  };
}

/**
 * 승인 카드의 응답(질문 index·라벨) → conv.respond 의 answers(§4.4):
 *  `{"<질문 문구>": "<라벨>" | ["<라벨>",…] | "<자유 텍스트>"}`. 여러 개를 고른 질문만 배열이다.
 */
export function answersForWire(req: ConvReq, answers: Array<{ questionIndex: number; labels: string[]; text?: string | null }>): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  const qs = req.questions || [];
  for (const a of answers || []) {
    const q = qs[a.questionIndex];
    if (!q) continue;
    const key = q.question || q.header || String(a.questionIndex);
    const free = a.text ? String(a.text).trim() : '';
    const labels = (a.labels || []).filter((l) => typeof l === 'string' && l);
    if (free) out[key] = free;
    else if (labels.length > 1) out[key] = labels;
    else if (labels.length === 1) out[key] = labels[0];
  }
  return out;
}

// ── 첨부(§4.1·§4.5) ────────────────────────────────────────────────────────
//  데몬은 attachments 를 본문 **끝**에 `[첨부] <절대경로>` 줄로 붙인다(에이전트는 그 줄을 읽고 파일을 연다).
//  화면은 그 줄을 본문에서 떼어 칩으로 그린다. 떼는 것은 **끝에 붙은 연속 블록**뿐이다 — 사용자가 본문 중간에
//  같은 모양을 직접 썼으면 그건 사용자의 글이다. `[첨부]` 는 데몬이 쓰는 고정 표지다(번역하지 않는다).

export const ATTACH_MAX = 12;
const ATTACH_LINE = /^\[첨부\] (\S.*?)\s*$/;

export interface ConvAttachment { path: string; name: string; image: boolean; mediaType?: string }

/** 본문 → { body: 첨부 줄을 뗀 글, paths: 뗀 경로(순서대로) }. */
export function splitAttachLines(text: string | null | undefined): { body: string; paths: string[] } {
  const lines = String(text == null ? '' : text).split('\n');
  const paths: string[] = [];
  let end = lines.length;
  while (end > 0) {
    const ln = lines[end - 1];
    const m = ATTACH_LINE.exec(ln);
    if (m) { paths.unshift(m[1]); end -= 1; continue; }
    // 첨부 블록 사이·뒤의 빈 줄은 블록의 일부로 본다(데몬은 본문과 블록 사이에 빈 줄 하나를 둔다).
    if (!ln.trim() && paths.length) { end -= 1; continue; }
    if (!ln.trim() && end === lines.length) { end -= 1; continue; }
    break;
  }
  if (!paths.length) return { body: String(text == null ? '' : text), paths: [] };
  return { body: lines.slice(0, end).join('\n').replace(/\s+$/, ''), paths };
}

function toAttachment(path: string, name?: string | null, mediaType?: string | null): ConvAttachment {
  const ref = mediaRefOf(path);
  const mt = mediaType ? String(mediaType) : '';
  const image = mt ? mt.startsWith('image/') : !!ref && ref.kind === 'image';
  return { path, name: (name && String(name)) || (ref ? ref.name : path), image, ...(mt ? { mediaType: mt } : {}) };
}

/** 메시지의 첨부 — `msg.attachments`(데몬이 남긴 메타)와 본문의 `[첨부]` 줄을 합친다(경로로 중복 제거). */
export function msgAttachments(msg: { text?: string | null; attachments?: unknown } | null | undefined): { body: string; files: ConvAttachment[] } {
  const { body, paths } = splitAttachLines(msg?.text);
  const out: ConvAttachment[] = [];
  const seen = new Set<string>();
  const meta = Array.isArray(msg?.attachments) ? (msg!.attachments as any[]) : [];
  for (const a of meta) {
    const p = a && typeof a === 'object' && typeof a.path === 'string' ? a.path : '';
    if (!p || seen.has(p)) continue;
    seen.add(p);
    out.push(toAttachment(p, a.name, a.mediaType));
  }
  for (const p of paths) {
    if (seen.has(p)) continue;
    seen.add(p);
    out.push(toAttachment(p));
  }
  return { body, files: out.slice(0, ATTACH_MAX) };
}

/** 컴포저 첨부 → 보낼 첨부(와이어 `attachments:[{path,name,mediaType?}]`). */
export function attachmentsForWire(list: ConvAttachment[] | null | undefined): Array<{ path: string; name: string; mediaType?: string }> {
  return (list || []).slice(0, ATTACH_MAX).map((a) => ({ path: a.path, name: a.name, ...(a.mediaType ? { mediaType: a.mediaType } : {}) }));
}

// ── 잘린 본문(conv.detail) ─────────────────────────────────────────────────
/** 받아 온 전문으로 그 메시지를 바꾼다. 없는 key 면 그대로. */
export function applyDetail(state: ConvState, key: string, text: string): ConvState {
  const m = state.msgs[key];
  if (!m || typeof text !== 'string') return state;
  return { ...state, msgs: { ...state.msgs, [key]: { ...m, text, truncated: false } } };
}

// ── 대화 안 검색(§4.5 — 클라 전용, 불러온 범위 안에서) ────────────────────────
/** 한 행에서 찾을 글. 첨부 줄은 뺀다(경로가 매번 걸리면 쓸모없다). 도구 줄은 라벨로 찾는다. */
export function searchTextOf(item: ConvItem): string {
  if (item.t === 'out') return item.item.text || '';
  if (item.t !== 'msg') return '';
  const m = item.row.msg;
  if (item.row.group) return item.row.group.map((r) => (r.msg.kind === 'tool_use' ? toolLabel(r.msg) : '')).filter(Boolean).join('\n');
  if (m.kind === 'tool_use') return toolLabel(m);
  return splitAttachLines(item.text || m.text || '').body;
}

/** 대소문자 무시 등장 횟수(겹치지 않게 센다). */
export function countMatches(hay: string, q: string): number {
  const h = String(hay || '').toLowerCase();
  const n = String(q || '').trim().toLowerCase();
  if (!n || !h) return 0;
  let c = 0;
  let i = h.indexOf(n);
  while (i >= 0) { c += 1; i = h.indexOf(n, i + n.length); }
  return c;
}

export interface SearchHit { key: string; index: number; count: number }

/** 일치하는 행(목록 순서). index = items 안의 자리(스크롤 대상). */
export function findMatches(items: ConvItem[], q: string): SearchHit[] {
  const n = String(q || '').trim();
  if (!n) return [];
  const out: SearchHit[] = [];
  items.forEach((it, index) => {
    const c = countMatches(searchTextOf(it), n);
    if (c > 0) out.push({ key: it.key, index, count: c });
  });
  return out;
}

/** 강조 조각 — [{text, hit}]. 일치가 없거나 검색어가 비면 통째 한 조각. */
export function highlightSegments(text: string, q: string): Array<{ text: string; hit: boolean }> {
  const s = String(text || '');
  const n = String(q || '').trim();
  if (!n || !s) return [{ text: s, hit: false }];
  const low = s.toLowerCase();
  const nl = n.toLowerCase();
  const out: Array<{ text: string; hit: boolean }> = [];
  let at = 0;
  let i = low.indexOf(nl);
  while (i >= 0) {
    if (i > at) out.push({ text: s.slice(at, i), hit: false });
    out.push({ text: s.slice(i, i + n.length), hit: true });
    at = i + n.length;
    i = low.indexOf(nl, at);
  }
  if (at < s.length) out.push({ text: s.slice(at), hit: false });
  return out.length ? out : [{ text: s, hit: false }];
}

/** 이동 — 현재 위치(cur)에서 dir(+1 아래 / -1 위)로, 끝에서 반대 끝으로 돈다. 일치가 없으면 -1. */
export function stepMatch(total: number, cur: number, dir: 1 | -1): number {
  if (total <= 0) return -1;
  if (cur < 0 || cur >= total) return dir > 0 ? 0 : total - 1;
  return (cur + dir + total) % total;
}

// ── conv.caps 로 정하는 선택지(§4.5) ─────────────────────────────────────────
type ModelEntry = string | { id?: string; label?: string };
type CapsLike = {
  agents?: Array<{ id?: string; label?: string; available?: boolean; models?: ModelEntry[] | null; efforts?: string[] | null; defaultEffort?: string | null }> | null;
  models?: ModelEntry[] | null;
} | null | undefined;

/** 새 대화에서 고를 수 있는 에이전트 — available 만. 2개 이상일 때만 선택 줄을 보인다(1개면 고를 게 없다). */
export function pickableAgents(caps: CapsLike): Array<{ id: string; label: string }> {
  const list = caps && Array.isArray(caps.agents) ? caps.agents : [];
  const out: Array<{ id: string; label: string }> = [];
  for (const a of list) {
    if (!a || !a.available || typeof a.id !== 'string' || !a.id || out.some((x) => x.id === a.id)) continue;
    out.push({ id: a.id, label: (a.label && String(a.label)) || a.id });
  }
  return out;
}
export function showAgentPicker(caps: CapsLike): boolean { return pickableAgents(caps).length >= 2; }

/**
 * 모델 목록 — 데몬이 알려 준 것만. 없으면 빈 배열(= 입구를 감춘다). PC 와 같은 두 자리를 본다:
 *  `caps.agents[].models`(그 대화의 에이전트 것이 정본) → 없으면 `caps.models`. 항목은 문자열 또는 {id,label}.
 *  agent 를 모르면(새 대화에서 아직 안 골랐다) 쓸 수 있는 첫 에이전트의 목록.
 */
export function modelChoices(caps: CapsLike, agent?: string | null): Array<{ id: string; label: string }> {
  const agents = caps && Array.isArray(caps.agents) ? caps.agents : [];
  const own = agent
    ? agents.find((a) => a && a.id === agent)
    : agents.find((a) => a && a.available && Array.isArray(a.models) && a.models.length);
  const list: ModelEntry[] = own && Array.isArray(own.models) && own.models.length ? own.models
    : caps && Array.isArray(caps.models) ? caps.models : [];
  const out: Array<{ id: string; label: string }> = [];
  for (const m of list) {
    const id = typeof m === 'string' ? m : m && typeof m.id === 'string' ? m.id : '';
    if (!id || out.some((x) => x.id === id)) continue;
    const label = typeof m === 'string' ? m : (m.label && String(m.label)) || id;
    out.push({ id, label });
  }
  return out;
}

/** 그 에이전트의 CLI 가 알려 준 추론 강도 단계(낮음→높음). 모르면 빈 목록 — 입구를 감춘다(PC _effortList). */
export function effortChoices(caps: CapsLike, agent?: string | null): { list: string[]; def: string | null } {
  const agents = caps && Array.isArray(caps.agents) ? caps.agents : [];
  const own = agent ? agents.find((a) => a && a.id === agent) : agents.find((a) => a && a.available && Array.isArray(a.efforts) && a.efforts.length);
  const list = own && Array.isArray(own.efforts) ? own.efforts.filter((x) => typeof x === 'string' && x) : [];
  return { list, def: own && typeof own.defaultEffort === 'string' ? own.defaultEffort : null };
}

/** 추론 강도 표시 이름 — PC conv-model.effortLabel 과 같은 문구. */
export function effortLabel(e: string | null | undefined): string {
  switch (e) {
    case 'low': return i18n.t('낮음');
    case 'medium': return i18n.t('중간');
    case 'high': return i18n.t('높음');
    case 'xhigh': return i18n.t('매우 높음');
    case 'max': return i18n.t('최대');
    case 'ultra': return i18n.t('울트라');
    default: return e ? String(e) : '';
  }
}

// ── 사용량 줄(§4.5) — "모델 · 컨텍스트 n%" ─────────────────────────────────
/** 컴포저 아래 한 줄의 재료. 둘 다 모르면 null(줄을 그리지 않는다). */
export function usageLine(thread: Thread | null | undefined): { model: string | null; pct: number | null } | null {
  if (!thread) return null;
  const u = thread.usage || null;
  const model = (u && typeof u.model === 'string' && u.model) || (typeof thread.model === 'string' && thread.model) || null;
  let pct: number | null = null;
  if (u && typeof u.contextPct === 'number' && Number.isFinite(u.contextPct)) pct = u.contextPct;
  else if (u && typeof u.contextTokens === 'number' && typeof u.contextMax === 'number' && u.contextMax > 0) pct = (u.contextTokens / u.contextMax) * 100;
  if (pct != null) pct = Math.max(0, Math.min(100, Math.round(pct)));
  if (!model && pct == null) return null;
  return { model, pct };
}

/** 모델 id → 짧은 표시 이름. `claude-opus-4-1-20250805` 같은 날짜 꼬리는 뗀다. */
export function modelShort(id: string | null | undefined): string {
  const s = String(id || '').trim();
  if (!s) return '';
  return s.replace(/-\d{8}$/, '').replace(/\[1m\]$/i, ' 1M');
}
