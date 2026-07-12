import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';
import workspaceService, { WorkspaceMeta } from '../services/workspaceService';
import daemonService, { AccountDevice } from '../services/daemonService';
import * as T from '../workspace/tiling';
import type { TilingNode, Leaf } from '../workspace/tiling';

// WorkspaceShellContext — PC codingpt_pc/src/js/state.js 의 모바일 대응.
//   워크스페이스 = 단일 pane 레이아웃(터미널=tmux window). 세션 트리 없음.
//   · wsPrefs(순서/고정/색/이름) = 기기 로컬(AsyncStorage)
//   · 레이아웃(surfaces/layout) = 백엔드 ws_session 으로 PC 와 공유(이어받기)

// ── 타입 ──
export interface WsRuntime {
  layout: TilingNode;
  focusId: string | null;
  ports: number[];
  branch?: string | null;
}

export interface NotifItem {
  id: string;
  wsId: string;
  paneId?: string | null;
  title: string;
  body: string;
  ts: number;
  read: boolean;
}

export interface WsPrefs {
  order: string[];
  pinned: string[];
  color: Record<string, string>;
  rename: Record<string, string>;
}

interface ShellValue {
  // 상태
  workspaces: WorkspaceMeta[];
  wsError: string | null;
  activeWsId: string | null;
  runtimes: Record<string, WsRuntime>;
  notifications: NotifItem[];
  me: any | null;
  devices: AccountDevice[];
  currentDeviceId: number | string | null;
  creatingWs: boolean;
  wsPrefs: WsPrefs;
  loading: boolean;

  // 워크스페이스 조회/정렬
  activeWs: () => WorkspaceMeta | null;
  wsRuntime: (id: string) => WsRuntime | null;
  isLocal: (w?: WorkspaceMeta | null) => boolean;
  sortedWorkspaces: () => WorkspaceMeta[];
  wsDisplayName: (w: WorkspaceMeta) => string;
  wsColor: (id: string) => string | null;
  wsPinned: (id: string) => boolean;

  // 액션
  loadWorkspaces: () => Promise<void>;
  setActive: (id: string | null) => void;
  applyWsVisualOrder: (ids: string[]) => void;
  moveWs: (id: string, dir: 'up' | 'down' | 'top') => void;
  togglePinWs: (id: string) => void;
  setWsColor: (id: string, color: string) => void;
  renameWs: (id: string, name: string) => void;

  // pane
  splitPane: (paneId: string, dir: 'h' | 'v', kind: T.PaneKind, opts?: T.LeafOpts) => void;
  splitFocused: (dir: 'h' | 'v', kind: T.PaneKind, opts?: T.LeafOpts) => void;
  closePane: (wsId: string, paneId: string) => void;
  closeFocused: () => void;
  focusPane: (paneId: string) => void;
  setRatio: (branchPath: Array<'first' | 'second'>, ratio: number) => void;
  replaceLayout: (wsId: string, layout: TilingNode, focusId?: string | null) => void;
  setTerminalTabs: (paneId: string, tabs: T.TerminalTab[], active: number) => void;
  movePane: (srcId: string, targetId: string, side: T.Side) => void;
  patchLeaf: (paneId: string, patch: Record<string, unknown>) => void;

  // 알림
  pushNotification: (n: Omit<NotifItem, 'id' | 'ts' | 'read'>) => NotifItem;
  markAllRead: () => void;
  unreadForWs: (wsId: string) => number;

  // 계정/기기
  loadMe: () => Promise<void>;
  loadDevices: () => Promise<void>;

  // 세션 이어받기
  pullSession: (wsId: string) => Promise<void>;
}

const Ctx = createContext<ShellValue | undefined>(undefined);

const UI_KEY = 'cpt.pcui';

// leaf.win 단일 → tabs[] 마이그레이션(구버전 레이아웃 호환).
function migrateTree(node: any): TilingNode {
  if (!node) return node;
  if (!node.dir) {
    if (node.kind !== 'preview' && node.kind !== 'ide' && !Array.isArray(node.tabs)) {
      node.kind = 'terminal';
      node.tabs = [{ win: typeof node.win === 'number' ? node.win : 0, title: '' }];
      node.active = 0;
      delete node.win;
    }
    return node;
  }
  migrateTree(node.first);
  migrateTree(node.second);
  return node;
}

