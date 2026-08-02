import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import chatService from '../../services/chatService';
import {
  lastSeqOf, mergeMessages, pruneOptimistic,
  type AgentMode, type ChatEventFrame, type ChatMsg, type PendingUser,
  type TuiDialog,
} from '../chatModel';
import { ChatReopenPolicy, type ChatNoSession } from './chatReopen';

// 트랜스크립트 구독 훅 — chat.open(스냅샷) → push(chat_event) + pull(chat.since) 병행.
//
// 규율(설계서 §2.2 / 데몬 transcript.js 주석과 동일):
//  · **push 는 힌트, pull 이 정본.** 프레임 유실·앱 백그라운드·소켓 재접속에서 누락이 나므로
//    주기 폴링(POLL_MS)과 포그라운드 복귀 즉시 캐치업이 최종 보증이다.
//  · 중복은 seq 로 접는다(mergeMessages) — push 와 pull 이 같은 구간을 배달할 수 있다.
//  · epochChanged(파일 로테이션/compact/resume/데몬 재시작) → 로컬 버퍼를 **비우고** 스냅샷부터 다시.
//  · CHAT_GONE(구독 소멸: idle 회수/tail evict/파일 삭제) → chat.open 재수행.
//    ⚠ back 이 rpc 에러 code 를 REST body 로 전파하지 않으므로(mapRpcError → 500, detail 없음)
//     문구 힌트 + "2회 연속 실패면 재오픈" 이중 방어로 처리한다. 재오픈은 멱등이라 과잉 호출도 안전.

const POLL_MS = 4000;          // 폴링 주기(변화 없으면 빈 응답 — 데몬은 오프셋만 확인한다)
const PUSH_SETTLE_MS = 700;    // push 직후 확인 폴링(프레임 절단/유실 보정)
const OPEN_LIMIT = 300;        // 스냅샷 라인 수(데몬 상한 안)
const REOPEN_BACKOFF_MS = 2500;
// 모드 전환 직후 push 무시 창 — 데몬 statusline 폴링은 3s 주기라, 전환 **직전에 뜬 화면**을 들고
//  있던 프레임이 뒤늦게 도착하면 알약이 옛 모드로 한 번 튄다(PC `_modeBusy` 와 같은 목적).
const MODE_ECHO_GUARD_MS = 4000;
// ★ noSession(보여줄 대화 없음) 상태의 **재오픈 정책은 `chatReopen.ts` 가 정본**이다.
//  noSession 은 성공 응답인데 chatId 가 null 이라, "chatId 없으면 다시 열기" 규칙이 매 폴링 틱(4s)마다
//  참이 되어 화면은 정상인데 데몬/릴레이만 계속 두들기는 조용한 폭주가 된다(실패 카운터 스로틀은 성공
//  응답이라 안 걸린다). 이 훅은 결정을 하지 않고 정책에 **위임만** 한다 — 그래야 그 결정을 실행으로
//  검증할 수 있다(이 앱 jest 는 RN 컴포넌트 렌더가 불가 → 훅을 렌더해서는 못 센다).
//  __tests__/chatNoSession.test.ts 가 가짜 타이머로 호출 횟수를 센다.

export type ChatStreamState = 'idle' | 'loading' | 'live' | 'error' | 'unsupported' | 'empty';
export type { ChatNoSession };

