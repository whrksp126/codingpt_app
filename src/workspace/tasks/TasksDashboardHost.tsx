// TasksDashboardHost — 작업 현황판(설계 §6.4 폰 / §6.5 태블릿). 셸(RootNavigator ShellLayout)에 1회 마운트,
//  tasksUi.openTasksDashboard() 로 연다(사이드바 작업 행·헤더 아이콘·팔레트 tasks.open·딥링크·알림 패널).
//
// 폰(< 700): 전체화면 Modal(slide). 카드 → 상세는 **모달 안 push**(translateX 220ms). 뒤로 = iOS 가장자리 스와이프
//  (시작 x<24) · Android 하드웨어 back(Modal 이 있으면 back 은 onRequestClose 로 온다 — 그래서 거기서 처리한다) ·
//  헤더 [<] 세 가지 전부.
// 태블릿(≥ 700): 같은 Host 가 가운데 패널(최대 1100, 좌 목록 340 + 우 상세)로 그린다.
//
// 데이터: useTasks 스토어(호스트별 task.list) + 셸(PC·승인·알림·워크스페이스) → tasksModel 이 행/그룹을 만든다.
//  열려 있는 동안 60s 보강 폴링(§3.4). 라이브 갱신은 UiCommandBridge 의 tasks.changed 가 스토어를 직접 찌른다.

import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { View, Text, Modal, Animated, Easing, PanResponder, BackHandler, Platform, UIManager, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X, Plus, CaretLeft } from 'phosphor-react-native';
import { v2 } from '../../theme/v2Tokens';
import PressableScale from '../../components/ui/PressableScale';
import { KeyAssistOverlay } from '../../components/keyboard/KeyAssist';
import { showAppAlert, AppAlertHost } from '../../components/AppAlert';
import { openApprovalCard } from '../../components/approval/approvalUi';
import ApprovalHost from '../../components/approval/ApprovalHost';
import { afterModalTransition } from '../../components/modalLayer';
import NewTaskSheet from './NewTaskSheet';
import { useWorkspaceShell } from '../../contexts/WorkspaceShellContext';
import taskService, { TaskRpcError, type RunLite } from '../../services/taskService';
import { tx } from '../../text';
import { TASKS_TEXT, taskErrorText } from '../../text/tasks';
import TaskList, { type ListBanner } from './TaskList';
import TaskDetail from './TaskDetail';
import type { CardAction } from './TaskCard';
import type { TaskRow } from './tasksModel';
import {
  subscribeTasksUi, getTasksUi, closeTasksDashboard, clearTasksFocus, openNewTask, clearTasksToast, showTasksToast,
  markTasksDashboardShown,
} from './tasksUi';
import {
  useTasksModel, refreshAllTasks, refreshHost, allBuckets, findTask, findRunByTerminal, dismissOp, waitForOp,
} from './useTasks';

const TX = tx(TASKS_TEXT);
const WIDE = 700;
const POLL_MS = 60000;

type Sel = { host: number; taskId: string; runId: string | null; view?: 'summary' | 'review' };

