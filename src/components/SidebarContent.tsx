import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { View, Text, Pressable, ScrollView, RefreshControl, Modal, Alert, LayoutAnimation, Platform, UIManager } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, FadeIn } from 'react-native-reanimated';
import KeyTextInput from './keyboard/KeyTextInput';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  SidebarSimple, Bell, Plus, DotsThree, Gear, Laptop,
  PushPin, PencilSimple, Palette, ArrowUp, ArrowDown, ArrowLineUp, X, Trash, ListChecks,
  CaretRight, Folder, GitBranch, TerminalWindow, Check, ArrowsClockwise, Sun, SlidersHorizontal, AppleLogo, LinuxLogo,
  TreeStructure,
} from 'phosphor-react-native';
import { v2 } from '../theme/v2Tokens';
import { useDrawer } from '../contexts/DrawerContext';
import { useMyInfo } from '../contexts/MyInfoContext';
import { useUser } from '../contexts/UserContext';
import { useResponsive } from '../hooks/useResponsive';
import { useDaemonStatus } from '../hooks/useDaemonStatus';
import { useWorkspaceShell } from '../contexts/WorkspaceShellContext';
import { openNotifPanel } from './NotificationsPanel';
import { showAppAlert } from './AppAlert';
import { collapseKeyAssist } from './keyboard/KeyAssist';
import { noteModalClosing } from './modalLayer';
import workspaceService, { WorkspaceMeta } from '../services/workspaceService';
import lanLink from '../services/lanLink';
import { haptic } from '../animations/haptics';
import { PressableRow, IconButton, SectionHeader } from './ui';
import * as i18n from '../i18n/index.ts';
import { openTasksDashboard, openNewTask, closeTasksDashboard, subscribeTasksUi, getTasksUi } from '../workspace/tasks/tasksUi';
import { scopeToHost, needsInputByHost } from '../workspace/tasks/tasksModel';
import { useTasksModel, getBucket } from '../workspace/tasks/useTasks';
import { buildSidebarTasks, type SidebarGroup, type SidebarTask, type SidebarRun, type SidebarDot } from '../workspace/tasks/sidebarTasks';
import { openTaskTerminal } from '../workspace/tasks/tasksUi';
import { StateDot, type Tone } from '../workspace/tasks/TaskCard';
import AgentLogo from '../workspace/AgentLogo';
import { agentDisplayName } from '../workspace/chat/composer';
import { useOrchSnapshot } from '../workspace/orch/useOrch';
import { openOrchSheet } from '../workspace/orch/orchUi';
import { runsForCwd, noteFor, visibleWorkers, attentionCount, sessionTree, worktreeGroups, inWorktree, shortAgo, type SessionRow, type WorkerRow } from '../workspace/orch/orchModel';
import AgentGlyph from '../workspace/orch/AgentGlyph';
import { openIssues, closeIssues, useIssuesOpen } from '../workspace/issues/issuesUi';
import { ORCH_TEXT, wsStatusKey } from '../text/orch';
import { hostSupportsOrch, type OrchRun } from '../services/orchService';
import * as T from '../workspace/tiling';
import daemonService, { desktopRpc, desktopAgentRpc } from '../services/daemonService';
import { useVm, openVm, closeVmScreen, leaveVm, vmOsOfPath, vmLabel, type VmOs } from '../workspace/vmScope';
import { tx } from '../text';
import { TASKS_TEXT } from '../text/tasks';
import { AUTO_TEXT } from '../text/automations';
import { openAutomations, closeAutomations, subscribeAutomationsUi, getAutomationsUi } from '../workspace/automations/automationsUi';
import { useAutomationsModel, refreshAutoHostIfSupported } from '../workspace/automations/useAutomations';
import { hostSupportsAuto } from '../services/automationService';
import { subscribeHostCaps } from '../services/taskService';
import { isHostAwake, subscribeAwake, getAwakeVersion } from '../services/powerService';
import { openPcSettings } from './PcSettingsSheet';

const C = v2.colors;
const TASKS_TX = tx(TASKS_TEXT);
const ORCH_TX = tx(ORCH_TEXT);
const AUTO_TX = tx(AUTO_TEXT);

// 이 워크스페이스의 호스트로 지금 LAN 직결 중인가(표시 전용). 릴레이는 배지 없음 = 정상.
const lanBadge = (w: WorkspaceMeta): boolean => lanLink.badgeFor(w.hostDeviceId ?? null) !== null;

// ── 워크스페이스 그룹 접힘(agent-tasks-sidebar.md §4) ──
//  AsyncStorage `{ [wsId]: 1 }`(접힌 것만). 메모리 정본(모듈) + 쓰기 비동기 — ACTIVE_DEVICE_KEY 와 같은 패턴.
//  모듈에 두는 이유: 폰 드로어/태블릿 도킹이 SidebarContent 를 다시 마운트해도 첫 프레임부터 같은 모양이어야 한다.
const GROUP_COLLAPSED_KEY = 'cpt.sbGroupCollapsed.v1';
let collapsedMem: Record<string, 1> = {};
let collapsedLoaded: Promise<void> | null = null;
function loadCollapsed(): Promise<void> {
  if (!collapsedLoaded) {
    collapsedLoaded = AsyncStorage.getItem(GROUP_COLLAPSED_KEY)
      .then((raw) => {
        const v = raw ? JSON.parse(raw) : null;
        if (v && typeof v === 'object') collapsedMem = { ...(v as Record<string, 1>), ...collapsedMem };
      })
      .catch(() => {});
  }
  return collapsedLoaded;
}
function saveCollapsed(next: Record<string, 1>) {
  collapsedMem = next;
  AsyncStorage.setItem(GROUP_COLLAPSED_KEY, JSON.stringify(next)).catch(() => {});
}
// Android 구 아키텍처에서 LayoutAnimation 켜기 — 앱 수명 1회(TasksDashboardHost 도 켜지만 사이드바가 먼저 뜰 수 있다).
let layoutAnimEnabled = false;
function enableLayoutAnim() {
  if (layoutAnimEnabled) return;
  layoutAnimEnabled = true;
  if (Platform.OS === 'android') (UIManager as any).setLayoutAnimationEnabledExperimental?.(true);
}
const animateNext = () => LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

// 사이드바 점 → 현황판 StateDot tone(카드와 같은 색 규칙).
const TONE: Record<SidebarDot, Tone> = { warn: 'warn', error: 'error', spin: 'working', none: 'none' };

/** 작업 행 부제 — 상태 원문 + (리뷰 준비면) ` · +a −d`. 구분자만 코드가 붙인다(설계 §6.0 reviewLine). */
function subLine(t: SidebarTask): string {
  const head = TASKS_TX[t.sub.key] as string;
  return t.sub.diff ? `${head} · ${TASKS_TX.diffStat(t.sub.diff.a, t.sub.diff.d)}` : head;
}

// 색상 스와치(PC WS_COLORS 동일).
//  초록은 상태색 success 와 같은 값(#30D158)으로 정합(2026-09-30 디자인 리프레시). 옛 저장값 #34d399 는
//  normWsColor 로 새 값과 같은 스와치로 취급한다(선택 표시·점 색).
const WS_COLORS: Array<{ label: string; value: string }> = [
  { label: '없음', value: '' },
  { label: '빨강', value: '#f87171' },
  { label: '주황', value: '#fb923c' },
  { label: '초록', value: '#30D158' },
  { label: '파랑', value: '#60a5fa' },
  { label: '보라', value: '#a78bfa' },
  { label: '분홍', value: '#f472b6' },
];

const normWsColor = (v: string | null | undefined): string => (String(v || '').toLowerCase() === '#34d399' ? '#30D158' : (v || ''));

// 메뉴 카드 등장 — 150ms 페이드 + scale .98→1(설계 §0.4). 퇴장은 즉시.
const menuEnter = () => {
  'worklet';
  return {
    initialValues: { opacity: 0, transform: [{ scale: 0.98 }] },
    animations: { opacity: withTiming(1, { duration: 150 }), transform: [{ scale: withTiming(1, { duration: 150 }) }] },
  };
};

