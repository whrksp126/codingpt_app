// AutomationsHost — `자동화` 장소(automation-design.md §5.9). 셸(RootNavigator ShellLayout)에 1회 마운트,
//  automationsUi.openAutomations() 로 연다(사이드바 자동화 행·팔레트·딥링크·알림·작업 카드 `자동` 칩).
//
// ★ TasksDashboardHost 의 형제 층이다(같은 헤더 규칙, 모달 아님) — 메인 칼럼에서 워크스페이스 위를 덮고, 진행 현황과
//  배타(한쪽을 열면 다른 쪽이 닫힌다 — automationsUi/tasksUi). 보는 범위는 고른 PC 하나(자동화는 만든 PC 에 산다).
// 폰(< 700): 행 → 상세 push(translateX 220ms). 뒤로 = iOS 가장자리 스와이프 · Android 하드웨어 back · 헤더 [<].
//  태블릿(≥ 700, 칼럼 폭 기준): 좌 목록 340 + 우 상세.
// 데이터: useAutomations 스토어(호스트별 auto.list). 열려 있는 동안 60s 보강, automations.changed 즉시.

import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { View, Text, Animated, Easing, PanResponder, Keyboard, useWindowDimensions } from 'react-native';
import ReAnimated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CaretLeft, SidebarSimple, ArrowsClockwise, Sun } from 'phosphor-react-native';
import { v2 } from '../../theme/v2Tokens';
import PressableScale from '../../components/ui/PressableScale';
import IconButton from '../../components/ui/IconButton';
import Toggle from '../../components/ui/Toggle';
import { EmptyState } from '../../components/ui';
import { showAppAlert } from '../../components/AppAlert';
import { openPcSettings } from '../../components/PcSettingsSheet';
import { useDrawer } from '../../contexts/DrawerContext';
import { useResponsive } from '../../hooks/useResponsive';
import { useWorkspaceShell } from '../../contexts/WorkspaceShellContext';
import taskService, { TaskRpcError } from '../../services/taskService';
import automationService, { hostSupportsAuto, type AutomationLite } from '../../services/automationService';
import { isHostAwake, subscribeAwake, getAwakeVersion } from '../../services/powerService';
import { tx } from '../../text';
import { AUTO_TEXT } from '../../text/automations';
import { TASKS_TEXT, taskErrorText } from '../../text/tasks';
import { openDispatch } from '../dispatch/dispatchFlow';
import AutomationList, { type RowAction } from './AutomationList';
import AutomationDetail from './AutomationDetail';
import type { AutoRow } from './automationsModel';
import {
  subscribeAutomationsUi, getAutomationsUi, closeAutomations, clearAutomationsFocus, setAutomationsBackHandler,
  clearAutomationsToast, showAutomationsToast,
} from './automationsUi';
import { useAutomationsModel, refreshAutoHost, getAutoBucket } from './useAutomations';

const TA = tx(AUTO_TEXT);
const TT = tx(TASKS_TEXT);
const WIDE = 700;
const POLL_MS = 60000;

