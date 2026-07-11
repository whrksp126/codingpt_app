import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import {
  CaretRight, CaretDown, Gear, Plus, Laptop, Cloud,
  ChatCircleDots, Terminal, X,
} from 'phosphor-react-native';
import { v2 } from '../theme/v2Tokens';
import { useDrawer } from '../contexts/DrawerContext';
import { useMyInfo } from '../contexts/MyInfoContext';
import { useHomeAction } from '../contexts/HomeActionContext';
import { useUser } from '../contexts/UserContext';
import { useAgentSession } from '../contexts/AgentSessionContext';
import { useWorkspaceStore } from '../contexts/WorkspaceStoreContext';
import { useDaemonStatus } from '../hooks/useDaemonStatus';
import { projectIdForWorkspace } from '../services/ideSource';
import type { WorkspaceMeta } from '../services/workspaceService';
import type { SessionMeta } from '../types/agentSession';

const C = v2.colors;

// 좌측 사이드바 본문 — 도킹(태블릿)/오버레이(폰) 양쪽에서 공용.
//  구조(위→아래): ① 페이지 탭(현재 '워크스페이스' 하나) → ② 워크스페이스+세션 트리 → ③ 내 정보 고정.
//  overlay=true(폰)면 이동 후 오버레이/시트를 닫는다. docked(태블릿)면 그대로 유지.
export default function SidebarContent({ overlay = false }: { overlay?: boolean }) {
  const { closeDrawer } = useDrawer();
  const { openSheet, close: closeMyInfo } = useMyInfo();
  const { requestNewWorkspace } = useHomeAction();
  const navigation = useNavigation<any>();
  const { user } = useUser();
  const { localOnline } = useDaemonStatus();
  const { openSession, newSession, leaveSession, activeWorkspace, activeSessionId } = useAgentSession();
  const { workspaces, sessionsByWs, reload } = useWorkspaceStore();

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [refreshing, setRefreshing] = useState(false);

  // 활성 워크스페이스는 자동 펼침(현재 접속 대상의 세션이 보이도록).
  useEffect(() => {
    if (activeWorkspace?.id) setExpanded((e) => (e[activeWorkspace.id] ? e : { ...e, [activeWorkspace.id]: true }));
  }, [activeWorkspace?.id]);

  const afterNav = useCallback(() => { if (overlay) { closeDrawer(); closeMyInfo(); } }, [overlay, closeDrawer, closeMyInfo]);
  const goHome = useCallback(() => navigation.navigate('Tabs', { screen: 'home' }), [navigation]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    reload(true).finally(() => setRefreshing(false));
  }, [reload]);

  const toggleWs = useCallback((id: string) => {
    setExpanded((e) => ({ ...e, [id]: !e[id] }));
  }, []);

  // 세션 열기(이어받기) — local 은 pc: id 로 열어야 데몬 --resume 경로. (AppDrawer 검증된 방식)
  const enterSession = useCallback((ws: WorkspaceMeta, sess: SessionMeta) => {
    afterNav();
    openSession({ id: projectIdForWorkspace(ws), name: ws.name, kind: ws.kind }, sess.id).catch(() => { /* noop */ });
    goHome();
  }, [afterNav, openSession, goHome]);

  // 클라우드 워크스페이스에서 새 세션 시작(인라인). local 은 홈 허브의 진입 흐름을 쓴다.
  const newCloudSession = useCallback((ws: WorkspaceMeta) => {
    afterNav();
    newSession({ id: ws.id, name: ws.name, kind: 'project' }).catch(() => { /* noop */ });
    goHome();
  }, [afterNav, newSession, goHome]);

  // + 새 워크스페이스 → 홈으로 이동 후 생성(설명 입력) 모달 오픈.
  const newWorkspace = useCallback(() => {
    afterNav();
    leaveSession();
    goHome();
    requestNewWorkspace();
  }, [afterNav, leaveSession, goHome, requestNewWorkspace]);

  // 페이지 탭 '워크스페이스' 탭 → 홈 허브(최근 작업/생성 유도).
  const goWorkspacesHub = useCallback(() => {
    afterNav();
    leaveSession();
    goHome();
  }, [afterNav, leaveSession, goHome]);

  const openMyInfo = useCallback(() => { if (overlay) closeDrawer(); openSheet(); }, [overlay, closeDrawer, openSheet]);

  const nickname = (user as any)?.nickname || (user as any)?.name || '코더';
  const avatar = String(nickname).trim().charAt(0) || '코';

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: C.surface }}>
      {/* ── 상단: 페이지 탭 ── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingTop: 8, paddingBottom: 6, gap: 6 }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <PageTab label="워크스페이스" active onPress={goWorkspacesHub} />
        </View>
        {/* 폰 오버레이만 닫기 X. 태블릿 도킹은 메인 헤더 햄버거로만 토글(버튼 일원화). */}
        {overlay ? (
          <Pressable onPress={closeDrawer} hitSlop={8} style={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center' }}>
            <X size={19} color={C.text2} />
          </Pressable>
        ) : null}
      </View>

      {/* ── 워크스페이스 + 세션 트리 ── */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: 12, paddingTop: 2 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} colors={[C.accent]} progressBackgroundColor={C.surface} />}
      >
        <Pressable onPress={newWorkspace} android_ripple={{ color: C.elevated2 }} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, height: 42, paddingHorizontal: 10, borderRadius: v2.radius.md, marginBottom: 2 }}>
          <View style={{ width: 22, alignItems: 'center' }}><Plus size={17} color={C.accent} weight="bold" /></View>
          <Text style={{ color: C.text, fontSize: 14, fontWeight: '600', fontFamily: v2.font.sans }}>새 워크스페이스</Text>
        </Pressable>

        {workspaces.length === 0 ? (
          <Text style={{ color: C.textDim, fontSize: 12.5, paddingHorizontal: 12, paddingVertical: 10, lineHeight: 18 }}>
            아직 워크스페이스가 없어요.{'\n'}위에서 새로 만들어 시작하세요.
          </Text>
        ) : (
          workspaces.map((ws) => {
            const isOpen = !!expanded[ws.id];
            const sessions = sessionsByWs[ws.id] || [];
            const isActiveWs = activeWorkspace?.id === ws.id;
            return (
              <View key={ws.id}>
                {/* 워크스페이스 행 (탭=펼침/접기) */}
                <Pressable
                  onPress={() => toggleWs(ws.id)}
                  android_ripple={{ color: C.elevated2 }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, paddingHorizontal: 8, borderRadius: v2.radius.md, backgroundColor: isActiveWs ? C.accentTint : 'transparent' }}
                >
                  <View style={{ width: 16, alignItems: 'center' }}>
                    {isOpen ? <CaretDown size={12} color={C.textDim} weight="bold" /> : <CaretRight size={12} color={C.textDim} weight="bold" />}
                  </View>
                  {ws.compute === 'local'
                    ? <Laptop size={16} color={isActiveWs ? C.accent : C.textDim} weight="fill" />
                    : <Cloud size={16} color={isActiveWs ? C.accent : C.textDim} weight="fill" />}
                  <Text style={{ flex: 1, color: isActiveWs ? C.text : C.text2, fontSize: 13.5, fontWeight: '600', fontFamily: v2.font.mono }} numberOfLines={1}>{ws.name}</Text>
                  {ws.compute === 'local' ? (
                    <View style={{ width: 7, height: 7, borderRadius: 999, backgroundColor: localOnline ? C.accent : C.textDim }} />
                  ) : null}
                </Pressable>

                {/* 세션 목록 (펼침 시) */}
                {isOpen ? (
                  <View style={{ marginLeft: 16, borderLeftWidth: 1, borderLeftColor: C.border, paddingLeft: 6, marginBottom: 4 }}>
                    {sessions.length === 0 ? (
                      <Text style={{ color: C.textDim, fontSize: 11.5, paddingHorizontal: 10, paddingVertical: 7 }}>세션이 없어요</Text>
                    ) : (
                      sessions.map((sess) => {
                        const active = isActiveWs && activeSessionId === sess.id;
                        return (
                          <Pressable
                            key={sess.id}
                            onPress={() => enterSession(ws, sess)}
                            android_ripple={{ color: C.elevated2 }}
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 10, borderRadius: v2.radius.md, backgroundColor: active ? C.elevated2 : 'transparent' }}
                          >
                            {ws.kind === 'chat' ? <ChatCircleDots size={14} color={C.textDim} /> : <Terminal size={14} color={active ? C.accent : C.textDim} />}
                            <View style={{ flex: 1, minWidth: 0 }}>
                              <Text style={{ color: active ? C.text : C.text2, fontSize: 12.5, fontFamily: v2.font.sans }} numberOfLines={1}>{sess.title || '새 세션'}</Text>
                              {sess.updatedAt ? <Text style={{ color: C.textDim, fontSize: 10.5, marginTop: 1 }} numberOfLines={1}>{relShort(sess.updatedAt)}</Text> : null}
                            </View>
                          </Pressable>
                        );
                      })
                    )}
                    {/* 클라우드 워크스페이스: 새 세션 인라인 */}
                    {ws.compute !== 'local' ? (
                      <Pressable onPress={() => newCloudSession(ws)} android_ripple={{ color: C.elevated2 }} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 10, borderRadius: v2.radius.md }}>
                        <Plus size={13} color={C.textDim} weight="bold" />
                        <Text style={{ color: C.textDim, fontSize: 12, fontFamily: v2.font.sans }}>새 세션</Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}
              </View>
            );
          })
        )}
      </ScrollView>

      {/* ── 하단 고정: 내 정보 ── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.border }}>
        <Pressable
          onPress={openMyInfo}
          android_ripple={{ color: C.elevated2 }}
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6, paddingHorizontal: 8, borderRadius: v2.radius.md }}
        >
          <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: C.accentTint, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: C.accent, fontSize: 13, fontWeight: '700' }}>{avatar}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: C.text, fontSize: 14, fontWeight: '600' }} numberOfLines={1}>{nickname}</Text>
          </View>
        </Pressable>
        <Pressable onPress={openMyInfo} hitSlop={6} style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' }}>
          <Gear size={20} color={C.text2} />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

// 페이지 탭(상단) — 현재는 '워크스페이스' 하나. 이후 페이지 추가 시 여기에 확장.
function PageTab({ label, active, onPress }: { label: string; active?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: v2.radius.md, backgroundColor: active ? C.elevated2 : 'transparent' }}>
      <Text style={{ color: active ? C.text : C.textDim, fontSize: 14, fontWeight: '700', fontFamily: v2.font.sans }}>{label}</Text>
    </Pressable>
  );
}

// 짧은 상대시간
function relShort(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return '';
  const min = Math.floor((Date.now() - d) / 60000);
  if (min < 1) return '방금';
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day === 1) return '어제';
  if (day < 7) return `${day}일 전`;
  return `${Math.floor(day / 7)}주 전`;
}
