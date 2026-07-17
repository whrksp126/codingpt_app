import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';
import workspaceService, { WorkspaceMeta } from '../services/workspaceService';
import daemonService, { AccountDevice } from '../services/daemonService';
import notificationService, { NotifRow, CreateNotifPayload } from '../services/notificationService';
import pushService from '../services/pushService';
import { playNotifSound } from '../services/notifSound';
import { haptic } from '../animations/haptics';
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

// 알림 항목 — 서버 행(NotifRow) 미러 + 로컬 폴백(서버 미가용 시 id 는 임시 문자열).
export interface NotifItem {
  id: number | string;
  source?: string;
  kind?: string | null;
  title: string;
  subtitle?: string | null;
  body?: string | null;
  workspaceId?: string | null;
  wsName?: string | null;
  cwd?: string | null;
  win?: number | null;
  ts: number;
  read: boolean;
}

export interface WsPrefs {
  order: string[];
  pinned: string[];
  color: Record<string, string>;
  rename: Record<string, string>;
}

// ui_command status.changed 로 수신한 워크스페이스별 작업 상태(에이전트 진행 표시 등) — 휘발성.
export interface WsStatusInfo {
  status: string[];
  progress: number | null;
  logTail: string | null;
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
  newWsOpen: boolean;        // '+' 새 워크스페이스 생성 시트(방식 선택) 열림 여부
  settingsOpen: boolean;     // 내 정보 = PC 미러 설정 모달(일반/계정/정보) 열림 여부
  wsStatus: Record<string, WsStatusInfo>; // ui_command status.changed 수신 상태(wsId 키)

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
  openNewWs: () => void;     // '+' 생성 방식 선택 시트 열기
  closeNewWs: () => void;
  openSettings: () => void;  // 내 정보(PC 미러 설정 모달) 열기
  closeSettings: () => void;
  applyWsVisualOrder: (ids: string[]) => void;
  moveWs: (id: string, dir: 'up' | 'down' | 'top') => void;
  togglePinWs: (id: string) => void;
  setWsColor: (id: string, color: string) => void;
  renameWs: (id: string, name: string) => void;

  // pane
  splitPane: (paneId: string, dir: 'h' | 'v', kind: T.PaneKind, opts?: T.LeafOpts) => void;
  splitFocused: (dir: 'h' | 'v', kind: T.PaneKind, opts?: T.LeafOpts) => void;
  closePane: (wsId: string, paneId: string, opts?: { keepTerminals?: boolean }) => void;
  closeFocused: () => void;
  focusPane: (paneId: string) => void;
  setRatio: (branchPath: Array<'first' | 'second'>, ratio: number) => void;
  replaceLayout: (wsId: string, layout: TilingNode, focusId?: string | null) => void;
  setTerminalTabs: (paneId: string, tabs: T.TerminalTab[], active: number) => void;
  movePane: (srcId: string, targetId: string, side: T.Side) => void;
  insertLeaf: (targetId: string, side: Exclude<T.Side, null>, leafNode: T.Leaf) => void;
  patchLeaf: (paneId: string, patch: Record<string, unknown>) => void;

  // ui_command 브리지용
  reconcilePoolNow: () => void; // 활성 워크스페이스 풀 리컨실 즉시 트리거(pool.changed)
  setWsStatusInfo: (wsId: string, info: WsStatusInfo | null) => void; // status.changed 반영(null=해제)

  // 알림 — 서버 동기화(/api/notifications + notif_event 실시간).
  reportNotification: (payload: CreateNotifPayload) => void;
  markNotifRead: (ids: Array<number | string>) => void;
  markAllRead: () => void;
  unreadForWs: (wsId: string) => number;
  markScopeRead: (cwd: string | null | undefined, win: number | null) => void; // (cwd,win) 스코프 읽음 — 사용자가 실제 터미널을 볼 때 호출
  activateNotifTerminal: (wsId: string, preferredWin?: number | null) => void; // 미읽음 알림 터미널을 활성 탭/포커스로(읽음 X)

  // 계정/기기
  loadMe: () => Promise<void>;
  loadDevices: () => Promise<void>;

  // 세션 이어받기
  pullSession: (wsId: string) => Promise<void>;
}

const Ctx = createContext<ShellValue | undefined>(undefined);

const UI_KEY = 'cpt.pcui';

