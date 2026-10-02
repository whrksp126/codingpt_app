// useConv.ts — 채팅 v2 대화 하나의 생명주기(열기·받기·보내기). 규칙은 convModel(순수)에 있고 여기는 시간과 전송만 다룬다.
//
// 상태 기계(chat-v2-design.md §10.1):
//   열기        캐시 먼저 그림 → conv.open(캐시가 있으면 conv.since) → 구독
//   push events seq 가 이어지면 적용, 아니면 conv.since
//   push delta  off 가 맞으면 이어 붙임, 아니면 conv.since
//   재접속·포그라운드 복귀  즉시 conv.since (이 채널은 놓친 구간을 다시 보내 주지 않는다)
//   폴백 폴링   15초(작업 중 5초). push 가 3초 안에 왔으면 건너뛴다
//
// 함정:
//  · push 프레임마다 setState 하면 델타(초당 20개)가 그대로 렌더 20번이 된다 → 프레임을 모아 60ms 에 한 번 반영한다.
//  · 화면에 안 보이는 탭(active=false)은 **폴링하지 않는다**. push 는 계속 받되, 틈이 보이면 표시만 해 두고
//    다시 보일 때 한 번에 메운다(가려진 탭 열 개가 5초마다 PC 를 두드리지 않게).
//  · conv.since 가 겹쳐 돌면 같은 구간을 두 번 받아 head 가 뒤로 갈 수 있다 → 한 번에 하나만(single-flight).

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import convService, { ConvError, toConvError, type ConvCommand } from '../../services/convService';
import convCache from '../../services/convCache';
import { addChannelResetListener, getChannelState, subscribeChannelState } from '../../services/notificationService';
import { getDeviceLabel } from '../../services/daemonService';
import {
  addOutgoing, applyBefore, applyOpen, applyPush, applySince, buildItems, closeReqLocal, dropOutgoing, emptyState,
  exportEvents, hasOlder, importSnapshot, isWorking, liveBlocks, newClientId, newItemCache, pendingReqs, pollDue,
  retryOutgoing, sendAccepted, sendFailed, sendRejected, reviveFailed, hideKey, titleFrom, workingLabel, answersForWire,
  applyDetail, attachmentsForWire,
  type ConvAttachment, type ConvFrame, type ConvItem, type ConvReq, type ConvState, type LiveBlock, type Thread,
} from './convModel';

export type ConvPhase = 'blank' | 'loading' | 'ready' | 'error';
export type ConvConn = 'ok' | 'reconnecting' | 'offline';

/** 델타·이벤트를 화면에 반영하는 간격(ms) — 50~100 사이(§10.5). */
export const FLUSH_MS = 60;
const SAVE_DEBOUNCE_MS = 1500;

export interface UseConvOpts {
  host: number | null;
  cwd: string;
  /** 탭이 가리키는 대화. null = 아직 첫 메시지를 보내지 않은 새 대화. */
  threadId: string | null;
  /** 지금 화면에 보이는가. */
  active: boolean;
  /** 캐시 파일 이름에 쓰는 계정 id. */
  account: string | number | null;
  /** 이 워크스페이스의 PC 가 켜져 있는가(runner_status). false 면 보내지 않고 실패로 둔다. */
  hostOnline: boolean;
  /** 대화가 만들어졌거나 제목이 바뀌었다 — 탭에 threadId·제목을 쓴다. */
  onThread?: (t: { id: string; title: string }) => void;
}

