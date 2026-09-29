import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { View, Text, Pressable, ScrollView, RefreshControl, Modal, Alert, LayoutAnimation, Platform, UIManager } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import KeyTextInput from './keyboard/KeyTextInput';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  SidebarSimple, Bell, Plus, DotsThree, Gear, Laptop,
  PushPin, PencilSimple, Palette, ArrowUp, ArrowDown, ArrowLineUp, X, Trash, ListChecks,
  CaretRight, Folder, GitBranch, TerminalWindow, Check, ArrowsClockwise, Sun, SlidersHorizontal,
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
import PressableScale from './ui/PressableScale';
import * as i18n from '../i18n/index.ts';
import { openTasksDashboard, openNewTask, closeTasksDashboard, subscribeTasksUi, getTasksUi } from '../workspace/tasks/tasksUi';
import { scopeToHost, needsInputByHost } from '../workspace/tasks/tasksModel';
import { useTasksModel, getBucket } from '../workspace/tasks/useTasks';
import { buildSidebarTasks, type SidebarGroup, type SidebarTask, type SidebarRun, type SidebarDot } from '../workspace/tasks/sidebarTasks';
import { openTaskTerminal } from '../workspace/tasks/tasksUi';
import { StateDot, type Tone } from '../workspace/tasks/TaskCard';
import AgentLogo from '../workspace/AgentLogo';
import { agentDisplayName } from '../workspace/chat/composer';
import * as T from '../workspace/tiling';
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

/** 이 워크스페이스에서 열린 터미널 수 — 런타임이 없으면(아직 안 연 워크스페이스) null(표시 안 함). */
function terminalCount(rt: { layout?: T.TilingNode | null } | null): number | null {
  if (!rt || !rt.layout) return null;
  let n = 0;
  T.eachLeaf(rt.layout, (l) => {
    if (l.kind !== 'terminal') return;
    for (const t of (l as T.TerminalLeaf).tabs || []) if (typeof t.win === 'number') n += 1;
  });
  return n;
}

