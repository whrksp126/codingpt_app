import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, PanResponder, LayoutChangeEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SidebarSimple, Bell, TerminalWindow, Code, Globe } from 'phosphor-react-native';
import { v2 } from '../theme/v2Tokens';
import { useWorkspaceShell } from '../contexts/WorkspaceShellContext';
import { useDrawer } from '../contexts/DrawerContext';
import { useResponsive } from '../hooks/useResponsive';
import * as T from './tiling';
import type { TilingNode, Leaf } from './tiling';
import PaneView, { PaneCallbacks, PreviewHostLayer } from './PaneView';
import { paneAt, dropZone, getPaneRect, tabInsertAt, measureAll, setDragSrc, getTabScroller, DropZone } from './paneRegistry';
import daemonService from '../services/daemonService';
import type { WorkspaceMeta } from '../services/workspaceService';

const C = v2.colors;

// pane 헤더(탭바) 높이 — 탭바 드롭존 판정과 가장자리 존 계산에 사용(PC .pane-head 미러).
const HEAD_H = 34;

interface DragMeta { srcId: string; label: string; tabIndex: number }
// 드롭 판정 결과 — zone 'tabbar' 는 터미널 탭 순서 재배치/삽입(인서트 라인 표시).
interface DropSpec { paneId: string; zone: DropZone | 'tabbar'; index?: number; lineX?: number }

// main-top 상단 컨트롤 버튼(접힘 시 노출).
function MtBtn({ children, onPress }: { children: React.ReactNode; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={6} style={{ width: 36, height: 36, borderRadius: v2.radius.md, alignItems: 'center', justifyContent: 'center' }}>
      {children}
    </Pressable>
  );
}