// 풀 리컨실러 — tmux 공유 풀(전 기기 내역의 원천)과 이 기기 레이아웃을 동기화.
//  · 풀에 없는 탭 제거(다른 기기에서 터미널 삭제됨). 빈 터미널 pane 은 leaf 제거(형제 승격).
//  · 레이아웃에 없는 풀 터미널은 포커스(없으면 첫) 터미널 pane 탭으로 편입(다른 기기가 생성).
//  · 탭 제목 = 풀 window 이름("터미널 N") 동기화. 변경 없으면 rt 동일 참조 반환(리렌더 방지).
function reconcilePool(rt: WsRuntime, wins: { index: number; name: string; command?: string }[]): WsRuntime {
  if (!rt.layout) return rt;
  // 빈 목록은 신뢰하지 않는다 — 풀 미생성 초기이거나 일시 오류일 수 있고, "전부 삭제됨" 오판은
  //  레이아웃 전멸(pane 교체→스트림 사망)로 이어진다. 풀이 진짜 비었으면 스트림/ensureView 가 자가치유.
  if (!wins.length) return rt;
  // 'new'(풀 window 확보 진행 중) 탭이 있으면 이번 틱 스킵 — 방금 만든 터미널의 중복 편입 방지.
  let pending = false;
  T.eachLeaf(rt.layout, (l) => { if (l.kind === 'terminal') { for (const t of l.tabs) if (t.win === 'new') pending = true; } });
  if (pending) return rt;
  const pool = new Map(wins.map((w) => [w.index, w] as const));
  const seen = new Set<number>();
  let changed = false;
  const rec = (node: TilingNode): TilingNode | null => {
    if (T.isLeaf(node)) {
      if (node.kind !== 'terminal') return node;
      const tabs: T.TerminalTab[] = [];
      let act = node.active;
      node.tabs.forEach((t, i) => {
        if (typeof t.win !== 'number') { tabs.push(t); return; }
        const w = pool.get(t.win);
        if (!w) { changed = true; if (i < node.active) act -= 1; return; }
        seen.add(t.win);
        // 이름 + 실행 중 명령(pane_current_command) 동기화 — 탭 라벨 부제("터미널 1 · claude")용.
        const cmd = (w.command || '').trim();
        if ((w.name && t.title !== w.name) || (t.cmd || '') !== cmd) {
          changed = true;
          tabs.push({ ...t, title: w.name || t.title, cmd });
          return;
        }
        tabs.push(t);
      });
      if (!tabs.length) { changed = true; return null; }
      act = Math.max(0, Math.min(tabs.length - 1, act));
      if (tabs.length === node.tabs.length && act === node.active && tabs.every((t, i) => t === node.tabs[i])) return node;
      return { ...node, tabs, active: act };
    }
    const first = rec(node.first);
    const second = rec(node.second);
    if (first === node.first && second === node.second) return node;
    if (!first && !second) return null;
    if (!first) return second;
    if (!second) return first;
    return { ...node, first, second };
  };
  let layout = rec(rt.layout);
  const missing = wins.filter((w) => !seen.has(w.index));
  if (missing.length) {
    changed = true;
    const tabsToAdd: T.TerminalTab[] = missing.map((w) => ({ win: w.index, title: w.name || '' }));
    if (!layout) {
      layout = { id: T.newPaneId(), kind: 'terminal', tabs: tabsToAdd, active: 0 } as Leaf;
    } else {
      let targetId: string | null = null;
      const focusLeaf = rt.focusId ? T.findLeaf(layout, rt.focusId) : null;
      if (focusLeaf && focusLeaf.kind === 'terminal') targetId = focusLeaf.id;
      if (!targetId) T.eachLeaf(layout, (l) => { if (!targetId && l.kind === 'terminal') targetId = l.id; });
      if (targetId) {
        layout = T.mapLeaf(layout, targetId, (l) => (l.kind === 'terminal' ? { ...l, tabs: [...l.tabs, ...tabsToAdd] } : l));
      } else {
        // 터미널 pane 이 하나도 없으면(전부 IDE/프리뷰) 첫 leaf 우측 분할로 편입.
        const anchor = T.firstLeafId(layout);
        const leafNode: Leaf = { id: T.newPaneId(), kind: 'terminal', tabs: tabsToAdd, active: 0 };
        if (anchor) layout = T.split(layout, anchor, 'h', leafNode).tree;
      }
    }
  }
  if (!changed) return rt;
  if (!layout) {
    const leafNode = T.leaf('terminal', { win: 'new' });
    return { ...rt, layout: leafNode, focusId: leafNode.id };
  }
  const focusId = rt.focusId && T.findLeaf(layout, rt.focusId) ? rt.focusId : T.firstLeafId(layout);
  return { ...rt, layout, focusId };
}