export default function TasksDashboardHost() {
  const C = v2.colors;
  const ui = useSyncExternalStore(subscribeTasksUi, getTasksUi);
  const S = useWorkspaceShell();
  const SRef = useRef(S); SRef.current = S;
  const { width } = useWindowDimensions();
  const wide = width >= WIDE;

  // Android 구 아키텍처에서 LayoutAnimation 을 켠다 — Host 마운트 시 1회(설계 §6.8).
  useEffect(() => {
    if (Platform.OS === 'android') (UIManager as any).setLayoutAnimationEnabledExperimental?.(true);
  }, []);

  const shellSlice = useMemo(() => ({ devices: S.devices, approvals: S.approvals, notifications: S.notifications, workspaces: S.workspaces }),
    [S.devices, S.approvals, S.notifications, S.workspaces]);
  const model = useTasksModel(shellSlice);
  const seenIds = useRef(new Set<string>()).current;

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
    const resolve = (): boolean => {
      if (f.taskId) {
        const hit = findTask(f.taskId, f.host ?? null);
        const host = hit?.host ?? (f.host ?? null);
        if (host == null) return false;
        openDetail({ host, taskId: f.taskId, runId: f.runId || null });
        return true;
      }
      if (f.cwd) {
        const hit = findRunByTerminal(f.cwd, f.win ?? null);
        if (!hit) return false;
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
  const openTerminal = useCallback(async (wsId: string | null, tid: number | null, isTask: boolean) => {
    if (!wsId) { showTasksToast(TX.wsNotRegistered); return; }
    if (!SRef.current.workspaces.some((w) => w.id === wsId)) {
      await SRef.current.loadWorkspaces();
      await new Promise((r) => setTimeout(r, 60)); // 새 목록이 렌더(=ref 갱신)될 한 박자
    }
    if (!SRef.current.workspaces.some((w) => w.id === wsId)) { showTasksToast(TX.wsNotRegistered); return; }
    closeTasksDashboard();
    SRef.current.setActive(wsId, isTask ? { allowTask: true } : undefined);
    if (typeof tid === 'number') SRef.current.focusTerminal(wsId, tid);
  }, []);
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
  const connectPc = useCallback(() => { closeTasksDashboard(); afterModalTransition(() => SRef.current.openSettings()); }, []);

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

  // 하드웨어 back — Modal 이 떠 있으면 onRequestClose 로 온다(아래). 모달 밖(드문 경우)을 위한 보조 리스너.
  const onBack = useCallback(() => {
    if (sel && !wide) { closeDetail(); return true; }
    closeTasksDashboard();
    return true;
  }, [sel, wide, closeDetail]);
  useEffect(() => {
    if (!ui.open) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => sub.remove();
  }, [ui.open, onBack]);

  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', height: 44, paddingHorizontal: 6, gap: 4, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.surface }}>
      {sel && !wide ? (
        <HeaderBtn onPress={closeDetail} label={TX.backToDashboard}><CaretLeft size={20} color={C.text2} /></HeaderBtn>
      ) : (
        <HeaderBtn onPress={closeTasksDashboard} label={TX.cancel}><X size={19} color={C.text2} /></HeaderBtn>
      )}
      <Text numberOfLines={1} style={{ flex: 1, color: C.text, fontSize: 15, fontWeight: '700' }}>{TX.title}</Text>
      <PressableScale scaleTo={0.95} onPress={newTask}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: C.borderControl }}>
        <Plus size={14} color={C.text2} weight="bold" />
        <Text style={{ color: C.text2, fontSize: 12.5, fontWeight: '600' }}>{TX.newTask}</Text>
      </PressableScale>
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

  return (
    <Modal
      key={ui.modalGen}
      supportedOrientations={['portrait', 'portrait-upside-down', 'landscape', 'landscape-left', 'landscape-right']}
      visible={ui.open}
      animationType="slide"
      presentationStyle="fullScreen"
      onShow={markTasksDashboardShown}
      onRequestClose={() => { onBack(); }}
    >
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: wide ? C.base : C.surface }}>
        {wide ? (
          <View style={{ flex: 1, alignItems: 'center' }}>
            <View style={{ flex: 1, width: '100%', maxWidth: 1100, backgroundColor: C.surface, borderLeftWidth: 1, borderRightWidth: 1, borderColor: C.border }}>
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
      </SafeAreaView>
      {/* 현황판이 떠 있는 동안 공용 오버레이(새 작업 시트·승인 카드·알럿)는 **이 Modal 안에서** 뜬다 —
          iOS(new arch)는 루트 VC 가 이미 이 전체화면 모달을 띄우고 있으면 형제 모달 present 를 거부한다(modalLayer.ts). */}
      {ui.open ? (
        <>
          <NewTaskSheet layer="tasks" />
          <ApprovalHost layer="tasks" />
          <AppAlertHost layer="tasks" />
        </>
      ) : null}
      {/* Modal 은 독립 네이티브 레이어 — 보조키 오버레이 별도 마운트 규칙 유지 */}
      <KeyAssistOverlay inModal />
    </Modal>
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