// WorkspaceView — PC workspace-view.js 미러.
//   main-top 헤더 + 타일 pane 그리드(재귀 split). P2: 분할선 드래그 없음(정적 ratio, P3 에서 추가).
export default function WorkspaceView() {
  const S = useWorkspaceShell();
  const { isWide } = useResponsive();
  const { openDrawer, dockedOpen, toggleDocked } = useDrawer();
  const ws = S.activeWs();
  const rt = ws ? S.wsRuntime(ws.id) : null;

  const showOpen = !isWide || !dockedOpen;
  const onOpenSidebar = () => (isWide ? toggleDocked() : openDrawer());

  // ── pane/탭 드래그 상태 ── (그립 PanResponder 는 최초 cb 를 캡처하므로 콜백은 stable, 값은 ref/state)
  const dragMetaRef = useRef<DragMeta | null>(null);
  const [finger, setFinger] = useState<{ x: number; y: number } | null>(null);
  const fingerRef = useRef<{ x: number; y: number } | null>(null);
  // 드래그 중 탭바 끝단 자동 스크롤 타이머 — 일반 DnD 처럼 끝에 대면 가려진 탭이 나타난다.
  const autoScrollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopAutoScroll = () => {
    if (autoScrollTimerRef.current) { clearInterval(autoScrollTimerRef.current); autoScrollTimerRef.current = null; }
  };
  useEffect(() => () => stopAutoScroll(), []);
  const gridOriginRef = useRef({ x: 0, y: 0 });
  const gridRef = useRef<View>(null);
  // 드롭 판정/적용 콜백이 항상 최신 상태를 보도록 ref 경유(stale 클로저 방지).
  const rtRef = useRef(rt); rtRef.current = rt;
  const wsRef = useRef(ws); wsRef.current = ws;
  const SRef = useRef(S); SRef.current = S;
  const claimingRef = useRef<Set<number>>(new Set());

  // 손가락 좌표 → 드롭 판정 — PC workspace-view.js update() 미러.
  //  · 터미널 탭 드래그 + 대상=터미널 pane + 탭바 밴드 안 = 'tabbar'(삽입 인덱스/인서트 라인)
  //  · 본문 = 가장자리 25% 방향 존 / 가운데 center. 헤더 밴드(비탭바)는 center.
  const computeDrop = useCallback((meta: DragMeta, x: number, y: number): DropSpec | null => {
    const layout = rtRef.current?.layout;
    if (!layout || !isFinite(x) || !isFinite(y)) return null;
    const target = paneAt(x, y);
    if (!target) return null;
    const r = getPaneRect(target);
    if (!r) return null;
    const srcLeaf = T.findLeaf(layout, meta.srcId);
    const targetLeaf = T.findLeaf(layout, target);
    if (!srcLeaf || !targetLeaf) return null;
    const tabDrag = meta.tabIndex >= 0 && srcLeaf.kind === 'terminal';
    // IDE/프리뷰 pane 통째 드래그도 터미널 pane 탭바에선 "탭 편입"이므로 인서트 라인을 보여준다
    //  (PC canTabbar 미러 — 없으면 편입 위치를 예측할 수 없다).
    const paneJoin = meta.tabIndex < 0 && (srcLeaf.kind === 'ide' || srcLeaf.kind === 'preview');
    if ((tabDrag || paneJoin) && targetLeaf.kind === 'terminal' && y >= r.y && y <= r.y + HEAD_H) {
      const ins = tabInsertAt(target, x, targetLeaf.tabs.length);
      return { paneId: target, zone: 'tabbar', index: ins.index, lineX: ins.lineX };
    }
    const zone: DropZone = y > r.y + HEAD_H ? dropZone(target, x, y) : 'center';
    return { paneId: target, zone };
  }, []);

  // 드롭 적용 — PC finish() 의 4 갈래 미러(reorderTab/moveTabToIndex/moveTab/moveTabToNewSplit/movePane).
  //  독립 세션 구조라 pane 간 탭 이동은 데몬 terminal.move(tmux move-window) 를 먼저 수행한 뒤 트리를 갱신.
  const applyDrop = useCallback(async (meta: DragMeta, drop: DropSpec) => {
    const S2 = SRef.current; const ws2 = wsRef.current; const rt2 = rtRef.current;
    if (!ws2 || !rt2) return;
    const layout = rt2.layout;
    const src = T.findLeaf(layout, meta.srcId);
    if (!src) return;
    const wholePane = src.kind !== 'terminal' || meta.tabIndex < 0;
    if (wholePane) {
      // IDE/프리뷰 pane 을 터미널 pane 의 탭바/가운데에 드롭 = 그 pane 의 "탭"으로 편입(혼합 탭).
      const dstLeaf = T.findLeaf(layout, drop.paneId);
      if (
        (src.kind === 'ide' || src.kind === 'preview') &&
        dstLeaf && dstLeaf.kind === 'terminal' && drop.paneId !== meta.srcId &&
        (drop.zone === 'tabbar' || drop.zone === 'center')
      ) {
        const tab: T.TerminalTab = src.kind === 'ide'
          ? { kind: 'ide', openPath: (src as T.IdeLeaf).openPath || null, ideLayout: (src as T.IdeLeaf).ideLayout, tid: T.newPaneId() }
          // 프리뷰 표면 ID 승계 — pane→탭 전환에도 WebView 인스턴스 유지(승격 레이어 키 동일).
          : { kind: 'preview', url: (src as T.PreviewLeaf).url || null, tid: (src as T.PreviewLeaf).tid || src.id };
        const at = drop.zone === 'tabbar'
          ? Math.max(0, Math.min(dstLeaf.tabs.length, drop.index ?? dstLeaf.tabs.length))
          : dstLeaf.tabs.length;
        const dstTabs = [...dstLeaf.tabs];
        dstTabs.splice(at, 0, tab);
        S2.setTerminalTabs(dstLeaf.id, dstTabs, at);
        S2.closePane(ws2.id, meta.srcId, { keepTerminals: true }); // 터미널 없는 pane — 풀 영향 없음
        S2.focusPane(dstLeaf.id);
        return;
      }
      // 그 외 = pane 통째 — 가운데=스왑, 가장자리=그 방향 분할 이동.
      if (drop.paneId !== meta.srcId) {
        const side = drop.zone === 'center' || drop.zone === 'tabbar' ? null : (drop.zone as T.Side);
        S2.movePane(meta.srcId, drop.paneId, side);
      }
      return;
    }
    const term = src as T.TerminalLeaf;
    const i = meta.tabIndex;
    if (i < 0 || i >= term.tabs.length) return;
    const tab = term.tabs[i];
    const cwd = ws2.localPath || '';

    // 같은 pane 탭바 = 순서 재배치(PC reorderTab — 활성 탭 유지).
    if (drop.zone === 'tabbar' && drop.paneId === meta.srcId) {
      let to = drop.index ?? term.tabs.length;
      to = to > i ? to - 1 : to;
      to = Math.max(0, Math.min(term.tabs.length - 1, to));
      if (to === i) return;
      const activeTab = term.tabs[term.active];
      const tabs = [...term.tabs];
      const [t] = tabs.splice(i, 1);
      tabs.splice(to, 0, t);
      S2.setTerminalTabs(term.id, tabs, Math.max(0, tabs.indexOf(activeTab)));
      return;
    }
    // 자기 pane 가운데 = 변화 없음.
    if (drop.zone === 'center' && drop.paneId === meta.srcId) return;

    // src 에서 탭 제거(+비면 pane 닫기). 공유 풀 모델: 탭 이동 = 링크 이동 — win(풀 인덱스)은 불변,
    //  src pane 뷰에서 unview(풀 터미널 보존), dst pane 뷰는 select(=view, 링크+선택)가 담당.
    const isTerm = T.isTermTab(tab);
    const removeFromSrc = () => {
      const tabs = term.tabs.filter((_, k) => k !== i);
      let act = term.active;
      if (i < act) act -= 1; else if (act >= tabs.length) act = Math.max(0, tabs.length - 1);
      if (isTerm && typeof tab.win === 'number') daemonService.unviewTerminal(cwd, tab.win, term.id).catch(() => {});
      if (!tabs.length) {
        S2.setTerminalTabs(term.id, [], 0);
        S2.closePane(ws2.id, term.id, { keepTerminals: true }); // 터미널은 dst 로 이동했음 — 풀 보존
      } else {
        S2.setTerminalTabs(term.id, tabs, act);
      }
    };

    if (drop.zone === 'tabbar' || drop.zone === 'center') {
      // 다른 터미널 pane 으로 탭 이동(PC moveTab/moveTabToIndex) — 터미널 탭은 링크만 이동(내용 그대로),
      //  IDE/프리뷰 탭은 탭 객체째 이동(tid 유지 → 본문 상태는 새 pane 에서 재생성).
      const dst = T.findLeaf(layout, drop.paneId);
      if (!dst || dst.kind !== 'terminal') return;
      if (isTerm && typeof tab.win !== 'number') return; // 풀 window 미확보 탭('new')은 이동 불가
      // dst 에 이미 같은 탭이 있으면(중복 방지) 그 탭 활성화로 대체.
      const exist = isTerm
        ? dst.tabs.findIndex((t) => T.isTermTab(t) && t.win === tab.win)
        : dst.tabs.findIndex((t) => !T.isTermTab(t) && !!tab.tid && t.tid === tab.tid);
      if (exist >= 0) {
        S2.setTerminalTabs(dst.id, dst.tabs, exist);
        removeFromSrc();
        S2.focusPane(dst.id);
        return;
      }
      const at = drop.zone === 'tabbar'
        ? Math.max(0, Math.min(dst.tabs.length, drop.index ?? dst.tabs.length))
        : dst.tabs.length;
      const dstTabs = [...dst.tabs];
      dstTabs.splice(at, 0, { ...tab });
      S2.setTerminalTabs(dst.id, dstTabs, at); // active 변경 → TerminalPane effect3 이 view(select) 수행
      removeFromSrc();
      S2.focusPane(dst.id);
      return;
    }

    // 가장자리 = 탭을 새 분할 pane 으로(PC moveTabToNewSplit).
    if (term.tabs.length <= 1) {
      // 탭 1개 = pane 통째 이동(뷰 세션이 pane 을 따라가므로 tmux 조작 불필요).
      if (drop.paneId !== meta.srcId) S2.movePane(meta.srcId, drop.paneId, drop.zone as T.Side);
      return;
    }
    let leafNode: T.Leaf;
    if (tab.kind === 'ide') leafNode = { id: T.newPaneId(), kind: 'ide', openPath: tab.openPath || null, ideLayout: tab.ideLayout };
    // 프리뷰 표면 ID(tid) 승계 — 탭→pane 전환에도 WebView 인스턴스 유지.
    else if (tab.kind === 'preview') leafNode = { id: T.newPaneId(), kind: 'preview', url: tab.url || null, tid: tab.tid };
    else {
      if (typeof tab.win !== 'number') return;
      leafNode = { id: T.newPaneId(), kind: 'terminal', tabs: [{ win: tab.win, title: tab.title }], active: 0 };
    }
    S2.insertLeaf(drop.paneId, drop.zone as Exclude<T.Side, null>, leafNode); // 새 pane 스트림이 열리며 링크 생성
    removeFromSrc();
  }, []);

  // cb 는 렌더 간 identity 를 유지해야 한다(useMemo) — 매 렌더 새 객체면 PaneView 의
  //  생성/시작 effect 들이 포커스 변화 같은 무관한 리렌더마다 재구독돼 진행 중 작업이 출렁인다.
  //  deps 의 ws?.id/localPath 는 워크스페이스 전환 시에만 바뀌므로 identity 는 사실상 유지되고,
  //  onNotify 는 ws 를 직접 캡처해 알림 귀속을 고정한다(wsRef.current 는 전환 직후 도착한 알림을
  //  새 워크스페이스로 오귀속시키던 버그). 그 외 최신 상태는 ref(wsRef/rtRef/SRef) 경유로 읽는다.
  const onDragEndCb = useCallback((x: number, y: number) => {
    const meta = dragMetaRef.current; dragMetaRef.current = null; setFinger(null);
    fingerRef.current = null;
    stopAutoScroll();
    setDragSrc(null); // 탭바 스크롤 잠금 해제 + 원본 탭 흐리기 해제
    if (!meta) return;
    const drop = computeDrop(meta, x, y);
    if (!drop) return;
    void applyDrop(meta, drop);
  }, [computeDrop, applyDrop]);
  const cb: PaneCallbacks = React.useMemo(() => ({
    onFocus: (id: string) => SRef.current.focusPane(id),
    onClosePane: (id: string) => { const ws2 = wsRef.current; if (ws2) SRef.current.closePane(ws2.id, id); },
    onTabsChange: (id, tabs, active) => SRef.current.setTerminalTabs(id, tabs, active),
    onDragStart: (srcId: string, label: string, tabIndex: number) => {
      dragMetaRef.current = { srcId, label, tabIndex };
      measureAll(); // pane/탭 rect 일괄 재측정(스테일 좌표 방지)
      setDragSrc({ paneId: srcId, tabIndex }); // 탭바 스크롤 잠금 + 원본 탭 흐리기
      // 탭바 끝단 자동 스크롤 — 손가락이 정지해도 계속 스크롤돼야 하므로 move 이벤트가 아닌 타이머.
      //  스크롤 후엔 탭 rect 가 밀리므로 재측정 + finger 클론으로 인서트 라인 재계산 리렌더.
      stopAutoScroll();
      autoScrollTimerRef.current = setInterval(() => {
        const meta2 = dragMetaRef.current; const f = fingerRef.current;
        if (!meta2 || !f) return;
        const target = paneAt(f.x, f.y);
        if (!target) return;
        const r = getPaneRect(target);
        if (!r || f.y < r.y || f.y > r.y + HEAD_H) return; // 탭바 밴드 안에서만
        const EDGE = 56;
        const dir = f.x < r.x + EDGE ? -1 : f.x > r.x + r.w - EDGE ? 1 : 0;
        if (!dir) return;
        if (getTabScroller(target)?.scrollBy(dir * 16)) {
          measureAll();
          setFinger((p) => (p ? { ...p } : p));
        }
      }, 50);
    },
    onDragMove: (x: number, y: number) => { fingerRef.current = { x, y }; setFinger({ x, y }); },
    onDragEnd: onDragEndCb,
    onPatch: (id: string, patch: Record<string, unknown>) => SRef.current.patchLeaf(id, patch),
    // 풀의 미배치 터미널 입양 — 'new' 탭이 풀에 이미 있는 터미널을 놔두고 새로 만드는 것을 방지.
    //  claimingRef: 동시 다발 pane 들이 같은 window 를 이중 입양하지 않게 5초 예약.
    claimPoolWin: async () => {
      const ws2 = wsRef.current; const rt2 = rtRef.current;
      if (!ws2 || !rt2) return null;
      try {
        const wins = await daemonService.listTerminals(ws2.localPath || '');
        const used = new Set<number>();
        T.eachLeaf(rt2.layout, (l) => { if (l.kind === 'terminal') { for (const t of l.tabs) if (typeof t.win === 'number') used.add(t.win); } });
        for (const w of wins) {
          if (!used.has(w.index) && !claimingRef.current.has(w.index)) {
            claimingRef.current.add(w.index);
            setTimeout(() => claimingRef.current.delete(w.index), 5000);
            return { index: w.index, name: w.name || '' };
          }
        }
      } catch (_) { /* 오프라인 → 생성 폴백 */ }
      return null;
    },
    onNotify: (_id: string, win: number | null, title: string, body: string) => {
      if (!ws) return;
      // 서버 동기화 알림 — POST 는 fire-and-forget, 목록 반영은 서버 echo(notif_event new)가 담당.
      SRef.current.reportNotification({
        source: 'osc',
        title: title || ws.name,
        body,
        workspaceId: ws.id,
        wsName: ws.name,
        cwd: ws.localPath,
        win: typeof win === 'number' ? win : undefined,
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [onDragEndCb, ws?.id, ws?.localPath]);

  // ── 통합 추가(터미널/IDE/웹뷰) — 활성 pane 의 크기·비율로 배치를 자동 결정 + 새 요소 자동 포커스.
  //  · 절반이 최소 크기 이상인 축을 분할(둘 다 되면 긴 축): 가로=우측, 세로=아래.
  //  · 둘 다 부족하고 활성 pane 이 터미널 pane 이면 같은 영역에 탭으로 추가(혼합 탭 — IDE/웹뷰 포함).
  const smartAdd = useCallback((kind: T.PaneKind) => {
    const ws2 = wsRef.current; const rt2 = rtRef.current; const S2 = SRef.current;
    if (!ws2 || !rt2) return;
    const focusId = rt2.focusId || T.firstLeafId(rt2.layout);
    if (!focusId) return;
    const focusLeaf = T.findLeaf(rt2.layout, focusId);
    const r = getPaneRect(focusId);
    const MIN_W = 300, MIN_H = 220;
    const canH = !!r && r.w / 2 >= MIN_W;
    const canV = !!r && (r.h - HEAD_H) / 2 >= MIN_H;
    let side: 'right' | 'bottom' | null = null;
    if (canH && canV) side = r!.w >= r!.h ? 'right' : 'bottom';
    else if (canH) side = 'right';
    else if (canV) side = 'bottom';
    if (!side && focusLeaf?.kind === 'terminal') {
      const tab: T.TerminalTab = kind === 'terminal'
        ? { win: 'new', title: '', fresh: true }
        : kind === 'ide'
          ? { kind: 'ide', openPath: null, tid: T.newPaneId() }
          : { kind: 'preview', url: '', tid: T.newPaneId() };
      const tabs: T.TerminalTab[] = [...focusLeaf.tabs, tab];
      S2.setTerminalTabs(focusId, tabs, tabs.length - 1);
      S2.focusPane(focusId);
      return;
    }
    const node: T.Leaf = kind === 'terminal'
      ? { id: T.newPaneId(), kind: 'terminal', tabs: [{ win: 'new', title: '', fresh: true }], active: 0 }
      : T.leaf(kind, kind === 'preview' ? { url: '' } : {});
    // insertLeaf 가 새 leaf 를 focusId 로 지정 → 자동 포커스.
    S2.insertLeaf(focusId, side || (r && r.h > r.w ? 'bottom' : 'right'), node);
  }, []);

  const onGridLayout = useCallback(() => {
    // measure 의 pageX/pageY = 터치와 같은 좌표계 — 고스트/하이라이트의 그리드 로컬 변환용.
    gridRef.current?.measure((_x, _y, _w, _h, px, py) => { gridOriginRef.current = { x: px, y: py }; });
  }, []);

  // 드래그 중 존 하이라이트/인서트 라인/고스트 계산(화면좌표 → 그리드 로컬) — PC drop-zone/tab-insert 미러.
  const meta = dragMetaRef.current;
  let hl: { left: number; top: number; width: number; height: number } | null = null;
  let ins: { left: number; top: number } | null = null;
  let ghost: { left: number; top: number } | null = null;
  if (finger && meta) {
    const go = gridOriginRef.current;
    ghost = { left: finger.x - go.x, top: finger.y - go.y };
    const drop = computeDrop(meta, finger.x, finger.y);
    const r = drop ? getPaneRect(drop.paneId) : undefined;
    const layout = rt?.layout || null;
    const srcLeaf = layout ? T.findLeaf(layout, meta.srcId) : null;
    const dstLeaf = drop && layout ? T.findLeaf(layout, drop.paneId) : null;
    if (drop && r && srcLeaf && dstLeaf) {
      // 표시는 "실제 드랍 결과" 기준으로 보정(applyDrop 의 분기 미러 — 적용 로직은 그대로):
      //  · no-op 드랍(자기 pane 통째/단일 탭, 비터미널 pane 가운데로 탭 이동)은 숨김/제자리 표시
      //  · src pane 이 사라지는 드랍은 형제 확장 후(rectAfterRemoval)의 rect 로 존을 그린다.
      const wholePane = srcLeaf.kind !== 'terminal' || meta.tabIndex < 0;
      const self = drop.paneId === meta.srcId;
      const singleTab = srcLeaf.kind === 'terminal' && srcLeaf.tabs.length <= 1;
      let zone = drop.zone;
      let removed = false; // 이 드랍으로 src pane 이 사라지는가
      let valid = true;
      if (self) {
        // 자기 자신: 통째/단일 탭은 어디 놓아도 no-op → 제자리(pane 전체) 표시.
        //  다중 탭 pane 의 가장자리 분할·탭바 재배치는 실제 동작이므로 그대로.
        if (zone !== 'tabbar' && (wholePane || singleTab)) zone = 'center';
      } else if (wholePane) {
        // IDE/프리뷰 pane → 터미널 pane 탭바/가운데 = 탭 편입(src 제거), 그 외 가운데 = 스왑(유지),
        //  가장자리 = movePane(src 제거 후 분할).
        const join = (srcLeaf.kind === 'ide' || srcLeaf.kind === 'preview') && dstLeaf.kind === 'terminal' && (zone === 'tabbar' || zone === 'center');
        removed = join || (zone !== 'tabbar' && zone !== 'center');
      } else {
        // 터미널 pane 의 탭 드래그: 비터미널 pane 가운데는 이동 불가(no-op) → 숨김.
        if (zone === 'center' && dstLeaf.kind !== 'terminal') valid = false;
        removed = singleTab && zone !== 'tabbar'; // 마지막 탭 이동 = src pane 닫힘
      }
      if (valid) {
        if (zone === 'tabbar' && typeof drop.lineX === 'number') {
          ins = { left: drop.lineX - go.x - 1, top: r.y - go.y + 4 };
        } else {
          const base = (removed && layout ? T.rectAfterRemoval(layout, meta.srcId, drop.paneId, getPaneRect) : null) || r;
          let lx = base.x - go.x, ly = base.y - go.y, lw = base.w, lh = base.h;
          if (zone === 'left') lw = base.w / 2;
          else if (zone === 'right') { lx += base.w / 2; lw = base.w / 2; }
          else if (zone === 'top') lh = base.h / 2;
          else if (zone === 'bottom') { ly += base.h / 2; lh = base.h / 2; }
          hl = { left: lx, top: ly, width: lw, height: lh };
        }
      }
    }
  }

  return (
    // 상단 세이프에어리어 인셋을 헤더와 같은 surface 로(사이드바 인셋과 색 통일)
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: C.surface }}>
      {/* main-top — 사이드바 접힘 시 PC 처럼 상단 컨트롤(토글·벨·+)+구분선이 여기로 붙는다(아이콘 유지). */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, paddingHorizontal: 8, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border }}>
        {showOpen ? (
          // 접힘 시 축약 컨트롤(토글·알림) — 워크스페이스 추가(+)는 사이드바를 열어야 보인다.
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
            <MtBtn onPress={onOpenSidebar}><SidebarSimple size={20} color={C.text2} /></MtBtn>
            <MtBtn onPress={onOpenSidebar}><Bell size={20} color={C.text2} /></MtBtn>
            <View style={{ width: 1, height: 20, backgroundColor: C.border, marginLeft: 4 }} />
          </View>
        ) : null}
        <Text numberOfLines={1} style={{ flexShrink: 1, color: C.text, fontSize: 14, fontWeight: '700', fontFamily: v2.font.sans }}>
          {ws ? ws.name : '워크스페이스'}
        </Text>
        <View style={{ flex: 1 }} />
        {/* 통합 추가 버튼 — 활성 pane 기준 자동 배치(우측/아래/같은 영역 탭) + 자동 포커스 */}
        {ws && rt ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
            <MtBtn onPress={() => smartAdd('terminal')}><TerminalWindow size={19} color={C.text2} /></MtBtn>
            <MtBtn onPress={() => smartAdd('ide')}><Code size={19} color={C.text2} /></MtBtn>
            <MtBtn onPress={() => smartAdd('preview')}><Globe size={19} color={C.text2} /></MtBtn>
          </View>
        ) : null}
      </View>

      {/* pane 그리드 */}
      <View ref={gridRef} onLayout={onGridLayout} style={{ flex: 1, backgroundColor: C.base }}>
        {!ws || !rt ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <Text style={{ color: C.textDim, fontSize: 13, textAlign: 'center' }}>
              워크스페이스를 선택하거나 추가하세요
            </Text>
          </View>
        ) : (
          <SplitNode key={ws.id} node={rt.layout} ws={ws} focusId={rt.focusId} cb={cb} path={[]} onSetRatio={S.setRatio} />
        )}

        {/* 프리뷰 승격 레이어 — WebView 를 pane 트리 밖에 상주시켜 탭 재배치/분할 이동에도
            인스턴스(페이지·테마·개발자도구)가 유지된다. 드래그 오버레이보다 아래. */}
        {ws && rt ? <PreviewHostLayer /> : null}

        {/* 드래그 오버레이(존 하이라이트 + 탭 인서트 라인 + 고스트) — PC drop-zone/tab-insert/tab-ghost 미러 */}
        {finger && meta ? (
          <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }}>
            {hl ? (
              <View style={{ position: 'absolute', left: hl.left, top: hl.top, width: hl.width, height: hl.height, backgroundColor: C.accentTint, borderWidth: 2, borderColor: C.accent, borderRadius: 4 }} />
            ) : null}
            {ins ? (
              <View style={{ position: 'absolute', left: ins.left, top: ins.top, width: 2, height: HEAD_H - 8, backgroundColor: C.accent, borderRadius: 2 }} />
            ) : null}
            {ghost ? (
              <View style={{ position: 'absolute', left: ghost.left + 12, top: ghost.top + 12, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: C.elevated2, borderRadius: 6, borderWidth: 1, borderColor: C.border }}>
                <Text style={{ color: C.text, fontSize: 12 }} numberOfLines={1}>{meta.label}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

// 재귀 분할 렌더 — branch=flex row/column + 드래그 리사이즈 분할선, leaf=PaneView.
function SplitNode({
  node, ws, focusId, cb, path, onSetRatio,
}: {
  node: TilingNode;
  ws: WorkspaceMeta;
  focusId: string | null;
  cb: PaneCallbacks;
  path: Array<'first' | 'second'>;
  onSetRatio: (branchPath: Array<'first' | 'second'>, ratio: number) => void;
}) {
  if (T.isLeaf(node)) {
    return <PaneView key={node.id} node={node as Leaf} ws={ws} focused={node.id === focusId} cb={cb} />;
  }
  return <SplitBranch node={node} ws={ws} focusId={focusId} cb={cb} path={path} onSetRatio={onSetRatio} />;
}

function SplitBranch({
  node, ws, focusId, cb, path, onSetRatio,
}: {
  node: Extract<TilingNode, { dir: 'h' | 'v' }>;
  ws: WorkspaceMeta;
  focusId: string | null;
  cb: PaneCallbacks;
  path: Array<'first' | 'second'>;
  onSetRatio: (branchPath: Array<'first' | 'second'>, ratio: number) => void;
}) {
  const isRow = node.dir === 'h';
  const sizeRef = useRef(0);            // 컨테이너 주축 길이(px)
  const startRatioRef = useRef(node.ratio);
  const [dragging, setDragging] = useState(false);
  // 드래그 중 즉시 반영용 로컬 ratio(놓을 때 setRatio 로 확정 영속).
  const [liveRatio, setLiveRatio] = useState<number | null>(null);
  const ratio = liveRatio ?? node.ratio;

  // PanResponder 는 최초 1회 생성 → 최신 값(ratio/path/콜백)을 ref 로 참조(stale 클로저 방지).
  const ratioRef = useRef(node.ratio); ratioRef.current = node.ratio;
  const pathRef = useRef(path); pathRef.current = path;
  const setRatioRef = useRef(onSetRatio); setRatioRef.current = onSetRatio;
  const isRowRef = useRef(isRow); isRowRef.current = isRow;

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    sizeRef.current = isRow ? e.nativeEvent.layout.width : e.nativeEvent.layout.height;
  }, [isRow]);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(isRowRef.current ? g.dx : g.dy) > 2,
      onPanResponderGrant: () => { startRatioRef.current = ratioRef.current; setDragging(true); },
      onPanResponderMove: (_e, g) => {
        const size = sizeRef.current || 1;
        const delta = (isRowRef.current ? g.dx : g.dy) / size;
        setLiveRatio(Math.max(0.1, Math.min(0.9, startRatioRef.current + delta)));
      },
      onPanResponderRelease: (_e, g) => {
        const size = sizeRef.current || 1;
        const delta = (isRowRef.current ? g.dx : g.dy) / size;
        const r = Math.max(0.1, Math.min(0.9, startRatioRef.current + delta));
        setRatioRef.current(pathRef.current, r);
        setLiveRatio(null);
        setDragging(false);
      },
      onPanResponderTerminate: () => { setLiveRatio(null); setDragging(false); },
    }),
  ).current;

  // 분할선 — 평소엔 PC 처럼 1px 헤어라인만(여백 없음), 잡았을 때만 사이드바 리사이저처럼 액센트 밴드.
  //  히트존(HIT)은 음수 마진으로 양쪽 pane 위에 겹친다: 콘텐츠 쪽(first)으로 넓게, 다음 pane 의
  //  탭바 쪽(second)으로는 4dp 만 — 탭 터치를 최대한 안 가리면서 잡기는 쉽게.
  //  레이아웃 순소비 = HIT - FAR - NEAR = 1px(헤어라인 자리).
  const HIT = 16;
  const FAR = 11;  // first(콘텐츠) 쪽 겹침
  const NEAR = 4;  // second(탭바) 쪽 겹침
  return (
    <View style={{ flex: 1, flexDirection: isRow ? 'row' : 'column' }} onLayout={onLayout}>
      <View style={{ flex: ratio }}>
        <SplitNode node={node.first} ws={ws} focusId={focusId} cb={cb} path={[...path, 'first']} onSetRatio={onSetRatio} />
      </View>
      <View
        {...pan.panHandlers}
        style={{
          width: isRow ? HIT : undefined,
          height: isRow ? undefined : HIT,
          marginLeft: isRow ? -FAR : 0,
          marginRight: isRow ? -NEAR : 0,
          marginTop: isRow ? 0 : -FAR,
          marginBottom: isRow ? 0 : -NEAR,
          zIndex: 10,
        }}
      >
        {/* 경계선(pane 사이 1px) — 히트존 내 FAR 위치가 실제 경계 */}
        <View style={{
          position: 'absolute',
          left: isRow ? FAR : 0,
          right: isRow ? undefined : 0,
          top: isRow ? 0 : FAR,
          bottom: isRow ? 0 : undefined,
          width: isRow ? 1 : undefined,
          height: isRow ? undefined : 1,
          backgroundColor: C.border,
        }} />
        {dragging ? (
          <View style={{
            position: 'absolute',
            left: isRow ? FAR - 1 : 0,
            right: isRow ? undefined : 0,
            top: isRow ? 0 : FAR - 1,
            bottom: isRow ? 0 : undefined,
            width: isRow ? 3 : undefined,
            height: isRow ? undefined : 3,
            backgroundColor: C.accent,
            opacity: 0.6,
          }} />
        ) : null}
      </View>
      <View style={{ flex: 1 - ratio }}>
        <SplitNode node={node.second} ws={ws} focusId={focusId} cb={cb} path={[...path, 'second']} onSetRatio={onSetRatio} />
      </View>
    </View>
  );
}