export default function AutomationsHost() {
  const C = v2.colors;
  const ui = useSyncExternalStore(subscribeAutomationsUi, getAutomationsUi);
  const insets = useSafeAreaInsets();
  const S = useWorkspaceShell();
  const SRef = useRef(S); SRef.current = S;
  const { width } = useWindowDimensions();
  const [colW, setColW] = useState(width);
  const wide = colW >= WIDE;
  const { isWide } = useResponsive();
  const { openDrawer, dockedOpen, toggleDocked } = useDrawer();
  useSyncExternalStore(subscribeAwake, getAwakeVersion);

  const host = Number(S.resolvedDeviceId()) || 0;
  const dev = (S.devices || []).find((d: any) => Number(d.id) === host) as any;
  const devName = String(dev?.name || '');
  const online = !!dev && dev.online !== false;
  // 분 단위 시계 — "다음 실행 09:00"·"5분 전" 이 열려 있는 동안 흐른다.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!ui.open) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, [ui.open]);
  const { model, bucket } = useAutomationsModel(host, online, now);
  const supported = hostSupportsAuto(host); // true/false/null(모름)

  const [refreshing, setRefreshing] = useState(false);
  const refresh = useCallback(() => {
    if (!host) return Promise.resolve();
    return taskService.refreshHostCaps().then(() => {
      if (hostSupportsAuto(host) !== false) return refreshAutoHost(host);
      return undefined;
    });
  }, [host]);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void refresh().finally(() => setRefreshing(false));
  }, [refresh]);

  // 열려 있는 동안 60s 보강 — 열 때·PC 를 바꿀 때 즉시 1회.
  useEffect(() => {
    if (!ui.open || !host) return;
    void refresh();
    const t = setInterval(() => { void refresh(); }, POLL_MS);
    return () => clearInterval(t);
  }, [ui.open, host, refresh]);
  useEffect(() => { if (ui.open) Keyboard.dismiss(); }, [ui.open]);

  // ── 상세 선택 + 폰 push ──
  const [selRef, setSel] = useState<{ host: number; id: string } | null>(null);
  const sel = selRef ? selRef.id : null;
  const slide = useRef(new Animated.Value(0)).current;
  const openDetail = useCallback((id: string, h: number) => {
    setSel({ host: h, id });
    slide.setValue(0);
    Animated.timing(slide, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [slide]);
  const closeDetail = useCallback(() => {
    Animated.timing(slide, { toValue: 0, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(() => {
      setSel(null);
      clearAutomationsFocus();
    });
  }, [slide]);
  useEffect(() => { if (!ui.open) { setSel(null); slide.setValue(0); } }, [ui.open, slide]);
  // 다른 PC 로 옮기면 이전 PC 의 상세는 닫는다(자동화는 만든 PC 에 산다).
  useEffect(() => { setSel((cur) => (cur && host && cur.host !== host ? null : cur)); }, [host]);

  // 딥링크·알림·`자동` 칩 focus → (다른 PC 면 옮기고) 그 상세.
  useEffect(() => {
    if (!ui.open || !ui.focus) return;
    const f = ui.focus;
    const target = f.host != null ? Number(f.host) : host;
    if (target && target !== Number(SRef.current.resolvedDeviceId()) && (SRef.current.devices || []).some((d: any) => Number(d.id) === target)) {
      SRef.current.setActiveDevice(target);
    }
    if (!f.id) return;
    const id = String(f.id);
    const has = () => (getAutoBucket(target)?.items || []).some((x) => x.id === id);
    // 상세는 목록 항목 없이도 auto.get 으로 스스로 읽는다 — 곧장 연다(host 전환 effect 뒤에 오도록 한 박자).
    openDetail(id, target);
    if (!has()) void refreshAutoHost(target);
  }, [ui.open, ui.focusGen]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 토스트 ──
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!ui.toast) return;
    setToast(ui.toast);
    clearAutomationsToast();
    const t = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(t);
  }, [ui.toastGen]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 행동 ──
  const [busy, setBusy] = useState<{ id: string; a: RowAction } | null>(null);
  const run = useCallback(async (item: AutomationLite, a: RowAction, fn: () => Promise<unknown>) => {
    setBusy({ id: item.id, a });
    try { await fn(); }
    catch (e: any) { showAutomationsToast(taskErrorText(TT, e instanceof TaskRpcError ? e.code : 'AUTO_ERROR')); }
    finally { setBusy(null); void refreshAutoHost(host); }
  }, [host]);
  const onItemAction = useCallback((item: AutomationLite, a: RowAction) => {
    switch (a) {
      case 'runNow': void run(item, a, () => automationService.runAutomationNow(host, item.id)); return;
      case 'pause': void run(item, a, () => automationService.pauseAutomation(host, item.id)); return;
      case 'resume': void run(item, a, () => automationService.resumeAutomation(host, item.id)); return;
      case 'delete':
        showAppAlert({
          title: TA.deleteAuto,
          message: TA.deleteAutoConfirm,
          buttons: [
            { text: TA.deleteAuto, style: 'destructive', onPress: () => {
              void run(item, a, async () => {
                await automationService.removeAutomation(host, item.id);
                setSel((cur) => (cur && cur.id === item.id ? null : cur));
              });
            } },
            { text: TT.cancel, style: 'cancel' },
          ],
        });
        return;
      default:
    }
  }, [host, run]);
  const onRowAction = useCallback((r: AutoRow, a: RowAction) => onItemAction(r.item, a), [onItemAction]);

  const pausedAll = !!bucket?.paused;
  const [pauseBusy, setPauseBusy] = useState(false);
  const togglePauseAll = useCallback((v: boolean) => {
    if (!host || pauseBusy) return;
    setPauseBusy(true);
    automationService.pauseAllAutomations(host, v)
      .catch((e: any) => showAutomationsToast(taskErrorText(TT, e instanceof TaskRpcError ? e.code : 'AUTO_ERROR')))
      .finally(() => { setPauseBusy(false); void refreshAutoHost(host); });
  }, [host, pauseBusy]);

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

  // 하드웨어 back — 상세면 목록, 목록이면 워크스페이스. 전역 AppBackHandler 가 handleTasksBack 다음에 부른다.
  const onBack = useCallback(() => {
    if (sel && !wide) { closeDetail(); return true; }
    closeAutomations();
    return true;
  }, [sel, wide, closeDetail]);
  useEffect(() => {
    if (!ui.open) return;
    setAutomationsBackHandler(onBack);
    return () => setAutomationsBackHandler(null);
  }, [ui.open, onBack]);

  const awake = isHostAwake(host);
  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', height: 44, paddingHorizontal: 6, gap: 4, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.surface }}>
      {sel && !wide ? (
        <HeaderBtn onPress={closeDetail} label={TA.automations}><CaretLeft size={20} color={C.text2} /></HeaderBtn>
      ) : !isWide || !dockedOpen ? (
        <HeaderBtn onPress={isWide ? toggleDocked : openDrawer} label={TA.automations}><SidebarSimple size={20} color={C.text2} /></HeaderBtn>
      ) : <View style={{ width: 6 }} />}
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: C.text, fontSize: v2.font.size.h2, fontWeight: '600' }}>{TA.automations}</Text>
        {devName ? (
          // PC 이름 탭 = PC 설정 시트(§6.6). 깨어 있으면 해 글리프(무채색 — 상태 표시일 뿐 경고가 아니다).
          <PressableScale scaleTo={0.96} onPress={() => openPcSettings(host)} accessibilityRole="button" accessibilityLabel={TA.pcSettings} hitSlop={6}
            style={{ flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text numberOfLines={1} style={{ flexShrink: 1, color: C.textDim, fontSize: 12 }}>{devName}</Text>
            {awake ? <View accessible accessibilityLabel={TA.awakeNow}><Sun size={12} color={C.textDim} /></View> : null}
          </PressableScale>
        ) : null}
      </View>
      {supported !== false ? (
        // 전체 일시정지 = 무채색 Toggle(§5.9 — error 색 아님). 켜지면 목록 위에 배너.
        <View style={{ paddingHorizontal: 4 }}>
          <Toggle value={pausedAll} onValueChange={togglePauseAll} disabled={pauseBusy || !online} />
        </View>
      ) : null}
      <HeaderBtn onPress={onRefresh} label={TT.refresh}><ArrowsClockwise size={19} color={C.text2} /></HeaderBtn>
    </View>
  );

  // 배너 — 전체 일시정지 · PC 업데이트 필요 · 오프라인 · 조회 실패
  const banners: React.ReactNode[] = [];
  if (supported === false) banners.push(<Banner key="upd" text={TT.pcNeedsUpdate} />);
  else if (!online) banners.push(<Banner key="off" text={TT.hostOffline} />);
  else if (bucket?.error) banners.push(<Banner key="err" text={taskErrorText(TT, bucket.error)} />);
  if (pausedAll) banners.push(<Banner key="paused" text={TA.autoPausedAll} />);

  const empty = supported === false ? null : (
    <EmptyState centered title={TA.autoEmpty} sub={TA.autoEmptyHint} action={{ label: TA.dispatch, onPress: () => openDispatch() }} />
  );

  const list = (
    <AutomationList model={model} now={now} refreshing={refreshing} onRefresh={onRefresh}
      onOpen={(r) => openDetail(r.id, host)} onAction={onRowAction} busy={busy}
      selectedId={wide ? sel : null} header={banners.length ? <View style={{ gap: 6, marginBottom: 8 }}>{banners}</View> : null}
      empty={empty} />
  );
  const detail = selRef ? (
    <AutomationDetail key={`${selRef.host}|${selRef.id}`} host={selRef.host} id={selRef.id} now={now} onAction={onItemAction}
      busy={busy && busy.id === sel ? busy.a : null} onRenamed={() => { void refreshAutoHost(host); }} />
  ) : null;
  const translateX = slide.interpolate({ inputRange: [0, 1], outputRange: [width, 0] });

  if (!ui.open) return null;
  return (
    <View onLayout={(e) => setColW(e.nativeEvent.layout.width)}
      style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0,
        paddingTop: insets.top, paddingBottom: insets.bottom, paddingRight: insets.right, paddingLeft: isWide && dockedOpen ? 0 : insets.left,
        backgroundColor: C.surface }}>
      <View style={{ flex: 1 }}>
        {header}
        {wide ? (
          <View style={{ flex: 1, flexDirection: 'row' }}>
            <View style={{ width: 340, borderRightWidth: 1, borderRightColor: C.border }}>{list}</View>
            <View style={{ flex: 1, backgroundColor: C.base }}>
              {detail || (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: C.textDim, fontSize: 13 }}>{TA.automations}</Text>
                </View>
              )}
            </View>
          </View>
        ) : (
          <View style={{ flex: 1 }}>
            {list}
            {sel ? (
              <Animated.View {...pan.panHandlers}
                style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: C.base, transform: [{ translateX }] }}>
                {detail}
              </Animated.View>
            ) : null}
          </View>
        )}
      </View>
      {toast ? (
        <View pointerEvents="none" style={{ position: 'absolute', left: 16, right: 16, bottom: 28, alignItems: 'center' }}>
          <ReAnimated.View entering={FadeInDown.duration(150)}
            style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: v2.radius.lg, backgroundColor: C.elevated2,
              shadowColor: '#000', shadowOpacity: 0.32, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 8 }}>
            <Text style={{ color: C.text, fontSize: 13 }}>{toast}</Text>
          </ReAnimated.View>
        </View>
      ) : null}
    </View>
  );
}

function Banner({ text }: { text: string }) {
  const C = v2.colors;
  return (
    <View style={{ paddingHorizontal: 12, paddingVertical: 9, borderRadius: v2.radius.lg, borderWidth: 1, borderColor: C.border, backgroundColor: C.elevated }}>
      <Text style={{ color: C.text2, fontSize: 12.5 }}>{text}</Text>
    </View>
  );
}

function HeaderBtn({ children, onPress, label }: { children: React.ReactNode; onPress: () => void; label: string }) {
  return (
    <IconButton onPress={onPress} accessibilityLabel={label} size={38}>
      {children}
    </IconButton>
  );
}
