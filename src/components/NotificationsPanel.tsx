import React, { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { FadeIn, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { v2 } from '../theme/v2Tokens';
import { useDrawer } from '../contexts/DrawerContext';
import { useWorkspaceShell, NotifItem } from '../contexts/WorkspaceShellContext';
import * as T from '../workspace/tiling';
import { collapseKeyAssist, KeyAssistOverlay } from './keyboard/KeyAssist';
import COPY from './e2ee/e2eeCopy';
import { PressableRow, Button, EmptyState } from './ui';
import * as i18n from '../i18n/index.ts';
import * as notificationService from '../services/notificationService';
import { openTasksDashboard } from '../workspace/tasks/tasksUi';
import { openAutomations } from '../workspace/automations/automationsUi';
import { noteModalClosing } from './modalLayer';

const C = v2.colors;

// 알림 본문 미리보기 = 마크다운 기호를 걷어낸 평문(설계 §0.7 — PC notifications.js 와 같은 규칙).
//  링크/이미지 `[t](u)` → t, 코드 펜스·백틱·제목 `#`·강조 `*`/`**`/`~~`·인용 `>`·목록 기호 제거, 공백 정리.
//  `_` 강조는 건드리지 않는다(snake_case 식별자가 알림 본문에 흔하다).
export function stripMarkdown(src: string): string {
  return String(src || '')
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/```\w*/g, ''))
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`+/g, '')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, '')
    // 서버가 푸시 본문을 한 줄로 접어 보내므로(`pushBodyOf`) 제목 `##` 이 줄 첫머리가 아니라 문장 중간에 온다.
    .replace(/(^|\s)#{1,6}\s+/g, '$1')
    .replace(/(^|[\s(])(\*\*|\*|~~)(?=\S)(.*?\S)\2(?=$|[\s).,!?:;])/gm, '$1$3')
    .replace(/\s+/g, ' ')
    .trim();
}

// 드롭다운 등장 — 150ms 페이드 + scale .98→1 (설계 §0.4).
const popEnter = () => {
  'worklet';
  return {
    initialValues: { opacity: 0, transform: [{ scale: 0.98 }] },
    animations: { opacity: withTiming(1, { duration: 150 }), transform: [{ scale: withTiming(1, { duration: 150 }) }] },
  };
};

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
  noteModalClosing(); // 이어서 여는 형제 모달(현황판·승인 카드)은 이 패널이 내려간 뒤에(iOS present 거부 방지)
  emit();
}

