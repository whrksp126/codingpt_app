import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, PanResponder, TextInput, Modal, AppState } from 'react-native';
import { WebView } from 'react-native-webview';
import {
  TerminalWindow, X, Code, Globe, SidebarSimple,
  ArrowClockwise, ArrowSquareOut, Sparkle,
} from 'phosphor-react-native';
import { v2 } from '../theme/v2Tokens';
import TerminalWebView, { TerminalHandle } from '../components/module/ide/TerminalWebView';
import IdeBody from './IdeBody';
import daemonService from '../services/daemonService';
import { useAiControl, AI_HYBRID_HIDDEN } from '../contexts/AiControlContext';
import { setPaneRect, removePaneRect, setTabRect, removeTabRect, registerMeasurer, unregisterMeasurer } from './paneRegistry';
import { isTermTab } from './tiling';
import type { Leaf, TerminalLeaf, TerminalTab, PreviewLeaf, IdeLeaf } from './tiling';
import type { WorkspaceMeta } from '../services/workspaceService';
import { haptic } from '../animations/haptics';

const C = v2.colors;

// 롱프레스-활성 드래그 핸들 — PC pointerdown 드래그의 터치 대체.
//  핵심: RN 응답자 협상에서 자식 Pressable(탭 본체/닫기 버튼)이 터치 시작 시 responder 를 선점하므로,
//  bubble 단계 onStartShouldSetPanResponder 는 아예 호출되지 않는다(이전 구현이 드래그가 전혀 시작
//  안 되던 원인). 반드시 "capture 단계" 콜백으로 롱프레스 타이머를 돌리고, armed 후 move(capture)에서
//  responder 를 탈취해야 한다(자식 Pressable 은 terminate 되어 탭 전환 오발도 없음).
//  · 터치 시작(capture): 타이머(220ms) 시작 + 좌표 기록. false 반환 → 자식 탭/버튼 정상 동작.
//  · 220ms 유지 → armed + 햅틱 + 즉시 onDragStart(고스트/드롭존 표시 — 손 안 떼고 바로 끈다).
//  · armed 전 큰 이동 = 스와이프 의도 → 픽업 취소. armed 후 릴리스 = 드롭 적용.
function useDragHandle(id: string, label: string, tabIndex: number, cb: PaneCallbacks) {
  const cbRef = useRef(cb); cbRef.current = cb;
  const idRef = useRef(id); idRef.current = id;
  const labelRef = useRef(label); labelRef.current = label;
  const tabIndexRef = useRef(tabIndex); tabIndexRef.current = tabIndex;
  const armed = useRef(false);
  const granted = useRef(false);
  const started = useRef(false); // onDragStart 발화 여부(취소 정리 필요 판단)
  const startXY = useRef({ x: 0, y: 0 });
  const lastXY = useRef({ x: 0, y: 0 });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clear = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponderCapture: (e) => {
        armed.current = false; granted.current = false; started.current = false; clear();
        startXY.current = lastXY.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
        timer.current = setTimeout(() => {
          armed.current = true; started.current = true;
          haptic.select();
          // 롱프레스 성립 즉시 드래그 시작 표시(정지 상태에서도 고스트/존이 떠서 "잡혔다"가 보인다).
          cbRef.current.onDragStart(idRef.current, labelRef.current, tabIndexRef.current);
          cbRef.current.onDragMove(lastXY.current.x, lastXY.current.y);
        }, 220);
        return false; // 시작 시엔 안 잡음 — 자식 Pressable(탭 전환·닫기)이 정상 동작.
      },
      onMoveShouldSetPanResponderCapture: (e) => {
        lastXY.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
        if (armed.current) return true; // 롱프레스됨 → 자식에게서 제스처 탈취(드래그 시작)
        const dx = lastXY.current.x - startXY.current.x;
        const dy = lastXY.current.y - startXY.current.y;
        if (Math.abs(dx) > 12 || Math.abs(dy) > 12) clear(); // 뚜렷한 스와이프 → 픽업 취소
        return false;
      },
      // 자식이 responder 를 안 잡는 표면(헤더 여백)용 bubble 폴백.
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: () => armed.current,
      onPanResponderTerminationRequest: () => false, // 드래그 중 다른 뷰(분할선 등)가 못 뺏게
      onPanResponderGrant: (e) => {
        granted.current = true;
        cbRef.current.onDragMove(e.nativeEvent.pageX, e.nativeEvent.pageY);
      },
      onPanResponderMove: (e) => cbRef.current.onDragMove(e.nativeEvent.pageX, e.nativeEvent.pageY),
      onPanResponderRelease: (e) => {
        clear(); armed.current = false; granted.current = false; started.current = false;
        cbRef.current.onDragEnd(e.nativeEvent.pageX, e.nativeEvent.pageY);
      },
      onPanResponderTerminate: () => {
        clear(); armed.current = false; granted.current = false;
        if (started.current) { started.current = false; cbRef.current.onDragEnd(NaN, NaN); } // 취소 정리
      },
    }),
  ).current;
  // 롱프레스 전에 손을 뗀 탭(=클릭)이면 타이머 취소. armed 됐지만 responder 미획득으로 뗐으면
  //  드래그 취소(NaN 좌표는 어느 pane 에도 안 맞아 고스트/존 정리만 된다).
  const onTouchEnd = () => {
    clear();
    if (started.current && !granted.current) {
      started.current = false; armed.current = false;
      cbRef.current.onDragEnd(NaN, NaN);
    }
    armed.current = false;
  };
  return { panHandlers: pan.panHandlers, onTouchEnd };
}