// 트리 → 기기 무관 surfaces[](모바일/PC 이어받기 매니페스트).
function leafSurfaces(node: TilingNode | null, acc: any[] = []): any[] {
  if (!node) return acc;
  if (T.isLeaf(node)) {
    if (node.kind === 'terminal') {
      for (const t of node.tabs || []) {
        if (typeof t.win === 'number') acc.push({ id: `${node.id}:${t.win}`, kind: 'terminal', win: t.win, title: t.title || '' });
      }
    } else if (node.kind === 'ide') {
      acc.push({ id: node.id, kind: 'ide', path: (node as any).openPath || null });
    } else if (node.kind === 'preview') {
      acc.push({ id: node.id, kind: 'preview', url: (node as any).url || '' });
    }
    return acc;
  }
  leafSurfaces(node.first, acc);
  leafSurfaces(node.second, acc);
  return acc;
}

function buildSessionManifest(rt: WsRuntime | undefined): any {
  if (!rt || !rt.layout) return null;
  return { version: 1, surfaces: leafSurfaces(rt.layout), layout: rt.layout, focusId: rt.focusId || null };
}

export const WorkspaceShellProvider = ({ children }: { children: ReactNode }) => {
  const { isLoggedIn, loading: authLoading } = useAuth();

  const [workspaces, setWorkspaces] = useState<WorkspaceMeta[]>([]);
  const [wsError, setWsError] = useState<string | null>(null);
  const [activeWsId, setActiveWsId] = useState<string | null>(null);
  const [runtimes, setRuntimes] = useState<Record<string, WsRuntime>>({});
  const [notifications, setNotifications] = useState<NotifItem[]>([]);
  const [me, setMe] = useState<any | null>(null);
  const [devices, setDevices] = useState<AccountDevice[]>([]);
  const [currentDeviceId, setCurrentDeviceId] = useState<number | string | null>(null);
  const [creatingWs, setCreatingWs] = useState(false);
  const [wsPrefs, setWsPrefs] = useState<WsPrefs>({ order: [], pinned: [], color: {}, rename: {} });
  const [loading, setLoading] = useState(true);

  // 콜백에서 최신 상태 참조(stale 클로저 방지).
  const runtimesRef = useRef(runtimes); runtimesRef.current = runtimes;
  const activeWsIdRef = useRef(activeWsId); activeWsIdRef.current = activeWsId;
  const wsPrefsRef = useRef(wsPrefs); wsPrefsRef.current = wsPrefs;
  const workspacesRef = useRef(workspaces); workspacesRef.current = workspaces;

  // 영속화(pc-ui.json 대응) 디바운스.
  const uiSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restoredRef = useRef(false);
  const schedulePersistUi = useCallback(() => {
    if (uiSaveTimer.current) clearTimeout(uiSaveTimer.current);
    uiSaveTimer.current = setTimeout(() => {
      const ws: Record<string, any> = {};
      for (const [id, rt] of Object.entries(runtimesRef.current)) ws[id] = { layout: rt.layout, focusId: rt.focusId };
      const payload = { activeWsId: activeWsIdRef.current, ws, wsPrefs: wsPrefsRef.current };
      AsyncStorage.setItem(UI_KEY, JSON.stringify(payload)).catch(() => {});
    }, 600);
  }, []);

  // 세션 매니페스트 푸시(PC↔모바일 이어받기) 디바운스 1500ms, 무변경 스킵.
  const sessionPushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPushed = useRef<Record<string, string>>({});
  const scheduleSessionPush = useCallback(() => {
    const wsId = activeWsIdRef.current;
    if (!wsId) return;
    if (sessionPushTimer.current) clearTimeout(sessionPushTimer.current);
    sessionPushTimer.current = setTimeout(async () => {
      const manifest = buildSessionManifest(runtimesRef.current[wsId]);
      if (!manifest) return;
      const key = JSON.stringify(manifest);
      if (lastPushed.current[wsId] === key) return;
      lastPushed.current[wsId] = key;
      try { await daemonService.putWorkspaceSession(wsId, manifest, 'mobile'); } catch (_) { /* 오프라인 */ }
    }, 1500);
  }, []);

  // 상태 변경 후 공통 후처리(영속화 + 세션 푸시).
  const afterChange = useCallback(() => { schedulePersistUi(); scheduleSessionPush(); }, [schedulePersistUi, scheduleSessionPush]);

  // ── 조회 헬퍼 ──
  const isLocal = useCallback((w?: WorkspaceMeta | null) => !!w && (w.compute === 'local' || (!w.compute && !!w.localPath)), []);
  const activeWs = useCallback(() => workspacesRef.current.find((w) => w.id === activeWsIdRef.current) || null, []);
  const wsRuntime = useCallback((id: string) => runtimesRef.current[id] || null, []);
  const wsDisplayName = useCallback((w: WorkspaceMeta) => (w && (wsPrefsRef.current.rename[w.id] || w.name)) || '워크스페이스', []);
  const wsColor = useCallback((id: string) => wsPrefsRef.current.color[id] || null, []);
  const wsPinned = useCallback((id: string) => wsPrefsRef.current.pinned.includes(id), []);

  const ensureWsOrder = useCallback((prefs: WsPrefs, list: WorkspaceMeta[]): WsPrefs => {
    const order = prefs.order.slice();
    for (const w of list) if (!order.includes(w.id)) order.push(w.id);
    return {
      ...prefs,
      order: order.filter((id) => list.some((w) => w.id === id)),
      pinned: prefs.pinned.filter((id) => list.some((w) => w.id === id)),
    };
  }, []);

  const sortedWorkspaces = useCallback((): WorkspaceMeta[] => {
    const prefs = wsPrefsRef.current;
    const list = workspacesRef.current;
    const idx = (id: string) => { const i = prefs.order.indexOf(id); return i === -1 ? 1e9 : i; };
    return list.slice().sort((a, b) => {
      const pa = prefs.pinned.includes(a.id) ? 0 : 1, pb = prefs.pinned.includes(b.id) ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return idx(a.id) - idx(b.id);
    });
  }, []);

  // ── 런타임 보장 ──
  const ensureRuntime = useCallback((id: string) => {
    setRuntimes((prev) => {
      if (prev[id]) return prev;
      const layout = T.leaf('terminal', { win: 0 });
      return { ...prev, [id]: { layout, focusId: T.firstLeafId(layout), ports: [] } };
    });
  }, []);

  // ── wsPrefs 액션 ──
  const applyWsVisualOrder = useCallback((ids: string[]) => {
    setWsPrefs((p) => ({ ...p, order: ids.slice() }));
    afterChange();
  }, [afterChange]);

  const moveWs = useCallback((id: string, dir: 'up' | 'down' | 'top') => {
    const ids = sortedWorkspaces().map((w) => w.id);
    const i = ids.indexOf(id);
    if (i < 0) return;
    const j = dir === 'top' ? 0 : dir === 'up' ? i - 1 : i + 1;
    if (dir !== 'top' && (j < 0 || j >= ids.length)) return;
    ids.splice(i, 1);
    ids.splice(dir === 'top' ? 0 : j, 0, id);
    applyWsVisualOrder(ids);
  }, [sortedWorkspaces, applyWsVisualOrder]);

  const togglePinWs = useCallback((id: string) => {
    setWsPrefs((p) => ({ ...p, pinned: p.pinned.includes(id) ? p.pinned.filter((x) => x !== id) : [...p.pinned, id] }));
    afterChange();
  }, [afterChange]);

  const setWsColor = useCallback((id: string, color: string) => {
    setWsPrefs((p) => {
      const next = { ...p.color };
      if (color) next[id] = color; else delete next[id];
      return { ...p, color: next };
    });
    afterChange();
  }, [afterChange]);

  const renameWs = useCallback((id: string, name: string) => {
    const v = String(name || '').trim();
    setWsPrefs((p) => {
      const next = { ...p.rename };
      if (v) next[id] = v.slice(0, 80); else delete next[id];
      return { ...p, rename: next };
    });
    afterChange();
  }, [afterChange]);

  // ── pane 조작 ──
  const updateRuntime = useCallback((wsId: string, fn: (rt: WsRuntime) => WsRuntime) => {
    setRuntimes((prev) => {
      const cur = prev[wsId];
      if (!cur) return prev;
      return { ...prev, [wsId]: fn(cur) };
    });
    afterChange();
  }, [afterChange]);

  const splitPane = useCallback((paneId: string, dir: 'h' | 'v', kind: T.PaneKind, opts?: T.LeafOpts) => {
    const wsId = activeWsIdRef.current;
    if (!wsId || !paneId) return;
    updateRuntime(wsId, (rt) => {
      const node: Leaf = kind === 'preview' || kind === 'ide' ? T.leaf(kind, opts) : T.leaf('terminal', { win: 'new' });
      const r = T.split(rt.layout, paneId, dir, node);
      return { ...rt, layout: r.tree, focusId: r.added.id };
    });
  }, [updateRuntime]);

  const splitFocused = useCallback((dir: 'h' | 'v', kind: T.PaneKind, opts?: T.LeafOpts) => {
    const wsId = activeWsIdRef.current;
    const rt = wsId ? runtimesRef.current[wsId] : null;
    if (rt && rt.focusId) splitPane(rt.focusId, dir, kind, opts);
  }, [splitPane]);

  const closePane = useCallback((wsId: string, paneId: string) => {
    if (!wsId || !paneId) return;
    const rt = runtimesRef.current[wsId];
    const ws = workspacesRef.current.find((x) => x.id === wsId);
    if (rt) {
      const leaf = T.findLeaf(rt.layout, paneId);
      // 터미널 pane 닫기 = 그 window 를 원격 호스트에서 kill(라이브 미러 → 양쪽 종료).
      if (leaf && leaf.kind === 'terminal' && ws) {
        for (const t of leaf.tabs || []) {
          if (typeof t.win === 'number') daemonService.closeTerminal(ws.localPath || '', t.win).catch(() => {});
        }
      }
    }
    updateRuntime(wsId, (cur) => {
      const r = T.closeLeaf(cur.layout, paneId);
      let layout = r.tree;
      let focusId = r.focusId || (layout ? T.firstLeafId(layout) : null);
      if (!layout) { layout = T.leaf('terminal', { win: 'new' }); focusId = T.firstLeafId(layout); }
      return { ...cur, layout, focusId };
    });
  }, [updateRuntime]);

  const closeFocused = useCallback(() => {
    const wsId = activeWsIdRef.current;
    const rt = wsId ? runtimesRef.current[wsId] : null;
    if (wsId && rt?.focusId) closePane(wsId, rt.focusId);
  }, [closePane]);

  const focusPane = useCallback((paneId: string) => {
    const wsId = activeWsIdRef.current;
    if (wsId) updateRuntime(wsId, (rt) => ({ ...rt, focusId: paneId }));
  }, [updateRuntime]);

  const setRatio = useCallback((branchPath: Array<'first' | 'second'>, ratio: number) => {
    const wsId = activeWsIdRef.current;
    if (wsId) updateRuntime(wsId, (rt) => ({ ...rt, layout: T.setRatio(rt.layout, branchPath, ratio) }));
  }, [updateRuntime]);

  const setTerminalTabs = useCallback((paneId: string, tabs: T.TerminalTab[], active: number) => {
    const wsId = activeWsIdRef.current;
    if (!wsId) return;
    updateRuntime(wsId, (rt) => ({
      ...rt,
      layout: T.mapLeaf(rt.layout, paneId, (l) => (l.kind === 'terminal' ? { ...l, tabs, active } : l)),
    }));
  }, [updateRuntime]);

  const replaceLayout = useCallback((wsId: string, layout: TilingNode, focusId?: string | null) => {
    setRuntimes((prev) => ({ ...prev, [wsId]: { layout, focusId: focusId ?? T.firstLeafId(layout), ports: prev[wsId]?.ports || [] } }));
    afterChange();
  }, [afterChange]);

  // leaf 필드 패치(프리뷰 url, IDE openPath 등) — mapLeaf 불변 갱신.
  const patchLeaf = useCallback((paneId: string, patch: Record<string, unknown>) => {
    const wsId = activeWsIdRef.current;
    if (!wsId) return;
    updateRuntime(wsId, (rt) => ({
      ...rt,
      layout: T.mapLeaf(rt.layout, paneId, (l) => ({ ...l, ...patch } as typeof l)),
    }));
  }, [updateRuntime]);

  // pane 통째 이동(드래그): side=null 스왑, 방향=그쪽으로 분할 삽입(노드 identity 보존 → 상태 유지).
  const movePane = useCallback((srcId: string, targetId: string, side: T.Side) => {
    const wsId = activeWsIdRef.current;
    if (!wsId || srcId === targetId) return;
    updateRuntime(wsId, (rt) => {
      const r = T.moveLeaf(rt.layout, srcId, targetId, side);
      if (!r.movedId) return rt;
      return { ...rt, layout: r.tree, focusId: r.movedId };
    });
  }, [updateRuntime]);

  // ── 세션 이어받기(ws당 1회) ──
  const pulledRef = useRef<Set<string>>(new Set());
  const pullSession = useCallback(async (wsId: string) => {
    if (!wsId || pulledRef.current.has(wsId)) return;
    pulledRef.current.add(wsId);
    try {
      const env = await daemonService.getWorkspaceSession(wsId);
      const remote: any = env && (env as any).session;
      if (!remote || !remote.layout) return;
      const layout = migrateTree(remote.layout);
      T.bumpSeq(T.leafIds(layout));
      const rt: WsRuntime = { layout, focusId: remote.focusId || T.firstLeafId(layout), ports: [] };
      lastPushed.current[wsId] = JSON.stringify(buildSessionManifest(rt)); // 방금 채택 → 즉시 재푸시 방지
      setRuntimes((prev) => ({ ...prev, [wsId]: rt }));
    } catch (_) { /* 오프라인 → 로컬 상태 유지 */ }
  }, []);

  const setActive = useCallback((id: string | null) => {
    setActiveWsId(id);
    if (id) { ensureRuntime(id); void pullSession(id); }
    afterChange();
  }, [ensureRuntime, pullSession, afterChange]);

  // ── 알림 ──
  const pushNotification = useCallback((n: Omit<NotifItem, 'id' | 'ts' | 'read'>): NotifItem => {
    const item: NotifItem = { id: 'n' + Date.now() + Math.random().toString(36).slice(2, 6), ts: Date.now(), read: false, ...n };
    setNotifications((prev) => [item, ...prev].slice(0, 100));
    return item;
  }, []);
  const markAllRead = useCallback(() => setNotifications((prev) => prev.map((n) => ({ ...n, read: true }))), []);
  const unreadForWs = useCallback((wsId: string) => notifications.filter((n) => n.wsId === wsId && !n.read).length, [notifications]);

  // ── 백엔드 로드 ──
  const loadWorkspaces = useCallback(async () => {
    try {
      const r = await workspaceService.listWorkspaces();
      // 채팅 전용 ws 제외(코딩 워크스페이스만).
      const list = (r.workspaces || []).filter((w) => w.kind !== 'chat');
      setWorkspaces(list);
      setWsError(null);
      setWsPrefs((p) => ensureWsOrder(p, list));
      // 활성 워크스페이스 정합화.
      const curActive = activeWsIdRef.current;
      if (curActive && !list.some((w) => w.id === curActive)) setActiveWsId(null);
      if (!curActive || !list.some((w) => w.id === curActive)) {
        const first = list.find((w) => isLocal(w)) || list[0];
        if (first) { setActiveWsId(first.id); ensureRuntime(first.id); void pullSession(first.id); }
      } else {
        void pullSession(curActive);
      }
    } catch (e) {
      setWsError(String(e));
    }
  }, [ensureWsOrder, isLocal, ensureRuntime, pullSession]);

  const loadMe = useCallback(async () => {
    try {
      const dev = await daemonService.listDevices();
      // me 프로필은 별도 소스가 없으므로 devices 로드 시 currentDevice 로 대체 표시(설정에서 확장).
      setDevices(dev.devices);
      setCurrentDeviceId(dev.currentDeviceId);
    } catch (_) { /* noop */ }
  }, []);
  const loadDevices = loadMe;

  // ── 복원(AsyncStorage) ──
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(UI_KEY);
        if (raw) {
          const saved = JSON.parse(raw);
          if (saved.ws && typeof saved.ws === 'object') {
            const rts: Record<string, WsRuntime> = {};
            const allIds: string[] = [];
            for (const [id, w] of Object.entries<any>(saved.ws)) {
              if (w && w.layout) {
                const layout = migrateTree(w.layout);
                rts[id] = { layout, focusId: w.focusId || T.firstLeafId(layout), ports: [] };
                allIds.push(...T.leafIds(layout));
              }
            }
            T.bumpSeq(allIds);
            setRuntimes(rts);
          }
          if (saved.activeWsId) setActiveWsId(saved.activeWsId);
          if (saved.wsPrefs && typeof saved.wsPrefs === 'object') {
            setWsPrefs({
              order: Array.isArray(saved.wsPrefs.order) ? saved.wsPrefs.order : [],
              pinned: Array.isArray(saved.wsPrefs.pinned) ? saved.wsPrefs.pinned : [],
              color: saved.wsPrefs.color && typeof saved.wsPrefs.color === 'object' ? saved.wsPrefs.color : {},
              rename: saved.wsPrefs.rename && typeof saved.wsPrefs.rename === 'object' ? saved.wsPrefs.rename : {},
            });
          }
        }
      } catch (_) { /* 복원 실패 무시 */ }
      restoredRef.current = true;
    })();
  }, []);

  // 로그인되면 로드.
  useEffect(() => {
    if (authLoading) return;
    if (isLoggedIn) {
      setLoading(true);
      Promise.all([loadWorkspaces(), loadMe()]).finally(() => setLoading(false));
    } else {
      setWorkspaces([]); setRuntimes({}); setActiveWsId(null); setDevices([]); setLoading(false);
    }
  }, [authLoading, isLoggedIn, loadWorkspaces, loadMe]);

  const value: ShellValue = useMemo(() => ({
    workspaces, wsError, activeWsId, runtimes, notifications, me, devices, currentDeviceId, creatingWs, wsPrefs, loading,
    activeWs, wsRuntime, isLocal, sortedWorkspaces, wsDisplayName, wsColor, wsPinned,
    loadWorkspaces, setActive, applyWsVisualOrder, moveWs, togglePinWs, setWsColor, renameWs,
    splitPane, splitFocused, closePane, closeFocused, focusPane, setRatio, replaceLayout, setTerminalTabs, movePane, patchLeaf,
    pushNotification, markAllRead, unreadForWs, loadMe, loadDevices, pullSession,
  }), [
    workspaces, wsError, activeWsId, runtimes, notifications, me, devices, currentDeviceId, creatingWs, wsPrefs, loading,
    activeWs, wsRuntime, isLocal, sortedWorkspaces, wsDisplayName, wsColor, wsPinned,
    loadWorkspaces, setActive, applyWsVisualOrder, moveWs, togglePinWs, setWsColor, renameWs,
    splitPane, splitFocused, closePane, closeFocused, focusPane, setRatio, replaceLayout, setTerminalTabs, movePane, patchLeaf,
    pushNotification, markAllRead, unreadForWs, loadMe, loadDevices, pullSession,
  ]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export const useWorkspaceShell = (): ShellValue => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useWorkspaceShell must be used within WorkspaceShellProvider');
  return ctx;
};