// 색상 스와치(PC WS_COLORS 동일).
const WS_COLORS: Array<{ label: string; value: string }> = [
  { label: '없음', value: '' },
  { label: '빨강', value: '#f87171' },
  { label: '주황', value: '#fb923c' },
  { label: '초록', value: '#34d399' },
  { label: '파랑', value: '#60a5fa' },
  { label: '보라', value: '#a78bfa' },
  { label: '분홍', value: '#f472b6' },
];

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
    closeTasksDashboard(); // 워크스페이스로 들어간다 = 진행 현황·자동화에서 나간다(장소는 하나)
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
  const rows = devices.length ? S.workspacesForDevice(activeDev) : [];
  const tasksOpen = useSyncExternalStore(subscribeTasksUi, () => getTasksUi().open);
  const autoOpen = useSyncExternalStore(subscribeAutomationsUi, () => getAutomationsUi().open);
  useSyncExternalStore(subscribeAwake, getAwakeVersion);
  const onTasks = useCallback(() => {
    haptic.select();
    afterNav();
    openTasksDashboard(); // 토글 아님 — 이미 들어와 있으면 그대로(나가는 길은 워크스페이스 행)
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
  // `자동화` 행 배지 = 고른 PC 의 주의 수(실패/에러·상한 멈춤, §5.9). caps 가 오면(또는 PC 를 바꾸면) 목록을 한 번 읽는다.
  const hostOnlineNow = (devices.find((d) => String(d.id) === String(activeDev)) as any)?.online !== false;
  const { model: autoModel } = useAutomationsModel(host, hostOnlineNow, 0);
  const autoAttention = autoModel.counts.attention;
  useEffect(() => {
    refreshAutoHostIfSupported(host);
    return subscribeHostCaps(() => refreshAutoHostIfSupported(host));
  }, [host]);
  const onAuto = useCallback(() => {
    haptic.select();
    // 구 데몬(auto.v1 없음) — 행은 그리되 들어가지 않고 알린다(§5.9 마지막 줄).
    if (hostSupportsAuto(host) === false) { showAppAlert({ title: TASKS_TX.pcNeedsUpdate }); return; }
    afterNav();
    openAutomations(); // 토글 아님 — 진행 현황과 배타(automationsUi 가 진행 현황을 닫는다)
  }, [afterNav, host]);
  const wsKey = rows.map((w) => `${w.id}\u0001${w.localPath || ''}`).join('\u0002');
  const sbGroups = useMemo(() => buildSidebarTasks({
    host,
    workspaces: rows.map((w) => ({ id: w.id, localPath: w.localPath || '' })),
    tasks: host ? getBucket(host)?.items || [] : [],
    rows: model.rows.map((r) => ({ k: r.k, kind: r.kind, group: r.group, reason: r.reason, run: r.run ? { id: r.run.id } : null, task: r.task ? { id: r.task.id } : null, sortAt: r.activityAt })),
  }).groups, [model, host, wsKey]); // eslint-disable-line react-hooks/exhaustive-deps

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
    haptic.select();
    afterNav();
    openTasksDashboard({ taskId: t.taskId, host: host || null });
  }, [afterNav, host]);
  const onOpenRun = useCallback((t: SidebarTask, r: SidebarRun) => {
    haptic.select();
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
        <CtlBtn onPress={() => (overlay ? closeDrawer() : toggleDocked())}><SidebarSimple size={20} color={C.text2} weight="fill" /></CtlBtn>
        <CtlBtn onPress={onBell}>
          <Bell size={20} color={C.text2} />
          {S.notifications.some((n) => !n.read) ? <Badge n={S.notifications.filter((n) => !n.read).length} /> : null}
        </CtlBtn>
        {/* ★ 상단 + 제거(2026-08-14) — 워크스페이스 추가는 아래 `워크스페이스` 섹션 머리에 산다.
            무엇을 **어느 PC 에** 만드는지가 그 자리에서 드러난다(옛 + 는 매번 PC 를 다시 물었다). */}
        <View style={{ flex: 1 }} />
        {overlay ? (
          <CtlBtn onPress={closeDrawer}><X size={19} color={C.text2} /></CtlBtn>
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
          <Text style={{ color: C.textDim, fontSize: 12.5, paddingHorizontal: 14, paddingVertical: 10 }}>
            {i18n.t('PC를 연결하세요')}
          </Text>
        ) : devices.map((d) => {
          const sel = String(d.id) === String(activeDev);
          const on = (d as any).online !== false;
          // 미읽음은 그 PC 의 워크스페이스 것을 합산 — 다른 PC 를 보고 있어도 "저기서 뭔가 왔다"를 안다.
          const dUnread = S.workspacesForDevice(d.id).reduce((n, w) => n + S.unreadForWs(w.id), 0);
          return (
            <Pressable
              key={String(d.id)}
              onPress={() => { if (!sel) { haptic.select(); closeTasksDashboard(); closeAutomations(); S.setActiveDevice(d.id); } }}
              android_ripple={{ color: C.elevated2 }}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 6,
                // ★ 워크스페이스 행과 같은 무게로(2026-08-14 사용자 확정) — PC 는 이제 워크스페이스의
                //   부모라 더 눌리기 쉬워야 한다. 워크스페이스 행이 2줄이라 minHeight 로 맞춘다.
                minHeight: 44,
                paddingHorizontal: 10, paddingVertical: 11, borderRadius: v2.radius.md, marginBottom: 2,
                // ★ 고른 PC 는 배경이 아니라 체크로(2026-09-29) — 배경 명암은 "지금 들어가 있는 곳"
                //  (진행 현황·로컬 행) 하나에만 쓴다. PC 는 장소가 아니라 그 아래 목록의 필터다.
                backgroundColor: 'transparent',
                opacity: on ? 1 : 0.55, // 오프라인이어도 **고를 수 있다**(뭘 등록해 뒀는지는 봐야 한다)
              }}
            >
              <Laptop size={14} color={sel ? C.text : C.text2} weight="fill" />
              <Text numberOfLines={1} style={{ flex: 1, color: sel ? C.text : C.text2, fontSize: 13.5, fontWeight: '600', fontFamily: v2.font.sans }}>
                {(d as any).name || i18n.t('내 PC')}
              </Text>
              {/* ★ "이 PC" 라벨 없음(2026-08-14 사용자 확정) — 기기 목록에서 어느 게 지금 이 기기인지는
                  쓸모가 없다. 폰에서 보면 **전부 남의 PC** 라 더더욱. */}
              {/* 깨어 있음(power — runner_status.awake) — 무채색 해 글리프. 상태 표시일 뿐 신호색이 아니다(§6.6). */}
              {on && isHostAwake(Number(d.id)) ? <View accessible accessibilityLabel={AUTO_TX.awakeNow}><Sun size={12} color={C.textDim} /></View> : null}
              {!sel && needsByHost[Number(d.id)] ? (
                <View style={{ minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 9, backgroundColor: C.warn, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: C.base, fontSize: 10.5, fontWeight: '700' }}>{needsByHost[Number(d.id)] > 9 ? '9+' : needsByHost[Number(d.id)]}</Text>
                </View>
              ) : null}
              {dUnread ? (
                <View style={{ minWidth: 16, height: 16, paddingHorizontal: 4, borderRadius: 8, backgroundColor: C.error, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{dUnread > 9 ? '9+' : dUnread}</Text>
                </View>
              ) : null}
              {sel ? <Check size={15} color={C.text2} weight="bold" /> : null}
              {/* ★ 상태 점은 그리지 않는다(2026-08-14 사용자 확정) — 오프라인은 행 전체가 흐려지는
                  것으로 이미 드러난다. 같은 사실을 점으로 한 번 더 말하면 신호가 아니라 장식이다. */}
            </Pressable>
          );
        })}

        {/* ── ①-1 고른 PC 의 진행 현황 — PC 안의 **장소**(2026-09-29 시안 확정: 에이전트는 그 PC 에서 돈다).
            예전엔 "내 PC" 위에서 모든 PC 를 합쳐 셌고 누르면 덮는 창이 떴다. 들어가 있으면 선택 배경. */}
        {devices.length ? (
          <>
            <View style={{ height: 1, backgroundColor: C.border, marginHorizontal: 10, marginTop: 6 }} />
            <SectionHead title={String((devices.find((d) => String(d.id) === String(activeDev)) as any)?.name || i18n.t('내 PC'))} />
            <TasksRow onPress={onTasks} n={scopedNeeds} active={tasksOpen} />
            <AutoRow onPress={onAuto} n={autoAttention} active={autoOpen} />
          </>
        ) : null}

        {/* ── ② 선택한 PC 의 워크스페이스 ── */}
        {/* ★ [+] 와 ⋯ 을 함께 두지 않는다(2026-08-14 사용자 확정) — 둘 다 "워크스페이스 추가" 하나를
            가리켜서 같은 일을 하는 버튼이 나란히 두 개 있는 꼴이었다. ⋯ 하나로 통일한다. */}
        <SectionHead title={i18n.t('워크스페이스')} onMore={devices.length ? () => setWsMenu(true) : undefined} adding={creating} />
        {rows.length === 0 ? (
          <Text style={{ color: C.textDim, fontSize: 12.5, paddingHorizontal: 14, paddingVertical: 14, lineHeight: 19 }}>
            {S.wsError && !S.workspaces.length
              ? i18n.t("목록을 불러오지 못했어요.\n아래로 당겨 새로고침하세요.")
              : devices.length ? i18n.t('+ 로 이 PC의 폴더를 추가하세요') : ''}
          </Text>
        ) : (
          rows.map((w) => {
              // 진행 현황에 들어가 있으면 워크스페이스 쪽 선택 표시는 끈다 — 선택 배경은 항상 하나.
              const active = w.id === S.activeWsId && !tasksOpen && !autoOpen;
              const local = S.isLocal(w);
              const color = S.wsColor(w.id);
              const pinned = S.wsPinned(w.id);
              const unread = S.unreadForWs(w.id);
              const rt = S.wsRuntime(w.id);
              const st = S.wsStatus[w.id]; // ui_command status.changed 수신 상태(있을 때만 뱃지)
              const online = local ? (w.hostOnline ?? localOnline) : true;
              const isRenaming = renaming === w.id;
              const group: SidebarGroup = sbGroups[w.id] || { wsId: w.id, openCount: 0, needsInput: false, tasks: [] };
              const expanded = !collapsed[w.id];
              const branch = w.git?.branch || '';
              const nTerm = terminalCount(rt);
              return (
                // 그룹 = 머리(폴더) + 자식(로컬 행 · 열린 작업 행). 오프라인이면 그룹 통째로 흐리게.
                <View key={w.id} style={{ opacity: online ? 1 : 0.55, marginBottom: 2 }}>
                <Pressable
                  onPress={() => (isRenaming ? undefined : toggleGroup(w.id))}
                  onLongPress={() => { haptic.select(); setMenuWs(w); }}
                  delayLongPress={300}
                  android_ripple={{ color: C.elevated2 }}
                  accessibilityRole="button"
                  accessibilityState={{ expanded }}
                  style={{
                    paddingHorizontal: 10, paddingVertical: 8, borderRadius: v2.radius.md, marginBottom: 1,
                    // ★ 머리는 활성 배경을 갖지 않는다 — 활성은 "들어간 곳"인 로컬 행이 갖는다(명세 §3).
                    backgroundColor: 'transparent',
                    borderLeftWidth: color ? 3 : 0, borderLeftColor: color || 'transparent',
                  }}
                >
                  {/* 1행: 캐럿 + 핀 + **워크스페이스 이름** + unread + (접힘) ⑂n + [+].
                      ★ 호스트명·상태점·직결 배지는 위 PC 행이 담당한다(2026-08-14). */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Caret open={expanded} />
                    {pinned ? <PushPin size={12} color={C.text3} weight="fill" /> : null}
                    {isRenaming ? (
                      <KeyTextInput
                        value={renameText}
                        onChangeText={setRenameText}
                        onSubmitEditing={commitRename}
                        onBlur={commitRename}
                        autoFocus
                        selectTextOnFocus
                        style={{ flex: 1, color: C.text, fontSize: 13.5, fontWeight: '600', fontFamily: v2.font.sans, padding: 0, borderBottomWidth: 1, borderBottomColor: C.borderControl }}
                      />
                    ) : (
                      <Text numberOfLines={1} style={{ flex: 1, color: active ? C.text : C.text2, fontSize: 13.5, fontWeight: '600', fontFamily: v2.font.sans }}>
                        {S.wsDisplayName(w)}
                      </Text>
                    )}
                    {unread ? (
                      <View style={{ minWidth: 16, height: 16, paddingHorizontal: 4, borderRadius: 8, backgroundColor: C.error, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{unread > 9 ? '9+' : unread}</Text>
                      </View>
                    ) : null}
                    {!expanded && group.openCount > 0 ? (
                      <View accessible accessibilityLabel={TASKS_TX.openTasksN(group.openCount)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        {group.needsInput ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.warn }} /> : null}
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 5, borderRadius: 4, backgroundColor: C.elevated2 }}>
                          <GitBranch size={11} color={C.text3} weight="bold" />
                          <Text style={{ color: C.text3, fontSize: 10.5, fontWeight: '700' }}>{group.openCount}</Text>
                        </View>
                      </View>
                    ) : null}
                    {/* `+` 자리(실제 버튼은 머리 밖 형제 — 아래) */}
                    <View style={{ width: 30, height: 16 }} />
                  </View>
                  {/* 경로 — 폴더 소실(유령)이면 경로 대신 안내 라벨(오프라인 라벨 톤, 과한 위험색 금지) */}
                  {w.git?.missing ? (
                    <Text numberOfLines={1} style={{ color: C.textDim, fontSize: 10.5, marginTop: 2, marginLeft: 20 }}>{i18n.t('폴더를 찾을 수 없음')}</Text>
                  ) : w.localPath ? (
                    <Text numberOfLines={1} style={{ color: C.textDim, fontSize: 10.5, fontFamily: v2.font.mono, marginTop: 2, marginLeft: 20 }}>~/{w.localPath}</Text>
                  ) : null}
                  {/* 작업 상태(ui_command status.changed) — status[0] 텍스트 뱃지 + progress % */}
                  {st?.status?.length ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3, marginLeft: 20 }}>
                      <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, backgroundColor: C.elevated2, maxWidth: 160 }}>
                        <Text style={{ color: C.text2, fontSize: 10.5 }} numberOfLines={1}>{st.status[0]}</Text>
                      </View>
                      {typeof st.progress === 'number' ? (
                        <Text style={{ color: C.textDim, fontSize: 10.5, fontFamily: v2.font.mono }}>{Math.round(st.progress)}%</Text>
                      ) : null}
                    </View>
                  ) : null}
                  {/* 포트 */}
                  {rt?.ports?.length ? (
                    <View style={{ flexDirection: 'row', gap: 4, marginTop: 3, marginLeft: 20 }}>
                      {rt.ports.slice(0, 3).map((p) => (
                        <Text key={p} style={{ color: C.text3, fontSize: 10.5, fontFamily: v2.font.mono }}>:{p}</Text>
                      ))}
                    </View>
                  ) : null}
                </Pressable>
                {/* 새 작업 — 호버가 없으니 항상 보인다. 그 저장소가 미리 선택된 시트를 연다.
                    ★ 머리 Pressable 의 **형제**여야 한다: iOS VoiceOver 는 accessible 요소의 하위를 한 요소로
                    합쳐서, 안에 두면 `작업 추가` 에 초점이 가지 않는다. 절대 위치로 1행 끝에 겹친다. */}
                <PressableScale onPress={() => onAddTask(w, online)} hitSlop={8} accessibilityRole="button" accessibilityLabel={TASKS_TX.addTask}
                  style={{ position: 'absolute', top: 2, right: 4, width: 36, height: 28, alignItems: 'center', justifyContent: 'center' }}>
                  <Plus size={15} color={C.textDim} />
                </PressableScale>
                {expanded ? (
                  <>
                    <WsLocalRow
                      label={TASKS_TX.local + (branch ? ` · ${branch}` : '')}
                      meta={nTerm ? TASKS_TX.terminalsN(nTerm) : null}
                      active={active}
                      onPress={() => (isRenaming ? undefined : onSelect(w))}
                    />
                    {group.tasks.map((t) => (
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
        <Pressable onPress={openMyInfo} android_ripple={{ color: C.elevated2 }} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, paddingHorizontal: 8, borderRadius: v2.radius.md }}>
          <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: C.elevated2, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: C.text2, fontSize: 13, fontWeight: '700' }}>{avatar}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '600' }} numberOfLines={1}>{nickname}</Text>
            {email ? <Text style={{ color: C.textDim, fontSize: 11, marginTop: 1 }} numberOfLines={1}>{email}</Text> : null}
          </View>
        </Pressable>
      </View>

      {/* ── 컨텍스트 메뉴(롱프레스) ── */}
      <Modal supportedOrientations={['portrait', 'portrait-upside-down', 'landscape', 'landscape-left', 'landscape-right']} visible={!!menuWs} transparent animationType="fade" onRequestClose={() => setMenuWs(null)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' }} onPress={() => setMenuWs(null)}>
          <Pressable style={{ width: 260, backgroundColor: C.elevated, borderRadius: v2.radius.lg, borderWidth: 1, borderColor: C.border, paddingVertical: 6 }}>
            {menuWs ? (
              <>
                <MenuItem icon={<PencilSimple size={16} color={C.text2} />} label={i18n.t('이름 변경')} onPress={() => startRename(menuWs)} />
                <MenuItem icon={<PushPin size={16} color={C.text2} />} label={S.wsPinned(menuWs.id) ? i18n.t('고정 해제') : i18n.t('고정')} onPress={() => { S.togglePinWs(menuWs.id); setMenuWs(null); }} />
                {/* 색상 스와치 */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 8 }}>
                  <Palette size={16} color={C.text2} />
                  <Text style={{ color: C.text2, fontSize: 14, marginRight: 4 }}>{i18n.t('색상')}</Text>
                  <View style={{ flexDirection: 'row', gap: 7, flex: 1, justifyContent: 'flex-end' }}>
                    {WS_COLORS.map((c) => {
                      const sel = (S.wsColor(menuWs.id) || '') === c.value;
                      return (
                        <Pressable key={c.label} accessibilityRole="button" accessibilityLabel={i18n.t(c.label)} onPress={() => { S.setWsColor(menuWs.id, c.value); setMenuWs(null); }}
                          style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: c.value || C.elevated2, borderWidth: sel ? 2 : c.value ? 0 : 1, borderColor: sel ? C.text : C.borderControl, alignItems: 'center', justifyContent: 'center' }}>
                          {!c.value ? <X size={11} color={C.textDim} /> : null}
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
                <View style={{ height: 1, backgroundColor: C.border, marginVertical: 4 }} />
                <MenuItem icon={<ArrowUp size={16} color={C.text2} />} label={i18n.t('위로 이동')} onPress={() => { S.moveWs(menuWs.id, 'up'); setMenuWs(null); }} />
                <MenuItem icon={<ArrowDown size={16} color={C.text2} />} label={i18n.t('아래로 이동')} onPress={() => { S.moveWs(menuWs.id, 'down'); setMenuWs(null); }} />
                <MenuItem icon={<ArrowLineUp size={16} color={C.text2} />} label={i18n.t('맨 위로 이동')} onPress={() => { S.moveWs(menuWs.id, 'top'); setMenuWs(null); }} />
                <View style={{ height: 1, backgroundColor: C.border, marginVertical: 4 }} />
                {/* ★ 프로젝트 분리/합치기 제거(2026-08-14 사용자 확정) — 기기 우선 구조에서는 한
                    화면에 한 PC 의 워크스페이스만 있어서 "무엇과 합칠지"가 화면에 없다. 서버의
                    projectId 필드는 그대로라 되살리려면 이 두 항목만 다시 붙이면 된다. */}
                {/* 목록에서만 삭제 — 폴더/파일 유지(문구로 명시) */}
                <MenuItem icon={<Trash size={16} color={C.error} />} label={i18n.t('워크스페이스 삭제')} color={C.error} onPress={() => confirmDelete(menuWs)} />
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── `내 PC` 섹션의 ⋯ 메뉴 ── 새 PC 는 여기서 만들 수 없다 → **어떻게 하면 나타나는지**를 말한다. */}
      <Modal supportedOrientations={['portrait', 'portrait-upside-down', 'landscape', 'landscape-left', 'landscape-right']} visible={pcMenu} transparent animationType="fade" onRequestClose={() => setPcMenu(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' }} onPress={() => setPcMenu(false)}>
          <Pressable style={{ width: 260, backgroundColor: C.elevated, borderRadius: v2.radius.lg, borderWidth: 1, borderColor: C.border, paddingVertical: 6 }}>
            <MenuItem icon={<Plus size={16} color={C.text2} />} label={i18n.t('PC 연결하기')} onPress={() => {
              setPcMenu(false);
              showAppAlert({
                title: i18n.t('PC 연결하기'),
                message: i18n.t('연결할 PC에서 CodingPT를 설치하고 지금 계정으로 로그인하세요.\n로그인하면 이 목록에 그 PC가 자동으로 나타납니다.'),
                buttons: [{ text: i18n.t('확인'), style: 'primary' }],
              });
            }} />
            {/* PC 설정(깨어 있기 등, automation-design.md §6.6) — 고른 PC 의 것. 메뉴 모달이 내려간 뒤 시트가 뜬다(openPcSettings 가 기다린다). */}
            {activeDev != null && Number(activeDev) > 0 ? (
              <MenuItem icon={<SlidersHorizontal size={16} color={C.text2} />} label={AUTO_TX.pcSettings} onPress={() => {
                setPcMenu(false);
                noteModalClosing();
                if (overlay) closeDrawer();
                openPcSettings(Number(activeDev));
              }} />
            ) : null}
            <MenuItem icon={<Gear size={16} color={C.text2} />} label={i18n.t('기기 관리')} onPress={() => { setPcMenu(false); if (overlay) closeDrawer(); S.openSettings(); }} />
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── `워크스페이스` 섹션의 ⋯ 메뉴 ── */}
      <Modal supportedOrientations={['portrait', 'portrait-upside-down', 'landscape', 'landscape-left', 'landscape-right']} visible={wsMenu} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setWsMenu(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' }} onPress={() => setWsMenu(false)}>
          <Pressable style={{ width: 260, backgroundColor: C.elevated, borderRadius: v2.radius.lg, borderWidth: 1, borderColor: C.border, paddingVertical: 6 }}>
            <MenuItem icon={<Plus size={16} color={C.text2} />} label={i18n.t('워크스페이스 추가')} onPress={() => { setWsMenu(false); onNewWorkspace(); }} />
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

/**
 * 섹션 머리 — 제목 + ⋯ 메뉴. PC `.sb-sec` 미러.
 *  ★ [+] 는 두지 않는다(2026-08-14 사용자 확정: "그냥 옆에 ... 으로만 하자") — ⋯ 안의 항목과
 *   같은 일을 하는 버튼이 나란히 두 개 있는 꼴이었다.
 */
export function SectionHead({ title, onMore, adding }: { title: string; onMore?: () => void; adding?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 10, paddingRight: 2, paddingTop: 10, paddingBottom: 4 }}>
      <Text numberOfLines={1} style={{ flex: 1, color: C.textDim, fontSize: 11, fontWeight: '700', letterSpacing: 0.4, fontFamily: v2.font.sans }}>
        {title}
      </Text>
      {onMore ? (
        <Pressable onPress={onMore} hitSlop={8} style={{ padding: 4, opacity: adding ? 0.5 : 1 }} disabled={adding}>
          <DotsThree size={18} color={C.textDim} weight="bold" />
        </Pressable>
      ) : null}
    </View>
  );
}

// 「진행 현황」 행 — 고른 PC 의 에이전트를 상태별로 보는 **장소**(워크스페이스와 같은 급 — 들어가면 선택 배경).
//  배지 = 그 PC 의 입력 대기 수(상태 신호라 warn). 모델은 상위(SidebarContent)가 한 번 계산해 넘긴다(두 번 계산 금지).
function TasksRow({ onPress, n, active }: { onPress: () => void; n: number; active: boolean }) {
  return (
    <PressableScale onPress={onPress} scaleTo={0.98} accessibilityRole="button" accessibilityState={{ selected: active }}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44,
        paddingHorizontal: 10, paddingVertical: 9, borderRadius: v2.radius.md, marginBottom: 2,
        backgroundColor: active ? C.elevated2 : 'transparent',
      }}
    >
      <ListChecks size={15} color={active ? C.text : C.text2} weight="bold" />
      <Text numberOfLines={1} style={{ flex: 1, color: active ? C.text : C.text2, fontSize: 13.5, fontWeight: '600', fontFamily: v2.font.sans }}>
        {TASKS_TX.overview}
      </Text>
      {n ? (
        <View style={{ minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 9, backgroundColor: C.warn, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: C.base, fontSize: 10.5, fontWeight: '700' }}>{n > 9 ? '9+' : n}</Text>
        </View>
      ) : null}
    </PressableScale>
  );
}

// 「자동화」 행 — 진행 현황 바로 아래(§5.9). 같은 급의 장소(들어가면 선택 배경, 진행 현황과 배타).
//  배지 = 주의가 필요한 자동화 수(실패·에러 멈춤) — 상태 신호라 error 색. 없으면 배지 없음.
function AutoRow({ onPress, n, active }: { onPress: () => void; n: number; active: boolean }) {
  return (
    <PressableScale onPress={onPress} scaleTo={0.98} accessibilityRole="button" accessibilityState={{ selected: active }}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44,
        paddingHorizontal: 10, paddingVertical: 9, borderRadius: v2.radius.md, marginBottom: 2,
        backgroundColor: active ? C.elevated2 : 'transparent',
      }}
    >
      <ArrowsClockwise size={15} color={active ? C.text : C.text2} weight="bold" />
      <Text numberOfLines={1} style={{ flex: 1, color: active ? C.text : C.text2, fontSize: 13.5, fontWeight: '600', fontFamily: v2.font.sans }}>
        {AUTO_TX.automations}
      </Text>
      {n ? (
        <View style={{ minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 9, backgroundColor: C.error, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#fff', fontSize: 10.5, fontWeight: '700' }}>{n > 9 ? '9+' : n}</Text>
        </View>
      ) : null}
    </PressableScale>
  );
}

function CtlBtn({ children, onPress, disabled }: { children: React.ReactNode; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={6} style={{ width: 36, height: 36, borderRadius: v2.radius.md, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.5 : 1 }}>
      {children}
    </Pressable>
  );
}

function Badge({ n }: { n: number }) {
  return (
    <View style={{ position: 'absolute', top: 4, right: 4, minWidth: 14, height: 14, paddingHorizontal: 3, borderRadius: 7, backgroundColor: C.error, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontSize: 9, fontWeight: '700' }}>{n > 9 ? '9+' : n}</Text>
    </View>
  );
}

function MenuItem({ icon, label, onPress, color }: { icon: React.ReactNode; label: string; onPress: () => void; color?: string }) {
  return (
    <Pressable onPress={onPress} android_ripple={{ color: C.elevated2 }} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 11 }}>
      {icon}
      <Text style={{ color: color || C.text, fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

/** 그룹 머리 캐럿 — 아이콘 하나를 돌린다(교체하면 깜빡인다). 160ms. */
function Caret({ open }: { open: boolean }) {
  const r = useSharedValue(open ? 90 : 0);
  useEffect(() => { r.value = withTiming(open ? 90 : 0, { duration: 160 }); }, [open, r]);
  const st = useAnimatedStyle(() => ({ transform: [{ rotate: `${r.value}deg` }] }));
  return (
    <Animated.View style={[{ width: 14, height: 14, alignItems: 'center', justifyContent: 'center' }, st]}>
      <CaretRight size={14} color={C.textDim} weight="bold" />
    </Animated.View>
  );
}

/** 로컬 행 — 폴더에서 직접 작업(= 옛 워크스페이스 행 클릭 동작). 활성 = C.elevated2(무채색 명암). */
function WsLocalRow({ label, meta, active, onPress }: { label: string; meta: string | null; active: boolean; onPress: () => void }) {
  return (
    <PressableScale onPress={onPress} scaleTo={0.98} accessibilityRole="button" accessibilityState={{ selected: active }}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 34,
        paddingLeft: 26, paddingRight: 10, borderRadius: v2.radius.md, marginBottom: 1,
        backgroundColor: active ? C.elevated2 : 'transparent',
      }}
    >
      <Folder size={15} color={active ? C.text : C.text2} />
      <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, color: active ? C.text : C.text2, fontSize: 12.5, fontWeight: '500', fontFamily: v2.font.sans }}>
        {label}
      </Text>
      {meta ? <Text numberOfLines={1} style={{ color: C.textDim, fontSize: 10.5 }}>{meta}</Text> : null}
    </PressableScale>
  );
}

