import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import chatService from '../../services/chatService';
import {
  lastSeqOf, mergeMessages, pruneOptimistic,
  type ChatEventFrame, type ChatMsg, type PendingUser,
} from '../chatModel';

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

export type ChatStreamState = 'idle' | 'loading' | 'live' | 'error' | 'unsupported';

export interface ChatStream {
  state: ChatStreamState;
  error: string | null;
  messages: ChatMsg[];
  /** 스냅샷 앞부분이 잘렸는가(과거 대화가 더 있다). */
  headTruncated: boolean;
  sessionId: string | null;
  chatId: string | null;
  /** 낙관적 user 버블(전송 즉시 표시 → 트랜스크립트 도착 시 자동 제거). */
  pending: PendingUser[];
  addPending: (text: string) => string;
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
  /** false 면 구독을 만들지 않는다(chat 모드가 아닐 때 = 트래픽 0). */
  active: boolean;
}

export default function useChatStream({ cwd, tid, host, active }: Params): ChatStream {
  const [state, setState] = useState<ChatStreamState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [headTruncated, setHeadTruncated] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [chatId, setChatId] = useState<string | null>(null);
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
    try {
      setState((s) => (s === 'live' ? s : 'loading'));
      const snap = await chatService.chatOpen({
        cwd, tid: tid ?? undefined, limit: OPEN_LIMIT, host,
      });
      if (!aliveRef.current) return;
      if (snap.supported === false) {
        setState('unsupported');
        setError(snap.reason === 'not_installed' ? 'PC 에 claude 가 없어요.' : '이 PC 에서 대화를 읽을 수 없어요.');
        return;
      }
      chatIdRef.current = snap.chatId;
      epochRef.current = snap.epoch || '';
      seqRef.current = lastSeqOf(snap.messages, snap.headSeq);
      failStreakRef.current = 0;
      setChatId(snap.chatId);
      setSessionId(snap.sessionId ?? null);
      setHeadTruncated(!!snap.headTruncated);
      applyMessages(snap.messages, true);
      setError(null);
      setState('live');
    } catch (e) {
      if (!aliveRef.current) return;
      chatIdRef.current = null;
      setState('error');
      setError(String((e as Error)?.message || e));
    } finally { busyRef.current = false; }
  }, [cwd, tid, host, applyMessages]);

  // ── 캐치업(pull) ──
  const catchUp = useCallback(async () => {
    if (!aliveRef.current || busyRef.current) return;
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
  }, [host, open, applyMessages]);

  const poke = useCallback(() => {
    if (pokeTimerRef.current) clearTimeout(pokeTimerRef.current);
    pokeTimerRef.current = setTimeout(() => { void catchUp(); }, PUSH_SETTLE_MS);
  }, [catchUp]);

  // ── 라이프사이클: active 인 동안만 구독/폴링 ──
  useEffect(() => {
    if (!active || !cwd || tid == null) {
      aliveRef.current = false;
      return;
    }
    aliveRef.current = true;
    void open();
    const iv = setInterval(() => { void catchUp(); }, POLL_MS);
    const sub = AppState.addEventListener('change', (st) => {
      // 백그라운드 동안 폴링 타이머가 지연/정지되므로 복귀 즉시 한 번 따라잡는다(누락 0 게이트).
      if (st === 'active') void catchUp();
    });
    return () => {
      aliveRef.current = false;
      clearInterval(iv);
      sub.remove();
      if (pokeTimerRef.current) clearTimeout(pokeTimerRef.current);
      chatIdRef.current = null;
      // ★ chat.close 를 부르지 않는다.
      //   데몬의 tail 은 **파일 단위로 공유**된다(transcript.js byFile: 같은 트랜스크립트면 같은
      //   chatId 를 여러 클라이언트가 재사용). 우리가 닫으면 같은 대화를 보고 있는 PC 의 push 까지
      //   끊겨 CHAT_GONE → 재오픈을 강제한다. 데몬이 idle tail 을 스스로 회수하므로 누수는 없다.
    };
    // reloadTick = 명시적 재시도 트리거.
  }, [active, cwd, tid, host, open, catchUp, reloadTick]);

  // ── 라이브 델타(push) ──
  useEffect(() => {
    if (!active) return;
    return chatService.addChatEventListener((f: ChatEventFrame) => {
      if (!aliveRef.current) return;
      if (!chatIdRef.current || f.chatId !== chatIdRef.current) return; // 다른 pane/대화의 프레임
      if (f.control) {
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
  }, [active, applyMessages, open, poke]);

  // ── 낙관적 버블 ──
  const addPending = useCallback((text: string): string => {
    const id = 'opt-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    setPending((p) => [...p, { id, text, at: Date.now(), state: 'sending' }]);
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
    setMessages([]);
    setState('loading');
    setError(null);
    setReloadTick((n) => n + 1);
  }, []);

  return {
    state, error, messages, headTruncated, sessionId, chatId,
    pending, addPending, failPending, dropPending, reload, poke,
  };
}