// 좌측 사이드바 — PC codingpt_pc/src/js/sidebar.js 미러.
//  구조: 상단 컨트롤(토글·알림·+) → 워크스페이스 행(핀/색/이름/호스트 배지) → footer 내 정보.
//  overlay=true(폰)면 이동 후 드로어 닫음. docked(태블릿)면 유지.
export default function SidebarContent({ overlay = false }: { overlay?: boolean }) {
  const { closeDrawer, toggleDocked } = useDrawer();
  const { openSheet } = useMyInfo();
  const { isWide } = useResponsive();
  const { user } = useUser();
  const { localOnline } = useDaemonStatus();
  const S = useWorkspaceShell();

  // LAN 직결 경로 표시 — lanLink 가 경로를 승격/강등할 때만 재랜더(정상 상태는 아무 표시 없음).
  //  ★ 이 값은 호스트 온/오프라인과 **무관**하다: 직결이 안 돼도 릴레이로 정상 동작하므로 배지가
  //    없는 것이 곧 문제가 아니다(오프라인 표시로 오해되지 않게 별도 회색 라벨을 쓴다).
  const [, bumpLanTick] = useState(0);
  React.useEffect(() => lanLink.subscribe(() => bumpLanTick((n) => n + 1)), []);

  const [refreshing, setRefreshing] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [menuWs, setMenuWs] = useState<WorkspaceMeta | null>(null);
  const [pcMenu, setPcMenu] = useState(false); // `내 PC` 섹션의 ⋯ 메뉴(PC 연결하기 / 기기 관리)
  const [wsMenu, setWsMenu] = useState(false); // `워크스페이스` 섹션의 ⋯ 메뉴(워크스페이스 추가)
  const [creating, setCreating] = useState(false);

  const afterNav = useCallback(() => { if (overlay) closeDrawer(); }, [overlay, closeDrawer]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    S.loadWorkspaces().finally(() => setRefreshing(false));
  }, [S]);

  const openWs = useCallback((w: WorkspaceMeta) => {
    haptic.select();
    // 드로어 닫힘을 먼저 시작(2026-08-15 성능 라운드) — 같은 프레임에 트리 마운트(WebView 생성,
    //  네이티브 메인 스레드)가 겹치면 닫힘 애니메이션이 뚝뚝 끊긴다. 한 프레임 양보로 애니메이션이
    //  먼저 출발하게 한다(이미 떠 있는 트리(LRU)는 어차피 전환 비용이 0이라 지연 체감 없음).
    afterNav();
    closeIssues();
    closeTasksDashboard(); // 워크스페이스로 들어간다 = 진행 현황·자동화에서 나간다(장소는 하나)
    closeVmScreen();
    closeAutomations();
    requestAnimationFrame(() => {
      S.setActive(w.id);
      // 워크스페이스 진입은 읽음 처리하지 않고, 미읽음 알림이 있으면 그 터미널을 활성 탭/포커스로 올려 보이게만 한다.
      //  런타임 레이아웃이 준비된 뒤 반영되도록 약간 지연(ensureRuntime/pullSession 후).
      setTimeout(() => S.activateNotifTerminal(w.id), 350);
    });
  }, [S, afterNav]);

  // 워크스페이스 삭제 — 서버 목록(메타)만 지움. 폴더/파일은 절대 건드리지 않는다.
  //  loadWorkspaces 가 활성 ws 소실을 자체 정합화(다른 ws 자동 선택)하므로 여기선 목록 갱신만.
  const deleteWs = useCallback((w: WorkspaceMeta) => {
    workspaceService.deleteWorkspace(w.id)
      .then(() => S.loadWorkspaces())
      .catch((e) => Alert.alert(i18n.t('삭제 실패'), String((e as Error)?.message || e)));
  }, [S]);

  const confirmDelete = useCallback((w: WorkspaceMeta) => {
    setMenuWs(null);
    showAppAlert({
      title: i18n.t('워크스페이스 삭제'),
      message: i18n.t('‘{name}’을(를) 목록에서 삭제할까요? PC의 폴더와 파일은 그대로 유지됩니다.', { name: S.wsDisplayName(w) }),
      buttons: [
        { text: i18n.t('삭제'), style: 'destructive', onPress: () => deleteWs(w) },
        { text: i18n.t('취소'), style: 'cancel' },
      ],
    });
  }, [S, deleteWs]);

  const onSelect = useCallback((w: WorkspaceMeta) => {
    // 유령 워크스페이스(호스트 폴더 소실) — 열지 않고 삭제 안내만.
    if (w.git?.missing) {
      showAppAlert({
        title: i18n.t('폴더를 찾을 수 없습니다'),
        message: `${w.localPath ? `~/${w.localPath}\n` : ''}${i18n.t('폴더가 이동되었거나 삭제된 것 같습니다. 목록에서 삭제해도 폴더/파일에는 영향이 없습니다.')}`,
        buttons: [
          { text: i18n.t('목록에서 삭제'), style: 'destructive', onPress: () => deleteWs(w) },
          { text: i18n.t('취소'), style: 'cancel' },
        ],
      });
      return;
    }
    // ★ 프로젝트 그룹핑 폐기(2026-08-14)로 "켜진 사본으로 갈아타기" 제안도 함께 없앴다 — 사본이라는
    //  개념 자체가 화면에서 사라졌으므로, 꺼진 PC 의 워크스페이스를 누르면 그냥 그것을 연다.
    //  (호스트가 꺼져 있다는 사실은 위 PC 행의 상태점과 이 행의 흐린 표시가 이미 말한다.)
    openWs(w);
  }, [S, openWs, deleteWs]);

  // + 새 워크스페이스 — 생성 방식 선택 시트(내 PC 폴더 선택 / GitHub / 클라우드). 셸 레벨 NewWorkspaceSheet 가 처리.
  const onNewWorkspace = useCallback(() => {
    collapseKeyAssist(); // 시트 오픈 = 키보드/특수키 패널 내림
    if (overlay) closeDrawer();
    S.openNewWs();
  }, [overlay, closeDrawer, S]);

  // 알림 패널은 셸 레벨 NotificationsPanel 로 분리 — 벨은 열기만 한다(점프/읽음 로직도 그쪽).
  const onBell = useCallback(() => { openNotifPanel(); }, []);

  // 내 정보 = PC 미러 설정 모달(일반/계정/정보). 기존 MyInfoSheet 대신 SettingsModal 오픈.
  const openMyInfo = useCallback(() => { collapseKeyAssist(); if (overlay) closeDrawer(); S.openSettings(); }, [overlay, closeDrawer, S]);

  const startRename = useCallback((w: WorkspaceMeta) => {
    setMenuWs(null);
    setRenameText(S.wsDisplayName(w));
    setRenaming(w.id);
  }, [S]);
  const commitRename = useCallback(() => {
    if (renaming) S.renameWs(renaming, renameText);
    setRenaming(null);
  }, [renaming, renameText, S]);

  const nickname = (user as any)?.nickname || (user as any)?.name || i18n.t('코더');
  const email = (user as any)?.email || '';
  const avatar = String(nickname).trim().charAt(0) || i18n.t('코');

  // ── 기기 우선(2026-08-14 사용자 확정 · PC sidebar.js 미러) ────────────────────
  //  옛 구조는 프로젝트(projectId) 묶음 ⊃ 기기별 사본이었다. 사용자 지적: "이해도 안 가고 사용성도
  //  안 좋다". 실제 소유 관계는 반대다 — 워크스페이스는 **그 PC 의 로컬 폴더**다. 그래서 PC 를 먼저
  //  고르고, 고른 PC 의 워크스페이스만 아래에 그린다.
  const devices = S.pcDevices();
  const activeDev = S.resolvedDeviceId();
  // 에이전트 PC(VM) 범위 — VM 을 고르면 아래가 그 VM 의 것(화면·VM 워크스페이스)으로 바뀐다(PC sidebar.js 미러).
  const vm = useVm();
  const [vmImport, setVmImport] = useState(false);   // 가져올 호스트 워크스페이스 고르기
  const [vmBusy, setVmBusy] = useState('');
  const allRows = devices.length ? S.workspacesForDevice(activeDev) : [];
  const rows = allRows.filter((w) => (vmOsOfPath(w.localPath) || '') === (vm.os || ''));
  const tasksOpen = useSyncExternalStore(subscribeTasksUi, () => getTasksUi().open);
  const autoOpen = useSyncExternalStore(subscribeAutomationsUi, () => getAutomationsUi().open);
  useSyncExternalStore(subscribeAwake, getAwakeVersion);
  const issuesOpen = useIssuesOpen();
  const onIssues = useCallback(() => {
    afterNav();
    closeTasksDashboard(); closeAutomations();
    openIssues(); // 토글 아님 — 나가는 길은 워크스페이스 행
  }, [afterNav]);

  // ── 저장소 트리(agent-tasks-sidebar.md) — 현황판 모델을 **한 번만** 계산해 배지·그룹 양쪽에 쓴다 ──
  const SRef = useRef(S); SRef.current = S;
  const shellSlice = useMemo(() => ({ devices: S.devices, approvals: S.approvals, notifications: S.notifications, workspaces: S.workspaces }),
    [S.devices, S.approvals, S.notifications, S.workspaces]);
  const model = useTasksModel(shellSlice);
  const host = Number(activeDev) || 0;
  // 진행 현황 배지 = 고른 PC 의 입력 대기 · PC 행 배지 = 그 PC 의 입력 대기(다른 PC 에서 기다리는 것을 놓치지 않게).
  const scopedNeeds = useMemo(() => (host ? scopeToHost(model, host) : model).counts.needs_input, [model, host]);
  const needsByHost = useMemo(() => needsInputByHost(model), [model]);
  const wsKey = rows.map((w) => `${w.id}\u0001${w.localPath || ''}`).join('\u0002');
  const sbGroups = useMemo(() => buildSidebarTasks({
    host,
    workspaces: rows.map((w) => ({ id: w.id, localPath: w.localPath || '' })),
    tasks: host ? getBucket(host)?.items || [] : [],
    rows: model.rows.map((r) => ({ k: r.k, kind: r.kind, group: r.group, reason: r.reason, run: r.run ? { id: r.run.id } : null, task: r.task ? { id: r.task.id } : null, sortAt: r.activityAt })),
  }).groups, [model, host, wsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // 오케스트레이션 사본(고른 PC) — 묶음·워커 행과 한 줄 메모. 묶음은 기본 펼침(접은 것만 기억, 세션 한정).
  const orch = useOrchSnapshot(host || null);
  const [orchFolded, setOrchFolded] = useState<Set<string>>(() => new Set());
  //  경과 시간("3m") 표시용 — 분 단위로만 다시 그린다.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);
  const toggleOrch = useCallback((runId: string) => {
    haptic.select();
    animateNext();
    setOrchFolded((prev) => { const n = new Set(prev); if (n.has(runId)) n.delete(runId); else n.add(runId); return n; });
  }, []);
  /** 에이전트 행(부모) — 그 터미널/대화로. 터미널이 없고 묶음만 남았으면 묶음 시트. */
  const onOpenSession = useCallback((w: WorkspaceMeta, r: SessionRow) => {
    if (!host) return;
    if (r.chat && r.threadId) { afterNav(); SRef.current.openChatThread(w.id, r.threadId, r.lead || undefined); return; }
    if (r.tid != null) { afterNav(); void openTaskTerminal(() => SRef.current, w.id, r.tid, false); return; }
    if (r.runIds.length) openOrchSheet({ host, runId: r.runIds[0] });
  }, [afterNav, host]);
  /** 그 워커의 작업 폴더(worktree)를 연 워크스페이스·터미널(등록돼 있을 때). */
  const wtTarget = useCallback((c: WorkerRow): { wsId: string; tid: number | null } | null => {
    const ref = c.worker && c.worker.taskRef;
    const t = ref && host ? (getBucket(host)?.items || []).find((it) => it.id === ref.taskId) : null;
    const r = t?.runs.find((it) => it.id === ref.runId);
    return r?.workspaceId ? { wsId: r.workspaceId, tid: r.tid ?? null } : null;
  }, [host]);
  const onOpenWorker = useCallback((w: WorkspaceMeta, c: WorkerRow) => {
    // 답이 필요한 워커는 시트(답하는 자리)로, 나머지는 그 터미널로.
    if (!host) return;
    if (c.needsReply || c.tid == null || c.terminal === 'released') { openOrchSheet({ host, runId: c.runId }); return; }
    if (inWorktree(c)) {
      const tg = wtTarget(c);
      if (tg) { afterNav(); void openTaskTerminal(() => SRef.current, tg.wsId, tg.tid as number, true); } else openOrchSheet({ host, runId: c.runId });
      return;
    }
    afterNav();
    void openTaskTerminal(() => SRef.current, w.id, c.tid, false);
  }, [afterNav, host, wtTarget]);

  // 그룹 접힘(영속) · 팬아웃 펼침(세션 한정)
  const [collapsed, setCollapsed] = useState<Record<string, 1>>(collapsedMem);
  useEffect(() => {
    enableLayoutAnim();
    let alive = true;
    void loadCollapsed().then(() => { if (alive) setCollapsed(collapsedMem); });
    return () => { alive = false; };
  }, []);
  const toggleGroup = useCallback((wsId: string) => {
    haptic.select();
    // 저장본을 읽기 전에 토글하면 빈 메모리로 저장본을 덮고(다른 그룹 접힘 소실), 펼침은 병합에 되돌려진다
    //  → 로드가 끝난 뒤 계산한다(보통 이미 끝나 있어 즉시 해소되는 프라미스).
    void loadCollapsed().then(() => {
      animateNext();
      const next = { ...collapsedMem };
      if (next[wsId]) delete next[wsId]; else next[wsId] = 1;
      saveCollapsed(next);
      setCollapsed(next);
    });
  }, []);
  const [fanOpen, setFanOpen] = useState<Set<string>>(() => new Set());
  const toggleFan = useCallback((taskId: string) => {
    haptic.select();
    animateNext();
    setFanOpen((cur) => { const n = new Set(cur); if (n.has(taskId)) n.delete(taskId); else n.add(taskId); return n; });
  }, []);

  const onAddTask = useCallback((w: WorkspaceMeta, online: boolean) => {
    haptic.select();
    // 호스트 오프라인이면 시트가 조용히 다른 PC·첫 저장소로 바꿔 연다(NewTaskSheet 온라인 러너 필터) —
    //  엉뚱한 저장소에 작업이 만들어지지 않게 열지 않고 알린다(PC 의 `+ 작업` 가드와 같은 규칙).
    if (!online) { showAppAlert({ title: TASKS_TX.hostOffline }); return; }
    if (overlay) closeDrawer();
    const h = Number(w.hostDeviceId ?? activeDev);
    openNewTask({ host: Number.isFinite(h) && h ? h : null, workspaceId: w.id });
  }, [overlay, closeDrawer, activeDev]);
  const onOpenTask = useCallback((t: SidebarTask) => {
    afterNav();
    openTasksDashboard({ taskId: t.taskId, host: host || null });
  }, [afterNav, host]);
  const onOpenRun = useCallback((t: SidebarTask, r: SidebarRun) => {
    afterNav();
    // TaskCard 터미널 버튼과 같은 경로(TasksDashboardHost openTaskTerminal). 워크스페이스 미등록이면 상세로.
    if (r.workspaceId) void openTaskTerminal(() => SRef.current, r.workspaceId, r.tid, true);
    else openTasksDashboard({ taskId: t.taskId, runId: r.runId, host: host || null });
  }, [afterNav, host]);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: C.surface }}>
      {/* ── 상단 컨트롤(토글·알림·+) — main-top 과 동일 높이(44)로 매끄러운 한 줄 헤더 ── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', height: 44, paddingHorizontal: 8, gap: 2, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.surface }}>
        {/* 이 버튼이 보이면 사이드바가 열린 상태 → 채운 아이콘(색이 아니라 채움으로 표현) */}
        <IconButton icon={SidebarSimple} weight="fill" accessibilityLabel={i18n.t('닫기')} onPress={() => (overlay ? closeDrawer() : toggleDocked())} />
        <View>
          <IconButton icon={Bell} accessibilityLabel={i18n.t('알림')} onPress={onBell} />
          {S.notifications.some((n) => !n.read) ? <Badge n={S.notifications.filter((n) => !n.read).length} /> : null}
        </View>
        {/* ★ 상단 + 제거(2026-08-14) — 워크스페이스 추가는 아래 `워크스페이스` 섹션 머리에 산다.
            무엇을 **어느 PC 에** 만드는지가 그 자리에서 드러난다(옛 + 는 매번 PC 를 다시 물었다). */}
        <View style={{ flex: 1 }} />
        {overlay ? (
          <IconButton icon={X} accessibilityLabel={i18n.t('닫기')} onPress={closeDrawer} />
        ) : null}
      </View>

      {/* ── 워크스페이스 목록 ── */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: 12, paddingTop: 2, flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
        alwaysBounceVertical
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.text3} colors={[C.text3]} progressBackgroundColor={C.surface} />}
      >
        {/* ── ① 내 PC ── 새 PC 는 여기서 만들 수 없다(그 PC 에 앱을 깔고 로그인해야 나타난다)
             → + 를 두지 않고 ⋯ 메뉴만 둔다. 누르면 아무것도 못 만드는 + 는 거짓 어포던스다. */}
        <SectionHead title={i18n.t('내 PC')} onMore={() => setPcMenu(true)} />
        {devices.length === 0 ? (
          <Text style={{ color: C.textDim, fontSize: v2.font.size.small, paddingHorizontal: 12, paddingVertical: 10 }}>
            {i18n.t('PC를 연결하세요')}
          </Text>
        ) : devices.map((d) => {
          const sel = String(d.id) === String(activeDev);
          const on = (d as any).online !== false;
          // 미읽음은 그 PC 의 워크스페이스 것을 합산 — 다른 PC 를 보고 있어도 "저기서 뭔가 왔다"를 안다.
          const dUnread = S.workspacesForDevice(d.id).reduce((n, w) => n + S.unreadForWs(w.id), 0);
          return (
            <React.Fragment key={String(d.id)}>
            <PressableRow
              onPress={() => { if (vm.os) { haptic.select(); leaveVm(); } if (!sel) { haptic.select(); closeTasksDashboard(); closeAutomations(); S.setActiveDevice(d.id); } }}
              // ★ 워크스페이스 행과 같은 무게로(2026-08-14 사용자 확정) — PC 는 이제 워크스페이스의
              //   부모라 더 눌리기 쉬워야 한다. h44(PressableRow 기본).
              // ★ 고른 PC 는 배경이 아니라 체크로(2026-09-29) — 선택 워시는 "지금 들어가 있는 곳"
              //  (진행 현황·로컬 행) 하나에만 쓴다. PC 는 장소가 아니라 그 아래 목록의 필터다.
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 8,
                paddingHorizontal: 10, marginBottom: 2,
                opacity: on ? 1 : 0.34, // 오프라인이어도 **고를 수 있다**(뭘 등록해 뒀는지는 봐야 한다)
              }}
            >
              <Laptop size={16} color={sel ? C.text : C.text2} weight="fill" />
              <Text numberOfLines={1} style={{ flex: 1, color: sel ? C.text : C.text2, fontSize: v2.font.size.body, fontWeight: '500', fontFamily: v2.font.sans }}>
                {(d as any).name || i18n.t('내 PC')}
              </Text>
              {/* ★ "이 PC" 라벨 없음(2026-08-14 사용자 확정) — 기기 목록에서 어느 게 지금 이 기기인지는
                  쓸모가 없다. 폰에서 보면 **전부 남의 PC** 라 더더욱. */}
              {/* 깨어 있음(power — runner_status.awake) — 무채색 해 글리프. 상태 표시일 뿐 신호색이 아니다(§6.6). */}
              {on && isHostAwake(Number(d.id)) ? <View accessible accessibilityLabel={AUTO_TX.awakeNow}><Sun size={12} color={C.textDim} /></View> : null}
              {/* 입력 대기(막고 있는 것) = warn 점 6px(§0.6) */}
              {!sel && needsByHost[Number(d.id)] ? <WarnDot /> : null}
              {dUnread ? <CountBadge n={dUnread} /> : null}
              {sel ? <Check size={16} color={C.text2} weight="bold" /> : null}
              {/* ★ 온라인 상태 점은 그리지 않는다(2026-08-14 사용자 확정) — 오프라인은 행 전체가 흐려지는
                  것으로 이미 드러난다. 같은 사실을 점으로 한 번 더 말하면 신호가 아니라 장식이다. */}
            </PressableRow>
            {/* 그 PC 에 만들어 둔 에이전트 PC(VM) — PC 의 하위 항목(2026-10-04 QA). 누르면 그 화면을 연다. */}
            {sel && on ? <VmRows host={Number(d.id)} picked={vm.os} onOpen={(os) => { afterNav(); closeTasksDashboard(); closeAutomations(); openVm(os); }} /> : null}
            </React.Fragment>
          );
        })}

        {/* ── ①-1 고른 PC 의 진행 현황 — PC 안의 **장소**(2026-09-29 시안 확정: 에이전트는 그 PC 에서 돈다).
            예전엔 "내 PC" 위에서 모든 PC 를 합쳐 셌고 누르면 덮는 창이 떴다. 들어가 있으면 선택 배경. */}
        {devices.length ? (
          <>
            <View style={{ height: 1, backgroundColor: C.border, marginHorizontal: 10, marginTop: 6, marginBottom: 4 }} />
            <SectionHead title={vm.os ? vmLabel(vm.os) : String((devices.find((d) => String(d.id) === String(activeDev)) as any)?.name || i18n.t('내 PC'))} />
            {vm.os ? (
              // VM 을 고른 상태 — 화면(그 VM 의 모니터). 진행 현황·자동화는 호스트의 것이라 여기서는 뺀다.
              <PressableRow onPress={() => { haptic.select(); afterNav(); closeTasksDashboard(); closeAutomations(); openVm(vm.os as VmOs); }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, marginBottom: 2, backgroundColor: vm.screen ? C.selected : 'transparent', borderRadius: v2.radius.sm }}>
                <Laptop size={16} color={vm.screen ? C.text : C.text2} />
                <Text numberOfLines={1} style={{ flex: 1, color: vm.screen ? C.text : C.text2, fontSize: v2.font.size.body, fontFamily: v2.font.sans }}>{i18n.t('화면')}</Text>
              </PressableRow>
            ) : (
              <>
            {/* 진행 현황·자동화 행은 뺐다(2026-10-07 — PC 와 같다). 그 자리에 Tasks(이슈) 하나. */}
            {/* 오케스트레이션을 모른다고 확인된 PC(구 데몬·클라우드 러너)에는 행을 두지 않는다 — 눌러도 쓸 수 없는 자리다. */}
            {hostSupportsOrch(host) === false ? null : <PlaceRow icon={ListChecks} label="Tasks" onPress={onIssues} active={issuesOpen} trailing={null} />}
              </>
            )}
          </>
        ) : null}

        {/* ── ② 선택한 PC 의 워크스페이스 ── */}
        {/* ★ [+] 와 ⋯ 을 함께 두지 않는다(2026-08-14 사용자 확정) — 둘 다 "워크스페이스 추가" 하나를
            가리켜서 같은 일을 하는 버튼이 나란히 두 개 있는 꼴이었다. ⋯ 하나로 통일한다. */}
        <SectionHead title={i18n.t('워크스페이스')} onMore={devices.length ? () => (vm.os ? setVmImport(true) : setWsMenu(true)) : undefined} adding={creating || !!vmBusy} />
        {vmBusy ? <Text style={{ color: C.textDim, fontSize: v2.font.size.small, paddingHorizontal: 12, paddingBottom: 6 }}>{vmBusy}</Text> : null}
        {rows.length === 0 ? (
          <Text style={{ color: C.textDim, fontSize: v2.font.size.small, paddingHorizontal: 12, paddingVertical: 14, lineHeight: 19 }}>
            {S.wsError && !S.workspaces.length
              ? i18n.t("목록을 불러오지 못했어요.\n아래로 당겨 새로고침하세요.")
              : vm.os ? i18n.t('⋯ 로 이 PC 의 워크스페이스를 VM 으로 가져오세요') : devices.length ? i18n.t('+ 로 이 PC의 폴더를 추가하세요') : ''}
          </Text>
        ) : (
          rows.map((w) => {
              // 진행 현황에 들어가 있으면 워크스페이스 쪽 선택 표시는 끈다 — 선택 배경은 항상 하나.
              const active = w.id === S.activeWsId && !tasksOpen && !autoOpen && !issuesOpen;
              const local = S.isLocal(w);
              const color = normWsColor(S.wsColor(w.id));
              const pinned = S.wsPinned(w.id);
              const unread = S.unreadForWs(w.id);
              const rt = S.wsRuntime(w.id);
              const st = S.wsStatus[w.id]; // ui_command status.changed 수신 상태(있을 때만 뱃지)
              const online = local ? (w.hostOnline ?? localOnline) : true;
              const isRenaming = renaming === w.id;
              const group: SidebarGroup = sbGroups[w.id] || { wsId: w.id, openCount: 0, needsInput: false, tasks: [] };
              const expanded = !collapsed[w.id];
              const branch = w.git?.branch || '';
              // 오케스트레이션 — 이 폴더에서 코디네이터가 돌리는 묶음들 + 한 줄 메모.
              const oRuns = orch ? (runsForCwd(orch, w.localPath || '') as OrchRun[]) : [];
              const oWorkers = oRuns.reduce((n, r) => n + visibleWorkers(r).filter((x) => x.terminal !== 'released').length, 0);
              const oAttn = orch ? attentionCount(orch, w.localPath || '') : 0;
              const oNote = orch ? noteFor(orch, w.localPath || '') : null;
              const oNoteSt = oNote ? wsStatusKey(oNote.status) : null;
              //  에이전트 행 트리(그 폴더에서 도는 에이전트 + 맡은 워커) · 작업 폴더(브랜치) 묶음 — PC 와 같은 구조.
              const oTree = orch ? sessionTree(orch, w.localPath || '') : [];
              const oTrees = worktreeGroups(oTree);
              const oOwned = new Set<string>();
              for (const r of oRuns) for (const x of r.workers || []) if (x.taskRef?.taskId) oOwned.add(x.taskRef.taskId);
              return (
                // 그룹 = 머리(폴더) + 자식(로컬 행 · 열린 작업 행). 오프라인이면 그룹 통째로 흐리게.
                <View key={w.id} style={{ opacity: online ? 1 : 0.34, marginBottom: 2 }}>
                <PressableRow
                  onPress={() => (isRenaming ? undefined : toggleGroup(w.id))}
                  onLongPress={() => { haptic.select(); setMenuWs(w); }}
                  delayLongPress={300}
                  accessibilityState={{ expanded }}
                  // ★ 머리는 선택 워시를 갖지 않는다 — 활성은 "들어간 곳"인 로컬 행이 갖는다(명세 §3).
                  style={{ paddingHorizontal: 10, paddingVertical: 8, marginBottom: 1, justifyContent: 'center' }}
                >
                  {/* 1행: 캐럿 + 핀 + **워크스페이스 이름** + unread + (접힘) ⑂n + [+].
                      ★ 호스트명·상태점·직결 배지는 위 PC 행이 담당한다(2026-08-14). */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Caret open={expanded} />
                    {/* 사용자 색 = 이름 앞 6px 점(옛 3px 좌측 막대 대체) */}
                    {color ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} /> : null}
                    {pinned ? <PushPin size={12} color={C.text3} weight="fill" /> : null}
                    {isRenaming ? (
                      <KeyTextInput
                        value={renameText}
                        onChangeText={setRenameText}
                        onSubmitEditing={commitRename}
                        onBlur={commitRename}
                        autoFocus
                        selectTextOnFocus
                        style={{ flex: 1, color: C.text, fontSize: v2.font.size.body, fontWeight: '500', fontFamily: v2.font.sans, padding: 0, borderBottomWidth: 1, borderBottomColor: C.borderControl }}
                      />
                    ) : (
                      <Text numberOfLines={1} style={{ flex: 1, color: active ? C.text : C.text2, fontSize: v2.font.size.body, fontWeight: '500', fontFamily: v2.font.sans }}>
                        {S.wsDisplayName(w)}
                      </Text>
                    )}
                    {unread ? <CountBadge n={unread} /> : null}
                    {!expanded && group.openCount > 0 ? (
                      <View accessible accessibilityLabel={TASKS_TX.openTasksN(group.openCount)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        {group.needsInput ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.warn }} /> : null}
                        <Chip>
                          <GitBranch size={12} color={C.text3} weight="bold" />
                          <Text style={{ color: C.text3, fontSize: v2.font.size.caption, fontWeight: '600' }}>{group.openCount}</Text>
                        </Chip>
                      </View>
                    ) : null}
                    {!expanded && oWorkers > 0 ? (
                      <View accessible accessibilityLabel={ORCH_TX.workersN(oWorkers)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        {oAttn ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.warn }} /> : null}
                        <Chip>
                          <TreeStructure size={12} color={C.text3} weight="bold" />
                          <Text style={{ color: C.text3, fontSize: v2.font.size.caption, fontWeight: '600' }}>{oWorkers}</Text>
                        </Chip>
                      </View>
                    ) : null}
                    {/* `+` 자리(실제 버튼은 머리 밖 형제 — 아래) */}
                    <View style={{ width: 28, height: 16 }} />
                  </View>
                  {/* 경로 — 폴더 소실(유령)이면 경로 대신 안내 라벨(오프라인 라벨 톤, 과한 위험색 금지) */}
                  {w.git?.missing ? (
                    <Text numberOfLines={1} style={{ color: C.textDim, fontSize: v2.font.size.caption, marginTop: 2, marginLeft: 20 }}>{i18n.t('폴더를 찾을 수 없음')}</Text>
                  ) : w.localPath ? (
                    <Text numberOfLines={1} style={{ color: C.textDim, fontSize: v2.font.size.caption, fontFamily: v2.font.mono, marginTop: 2, marginLeft: 20 }}>~/{w.localPath}</Text>
                  ) : null}
                  {/* 한 줄 메모(`cpt ws set`) — 에이전트가 "지금 어디까지 왔는지" 남긴 것. 단계는 앞에 무채색 꼬리표로. */}
                  {oNote && !w.git?.missing ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2, marginLeft: 20 }}>
                      {oNoteSt ? <Chip>{ORCH_TX[oNoteSt] as string}</Chip> : null}
                      {oNote.comment ? <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, color: C.text3, fontSize: v2.font.size.caption, fontFamily: v2.font.sans }}>{oNote.comment}</Text> : null}
                    </View>
                  ) : null}
                  {/* 작업 상태(ui_command status.changed) — status[0] + progress % 를 보조 텍스트로(알약 없음, §0.6) */}
                  {st?.status?.length ? (
                    <Text numberOfLines={1} style={{ color: C.text2, fontSize: v2.font.size.caption, marginTop: 2, marginLeft: 20 }}>
                      {st.status[0]}
                      {typeof st.progress === 'number' ? <Text style={{ color: C.textDim, fontFamily: v2.font.mono }}>{` · ${Math.round(st.progress)}%`}</Text> : null}
                    </Text>
                  ) : null}
                  {/* 포트 — `:5554 · :5555` 모노 보조 텍스트(칩 없음) */}
                  {rt?.ports?.length ? (
                    <Text numberOfLines={1} style={{ color: C.textDim, fontSize: v2.font.size.caption, fontFamily: v2.font.mono, marginTop: 2, marginLeft: 20 }}>
                      {rt.ports.slice(0, 3).map((p) => `:${p}`).join(' · ')}
                    </Text>
                  ) : null}
                </PressableRow>
                {/* 새 작업 — 호버가 없으니 항상 보인다. 그 저장소가 미리 선택된 시트를 연다.
                    ★ 머리 Pressable 의 **형제**여야 한다: iOS VoiceOver 는 accessible 요소의 하위를 한 요소로
                    합쳐서, 안에 두면 `작업 추가` 에 초점이 가지 않는다. 절대 위치로 1행 끝에 겹친다. */}
                <IconButton icon={Plus} onPress={() => onAddTask(w, online)} hitSlop={8} accessibilityLabel={TASKS_TX.addTask}
                  size={28} iconSize={16} color={C.textDim}
                  style={{ position: 'absolute', top: 8, right: 4 }} />
                {expanded ? (
                  <>
                    <WsLocalRow
                      label={TASKS_TX.local + (branch ? ` · ${branch}` : '')}
                                            active={active}
                      onPress={() => (isRenaming ? undefined : onSelect(w))}
                    />
                    {/* 작업 폴더 단위(2026-10-07): 로컬 아래에는 그 폴더에서 도는 에이전트만, 다른 브랜치의 워커는 제 브랜치 줄 아래에. */}
                    {oTree.map((r) => {
                      const kidsHere = r.children.filter((c) => !inWorktree(c));
                      const open = !orchFolded.has(r.key);
                      return (
                        <React.Fragment key={r.key}>
                          <WsAgentSessionRow r={r} kids={kidsHere.length} open={open} now={now}
                            onPress={() => onOpenSession(w, r)} onToggle={() => toggleOrch(r.key)}
                            onRun={r.runIds.length && host ? () => openOrchSheet({ host, runId: r.runIds[0] }) : undefined} />
                          {open ? kidsHere.map((c) => <WsAgentWorkerRow key={c.key} c={c} now={now} child onPress={() => onOpenWorker(w, c)} />) : null}
                        </React.Fragment>
                      );
                    })}
                    {oTrees.map((g) => {
                      const tg = wtTarget(g.workers[0]);
                      const wtActive = !!tg && tg.wsId === S.activeWsId && !tasksOpen && !autoOpen && !issuesOpen;
                      return (
                        <React.Fragment key={g.key}>
                          <WsWorktreeRow label={g.branch || g.workers[0].lead || ORCH_TX.worker} active={wtActive} onPress={() => onOpenWorker(w, { ...g.workers[0], needsReply: false })} />
                          {g.workers.map((c) => <WsAgentWorkerRow key={c.key} c={c} now={now} onPress={() => onOpenWorker(w, c)} />)}
                        </React.Fragment>
                      );
                    })}
                    {group.tasks.filter((t) => !oOwned.has(t.taskId)).map((t) => (
                      <WsTaskRow key={t.taskId} t={t} fanOpen={fanOpen.has(t.taskId)}
                        onPress={() => onOpenTask(t)} onToggleFan={() => toggleFan(t.taskId)} onOpenRun={(r) => onOpenRun(t, r)} />
                    ))}
                  </>
                ) : null}
                </View>
              );
          })
        )}
      </ScrollView>

      {/* ── footer 내 정보 (PC .sb-me 미러: 아바타 + 이름/이메일) ── */}
      <View style={{ paddingHorizontal: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.border }}>
        <PressableRow onPress={openMyInfo} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, paddingHorizontal: 8 }}>
          <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: C.elevated2, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: C.text2, fontSize: v2.font.size.small, fontWeight: '600' }}>{avatar}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: C.text, fontSize: v2.font.size.body, fontWeight: '500', fontFamily: v2.font.sans }} numberOfLines={1}>{nickname}</Text>
            {email ? <Text style={{ color: C.textDim, fontSize: v2.font.size.caption, marginTop: 1, fontFamily: v2.font.sans }} numberOfLines={1}>{email}</Text> : null}
          </View>
        </PressableRow>
      </View>

      {/* ── 컨텍스트 메뉴(롱프레스) ── */}
      <MenuModal visible={!!menuWs} onClose={() => setMenuWs(null)}>
            {menuWs ? (
              <>
                <MenuItem icon={<PencilSimple size={18} color={C.text2} />} label={i18n.t('이름 변경')} onPress={() => startRename(menuWs)} />
                <MenuItem icon={<PushPin size={18} color={C.text2} />} label={S.wsPinned(menuWs.id) ? i18n.t('고정 해제') : i18n.t('고정')} onPress={() => { S.togglePinWs(menuWs.id); setMenuWs(null); }} />
                {/* 색상 스와치 */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, minHeight: 44 }}>
                  <Palette size={18} color={C.text2} />
                  <Text style={{ color: C.text, fontSize: v2.font.size.body, marginRight: 4, fontFamily: v2.font.sans }}>{i18n.t('색상')}</Text>
                  <View style={{ flexDirection: 'row', gap: 7, flex: 1, justifyContent: 'flex-end' }}>
                    {WS_COLORS.map((c) => {
                      const sel = normWsColor(S.wsColor(menuWs.id)) === c.value;
                      return (
                        <Pressable key={c.label} hitSlop={4} accessibilityRole="button" accessibilityLabel={i18n.t(c.label)} accessibilityState={{ selected: sel }} onPress={() => { S.setWsColor(menuWs.id, c.value); setMenuWs(null); }}
                          style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: c.value || C.elevated2, borderWidth: sel ? 2 : c.value ? 0 : 1, borderColor: sel ? C.text : C.borderControl, alignItems: 'center', justifyContent: 'center' }}>
                          {!c.value ? <X size={11} color={C.textDim} /> : null}
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
                <MenuSep />
                <MenuItem icon={<ArrowUp size={18} color={C.text2} />} label={i18n.t('위로 이동')} onPress={() => { S.moveWs(menuWs.id, 'up'); setMenuWs(null); }} />
                <MenuItem icon={<ArrowDown size={18} color={C.text2} />} label={i18n.t('아래로 이동')} onPress={() => { S.moveWs(menuWs.id, 'down'); setMenuWs(null); }} />
                <MenuItem icon={<ArrowLineUp size={18} color={C.text2} />} label={i18n.t('맨 위로 이동')} onPress={() => { S.moveWs(menuWs.id, 'top'); setMenuWs(null); }} />
                <MenuSep />
                {/* ★ 프로젝트 분리/합치기 제거(2026-08-14 사용자 확정) — 기기 우선 구조에서는 한
                    화면에 한 PC 의 워크스페이스만 있어서 "무엇과 합칠지"가 화면에 없다. 서버의
                    projectId 필드는 그대로라 되살리려면 이 두 항목만 다시 붙이면 된다. */}
                {/* 목록에서만 삭제 — 폴더/파일 유지(문구로 명시) */}
                <MenuItem icon={<Trash size={18} color={C.error} />} label={i18n.t('워크스페이스 삭제')} color={C.error} onPress={() => confirmDelete(menuWs)} />
              </>
            ) : null}
      </MenuModal>

      {/* ── `내 PC` 섹션의 ⋯ 메뉴 ── 새 PC 는 여기서 만들 수 없다 → **어떻게 하면 나타나는지**를 말한다. */}
      <MenuModal visible={pcMenu} onClose={() => setPcMenu(false)}>
            <MenuItem icon={<Plus size={18} color={C.text2} />} label={i18n.t('PC 연결하기')} onPress={() => {
              setPcMenu(false);
              showAppAlert({
                title: i18n.t('PC 연결하기'),
                message: i18n.t('연결할 PC에서 CodingPT를 설치하고 지금 계정으로 로그인하세요.\n로그인하면 이 목록에 그 PC가 자동으로 나타납니다.'),
                buttons: [{ text: i18n.t('확인'), style: 'primary' }],
              });
            }} />
            {/* PC 설정(깨어 있기 등, automation-design.md §6.6) — 고른 PC 의 것. 메뉴 모달이 내려간 뒤 시트가 뜬다(openPcSettings 가 기다린다). */}
            {activeDev != null && Number(activeDev) > 0 ? (
              <MenuItem icon={<SlidersHorizontal size={18} color={C.text2} />} label={AUTO_TX.pcSettings} onPress={() => {
                setPcMenu(false);
                noteModalClosing();
                if (overlay) closeDrawer();
                openPcSettings(Number(activeDev));
              }} />
            ) : null}
            <MenuItem icon={<Gear size={18} color={C.text2} />} label={i18n.t('기기 관리')} onPress={() => { setPcMenu(false); if (overlay) closeDrawer(); S.openSettings(); }} />
      </MenuModal>

      {/* ── `워크스페이스` 섹션의 ⋯ 메뉴 ── */}
      <MenuModal visible={wsMenu} onClose={() => setWsMenu(false)} statusBarTranslucent>
            <MenuItem icon={<Plus size={18} color={C.text2} />} label={i18n.t('워크스페이스 추가')} onPress={() => { setWsMenu(false); onNewWorkspace(); }} />
      </MenuModal>
      {/* ── VM 으로 가져올 워크스페이스 고르기(이 PC 의 호스트 워크스페이스) — 커밋된 내용 기준 git 사본 ── */}
      <MenuModal visible={vmImport} onClose={() => setVmImport(false)} statusBarTranslucent>
        {allRows.filter((w) => !vmOsOfPath(w.localPath)).map((w) => (
          <MenuItem key={w.id} icon={<Folder size={18} color={C.text2} />} label={w.name || String(w.localPath || '').split('/').pop() || ''}
            onPress={() => {
              setVmImport(false);
              const os = vm.os; const host = Number(activeDev) || null;
              if (!os) return;
              setVmBusy(i18n.t('「{name}」 을 VM 으로 가져오는 중…', { name: w.name || '' }));
              desktopAgentRpc<{ dir: string; name: string }>('ws.add', host, os, { path: String(w.localPath || '') })
                .then(async (r) => {
                  const made = await daemonService.wsCreate({ path: r.dir, host });
                  await workspaceService.createWorkspace({ name: made.name, kind: 'project', compute: 'local', localPath: made.path, remoteUrl: made.remoteUrl, hostDeviceId: host });
                  await S.loadWorkspaces();
                })
                .catch((e) => showAppAlert({ title: i18n.t('가져오지 못했어요'), message: String(e?.message || e) }))
                .finally(() => setVmBusy(''));
            }} />
        ))}
      </MenuModal>
    </SafeAreaView>
  );
}

