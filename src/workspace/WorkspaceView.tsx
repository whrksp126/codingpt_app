import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FolderSimple, SidebarSimple } from 'phosphor-react-native';
import { v2 } from '../theme/v2Tokens';
import { useWorkspaceShell } from '../contexts/WorkspaceShellContext';
import { useDrawer } from '../contexts/DrawerContext';
import { useResponsive } from '../hooks/useResponsive';

const C = v2.colors;

// WorkspaceView — PC codingpt_pc/src/js/workspace-view.js 미러(스캐폴드).
//   P1: main-top 헤더 + 빈/플레이스홀더 본문. P2 에서 실제 터미널 pane, P3 에서 타일 그리드.
export default function WorkspaceView() {
  const S = useWorkspaceShell();
  const { isWide } = useResponsive();
  const { openDrawer, dockedOpen, toggleDocked } = useDrawer();
  const ws = S.activeWs();

  // collapsed(폰 드로어 닫힘 / 태블릿 도킹 접힘) 시 상단바에서 사이드바 열기.
  const showOpen = !isWide || !dockedOpen;
  const onOpenSidebar = () => (isWide ? toggleDocked() : openDrawer());

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

      {/* 본문 */}
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        {!ws ? (
          <Text style={{ color: C.textDim, fontSize: 13, textAlign: 'center' }}>
            워크스페이스를 선택하거나{'\n'}+ 로 새로 만드세요
          </Text>
        ) : (
          <View style={{ alignItems: 'center', gap: 8 }}>
            <Text style={{ color: C.text2, fontSize: 13, fontWeight: '600' }}>{ws.name}</Text>
            <Text style={{ color: C.textDim, fontSize: 12, textAlign: 'center' }}>
              터미널·IDE·프리뷰 pane 준비 중{'\n'}(P2 터미널 라이브 미러)
            </Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}