export interface PaneCallbacks {
  onFocus: (paneId: string) => void;
  onClosePane: (paneId: string) => void;
  // 터미널 탭(window) 변경을 상위(런타임)에 반영.
  onTabsChange: (paneId: string, tabs: TerminalTab[], active: number) => void;
  // pane/탭 드래그 — 화면좌표(pageX/Y)로 상위가 히트테스트·드롭 적용. tabIndex<0 = pane 통째(IDE/프리뷰).
  onDragStart: (paneId: string, label: string, tabIndex: number) => void;
  onDragMove: (x: number, y: number) => void;
  onDragEnd: (x: number, y: number) => void;
  // leaf 필드 영속(프리뷰 url, IDE openPath).
  onPatch: (paneId: string, patch: Record<string, unknown>) => void;
  // 풀에서 아직 이 레이아웃에 배치되지 않은 터미널 하나를 입양(첫 진입 시 새 터미널 남발 방지). 없으면 null.
  claimPoolWin: () => Promise<{ index: number; name: string } | null>;
  // 터미널 OSC/벨 알림.
  onNotify: (paneId: string, title: string, body: string) => void;
}

// PaneView — PC codingpt_pc/src/js/pane.js 미러.
//   per-pane 탭 헤더 + 본문(terminal=TerminalWebView 라이브미러 / ide·preview=P4).
export default function PaneView({
  node, ws, focused, cb,
}: {
  node: Leaf;
  ws: WorkspaceMeta;
  focused: boolean;
  cb: PaneCallbacks;
}) {
  const rootRef = useRef<View>(null);
  // 화면(window) 좌표를 등록 → 드래그 히트테스트(paneRegistry). measurer 등록으로 드래그 시작 시
  //  일괄 재측정(measureAll) — 다른 분할/사이드바 토글로 절대좌표가 밀려도 onLayout 이 재발화하지
  //  않는 스테일 rect 문제를 막는다.
  const measure = useCallback(() => {
    rootRef.current?.measureInWindow((x, y, w, h) => { if (w && h) setPaneRect(node.id, { x, y, w, h }); });
  }, [node.id]);
  useEffect(() => {
    registerMeasurer(node.id, measure);
    return () => { unregisterMeasurer(node.id); removePaneRect(node.id); };
  }, [node.id, measure]);

  return (
    <View
      ref={rootRef}
      onLayout={measure}
      style={{ flex: 1, backgroundColor: C.base, borderRadius: 4, overflow: 'hidden' }}
    >
      {node.kind === 'terminal' ? (
        <TerminalPane node={node as TerminalLeaf} ws={ws} focused={focused} cb={cb} />
      ) : node.kind === 'preview' ? (
        <PreviewPane node={node} ws={ws} cb={cb} />
      ) : (
        <IdePane node={node} ws={ws} cb={cb} />
      )}
    </View>
  );
}

