import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from './AuthContext';
import workspaceService, { WorkspaceMeta } from '../services/workspaceService';
import { listSessions } from '../services/sessionService';
import { SessionMeta } from '../types/agentSession';

// 워크스페이스 + 세션을 스플래시 단계에서 미리 불러와 두는 공유 스토어.
//  · 사이드 드로어 / 홈 최근 세션 / 워크스페이스 목록이 모두 이 캐시를 읽는다(재요청 X).
//  · 변경(세션 생성/열기/삭제) 후 reload(true)로 조용히 갱신.

export type RecentSession = { ws: WorkspaceMeta; sess: SessionMeta };

interface WorkspaceStoreValue {
  workspaces: WorkspaceMeta[];                      // 코딩(project) 워크스페이스만 — 채팅 ws 제외
  chatWorkspace: WorkspaceMeta | null;             // 일반 채팅 전용 ws(사용자당 1개)
  recentSessions: RecentSession[];                 // 코딩 ws 세션만 updatedAt desc(채팅 제외)
  sessionsByWs: Record<string, SessionMeta[]>;     // 워크스페이스별 세션 목록(채팅 ws 포함)
  loading: boolean;                                // 최초 프리로드 진행 여부(스플래시 게이트)
  reload: (silent?: boolean) => Promise<void>;     // 전체 갱신(silent=로딩 토글 안 함)
  ensureChatWorkspace: () => Promise<WorkspaceMeta>; // 채팅 ws 보장(없으면 생성)
}

const Ctx = createContext<WorkspaceStoreValue | undefined>(undefined);

export const WorkspaceStoreProvider = ({ children }: { children: ReactNode }) => {
  const { isLoggedIn, loading: authLoading } = useAuth();
  const [workspaces, setWorkspaces] = useState<WorkspaceMeta[]>([]);
  const [chatWorkspace, setChatWorkspace] = useState<WorkspaceMeta | null>(null);
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>([]);
  const [sessionsByWs, setSessionsByWs] = useState<Record<string, SessionMeta[]>>({});
  const [loading, setLoading] = useState(true);
  // 콜백 stale 클로저 방지 + ensure 중복 생성 방지(동시 호출 dedup)
  const chatWsRef = useRef<WorkspaceMeta | null>(null);
  const ensureInflightRef = useRef<Promise<WorkspaceMeta> | null>(null);

  const reload = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const r = await workspaceService.listWorkspaces();
      const wssAll = r.workspaces || [];
      const chatWs = wssAll.find((w) => w.kind === 'chat') || null;
      const projWss = wssAll.filter((w) => w.kind !== 'chat');
      const byWs: Record<string, SessionMeta[]> = {};
      const all: RecentSession[] = [];
      // 세션은 전체(채팅+코딩)를 미리 받고, 최근 세션 목록에도 채팅·코딩 모두 포함(드로어에서 타입 아이콘으로 구분).
      for (const ws of wssAll) {
        // PC(local) 워크스페이스는 클라우드 에이전트 세션이 없다(사용자가 자기 claude 실행) → 세션 조회 스킵.
        if (ws.compute === 'local') { byWs[ws.id] = []; continue; }
        try {
          const ss = await listSessions(ws.id);
          byWs[ws.id] = ss;
          ss.forEach((sess) => all.push({ ws, sess }));
        } catch (_) { byWs[ws.id] = []; }
      }
      all.sort((a, b) => String(b.sess.updatedAt || '').localeCompare(String(a.sess.updatedAt || '')));
      chatWsRef.current = chatWs;
      setChatWorkspace(chatWs);
      setWorkspaces(projWss);
      setSessionsByWs(byWs);
      setRecentSessions(all);
    } catch (_) {
      setWorkspaces([]); setSessionsByWs({}); setRecentSessions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // 채팅 전용 워크스페이스 보장 — 캐시 우선, 없으면 서버 재확인 후 생성(동시 호출은 한 번만).
  const ensureChatWorkspace = useCallback(async (): Promise<WorkspaceMeta> => {
    if (chatWsRef.current) return chatWsRef.current;
    if (ensureInflightRef.current) return ensureInflightRef.current;
    const work = (async () => {
      const r = await workspaceService.listWorkspaces();
      let chat = (r.workspaces || []).find((w) => w.kind === 'chat') || null;
      if (!chat) {
        const created = await workspaceService.createWorkspace({ name: '채팅', kind: 'chat' });
        chat = created.workspace;
        void reload(true);
      }
      chatWsRef.current = chat;
      setChatWorkspace(chat);
      return chat;
    })();
    ensureInflightRef.current = work;
    try { return await work; }
    finally { ensureInflightRef.current = null; }
  }, [reload]);

  // 로그인되면 프리로드, 로그아웃되면 비움.
  useEffect(() => {
    if (authLoading) return;
    if (isLoggedIn) { void reload(); }
    else {
      chatWsRef.current = null;
      setWorkspaces([]); setChatWorkspace(null); setSessionsByWs({}); setRecentSessions([]); setLoading(false);
    }
  }, [authLoading, isLoggedIn, reload]);

  const value: WorkspaceStoreValue = { workspaces, chatWorkspace, recentSessions, sessionsByWs, loading, reload, ensureChatWorkspace };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export const useWorkspaceStore = (): WorkspaceStoreValue => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useWorkspaceStore must be used within WorkspaceStoreProvider');
  return ctx;
};
