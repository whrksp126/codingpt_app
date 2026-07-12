import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, ScrollView, RefreshControl, TextInput, Modal, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  SidebarSimple, Bell, Plus, Gear, Laptop, Cloud, GitBranch,
  PushPin, PencilSimple, Palette, ArrowUp, ArrowDown, ArrowLineUp, X,
} from 'phosphor-react-native';
import { v2 } from '../theme/v2Tokens';
import { useDrawer } from '../contexts/DrawerContext';
import { useMyInfo } from '../contexts/MyInfoContext';
import { useUser } from '../contexts/UserContext';
import { useResponsive } from '../hooks/useResponsive';
import { useDaemonStatus } from '../hooks/useDaemonStatus';
import { useWorkspaceShell } from '../contexts/WorkspaceShellContext';
import workspaceService, { WorkspaceMeta } from '../services/workspaceService';
import { haptic } from '../animations/haptics';

const C = v2.colors;

// 색상 스와치(PC WS_COLORS 동일).
const WS_COLORS: Array<{ label: string; value: string }> = [
  { label: '없음', value: '' },
  { label: '빨강', value: '#f87171' },
  { label: '주황', value: '#fb923c' },
  { label: '초록', value: '#34d399' },
  { label: '파랑', value: '#60a5fa' },
  { label: '보라', value: '#a78bfa' },
  { label: '분홍', value: '#f472b6' },
];