export interface ChatStream {
  state: ChatStreamState;
  /** 'empty' 일 때의 사유(그 밖에는 null). 'ambiguous' 만 사용자 선택 UI 를 띄운다. */
  noSession: ChatNoSession | null;
  /** 에이전트 이름('claude'|'codex'…) — 데몬이 알려준 값. 모르면 null. */
  agent: string | null;
  /** ambiguous 후보 개수(데몬이 준 값 그대로 — 0 이면 모름). */
  candidates: number;
  error: string | null;
  messages: ChatMsg[];
  /** 스냅샷 앞부분이 잘렸는가(과거 대화가 더 있다). */
  headTruncated: boolean;
  sessionId: string | null;
  chatId: string | null;
  /** TUI statusline 미러(ANSI 원문 줄들) — 없으면 null(스트립 숨김). */
  statusLines: string[] | null;
  /** 에이전트 권한 모드(컴포저 알약) — 없으면 null(알약 숨김). */
  statusMode: AgentMode | null;
  statusDialog: TuiDialog | null;
  /** 카드에서 고른 직후 낙관 반영(다음 폴링이 옛 화면을 들고 와도 카드가 되살아나지 않게). */
  setStatusDialog: (d: TuiDialog | null) => void;
  /** 모드 전환 성공 직후 낙관 반영 — 3초 폴링이 직전 값으로 되돌려 그리지 않게 화면 정본을 갱신한다. */
  setStatusMode: (m: AgentMode | null) => void;
  /** 낙관적 user 버블(전송 즉시 표시 → 트랜스크립트 도착 시 자동 제거). */
  pending: PendingUser[];
  addPending: (text: string, any?: boolean) => string;
  failPending: (id: string) => void;
  dropPending: (id: string) => void;
  reload: () => void;
  /** 즉시 캐치업(전송 직후 등) — 폴링을 기다리지 않게. */
  poke: () => void;
}

interface Params {
  cwd: string;
  tid: number | null;
  host: number | null;
  /** 이 터미널에서 도는 CLI('claude'|'codex'…). 데몬이 어느 대화 로그를 읽을지 정하는 근거. */
  agent?: string | null;
  /** false 면 구독을 만들지 않는다(chat 모드가 아닐 때 = 트래픽 0). */
  active: boolean;
  /**
   * 사용자가 'ambiguous' 에서 직접 고른 세션(탭에 기억된 값). 지정되면 데몬 폴백 대신 이 대화를 연다.
   *  변경 = 리타깃이므로 구독 effect 가 다시 돌아 즉시 재오픈된다.
   */
  sessionId?: string | null;
}