/**
 * 섹션 머리 — 제목 + ⋯ 메뉴. PC `.sb-sec` 미러. 공용 SectionHeader(13/600 text3 문장형) 위에 얹는다.
 *  ★ [+] 는 두지 않는다(2026-08-14 사용자 확정: "그냥 옆에 ... 으로만 하자") — ⋯ 안의 항목과
 *   같은 일을 하는 버튼이 나란히 두 개 있는 꼴이었다.
 */
export function SectionHead({ title, onMore, adding }: { title: string; onMore?: () => void; adding?: boolean }) {
  return (
    <SectionHeader
      title={title}
      style={{ paddingLeft: 10, paddingRight: 2, marginTop: 6 }}
      right={onMore ? (
        <IconButton icon={DotsThree} weight="bold" accessibilityLabel={i18n.t('더 보기')} onPress={onMore} disabled={adding}
          size={28} iconSize={18} color={v2.colors.text3} />
      ) : null}
    />
  );
}

/** 무채색 카운트 배지(§0.6) — elevated2 바탕 · text 11/600 · r-xs. 빨강 배지 폐기. */
function CountBadge({ n, style }: { n: number; style?: object }) {
  return (
    <View pointerEvents="none" style={[{ minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: v2.radius.xs, backgroundColor: v2.colors.elevated2, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Text style={{ color: v2.colors.text, fontSize: 11, fontWeight: '600', fontFamily: v2.font.sans }}>{n > 9 ? '9+' : n}</Text>
    </View>
  );
}

/** 입력 대기(막고 있는 것) 표시 — warn 점 6px(§0.6). */
function WarnDot() {
  return <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: v2.colors.warn }} />;
}

/** 사이드바 "장소" 행(진행 현황·자동화) — 들어가 있으면 selected 워시(무채색). */
function PlaceRow({ icon: Icon, label, onPress, active, trailing }: {
  icon: React.ComponentType<{ size?: number; color?: string; weight?: any }>; label: string; onPress: () => void; active: boolean; trailing?: React.ReactNode;
}) {
  const C = v2.colors;
  return (
    <PressableRow onPress={onPress} selected={active}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, marginBottom: 2 }}>
      <Icon size={16} color={active ? C.text : C.text2} weight="bold" />
      <Text numberOfLines={1} style={{ flex: 1, color: active ? C.text : C.text2, fontSize: v2.font.size.body, fontWeight: '500', fontFamily: v2.font.sans }}>
        {label}
      </Text>
      {trailing}
    </PressableRow>
  );
}

