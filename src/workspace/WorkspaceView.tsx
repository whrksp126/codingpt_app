import React, { useCallback, useRef, useState } from 'react';
import { View, Text, Pressable, PanResponder, LayoutChangeEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FolderSimple, SidebarSimple } from 'phosphor-react-native';
import { v2 } from '../theme/v2Tokens';
import { useWorkspaceShell } from '../contexts/WorkspaceShellContext';
import { useDrawer } from '../contexts/DrawerContext';
import { useResponsive } from '../hooks/useResponsive';
import * as T from './tiling';
import type { TilingNode, Leaf } from './tiling';
import PaneView, { PaneCallbacks } from './PaneView';
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

  const cb: PaneCallbacks = {
    onFocus: useCallback((id: string) => S.focusPane(id), [S]),
    onSplit: useCallback((id: string, dir: 'h' | 'v') => S.splitPane(id, dir, 'terminal'), [S]),
    onOpenIde: useCallback((id: string) => S.splitPane(id, 'h', 'ide'), [S]),
    onOpenPreview: useCallback((id: string) => S.splitPane(id, 'h', 'preview'), [S]),
    onClosePane: useCallback((id: string) => { if (ws) S.closePane(ws.id, id); }, [S, ws]),
    onTabsChange: useCallback((id, tabs, active) => S.setTerminalTabs(id, tabs, active), [S]),
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: C.base }}>
      {/* main-top */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, paddingHorizontal: 10, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border }}>
        {showOpen ? (
          <Pressable onPress={onOpenSidebar} hitSlop={6} style={{ width: 32, height: 32, borderRadius: v2.radius.md, alignItems: 'center', justifyContent: 'center' }}>
            <SidebarSimple size={20} color={C.text2} />
          </Pressable>
        ) : null}
        <FolderSimple size={16} color={C.accent} weight="fill" />
        <Text numberOfLines={1} style={{ color: C.text, fontSize: 14, fontWeight: '700', fontFamily: v2.font.sans }}>
          {ws ? ws.name : '워크스페이스'}
        </Text>
        {ws?.localPath ? (
          <Text numberOfLines={1} style={{ color: C.textDim, fontSize: 11.5, fontFamily: v2.font.mono, flexShrink: 1 }}>~/{ws.localPath}</Text>
        ) : null}
      </View>

      {/* pane 그리드 */}
      <View style={{ flex: 1, backgroundColor: C.base }}>
        {!ws || !rt ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <Text style={{ color: C.textDim, fontSize: 13, textAlign: 'center' }}>
              워크스페이스를 선택하거나{'\n'}+ 로 새로 만드세요
            </Text>
          </View>
        ) : (
          <SplitNode node={rt.layout} ws={ws} focusId={rt.focusId} cb={cb} path={[]} onSetRatio={S.setRatio} />
        )}
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
