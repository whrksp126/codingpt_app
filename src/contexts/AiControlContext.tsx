import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { useWorkspaceShell } from './WorkspaceShellContext';
import { useAgentSession, ActiveWorkspace } from './AgentSessionContext';
import { projectIdForWorkspace } from '../services/ideSource';

// AiControlContext — AI 에이전트 실행/열기 제어를 공유한다.
//   · 과거엔 우측 하단 FAB(AiController) 가 단독으로 실행/열기를 담당했으나,
//     이제는 각 터미널 pane 헤더의 도구 버튼에서도 "실행"을 트리거하고,
//     실행 여부(hasSession)에 따라 버튼을 보이거나 숨겨야 한다.
//   · 그래서 시트/프롬프트 상태와 시작 로직을 이 컨텍스트로 끌어올려 공유한다.
type AiControlValue = {
  hasSession: boolean;      // 에이전트 세션이 살아있는가(=실행 중)
  sheetOpen: boolean;
  promptOpen: boolean;
  setSheetOpen: (v: boolean) => void;
  setPromptOpen: (v: boolean) => void;
  // 실행 중이면 시트 열기, 아니면 세션 시작(+시트 열기).
  openOrStart: () => void;
  // 세션 시작(확인 프롬프트 "실행" 에서 호출).
  startSession: () => Promise<void>;
};

// 임시로 AI 하이브리드(진입 확인 프롬프트 + 터미널 실행 버튼)를 숨긴다.
//  false 로 바꾸면 다시 노출된다.
export const AI_HYBRID_HIDDEN = true;

const Ctx = createContext<AiControlValue | null>(null);

export const AiControlProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const S = useWorkspaceShell();
  const { newSession, activeSessionId } = useAgentSession();
  const ws = S.activeWs();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const startingRef = useRef(false);

  const toActiveWs = useCallback((w: NonNullable<typeof ws>): ActiveWorkspace => {
    const local = S.isLocal(w);
    return local
      ? { id: projectIdForWorkspace(w), name: w.name, kind: 'project', wsId: w.id, runnerKind: 'local' }
      : { id: w.id, name: w.name, kind: 'project' };
  }, [S]);

  const startSession = useCallback(async () => {
    if (!ws || startingRef.current) return;
    startingRef.current = true;
    try {
      await newSession(toActiveWs(ws));
      setSheetOpen(true);
    } catch (_) { /* noop */ } finally { startingRef.current = false; }
  }, [ws, newSession, toActiveWs]);

  const openOrStart = useCallback(() => {
    if (activeSessionId) setSheetOpen(true);
    else void startSession();
  }, [activeSessionId, startSession]);

  const value = useMemo<AiControlValue>(() => ({
    hasSession: !!activeSessionId,
    sheetOpen, promptOpen, setSheetOpen, setPromptOpen,
    openOrStart, startSession,
  }), [activeSessionId, sheetOpen, promptOpen, openOrStart, startSession]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export const useAiControl = (): AiControlValue => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAiControl must be used within AiControlProvider');
  return ctx;
};
