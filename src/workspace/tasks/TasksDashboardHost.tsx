// TasksDashboardHost — 작업 현황판(설계 §6.4 폰 / §6.5 태블릿). 셸(RootNavigator ShellLayout)에 1회 마운트,
//  tasksUi.openTasksDashboard() 로 연다(사이드바 작업 행·헤더 아이콘·팔레트 tasks.open·딥링크·알림 패널).
//
// ★ 모달이 아니라 **메인 화면 자리의 장소**다(2026-09-29 시안 확정) — 워크스페이스 화면 위를 같은 칼럼 안에서
//  덮고, 사이드바 `내 PC ▸ 진행 현황` 행이 선택 표시를 갖는다. 나가는 길은 워크스페이스(로컬 행)를 누르는 것.
//  보는 범위도 **고른 PC 하나**(에이전트는 그 PC 에서 돈다). 다른 PC 의 입력 대기는 사이드바 PC 행 배지.
// 폰(< 700): 카드 → 상세는 push(translateX 220ms). 뒤로 = iOS 가장자리 스와이프(시작 x<24) · Android 하드웨어 back ·
//  헤더 [<]. 태블릿(≥ 700): 좌 목록 340 + 우 상세.
//
// 데이터: useTasks 스토어(호스트별 task.list) + 셸(PC·승인·알림·워크스페이스) → tasksModel 이 행/그룹을 만든다.
//  열려 있는 동안 60s 보강 폴링(§3.4). 라이브 갱신은 UiCommandBridge 의 tasks.changed 가 스토어를 직접 찌른다.

import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { View, Text, Animated, Easing, PanResponder, Platform, UIManager, Keyboard, Linking, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Plus, CaretLeft, SidebarSimple, Lightning, Sun } from 'phosphor-react-native';
import { v2 } from '../../theme/v2Tokens';
import PressableScale from '../../components/ui/PressableScale';
import { showAppAlert } from '../../components/AppAlert';
import { openApprovalCard } from '../../components/approval/approvalUi';
import { useDrawer } from '../../contexts/DrawerContext';
import { useResponsive } from '../../hooks/useResponsive';
import { useWorkspaceShell } from '../../contexts/WorkspaceShellContext';
import taskService, { TaskRpcError, type RunLite } from '../../services/taskService';
import { tx } from '../../text';
import { TASKS_TEXT, taskErrorText } from '../../text/tasks';
import { AUTO_TEXT } from '../../text/automations';
import { openPcSettings } from '../../components/PcSettingsSheet';
import { openDispatch } from '../dispatch/dispatchFlow';
import { isHostAwake, subscribeAwake, getAwakeVersion } from '../../services/powerService';
import TaskList, { type ListBanner } from './TaskList';
import TaskDetail from './TaskDetail';
import type { CardAction } from './TaskCard';
import { scopeToHost, type TaskRow } from './tasksModel';
import {
  subscribeTasksUi, getTasksUi, closeTasksDashboard, clearTasksFocus, openNewTask, clearTasksToast, showTasksToast,
  openTaskTerminal, setTasksBackHandler,
} from './tasksUi';
import {
  useTasksModel, refreshAllTasks, refreshHost, allBuckets, findTask, findRunByTerminal, dismissOp, waitForOp,
} from './useTasks';

const TX = tx(TASKS_TEXT);
const TA = tx(AUTO_TEXT);
const WIDE = 700;
const POLL_MS = 60000;

type Sel = { host: number; taskId: string; runId: string | null; view?: 'summary' | 'review' };

// run 터미널 열기는 tasksUi 로 옮겼다(사이드바 → 이 파일 → TaskList → SidebarContent 순환 import 방지). 여기선 재수출만.
export { openTaskTerminal, type TerminalShell } from './tasksUi';

