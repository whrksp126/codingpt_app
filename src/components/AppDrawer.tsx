import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, Dimensions, Image, StyleSheet, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import {
  X, Folders, GraduationCap, Gear, ChatCircleDots, FolderSimple,
} from 'phosphor-react-native';
import { v2 } from '../theme/v2Tokens';
import { useDrawer } from '../contexts/DrawerContext';
import { useMyInfo } from '../contexts/MyInfoContext';
import { useUser } from '../contexts/UserContext';
import { useAgentSession } from '../contexts/AgentSessionContext';
import { useWorkspaceStore, RecentSession } from '../contexts/WorkspaceStoreContext';
import { projectIdForWorkspace } from '../services/ideSource';

const C = v2.colors;
const LOGO = require('../assets/bootsplash/logo.png');
const SCREEN_W = Dimensions.get('window').width;
const W = Math.min(330, Math.round(SCREEN_W * 0.86));

// 주의: NativeWind 함수형 style 버그 → Pressable 에 함수형 style 금지. 일반 style + ripple 사용.
const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', height: 46, paddingHorizontal: 12, borderRadius: v2.radius.md },
  iconWrap: { width: 22, alignItems: 'center', marginRight: 14 },
  sessRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, paddingHorizontal: 12, borderRadius: v2.radius.md },
});

function Row({ icon, label, onPress }: { icon: React.ReactNode; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} android_ripple={{ color: C.elevated2 }} style={s.row}>
      <View style={s.iconWrap}>{icon}</View>
      <Text style={{ color: C.text, fontSize: 14.5, fontWeight: '500', fontFamily: v2.font.sans }} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

export default function AppDrawer() {
  const { open, closeDrawer } = useDrawer();
  const { openSheet, close: closeMyInfo } = useMyInfo();
  // 드로어가 내 정보 시트 위에 뜰 수 있으므로, 다른 메뉴로 이동할 땐 드로어+시트를 함께 닫는다
  // (안 닫으면 시트가 이동한 탭을 그대로 덮어 가림).
  const closeOverlays = useCallback(() => { closeDrawer(); closeMyInfo(); }, [closeDrawer, closeMyInfo]);
  const navigation = useNavigation<any>();
  const { user } = useUser();
  const { openSession, leaveSession } = useAgentSession();
  // 최근 세션 = 스플래시에서 프리로드된 스토어(드로어 열 때 재요청 X). 열릴 때 조용히 갱신.
  const { recentSessions, reload: reloadWorkspaceStore } = useWorkspaceStore();
  const recent: RecentSession[] = recentSessions.slice(0, 15);
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    reloadWorkspaceStore(true).finally(() => setRefreshing(false));
  }, [reloadWorkspaceStore]);

  const tx = useSharedValue(-W);
  const fade = useSharedValue(0);
  useEffect(() => {
    tx.value = withTiming(open ? 0 : -W, { duration: 260, easing: Easing.out(Easing.cubic) });
    fade.value = withTiming(open ? 1 : 0, { duration: 240 });
  }, [open, tx, fade]);

  useEffect(() => { if (open) void reloadWorkspaceStore(true); }, [open, reloadWorkspaceStore]);

  const panelStyle = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: fade.value * 0.62 }));

  const openMyInfo = useCallback(() => { closeDrawer(); openSheet(); }, [closeDrawer, openSheet]);

  const goTab = (screen: string, inner?: string) =>
    navigation.navigate('Tabs', inner ? { screen, params: { screen: inner } } : { screen });
  const goHome = () => navigation.navigate('Tabs', { screen: 'home' });

  // 채팅 → 홈 채팅 랜딩(활성 세션 해제 후 홈으로). 거기서 입력하면 새 채팅 세션 시작.
  const goChat = useCallback(() => { closeOverlays(); leaveSession(); goHome(); }, [closeOverlays, leaveSession]);

  // 세션 클릭 → 그 세션을 메인 채팅에 열기.
  // 화면 전환(드로어 닫기 + 홈)은 즉시. openSession 의 동기 상태 세팅으로 채팅 셸이 바로 뜨고,
  // 대화 본문 네트워크 로드는 백그라운드(스켈레톤) — 전환이 로드를 기다리지 않게 한다.
  const enterSession = useCallback((r: RecentSession) => {
    closeOverlays();
    // local(PC) 워크스페이스는 pc: id 로 열어야 데몬 이어받기(--resume) 경로가 탄다.
    openSession({ id: projectIdForWorkspace(r.ws), name: r.ws.name, kind: r.ws.kind }, r.sess.id).catch(() => { /* noop */ });
    goHome();
  }, [closeOverlays, openSession]);

  const nickname = (user as any)?.nickname || (user as any)?.name || '코더';
  const avatar = String(nickname).trim().charAt(0) || '코';

  return (
    <View pointerEvents={open ? 'auto' : 'none'} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
      <Animated.View style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#05070C' }, backdropStyle]}>
        <Pressable style={{ flex: 1 }} onPress={closeDrawer} />
      </Animated.View>

      <Animated.View style={[{ position: 'absolute', top: 0, left: 0, bottom: 0, width: W, backgroundColor: C.surface, borderRightWidth: 1, borderRightColor: C.border }, panelStyle]}>
        <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
          {/* 헤더: 로고 + 닫기 */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 }}>
            <Image source={LOGO} style={{ width: 116, height: Math.round((116 * 34) / 180) }} resizeMode="contain" />
            <Pressable onPress={closeDrawer} hitSlop={8} style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}>
              <X size={20} color={C.text2} />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: 12, paddingTop: 4 }}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} colors={[C.accent]} progressBackgroundColor={C.surface} />}
          >
            {/* 네비게이션 */}
            <Row icon={<ChatCircleDots size={19} color={C.text2} />} label="채팅" onPress={goChat} />
            <Row icon={<Folders size={19} color={C.text2} />} label="워크스페이스" onPress={() => { closeOverlays(); goTab('store', 'ProjectsScreen'); }} />
            <Row icon={<GraduationCap size={19} color={C.text2} />} label="배우기" onPress={() => { closeOverlays(); goTab('myLessons', 'MyLessonsScreen'); }} />

            {/* 최근 세션(코딩 워크스페이스 세션) */}
            <Text style={{ fontFamily: v2.font.mono, fontSize: 11, letterSpacing: 0.4, color: C.textDim, marginTop: 18, marginBottom: 4, paddingHorizontal: 12 }}>최근 세션</Text>
            {recent.length === 0 ? (
              <Text style={{ color: C.textDim, fontSize: 12.5, paddingHorizontal: 12, paddingVertical: 8 }}>최근 세션이 없어요</Text>
            ) : (
              recent.map((r) => (
                <Pressable key={`${r.ws.id}:${r.sess.id}`} onPress={() => enterSession(r)} android_ripple={{ color: C.elevated2 }} style={s.sessRow}>
                  {r.ws.kind === 'chat'
                    ? <ChatCircleDots size={16} color={C.textDim} />
                    : <FolderSimple size={16} color={C.textDim} />}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: C.text2, fontSize: 13.5, fontFamily: v2.font.sans }} numberOfLines={1}>{r.sess.title || (r.ws.kind === 'chat' ? '새 채팅' : '새 세션')}</Text>
                    <Text style={{ color: C.textDim, fontSize: 11, marginTop: 1 }} numberOfLines={1}>{r.ws.name}{r.sess.updatedAt ? ` · ${relShort(r.sess.updatedAt)}` : ''}</Text>
                  </View>
                </Pressable>
              ))
            )}
          </ScrollView>

          {/* 푸터: 프로필 + 설정 */}
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
      </Animated.View>
    </View>
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
