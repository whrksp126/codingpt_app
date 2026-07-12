import React, { useCallback } from 'react';
import { View, Text, Pressable } from 'react-native';
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
          <SplitNode node={rt.layout} ws={ws} focusId={rt.focusId} cb={cb} />
        )}
      </View>
    </SafeAreaView>
  );
}

// 재귀 분할 렌더 — branch=flex row/column(정적 ratio), leaf=PaneView.
function SplitNode({ node, ws, focusId, cb }: { node: TilingNode; ws: WorkspaceMeta; focusId: string | null; cb: PaneCallbacks }) {
  if (T.isLeaf(node)) {
    return <PaneView node={node as Leaf} ws={ws} focused={node.id === focusId} cb={cb} />;
  }
  const isRow = node.dir === 'h';
  return (
    <View style={{ flex: 1, flexDirection: isRow ? 'row' : 'column' }}>
      <View style={{ flex: node.ratio }}>
        <SplitNode node={node.first} ws={ws} focusId={focusId} cb={cb} />
      </View>
      <View style={{ width: isRow ? 1 : undefined, height: isRow ? undefined : 1, backgroundColor: C.border }} />
      <View style={{ flex: 1 - node.ratio }}>
        <SplitNode node={node.second} ws={ws} focusId={focusId} cb={cb} />
      </View>
    </View>
  );
}