// 프리뷰/IDE 공용 헤더 — PC pane.js 미러: 그립 없음, 정적 탭(아이콘+라벨+x=닫기)=드래그 핸들, 오른쪽=컨트롤(children).
function SimpleHeader({ paneId, label, icon, cb, children }: { paneId: string; label: string; icon: React.ReactNode; cb: PaneCallbacks; children?: React.ReactNode }) {
  const drag = useDragHandle(paneId, label, -1, cb); // tabIndex<0 = pane 통째 이동(PC IDE/프리뷰 미러)
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', height: 34, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border }}>
      <View {...drag.panHandlers} onTouchEnd={drag.onTouchEnd} style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, height: 34, borderTopWidth: 2, borderTopColor: C.accent, alignSelf: 'flex-start' }}>
          {icon}
          <Text style={{ color: C.text, fontSize: 12 }} numberOfLines={1}>{label}</Text>
          <Pressable onPress={() => cb.onClosePane(paneId)} hitSlop={6}><X size={11} color={C.textDim} /></Pressable>
        </View>
      </View>
      {/* 추가류 버튼(분할/IDE/웹)은 워크스페이스 헤더의 통합 추가 버튼으로 이동 — pane 별 컨트롤만 남긴다. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 5, gap: 1 }}>
        {children}
      </View>
    </View>
  );
}

// ── 터미널 pane ──
function TerminalPane({ node, ws, focused, cb }: { node: TerminalLeaf; ws: WorkspaceMeta; focused: boolean; cb: PaneCallbacks }) {
  const termRef = useRef<TerminalHandle>(null);
  const [wsUrl, setWsUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const cwd = ws.localPath || '';
  const ensuringRef = useRef(false);
  const startedRef = useRef(false);
  // 혼합 탭: 이 pane 의 탭은 터미널(tmux window)뿐 아니라 IDE/프리뷰일 수도 있다.
  const activeTab = node.tabs[node.active];
  const activeIsTerm = isTermTab(activeTab);
  const hasTerm = node.tabs.some((t) => isTermTab(t));
  // 활성 "터미널" 탭이 표시할 window. 'new'(분할로 갓 생긴 pane)면 아직 미확보.
  const activeWin = activeIsTerm ? activeTab?.win : undefined;
  // 혼합 탭 안정 키 — 한 번 활성화된 IDE/프리뷰 탭 본문은 유지(숨김)해 상태 보존.
  const keyOf = (t: TerminalTab) => t.tid || `${t.kind}:${t.openPath ?? t.url ?? ''}`;
  const mountedMixed = useRef<Set<string>>(new Set());
  if (activeTab && !activeIsTerm) mountedMixed.current.add(keyOf(activeTab));
  // IDE 탭별 탐색기 표시 상태(기기 로컬).
  const [ideTree, setIdeTree] = useState<Record<string, boolean>>({});

  // 포커스된 pane 은 명시적으로 xterm 포커스 → iOS 소프트 키보드가 확실히 뜬다(탭-포커스만으론 불안정).
  //  keyboardDisplayRequiresUserAction={false} 라 프로그램적 focus 로 키보드 노출됨.
  useEffect(() => {
    if (focused && wsUrl) { const t = setTimeout(() => termRef.current?.focus(), 120); return () => clearTimeout(t); }
  }, [focused, wsUrl]);

  // 최신 node/cb 참조 — 아래 생성 effect 가 부모 리렌더(cb 재생성/포커스 변화)로 재구독돼도
  //  진행 중이던 RPC 결과를 항상 최신 탭 배열에 적용하기 위함. 이전 구현은 클린업 시 결과를
  //  폐기(alive=false)했는데, 그 사이 아무도 재시도하지 않아 사용자가 화면을 건드릴 때까지
  //  스피너가 영원히 돌고(재렌더가 나야 effect 재실행), 서버엔 고아 터미널이 남았다.
  const latestRef = useRef({ node, cb });
  latestRef.current = { node, cb };

  // 1) win 확보 — 활성 탭이 'new'면 풀의 미배치 터미널을 먼저 입양(첫 진입 시 남발 방지),
  //    없으면 공유 풀에 새 터미널 생성(전 기기에 나타남). 이름("터미널 N")은 풀이 원천.
  //    '+'로 만든 탭(fresh)은 입양 없이 반드시 새로 생성 — 단 재시도부터는 입양 허용
  //    (직전 시도가 생성만 성공하고 응답을 유실한 고아 터미널 회수).
  const retryRef = useRef(0);
  const [retryTick, setRetryTick] = useState(0);
  useEffect(() => {
    const active = node.tabs[node.active];
    if (!active || !isTermTab(active) || typeof active.win === 'number') return;
    if (ensuringRef.current) return;
    ensuringRef.current = true;
    // 결과 적용 대상 탭 — setTerminalTabs 가 다른 탭 객체는 identity 를 보존하므로 응답 시점에
    //  같은 객체를 다시 찾을 수 있다(그 사이 탭 전환/추가가 있어도 엉뚱한 탭에 안 쓴다).
    const targetTab = active;
    const applyWin = (win: number, name?: string) => {
      const { node: n, cb: c } = latestRef.current;
      let idx = n.tabs.indexOf(targetTab);
      if (idx < 0) idx = n.tabs.findIndex((t) => isTermTab(t) && typeof t.win !== 'number');
      if (idx < 0) return; // 탭이 사라짐(닫힘/이동) — 고아 터미널은 리컨실러가 회수
      const tabs = n.tabs.map((t, i) => (i === idx ? { win, title: name || t.title } : t));
      c.onTabsChange(n.id, tabs, n.active);
    };
    (async () => {
      try {
        const claimed = (targetTab.fresh && retryRef.current === 0) ? null : await cb.claimPoolWin();
        const r = claimed || await daemonService.newTerminal(cwd, node.id);
        retryRef.current = 0;
        applyWin(r.index, r.name || '');
      } catch (_) {
        // 'new' 고착은 리컨실러(pending 스킵)까지 멈추므로 방치 금지 — 재시도 후 첫 터미널로 폴백
        //  (스트림 open 의 ensureView 가 window 0 을 자가치유 생성).
        retryRef.current += 1;
        if (retryRef.current <= 3) {
          setTimeout(() => setRetryTick((n) => n + 1), 2500);
        } else {
          retryRef.current = 0;
          applyWin(0);
        }
      } finally { ensuringRef.current = false; }
    })();
  }, [node.active, node.tabs, cwd, node.id, cb, retryTick]);

  // 2) win 이 확정된 뒤 스트림을 딱 한 번 연다. startTerminal 에 win 을 넘겨 데몬이 attach 와 동시에
  //    그 window 로 select → 여러 pane 이 같은 터미널을 보는 문제를 원천 차단(PC ptyOpen(win) 미러).
  //    실패(타임아웃 포함) 시 백오프 재시도 — 일시 오류로 pane 이 에러/로딩에 고착되지 않게.
  const startRetryRef = useRef(0);
  useEffect(() => {
    if (startedRef.current) return;
    if (typeof activeWin !== 'number') return;
    startedRef.current = true;
    (async () => {
      try {
        const token = await daemonService.startTerminal(cwd, node.id, activeWin);
        // 리렌더로 effect 가 재구독돼도 결과는 반드시 반영 — 폐기하면 startedRef=true 인 채
        //  아무도 재시도하지 않아 스피너가 고착된다(언마운트 후 setState 는 no-op 이라 무해).
        setWsUrl(daemonService.buildTerminalWsUrl(token)); setErr(null); startRetryRef.current = 0;
      } catch (e) {
        setErr(String(e));
        startedRef.current = false;
        startRetryRef.current += 1;
        const delay = Math.min(2500 * startRetryRef.current, 15000);
        setTimeout(() => setRetryTick((n) => n + 1), delay);
      }
    })();
  }, [activeWin, cwd, node.id, retryTick]);

  // 3) 스트림이 살아있는 상태에서 활성 탭이 바뀌면 이 pane 의 view 세션에서 그 window 로 전환(다른 pane 미영향).
  useEffect(() => {
    if (!wsUrl || typeof activeWin !== 'number') return;
    daemonService.selectTerminal(cwd, activeWin, node.id).catch(() => { /* noop */ });
  }, [activeWin, wsUrl, cwd, node.id]);

  // 4) pane 포커스 시에도 select — 데몬이 이 pane 클라이언트 크기로 resize-window 하므로
  //    "포커스만 해도" 터미널 크기가 이 기기에 맞춰진다(입력해야 리사이즈되던 문제 해결).
  //    앱이 포그라운드일 때만 — 백그라운드 기기가 같은 창을 보는 다른 기기의 크기를 뺏지 않게.
  useEffect(() => {
    if (!focused || !wsUrl || typeof activeWin !== 'number') return;
    if (AppState.currentState !== 'active') return;
    daemonService.selectTerminal(cwd, activeWin, node.id).catch(() => { /* noop */ });
  }, [focused, activeWin, wsUrl, cwd, node.id]);

  const switchTab = useCallback((i: number) => {
    if (i === node.active) return;
    cb.onTabsChange(node.id, node.tabs, i);
  }, [node, cb]);

  const closeTab = useCallback((i: number) => {
    const tab = node.tabs[i];
    // 터미널 탭 = 풀에서 완전 삭제(전 기기 공통). IDE/프리뷰 탭 = 이 기기 뷰만 닫힘.
    //  RPC 응답을 기다리지 않고 UI 먼저 갱신(낙관적) — 실패 시 리컨실러가 풀 기준 복원.
    if (isTermTab(tab) && typeof tab?.win === 'number') daemonService.closeTerminal(cwd, tab.win).catch(() => { /* noop */ });
    const tabs = node.tabs.filter((_, k) => k !== i);
    if (!tabs.length) { cb.onClosePane(node.id); return; }
    const active = node.active >= tabs.length ? tabs.length - 1 : node.active;
    cb.onTabsChange(node.id, tabs, active);
  }, [node, cwd, cb]);

  // 혼합 탭 상태 영속(IDE openPath / 프리뷰 url) — tid 키로 최신 탭을 찾아 패치.
  const patchTabByKey = useCallback((key: string, patch: Partial<TerminalTab>) => {
    const { node: n, cb: c } = latestRef.current;
    const idx = n.tabs.findIndex((t) => !isTermTab(t) && keyOf(t) === key);
    if (idx < 0) return;
    const tabs = n.tabs.map((t, i) => (i === idx ? { ...t, ...patch } : t));
    c.onTabsChange(n.id, tabs, n.active);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // pane 크기 변동(분할/회전) 시 xterm 재맞춤 — RN WebView 는 DOM resize 이벤트를 안 쏘므로
  //  onLayout 에서 fit() 을 직접 호출해야 셀 격자가 pane 을 꽉 채운다(안 하면 아래 여백/잘림 발생).
  const fitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onBodyLayout = useCallback(() => {
    if (fitTimer.current) clearTimeout(fitTimer.current);
    fitTimer.current = setTimeout(() => termRef.current?.fit(), 60);
  }, []);

  // IDE 탭 활성 시 헤더 우측 탐색기 토글.
  const activeMixedKey = activeTab && !activeIsTerm ? keyOf(activeTab) : null;
  const onToggleIdeTree = useCallback(() => {
    if (!activeMixedKey) return;
    setIdeTree((cur) => ({ ...cur, [activeMixedKey]: !(cur[activeMixedKey] ?? true) }));
  }, [activeMixedKey]);

  return (
    <>
      <PaneHeader
        node={node} focused={focused} onTabPress={switchTab} onTabClose={closeTab} cb={cb}
        ideTreeToggle={activeTab?.kind === 'ide' ? { open: ideTree[activeMixedKey || ''] ?? true, onPress: onToggleIdeTree } : null}
      />
      {/* WebView 를 Pressable 로 감싸면 iOS 에서 터치가 가로채져 xterm textarea 가 포커스를 못 받아
          키보드 입력이 안 됨(라이브미러 무입력 버그). 포커스는 WebView 의 onFocusChange 로만 처리. */}
      <View style={{ flex: 1 }} onLayout={onBodyLayout}>
        {/* 터미널 콘텐츠 — term 탭이 있을 때만. 비활성(IDE/프리뷰 탭 표시 중)엔 숨김(스트림 유지). */}
        <View style={{ flex: activeIsTerm ? 1 : 0, display: activeIsTerm ? 'flex' : 'none' }}>
        {!hasTerm ? null : err ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <Text style={{ color: C.error, fontSize: 12, textAlign: 'center' }}>터미널 연결 실패{'\n'}{err}</Text>
          </View>
        ) : !wsUrl ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={C.accent} />
          </View>
        ) : (
          <TerminalWebView
            ref={termRef}
            wsUrl={wsUrl}
            // 입력 포커스마다 select 재발행 — focusPane 은 이미 포커스면 no-op 이라 effect4 가
            //  안 타는데, 그 사이 다른 기기가 이 창을 자기 크기로 바꿨을 수 있다(TUI 어긋남).
            //  터치해서 입력하려는 순간이 "이 기기 크기로 봐야 하는" 순간이므로 여기서 회수한다.
            onFocusChange={(f) => {
              if (!f) return;
              cb.onFocus(node.id);
              const w = node.tabs[node.active]?.win;
              if (typeof w === 'number') daemonService.selectTerminal(cwd, w, node.id).catch(() => { /* noop */ });
            }}
            // 내부 터치 — 이미 포커스된 터미널은 focus 이벤트가 다시 안 떠서 위 경로가 안 타므로,
            //  터치 자체(웹뷰가 1.2s 스로틀)로도 크기를 회수한다. 포그라운드일 때만.
            onInteract={() => {
              if (AppState.currentState !== 'active') return;
              cb.onFocus(node.id);
              const w = node.tabs[node.active]?.win;
              if (typeof w === 'number') daemonService.selectTerminal(cwd, w, node.id).catch(() => { /* noop */ });
            }}
            onNotify={(t, b) => cb.onNotify(node.id, t, b)}
            // (재)접속 성공 시 view/크기 재보정 — 서버가 재시작됐으면 attach 가 폴백 창을 비추는데,
            //  select 를 다시 쏴야 데몬이 실제 표시 창을 이 pane 클라이언트 크기로 resize 한다
            //  (웹뷰는 onopen 에서 resize 를 먼저 보내므로 이 시점 클라이언트 크기는 정확).
            //  포그라운드일 때만 — 백그라운드 기기의 재접속이 사용 중 기기의 크기를 뺏지 않게.
            onWsOpen={() => {
              if (AppState.currentState !== 'active') return;
              const w = node.tabs[node.active]?.win;
              if (typeof w === 'number') daemonService.selectTerminal(cwd, w, node.id).catch(() => { /* noop */ });
            }}
          />
        )}
        </View>
        {/* IDE/프리뷰 탭 본문 — 활성화된 적 있는 탭은 유지(숨김)해 상태 보존. */}
        {node.tabs.map((t) => {
          if (isTermTab(t)) return null;
          const k = keyOf(t);
          if (!mountedMixed.current.has(k)) return null;
          const isActive = activeTab === t;
          return (
            <View key={k} style={{ flex: isActive ? 1 : 0, display: isActive ? 'flex' : 'none' }}>
              {t.kind === 'ide' ? (
                <IdeBody
                  root={cwd}
                  treeVisible={ideTree[k] ?? true}
                  initialOpenPath={t.openPath || null}
                  onOpenPathChange={(rel) => patchTabByKey(k, { openPath: rel })}
                />
              ) : (
                <PreviewBody cwd={cwd} url={t.url || ''} onUrlChange={(u) => patchTabByKey(k, { url: u })} />
              )}
            </View>
          );
        })}
      </View>
    </>
  );
}