/**
 * 알림 행 안의 기기 승인 액션(개정 6) — 알림 목록에서 **바로** 승인/거절한다.
 *  대기 목록(S.trustRequests)에 그 요청이 남아 있을 때만 그린다. 승인 주체가 될 수 없는 기기
 *  (열쇠 없음 = st.ready 아님)에서는 아무 버튼도 그리지 않는다 — 눌러도 서버가 403 이다.
 *  색 규율: accent 금지(중립 pill + 텍스트 버튼) — 위계는 채움/무게로만.
 */

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
    // 작업 알림(task_ready/task_merged/task_failed) — 목적지는 터미널이 아니라 **현황판의 그 run** 이다
    //  (설계 §4). 인앱 알림 행은 deeplink 를 싣지 않으므로 터미널 좌표(cwd,win)로 run 을 찾는다.
    if (typeof n.kind === 'string' && n.kind.startsWith('task_')) {
      if (drawerOpen) closeDrawer();
      openTasksDashboard({ cwd: n.cwd || null, win: typeof n.win === 'number' ? n.win : null });
      return;
    }
    // 자동화 알림(auto_created/auto_failed/auto_paused/auto_notify, automation-design.md §5.8) — 목적지는 `자동화` 장소.
    //  인앱 행은 deeplink(자동화 id·host)를 싣지 않는다 → 고른 PC 의 목록으로 연다(이름은 봉인 경로에서만 온다).
    if (typeof n.kind === 'string' && n.kind.startsWith('auto_')) {
      if (drawerOpen) closeDrawer();
      openAutomations();
      return;
    }
    // PC 잠자기·끊김(pc_sleeping/pc_disconnected, §6.5) — 그 PC 의 진행 현황(무엇이 돌고 있었는지).
    if (n.kind === 'pc_sleeping' || n.kind === 'pc_disconnected') {
      if (drawerOpen) closeDrawer();
      openTasksDashboard();
      return;
    }
    // 기기 승인 알림(기능2)은 워크스페이스가 없다 — 승인 시트를 펼치는 것이 목적지다.
    const w = S.workspaces.find((x) => x.id === n.workspaceId || (!!n.cwd && x.localPath === n.cwd));
    if (!w) { if (drawerOpen) closeDrawer(); return; }
    //  에이전트 PC 개입 요청 — 목적지는 터미널이 아니라 **에이전트 PC 화면**이다(PC sidebar.js 와 같은 규칙).
    //   emulatorOpen 은 이미 열린 pane/탭을 찾아 기기를 바꿔 끼우고, 없으면 새로 연다.
    if (n.kind === 'desktop_handoff' && w.localPath) {
      notificationService.dispatchUiCommand({ type: 'ui_command', uiId: 'local-' + Date.now(), cmd: 'emulatorOpen', params: { ws: w.localPath, device: 'desktop:main' }, executor: false });
      if (drawerOpen) closeDrawer();
      return;
    }
    // 채팅(채팅 v2) 알림 — 목적지는 터미널이 아니라 **그 대화의 탭**이다(푸시 딥링크와 같은 규칙).
    //  열려 있으면 그 탭을 앞으로, 닫혀 있으면 채팅 탭을 새로 들인다(탭을 닫아도 대화는 남아 있다).
    if (n.threadId) {
      const host = n.hostDeviceId;
      const wc = (host != null ? S.workspaces.find((x) => x.hostDeviceId === host && (x.id === n.workspaceId || (!!n.cwd && x.localPath === n.cwd))) : undefined) || w;
      if (S.activeWsId !== wc.id) S.setActive(wc.id);
      S.openChatThread(wc.id, n.threadId);
      if (drawerOpen) closeDrawer();
      return;
    }
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
    <Modal supportedOrientations={['portrait', 'portrait-upside-down', 'landscape', 'landscape-left', 'landscape-right']} visible={visible} transparent animationType="none" onRequestClose={closeNotifPanel}>
      <Animated.View entering={FadeIn.duration(150)} style={{ flex: 1, backgroundColor: C.scrim }}>
      <Pressable style={{ flex: 1 }} onPress={closeNotifPanel}>
        {/* PC 처럼 벨 아래 컴팩트 드롭다운 카드(전체폭 X) — elevated · r-lg · 헤어라인 · 그림자(설계 §0.7·§0.8) */}
        <SafeAreaView edges={['top']} style={{ position: 'absolute', top: 0, left: 0 }}>
          <Animated.View entering={popEnter} style={{ marginLeft: 8, marginTop: 46, width: 300,
            shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 8 }}>
          <Pressable style={{ backgroundColor: C.elevated, borderRadius: v2.radius.lg, borderWidth: 1, borderColor: C.borderControl, maxHeight: 420, overflow: 'hidden' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingLeft: 14, paddingRight: 4, borderBottomWidth: 1, borderBottomColor: C.border }}>
              <Text style={{ flex: 1, color: C.text, fontSize: v2.font.size.body, fontWeight: '600', fontFamily: v2.font.sans }}>{i18n.t('알림')}</Text>
              {S.notifications.length ? (
                <Button label={i18n.t('모두 읽음')} variant="ghost" size="sm" onPress={() => S.markAllRead()} />
              ) : null}
            </View>
            <ScrollView style={{ maxHeight: 376 }} contentContainerStyle={{ padding: 4 }}>
              {S.notifications.length === 0 ? (
                <EmptyState centered title={i18n.t('알림이 없습니다')} style={{ flex: 0, paddingVertical: 28 }} />
              ) : (
                S.notifications.map((n) => {
                  // 워크스페이스 라벨 — 서버 저장 wsName 우선, 없으면 workspaceId/cwd 로 로컬 매칭.
                  const wsName = n.wsName
                    || S.workspaces.find((w) => w.id === n.workspaceId || (!!n.cwd && w.localPath === n.cwd))?.name
                    || '';
                  const t = new Date(n.ts);
                  const hhmm = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
                  const body = n.body ? stripMarkdown(n.body) : '';
                  return (
                    <PressableRow key={String(n.id)} onPress={() => jumpNotif(n)} radius={v2.radius.sm}
                      style={{ flexDirection: 'row', paddingLeft: 8, paddingRight: 10, paddingVertical: 8 }}>
                      {/* 미읽음 = 좌측 6px text 점 + 제목 text(블록 채움 없음). 읽음은 점 자리만 비우고 제목 text2. */}
                      <View style={{ width: 14, paddingTop: 6 }}>
                        {!n.read ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.text }} /> : null}
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        {/* 3단: title / subtitle / body(2줄, 평문) + 메타(wsName·시간) */}
                        {n.title ? <Text style={{ color: n.read ? C.text2 : C.text, fontSize: v2.font.size.small, fontWeight: '500', fontFamily: v2.font.sans }} numberOfLines={1}>{n.title}</Text> : null}
                        {n.subtitle ? <Text style={{ color: C.text2, fontSize: v2.font.size.caption, marginTop: 2, fontFamily: v2.font.sans }} numberOfLines={1}>{n.subtitle}</Text> : null}
                        {body ? <Text style={{ color: C.text2, fontSize: v2.font.size.caption, marginTop: 2, fontFamily: v2.font.sans }} numberOfLines={2}>{body}</Text> : null}
                        <Text style={{ color: C.textDim, fontSize: v2.font.size.caption, marginTop: 3, fontFamily: v2.font.sans }}>{wsName ? `${wsName} · ` : ''}{hhmm}</Text>
                      </View>
                      {/*  ★ 개정 6(2026-07-28 사용자 요구): "알림이 오면 그 알림 목록 내부에서 승인
                          거절 할 수 있으면 좋겠는데?" — 알림이 유일한 진입점인 경우가 있다(시트를
                          닫았거나 다른 화면에 있을 때). 대기 목록에 없으면(이미 처리·만료) 버튼을 붙이지
                          않는다: 눌러도 404 인 버튼은 무동작으로 읽힌다. */}
                    </PressableRow>
                  );
                })
              )}
            </ScrollView>
          </Pressable>
          </Animated.View>
        </SafeAreaView>
      </Pressable>
      </Animated.View>
      {/* Modal 은 독립 네이티브 레이어 — 보조키 오버레이 별도 마운트 규칙 유지 */}
      <KeyAssistOverlay inModal />
    </Modal>
  );
}