export default function useChatStream({ cwd, tid, host, active, agent: agentHint, sessionId: pickedSession }: Params): ChatStream {
  const [state, setState] = useState<ChatStreamState>('idle');
  const [noSession, setNoSession] = useState<ChatNoSession | null>(null);
  // TUI statusline 미러(ANSI 원문 줄들) — chat.open 초기값 + control(status_line) push 갱신.
  const [statusLines, setStatusLines] = useState<string[] | null>(null);
  // 에이전트 권한 모드 — 같은 경로로 오지만 statusline 과 **독립 필드**다(커스텀 statusline 이 있으면
  //  모드가 실린 푸터는 미러 대상에서 빠지기 때문). 전환 요청 중에는 push 를 무시한다(ChatBody).
  const [statusMode, setStatusModeState] = useState<AgentMode | null>(null);
  // TUI 선택 화면(/model 류) 미러 — 카드로 그린다. **없어지면 null 이 와야** 유령 카드가 안 남는다.
  const [statusDialog, setStatusDialog] = useState<TuiDialog | null>(null);
  // 방금 사용자가 바꾼 값을 **되돌려 그리지 않게** 하는 창. 데몬 폴링(3s)이 전환 직전에 뜬 화면을
  //  들고 있다가 도착하면 알약이 옛 모드로 한 번 튄다(같은 이유로 PC 도 같은 창을 둔다).
  const modeSetAtRef = useRef(0);
  const setStatusMode = useCallback((m: AgentMode | null) => {
    modeSetAtRef.current = Date.now();
    setStatusModeState(m);
  }, []);
  const [candidates, setCandidates] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [headTruncated, setHeadTruncated] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [chatId, setChatId] = useState<string | null>(null);
  // 에이전트 이름(데몬 어댑터 이름) — 컴포저 플레이스홀더/빈 상태 로고에 쓴다. 모르면 null.
  const [agent, setAgent] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingUser[]>([]);
  const [reloadTick, setReloadTick] = useState(0);

  // 구독 식별/워터마크는 렌더와 무관하게 최신값이 필요하다(타이머·소켓 콜백이 읽는다).
  const chatIdRef = useRef<string | null>(null);
  const epochRef = useRef<string>('');
  const seqRef = useRef<number>(0);
  const aliveRef = useRef(false);
  const busyRef = useRef(false);
  const failStreakRef = useRef(0);
  const pokeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 재오픈 정책(순수) — noSession 상태·스로틀·감시창을 전부 이 객체가 들고 있다. 렌더용 state 와
  //  별도인 이유는 타이머/소켓 콜백이 최신값을 봐야 하기 때문(state 는 클로저에 굳는다).
  //  open 은 최신 클로저를 봐야 하므로 ref 경유로 넘긴다(정책은 재생성하지 않는다).
  const openRef = useRef<() => void>(() => { /* set below */ });
  const policyRef = useRef<ChatReopenPolicy | null>(null);
  if (!policyRef.current) policyRef.current = new ChatReopenPolicy({ open: () => openRef.current() });
  const policy = policyRef.current;

  const applyMessages = useCallback((incoming: ChatMsg[], replace: boolean) => {
    setMessages((prev) => (replace ? mergeMessages([], incoming) : mergeMessages(prev, incoming)));
    // 낙관적 버블 회수 — 같은 배치에서 처리해야 "내 말풍선 2개"가 한 프레임도 안 보인다.
    //  (updater 안에서 다른 setState 를 부르면 StrictMode 이중 호출로 중복 실행되므로 밖에서 호출.)
    setPending((p) => pruneOptimistic(p, incoming, Date.now()));
  }, []);

  // ── 구독 시작(멱등) ──
  const open = useCallback(async () => {
    if (!aliveRef.current || busyRef.current) return;
    busyRef.current = true;
    policy.markOpened();
    try {
      // 빈 상태('empty')에서 배경 재시도할 때는 스피너로 돌아가지 않는다 — 화면이 깜빡이고,
      //  사용자는 아무것도 하지 않았는데 "뭔가 로딩 중" 으로 보인다.
      setState((s) => (s === 'live' || s === 'empty' ? s : 'loading'));
      const snap = await chatService.chatOpen({
        cwd, tid: tid ?? undefined, agent: agentHint || undefined,
        sessionId: pickedSession || undefined, limit: OPEN_LIMIT, host,
      });
      if (!aliveRef.current) return;
      if (snap.supported === false) {
        setState('unsupported');
        setError(snap.reason === 'not_installed' ? 'PC 에 claude 가 없어요.' : '이 PC 에서 대화를 읽을 수 없어요.');
        return;
      }
      // ★ noSession = 성공 응답인 "보여줄 대화 없음". 오류로 다루지 않고(배너 금지) 빈 상태로 확정한다.
      //  chatId 가 null 이므로 tail 구독도 없다 — 아래 게이트가 자동 재오픈을 막는다.
      //  ⚠ noSession 이 없더라도 chatId 가 비어 오면 같은 취급을 한다(구 데몬/중간 배포 방어).
      if (snap.noSession === true || !snap.chatId) {
        const reason: ChatNoSession =
          snap.reason === 'ambiguous' || snap.reason === 'none' || snap.reason === 'not_started'
            || snap.reason === 'claimed'
            ? snap.reason
            : 'not_started';
        chatIdRef.current = null;
        epochRef.current = '';
        seqRef.current = 0;
        failStreakRef.current = 0;
        policy.setNoSession(reason);
        setNoSession(reason);
        setCandidates(Number(snap.candidates) > 0 ? Number(snap.candidates) : 0);
        setChatId(null);
        setSessionId(snap.sessionId ?? null);
        if (snap.agent) setAgent(snap.agent);
        setHeadTruncated(false);
        setStatusLines(null); // 대화 없음 — statusline 잔상 제거
        applyMessages([], true);
        setError(null);
        setState('empty');
        return;
      }
      policy.setNoSession(null);
      setNoSession(null);
      setCandidates(0);
      chatIdRef.current = snap.chatId;
      epochRef.current = snap.epoch || '';
      seqRef.current = lastSeqOf(snap.messages, snap.headSeq);
      failStreakRef.current = 0;
      setChatId(snap.chatId);
      setSessionId(snap.sessionId ?? null);
      if (snap.agent) setAgent(snap.agent);
      setHeadTruncated(!!snap.headTruncated);
      setStatusLines(Array.isArray(snap.statusLines) && snap.statusLines.length ? snap.statusLines : null);
      setStatusModeState(snap.statusMode && snap.statusMode.id ? snap.statusMode : null);
      setStatusDialog(snap.statusDialog || null);
      applyMessages(snap.messages, true);
      setError(null);
      setState('live');
    } catch (e) {
      if (!aliveRef.current) return;
      chatIdRef.current = null;
      setState('error');
      setError(String((e as Error)?.message || e));
    } finally { busyRef.current = false; }
  }, [cwd, tid, host, agentHint, pickedSession, policy, applyMessages]);
  // 정책이 부르는 open — 항상 최신 클로저를 보게 ref 로 흘린다(정책은 마운트 동안 하나만 존재한다).
  openRef.current = () => { void open(); };

  // ── 캐치업(pull) ──
  const catchUp = useCallback(async () => {
    if (!aliveRef.current || busyRef.current) return;
    // ★ noSession 은 확정 상태 — 여기서 재오픈하지 않는다(매 틱 chat.open = 조용한 폭주).
    if (policy.noSession) return;
    if (!chatIdRef.current) { void open(); return; }
    busyRef.current = true;
    try {
      // more:true(프레임 예산 절단)는 재귀 대신 루프로 이어 받는다 — 재귀는 busy 가드를 서로 밟는다.
      for (let round = 0; round < 8; round++) {
        const id = chatIdRef.current;
        if (!id || !aliveRef.current) break;
        let r: Awaited<ReturnType<typeof chatService.chatSince>>;
        try {
          r = await chatService.chatSince({ chatId: id, sinceSeq: seqRef.current, epoch: epochRef.current, host });
        } catch (e) {
          if (!aliveRef.current) break;
          const msg = String((e as Error)?.message || e);
          failStreakRef.current += 1;
          // 구독 소멸(문구 힌트) 또는 2연속 실패 → 재오픈. back 이 rpc code 를 REST 로 전파하지 않아
          //  코드 분기가 불가능하므로 이중 방어를 쓴다(재오픈은 멱등).
          if (/CHAT_GONE|채팅 구독|트랜스크립트가 사라/.test(msg) || failStreakRef.current >= 2) {
            chatIdRef.current = null;
            setTimeout(() => { if (aliveRef.current) void open(); }, REOPEN_BACKOFF_MS);
          }
          break;
        }
        if (!aliveRef.current) break;
        failStreakRef.current = 0;
        // 모드는 **캐치업이 정본**이다 — push 를 놓친 채(백그라운드/소켓 끊김) 화면이 더 안 변하면
        //  알약이 옛 모드로 굳는다(사용자 신고). 4초 폴링마다 데몬이 준 현재값으로 화해한다.
        const sm = (r as { statusMode?: AgentMode }).statusMode;
        if (sm && sm.id && Date.now() - modeSetAtRef.current > MODE_ECHO_GUARD_MS) setStatusModeState(sm);
        // 다이얼로그도 캐치업이 정본이다(push 를 놓쳐도 카드가 붙박이로 남지 않는다).
        if ('statusDialog' in (r as object)) setStatusDialog((r as { statusDialog?: TuiDialog | null }).statusDialog || null);
        if ((r as { epochChanged?: boolean }).epochChanged) {
          // 대화가 갈렸다(compact/resume/로테이션) — 로컬 버퍼를 버리고 스냅샷으로 다시 그린다.
          epochRef.current = r.epoch || '';
          seqRef.current = lastSeqOf(r.messages, r.headSeq);
          setHeadTruncated(!!(r as { headTruncated?: boolean }).headTruncated);
          applyMessages(r.messages, true);
          setState('live');
          setError(null);
          break;
        }
        if (r.epoch) epochRef.current = r.epoch;
        seqRef.current = lastSeqOf(r.messages, Math.max(seqRef.current, r.headSeq || 0));
        if (r.messages.length) applyMessages(r.messages, false);
        setState('live');
        setError(null);
        if (!(r as { more?: boolean }).more) break;
      }
    } finally { busyRef.current = false; }
    // policy 는 마운트 동안 불변 객체이고 `policy.noSession` 은 **호출 시점**에 읽어야 하는 라이브 값이다
    //  (의존성에 넣으면 값이 바뀔 때마다 콜백이 새로 생겨 in-flight 폴링/타이머가 폐기된다 — 과거
    //   "스피너 무한 고착" 사고 계열). 그래서 객체만 의존성에 둔다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host, open, applyMessages, policy]);

  // poke = "지금 바로 따라잡아라"(전송 직후·push 직후). noSession 이면 캐치업할 대상이 아직 없으므로
  //  대신 **바인딩 감시창**을 연다 — 첫 메시지를 보내면 훅이 바인딩을 만들고 트랜스크립트가 생긴다.
  const poke = useCallback(() => {
    if (policy.noSession) { policy.onSend(); return; }
    if (pokeTimerRef.current) clearTimeout(pokeTimerRef.current);
    pokeTimerRef.current = setTimeout(() => { void catchUp(); }, PUSH_SETTLE_MS);
  }, [catchUp, policy]);

  // ── 라이프사이클: active 인 동안만 구독/폴링 ──
  useEffect(() => {
    if (!active || !cwd || tid == null) {
      aliveRef.current = false;
      return;
    }
    aliveRef.current = true;
    // 리타깃(cwd/tid/선택 세션 변경)마다 이 effect 가 다시 돌므로 여기서 상태를 초기화한다 —
    //  안 지우면 이전 터미널의 noSession 이 남아 새 터미널의 첫 재오픈이 게이트에 걸린다.
    policy.setNoSession(null);
    void open();
    // 폴링 틱 — 정책이 "지금 캐치업해도 되는가"를 답한다(noSession 이면 스스로 느린 재확인만 한다).
    const iv = setInterval(() => { if (policy.onTick()) void catchUp(); }, POLL_MS);
    const sub = AppState.addEventListener('change', (st) => {
      // 백그라운드 동안 폴링 타이머가 지연/정지되므로 복귀 즉시 한 번 따라잡는다(누락 0 게이트).
      //  ⚠ noSession 이면 복귀마다 chat.open 을 쏘지 않는다 — 앱 전환이 잦으면 그게 곧 폭주다.
      //   대신 느린 간격 스로틀을 통과할 때만 확인한다(포그라운드 복귀 = 그 시점을 앞당길 뿐).
      if (st !== 'active') return;
      if (policy.onForeground()) void catchUp();
    });
    return () => {
      aliveRef.current = false;
      clearInterval(iv);
      sub.remove();
      if (pokeTimerRef.current) clearTimeout(pokeTimerRef.current);
      policy.cancel();
      chatIdRef.current = null;
      // ★ chat.close 를 부르지 않는다.
      //   데몬의 tail 은 **파일 단위로 공유**된다(transcript.js byFile: 같은 트랜스크립트면 같은
      //   chatId 를 여러 클라이언트가 재사용). 우리가 닫으면 같은 대화를 보고 있는 PC 의 push 까지
      //   끊겨 CHAT_GONE → 재오픈을 강제한다. 데몬이 idle tail 을 스스로 회수하므로 누수는 없다.
    };
    // reloadTick = 명시적 재시도 트리거.
  }, [active, cwd, tid, host, agentHint, open, catchUp, policy, reloadTick]);

  // ── 라이브 델타(push) ──
  useEffect(() => {
    if (!active) return;
    return chatService.addChatEventListener((f: ChatEventFrame) => {
      if (!aliveRef.current) return;
      if (!chatIdRef.current) {
        // 볼 대화가 없던 상태(noSession)에서 무언가 시작됐다는 신호다. 우리 chatId 가 없어 이 프레임이
        //  우리 것인지 단정할 수 없으므로(다른 pane 의 대화일 수 있다) **스로틀 걸어 재오픈만** 시도한다.
        //  'ambiguous' 는 사용자 선택 전까지 답이 정해지지 않으므로 제외.
        policy.onPush();
        return;
      }
      if (f.chatId !== chatIdRef.current) return; // 다른 pane/대화의 프레임
      if (f.control) {
        if (f.control.kind === 'status_line') {
          // TUI statusline 미러 — 캐치업 폴링(poke)을 유발하지 않는다(메시지 변화가 아니다).
          setStatusLines(Array.isArray(f.control.lines) && f.control.lines.length ? f.control.lines : null);
          if ('dialog' in f.control) setStatusDialog(f.control.dialog || null);
          if (f.control.mode && f.control.mode.id && Date.now() - modeSetAtRef.current > MODE_ECHO_GUARD_MS) {
            setStatusModeState(f.control.mode);
          }
          return;
        }
        if (f.control.kind === 'gone') {
          // 데몬이 tail 을 회수했다 — 다음 캐치업이 재오픈한다.
          chatIdRef.current = null;
          poke();
          return;
        }
        if (f.control.kind === 'session_switch') {
          // /clear 나 resume — 파일이 바뀌므로 스냅샷부터 다시 그린다.
          chatIdRef.current = null;
          setTimeout(() => { if (aliveRef.current) void open(); }, 200);
          return;
        }
      }
      if (f.epochChanged) {
        epochRef.current = f.epoch || '';
        seqRef.current = lastSeqOf(f.messages || [], f.headSeq || 0);
        applyMessages(f.messages || [], true);
        return;
      }
      if (f.messages && f.messages.length) {
        seqRef.current = lastSeqOf(f.messages, Math.max(seqRef.current, f.headSeq || 0));
        applyMessages(f.messages, false);
      }
      // push 는 유실될 수 있고 프레임이 잘릴 수도 있다 → 짧게 뒤따르는 확인 폴링.
      poke();
    });
  }, [active, applyMessages, open, poke, policy]);

  // ── 낙관적 버블 ──
  const addPending = useCallback((text: string, any?: boolean): string => {
    const id = 'opt-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    setPending((p) => [...p, { id, text, at: Date.now(), state: 'sending', ...(any ? { any: true } : {}) }]);
    return id;
  }, []);
  const failPending = useCallback((id: string) => {
    setPending((p) => p.map((x) => (x.id === id ? { ...x, state: 'failed' } : x)));
  }, []);
  const dropPending = useCallback((id: string) => {
    setPending((p) => p.filter((x) => x.id !== id));
  }, []);

  const reload = useCallback(() => {
    chatIdRef.current = null;
    // 명시적 사용자 재시도 — noSession 게이트도 함께 푼다(안 풀면 "다시 시도"가 아무 일도 안 한다).
    policy.setNoSession(null);
    setNoSession(null);
    setMessages([]);
    setState('loading');
    setError(null);
    setReloadTick((n) => n + 1);
  }, [policy]);

  return {
    state, noSession, candidates, error, messages, headTruncated, sessionId, chatId, agent,
    statusLines,
    statusMode, setStatusMode,
    statusDialog, setStatusDialog,
    pending, addPending, failPending, dropPending, reload, poke,
  };
}