// 드래그 가능한 탭 — PC 처럼 탭 자체가 드래그 핸들(별도 그립 없음). 탭=이동 없으면 전환, 롱프레스+이동=탭 드래그.
function DraggableTab({ node, i, active, focused, label, kind, onTabPress, onTabClose, cb }: {
  node: TerminalLeaf; i: number; active: boolean; focused: boolean; label: string;
  kind: 'term' | 'ide' | 'preview';
  onTabPress: (i: number) => void; onTabClose: (i: number) => void; cb: PaneCallbacks;
}) {
  const drag = useDragHandle(node.id, label, i, cb);
  // 탭 rect 등록 — 탭바 드롭(순서 재배치 인서트 라인) 히트테스트용. 드래그 시작 시 measureAll 로 재측정.
  const tabRef = useRef<View>(null);
  const measure = useCallback(() => {
    tabRef.current?.measureInWindow((x, y, w, h) => { if (w && h) setTabRect(node.id, i, { x, y, w, h }); });
  }, [node.id, i]);
  useEffect(() => {
    registerMeasurer(`${node.id}#${i}`, measure);
    return () => { unregisterMeasurer(`${node.id}#${i}`); removeTabRect(node.id, i); };
  }, [node.id, i, measure]);
  // 액티브 상단선(초록)은 "이 pane 이 포커스됐고 + 그 pane 의 활성 탭"일 때만 — PC 처럼 포커스된 하나만.
  const hot = active && focused;
  return (
    <View ref={tabRef} onLayout={measure} {...drag.panHandlers} onTouchEnd={drag.onTouchEnd} style={{ flexShrink: 1, minWidth: 40 }}>
      {/* 탭을 누르면 그 pane 을 포커스(초록 상단선 이동) + 탭 전환 — PC 처럼 탭 클릭이 곧 pane 포커스. */}
      <Pressable onPress={() => { cb.onFocus(node.id); onTabPress(i); }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, height: 34, backgroundColor: active ? C.base : 'transparent', borderTopWidth: 2, borderTopColor: hot ? C.accent : 'transparent' }}>
        {kind === 'ide' ? (
          <Code size={13} color={active ? C.text2 : C.textDim} />
        ) : kind === 'preview' ? (
          <Globe size={13} color={active ? C.text2 : C.textDim} />
        ) : (
          <TerminalWindow size={13} color={active ? C.text2 : C.textDim} />
        )}
        <Text style={{ color: active ? C.text : C.textDim, fontSize: 12, flexShrink: 1 }} numberOfLines={1}>{label}</Text>
        <Pressable onPress={() => onTabClose(i)} hitSlop={6}><X size={11} color={C.textDim} /></Pressable>
      </Pressable>
    </View>
  );
}