export interface ConvApi {
  state: ConvState;
  threadId: string | null;
  thread: Thread | null;
  items: ConvItem[];
  live: LiveBlock[];
  phase: ConvPhase;
  /** phase==='error' 일 때의 사유 code. */
  error: string | null;
  conn: ConvConn;
  working: boolean;
  doing: { kind: 'tool' | 'thinking'; text: string } | null;
  /** 진행 중인 턴이 시작된 시각(epoch ms) — 경과 시간 표시. 모르면 0. */
  turnStartedAt: number;
  reqs: ConvReq[];
  olderAvailable: boolean;
  loadingOlder: boolean;
  /** 새 대화에서 고른 모드(아직 thread 가 없을 때) 또는 thread.mode. */
  mode: string | null;
  /** 새 대화에서 고른 에이전트(아직 thread 가 없을 때) 또는 thread.agent. 모르면 null. */
  agent: string | null;
  /** 새 대화에서 고른 모델 또는 thread.model. */
  model: string | null;
  send: (text: string, sendText?: string, attachments?: ConvAttachment[]) => void;
  retry: (clientId: string) => void;
  discard: (clientId: string) => void;
  interrupt: () => Promise<void>;
  respond: (reqId: string, decision: 'allow' | 'deny' | 'answer', opts?: RespondOpts) => Promise<void>;
  setMode: (mode: string) => Promise<void>;
  /** 모델 — conv.set {model}. 대화가 없으면 첫 메시지(conv.create)에 싣는다. */
  setModel: (model: string) => Promise<void>;
  /** 추론 강도('' = 기본값) — conv.set {effort}. 대화가 없으면 첫 메시지(conv.create)에 싣는다. */
  effort: string;
  setEffort: (level: string) => Promise<void>;
  /** 에이전트 — 새 대화에서만(conv.create {agent}). 이미 대화가 있으면 무시. */
  setAgent: (agent: string) => void;
  /** 잘린 본문의 전문을 받아 그 메시지를 바꾼다(conv.detail). */
  loadDetail: (key: string) => Promise<void>;
  setTitle: (title: string) => Promise<void>;
  loadOlder: () => Promise<void>;
  refresh: () => Promise<void>;
  loadCommands: () => Promise<ConvCommand[]>;
  toTerminal: () => Promise<{ cwd: string; agent: string; command: string; args: string[] }>;
  /** 서버가 실패로 적은 내 메시지를 다시 보낸다 / 이 기기에서 감춘다. */
  retryFailed: (msgKey: string) => void;
  hideFailed: (msgKey: string) => void;
}

export interface RespondOpts {
  message?: string;
  always?: boolean;
  answer?: { questionIndex: number; labels: string[]; text?: string | null };
  answers?: Array<{ questionIndex: number; labels: string[]; text?: string | null }>;
}

