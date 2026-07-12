import React, { useCallback, useRef, useState } from 'react';
import { View, Text, Pressable, PanResponder, LayoutChangeEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Folder, SidebarSimple } from 'phosphor-react-native';
import { v2 } from '../theme/v2Tokens';
import { useWorkspaceShell } from '../contexts/WorkspaceShellContext';
import { useDrawer } from '../contexts/DrawerContext';
import { useResponsive } from '../hooks/useResponsive';
import * as T from './tiling';
import type { TilingNode, Leaf } from './tiling';
import PaneView, { PaneCallbacks } from './PaneView';
import { paneAt, dropZone, getPaneRect, DropZone } from './paneRegistry';
import type { WorkspaceMeta } from '../services/workspaceService';

const C = v2.colors;

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

  // ── pane 드래그 상태 ── (그립 PanResponder 는 최초 cb 를 캡처하므로 콜백은 stable, 값은 ref/state)
  const dragMetaRef = useRef<{ srcId: string; label: string } | null>(null);
  const [finger, setFinger] = useState<{ x: number; y: number } | null>(null);
  const gridOriginRef = useRef({ x: 0, y: 0 });
  const gridRef = useRef<View>(null);
  const movePaneRef = useRef(S.movePane); movePaneRef.current = S.movePane;

  const cb: PaneCallbacks = {
    onFocus: useCallback((id: string) => S.focusPane(id), [S]),
    onSplit: useCallback((id: string, dir: 'h' | 'v') => S.splitPane(id, dir, 'terminal'), [S]),
    onOpenIde: useCallback((id: string) => S.splitPane(id, 'h', 'ide'), [S]),
    onOpenPreview: useCallback((id: string) => S.splitPane(id, 'h', 'preview'), [S]),
    onClosePane: useCallback((id: string) => { if (ws) S.closePane(ws.id, id); }, [S, ws]),
    onTabsChange: useCallback((id, tabs, active) => S.setTerminalTabs(id, tabs, active), [S]),
    onDragStart: useCallback((srcId: string, label: string) => { dragMetaRef.current = { srcId, label }; }, []),
    onDragMove: useCallback((x: number, y: number) => { setFinger({ x, y }); }, []),
    onDragEnd: useCallback((x: number, y: number) => {
      const meta = dragMetaRef.current; dragMetaRef.current = null; setFinger(null);
      if (!meta) return;
      const target = paneAt(x, y);
      if (!target || target === meta.srcId) return;
      const zone = dropZone(target, x, y);
      movePaneRef.current(meta.srcId, target, zone === 'center' ? null : zone);
    }, []),
    onPatch: useCallback((id: string, patch: Record<string, unknown>) => S.patchLeaf(id, patch), [S]),
    onNotify: useCallback((id: string, title: string, body: string) => {
      if (ws) S.pushNotification({ wsId: ws.id, paneId: id, title: title || ws.name, body });
    }, [S, ws]),
  };

  const onGridLayout = useCallback(() => {
    gridRef.current?.measureInWindow((x, y) => { gridOriginRef.current = { x, y }; });
  }, []);

  // 드래그 중 하이라이트/고스트 계산(화면좌표 → 그리드 로컬).
  const meta = dragMetaRef.current;
  let hl: { left: number; top: number; width: number; height: number } | null = null;
  let ghost: { left: number; top: number } | null = null;
  if (finger && meta) {
    const go = gridOriginRef.current;
    ghost = { left: finger.x - go.x, top: finger.y - go.y };
    const t = paneAt(finger.x, finger.y);
    if (t && t !== meta.srcId) {
      const r = getPaneRect(t);
      if (r) {
        const z: DropZone = dropZone(t, finger.x, finger.y);
        let lx = r.x - go.x, ly = r.y - go.y, lw = r.w, lh = r.h;
        if (z === 'left') lw = r.w / 2;
        else if (z === 'right') { lx = r.x - go.x + r.w / 2; lw = r.w / 2; }
        else if (z === 'top') lh = r.h / 2;
        else if (z === 'bottom') { ly = r.y - go.y + r.h / 2; lh = r.h / 2; }
        hl = { left: lx, top: ly, width: lw, height: lh };
      }
    }
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: C.base }}>
      {/* main-top */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, paddingHorizontal: 10, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border }}>
        {showOpen ? (
          <Pressable onPress={onOpenSidebar} hitSlop={6} style={{ width: 32, height: 32, borderRadius: v2.radius.md, alignItems: 'center', justifyContent: 'center' }}>
            <SidebarSimple size={20} color={C.text2} />
          </Pressable>
        ) : null}
        <Folder size={16} color={C.accent} />
        <Text numberOfLines={1} style={{ color: C.text, fontSize: 14, fontWeight: '700', fontFamily: v2.font.sans }}>
          {ws ? ws.name : '워크스페이스'}
        </Text>
        {ws?.localPath ? (
          <Text numberOfLines={1} style={{ color: C.textDim, fontSize: 11.5, fontFamily: v2.font.mono, flexShrink: 1 }}>~/{ws.localPath}</Text>
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

        {/* 드래그 오버레이(존 하이라이트 + 고스트) */}
        {finger && meta ? (
          <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }}>
            {hl ? (
              <View style={{ position: 'absolute', left: hl.left, top: hl.top, width: hl.width, height: hl.height, backgroundColor: C.accentTint, borderWidth: 2, borderColor: C.accent, borderRadius: 4 }} />
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
    return <PaneView node={node as Leaf} ws={ws} focused={node.id === focusId} cb={cb} />;
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

  // 분할선(터치 영역 넉넉히, 시각 라인 얇게).
  const HIT = 16;
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
          marginLeft: isRow ? -HIT / 2 : 0,
          marginTop: isRow ? 0 : -HIT / 2,
          alignItems: 'center', justifyContent: 'center', zIndex: 10,
        }}
      >
        <View style={{
          width: isRow ? (dragging ? 2 : 1) : '100%',
          height: isRow ? '100%' : (dragging ? 2 : 1),
          backgroundColor: dragging ? C.accent : C.border,
        }} />
      </View>
      <View style={{ flex: 1 - ratio }}>
        <SplitNode node={node.second} ws={ws} focusId={focusId} cb={cb} path={[...path, 'second']} onSetRatio={onSetRatio} />
      </View>
    </View>
  );
}