// ── 헤더(탭 + 컨트롤) — PC pane.js 미러: 그립 없음, 오른쪽 [새터미널·splitRight·splitDown·IDE·프리뷰]. 닫기는 탭 x. ──
function PaneHeader({
  node, focused, onTabPress, onTabClose, cb, ideTreeToggle,
}: {
  node: TerminalLeaf;
  focused: boolean;
  onTabPress: (i: number) => void;
  onTabClose: (i: number) => void;
  cb: PaneCallbacks;
  // 활성 탭이 IDE 일 때 탐색기 토글(혼합 탭 전용 — PC pane 헤더의 IDE 토글 미러).
  ideTreeToggle?: { open: boolean; onPress: () => void } | null;
}) {
  // AI 실행 버튼 — 에이전트가 실행 중이 아닐 때만 노출(실행되면 숨김). 우측 하단 FAB 대체.
  const ai = useAiControl();
  // 탭바는 가로 ScrollView 를 쓰지 않는다 — iOS 에서 스크롤 제스처가 롱프레스 드래그를 가로채기 때문.
  //  탭이 많으면 줄어들어 담기고(flexShrink), 드래그는 방해 없이 동작한다(PC 처럼 잡아서 이동).
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', height: 34, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border }}>
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', overflow: 'hidden' }}>
        {node.tabs.map((t, i) => (
          <DraggableTab key={`${node.id}-${i}`} node={node} i={i} active={i === node.active} focused={focused}
            kind={t.kind && t.kind !== 'term' ? t.kind : 'term'}
            label={
              t.kind === 'ide' ? 'IDE'
              : t.kind === 'preview' ? '프리뷰'
              : t.title || (typeof t.win === 'number' ? `터미널 ${t.win}` : '터미널')
            }
            onTabPress={onTabPress} onTabClose={onTabClose} cb={cb} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 5, gap: 1 }}>
        {ideTreeToggle ? (
          <HBtn onPress={ideTreeToggle.onPress}><SidebarSimple size={15} color={ideTreeToggle.open ? C.accent : C.textDim} /></HBtn>
        ) : null}
        {!AI_HYBRID_HIDDEN && !ai.hasSession ? (
          <HBtn onPress={ai.openOrStart}><Sparkle size={15} color={C.accent} weight="fill" /></HBtn>
        ) : null}
      </View>
    </View>
  );
}

