import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, ScrollView, RefreshControl, Modal, Alert } from 'react-native';
import KeyTextInput from './keyboard/KeyTextInput';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  SidebarSimple, Bell, Plus, Gear, Laptop, Cloud, GitBranch,
  PushPin, PencilSimple, Palette, ArrowUp, ArrowDown, ArrowLineUp, X,
  FolderSimple, ArrowsMerge, ArrowsSplit,
} from 'phosphor-react-native';
import { v2 } from '../theme/v2Tokens';
import { useDrawer } from '../contexts/DrawerContext';
import { useMyInfo } from '../contexts/MyInfoContext';
import { useUser } from '../contexts/UserContext';
import { useResponsive } from '../hooks/useResponsive';
import { useDaemonStatus } from '../hooks/useDaemonStatus';
import { useWorkspaceShell } from '../contexts/WorkspaceShellContext';
import { openNotifPanel } from './NotificationsPanel';
import { showAppAlert } from './AppAlert';
import { collapseKeyAssist } from './keyboard/KeyAssist';
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
  const [attachPick, setAttachPick] = useState(false); // 컨텍스트 메뉴 2단계: 합칠 프로젝트 선택
  const [creating, setCreating] = useState(false);

  const afterNav = useCallback(() => { if (overlay) closeDrawer(); }, [overlay, closeDrawer]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    S.loadWorkspaces().finally(() => setRefreshing(false));
  }, [S]);

  const openWs = useCallback((w: WorkspaceMeta) => {
    haptic.select();
    S.setActive(w.id);
    // 워크스페이스 진입은 읽음 처리하지 않고, 미읽음 알림이 있으면 그 터미널을 활성 탭/포커스로 올려 보이게만 한다.
    //  런타임 레이아웃이 준비된 뒤 반영되도록 약간 지연(ensureRuntime/pullSession 후).
    setTimeout(() => S.activateNotifTerminal(w.id), 350);
    afterNav();
  }, [S, afterNav]);

  const onSelect = useCallback((w: WorkspaceMeta) => {
    // 호스트가 꺼진 사본인데 같은 프로젝트의 켜진 사본이 있으면 원탭 폴백 제안.
    if (S.isLocal(w) && w.hostOnline === false) {
      const key = w.projectId || w.id;
      const alt = S.workspaces.find((x) => x.id !== w.id && (x.projectId || x.id) === key
        && (S.isLocal(x) ? x.hostOnline !== false : true));
      if (alt) {
        const altHost = S.isLocal(alt) ? (alt.hostName || '내 PC') : '클라우드';
        showAppAlert({
          title: `${w.hostName || '이 PC'} 연결 끊김`,
          message: '이 워크스페이스의 호스트 PC 데몬이 오프라인이에요. 같은 프로젝트의 온라인 사본으로 열 수 있어요.',
          buttons: [
            { text: `${altHost}로 열기`, style: 'primary', onPress: () => openWs(alt) },
            { text: '그냥 열기', onPress: () => openWs(w) },
            { text: '취소', style: 'cancel' },
          ],
        });
        return;
      }
    }
    openWs(w);
  }, [S, openWs]);

  // + 새 워크스페이스 — 생성 방식 선택 시트(내 PC 폴더 선택 / GitHub / 클라우드). 셸 레벨 NewWorkspaceSheet 가 처리.
  const onNewWorkspace = useCallback(() => {
    collapseKeyAssist(); // 시트 오픈 = 키보드/특수키 패널 내림
    if (overlay) closeDrawer();
    S.openNewWs();
  }, [overlay, closeDrawer, S]);

  // 알림 패널은 셸 레벨 NotificationsPanel 로 분리 — 벨은 열기만 한다(점프/읽음 로직도 그쪽).
  const onBell = useCallback(() => { openNotifPanel(); }, []);

  // 내 정보 = PC 미러 설정 모달(일반/계정/정보). 기존 MyInfoSheet 대신 SettingsModal 오픈.
  const openMyInfo = useCallback(() => { collapseKeyAssist(); if (overlay) closeDrawer(); S.openSettings(); }, [overlay, closeDrawer, S]);

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
  // 프로젝트 그룹 — projectId 가 같은 워크스페이스(다른 PC의 사본)를 인접 묶음으로.
  //  정렬 순서 유지: 그룹 위치 = 첫 멤버 위치. 단독(1개) 그룹은 기존 행 그대로 렌더.
  const groups: Array<{ key: string; members: WorkspaceMeta[] }> = [];
  {
    const byKey = new Map<string, { key: string; members: WorkspaceMeta[] }>();
    for (const w of rows) {
      const key = w.projectId || w.id;
      let g = byKey.get(key);
      if (!g) { g = { key, members: [] }; byKey.set(key, g); groups.push(g); }
      g.members.push(w);
    }
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: C.surface }}>
      {/* ── 상단 컨트롤(토글·알림·+) — main-top 과 동일 높이(44)로 매끄러운 한 줄 헤더 ── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', height: 44, paddingHorizontal: 8, gap: 2, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.surface }}>
        <CtlBtn onPress={() => (overlay ? closeDrawer() : toggleDocked())}><SidebarSimple size={20} color={C.text2} /></CtlBtn>
        <CtlBtn onPress={onBell}>
          <Bell size={20} color={C.text2} />
          {S.notifications.some((n) => !n.read) ? <Badge n={S.notifications.filter((n) => !n.read).length} /> : null}
        </CtlBtn>
        {/* PC 처럼 [사이드바·벨·+] 왼쪽으로 묶음 */}
        <CtlBtn onPress={onNewWorkspace} disabled={creating}><Plus size={20} color={C.text2} /></CtlBtn>
        <View style={{ flex: 1 }} />
        {overlay ? (
          <CtlBtn onPress={closeDrawer}><X size={19} color={C.text2} /></CtlBtn>
        ) : null}
      </View>

      {/* ── 워크스페이스 목록 ── */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: 12, paddingTop: 2, flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
        alwaysBounceVertical
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} colors={[C.accent]} progressBackgroundColor={C.surface} />}
      >
        {rows.length === 0 ? (
          <Text style={{ color: C.textDim, fontSize: 12.5, paddingHorizontal: 14, paddingVertical: 14, lineHeight: 19 }}>
            {S.wsError && !S.workspaces.length
              ? '목록을 불러오지 못했어요.\n아래로 당겨 새로고침하세요.'
              : '+ 로 워크스페이스를 추가하세요'}
          </Text>
        ) : (
          groups.map((g) => {
            const renderRow = (w: WorkspaceMeta) => {
              const active = w.id === S.activeWsId;
              const local = S.isLocal(w);
              const color = S.wsColor(w.id);
              const pinned = S.wsPinned(w.id);
              const unread = S.unreadForWs(w.id);
              const rt = S.wsRuntime(w.id);
              const st = S.wsStatus[w.id]; // ui_command status.changed 수신 상태(있을 때만 뱃지)
              const online = local ? (w.hostOnline ?? localOnline) : true;
              const hostLabel = local ? (w.hostName || '내 PC') : '클라우드';
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
                    opacity: online ? 1 : 0.55, // 꺼진 호스트 사본은 흐리게(딱 보고 구분)
                  }}
                >
                  {/* 1행: 핀 + 호스트명(기기 카드 제목) + unread */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {pinned ? <PushPin size={12} color={C.accent} weight="fill" /> : null}
                    {local ? <Laptop size={13} color={active ? C.text : C.text2} weight="fill" /> : <Cloud size={13} color={active ? C.text : C.text2} weight="fill" />}
                    {isRenaming ? (
                      <KeyTextInput
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
                        {hostLabel}
                      </Text>
                    )}
                    {/* 오프라인은 흐림+회색점만으론 놓치기 쉬움 — 명시 라벨로 확실히 구분 */}
                    {!online ? <Text style={{ color: C.error, fontSize: 9.5, fontWeight: '700' }}>오프라인</Text> : null}
                    <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: online ? C.accent : C.error }} />
                    {unread ? (
                      <View style={{ minWidth: 16, height: 16, paddingHorizontal: 4, borderRadius: 8, backgroundColor: C.error, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{unread > 9 ? '9+' : unread}</Text>
                      </View>
                    ) : null}
                  </View>
                  {/* 2행: 브랜치 + 신선도 배지(●=미커밋, ↑N=미푸시) — git 저장소일 때만 */}
                  {(() => {
                    const brName = rt?.branch || w.git?.branch || '';
                    const dirty = !!w.git?.dirty;
                    const ahead = w.git?.upstream ? (w.git.ahead || 0) : 0;
                    if (!brName && !dirty && !ahead) return null;
                    return (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                        {brName ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                            <GitBranch size={11} color={C.textDim} />
                            <Text style={{ color: C.textDim, fontSize: 11 }} numberOfLines={1}>{brName}</Text>
                          </View>
                        ) : null}
                        {dirty ? <Text style={{ color: '#eab308', fontSize: 10 }}>●</Text> : null}
                        {ahead > 0 ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 1 }}>
                            <ArrowUp size={10} color="#eab308" weight="bold" />
                            <Text style={{ color: '#eab308', fontSize: 10, fontWeight: '700' }}>{ahead}</Text>
                          </View>
                        ) : null}
                      </View>
                    );
                  })()}
                  {/* 3행: 경로 */}
                  {w.localPath ? (
                    <Text numberOfLines={1} style={{ color: C.textDim, fontSize: 10.5, fontFamily: v2.font.mono, marginTop: 2 }}>~/{w.localPath}</Text>
                  ) : null}
                  {/* 작업 상태(ui_command status.changed) — status[0] 텍스트 뱃지 + progress % */}
                  {st?.status?.length ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 }}>
                      <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, backgroundColor: C.elevated2, maxWidth: 160 }}>
                        <Text style={{ color: C.text2, fontSize: 10.5 }} numberOfLines={1}>{st.status[0]}</Text>
                      </View>
                      {typeof st.progress === 'number' ? (
                        <Text style={{ color: C.textDim, fontSize: 10.5, fontFamily: v2.font.mono }}>{Math.round(st.progress)}%</Text>
                      ) : null}
                    </View>
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
            };
            // 프로젝트 그룹 — 이름 1회(헤더) + PC별 사본 행(호스트명·상태점), 항상 전부 펼침.
            //  단독(사본 1개)도 같은 구조로 렌더(표현 통일 — 프로젝트명 ⊃ 기기 워크스페이스).
            return (
              <View key={g.key} style={{ marginBottom: 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingTop: 7, paddingBottom: 3 }}>
                  <FolderSimple size={13} color={C.text2} weight="fill" />
                  <Text numberOfLines={1} style={{ flex: 1, color: C.text2, fontSize: 13.5, fontWeight: '700', fontFamily: v2.font.sans }}>
                    {S.wsDisplayName(g.members[0])}
                  </Text>
                </View>
                <View style={{ marginLeft: 14, borderLeftWidth: 1, borderLeftColor: C.border, paddingLeft: 4 }}>
                  {g.members.map(renderRow)}
                </View>
              </View>
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

      {/* ── 컨텍스트 메뉴(롱프레스) ── */}
      <Modal supportedOrientations={['portrait', 'portrait-upside-down', 'landscape', 'landscape-left', 'landscape-right']} visible={!!menuWs} transparent animationType="fade" onRequestClose={() => { setMenuWs(null); setAttachPick(false); }}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' }} onPress={() => { setMenuWs(null); setAttachPick(false); }}>
          <Pressable style={{ width: 260, backgroundColor: C.elevated, borderRadius: v2.radius.lg, borderWidth: 1, borderColor: C.border, paddingVertical: 6 }}>
            {menuWs && attachPick ? (
              // 2단계: 합칠 대상 프로젝트 선택(자기 그룹 제외, 그룹당 1항목)
              <ScrollView style={{ maxHeight: 320 }}>
                {groups.filter((g) => g.key !== (menuWs.projectId || menuWs.id)).map((g) => (
                  <MenuItem
                    key={g.key}
                    icon={<FolderSimple size={16} color={C.text2} />}
                    label={S.wsDisplayName(g.members[0])}
                    onPress={() => {
                      const target = g.members[0];
                      setMenuWs(null); setAttachPick(false);
                      workspaceService.attachProject(menuWs.id, target.id)
                        .then(() => S.loadWorkspaces())
                        .catch((e) => Alert.alert('합치기 실패', String((e as Error)?.message || e)));
                    }}
                  />
                ))}
              </ScrollView>
            ) : menuWs ? (
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
                <View style={{ height: 1, backgroundColor: C.border, marginVertical: 4 }} />
                {/* 프로젝트 그룹 교정 — 자동 연결이 틀렸을 때 1회 수정(영구 저장) */}
                {S.workspaces.some((x) => x.id !== menuWs.id && (x.projectId || x.id) === (menuWs.projectId || menuWs.id)) ? (
                  <MenuItem icon={<ArrowsSplit size={16} color={C.text2} />} label="프로젝트에서 분리" onPress={() => {
                    setMenuWs(null);
                    workspaceService.detachProject(menuWs.id)
                      .then(() => S.loadWorkspaces())
                      .catch((e) => Alert.alert('분리 실패', String((e as Error)?.message || e)));
                  }} />
                ) : (
                  <MenuItem icon={<ArrowsMerge size={16} color={C.text2} />} label="다른 프로젝트와 합치기" onPress={() => setAttachPick(true)} />
                )}
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