function Badge({ n }: { n: number }) {
  return <CountBadge n={n} style={{ position: 'absolute', top: 2, right: 0, minWidth: 16, height: 16, paddingHorizontal: 4 }} />;
}

/** 중앙 컨텍스트 메뉴 — elevated · r-xl · 헤어라인, 스크림 150ms 페이드 + 카드 페이드·scale .98(§0.8). */
function MenuModal({ visible, onClose, children, statusBarTranslucent }: { visible: boolean; onClose: () => void; children: React.ReactNode; statusBarTranslucent?: boolean }) {
  const C = v2.colors;
  return (
    <Modal supportedOrientations={['portrait', 'portrait-upside-down', 'landscape', 'landscape-left', 'landscape-right']} visible={visible} transparent animationType="none" statusBarTranslucent={statusBarTranslucent} onRequestClose={onClose}>
      <Animated.View entering={FadeIn.duration(150)} style={{ flex: 1, backgroundColor: C.scrim }}>
        <Pressable style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }} onPress={onClose}>
          <Animated.View entering={menuEnter}>
            <Pressable style={{ width: 272, backgroundColor: C.elevated, borderRadius: v2.radius.xl, borderWidth: 1, borderColor: C.border, padding: 6, overflow: 'hidden' }}>
              {children}
            </Pressable>
          </Animated.View>
        </Pressable>
      </Animated.View>
    </Modal>
  );
}

