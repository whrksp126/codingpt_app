import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { streamAgentQuery, resolveAgentPermission, AgentEvent, AgentDiff } from '../services/agentService';
import sessionService from '../services/sessionService';
import billingEvents from '../services/billingEvents';
import { AgentMsg } from '../types/agentSession';
import { useWorkspaceStore } from './WorkspaceStoreContext';

// 라이브 에이전트 세션 — 메인 채팅과 모바일 IDE 가 공유하는 단일 소스.
//  · 대화 상태(messages/input/running/permission)와 스트리밍·영속화를 이 컨텍스트가 소유한다.
//  · IDE 는 registerEventListener 로 raw 이벤트를 구독해 자기 side-effect(터미널/에디터 팔로우)만 얹는다.
//  · "소스 보기"(IDE) ↔ "채팅"(메인)을 오가도 같은 세션을 보고, done 마다 objectstore 에 영속화된다.

// kind: 'chat'=일반 채팅 ws(코딩 도구 OFF), 'project'=바이브코딩 ws. 누락=project 취급.
export type ActiveWorkspace = { id: string; name: string; kind?: 'chat' | 'project' };

// 채팅 중 AI가 propose_project 툴을 호출하면 만들어지는 "코딩 시작 제안"(확인 카드용).
export type ProjectProposal = {
  name: string;
  description?: string;
  stack?: string[];
  existingWorkspaceId?: string;
  initialPrompt: string;
};

// 백엔드 채팅 모드의 propose_project MCP 툴 이름
export const PROPOSE_PROJECT_TOOL = 'mcp__chat__propose_project';

type SendOpts = {
  // 화면 버블에 표시할 원문(없으면 prompt 그대로). 선택 코드 주입 시 prompt≠displayText.
  displayText?: string;
  // 에이전트 시드 파일(IDE 편집 내용/프로젝트 파일 + 채팅 첨부 base64). base64=true 면 바이너리로 기록.
  files?: { path: string; content: string; base64?: boolean }[];
};

type AgentSessionValue = {
  activeWorkspace: ActiveWorkspace | null;
  activeSessionId: string | null;
  activeSessionTitle: string;          // 현재 세션 제목(미정시 '새 세션') — 헤더 표시용
  loadingSession: boolean;             // 기존 세션 대화 로드 중(스켈레톤 표시용)
  messages: AgentMsg[];
  input: string;
  setInput: (v: string) => void;
  running: boolean;
  pendingPermission: null | { requestId: string; tool: string; relPath?: string; diff: AgentDiff };
  pendingProposal: ProjectProposal | null;   // AI가 코딩 시작을 제안(확인 카드)
  clearProposal: () => void;
  autoApprove: boolean;
  setAutoApprove: (v: boolean) => void;

  // 세션 전환/생성
  openSession: (workspace: ActiveWorkspace, sessionId: string) => Promise<void>;
  newSession: (workspace: ActiveWorkspace, title?: string) => Promise<string>;
  setActiveWorkspace: (workspace: ActiveWorkspace | null) => void;
  leaveSession: () => void; // 활성 세션 해제(메인 채팅 → 랜딩 복귀)

  // 전송/승인
  send: (prompt: string, opts?: SendOpts) => Promise<void>;
  resolvePermission: (decision: 'allow' | 'deny') => void;
  abort: () => void;

  // IDE side-effect 구독 — raw 이벤트를 받는다. 반환값으로 해제.
  registerEventListener: (fn: (evt: AgentEvent) => void) => () => void;
};

const Ctx = createContext<AgentSessionValue | undefined>(undefined);

