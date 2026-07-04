import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Desktop, GithubLogo, Cloud } from 'phosphor-react-native';

import { Label } from '../../components/v2/primitives';
import { v2 } from '../../theme/v2Tokens';
import { sheetRefreshControl } from '../../components/v2/refresh';
import { useMyInfo } from '../../contexts/MyInfoContext';
import githubService, { GithubStatus } from '../../services/githubService';

const C = v2.colors;
const R = v2.radius;

function ConnRow({
  icon, name, meta, status, tone = 'on', action, onPress, last,
}: {
  icon: React.ReactNode; name: string; meta: string;
  status?: string; tone?: 'on' | 'wait' | 'off'; action?: string; onPress?: () => void; last?: boolean;
}) {
  const dot = tone === 'on' ? C.accent : tone === 'wait' ? C.warn : C.textDim;
  const numeric = /[0-9]/.test(meta);
  return (
    <Pressable
      onPress={onPress}
      android_ripple={onPress ? { color: C.elevated2 } : undefined}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 13, paddingHorizontal: 14, borderBottomWidth: last ? 0 : 1, borderBottomColor: C.border }}
    >
      <View style={{ width: 34, height: 34, borderRadius: 9, backgroundColor: C.elevated2, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}>{icon}</View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 13.5, fontWeight: '600', color: C.text }} numberOfLines={1}>{name}</Text>
        <Text style={{ fontSize: 11.5, color: C.textDim, marginTop: 1, fontFamily: numeric ? v2.font.mono : v2.font.sans }} numberOfLines={1}>{meta}</Text>
      </View>
      {action ? (
        <Text style={{ fontSize: 12.5, color: C.accent, fontWeight: '700' }}>{action}</Text>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <View style={{ width: 7, height: 7, borderRadius: 999, backgroundColor: dot }} />
          <Text style={{ fontSize: 12, color: tone === 'off' ? C.textDim : C.text2 }}>{status}</Text>
        </View>
      )}
    </Pressable>
  );
}

// 연결 상세 — 로컬 PC / GitHub / 서버. (내정보 → 연결)
const ConnectionsContent: React.FC = () => {
  const { openGithub, githubOpen } = useMyInfo();
  const [github, setGithub] = useState<GithubStatus>({ connected: false });
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(() => {
    setRefreshing(true);
    githubService.getStatus().then(setGithub).catch(() => {}).finally(() => setRefreshing(false));
  }, []);

  // GitHub 시트가 닫힐 때(및 마운트 시) 상태 재조회.
  useFocusEffect(useCallback(() => {
    githubService.getStatus().then(setGithub).catch(() => {});
  }, []));
  React.useEffect(() => {
    if (!githubOpen) githubService.getStatus().then(setGithub).catch(() => {});
  }, [githubOpen]);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.base }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40 }} showsVerticalScrollIndicator={false} refreshControl={sheetRefreshControl(refreshing, refresh)}>
      <Label style={{ marginBottom: 8, paddingHorizontal: 2 }}>코드 동기화</Label>
      <View style={{ borderWidth: 1, borderColor: C.border, borderRadius: R.lg, backgroundColor: C.surface, overflow: 'hidden', marginBottom: 22 }}>
        <ConnRow
          icon={<GithubLogo size={18} color={C.text2} />}
          name="GitHub"
          meta={github.connected ? `@${github.login} · 자동 푸시` : '아직 연결되지 않았어요'}
          status={github.connected ? '연결됨' : undefined}
          tone={github.connected ? 'on' : 'off'}
          action={github.connected ? '관리' : '연결'}
          onPress={openGithub}
          last
        />
      </View>

      <Label style={{ marginBottom: 8, paddingHorizontal: 2 }}>실행 환경</Label>
      <View style={{ borderWidth: 1, borderColor: C.border, borderRadius: R.lg, backgroundColor: C.surface, overflow: 'hidden' }}>
        <ConnRow icon={<Cloud size={18} color={C.text2} />} name="서버 · 클라우드" meta="기본 실행 환경 · 항상 사용 가능" status="사용 중" tone="on" />
        <ConnRow icon={<Desktop size={18} color={C.text2} />} name="내 PC (로컬 연결)" meta="데스크톱 데몬으로 내 컴퓨터에서 실행 · 준비 중" status="준비 중" tone="wait" last />
      </View>
    </ScrollView>
  );
};

export default ConnectionsContent;
