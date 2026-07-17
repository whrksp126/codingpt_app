import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from './AuthContext';
import workspaceService, { WorkspaceMeta } from '../services/workspaceService';

// 워크스페이스 목록을 스플래시 단계에서 미리 불러와 두는 공유 스토어.
//  · 사이드 드로어 / 워크스페이스 목록이 모두 이 캐시를 읽는다(재요청 X).
//  · 변경(생성/삭제) 후 reload(true)로 조용히 갱신.
//  (구) 채팅 워크스페이스/최근 세션 프리로드는 AI 채팅 UI 제거와 함께 삭제 — 터미널 claude 로 일원화.

interface WorkspaceStoreValue {
  workspaces: WorkspaceMeta[];                      // 코딩(project) 워크스페이스만 — 레거시 채팅 ws 제외
  loading: boolean;                                // 최초 프리로드 진행 여부(스플래시 게이트)
  reload: (silent?: boolean) => Promise<void>;     // 전체 갱신(silent=로딩 토글 안 함)
}

const Ctx = createContext<WorkspaceStoreValue | undefined>(undefined);

export const WorkspaceStoreProvider = ({ children }: { children: ReactNode }) => {
  const { isLoggedIn, loading: authLoading } = useAuth();
  const [workspaces, setWorkspaces] = useState<WorkspaceMeta[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const r = await workspaceService.listWorkspaces();
      // 과거 채팅 전용 ws(kind:'chat')가 남아 있을 수 있어 목록에서 제외한다.
      setWorkspaces((r.workspaces || []).filter((w) => w.kind !== 'chat'));
    } catch (_) {
      setWorkspaces([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // 로그인되면 프리로드, 로그아웃되면 비움.
  useEffect(() => {
    if (authLoading) return;
    if (isLoggedIn) { void reload(); }
    else { setWorkspaces([]); setLoading(false); }
  }, [authLoading, isLoggedIn, reload]);

  const value: WorkspaceStoreValue = { workspaces, loading, reload };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export const useWorkspaceStore = (): WorkspaceStoreValue => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useWorkspaceStore must be used within WorkspaceStoreProvider');
  return ctx;
};