// 서버 알림 행 → 로컬 항목 변환.
function rowToItem(row: NotifRow): NotifItem {
  return {
    id: row.id,
    source: row.source,
    kind: row.kind ?? null,
    title: row.title || '',
    subtitle: row.subtitle ?? null,
    body: row.body ?? null,
    workspaceId: row.workspaceId ?? null,
    wsName: row.wsName ?? null,
    cwd: row.cwd ?? null,
    win: typeof row.win === 'number' ? row.win : null,
    ts: row.createdAt ? (Date.parse(row.createdAt) || Date.now()) : Date.now(),
    read: !!row.readAt,
  };
}

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

function buildSessionManifest(rt: WsRuntime | undefined, device?: string): any {
  if (!rt || !rt.layout) return null;
  // device = 발신 기기 키. pull 하는 쪽이 "내가 푸시한 것"인지 판단해 win 재사용/리셋을 가른다.
  return { version: 1, device: device || '', surfaces: leafSurfaces(rt.layout), layout: rt.layout, focusId: rt.focusId || null };
}

export const WorkspaceShellProvider = ({ children }: { children: ReactNode }) => {
  const { isLoggedIn, loading: authLoading, logout } = useAuth();

  const [workspaces, setWorkspaces] = useState<WorkspaceMeta[]>([]);
  const [wsError, setWsError] = useState<string | null>(null);
  const [activeWsId, setActiveWsId] = useState<string | null>(null);
  const [runtimes, setRuntimes] = useState<Record<string, WsRuntime>>({});
  const [notifications, setNotifications] = useState<NotifItem[]>([]);
  const [me, setMe] = useState<any | null>(null);
  const [devices, setDevices] = useState<AccountDevice[]>([]);
  const [currentDeviceId, setCurrentDeviceId] = useState<number | string | null>(null);
  const [creatingWs, setCreatingWs] = useState(false);
  const [newWsOpen, setNewWsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [wsPrefs, setWsPrefs] = useState<WsPrefs>({ order: [], pinned: [], color: {}, rename: {} });
  const [loading, setLoading] = useState(true);
  const [wsStatus, setWsStatus] = useState<Record<string, WsStatusInfo>>({});

  // 콜백에서 최신 상태 참조(stale 클로저 방지).
  const runtimesRef = useRef(runtimes); runtimesRef.current = runtimes;
  const activeWsIdRef = useRef(activeWsId); activeWsIdRef.current = activeWsId;
  const wsPrefsRef = useRef(wsPrefs); wsPrefsRef.current = wsPrefs;
  const workspacesRef = useRef(workspaces); workspacesRef.current = workspaces;
  const notificationsRef = useRef(notifications); notificationsRef.current = notifications;

  // 영속화(pc-ui.json 대응) 디바운스.
  const uiSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restoredRef = useRef(false);
  const schedulePersistUi = useCallback(() => {
    if (uiSaveTimer.current) clearTimeout(uiSaveTimer.current);
    uiSaveTimer.current = setTimeout(() => {
      const ws: Record<string, any> = {};
      for (const [id, rt] of Object.entries(runtimesRef.current)) ws[id] = { layout: rt.layout, focusId: rt.focusId };
      // v: 3 = 공유 풀 아키텍처 이후 저장본(win=풀 인덱스, 복원 시 재사용 가능 표식).
      const payload = { v: 3, activeWsId: activeWsIdRef.current, ws, wsPrefs: wsPrefsRef.current };
      AsyncStorage.setItem(UI_KEY, JSON.stringify(payload)).catch(() => {});
    }, 600);
  }, []);

  // 이 기기의 세션/매니페스트 키 — 최초 1회 로드(ms 단위, 이후 ref 로 동기 참조).
  const clientKeyRef = useRef('');
  useEffect(() => { daemonService.getClientKey().then((k) => { clientKeyRef.current = k; }).catch(() => {}); }, []);

  // 세션 매니페스트 동기화 폐지(공유 풀 모델) — 배치는 기기별(로컬 영속만), 터미널 내역은
  //  tmux 풀이 원천이라 리컨실러가 실시간 동기화한다. (레이아웃 원격 push/pull 은 pane 을
  //  갈아치우며 스트림 킥/복제 혼란을 만들던 주범이라 제거.)
  const scheduleSessionPush = useCallback(() => { /* no-op */ }, []);

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
      // 'new' = 풀에 새 터미널 요청(TerminalPane effect1 이 terminal.new 로 확보, 이름은 데몬이 부여).
      const layout = T.leaf('terminal', { win: 'new' });
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
      // 새 터미널 pane = 풀에 새 터미널('new' → terminal.new 가 생성, 전 기기에 나타남).
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

  const closePane = useCallback((wsId: string, paneId: string, opts?: { keepTerminals?: boolean }) => {
    if (!wsId || !paneId) return;
    const rt = runtimesRef.current[wsId];
    const ws = workspacesRef.current.find((x) => x.id === wsId);
    if (rt && !opts?.keepTerminals) {
      const leaf = T.findLeaf(rt.layout, paneId);
      // 터미널 pane 닫기 = 그 탭들의 터미널을 풀에서 완전 삭제(전 기기 공통. 마지막 링크였던 뷰 세션은 자동 소멸).
      //  keepTerminals: 드래그로 탭을 옮긴 뒤의 빈 pane 정리 등 — 풀 터미널은 살린다.
      if (leaf && leaf.kind === 'terminal' && ws) {
        for (const t of leaf.tabs || []) {
          if (typeof t.win === 'number') daemonService.closeTerminal(ws.localPath || '', t.win, ws.hostDeviceId ?? null).catch(() => {});
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

  // (cwd,win) 스코프 읽음 — 로컬 캐시에 해당 미읽음이 있을 때만 서버 호출(낙관적 즉시 반영).
  //  win=null 은 ws-수준(해당 cwd 의 pane 미지정 알림) 읽음.
  const maybeMarkScopeRead = useCallback((cwd: string | null | undefined, win: number | null) => {
    if (!cwd) return;
    const hit = notificationsRef.current.filter((n) => !n.read && n.cwd === cwd && (win === null ? n.win == null : n.win === win));
    if (!hit.length) return;
    const ids = new Set(hit.map((n) => n.id));
    setNotifications((prev) => prev.map((n) => (ids.has(n.id) ? { ...n, read: true } : n)));
    notificationService.markRead({ scope: { cwd, win } }).catch(() => { /* 서버 미가용 — 로컬 반영 유지 */ });
  }, []);

  // 미읽음 알림이 귀속된 터미널(win)을 그 pane 의 활성 탭 + 포커스로 올린다(읽음 처리는 안 함).
  //  워크스페이스 클릭/딥링크 진입 시 "알림 온 터미널을 잘 보이게" 하는 용도.
  const activateNotifTerminal = useCallback((wsId: string, preferredWin?: number | null) => {
    const ws = workspacesRef.current.find((w) => w.id === wsId);
    const rt = runtimesRef.current[wsId];
    if (!ws?.localPath || !rt) return;
    const unreadWins = new Set(
      notificationsRef.current
        .filter((n) => !n.read && n.cwd === ws.localPath && typeof n.win === 'number')
        .map((n) => n.win as number),
    );
    if (!unreadWins.size) return;
    const target = (typeof preferredWin === 'number' && unreadWins.has(preferredWin)) ? preferredWin : null;
    let hitLeaf: string | null = null;
    let hitTab = -1;
    T.eachLeaf(rt.layout, (l) => {
      if (hitLeaf || l.kind !== 'terminal') return;
      const idx = l.tabs.findIndex((t) => T.isTermTab(t) && typeof t.win === 'number' && (target != null ? t.win === target : unreadWins.has(t.win as number)));
      if (idx >= 0) { hitLeaf = l.id; hitTab = idx; }
    });
    if (!hitLeaf) return;
    updateRuntime(wsId, (rt2) => ({
      ...rt2,
      focusId: hitLeaf!,
      layout: T.mapLeaf(rt2.layout, hitLeaf!, (l) => (l.kind === 'terminal' ? { ...l, active: hitTab } : l)),
    }));
  }, [updateRuntime]);

  const focusPane = useCallback((paneId: string) => {
    const wsId = activeWsIdRef.current;
    if (!wsId) return;
    // pane 포커스는 읽음 트리거가 아니다 — 프로그램적 포커스(워크스페이스/딥링크 활성화)로 알림이
    //  잘못 읽히지 않도록. 읽음은 사용자가 실제로 터미널을 터치(onInteract)하거나 탭을 클릭할 때만.
    // 이미 포커스된 pane 이면 무시 — 불필요한 setRuntimes/persist/session-push 리렌더가
    // 터미널 WebView 를 blur 시켜 키보드가 즉시 내려가 입력이 안 되는 문제를 유발했다.
    if (runtimesRef.current[wsId]?.focusId === paneId) return;
    updateRuntime(wsId, (rt) => ({ ...rt, focusId: paneId }));
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
    // 탭 전환 자체는 읽음이 아니다(프로그램적 활성화 포함). 읽음은 사용자가 터미널을 실제로
    //  터치(onInteract)하거나 탭을 직접 클릭할 때 markScopeRead 로 별도 처리한다.
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

  // 준비된 leaf 를 target 의 방향 분할로 삽입(탭 드래그 → 새 분할 pane. win 이 이미 확정된 leaf 를 넣는다).
  const insertLeaf = useCallback((targetId: string, side: Exclude<T.Side, null>, leafNode: T.Leaf) => {
    const wsId = activeWsIdRef.current;
    if (!wsId || !targetId) return;
    updateRuntime(wsId, (rt) => {
      const dir: 'h' | 'v' = side === 'left' || side === 'right' ? 'h' : 'v';
      const before = side === 'left' || side === 'top';
      const r = T.split(rt.layout, targetId, dir, leafNode, before);
      return { ...rt, layout: r.tree, focusId: leafNode.id };
    });
  }, [updateRuntime]);

  // ── 세션 이어받기 폐지(공유 풀 모델) — 배치는 기기별. 터미널 내역은 풀 리컨실러가 동기화. ──
  const pullSession = useCallback(async (_wsId: string) => { /* no-op */ }, []);

  // ── 호스트(데몬) 온/오프라인 라이브 반영 ──
  //  근원 2개: ① back runner_status 팬아웃(접속/종료 즉시) ② 풀 리컨실러의 RPC 실패/성공(폴백 자가치유).
  //  알림 UI 는 pane 그리드의 차단 오버레이 하나로 통일(중복 알럿 금지 — 사용자 확정 스펙).
  const applyHostOnline = useCallback((deviceId: number | null, wsIdHint: string | null, online: boolean, _deviceName?: string) => {
    const match = (w: WorkspaceMeta) => (deviceId != null ? w.hostDeviceId === deviceId : w.id === wsIdHint);
    if (!workspacesRef.current.some((w) => match(w) && (w.hostOnline ?? true) !== online)) return;
    setWorkspaces((cur) => cur.map((w) => (match(w) && (w.hostOnline ?? true) !== online ? { ...w, hostOnline: online } : w)));
  }, []);

  // ── ui_command 브리지 지원 ──
  // status.changed 수신 상태 반영(휘발성 — 영속화 없음). null = 상태 해제.
  const setWsStatusInfo = useCallback((wsId: string, info: WsStatusInfo | null) => {
    setWsStatus((prev) => {
      if (!info) {
        if (!prev[wsId]) return prev;
        const next = { ...prev }; delete next[wsId]; return next;
      }
      return { ...prev, [wsId]: info };
    });
  }, []);
  // 풀 리컨실 즉시 트리거(pool.changed) — 주기 폴링 effect 의 tick 을 ref 로 노출해 호출.
  const poolTickRef = useRef<(() => void) | null>(null);
  const reconcilePoolNow = useCallback(() => { poolTickRef.current?.(); }, []);

  const setActive = useCallback((id: string | null) => {
    setActiveWsId(id);
    if (id) {
      // 멀티 PC: 터미널/fs/프리뷰는 이제 호출마다 hostDeviceId 를 명시해 직결(기기 간 활성 뺏기 없음).
      //  이 핸드오프는 아직 활성 러너를 따르는 나머지 흐름(에이전트 채팅·ws/sync RPC)용으로만 유지 —
      //  그 흐름들도 명시 지정으로 옮기면 제거 가능. 호스트 미귀속/전환 실패는 기존 동작(fire-and-forget).
      const w = workspacesRef.current.find((x) => x.id === id);
      if (w && w.compute === 'local' && w.hostDeviceId != null) {
        daemonService.getStatus().then((st) => {
          const target = (st.runners || []).find((r) => r.deviceId === w.hostDeviceId);
          if (target && !target.active) return daemonService.activateRunner(w.hostDeviceId as number).then(() => undefined);
          return undefined;
        }).catch(() => { /* 호스트 미연결 — 오프라인 사본 그대로 표시 */ });
      }
      ensureRuntime(id); void pullSession(id);
      // 워크스페이스 진입은 읽음 처리하지 않는다 — 사용자가 실제 그 터미널을 볼 때까지 알림을 유지.
      //  대신 진입 시 미읽음 알림이 있으면 그 터미널을 활성 탭/포커스로 올려 눈에 띄게 한다(activateNotifTerminal).
    }
    afterChange();
  }, [ensureRuntime, pullSession, afterChange]);

  // runner_status(호스트 데몬 온/오프라인) 실시간 구독 — notif WSS/SSE 채널 동승 프레임.
  useEffect(() => {
    if (!isLoggedIn) return;
    notificationService.setRunnerStatusListener((e) => applyHostOnline(e.deviceId, null, e.online, e.deviceName));
    return () => notificationService.setRunnerStatusListener(null);
  }, [isLoggedIn, applyHostOnline]);

  // account_deleted(다른 기기에서 회원 탈퇴) — 이 기기도 즉시 로컬 로그아웃 → 로그인 화면.
  const logoutRef = useRef(logout); logoutRef.current = logout;
  useEffect(() => {
    if (!isLoggedIn) return;
    notificationService.setAccountDeletedListener(() => { void logoutRef.current(); });
    return () => notificationService.setAccountDeletedListener(null);
  }, [isLoggedIn]);

  // ── 알림(서버 동기화) ──
  // 새 알림을 서버에 적재(fire-and-forget) — 목록 반영은 서버 echo(notif_event new)가 담당하지만,
  //  echo 유실 대비 성공 응답으로도 dedupe 삽입. 실패(오프라인) 시 로컬 임시 항목 폴백.
  const reportNotification = useCallback((payload: CreateNotifPayload) => {
    notificationService.createNotification(payload)
      .then((row) => {
        const item = rowToItem(row);
        setNotifications((prev) => (prev.some((n) => n.id === item.id) ? prev : [item, ...prev].slice(0, 100)));
      })
      .catch(() => {
        const item: NotifItem = {
          id: 'local-' + Date.now() + Math.random().toString(36).slice(2, 6),
          ts: Date.now(), read: false,
          source: payload.source, kind: payload.kind ?? null,
          title: payload.title, subtitle: payload.subtitle ?? null, body: payload.body ?? null,
          workspaceId: payload.workspaceId ?? null, wsName: payload.wsName ?? null,
          cwd: payload.cwd ?? null, win: typeof payload.win === 'number' ? payload.win : null,
        };
        setNotifications((prev) => [item, ...prev].slice(0, 100));
      });
  }, []);

  // 지정 알림 읽음(알림 클릭 등) — 낙관적 즉시 반영 + 서버 반영(로컬 임시 id 는 서버 스킵).
  const markNotifRead = useCallback((ids: Array<number | string>) => {
    if (!ids.length) return;
    const set = new Set(ids);
    setNotifications((prev) => prev.map((n) => (set.has(n.id) && !n.read ? { ...n, read: true } : n)));
    const numeric = ids.filter((x): x is number => typeof x === 'number');
    if (numeric.length) notificationService.markRead({ ids: numeric }).catch(() => { /* 서버 미가용 — 로컬 반영 유지 */ });
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => (n.read ? n : { ...n, read: true })));
    notificationService.markAllRead().catch(() => { /* 서버 미가용 — 로컬 반영 유지 */ });
  }, []);

  // 워크스페이스별 미읽음 — workspaceId 일치 또는 cwd=localPath 매칭(터미널 OSC 알림).
  const unreadForWs = useCallback((wsId: string) => {
    const w = workspacesRef.current.find((x) => x.id === wsId);
    if (!w) return 0;
    return notifications.filter((n) => !n.read && (n.workspaceId === w.id || (!!w.localPath && n.cwd === w.localPath))).length;
  }, [notifications]);

  // 서버 알림 로드(로그인/포그라운드 복귀) — 실패 시 기존(로컬) 목록 유지.
  const loadNotifications = useCallback(async () => {
    try {
      const r = await notificationService.listNotifications({ limit: 50 });
      setNotifications(r.notifications.map(rowToItem));
    } catch (_) { /* 서버 미가용 */ }
  }, []);

  // 초기 로드 + notif_event 실시간 구독(new→prepend dedupe, read→읽음 반영) + active 복귀 재로드.
  useEffect(() => {
    if (!isLoggedIn) { setNotifications([]); return; }
    void loadNotifications();
    const unsub = notificationService.subscribeNotifEvents((ev) => {
      if (ev.kind === 'new') {
        const item = rowToItem(ev.notification);
        setNotifications((prev) => {
          const exists = prev.some((n) => n.id === item.id);
          // 소리/햅틱은 "지금 보고 있는 present 기기"(서버가 alertClientKey 로 지정)에서만 — 나머지는 뱃지만.
          if (!exists && !item.read && ev.alertForMe && AppState.currentState === 'active') {
            try { playNotifSound(); } catch { /* noop */ }
            try { haptic.success(); } catch { /* noop */ }
          }
          return [item, ...prev.filter((n) => n.id !== item.id)].slice(0, 100);
        });
      } else if (ev.kind === 'read') {
        const ids = new Set<number>(ev.ids);
        setNotifications((prev) => prev.map((n) => (typeof n.id === 'number' && ids.has(n.id) && !n.read ? { ...n, read: true } : n)));
      }
      // ui_command 프레임은 같은 WSS 로 동승 — UiCommandBridge 가 등록한 리스너로 전달.
    }, undefined, notificationService.dispatchUiCommand);
    const sub = AppState.addEventListener('change', (st) => {
      // present 신호 — 포그라운드 복귀 시 알림 재로드 + 이 기기를 present 로, 백그라운드 전환 시 not-present 로.
      notificationService.sendPresence(st === 'active');
      if (st === 'active') void loadNotifications();
    });
    return () => { unsub(); sub.remove(); };
  }, [isLoggedIn, loadNotifications]);

  // ── 알림 푸시 딥링크(codingpt://notif/<id>?ws=&cwd=&win=) 소비 — 앱 종료/백그라운드에서 푸시 탭 시
  //  해당 워크스페이스를 열고 그 터미널(win)을 활성/포커스한다. 워크스페이스 목록이 아직이면 보관 후 로드되면 반영.
  const pendingNotifNavRef = useRef<{ ws: string | null; cwd: string | null; win: number | null } | null>(null);
  const applyNotifNav = useCallback((p: { ws: string | null; cwd: string | null; win: number | null }) => {
    const w = workspacesRef.current.find((x) => x.id === p.ws || (!!p.cwd && x.localPath === p.cwd));
    if (!w) { pendingNotifNavRef.current = p; return false; }
    pendingNotifNavRef.current = null;
    setActive(w.id);
    // 레이아웃 준비 후 그 win 터미널을 활성 탭+포커스(읽음은 사용자가 실제 터치할 때).
    setTimeout(() => activateNotifTerminal(w.id, typeof p.win === 'number' ? p.win : null), 500);
    return true;
  }, [setActive, activateNotifTerminal]);
  useEffect(() => {
    if (!isLoggedIn) return;
    const handle = (link: string) => {
      const p = pushService.parseNotifDeeplink(link);
      if (p) applyNotifNav(p);
    };
    const pend = pushService.takePendingPushDeeplink('notif');
    if (pend) handle(pend);
    return pushService.addPushDeeplinkListener(handle);
  }, [isLoggedIn, applyNotifNav]);
  // 워크스페이스 목록이 로드되면 보관해 둔 알림 내비게이션을 재시도(콜드스타트 타이밍).
  useEffect(() => {
    if (pendingNotifNavRef.current && workspaces.length) applyNotifNav(pendingNotifNavRef.current);
  }, [workspaces, applyNotifNav]);

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

  // ── 실행 중 포트 폴링(활성 로컬 워크스페이스) ──
  //  PC 사이드바처럼 "그 워크스페이스 폴더 안에서 실제로 도는 dev 서버 포트"만 감지해 표시.
  //  ports 는 휘발성 → setRuntimes 직접 갱신(영속화/세션푸시 없음). 15초 주기 + 활성 전환 시 즉시.
  useEffect(() => {
    if (!isLoggedIn) return;
    let alive = true;
    const tick = async () => {
      const wsId = activeWsIdRef.current;
      if (!wsId) return;
      const ws = workspacesRef.current.find((w) => w.id === wsId);
      if (!ws || !isLocal(ws)) return;
      try {
        const ports = await daemonService.previewPorts(ws.localPath || '', ws.hostDeviceId ?? null);
        if (!alive) return;
        setRuntimes((prev) => {
          const cur = prev[wsId];
          if (!cur) return prev;
          if ((cur.ports || []).join(',') === ports.join(',')) return prev; // 변화 없음
          return { ...prev, [wsId]: { ...cur, ports } };
        });
      } catch (_) { /* 오프라인 */ }
    };
    void tick();
    const iv = setInterval(tick, 15000);
    return () => { alive = false; clearInterval(iv); };
  }, [isLoggedIn, isLocal, activeWsId]);

  // ── 풀 리컨실러 — 활성 로컬 워크스페이스의 공유 터미널 풀을 주기 폴링해 레이아웃과 동기화 ──
  //  다른 기기에서 만든/삭제한 터미널이 내 화면에 자동 반영(내역 공유). 배치는 내 기기 로컬.
  useEffect(() => {
    if (!isLoggedIn || !activeWsId) return;
    const wsId = activeWsId;
    let alive = true;
    const tick = async () => {
      const ws = workspacesRef.current.find((w) => w.id === wsId);
      if (!ws || !isLocal(ws)) return;
      try {
        const mut0 = daemonService.poolMutationCount();
        const wins = await daemonService.listTerminals(ws.localPath || '', ws.hostDeviceId ?? null);
        if (!alive) return;
        // RPC 성공 = 호스트 살아있음 — runner_status 를 놓쳤어도 폴링이 온라인 복구를 자가치유.
        if ((ws.hostOnline ?? true) === false) applyHostOnline(ws.hostDeviceId ?? null, ws.id, true);
        // 조회 중 이 기기가 풀을 변이(생성/삭제)했으면 이 스냅샷은 스테일 — 방금 만든 탭을
        //  "풀에 없음"으로 오판해 지우는 레이스를 차단. 다음 틱이 최신 상태로 동기화한다.
        if (daemonService.poolMutationCount() !== mut0) return;
        const cur = runtimesRef.current[wsId];
        if (!cur) return;
        const next = reconcilePool(cur, wins);
        if (next !== cur) updateRuntime(wsId, () => next);
      } catch (e) {
        // 데몬 오프라인(409 통일 메시지) 감지 — runner_status 팬아웃을 못 받은 경우의 폴백.
        if (alive && /데몬이 연결|DAEMON_OFFLINE/.test(String((e as Error)?.message || e))) {
          applyHostOnline(ws.hostDeviceId ?? null, ws.id, false, ws.hostName || undefined);
        }
      }
    };
    const t0 = setTimeout(tick, 1500); // 초기 pane 마운트('new' 확보) 뒤에 첫 동기화
    const iv = setInterval(tick, 5000);
    poolTickRef.current = () => { void tick(); }; // ui_command pool.changed → 즉시 리컨실
    return () => {
      alive = false; clearTimeout(t0); clearInterval(iv);
      poolTickRef.current = null;
    };
  }, [isLoggedIn, isLocal, activeWsId, updateRuntime, applyHostOnline]);

  // ── 복원(AsyncStorage) ──
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(UI_KEY);
        if (raw) {
          const saved = JSON.parse(raw);
          // v3 이전 저장본 — win 이 공유 풀 인덱스가 아니라 무효. 레이아웃 복원을 건너뛰고(1회 초기화)
          //  풀 리컨실러가 실제 터미널들을 새 레이아웃에 편입하게 한다.
          if (saved.v === 3 && saved.ws && typeof saved.ws === 'object') {
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
          if (saved.activeWsId) { setActiveWsId(saved.activeWsId); ensureRuntime(saved.activeWsId); }
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

  const openNewWs = useCallback(() => setNewWsOpen(true), []);
  const closeNewWs = useCallback(() => setNewWsOpen(false), []);
  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);

  const value: ShellValue = useMemo(() => ({
    workspaces, wsError, activeWsId, runtimes, notifications, me, devices, currentDeviceId, creatingWs, wsPrefs, loading, newWsOpen, settingsOpen, wsStatus,
    activeWs, wsRuntime, isLocal, sortedWorkspaces, wsDisplayName, wsColor, wsPinned,
    loadWorkspaces, setActive, openNewWs, closeNewWs, openSettings, closeSettings, applyWsVisualOrder, moveWs, togglePinWs, setWsColor, renameWs,
    splitPane, splitFocused, closePane, closeFocused, focusPane, setRatio, replaceLayout, setTerminalTabs, movePane, insertLeaf, patchLeaf,
    reconcilePoolNow, setWsStatusInfo,
    reportNotification, markNotifRead, markAllRead, unreadForWs, markScopeRead: maybeMarkScopeRead, activateNotifTerminal, loadMe, loadDevices, pullSession,
  }), [
    workspaces, wsError, activeWsId, runtimes, notifications, me, devices, currentDeviceId, creatingWs, wsPrefs, loading, newWsOpen, settingsOpen, wsStatus,
    activeWs, wsRuntime, isLocal, sortedWorkspaces, wsDisplayName, wsColor, wsPinned,
    loadWorkspaces, setActive, openNewWs, closeNewWs, openSettings, closeSettings, applyWsVisualOrder, moveWs, togglePinWs, setWsColor, renameWs,
    splitPane, splitFocused, closePane, closeFocused, focusPane, setRatio, replaceLayout, setTerminalTabs, movePane, insertLeaf, patchLeaf,
    reconcilePoolNow, setWsStatusInfo,
    reportNotification, markNotifRead, markAllRead, unreadForWs, maybeMarkScopeRead, activateNotifTerminal, loadMe, loadDevices, pullSession,
  ]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export const useWorkspaceShell = (): ShellValue => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useWorkspaceShell must be used within WorkspaceShellProvider');
  return ctx;
};