function MenuSep() {
  return <View style={{ height: 1, backgroundColor: v2.colors.border, marginVertical: 4, marginHorizontal: -6 }} />;
}

function MenuItem({ icon, label, onPress, color }: { icon: React.ReactNode; label: string; onPress: () => void; color?: string }) {
  return (
    <PressableRow onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12 }}>
      {icon}
      <Text style={{ color: color || v2.colors.text, fontSize: v2.font.size.body, fontFamily: v2.font.sans }}>{label}</Text>
    </PressableRow>
  );
}

/** 그룹 머리 캐럿 — 아이콘 하나를 돌린다(교체하면 깜빡인다). 160ms. */
function Caret({ open }: { open: boolean }) {
  const r = useSharedValue(open ? 90 : 0);
  useEffect(() => { r.value = withTiming(open ? 90 : 0, { duration: 160 }); }, [open, r]);
  const st = useAnimatedStyle(() => ({ transform: [{ rotate: `${r.value}deg` }] }));
  return (
    <Animated.View style={[{ width: 14, height: 14, alignItems: 'center', justifyContent: 'center' }, st]}>
      <CaretRight size={14} color={v2.colors.textDim} weight="bold" />
    </Animated.View>
  );
}

/** 로컬 행 — 폴더에서 직접 작업(= 옛 워크스페이스 행 클릭 동작). 활성 = selected 워시(무채색 명암). */
function WsLocalRow({ label, meta = null, active, onPress }: { label: string; meta?: string | null; active: boolean; onPress: () => void }) {
  const C = v2.colors;
  return (
    <PressableRow onPress={onPress} selected={active}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 14, paddingRight: 10, marginBottom: 1 }}>
      <Folder size={16} color={active ? C.text : C.text2} />
      <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, color: active ? C.text : C.text2, fontSize: v2.font.size.small, fontWeight: '500', fontFamily: v2.font.sans }}>
        {label}
      </Text>
      {meta ? <Text numberOfLines={1} style={{ color: C.textDim, fontSize: v2.font.size.caption, fontFamily: v2.font.sans }}>{meta}</Text> : null}
    </PressableRow>
  );
}