function HBtn({ children, onPress }: { children: React.ReactNode; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={4} style={{ width: 28, height: 28, borderRadius: 6, alignItems: 'center', justifyContent: 'center' }}>
      {children}
    </Pressable>
  );
}

// ── 프리뷰 본문(주소창 + WebView) — 독립 pane 과 혼합 탭이 공용 ──
function PreviewBody({ cwd, url, onUrlChange }: { cwd: string; url: string; onUrlChange: (u: string) => void }) {
  const [input, setInput] = useState(url || '');
  const [webUrl, setWebUrl] = useState<string | null>(null); // 실제 WebView 에 로드할 URL(데브서버는 프록시)
  const [busy, setBusy] = useState(false);
  const webRef = useRef<WebView>(null);

  const load = useCallback(async (raw: string) => {
    const u = (raw || '').trim();
    if (!u) return;
    setBusy(true);
    try {
      const portOnly = /^\d+$/.test(u);
      const localMatch = /^(?:https?:\/\/)?(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::(\d+))?/i.exec(u);
      const isUrl = /^https?:\/\//i.test(u);
      const isDomain = /^[\w-]+(\.[\w-]+)+([:/?#]|$)/.test(u);
      if (portOnly || localMatch) {
        // 원격 호스트 데브서버 → 프록시 토큰 URL 로드.
        const port = portOnly ? parseInt(u, 10) : parseInt((localMatch && localMatch[1]) || '80', 10);
        const { token } = await daemonService.previewStart(port);
        setWebUrl(daemonService.buildDaemonPreviewUrl(token));
        onUrlChange(':' + port);
        setInput(':' + port);
      } else {
        const full = isUrl ? u : (isDomain ? 'https://' + u : 'https://www.google.com/search?q=' + encodeURIComponent(u));
        setWebUrl(full);
        onUrlChange(full);
      }
    } catch (e) {
      // noop — 잘못된 포트/오프라인
    } finally {
      setBusy(false);
    }
  }, [onUrlChange]);

  // 저장된 url 복원(데브서버 포트면 재프록시).
  useEffect(() => { if (url) void load(url); /* 최초 1회 */ /* eslint-disable-next-line */ }, []);

  const detectPort = useCallback(async () => {
    try {
      const ports = await daemonService.previewPorts(cwd);
      if (ports.length) void load(String(ports[0]));
    } catch (_) { /* noop */ }
  }, [load, cwd]);

  return (
    <>
      {/* 주소창 (PC preview-bar 미러: 입력 + 새로고침 + 외부 열기) */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 6, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border }}>
        <TextInput
          value={input}
          onChangeText={setInput}
          onSubmitEditing={() => load(input)}
          placeholder="URL 또는 포트 (예: 3000 · localhost:3000 · 날씨)"
          placeholderTextColor={C.textDim}
          autoCapitalize="none"
          autoCorrect={false}
          style={{ flex: 1, color: C.text, fontSize: 12, fontFamily: v2.font.mono, backgroundColor: C.elevated2, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 }}
        />
        <HBtn onPress={detectPort}><ArrowSquareOut size={15} color={C.textDim} /></HBtn>
        <HBtn onPress={() => webRef.current?.reload()}><ArrowClockwise size={15} color={C.textDim} /></HBtn>
        <Pressable onPress={() => load(input)} style={{ paddingHorizontal: 12, paddingVertical: 7, backgroundColor: C.cta, borderRadius: 6 }}>
          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>이동</Text>
        </Pressable>
      </View>
      <View style={{ flex: 1, backgroundColor: '#fff' }}>
        {busy ? <ActivityIndicator color={C.accent} style={{ marginTop: 20 }} /> : null}
        {webUrl ? (
          <WebView ref={webRef} source={{ uri: webUrl }} style={{ flex: 1 }} originWhitelist={['*']} />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.base }}>
            <Text style={{ color: C.textDim, fontSize: 12, textAlign: 'center' }}>URL 또는 데브서버 포트를 입력하세요</Text>
          </View>
        )}
      </View>
    </>
  );
}