/** 칩(×N · ⑂n) — 언어 중립 숫자 칩. */
function Chip({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 5, borderRadius: 4, backgroundColor: C.elevated2 }}>
      {typeof children === 'string' ? <Text style={{ color: C.text3, fontSize: 10.5, fontWeight: '700' }}>{children}</Text> : children}
    </View>
  );
}

/** 열린 작업 행 — 제목 + 상태 부제. 팬아웃(×N)은 칩/캐럿으로 에이전트 자식 행을 펼친다. */
function WsTaskRow({ t, fanOpen, onPress, onToggleFan, onOpenRun }: {
  t: SidebarTask; fanOpen: boolean; onPress: () => void; onToggleFan: () => void; onOpenRun: (r: SidebarRun) => void;
}) {
  const fan = t.fanout >= 2 && t.runs.length > 0;
  return (
    <>
      <PressableScale onPress={onPress} scaleTo={0.98} accessibilityRole="button"
        style={{ paddingLeft: 26, paddingRight: 10, paddingVertical: 6, borderRadius: v2.radius.md, marginBottom: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
          <GitBranch size={15} color={C.text2} />
          <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, color: C.text2, fontSize: 12.5, fontWeight: '500', fontFamily: v2.font.sans }}>
            {t.title || TASKS_TX.title}
          </Text>
          {fan ? (
            <PressableScale onPress={onToggleFan} hitSlop={8} accessibilityRole="button" accessibilityState={{ expanded: fanOpen }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Chip>{`×${t.fanout}`}</Chip>
              <Caret open={fanOpen} />
            </PressableScale>
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 22 }}>
          <StateDot tone={TONE[t.dot]} />
          <Text numberOfLines={1} style={{ flex: 1, color: C.textDim, fontSize: 11 }}>{subLine(t)}</Text>
        </View>
      </PressableScale>
      {fan && fanOpen ? t.runs.map((r) => <WsAgentRow key={r.runId} r={r} onPress={() => onOpenRun(r)} />) : null}
    </>
  );
}

// AgentLogo 가 그릴 수 있는 브랜드 — 모르는 에이전트는 터미널 글리프(모양은 사실 주장이라 추측 금지).
const LOGO_BRANDS = new Set(['claude', 'codex', 'gemini', 'cursor-agent', 'opencode']);

/** 팬아웃 에이전트 자식 행 — 그 run 의 터미널로. */
function WsAgentRow({ r, onPress }: { r: SidebarRun; onPress: () => void }) {
  const name = agentDisplayName(r.agent) || r.agent || '—';
  return (
    <PressableScale onPress={onPress} scaleTo={0.98} accessibilityRole="button"
      style={{ flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 30, paddingLeft: 42, paddingRight: 10, borderRadius: v2.radius.md, marginBottom: 1 }}>
      {LOGO_BRANDS.has(r.agent) ? <AgentLogo brand={r.agent} size={14} /> : <TerminalWindow size={14} color={C.text3} />}
      <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, color: C.text2, fontSize: 12, fontFamily: v2.font.sans }}>
        {r.branch ? `${name} · ${r.branch}` : name}
      </Text>
      <StateDot tone={TONE[r.dot]} />
    </PressableScale>
  );
}