export const AgentSessionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { reload: reloadWorkspaceStore } = useWorkspaceStore();
  const [activeWorkspace, setActiveWorkspaceState] = useState<ActiveWorkspace | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeSessionTitle, setActiveSessionTitle] = useState('');
  const [loadingSession, setLoadingSession] = useState(false);
  const [messages, setMessages] = useState<AgentMsg[]>([]);
  const [input, setInput] = useState('');
  const [running, setRunning] = useState(false);
  const [pendingPermission, setPendingPermission] = useState<AgentSessionValue['pendingPermission']>(null);
  const [pendingProposal, setPendingProposal] = useState<ProjectProposal | null>(null);
  const [autoApprove, setAutoApproveState] = useState(false);
  const clearProposal = useCallback(() => setPendingProposal(null), []);

  // 스트리밍 콜백이 최신값을 읽도록 ref 미러
  const messagesRef = useRef<AgentMsg[]>([]);
  const workspaceRef = useRef<ActiveWorkspace | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const sdkSessionIdRef = useRef<string | null>(null);
  const autoApproveRef = useRef(false);
  const abortRef = useRef<null | (() => void)>(null);
  const firstTurnTitleRef = useRef<string | null>(null); // 첫 턴이면 이 제목으로 세션 title 갱신
  // 방금 생성한(빈) 세션 — 아무 입력 없이 떠나면 폐기. 첫 메시지 전송 시 해제.
  const freshSessionRef = useRef<{ wsId: string; sessionId: string } | null>(null);

  // tool_use ↔ tool_result 상관
  const toolIndexRef = useRef<Record<string, number>>({});
  const toolRelRef = useRef<Record<string, string | undefined>>({});

  const uidRef = useRef(0);
  const uid = () => `a${++uidRef.current}`;

  // 등록된 IDE side-effect 리스너들
  const listenersRef = useRef<Set<(evt: AgentEvent) => void>>(new Set());

  // messages 갱신 헬퍼 — state + ref 동시 갱신
  const applyMessages = useCallback((updater: (prev: AgentMsg[]) => AgentMsg[]) => {
    setMessages((prev) => {
      const next = updater(prev);
      messagesRef.current = next;
      return next;
    });
  }, []);

  const setActiveWorkspace = useCallback((ws: ActiveWorkspace | null) => {
    workspaceRef.current = ws;
    setActiveWorkspaceState(ws);
  }, []);

  const setAutoApprove = useCallback((v: boolean) => {
    autoApproveRef.current = v;
    setAutoApproveState(v);
  }, []);

  // 진행 중 메시지를 현재 세션에 영속화(턴 종료 시 호출)
  const persist = useCallback(async () => {
    const ws = workspaceRef.current;
    const sid = sessionIdRef.current;
    if (!ws || !sid) return;
    try {
      await sessionService.updateSession(ws.id, sid, {
        messages: messagesRef.current,
        ...(sdkSessionIdRef.current ? { sdkSessionId: sdkSessionIdRef.current } : {}),
        ...(firstTurnTitleRef.current ? { title: firstTurnTitleRef.current } : {}),
      });
      firstTurnTitleRef.current = null;
    } catch (_) { /* 영속 실패는 조용히 — 다음 턴에 재시도됨 */ }
  }, []);

  // SDK 이벤트 → 대화 상태 반영(+리스너 통지). IDE side-effect 는 리스너가 처리.
  const handleEvent = useCallback((evt: AgentEvent) => {
    switch (evt.type) {
      case 'agent_init':
        sdkSessionIdRef.current = evt.sessionId;
        break;
      case 'text':
        applyMessages((m) => [...m, { id: uid(), role: 'assistant', text: evt.text }]);
        break;
      case 'thinking':
        applyMessages((m) => [...m, { id: uid(), role: 'thinking', text: evt.text }]);
        break;
      case 'tool_use':
        // 코딩 시작 제안 툴 → 일반 툴 카드로 쌓지 않고 확인 카드(proposal) 상태로 띄운다.
        if (evt.tool === PROPOSE_PROJECT_TOOL) {
          const inp = (evt.input || {}) as any;
          if (inp && typeof inp.name === 'string') {
            setPendingProposal({
              name: inp.name,
              description: typeof inp.description === 'string' ? inp.description : undefined,
              stack: Array.isArray(inp.stack) ? inp.stack.filter((s: any) => typeof s === 'string') : undefined,
              existingWorkspaceId: typeof inp.existingWorkspaceId === 'string' ? inp.existingWorkspaceId : undefined,
              initialPrompt: typeof inp.initialPrompt === 'string' && inp.initialPrompt ? inp.initialPrompt : (inp.description || inp.name),
            });
          }
          break;
        }
        toolRelRef.current[evt.toolUseId] = evt.relPath || undefined;
        applyMessages((m) => {
          toolIndexRef.current[evt.toolUseId] = m.length;
          return [...m, {
            id: uid(), role: 'tool', tool: evt.tool,
            relPath: evt.relPath || undefined,
            command: evt.tool === 'Bash' ? evt.input?.command : undefined,
          }];
        });
        break;
      case 'tool_result': {
        const idx = toolIndexRef.current[evt.toolUseId];
        if (idx != null) {
          applyMessages((m) => {
            if (!m[idx]) return m;
            const copy = m.slice();
            copy[idx] = { ...copy[idx], ok: evt.ok, output: evt.content } as AgentMsg;
            return copy;
          });
        }
        break;
      }
      case 'permission_request':
        setPendingPermission({ requestId: evt.requestId, tool: evt.tool, relPath: evt.relPath || undefined, diff: evt.diff });
        break;
      case 'done':
        setRunning(false);
        setPendingPermission(null);
        void persist();
        break;
      case 'error':
        applyMessages((m) => [...m, { id: uid(), role: 'assistant', text: `⚠️ ${evt.message}` }]);
        setRunning(false);
        setPendingPermission(null);
        void persist();
        break;
    }
    // IDE side-effect 리스너 통지(터미널/에디터 팔로우 등)
    listenersRef.current.forEach((fn) => { try { fn(evt); } catch (_) { /* noop */ } });
  }, [applyMessages, persist]);

  const registerEventListener = useCallback((fn: (evt: AgentEvent) => void) => {
    listenersRef.current.add(fn);
    return () => { listenersRef.current.delete(fn); };
  }, []);

  const abort = useCallback(() => {
    try { abortRef.current?.(); } catch (_) { /* noop */ }
    abortRef.current = null;
    setRunning(false);
  }, []);

  // 방금 만든 빈 세션을 떠날 때 폐기(아무 메시지도 없을 때만). 전환/해제 직전 호출.
  const discardFreshIfEmpty = useCallback(() => {
    const fresh = freshSessionRef.current;
    freshSessionRef.current = null;
    if (fresh && messagesRef.current.length === 0) {
      sessionService.deleteSession(fresh.wsId, fresh.sessionId)
        .then(() => reloadWorkspaceStore(true))   // 삭제 완료 후 목록 갱신(레이스 방지)
        .catch(() => { /* 폐기 실패는 조용히 */ });
    }
  }, [reloadWorkspaceStore]);

  const send = useCallback(async (prompt: string, opts?: SendOpts) => {
    const ws = workspaceRef.current;
    const sid = sessionIdRef.current;
    if (!ws || !sid) return;            // 활성 세션 없으면 무시(생성 플로우가 먼저 세션을 만든다)
    if (!prompt.trim() || running) return;

    const display = opts?.displayText ?? prompt;
    // 첫 턴이면 세션 제목을 첫 메시지로 — 영속 시 반영 + 헤더 즉시 갱신 + 폐기 대상 해제
    if (messagesRef.current.length === 0) {
      firstTurnTitleRef.current = display.slice(0, 40);
      setActiveSessionTitle(display.slice(0, 40));
      freshSessionRef.current = null;
    }

    applyMessages((m) => [...m, { id: uid(), role: 'user', text: display }]);
    setPendingProposal(null); // 새 사용자 턴 → 이전 제안 카드 닫음
    setRunning(true);
    toolIndexRef.current = {};
    toolRelRef.current = {};
    try {
      abortRef.current = await streamAgentQuery(
        prompt,
        handleEvent,
        (err) => {
          applyMessages((m) => [...m, { id: uid(), role: 'assistant', text: `⚠️ ${err}` }]);
          setRunning(false);
          void persist();
        },
        () => setRunning(false),
        {
          sessionId: sdkSessionIdRef.current || undefined,
          projectId: ws.id,
          files: opts?.files,
          autoApprove: autoApproveRef.current,
          mode: ws.kind === 'chat' ? 'chat' : 'code',
          // 사용량 한도 도달(429/402) → 한도 시트 띄움(에러 메시지 대신)
          onLimitReached: (info) => {
            setRunning(false);
            billingEvents.emitLimit(info);
            void persist();
          },
        },
      );
    } catch (e) {
      applyMessages((m) => [...m, { id: uid(), role: 'assistant', text: `⚠️ ${e instanceof Error ? e.message : '에이전트 호출 실패'}` }]);
      setRunning(false);
      void persist();
    }
  }, [running, applyMessages, handleEvent, persist]);

  const resolvePermission = useCallback((decision: 'allow' | 'deny') => {
    setPendingPermission((p) => {
      if (p) resolveAgentPermission(p.requestId, decision);
      return null;
    });
  }, []);

  // 세션 열기 — 영속 메시지 복원 + sdk resume id 세팅
  const openSession = useCallback(async (workspace: ActiveWorkspace, sessionId: string) => {
    abort();
    discardFreshIfEmpty();
    setActiveWorkspace(workspace);
    sessionIdRef.current = sessionId;
    setActiveSessionId(sessionId);
    setActiveSessionTitle('새 세션');
    sdkSessionIdRef.current = null;
    firstTurnTitleRef.current = null;
    applyMessages(() => []);
    setPendingProposal(null);
    // 활성 세션 상태는 위에서 동기적으로 세팅됨 → 화면은 즉시 채팅 셸로 전환되고,
    // 대화 본문은 아래 네트워크 로드 동안 스켈레톤으로 채운다(전환이 로드를 기다리지 않음).
    setLoadingSession(true);
    try {
      const detail = await sessionService.getSession(workspace.id, sessionId);
      if (sessionIdRef.current !== sessionId) return; // 로드 중 다른 세션으로 전환됨 — 버린다
      sdkSessionIdRef.current = detail.meta.sdkSessionId;
      setActiveSessionTitle(detail.meta.title || '새 세션');
      applyMessages(() => detail.messages || []);
    } catch (_) { /* 새 세션이거나 로드 실패 — 빈 상태 유지 */ }
    finally { if (sessionIdRef.current === sessionId) setLoadingSession(false); }
  }, [abort, discardFreshIfEmpty, setActiveWorkspace, applyMessages]);

  // 새 세션 생성 — 빈 대화로 시작
  const newSession = useCallback(async (workspace: ActiveWorkspace, title?: string) => {
    abort();
    discardFreshIfEmpty();
    const meta = await sessionService.createSession(workspace.id, title);
    setActiveWorkspace(workspace);
    sessionIdRef.current = meta.id;
    setActiveSessionId(meta.id);
    setActiveSessionTitle(meta.title || '새 세션');
    setLoadingSession(false); // 새 빈 세션 — 로드할 대화 없음
    sdkSessionIdRef.current = null;
    firstTurnTitleRef.current = null;
    applyMessages(() => []);
    setPendingProposal(null);
    freshSessionRef.current = { wsId: workspace.id, sessionId: meta.id };
    return meta.id;
  }, [abort, discardFreshIfEmpty, setActiveWorkspace, applyMessages]);

  // 활성 세션 해제 — 메인 채팅에서 랜딩으로. 스트림 중단 + 상태 초기화.
  const leaveSession = useCallback(() => {
    abort();
    discardFreshIfEmpty();
    workspaceRef.current = null;
    sessionIdRef.current = null;
    sdkSessionIdRef.current = null;
    firstTurnTitleRef.current = null;
    setActiveWorkspaceState(null);
    setActiveSessionId(null);
    setActiveSessionTitle('');
    setLoadingSession(false);
    applyMessages(() => []);
    setPendingProposal(null);
  }, [abort, discardFreshIfEmpty, applyMessages]);

  const value: AgentSessionValue = {
    activeWorkspace,
    activeSessionId,
    activeSessionTitle,
    loadingSession,
    messages,
    input,
    setInput,
    running,
    pendingPermission,
    pendingProposal,
    clearProposal,
    autoApprove,
    setAutoApprove,
    openSession,
    newSession,
    setActiveWorkspace,
    leaveSession,
    send,
    resolvePermission,
    abort,
    registerEventListener,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export const useAgentSession = (): AgentSessionValue => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAgentSession must be used within AgentSessionProvider');
  return ctx;
};