// ── 프리뷰 pane — 데브서버 포트 프록시 + 임의 URL ──
function PreviewPane({ node, ws, cb }: { node: PreviewLeaf; ws: WorkspaceMeta; cb: PaneCallbacks }) {
  return (
    <>
      <SimpleHeader paneId={node.id} label="프리뷰" icon={<Globe size={13} color={C.text2} />} cb={cb} />
      <PreviewBody cwd={ws.localPath || ''} url={node.url || ''} onUrlChange={(u) => cb.onPatch(node.id, { url: u })} />
    </>
  );
}

// ── IDE pane — PC ide.js 미러 본문(IdeBody: 트리·아이콘·검색·파일탭·material-darker) ──
//  pane 헤더에는 PC 처럼 [탐색기 토글]만 남긴다(새 파일=트리 헤더, 저장=파일 탭바 우측).
function IdePane({ node, ws, cb }: { node: IdeLeaf; ws: WorkspaceMeta; cb: PaneCallbacks }) {
  const [treeOpen, setTreeOpen] = useState(true);
  return (
    <>
      <SimpleHeader paneId={node.id} label="IDE" icon={<Code size={13} color={C.text2} />} cb={cb}>
        <HBtn onPress={() => setTreeOpen((v) => !v)}><SidebarSimple size={15} color={treeOpen ? C.accent : C.textDim} /></HBtn>
      </SimpleHeader>
      <IdeBody
        root={ws.localPath || ''}
        treeVisible={treeOpen}
        initialOpenPath={node.openPath || null}
        onOpenPathChange={(rel) => cb.onPatch(node.id, { openPath: rel })}
      />
    </>
  );
}
