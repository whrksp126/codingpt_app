import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Desktop, GithubLogo, Cloud } from 'phosphor-react-native';

import { Label } from '../../components/v2/primitives';
import { v2 } from '../../theme/v2Tokens';
import { sheetRefreshControl } from '../../components/v2/refresh';
import { useMyInfo } from '../../contexts/MyInfoContext';
import githubService, { GithubStatus } from '../../services/githubService';
import daemonService, { AccountDevice } from '../../services/daemonService';

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
  const [devices, setDevices] = useState<AccountDevice[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(() => {
    setRefreshing(true);
    Promise.allSettled([
      githubService.getStatus().then(setGithub),
      daemonService.listDevices().then((r) => setDevices(r.devices)),
    ]).finally(() => setRefreshing(false));
  }, []);

  // GitHub 시트가 닫힐 때(및 마운트 시) 상태 재조회.
  useFocusEffect(useCallback(() => {
    githubService.getStatus().then(setGithub).catch(() => {});
    daemonService.listDevices().then((r) => setDevices(r.devices)).catch(() => {});
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

      <Label style={{ marginBottom: 8, paddingHorizontal: 2 }}>내 기기</Label>
      <View style={{ borderWidth: 1, borderColor: C.border, borderRadius: R.lg, backgroundColor: C.surface, overflow: 'hidden' }}>
        {(() => {
          // 멀티기기: 계정에 로그인된 모든 호스트(내 PC들) + 항상 켜진 클라우드 호스트.
          const list = devices.length
            ? devices
            : ([{ id: 'cloud', name: '클라우드', platform: 'cloud', role: 'host', runnerKind: 'cloud', online: true, virtual: true }] as AccountDevice[]);
          return list.map((d, i) => {
            const isCloud = d.runnerKind === 'cloud';
            const meta = isCloud
              ? '항상 켜짐 · 우리가 제공하는 실행 환경'
              : `${d.platform === 'darwin' ? 'macOS' : d.platform === 'win32' ? 'Windows' : d.platform || '기기'}${d.isCurrent ? ' · 이 기기' : ''}`;
            return (
              <ConnRow
                key={String(d.id)}
                icon={isCloud ? <Cloud size={18} color={C.text2} /> : <Desktop size={18} color={C.text2} />}
                name={d.name}
                meta={meta}
                status={d.online ? '온라인' : '오프라인'}
                tone={d.online ? 'on' : 'off'}
                last={i === list.length - 1}
              />
            );
          });
        })()}
      </View>
      <Text style={{ fontSize: 11.5, color: C.textDim, marginTop: 8, paddingHorizontal: 2, lineHeight: 17 }}>
        기기에서 코딩PT에 로그인하면 자동으로 등록돼요. 워크스페이스를 열면 그 워크스페이스가 있는 기기에서 이어서 작업합니다.
      </Text>
    </ScrollView>
  );
};

export default ConnectionsContent;