// 좌측 사이드바 — PC codingpt_pc/src/js/sidebar.js 미러.
//  구조: 상단 컨트롤(토글·알림·+) → 워크스페이스 행(핀/색/이름/호스트 배지) → footer 내 정보.
//  overlay=true(폰)면 이동 후 드로어 닫음. docked(태블릿)면 유지.
export default function SidebarContent({ overlay = false }: { overlay?: boolean }) {
  const { closeDrawer, toggleDocked } = useDrawer();
  const { openSheet } = useMyInfo();
  const { isWide } = useResponsive();
  const { user } = useUser();
  const { localOnline } = useDaemonStatus();
  const S = useWorkspaceShell();

  const [refreshing, setRefreshing] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [menuWs, setMenuWs] = useState<WorkspaceMeta | null>(null);
  const [creating, setCreating] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  const afterNav = useCallback(() => { if (overlay) closeDrawer(); }, [overlay, closeDrawer]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    S.loadWorkspaces().finally(() => setRefreshing(false));
  }, [S]);

  const onSelect = useCallback((w: WorkspaceMeta) => {
    haptic.select();
    S.setActive(w.id);
    afterNav();
  }, [S, afterNav]);

  // + 새 워크스페이스 — 생성 방식 선택 시트(내 PC 폴더 선택 / GitHub / 클라우드). 셸 레벨 NewWorkspaceSheet 가 처리.
  const onNewWorkspace = useCallback(() => {
    if (overlay) closeDrawer();
    S.openNewWs();
  }, [overlay, closeDrawer, S]);

  const onBell = useCallback(() => { setNotifOpen(true); }, []);
  const jumpNotif = useCallback((wsId: string, paneId?: string | null) => {
    setNotifOpen(false);
    S.setActive(wsId);
    if (paneId) S.focusPane(paneId);
    afterNav();
  }, [S, afterNav]);

  // 내 정보 = PC 미러 설정 모달(일반/계정/정보). 기존 MyInfoSheet 대신 SettingsModal 오픈.
  const openMyInfo = useCallback(() => { if (overlay) closeDrawer(); S.openSettings(); }, [overlay, closeDrawer, S]);

  const startRename = useCallback((w: WorkspaceMeta) => {
    setMenuWs(null);
    setRenameText(S.wsDisplayName(w));
    setRenaming(w.id);
  }, [S]);
  const commitRename = useCallback(() => {
    if (renaming) S.renameWs(renaming, renameText);
    setRenaming(null);
  }, [renaming, renameText, S]);

  const nickname = (user as any)?.nickname || (user as any)?.name || '코더';
  const email = (user as any)?.email || '';
  const avatar = String(nickname).trim().charAt(0) || '코';

  const rows = S.sortedWorkspaces();

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: C.surface }}>
      {/* ── 상단 컨트롤(토글·알림·+) ── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingTop: 8, paddingBottom: 6, gap: 2 }}>
        <CtlBtn onPress={() => (overlay ? closeDrawer() : toggleDocked())}><SidebarSimple size={20} color={C.text2} /></CtlBtn>
        <CtlBtn onPress={onBell}>
          <Bell size={20} color={C.text2} />
          {S.notifications.some((n) => !n.read) ? <Badge n={S.notifications.filter((n) => !n.read).length} /> : null}
        </CtlBtn>
        {/* PC 처럼 [사이드바·벨·+] 왼쪽으로 묶음 */}
        <CtlBtn onPress={onNewWorkspace} disabled={creating}><Plus size={20} color={C.accent} weight="bold" /></CtlBtn>
        <View style={{ flex: 1 }} />
        {overlay ? (
          <CtlBtn onPress={closeDrawer}><X size={19} color={C.text2} /></CtlBtn>
        ) : null}
      </View>

      {/* ── 워크스페이스 목록 ── */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: 12, paddingTop: 2 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} colors={[C.accent]} progressBackgroundColor={C.surface} />}
      >
        {rows.length === 0 ? (
          <Text style={{ color: C.textDim, fontSize: 12.5, paddingHorizontal: 14, paddingVertical: 14, lineHeight: 19 }}>
            {S.wsError && !S.workspaces.length
              ? '목록을 불러오지 못했어요.\n아래로 당겨 새로고침하세요.'
              : '+ 로 워크스페이스를 추가하세요'}
          </Text>
        ) : (
          rows.map((w) => {
            const active = w.id === S.activeWsId;
            const local = S.isLocal(w);
            const color = S.wsColor(w.id);
            const pinned = S.wsPinned(w.id);
            const unread = S.unreadForWs(w.id);
            const rt = S.wsRuntime(w.id);
            const online = local ? (w.hostOnline ?? localOnline) : true;
            const isRenaming = renaming === w.id;
            return (
              <Pressable
                key={w.id}
                onPress={() => (isRenaming ? undefined : onSelect(w))}
                onLongPress={() => { haptic.select(); setMenuWs(w); }}
                delayLongPress={300}
                android_ripple={{ color: C.elevated2 }}
                style={{
                  paddingHorizontal: 10, paddingVertical: 8, borderRadius: v2.radius.md, marginBottom: 2,
                  backgroundColor: active ? C.accentTint : 'transparent',
                  borderLeftWidth: color ? 3 : 0, borderLeftColor: color || 'transparent',
                }}
              >
                {/* 1행: 핀 + 이름 + unread */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  {pinned ? <PushPin size={12} color={C.accent} weight="fill" /> : null}
                  {isRenaming ? (
                    <TextInput
                      value={renameText}
                      onChangeText={setRenameText}
                      onSubmitEditing={commitRename}
                      onBlur={commitRename}
                      autoFocus
                      selectTextOnFocus
                      style={{ flex: 1, color: C.text, fontSize: 13.5, fontWeight: '600', fontFamily: v2.font.sans, padding: 0, borderBottomWidth: 1, borderBottomColor: C.accent }}
                    />
                  ) : (
                    <Text numberOfLines={1} style={{ flex: 1, color: active ? C.text : C.text2, fontSize: 13.5, fontWeight: '600', fontFamily: v2.font.sans }}>
                      {S.wsDisplayName(w)}
                    </Text>
                  )}
                  {unread ? (
                    <View style={{ minWidth: 16, height: 16, paddingHorizontal: 4, borderRadius: 8, backgroundColor: C.error, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{unread > 9 ? '9+' : unread}</Text>
                    </View>
                  ) : null}
                </View>
                {/* 2행: 호스트 종류 + 온라인 + 브랜치 */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                  {local ? <Laptop size={12} color={C.textDim} weight="fill" /> : <Cloud size={12} color={C.textDim} weight="fill" />}
                  <Text style={{ color: C.textDim, fontSize: 11 }}>{local ? '내 PC' : '클라우드'}</Text>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: online ? C.accent : C.textDim }} />
                  {rt?.branch ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      <GitBranch size={11} color={C.textDim} />
                      <Text style={{ color: C.textDim, fontSize: 11 }} numberOfLines={1}>{rt.branch}</Text>
                    </View>
                  ) : null}
                </View>
                {/* 3행: 경로 */}
                {w.localPath ? (
                  <Text numberOfLines={1} style={{ color: C.textDim, fontSize: 10.5, fontFamily: v2.font.mono, marginTop: 2 }}>~/{w.localPath}</Text>
                ) : null}
                {/* 포트 */}
                {rt?.ports?.length ? (
                  <View style={{ flexDirection: 'row', gap: 4, marginTop: 3 }}>
                    {rt.ports.slice(0, 3).map((p) => (
                      <Text key={p} style={{ color: C.accent, fontSize: 10.5, fontFamily: v2.font.mono }}>:{p}</Text>
                    ))}
                  </View>
                ) : null}
              </Pressable>
            );
          })
        )}
      </ScrollView>

      {/* ── footer 내 정보 (PC .sb-me 미러: 아바타 + 이름/이메일 + 온라인 점) ── */}
      <View style={{ paddingHorizontal: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.border }}>
        <Pressable onPress={openMyInfo} android_ripple={{ color: C.elevated2 }} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, paddingHorizontal: 8, borderRadius: v2.radius.md }}>
          <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: C.accentTint, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: C.accent, fontSize: 13, fontWeight: '700' }}>{avatar}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '600' }} numberOfLines={1}>{nickname}</Text>
            {email ? <Text style={{ color: C.textDim, fontSize: 11, marginTop: 1 }} numberOfLines={1}>{email}</Text> : null}
          </View>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: localOnline ? C.accent : C.textDim }} />
        </Pressable>
      </View>

      {/* ── 알림 패널 ── */}
      <Modal visible={notifOpen} transparent animationType="fade" onRequestClose={() => setNotifOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' }} onPress={() => setNotifOpen(false)}>
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
                    const wsName = S.workspaces.find((w) => w.id === n.wsId)?.name || '';
                    const t = new Date(n.ts);
                    const hhmm = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
                    return (
                      <Pressable key={n.id} onPress={() => jumpNotif(n.wsId, n.paneId)} android_ripple={{ color: C.elevated2 }}
                        style={{ paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: n.read ? 'transparent' : C.accentTint }}>
                        {n.title ? <Text style={{ color: C.text, fontSize: 13, fontWeight: '600' }} numberOfLines={1}>{n.title}</Text> : null}
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
      </Modal>

      {/* ── 컨텍스트 메뉴(롱프레스) ── */}
      <Modal visible={!!menuWs} transparent animationType="fade" onRequestClose={() => setMenuWs(null)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' }} onPress={() => setMenuWs(null)}>
          <Pressable style={{ width: 260, backgroundColor: C.elevated, borderRadius: v2.radius.lg, borderWidth: 1, borderColor: C.border, paddingVertical: 6 }}>
            {menuWs ? (
              <>
                <MenuItem icon={<PencilSimple size={16} color={C.text2} />} label="이름 변경" onPress={() => startRename(menuWs)} />
                <MenuItem icon={<PushPin size={16} color={C.text2} />} label={S.wsPinned(menuWs.id) ? '고정 해제' : '고정'} onPress={() => { S.togglePinWs(menuWs.id); setMenuWs(null); }} />
                {/* 색상 스와치 */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 8 }}>
                  <Palette size={16} color={C.text2} />
                  <Text style={{ color: C.text2, fontSize: 14, marginRight: 4 }}>색상</Text>
                  <View style={{ flexDirection: 'row', gap: 7, flex: 1, justifyContent: 'flex-end' }}>
                    {WS_COLORS.map((c) => {
                      const sel = (S.wsColor(menuWs.id) || '') === c.value;
                      return (
                        <Pressable key={c.label} onPress={() => { S.setWsColor(menuWs.id, c.value); setMenuWs(null); }}
                          style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: c.value || C.elevated2, borderWidth: sel ? 2 : c.value ? 0 : 1, borderColor: sel ? C.text : C.borderControl, alignItems: 'center', justifyContent: 'center' }}>
                          {!c.value ? <X size={11} color={C.textDim} /> : null}
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
                <View style={{ height: 1, backgroundColor: C.border, marginVertical: 4 }} />
                <MenuItem icon={<ArrowUp size={16} color={C.text2} />} label="위로 이동" onPress={() => { S.moveWs(menuWs.id, 'up'); setMenuWs(null); }} />
                <MenuItem icon={<ArrowDown size={16} color={C.text2} />} label="아래로 이동" onPress={() => { S.moveWs(menuWs.id, 'down'); setMenuWs(null); }} />
                <MenuItem icon={<ArrowLineUp size={16} color={C.text2} />} label="맨 위로 이동" onPress={() => { S.moveWs(menuWs.id, 'top'); setMenuWs(null); }} />
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function CtlBtn({ children, onPress, disabled }: { children: React.ReactNode; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={6} style={{ width: 36, height: 36, borderRadius: v2.radius.md, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.5 : 1 }}>
      {children}
    </Pressable>
  );
}

function Badge({ n }: { n: number }) {
  return (
    <View style={{ position: 'absolute', top: 4, right: 4, minWidth: 14, height: 14, paddingHorizontal: 3, borderRadius: 7, backgroundColor: C.error, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontSize: 9, fontWeight: '700' }}>{n > 9 ? '9+' : n}</Text>
    </View>
  );
}

function MenuItem({ icon, label, onPress }: { icon: React.ReactNode; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} android_ripple={{ color: C.elevated2 }} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 11 }}>
      {icon}
      <Text style={{ color: C.text, fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}
