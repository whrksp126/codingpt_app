import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, ScrollView, RefreshControl, Modal, Alert } from 'react-native';
import KeyTextInput from './keyboard/KeyTextInput';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  SidebarSimple, Bell, Plus, DotsThree, Gear, Laptop,
  PushPin, PencilSimple, Palette, ArrowUp, ArrowDown, ArrowLineUp, X, Trash,
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
import lanLink from '../services/lanLink';
import { haptic } from '../animations/haptics';
import * as i18n from '../i18n/index.ts';

const C = v2.colors;

// 이 워크스페이스의 호스트로 지금 LAN 직결 중인가(표시 전용). 릴레이는 배지 없음 = 정상.
const lanBadge = (w: WorkspaceMeta): boolean => lanLink.badgeFor(w.hostDeviceId ?? null) !== null;

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

  // LAN 직결 경로 표시 — lanLink 가 경로를 승격/강등할 때만 재랜더(정상 상태는 아무 표시 없음).
  //  ★ 이 값은 호스트 온/오프라인과 **무관**하다: 직결이 안 돼도 릴레이로 정상 동작하므로 배지가
  //    없는 것이 곧 문제가 아니다(오프라인 표시로 오해되지 않게 별도 회색 라벨을 쓴다).
  const [, bumpLanTick] = useState(0);
  React.useEffect(() => lanLink.subscribe(() => bumpLanTick((n) => n + 1)), []);

  const [refreshing, setRefreshing] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [menuWs, setMenuWs] = useState<WorkspaceMeta | null>(null);
  const [pcMenu, setPcMenu] = useState(false); // `내 PC` 섹션의 ⋯ 메뉴(PC 연결하기 / 기기 관리)
  const [wsMenu, setWsMenu] = useState(false); // `워크스페이스` 섹션의 ⋯ 메뉴(워크스페이스 추가)
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

  // 워크스페이스 삭제 — 서버 목록(메타)만 지움. 폴더/파일은 절대 건드리지 않는다.
  //  loadWorkspaces 가 활성 ws 소실을 자체 정합화(다른 ws 자동 선택)하므로 여기선 목록 갱신만.
  const deleteWs = useCallback((w: WorkspaceMeta) => {
    workspaceService.deleteWorkspace(w.id)
      .then(() => S.loadWorkspaces())
      .catch((e) => Alert.alert(i18n.t('삭제 실패'), String((e as Error)?.message || e)));
  }, [S]);

  const confirmDelete = useCallback((w: WorkspaceMeta) => {
    setMenuWs(null);
    showAppAlert({
      title: i18n.t('워크스페이스 삭제'),
      message: `‘${S.wsDisplayName(w)}’을(를) 목록에서 삭제할까요? PC의 폴더와 파일은 그대로 유지됩니다.`,
      buttons: [
        { text: i18n.t('삭제'), style: 'destructive', onPress: () => deleteWs(w) },
        { text: i18n.t('취소'), style: 'cancel' },
      ],
    });
  }, [S, deleteWs]);

  const onSelect = useCallback((w: WorkspaceMeta) => {
    // 유령 워크스페이스(호스트 폴더 소실) — 열지 않고 삭제 안내만.
    if (w.git?.missing) {
      showAppAlert({
        title: i18n.t('폴더를 찾을 수 없습니다'),
        message: `${w.localPath ? `~/${w.localPath}\n` : ''}폴더가 이동되었거나 삭제된 것 같습니다. 목록에서 삭제해도 폴더/파일에는 영향이 없습니다.`,
        buttons: [
          { text: i18n.t('목록에서 삭제'), style: 'destructive', onPress: () => deleteWs(w) },
          { text: i18n.t('취소'), style: 'cancel' },
        ],
      });
      return;
    }
    // ★ 프로젝트 그룹핑 폐기(2026-08-14)로 "켜진 사본으로 갈아타기" 제안도 함께 없앴다 — 사본이라는
    //  개념 자체가 화면에서 사라졌으므로, 꺼진 PC 의 워크스페이스를 누르면 그냥 그것을 연다.
    //  (호스트가 꺼져 있다는 사실은 위 PC 행의 상태점과 이 행의 흐린 표시가 이미 말한다.)
    openWs(w);
  }, [S, openWs, deleteWs]);

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

  const nickname = (user as any)?.nickname || (user as any)?.name || i18n.t('코더');
  const email = (user as any)?.email || '';
  const avatar = String(nickname).trim().charAt(0) || i18n.t('코');

  // ── 기기 우선(2026-08-14 사용자 확정 · PC sidebar.js 미러) ────────────────────
  //  옛 구조는 프로젝트(projectId) 묶음 ⊃ 기기별 사본이었다. 사용자 지적: "이해도 안 가고 사용성도
  //  안 좋다". 실제 소유 관계는 반대다 — 워크스페이스는 **그 PC 의 로컬 폴더**다. 그래서 PC 를 먼저
  //  고르고, 고른 PC 의 워크스페이스만 아래에 그린다.
  const devices = S.pcDevices();
  const activeDev = S.resolvedDeviceId();
  const rows = devices.length ? S.workspacesForDevice(activeDev) : [];

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: C.surface }}>
      {/* ── 상단 컨트롤(토글·알림·+) — main-top 과 동일 높이(44)로 매끄러운 한 줄 헤더 ── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', height: 44, paddingHorizontal: 8, gap: 2, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.surface }}>
        {/* 이 버튼이 보이면 사이드바가 열린 상태 → 채운 아이콘(색이 아니라 채움으로 표현) */}
        <CtlBtn onPress={() => (overlay ? closeDrawer() : toggleDocked())}><SidebarSimple size={20} color={C.text2} weight="fill" /></CtlBtn>
        <CtlBtn onPress={onBell}>
          <Bell size={20} color={C.text2} />
          {S.notifications.some((n) => !n.read) ? <Badge n={S.notifications.filter((n) => !n.read).length} /> : null}
        </CtlBtn>
        {/* ★ 상단 + 제거(2026-08-14) — 워크스페이스 추가는 아래 `워크스페이스` 섹션 머리에 산다.
            무엇을 **어느 PC 에** 만드는지가 그 자리에서 드러난다(옛 + 는 매번 PC 를 다시 물었다). */}
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.text3} colors={[C.text3]} progressBackgroundColor={C.surface} />}
      >
        {/* ── ① 내 PC ── 새 PC 는 여기서 만들 수 없다(그 PC 에 앱을 깔고 로그인해야 나타난다)
             → + 를 두지 않고 ⋯ 메뉴만 둔다. 누르면 아무것도 못 만드는 + 는 거짓 어포던스다. */}
        <SectionHead title={i18n.t('내 PC')} onMore={() => setPcMenu(true)} />
        {devices.length === 0 ? (
          <Text style={{ color: C.textDim, fontSize: 12.5, paddingHorizontal: 14, paddingVertical: 10 }}>
            {i18n.t('PC를 연결하세요')}
          </Text>
        ) : devices.map((d) => {
          const sel = String(d.id) === String(activeDev);
          const on = (d as any).online !== false;
          // 미읽음은 그 PC 의 워크스페이스 것을 합산 — 다른 PC 를 보고 있어도 "저기서 뭔가 왔다"를 안다.
          const dUnread = S.workspacesForDevice(d.id).reduce((n, w) => n + S.unreadForWs(w.id), 0);
          return (
            <Pressable
              key={String(d.id)}
              onPress={() => { if (!sel) { haptic.select(); S.setActiveDevice(d.id); } }}
              android_ripple={{ color: C.elevated2 }}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 6,
                // ★ 워크스페이스 행과 같은 무게로(2026-08-14 사용자 확정) — PC 는 이제 워크스페이스의
                //   부모라 더 눌리기 쉬워야 한다. 워크스페이스 행이 2줄이라 minHeight 로 맞춘다.
                minHeight: 44,
                paddingHorizontal: 10, paddingVertical: 11, borderRadius: v2.radius.md, marginBottom: 2,
                backgroundColor: sel ? C.elevated2 : 'transparent',
                opacity: on ? 1 : 0.55, // 오프라인이어도 **고를 수 있다**(뭘 등록해 뒀는지는 봐야 한다)
              }}
            >
              <Laptop size={14} color={sel ? C.text : C.text2} weight="fill" />
              <Text numberOfLines={1} style={{ flex: 1, color: sel ? C.text : C.text2, fontSize: 13.5, fontWeight: '600', fontFamily: v2.font.sans }}>
                {(d as any).name || i18n.t('내 PC')}
              </Text>
              {/* ★ "이 PC" 라벨 없음(2026-08-14 사용자 확정) — 기기 목록에서 어느 게 지금 이 기기인지는
                  쓸모가 없다. 폰에서 보면 **전부 남의 PC** 라 더더욱. */}
              {dUnread ? (
                <View style={{ minWidth: 16, height: 16, paddingHorizontal: 4, borderRadius: 8, backgroundColor: C.error, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{dUnread > 9 ? '9+' : dUnread}</Text>
                </View>
              ) : null}
              {/* ★ 상태 점은 그리지 않는다(2026-08-14 사용자 확정) — 오프라인은 행 전체가 흐려지는
                  것으로 이미 드러난다. 같은 사실을 점으로 한 번 더 말하면 신호가 아니라 장식이다. */}
            </Pressable>
          );
        })}

        {/* ── ② 선택한 PC 의 워크스페이스 ── */}
        {/* ★ [+] 와 ⋯ 을 함께 두지 않는다(2026-08-14 사용자 확정) — 둘 다 "워크스페이스 추가" 하나를
            가리켜서 같은 일을 하는 버튼이 나란히 두 개 있는 꼴이었다. ⋯ 하나로 통일한다. */}
        <SectionHead title={i18n.t('워크스페이스')} onMore={devices.length ? () => setWsMenu(true) : undefined} adding={creating} />
        {rows.length === 0 ? (
          <Text style={{ color: C.textDim, fontSize: 12.5, paddingHorizontal: 14, paddingVertical: 14, lineHeight: 19 }}>
            {S.wsError && !S.workspaces.length
              ? i18n.t("목록을 불러오지 못했어요.\n아래로 당겨 새로고침하세요.")
              : devices.length ? i18n.t('+ 로 이 PC의 폴더를 추가하세요') : ''}
          </Text>
        ) : (
          rows.map((w) => {
              const active = w.id === S.activeWsId;
              const local = S.isLocal(w);
              const color = S.wsColor(w.id);
              const pinned = S.wsPinned(w.id);
              const unread = S.unreadForWs(w.id);
              const rt = S.wsRuntime(w.id);
              const st = S.wsStatus[w.id]; // ui_command status.changed 수신 상태(있을 때만 뱃지)
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
                    backgroundColor: active ? C.elevated2 : 'transparent',
                    borderLeftWidth: color ? 3 : 0, borderLeftColor: color || 'transparent',
                    opacity: online ? 1 : 0.55, // 꺼진 호스트 사본은 흐리게(딱 보고 구분)
                  }}
                >
                  {/* 1행: 핀 + **워크스페이스 이름** + unread.
                      ★ 호스트명·상태점·직결 배지는 위 PC 행이 담당한다(2026-08-14) — 여기 다시 쓰면
                      같은 말이 두 줄이 된다. 예전엔 그룹 헤더가 프로젝트명을 갖고 이 줄이 호스트명을
                      갖는 구조라 행 제목이 "내 PC" 였다. */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {pinned ? <PushPin size={12} color={C.text3} weight="fill" /> : null}
                    {isRenaming ? (
                      <KeyTextInput
                        value={renameText}
                        onChangeText={setRenameText}
                        onSubmitEditing={commitRename}
                        onBlur={commitRename}
                        autoFocus
                        selectTextOnFocus
                        style={{ flex: 1, color: C.text, fontSize: 13.5, fontWeight: '600', fontFamily: v2.font.sans, padding: 0, borderBottomWidth: 1, borderBottomColor: C.borderControl }}
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
                  {/* 경로 — 폴더 소실(유령)이면 경로 대신 안내 라벨(오프라인 라벨 톤, 과한 위험색 금지) */}
                  {w.git?.missing ? (
                    <Text numberOfLines={1} style={{ color: C.textDim, fontSize: 10.5, marginTop: 2 }}>{i18n.t('폴더를 찾을 수 없음')}</Text>
                  ) : w.localPath ? (
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
                        <Text key={p} style={{ color: C.text3, fontSize: 10.5, fontFamily: v2.font.mono }}>:{p}</Text>
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
          <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: C.elevated2, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: C.text2, fontSize: 13, fontWeight: '700' }}>{avatar}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '600' }} numberOfLines={1}>{nickname}</Text>
            {email ? <Text style={{ color: C.textDim, fontSize: 11, marginTop: 1 }} numberOfLines={1}>{email}</Text> : null}
          </View>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: localOnline ? C.cta : C.textDim }} />
        </Pressable>
      </View>

      {/* ── 컨텍스트 메뉴(롱프레스) ── */}
      <Modal supportedOrientations={['portrait', 'portrait-upside-down', 'landscape', 'landscape-left', 'landscape-right']} visible={!!menuWs} transparent animationType="fade" onRequestClose={() => setMenuWs(null)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' }} onPress={() => setMenuWs(null)}>
          <Pressable style={{ width: 260, backgroundColor: C.elevated, borderRadius: v2.radius.lg, borderWidth: 1, borderColor: C.border, paddingVertical: 6 }}>
            {menuWs ? (
              <>
                <MenuItem icon={<PencilSimple size={16} color={C.text2} />} label={i18n.t('이름 변경')} onPress={() => startRename(menuWs)} />
                <MenuItem icon={<PushPin size={16} color={C.text2} />} label={S.wsPinned(menuWs.id) ? i18n.t('고정 해제') : i18n.t('고정')} onPress={() => { S.togglePinWs(menuWs.id); setMenuWs(null); }} />
                {/* 색상 스와치 */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 8 }}>
                  <Palette size={16} color={C.text2} />
                  <Text style={{ color: C.text2, fontSize: 14, marginRight: 4 }}>{i18n.t('색상')}</Text>
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
                <MenuItem icon={<ArrowUp size={16} color={C.text2} />} label={i18n.t('위로 이동')} onPress={() => { S.moveWs(menuWs.id, 'up'); setMenuWs(null); }} />
                <MenuItem icon={<ArrowDown size={16} color={C.text2} />} label={i18n.t('아래로 이동')} onPress={() => { S.moveWs(menuWs.id, 'down'); setMenuWs(null); }} />
                <MenuItem icon={<ArrowLineUp size={16} color={C.text2} />} label={i18n.t('맨 위로 이동')} onPress={() => { S.moveWs(menuWs.id, 'top'); setMenuWs(null); }} />
                <View style={{ height: 1, backgroundColor: C.border, marginVertical: 4 }} />
                {/* ★ 프로젝트 분리/합치기 제거(2026-08-14 사용자 확정) — 기기 우선 구조에서는 한
                    화면에 한 PC 의 워크스페이스만 있어서 "무엇과 합칠지"가 화면에 없다. 서버의
                    projectId 필드는 그대로라 되살리려면 이 두 항목만 다시 붙이면 된다. */}
                {/* 목록에서만 삭제 — 폴더/파일 유지(문구로 명시) */}
                <MenuItem icon={<Trash size={16} color={C.error} />} label={i18n.t('워크스페이스 삭제')} color={C.error} onPress={() => confirmDelete(menuWs)} />
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── `내 PC` 섹션의 ⋯ 메뉴 ── 새 PC 는 여기서 만들 수 없다 → **어떻게 하면 나타나는지**를 말한다. */}
      <Modal supportedOrientations={['portrait', 'portrait-upside-down', 'landscape', 'landscape-left', 'landscape-right']} visible={pcMenu} transparent animationType="fade" onRequestClose={() => setPcMenu(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' }} onPress={() => setPcMenu(false)}>
          <Pressable style={{ width: 260, backgroundColor: C.elevated, borderRadius: v2.radius.lg, borderWidth: 1, borderColor: C.border, paddingVertical: 6 }}>
            <MenuItem icon={<Plus size={16} color={C.text2} />} label={i18n.t('PC 연결하기')} onPress={() => {
              setPcMenu(false);
              showAppAlert({
                title: i18n.t('PC 연결하기'),
                message: i18n.t('연결할 PC에서 CodingPT를 설치하고 지금 계정으로 로그인하세요.\n로그인하면 이 목록에 그 PC가 자동으로 나타납니다.'),
                buttons: [{ text: i18n.t('확인'), style: 'primary' }],
              });
            }} />
            <MenuItem icon={<Gear size={16} color={C.text2} />} label={i18n.t('기기 관리')} onPress={() => { setPcMenu(false); if (overlay) closeDrawer(); S.openSettings(); }} />
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── `워크스페이스` 섹션의 ⋯ 메뉴 ── */}
      <Modal supportedOrientations={['portrait', 'portrait-upside-down', 'landscape', 'landscape-left', 'landscape-right']} visible={wsMenu} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setWsMenu(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' }} onPress={() => setWsMenu(false)}>
          <Pressable style={{ width: 260, backgroundColor: C.elevated, borderRadius: v2.radius.lg, borderWidth: 1, borderColor: C.border, paddingVertical: 6 }}>
            <MenuItem icon={<Plus size={16} color={C.text2} />} label={i18n.t('워크스페이스 추가')} onPress={() => { setWsMenu(false); onNewWorkspace(); }} />
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

/**
 * 섹션 머리 — 제목 + ⋯ 메뉴. PC `.sb-sec` 미러.
 *  ★ [+] 는 두지 않는다(2026-08-14 사용자 확정: "그냥 옆에 ... 으로만 하자") — ⋯ 안의 항목과
 *   같은 일을 하는 버튼이 나란히 두 개 있는 꼴이었다.
 */
function SectionHead({ title, onMore, adding }: { title: string; onMore?: () => void; adding?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 10, paddingRight: 2, paddingTop: 10, paddingBottom: 4 }}>
      <Text numberOfLines={1} style={{ flex: 1, color: C.textDim, fontSize: 11, fontWeight: '700', letterSpacing: 0.4, fontFamily: v2.font.sans }}>
        {title}
      </Text>
      {onMore ? (
        <Pressable onPress={onMore} hitSlop={8} style={{ padding: 4, opacity: adding ? 0.5 : 1 }} disabled={adding}>
          <DotsThree size={18} color={C.textDim} weight="bold" />
        </Pressable>
      ) : null}
    </View>
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

function MenuItem({ icon, label, onPress, color }: { icon: React.ReactNode; label: string; onPress: () => void; color?: string }) {
  return (
    <Pressable onPress={onPress} android_ripple={{ color: C.elevated2 }} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 11 }}>
      {icon}
      <Text style={{ color: color || C.text, fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}