/** 칩(×N · ⑂n) — 언어 중립 숫자 칩(무채색, r-xs). */
function Chip({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 5, minHeight: 18, borderRadius: v2.radius.xs, backgroundColor: v2.colors.elevated2 }}>
      {typeof children === 'string' ? <Text style={{ color: v2.colors.text3, fontSize: v2.font.size.caption, fontWeight: '600' }}>{children}</Text> : children}
    </View>
  );
}

/** 열린 작업 행 — 제목 + 상태 부제. 팬아웃(×N)은 칩/캐럿으로 에이전트 자식 행을 펼친다. */
function WsTaskRow({ t, fanOpen, onPress, onToggleFan, onOpenRun }: {
  t: SidebarTask; fanOpen: boolean; onPress: () => void; onToggleFan: () => void; onOpenRun: (r: SidebarRun) => void;
}) {
  const C = v2.colors;
  const fan = t.fanout >= 2 && t.runs.length > 0;
  return (
    <>
      <PressableRow onPress={onPress}
        style={{ paddingLeft: 14, paddingRight: 10, paddingVertical: 6, marginBottom: 1, gap: 2, justifyContent: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <GitBranch size={16} color={C.text2} />
          <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, color: C.text2, fontSize: v2.font.size.small, fontWeight: '500', fontFamily: v2.font.sans }}>
            {t.title || TASKS_TX.title}
          </Text>
          {fan ? (
            <IconButton onPress={onToggleFan} hitSlop={8} accessibilityLabel={`×${t.fanout}`} accessibilityState={{ expanded: fanOpen }}
              size={28} style={{ width: 'auto', flexDirection: 'row', paddingHorizontal: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Chip>{`×${t.fanout}`}</Chip>
                <Caret open={fanOpen} />
              </View>
            </IconButton>
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 24 }}>
          <StateDot tone={TONE[t.dot]} />
          <Text numberOfLines={1} style={{ flex: 1, color: C.textDim, fontSize: v2.font.size.caption, fontFamily: v2.font.sans }}>{subLine(t)}</Text>
        </View>
      </PressableRow>
      {fan && fanOpen ? t.runs.map((r) => <WsAgentRow key={r.runId} r={r} onPress={() => onOpenRun(r)} />) : null}
    </>
  );
}

type WorkspaceMetaLike = { id: string };

/** 작업 폴더(worktree) 줄 — 브랜치 이름. `로컬 · main` 과 같은 층이고, "여기 있음" 표시는 이 줄들에만 둔다. */
function WsWorktreeRow({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const C = v2.colors;
  return (
    <PressableRow onPress={onPress} selected={active}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 14, paddingRight: 10, marginBottom: 1 }}>
      <GitBranch size={16} color={active ? C.text : C.text2} />
      <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, color: active ? C.text : C.text2, fontSize: v2.font.size.small, fontWeight: '500', fontFamily: v2.font.mono }}>{label}</Text>
    </PressableRow>
  );
}