export default function TasksDashboardHost() {
  const C = v2.colors;
  const ui = useSyncExternalStore(subscribeTasksUi, getTasksUi);
  const insets = useSafeAreaInsets();
  const S = useWorkspaceShell();
  const SRef = useRef(S); SRef.current = S;
  const { width } = useWindowDimensions();
  // 2단 판정은 창이 아니라 **이 칼럼의 폭**으로 — 태블릿은 도킹 사이드바가 옆을 먹는다.
  const [colW, setColW] = useState(width);
  const wide = colW >= WIDE;

  // Android 구 아키텍처에서 LayoutAnimation 을 켠다 — Host 마운트 시 1회(설계 §6.8).
  useEffect(() => {
    if (Platform.OS === 'android') (UIManager as any).setLayoutAnimationEnabledExperimental?.(true);
  }, []);

  const shellSlice = useMemo(() => ({ devices: S.devices, approvals: S.approvals, notifications: S.notifications, workspaces: S.workspaces }),
    [S.devices, S.approvals, S.notifications, S.workspaces]);
  const fullModel = useTasksModel(shellSlice);
  // 고른 PC 로 좁힌다(진행 현황은 PC 안의 장소). 상세 찾기(findTask)는 스토어 전체를 본다.
  const activeDev = Number(S.resolvedDeviceId()) || 0;
  const model = useMemo(() => (activeDev ? scopeToHost(fullModel, activeDev) : fullModel), [fullModel, activeDev]);
  const devName = String((S.devices || []).find((d: any) => Number(d.id) === activeDev)?.name || '');
  const { isWide } = useResponsive();
  const { openDrawer, dockedOpen, toggleDocked } = useDrawer();
  const seenIds = useRef(new Set<string>()).current;
  useSyncExternalStore(subscribeAwake, getAwakeVersion);

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    refreshAllTasks().finally(() => setRefreshing(false));
  }, []);

  // 열려 있는 동안만 60s 보강 폴링 — 열 때 즉시 1회.
  useEffect(() => {
    if (!ui.open) return;
    void refreshAllTasks();
    const t = setInterval(() => { void refreshAllTasks(); }, POLL_MS);
    return () => clearInterval(t);
  }, [ui.open]);

  // ── 상세 선택 + 폰 push 애니메이션 ──
  const [sel, setSel] = useState<Sel | null>(null);
  const slide = useRef(new Animated.Value(0)).current;
  const openDetail = useCallback((s: Sel) => {
    setSel(s);
    slide.setValue(0);
    Animated.timing(slide, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [slide]);
  const closeDetail = useCallback(() => {
    Animated.timing(slide, { toValue: 0, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(() => {
      setSel(null);
      clearTasksFocus();
    });
  }, [slide]);

  // 딥링크·알림 focus → 상세. taskId 를 모르면(알림 행) 터미널 좌표로 찾는다 — 목록이 아직이면 조회 뒤 한 번 더.
  useEffect(() => {
    if (!ui.open || !ui.focus) return;
    const f = ui.focus;
    // 알림·딥링크가 다른 PC 의 작업을 가리키면 그 PC 로 옮긴다 — 현황판은 고른 PC 의 것이다.
    const goHost = (host: number) => {
      if (host && host !== Number(SRef.current.resolvedDeviceId()) && (SRef.current.devices || []).some((d: any) => Number(d.id) === host)) {
        SRef.current.setActiveDevice(host);
      }
    };
    const resolve = (): boolean => {
      if (f.taskId) {
        const hit = findTask(f.taskId, f.host ?? null);
        const host = hit?.host ?? (f.host ?? null);
        if (host == null) return false;
        goHost(host);
        openDetail({ host, taskId: f.taskId, runId: f.runId || null });
        return true;
      }
      if (f.cwd) {
        const hit = findRunByTerminal(f.cwd, f.win ?? null);
        if (!hit) return false;
        goHost(hit.host);
        openDetail({ host: hit.host, taskId: hit.task.id, runId: hit.runId });
        return true;
      }
      return false;
    };
    if (resolve()) return;
    void refreshAllTasks().then(() => { resolve(); });
  }, [ui.open, ui.focusGen]); // eslint-disable-line react-hooks/exhaustive-deps

  // 닫히면 상세도 접는다(다시 열었을 때 옛 상세가 튀어나오지 않게).
  useEffect(() => { if (!ui.open) { setSel(null); slide.setValue(0); } }, [ui.open, slide]);
  // 다른 PC 로 옮기면 이전 PC 의 상세는 닫는다.
  useEffect(() => { setSel((cur) => (cur && activeDev && cur.host !== activeDev ? null : cur)); }, [activeDev]);
  // 들어올 때 터미널 키보드를 내린다(현황판에는 입력칸이 없다 — 밑에 깔린 터미널이 포커스를 쥐고 있을 수 있다).
  useEffect(() => { if (ui.open) Keyboard.dismiss(); }, [ui.open]);

  // ── 토스트(작업 워크스페이스 정리 등) ──
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!ui.toast) return;
    setToast(ui.toast);
    clearTasksToast();
    const t = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(t);
  }, [ui.toastGen]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 터미널 열기(설계 §4) — 새 worktree 워크스페이스는 목록에 아직 없을 수 있다(back 은 생성을 방송하지 않는다)
  //  → 먼저 목록 새로고침. 그래도 없으면 wsNotRegistered.
  const openTerminal = useCallback((wsId: string | null, tid: number | null, isTask: boolean) =>
    openTaskTerminal(() => SRef.current, wsId, tid, isTask), []);
  const openRunTerminal = useCallback((run: RunLite) => { void openTerminal(run.workspaceId, run.tid, true); }, [openTerminal]);

  // ── 카드 행동 ──
  const [busy, setBusy] = useState<{ k: string; a: CardAction } | null>(null);
  const guard = useCallback(async (row: TaskRow, a: CardAction, fn: () => Promise<unknown>) => {
    setBusy({ k: row.k, a });
    try { await fn(); }
    catch (e: any) { showTasksToast(taskErrorText(TX, e instanceof TaskRpcError ? e.code : 'GH_ERROR')); }
    finally { setBusy(null); void refreshHost(row.host); }
  }, []);
  const discardRun = useCallback((row: TaskRow, force: boolean) => {
    const task = row.task; const run = row.run;
    if (!task || !run) return;
    void guard(row, 'discard', async () => {
      const opId = taskService.newOpId();
      await taskService.discardTask(row.host, task.id, run.id, force, opId);
      const lo = await waitForOp(row.host, task.id, run.id, opId, 60000);
      const skipped = Array.isArray(lo?.result?.skipped) ? lo!.result.skipped : [];
      const code = lo && !lo.ok ? lo.code : skipped[0]?.code;
      if (!force && (code === 'UNCOMMITTED_CHANGES' || code === 'UNMERGED_COMMITS')) {
        showAppAlert({
          title: TX.discard,
          message: code === 'UNCOMMITTED_CHANGES' ? TX.discardConfirm(run.diff?.files || 0) : TX.discardUnmergedConfirm(run.commits?.ahead || 0),
          buttons: [{ text: TX.discard, style: 'destructive', onPress: () => discardRun(row, true) }, { text: TX.cancel, style: 'cancel' }],
        });
      }
    });
  }, [guard]);

  const onAction = useCallback((row: TaskRow, a: CardAction) => {
    const task = row.task; const run = row.run;
    switch (a) {
      case 'answer': if (row.approvals[0]) openApprovalCard(row.approvals[0].id); return;
      case 'terminal':
        if (run) openRunTerminal(run);
        else void openTerminal(row.workspace?.id || null, row.win, false);
        return;
      case 'review':
      case 'detail':
        if (task) openDetail({ host: row.host, taskId: task.id, runId: run?.id || null, view: a === 'review' ? 'review' : 'summary' });
        return;
      case 'trust': if (task && run) void guard(row, a, () => taskService.trustRun(row.host, task.id, run.id)); return;
      case 'reopen': if (task && run) void guard(row, a, () => taskService.reopenRun(row.host, task.id, run.id)); return;
      case 'resend': if (task && run) void guard(row, a, () => taskService.resendPrompt(row.host, task.id, run.id)); return;
      case 'discard': discardRun(row, false); return;
      case 'delete': if (task) void guard(row, a, () => taskService.deleteTask(row.host, task.id)); return;
      case 'dismissOp': dismissOp(run?.lastOp?.opId); return;
      // PR 후속(§4.3) — 무엇을 보낼지는 사유가 정한다(검사 실패 우선 — 둘 다면 둘 다).
      case 'fix':
      case 'ignore': {
        if (!task || !run) return;
        const fu = run.followup;
        const ciOn = !!(fu?.ci?.status === 'failing' && !fu.ci.dismissedAt);
        const rvOn = !!((fu?.reviews?.pending || []).length && !fu?.reviews?.dismissedAt);
        const what = ciOn && rvOn ? 'both' : ciOn ? 'ci' : 'reviews';
        if (a === 'ignore') { void guard(row, a, () => taskService.dismissFollowup(row.host, task.id, run.id, what)); return; }
        void guard(row, a, async () => {
          const opId = taskService.newOpId();
          await taskService.fixRun(row.host, task.id, run.id, what, opId);
          const lo = await waitForOp(row.host, task.id, run.id, opId, 60000);
          if (lo && lo.ok === false) showTasksToast(taskErrorText(TX, lo.code));
          else showTasksToast(TX.fixSent);
        });
        return;
      }
      case 'openPr': if (run?.pr?.url) void Linking.openURL(run.pr.url).catch(() => {}); return;
      default:
    }
  }, [guard, openDetail, openRunTerminal, openTerminal, discardRun]);

  const onOpenRow = useCallback((row: TaskRow) => {
    if (row.task) openDetail({ host: row.host, taskId: row.task.id, runId: row.run?.id || null });
    else if (row.approvals[0]) openApprovalCard(row.approvals[0].id);
    else void openTerminal(row.workspace?.id || null, row.win, false);
  }, [openDetail, openTerminal]);

  // ── 배너(§6.7 A) ──
  const banners: ListBanner[] = [];
  const connected = taskService.connectedHosts();
  if (taskService.capsLoaded() && connected.length === 0) banners.push({ kind: 'noHost' });
  const serverOff = taskService.serverSupportsTasks() === false; // 서버 킬스위치(TASKS_ENABLED=0)·구 서버
  if (!serverOff && connected.some((h) => taskService.hostSupportsTasks(h) === false)) banners.push({ kind: 'pcNeedsUpdate' });
  if (serverOff || allBuckets().some((b) => b.error === 'SERVER_NEEDS_UPDATE')) banners.push({ kind: 'serverNeedsUpdate' });

  const newTask = useCallback(() => {
    const cur = SRef.current.activeWs();
    const host = cur?.hostDeviceId ?? (connected[0] ?? null);
    openNewTask({ host, workspaceId: cur && !taskService.isTaskWorkspace(cur) ? cur.id : null });
  }, [connected]);
  // 설정도 네이티브 Modal — 현황판이 내려간 뒤에 연다(iOS: 닫히는 중인 모달 옆 형제 present 는 거부된다).
  const connectPc = useCallback(() => { SRef.current.openSettings(); }, []);

  const approvalsFor = useCallback((run: RunLite) => (SRef.current.approvals || [])
    .filter((ap) => !ap.expired && ap.cwd === run.cwd && ap.win === run.tid).map((ap) => ap.id), []);

  // ── 폰: 가장자리 스와이프 back ──
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: (e) => e.nativeEvent.pageX < 24,
    onMoveShouldSetPanResponder: (e, g) => e.nativeEvent.pageX - g.dx < 24 && g.dx > 8 && Math.abs(g.dy) < Math.abs(g.dx),
    onPanResponderMove: (_e, g) => { slide.setValue(Math.max(0, Math.min(1, 1 - g.dx / Math.max(1, width)))); },
    onPanResponderRelease: (_e, g) => {
      if (g.dx > width * 0.3 || g.vx > 0.5) closeDetail();
      else Animated.timing(slide, { toValue: 1, duration: 160, useNativeDriver: true }).start();
    },
    onPanResponderTerminate: () => { Animated.timing(slide, { toValue: 1, duration: 160, useNativeDriver: true }).start(); },
  }), [slide, width, closeDetail]);

  // 하드웨어 back — 상세면 목록으로, 목록이면 워크스페이스로 나간다. 전역 AppBackHandler 가 드로어 다음에 부른다.
  const onBack = useCallback(() => {
    if (sel && !wide) { closeDetail(); return true; }
    closeTasksDashboard();
    return true;
  }, [sel, wide, closeDetail]);
  useEffect(() => {
    if (!ui.open) return;
    setTasksBackHandler(onBack);
    return () => setTasksBackHandler(null);
  }, [ui.open, onBack]);

  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', height: 44, paddingHorizontal: 6, gap: 4, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.surface }}>
      {sel && !wide ? (
        <HeaderBtn onPress={closeDetail} label={TX.backToDashboard}><CaretLeft size={20} color={C.text2} /></HeaderBtn>
      ) : !isWide || !dockedOpen ? (
        // ✕ 없음 — 장소라서 닫는 게 아니라 다른 곳으로 간다. 워크스페이스 헤더와 같은 사이드바 버튼.
        <HeaderBtn onPress={isWide ? toggleDocked : openDrawer} label={TX.overview}><SidebarSimple size={20} color={C.text2} /></HeaderBtn>
      ) : <View style={{ width: 6 }} />}
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: C.text, fontSize: 15, fontWeight: '700' }}>{TX.overview}</Text>
        {devName ? (
          // PC 이름 탭 = PC 설정 시트(automation-design.md §6.6). 깨어 있으면 해 글리프(무채색 상태 표시).
          <PressableScale scaleTo={0.96} onPress={() => openPcSettings(activeDev)} accessibilityRole="button" accessibilityLabel={TA.pcSettings} hitSlop={6}
            style={{ flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text numberOfLines={1} style={{ flexShrink: 1, color: C.textDim, fontSize: 12 }}>{devName}</Text>
            {isHostAwake(activeDev) ? <View accessible accessibilityLabel={TA.awakeNow}><Sun size={12} color={C.textDim} /></View> : null}
          </PressableScale>
        ) : null}
      </View>
      {/* 상단 동작은 아이콘만(라벨은 접근성으로) — 텍스트 버튼은 한눈에 안 읽힌다(사용자 지시 2026-09-29). */}
      <HeaderBtn onPress={() => openDispatch()} label={TX.oneLine}><Lightning size={19} color={C.text2} /></HeaderBtn>
      <HeaderBtn onPress={newTask} label={TX.newTask}><Plus size={20} color={C.text2} /></HeaderBtn>
    </View>
  );

  const list = (
    <TaskList
      model={model}
      now={model.now}
      refreshing={refreshing}
      onRefresh={onRefresh}
      onOpenRow={onOpenRow}
      onAction={onAction}
      busy={busy}
      selectedKey={wide && sel ? model.rows.find((r) => r.task?.id === sel.taskId && (!sel.runId || r.run?.id === sel.runId))?.k || null : null}
      seenIds={seenIds}
      banners={banners}
      onNewTask={newTask}
      onConnectPc={connectPc}
    />
  );
  const detail = sel ? (
    <TaskDetail key={`${sel.host}|${sel.taskId}|${sel.view || ''}`} host={sel.host} taskId={sel.taskId} initialRunId={sel.runId} initialView={sel.view}
      onOpenTerminal={openRunTerminal} approvalsFor={approvalsFor} />
  ) : null;

  const translateX = slide.interpolate({ inputRange: [0, 1], outputRange: [width, 0] });

  if (!ui.open) return null;
  return (
    // 메인 칼럼을 덮는 불투명 층 — 밑의 워크스페이스(터미널 WebView)는 살려 둔다(돌아가면 전환 비용 0).
    //  드로어·시트·알럿은 셸에서 이 뒤에 마운트되어 위로 뜬다(RootNavigator ShellLayout 순서).
    <View onLayout={(e) => setColW(e.nativeEvent.layout.width)}
      style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0,
      paddingTop: insets.top, paddingBottom: insets.bottom, paddingRight: insets.right, paddingLeft: isWide && dockedOpen ? 0 : insets.left,
      backgroundColor: C.surface }}>
      {wide ? (
        <View style={{ flex: 1 }}>
          {header}
          <View style={{ flex: 1, flexDirection: 'row' }}>
            <View style={{ width: 340, borderRightWidth: 1, borderRightColor: C.border }}>{list}</View>
            <View style={{ flex: 1, backgroundColor: C.base }}>
              {detail || (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: C.textDim, fontSize: 13 }}>{TX.dashboard}</Text>
                </View>
              )}
            </View>
          </View>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          {header}
          <View style={{ flex: 1 }}>
            {list}
            {sel ? (
              <Animated.View {...pan.panHandlers}
                style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: C.base, transform: [{ translateX }] }}>
                {detail}
              </Animated.View>
            ) : null}
          </View>
        </View>
      )}
      {toast ? (
        <View pointerEvents="none" style={{ position: 'absolute', left: 16, right: 16, bottom: 28, alignItems: 'center' }}>
          <View style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, backgroundColor: C.elevated2, borderWidth: 1, borderColor: C.borderControl }}>
            <Text style={{ color: C.text, fontSize: 12.5 }}>{toast}</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function HeaderBtn({ children, onPress, label }: { children: React.ReactNode; onPress: () => void; label: string }) {
  return (
    <PressableScale scaleTo={0.9} onPress={onPress} accessibilityLabel={label} hitSlop={6}
      style={{ width: 38, height: 38, borderRadius: v2.radius.md, alignItems: 'center', justifyContent: 'center' }}>
      {children}
    </PressableScale>
  );
}
