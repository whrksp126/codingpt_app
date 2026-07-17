import React, { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { v2 } from '../theme/v2Tokens';
import { useDrawer } from '../contexts/DrawerContext';
import { useWorkspaceShell, NotifItem } from '../contexts/WorkspaceShellContext';
import * as T from '../workspace/tiling';
import { collapseKeyAssist, KeyAssistOverlay } from './keyboard/KeyAssist';

const C = v2.colors;

// 알림 드롭다운 패널 — 셸에 1회 마운트(사이드바 안에 있던 것을 분리).
//  사이드바가 닫혀 있어도 헤더 벨에서 바로 열 수 있다(벨=사이드바 열기였던 버그의 근본 수정).
//  열림 상태는 모듈 스토어 — 사이드바/헤더 어느 벨에서든 openNotifPanel() 호출.

let panelOpen = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => { try { fn(); } catch (_) { /* noop */ } });

export function openNotifPanel(): void {
  collapseKeyAssist(); // 알림 패널 = 오버레이 — 키보드/특수키 패널 내림(사용자 확정 스펙)
  panelOpen = true;
  emit();
}
export function closeNotifPanel(): void {
  if (!panelOpen) return;
  panelOpen = false;
  emit();
}

export default function NotificationsPanel() {
  const S = useWorkspaceShell();
  const { open: drawerOpen, closeDrawer } = useDrawer();
  const [visible, setVisible] = useState(panelOpen);
  useEffect(() => {
    const fn = () => setVisible(panelOpen);
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);

  // 알림 클릭 — 읽음 처리 + 대상 워크스페이스 활성화 + win 이 배치된 pane/탭으로 점프.
  const jumpNotif = useCallback((n: NotifItem) => {
    closeNotifPanel();
    S.markNotifRead([n.id]);
    const w = S.workspaces.find((x) => x.id === n.workspaceId || (!!n.cwd && x.localPath === n.cwd));
    if (!w) { if (drawerOpen) closeDrawer(); return; }
    const jumpPane = () => {
      if (typeof n.win !== 'number') return;
      const rt = S.wsRuntime(w.id);
      if (!rt?.layout) return;
      // 알림의 win 을 탭으로 가진 터미널 leaf 를 찾아 포커스 + 그 탭 활성화. 없으면 ws 활성화만.
      const found: T.TerminalLeaf[] = [];
      T.eachLeaf(rt.layout, (l) => {
        if (!found.length && l.kind === 'terminal' && l.tabs.some((t) => t.win === n.win)) found.push(l);
      });
      const leaf = found[0];
      if (!leaf) return;
      const idx = leaf.tabs.findIndex((t) => t.win === n.win);
      if (idx >= 0 && idx !== leaf.active) S.setTerminalTabs(leaf.id, leaf.tabs, idx);
      S.focusPane(leaf.id);
    };
    if (S.activeWsId === w.id) jumpPane();
    else {
      S.setActive(w.id);
      // setActive 커밋(activeWsIdRef 갱신) 이후에 pane 조작 — 즉시 호출하면 이전 ws 런타임을 만진다.
      setTimeout(jumpPane, 80);
    }
    if (drawerOpen) closeDrawer();
  }, [S, drawerOpen, closeDrawer]);

  return (
    <Modal supportedOrientations={['portrait', 'portrait-upside-down', 'landscape', 'landscape-left', 'landscape-right']} visible={visible} transparent animationType="fade" onRequestClose={closeNotifPanel}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' }} onPress={closeNotifPanel}>
        {/* PC 처럼 벨 아래 컴팩트 드롭다운 카드(전체폭 X) */}
        <SafeAreaView edges={['top']} style={{ position: 'absolute', top: 0, left: 0 }}>
          <Pressable style={{ marginLeft: 8, marginTop: 46, width: 300, backgroundColor: C.elevated, borderRadius: v2.radius.md, borderWidth: 1, borderColor: C.border, maxHeight: 420, overflow: 'hidden' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border }}>
              <Text style={{ flex: 1, color: C.text, fontSize: 14, fontWeight: '700' }}>알림</Text>
              {S.notifications.length ? (
                <Pressable onPress={() => S.markAllRead()} hitSlop={6}><Text style={{ color: C.accent, fontSize: 12 }}>모두 읽음</Text></Pressable>
              ) : null}
            </View>
            <ScrollView style={{ maxHeight: 400 }}>
              {S.notifications.length === 0 ? (
                <Text style={{ color: C.textDim, fontSize: 12.5, padding: 20, textAlign: 'center' }}>알림이 없습니다</Text>
              ) : (
                S.notifications.map((n) => {
                  // 워크스페이스 라벨 — 서버 저장 wsName 우선, 없으면 workspaceId/cwd 로 로컬 매칭.
                  const wsName = n.wsName
                    || S.workspaces.find((w) => w.id === n.workspaceId || (!!n.cwd && w.localPath === n.cwd))?.name
                    || '';
                  const t = new Date(n.ts);
                  const hhmm = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
                  return (
                    <Pressable key={String(n.id)} onPress={() => jumpNotif(n)} android_ripple={{ color: C.elevated2 }}
                      style={{ paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: n.read ? 'transparent' : C.accentTint }}>
                      {/* 3단: title(굵게) / subtitle / body(2줄) + 메타(wsName·시간) */}
                      {n.title ? <Text style={{ color: C.text, fontSize: 13, fontWeight: '600' }} numberOfLines={1}>{n.title}</Text> : null}
                      {n.subtitle ? <Text style={{ color: C.text2, fontSize: 12, marginTop: 2 }} numberOfLines={1}>{n.subtitle}</Text> : null}
                      {n.body ? <Text style={{ color: C.text2, fontSize: 12, marginTop: 2 }} numberOfLines={2}>{n.body}</Text> : null}
                      <Text style={{ color: C.textDim, fontSize: 10.5, marginTop: 3 }}>{wsName ? `${wsName} · ` : ''}{hhmm}</Text>
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
          </Pressable>
        </SafeAreaView>
      </Pressable>
      {/* Modal 은 독립 네이티브 레이어 — 보조키 오버레이 별도 마운트 규칙 유지 */}
      <KeyAssistOverlay inModal />
    </Modal>
  );
}