/** 에이전트 행 한 줄 — [세로선][상태 표식][로고] 이름 - 지금 하는 말 · 모델 · 경과 시간. 작업 폴더 줄의 **아래**임을 들여쓰기와 세로선으로 말한다. */
function AgentLine({ glyph, agent, lead, trail, model, at, now, child, onPress, extra, a11y }: {
  glyph: string; agent: string | null; lead: string; trail: string; model?: string; at: number | null; now: number; child?: boolean; onPress: () => void; extra?: React.ReactNode; a11y?: string;
}) {
  const C = v2.colors;
  const ago = shortAgo(at, now);
  return (
    <PressableRow onPress={onPress} accessibilityLabel={a11y} minHeight={32}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: child ? 48 : 34, paddingRight: 10, marginBottom: 1 }}>
      <View pointerEvents="none" style={{ position: 'absolute', left: 21, top: -1, bottom: -1, width: 1, backgroundColor: C.border }} />
      {child ? <View pointerEvents="none" style={{ position: 'absolute', left: 38, top: '50%', width: 6, height: 1, backgroundColor: C.borderControl }} /> : null}
      <AgentGlyph glyph={glyph} />
      {agent && LOGO_BRANDS.has(agent) ? <AgentLogo brand={agent} size={13} /> : <TerminalWindow size={13} color={C.text3} />}
      <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, color: C.text2, fontSize: v2.font.size.caption, fontFamily: v2.font.sans }}>
        {lead}{trail ? <Text style={{ color: C.textDim }}>{` - ${trail}`}</Text> : null}
      </Text>
      {model ? <Text numberOfLines={1} style={{ maxWidth: 70, color: C.textDim, fontSize: 10.5, fontFamily: v2.font.mono }}>{model}</Text> : null}
      {extra}
      {ago ? <Text style={{ color: C.textDim, fontSize: 10.5, fontFamily: v2.font.mono }}>{ago}</Text> : null}
    </PressableRow>
  );
}