export default function useConv(opts: UseConvOpts): ConvApi {
  const { host, active, hostOnline } = opts;
  const optsRef = useRef(opts); optsRef.current = opts;

  const stateRef = useRef<ConvState>(emptyState(opts.threadId));
  const [state, setState] = useState<ConvState>(stateRef.current);
  const [phase, setPhase] = useState<ConvPhase>(opts.threadId ? 'loading' : 'blank');
  const [error, setError] = useState<string | null>(null);
  const [rpcOffline, setRpcOffline] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [newMode, setNewMode] = useState<string | null>(null);
  const [newModel, setNewModel] = useState<string | null>(null);
  const [newEffort, setNewEffort] = useState('');
  const [newAgent, setNewAgent] = useState<string | null>(null);
  const channel = useSyncExternalStore(subscribeChannelState, getChannelState);

  const aliveRef = useRef(true);
  /** 지금 이 훅이 들고 있는 대화 id(탭의 prop 보다 먼저 바뀔 수 있다 — 내가 방금 만든 대화). */
  const idRef = useRef<string | null>(opts.threadId);
  const lastPushAt = useRef(0);
  const lastPullAt = useRef(0);
  const staleRef = useRef(false);
  const queueRef = useRef<ConvFrame[]>([]);
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedHead = useRef(0);
  const pullRef = useRef<Promise<void> | null>(null);
  const pullAgain = useRef(false);
  const creatingRef = useRef<Promise<string | null> | null>(null);
  /** 캐시를 읽고 있는 대화 id(읽는 동안만). */
  const openingRef = useRef<string | null>(null);
  /** 열기 흐름을 이미 시작한 대화 id — 같은 대화를 두 번 열지 않는다. */
  const openedRef = useRef<string | null>(null);
  const cacheRef = useRef(newItemCache());

  const commit = useCallback((next: ConvState) => {
    if (next === stateRef.current) return;
    stateRef.current = next;
    if (aliveRef.current) setState(next);
  }, []);

  // ── 캐시 저장(디바운스) — 영속 이벤트가 늘었을 때만 ──
  const saveNow = useCallback(() => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    const st = stateRef.current;
    const id = st.threadId;
    if (!id || st.gone || st.headSeq <= 0 || st.headSeq === savedHead.current) return;
    savedHead.current = st.headSeq;
    const ex = exportEvents(st);
    void convCache.saveConv(optsRef.current.account, optsRef.current.host, id, { thread: st.thread, events: ex.events, headSeq: ex.headSeq, floorSeq: ex.floorSeq });
  }, []);
  const scheduleSave = useCallback(() => {
    if (saveTimer.current) return;
    saveTimer.current = setTimeout(() => { saveTimer.current = null; saveNow(); }, SAVE_DEBOUNCE_MS);
  }, [saveNow]);

  // ── 받기: conv.open / conv.since (한 번에 하나) ──
  const pull = useCallback((): Promise<void> => {
    if (pullRef.current) { pullAgain.current = true; return pullRef.current; }
    const run = async () => {
      const id = idRef.current;
      if (!id) return;
      const h = optsRef.current.host;
      const same = () => aliveRef.current && idRef.current === id;
      try {
        let more = true;
        // 512KB 예산으로 잘린 응답은 more:true 로 온다(§4.0) → 끝까지 이어 받는다. 상한은 폭주 방어.
        for (let guard = 0; more && guard < 40; guard++) {
          const cur = stateRef.current;
          const fresh = cur.headSeq <= 0 && !cur.order.length;
          const cwd = optsRef.current.cwd;
          if (fresh) {
            const r = await convService.open(h, id, { cwd });
            if (!same()) return;
            commit(applyOpen(stateRef.current, r, id));
            more = !!r.more;
          } else {
            const r = await convService.since(h, id, cur.headSeq);
            if (!same()) return;
            const a = applySince(stateRef.current, r);
            if (a.reset) {
              // 내가 알던 로그(캐시 포함)는 데몬 것이 아니다 → 버린다. 새 상태는 곧 다시 저장된다.
              cacheRef.current = newItemCache();
              savedHead.current = 0;
              void convCache.removeConv(optsRef.current.account, h, id);
            }
            commit(a.state);
            more = a.more;
          }
        }
        lastPullAt.current = Date.now();
        staleRef.current = false;
        setRpcOffline(false);
        setError(null);
        setPhase('ready');
        scheduleSave();
      } catch (e) {
        if (!same()) return;
        const err = toConvError(e);
        lastPullAt.current = Date.now();   // 실패도 한 번으로 센다 — 꺼진 PC 를 매초 두드리지 않게
        if (err.code === 'THREAD_NOT_FOUND') {
          commit({ ...stateRef.current, gone: 'deleted' });
          void convCache.removeConv(optsRef.current.account, h, id);
          setPhase('ready');
          return;
        }
        if (err.code === 'DAEMON_OFFLINE') setRpcOffline(true);
        // 보여줄 것이 이미 있으면(캐시·이전 수신분) 화면을 오류로 갈아엎지 않는다 — 상단 줄이 사정을 말한다.
        if (stateRef.current.order.length || stateRef.current.outbox.length) setPhase('ready');
        else { setError(err.code); setPhase('error'); }
      }
    };
    const p = run().finally(() => {
      pullRef.current = null;
      if (pullAgain.current) { pullAgain.current = false; if (aliveRef.current) void pull(); }
    });
    pullRef.current = p;
    return p;
  }, [commit, scheduleSave]);

  /** 틈·재연결·복귀 — 보이는 탭이면 바로 메우고, 가려진 탭이면 표시만 해 둔다. */
  const heal = useCallback(() => {
    if (!idRef.current) return;
    if (optsRef.current.active && AppState.currentState === 'active') void pull();
    else staleRef.current = true;
  }, [pull]);

  // ── 열기 — 탭이 가리키는 대화가 바뀔 때 ──
  useEffect(() => {
    const id = opts.threadId || null;
    if (id === null) {
      // 새 대화(아직 첫 메시지 전). 들고 있던 대화가 있었으면 비운다(같은 탭에서 "새 대화"를 눌렀다).
      if (idRef.current !== null || stateRef.current.threadId !== null) {
        idRef.current = null;
        openedRef.current = null;
        queueRef.current = [];
        cacheRef.current = newItemCache();
        commit(emptyState(null));
      }
      setPhase('blank'); setError(null);
      return;
    }
    // 내가 방금 만든 대화의 id 가 탭에 쓰여 prop 으로 되돌아온 것 — 이미 그 대화를 열어 두었다.
    if (openedRef.current === id) return;
    openedRef.current = id;
    idRef.current = id;
    queueRef.current = [];
    savedHead.current = 0;
    cacheRef.current = newItemCache();
    const keep = stateRef.current.threadId === id ? stateRef.current.outbox : [];
    commit({ ...emptyState(id), outbox: keep });
    lastPullAt.current = 0;
    setPhase('loading'); setError(null);
    // 취소 판정은 idRef 하나로 한다 — effect 가 같은 id 로 다시 돌아도(호스트 값 갱신 등) 열던 흐름이 끊기지 않게.
    openingRef.current = id;
    (async () => {
      const snap = await convCache.loadConv(optsRef.current.account, optsRef.current.host, id).catch(() => null);
      if (openingRef.current === id) openingRef.current = null;
      if (idRef.current !== id) return;
      // 캐시를 읽는 사이 서버에서 먼저 받았으면(캐시가 더 낡았다) 덮지 않는다.
      if (snap && stateRef.current.headSeq <= 0 && !stateRef.current.order.length) {
        const st = importSnapshot(id, snap);
        savedHead.current = st.headSeq;
        commit({ ...st, outbox: stateRef.current.outbox });
        setPhase('ready');
      }
      if (optsRef.current.active) void pull(); else staleRef.current = true;
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.threadId, host]);

  // ── push 구독 ──
  const flush = useCallback(() => {
    flushTimer.current = null;
    const frames = queueRef.current;
    if (!frames.length) return;
    queueRef.current = [];
    let st = stateRef.current;
    let need = false;
    for (const f of frames) {
      const r = applyPush(st, f, optsRef.current.host);
      st = r.state;
      if (r.need === 'since') need = true;
    }
    const grew = st.headSeq !== stateRef.current.headSeq;
    commit(st);
    if (grew) scheduleSave();
    if (st.gone === 'deleted' && st.threadId) void convCache.removeConv(optsRef.current.account, optsRef.current.host, st.threadId);
    if (st.gone === 'gone' && st.threadId) {
      // 'gone' = 데몬이 이 대화의 중계를 접었다 → 다시 연다(§4.4). 받아 둔 것은 버리고 open 부터.
      cacheRef.current = newItemCache();
      savedHead.current = 0;
      commit({ ...emptyState(st.threadId), outbox: st.outbox, failCodes: st.failCodes, hiddenKeys: st.hiddenKeys, thread: st.thread });
      heal();
      return;
    }
    if (need) heal();
  }, [commit, heal, scheduleSave]);

  useEffect(() => {
    const off = convService.addConvEventListener((f) => {
      const id = idRef.current;
      if (!id) return;
      const tid = f.threadId || f.control?.threadId;
      if (tid !== id) return;
      const h = optsRef.current.host;
      if (h != null && f.hostDeviceId != null && Number(f.hostDeviceId) !== Number(h)) return;
      lastPushAt.current = Date.now();
      queueRef.current.push(f);
      if (!flushTimer.current) flushTimer.current = setTimeout(flush, FLUSH_MS);
    });
    return off;
  }, [flush]);

  // ── 재연결·포그라운드 복귀 → 즉시 since ──
  useEffect(() => {
    const offReset = addChannelResetListener(() => { heal(); });
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') heal(); });
    return () => { offReset(); sub.remove(); };
  }, [heal]);

  // ── 다시 보이게 됐다 → 밀린 것 메우기 / 폴백 폴링 ──
  useEffect(() => {
    if (!active) return;
    // 캐시를 읽는 중이면 기다린다 — 먼저 받아 버리면 since 대신 open 이 나가 캐시를 둔 보람이 없다.
    if (idRef.current && !openingRef.current && (staleRef.current || !lastPullAt.current)) void pull();
    const iv = setInterval(() => {
      if (!idRef.current || AppState.currentState !== 'active') return;
      // 꺼진 PC 는 두드리지 않는다 — 켜지면 runner_status 가 hostOnline 을 되돌리고 아래 effect 가 메운다.
      if (optsRef.current.hostOnline === false) return;
      // 받는 중이면 건너뛴다 — 느린 회선에서 응답이 1초를 넘기면 매 틱이 "한 번 더"를 예약해 폴링이 두 배가 된다.
      if (pullRef.current) return;
      if (pollDue(Date.now(), lastPushAt.current, lastPullAt.current, isWorking(stateRef.current))) void pull();
    }, 1000);
    return () => clearInterval(iv);
  }, [active, pull]);

  // PC 가 다시 켜졌다 → 끊긴 사이를 메운다.
  const wasOnline = useRef(hostOnline);
  useEffect(() => {
    if (hostOnline && !wasOnline.current) { setRpcOffline(false); heal(); }
    wasOnline.current = hostOnline;
  }, [hostOnline, heal]);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      if (flushTimer.current) clearTimeout(flushTimer.current);
      saveNow();
    };
  }, [saveNow]);

  // ── 제목이 바뀌면 탭에 알린다(다른 기기가 바꿨거나 데몬이 첫 메시지로 지었다) ──
  const title = state.thread?.title || '';
  const tid = state.threadId;
  useEffect(() => {
    if (tid && title) optsRef.current.onThread?.({ id: tid, title });
  }, [tid, title]);

  // ── 보내기(§10.2) ──
  const deliver = useCallback(async (clientId: string) => {
    const out = stateRef.current.outbox.find((o) => o.clientId === clientId);
    if (!out) return;
    const h = optsRef.current.host;
    try {
      let id = idRef.current;
      if (!id && creatingRef.current) id = await creatingRef.current;   // 첫 메시지가 대화를 만드는 중 — 끝나길 기다린다
      if (!id) {
        const p = (async (): Promise<string | null> => {
          const r = await convService.create(h, {
            cwd: optsRef.current.cwd, text: out.sendText, clientId,
            ...(newModeRef.current ? { mode: newModeRef.current } : {}),
            ...(newAgentRef.current ? { agent: newAgentRef.current } : {}),
            ...(newModelRef.current ? { model: newModelRef.current } : {}),
            ...(newEffortRef.current ? { effort: newEffortRef.current } : {}),
            ...(out.attachments && out.attachments.length ? { attachments: attachmentsForWire(out.attachments) } : {}),
          });
          const th = r && r.thread;
          if (!th || !th.id) throw new ConvError('no thread', 'CONV_ERROR');
          idRef.current = th.id;
          openedRef.current = th.id;
          savedHead.current = 0;
          cacheRef.current = newItemCache();
          commit(sendAccepted({ ...stateRef.current, threadId: th.id, thread: th }, clientId, 'sent'));
          setPhase('ready');
          optsRef.current.onThread?.({ id: th.id, title: th.title || titleFrom(out.text) });
          return th.id;
        })();
        creatingRef.current = p.catch(() => null);
        try { await p; } finally { creatingRef.current = null; }
        void pull();
        return;
      }
      const r = await convService.send(h, {
        threadId: id, clientId, text: out.sendText,
        ...(out.attachments && out.attachments.length ? { attachments: attachmentsForWire(out.attachments) } : {}),
      });
      if (r && (r.ok === false || r.status === 'failed')) {
        // 에이전트에 전달하지 않고 거절됐다(터미널 전용 명령 등) — 실패 버블이 아니라 안내다(§4.1).
        commit(sendRejected(stateRef.current, clientId, r.code || 'UNKNOWN'));
        void pull();
        return;
      }
      // 'queued' 는 실패가 아니다 — 도달 확인이 push 로 뒤따른다(느린 기동·턴 진행 중).
      commit(sendAccepted(stateRef.current, clientId, r && r.status));
      void pull();   // push 를 기다리지 않고 바로 받아 온다(폴링 주기만큼 멍하지 않게)
    } catch (e) {
      const err = toConvError(e);
      if (err.code === 'DAEMON_OFFLINE') setRpcOffline(true);
      commit(sendFailed(stateRef.current, clientId, err.code));
      // 타임아웃 뒤에도 PC 는 받았을 수 있다 → 한 번 확인한다(받았으면 위 sendFailed 대신 서버 행이 뜬다).
      //  그 사이 사용자가 [다시 시도]를 눌렀으면(보내는 중) 건드리지 않는다.
      if (err.code === 'TIMEOUT' || err.code === 'NETWORK') {
        void pull().then(() => {
          const cur = stateRef.current.outbox.find((o) => o.clientId === clientId);
          if (cur && cur.status === 'failed') commit(sendFailed(stateRef.current, clientId, err.code));
        });
      }
    }
  }, [commit, pull]);

  const newModeRef = useRef<string | null>(null); newModeRef.current = newMode;
  const newModelRef = useRef<string | null>(null); newModelRef.current = newModel;
  const newEffortRef = useRef(''); newEffortRef.current = newEffort;
  const newAgentRef = useRef<string | null>(null); newAgentRef.current = newAgent;

  const send = useCallback((text: string, sendText?: string, attachments?: ConvAttachment[]) => {
    const t = String(text || '');
    const files = Array.isArray(attachments) ? attachments.filter((a) => a && a.path) : [];
    // 첨부만 보내는 것도 된다(데몬은 본문 또는 첨부 중 하나만 있으면 받는다, §4.1).
    if (!t.trim() && !files.length) return;
    const clientId = newClientId();
    const offline = optsRef.current.hostOnline === false;
    commit(addOutgoing(stateRef.current, { clientId, text: t, sendText: sendText ?? t, at: Date.now(), offline, attachments: files }));
    if (phase === 'blank') setPhase('ready');
    if (!offline) void deliver(clientId);
  }, [commit, deliver, phase]);

  const retry = useCallback((clientId: string) => {
    if (optsRef.current.hostOnline === false) return;   // 꺼진 PC 로는 보내지 않는다 — 버블은 실패로 남는다
    const r = retryOutgoing(stateRef.current, clientId);
    if (!r.send) return;
    commit(r.state);
    void deliver(clientId);
  }, [commit, deliver]);

  const discard = useCallback((clientId: string) => { commit(dropOutgoing(stateRef.current, clientId)); }, [commit]);

  // 서버가 실패로 적은 내 메시지(프로세스가 도달 확인 전에 죽었다 등) — 같은 clientId 로 다시 보낸다.
  const retryFailed = useCallback((key: string) => {
    if (optsRef.current.hostOnline === false) return;
    const r = reviveFailed(stateRef.current, key, Date.now());
    if (!r.clientId) return;
    commit(r.state);
    void deliver(r.clientId);
  }, [commit, deliver]);
  const hideFailed = useCallback((key: string) => { commit(hideKey(stateRef.current, key)); }, [commit]);

  const interrupt = useCallback(async () => {
    const id = idRef.current;
    if (!id) return;
    const r = await convService.interrupt(optsRef.current.host, id);
    void pull();
    // 멈추지 못했다(에이전트가 제어 요청에 답하지 않음 등) — 사유를 code 로 알린다.
    if (r && r.ok === false && r.code) throw new ConvError(r.code, r.code);
  }, [pull]);

  const respond = useCallback(async (reqId: string, decision: 'allow' | 'deny' | 'answer', o?: RespondOpts) => {
    const id = idRef.current;
    if (!id) return;
    const req = stateRef.current.reqs[reqId];
    const list = o?.answers && o.answers.length ? o.answers : (o?.answer ? [o.answer] : []);
    // 계획 승인의 의견은 질문이 없다 → answers 로 못 싣는다. message 로 보낸다(허용 뒤 사용자 메시지로 들어간다, §4.2).
    const planNote = req && req.kind === 'plan' && decision === 'answer' ? (list[0]?.text || '') : '';
    const wire = req && req.kind === 'question' ? answersForWire(req, list) : {};
    try {
      await convService.respond(optsRef.current.host, {
        threadId: id, reqId,
        decision: planNote ? 'allow' : decision,
        ...(o?.always ? { always: true } : {}),
        ...(o?.message || planNote ? { message: o?.message || planNote } : {}),
        ...(Object.keys(wire).length ? { answers: wire } : {}),
        by: getDeviceLabel(),
      });
      commit(closeReqLocal(stateRef.current, reqId, decision === 'deny' ? 'denied' : decision === 'answer' && !planNote ? 'answered' : 'allowed'));
      void pull();
    } catch (e) {
      const err = toConvError(e);
      if (err.code === 'REQ_NOT_PENDING') {
        // 다른 기기가 먼저 답했다 — 카드를 걷고 실제 결과를 받아 온다(오류가 아니다).
        commit(closeReqLocal(stateRef.current, reqId, 'answered'));
        void pull();
        return;
      }
      if (err.code === 'DAEMON_OFFLINE') setRpcOffline(true);
      throw err;
    }
  }, [commit, pull]);

  const setMode = useCallback(async (mode: string) => {
    const id = idRef.current;
    if (!id) { setNewMode(mode); return; }
    const prev = stateRef.current.thread;
    commit({ ...stateRef.current, thread: { ...(prev || { id }), mode } });
    try {
      const r = await convService.set(optsRef.current.host, id, { mode });
      if (r && r.thread) commit({ ...stateRef.current, thread: { ...(stateRef.current.thread || { id }), ...r.thread } });
    } catch (e) {
      // 낙관 적용 취소 — 모드가 안 바뀐 채 바뀐 것처럼 보이면 무엇이 자동 실행되는지 오해한다.
      commit({ ...stateRef.current, thread: prev ? { ...(stateRef.current.thread || { id }), mode: prev.mode } : stateRef.current.thread });
      throw toConvError(e);
    }
  }, [commit]);

  const setModel = useCallback(async (model: string) => {
    const id = idRef.current;
    const v = String(model || '').trim().slice(0, 120);
    if (!v) return;
    if (!id) { setNewModel(v); return; }
    const prev = stateRef.current.thread;
    commit({ ...stateRef.current, thread: { ...(prev || { id }), model: v } });
    try {
      const r = await convService.set(optsRef.current.host, id, { model: v });
      if (r && r.thread) commit({ ...stateRef.current, thread: { ...(stateRef.current.thread || { id }), ...r.thread } });
      void pull();   // "다음 시작부터 적용" 안내(notice)가 뒤따를 수 있다
    } catch (e) {
      commit({ ...stateRef.current, thread: prev ? { ...(stateRef.current.thread || { id }), model: prev.model ?? null } : stateRef.current.thread });
      throw toConvError(e);
    }
  }, [commit, pull]);

  const setEffort = useCallback(async (level: string) => {
    const id = idRef.current;
    const v = String(level || '').trim().slice(0, 40);
    if (!id) { setNewEffort(v); return; }
    const prev = stateRef.current.thread;
    if (((prev && prev.effort) || '') === v) return;
    commit({ ...stateRef.current, thread: { ...(prev || { id }), effort: v } });
    try {
      const r = await convService.set(optsRef.current.host, id, { effort: v });
      if (r && r.thread) commit({ ...stateRef.current, thread: { ...(stateRef.current.thread || { id }), ...r.thread } });
      void pull();
    } catch (e) {
      commit({ ...stateRef.current, thread: prev ? { ...(stateRef.current.thread || { id }), effort: prev.effort ?? '' } : stateRef.current.thread });
      throw toConvError(e);
    }
  }, [commit, pull]);

  const setAgent = useCallback((agent: string) => {
    if (idRef.current) return;   // 대화가 생긴 뒤에는 에이전트를 바꿀 수 없다
    setNewAgent(agent || null);
  }, []);

  const loadDetail = useCallback(async (key: string) => {
    const id = idRef.current;
    if (!id || !key) return;
    const r = await convService.detail(optsRef.current.host, id, key);
    if (idRef.current !== id) return;
    if (r && typeof r.text === 'string') commit(applyDetail(stateRef.current, key, r.text));
  }, [commit]);

  const setTitle = useCallback(async (next: string) => {
    const id = idRef.current;
    const v = String(next || '').trim().slice(0, 120);
    if (!id || !v) return;
    // 먼저 적용한다 — 탭 제목은 대화 제목을 따라가므로(ConvBody), 회신 전까지 옛 제목이 탭을 되돌리지 않게.
    const prev = stateRef.current.thread;
    commit({ ...stateRef.current, thread: { ...(prev || { id }), title: v, titleSet: true } });
    try {
      const r = await convService.set(optsRef.current.host, id, { title: v });
      commit({ ...stateRef.current, thread: { ...(stateRef.current.thread || { id }), ...(r && r.thread ? r.thread : {}), title: v, titleSet: true } });
    } catch (e) {
      if (prev && stateRef.current.thread && stateRef.current.thread.title === v) {
        commit({ ...stateRef.current, thread: { ...stateRef.current.thread, title: prev.title, titleSet: prev.titleSet } });
      }
      throw toConvError(e);
    }
  }, [commit]);

  const loadOlder = useCallback(async () => {
    const id = idRef.current;
    if (!id || loadingOlder || !hasOlder(stateRef.current)) return;
    setLoadingOlder(true);
    try {
      const r = await convService.before(optsRef.current.host, id, stateRef.current.floorSeq);
      if (idRef.current === id) commit(applyBefore(stateRef.current, r));
    } catch (_) { /* 다음에 다시 당기면 된다 */ } finally { if (aliveRef.current) setLoadingOlder(false); }
  }, [commit, loadingOlder]);

  const refresh = useCallback(async () => {
    if (!idRef.current) return;
    setError(null);
    if (!stateRef.current.order.length) setPhase('loading');
    await pull();
  }, [pull]);

  const cmdsRef = useRef<{ key: string; items: ConvCommand[] } | null>(null);
  const loadCommands = useCallback(async () => {
    const key = `${optsRef.current.host}|${optsRef.current.cwd}|${idRef.current || ''}`;
    if (cmdsRef.current && cmdsRef.current.key === key) return cmdsRef.current.items;
    const r = await convService.commands(optsRef.current.host, { ...(idRef.current ? { threadId: idRef.current } : {}), cwd: optsRef.current.cwd });
    const items = Array.isArray(r.items) ? r.items : [];
    cmdsRef.current = { key, items };
    return items;
  }, []);

  const toTerminal = useCallback(async () => {
    const id = idRef.current;
    if (!id) throw new ConvError('no thread', 'THREAD_NOT_FOUND');
    const r = await convService.toTerminal(optsRef.current.host, id);
    void pull();
    return {
      cwd: r.cwd, command: r.command || '',
      agent: r.agent || stateRef.current.thread?.agent || 'claude',
      args: Array.isArray(r.args) ? r.args.filter((x) => typeof x === 'string') : [],
    };
  }, [pull]);

  const items = useMemo(
    () => buildItems(state, cacheRef.current),
    // live(자라는 글)는 목록 재료가 아니다 — 델타마다 목록을 다시 만들지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.msgs, state.order, state.first, state.marks, state.outbox, state.reqs, state.failCodes, state.hiddenKeys],
  );
  const live = useMemo(() => liveBlocks(state), [state.live, state.msgs]);   // eslint-disable-line react-hooks/exhaustive-deps
  const reqs = useMemo(() => pendingReqs(state), [state.reqs, state.reqSeq]); // eslint-disable-line react-hooks/exhaustive-deps
  const working = isWorking(state);
  const doing = useMemo(() => (working ? workingLabel(state) : null), [working, state.msgs, state.order, state.live]); // eslint-disable-line react-hooks/exhaustive-deps

  // 경과 시간의 기준 — PC 와 폰의 시계는 어긋나 있을 수 있다. 턴이 시작되는 것을 **지켜봤으면** 폰 시계로 잰다
  //  (어긋남과 무관). 한참 진행 중인 턴에 뒤늦게 들어왔으면(2분 넘게 차이) 데몬이 적은 시각을 쓴다.
  const turnSeen = useRef<{ seq: number; at: number } | null>(null);
  if (!state.turn) turnSeen.current = null;
  else if (!turnSeen.current || turnSeen.current.seq !== state.turn.seq) {
    const now = Date.now();
    const ts = state.turn.startedAt;
    turnSeen.current = { seq: state.turn.seq, at: ts && Math.abs(now - ts) > 120000 ? ts : now };
  }

  const conn: ConvConn = hostOnline === false || rpcOffline ? 'offline' : channel === 'reconnecting' ? 'reconnecting' : 'ok';

  return {
    state, threadId: state.threadId, thread: state.thread, items, live, phase, error, conn, working, doing,
    turnStartedAt: turnSeen.current?.at || 0,
    reqs, olderAvailable: hasOlder(state), loadingOlder,
    mode: state.thread?.mode || newMode,
    agent: state.thread?.agent || newAgent,
    model: (state.thread ? state.thread.model || (state.thread.usage && state.thread.usage.model) || null : newModel) || null,
    effort: (state.thread ? state.thread.effort || '' : newEffort) || '',
    send, retry, discard, interrupt, respond, setMode, setModel, setEffort, setAgent, loadDetail, setTitle, loadOlder, refresh, loadCommands, toTerminal, retryFailed, hideFailed,
  };
}