/** 에이전트 행(부모) — 워커를 거느리면 접기 캐럿 + 묶음 시트 버튼. 누르면 그 터미널/대화. */
function WsAgentSessionRow({ r, kids, open, now, onPress, onToggle, onRun }: { r: SessionRow; kids: number; open: boolean; now: number; onPress: () => void; onToggle: () => void; onRun?: () => void }) {
  const C = v2.colors;
  const ro = r.rollup;
  const parent = r.children.length > 0 || r.runIds.length > 0;
  const trail = parent && ro
    ? [ro.attention + ro.gates ? ORCH_TX.attentionN(ro.attention + ro.gates) : '', ro.live ? ORCH_TX.liveN(ro.live) : '', ro.failed ? ORCH_TX.failedN(ro.failed) : '',
      !ro.live && !ro.attention && !ro.gates && ro.ok ? ORCH_TX.okN(ro.ok) : ''].filter(Boolean).join(' · ')
    : r.trail;
  const extra = parent ? (
    <>
      {onRun ? (
        <IconButton onPress={onRun} hitSlop={6} accessibilityLabel={ORCH_TX.orchestration} size={24}><TreeStructure size={13} color={C.text3} /></IconButton>
      ) : null}
      {kids ? (
        <IconButton onPress={onToggle} hitSlop={6} accessibilityLabel={ORCH_TX.workersN(kids)} accessibilityState={{ expanded: open }} size={24}><Caret open={open} /></IconButton>
      ) : null}
    </>
  ) : null;
  return <AgentLine glyph={r.glyph} agent={r.agent} lead={r.lead || agentDisplayName(r.agent || '') || ORCH_TX.coordinator} trail={trail} model={r.model} at={r.at} now={now} onPress={onPress} extra={extra} />;
}

/** 워커 행 — 같은 폴더 워커는 시킨 에이전트의 자식(가지 선), 다른 브랜치 워커는 제 브랜치 줄 아래의 에이전트. */
function WsAgentWorkerRow({ c, now, child, onPress }: { c: WorkerRow; now: number; child?: boolean; onPress: () => void }) {
  return <AgentLine glyph={c.glyph} agent={c.agent} lead={c.lead || ORCH_TX.worker} trail={c.trail} model={c.model} at={c.at} now={now} child={child} onPress={onPress} />;
}

// AgentLogo 가 그릴 수 있는 브랜드 — 모르는 에이전트는 터미널 글리프(모양은 사실 주장이라 추측 금지).
const LOGO_BRANDS = new Set(['claude', 'codex', 'gemini', 'cursor-agent', 'opencode']);

/** 팬아웃 에이전트 자식 행 — 그 run 의 터미널로. */
function WsAgentRow({ r, onPress }: { r: SidebarRun; onPress: () => void }) {
  const C = v2.colors;
  const name = agentDisplayName(r.agent) || r.agent || '—';
  return (
    <PressableRow onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 34, paddingRight: 10, marginBottom: 1 }}>
      {LOGO_BRANDS.has(r.agent) ? <AgentLogo brand={r.agent} size={14} /> : <TerminalWindow size={14} color={C.text3} />}
      <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, color: C.text2, fontSize: v2.font.size.small, fontFamily: v2.font.sans }}>
        {r.branch ? `${name} · ${r.branch}` : name}
      </Text>
      <StateDot tone={TONE[r.dot]} />
    </PressableRow>
  );
}

// PC 아래 에이전트 PC(VM) 행 — 만들어 둔 VM 만(이미지 없음·미지원·옛 데몬은 행 없음). PC sidebar.js vmRow 의 미러.
const VM_SHOWN = ['running', 'stopped', 'starting', 'stopping', 'paused'];
function VmRows({ host, onOpen, picked }: { host: number; onOpen: (os: 'macos' | 'linux') => void; picked?: string | null }) {
  const [phase, setPhase] = useState<{ macos: string | null; linux: string | null }>({ macos: null, linux: null });
  useEffect(() => {
    let dead = false;
    const ask = () => {
      Promise.all((['macos', 'linux'] as const).map((os) => desktopRpc<{ phase?: string }>('desktop.status', host, os)
        .then((st) => (st && st.phase && VM_SHOWN.includes(st.phase) ? st.phase : null)).catch(() => null)))
        .then(([m, l]) => { if (!dead) setPhase((p) => (p.macos === m && p.linux === l ? p : { macos: m, linux: l })); });
    };
    ask();
    const t = setInterval(ask, 30000);
    return () => { dead = true; clearInterval(t); };
  }, [host]);
  return (
    <>
      {(['macos', 'linux'] as const).map((os) => (phase[os] ? (
        <PressableRow key={os} onPress={() => { haptic.select(); onOpen(os); }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 30, paddingRight: 10, marginBottom: 2, backgroundColor: picked === os ? C.selected : 'transparent', borderRadius: v2.radius.sm }}>
          {os === 'linux' ? <LinuxLogo size={15} weight="fill" color={C.text3} /> : <AppleLogo size={15} weight="fill" color={C.text3} />}
          <Text numberOfLines={1} style={{ flex: 1, color: C.text2, fontSize: v2.font.size.body, fontFamily: v2.font.sans }}>
            {os === 'linux' ? 'Linux' : 'macOS'} (VM)
          </Text>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: phase[os] === 'running' ? C.success : C.textDim }} />
        </PressableRow>
      ) : null))}
    </>
  );
}
