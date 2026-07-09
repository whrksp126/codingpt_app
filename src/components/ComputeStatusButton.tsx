import React, { useCallback } from 'react';
import { View, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Desktop, Cloud } from 'phosphor-react-native';

import { v2 } from '../theme/v2Tokens';
import { useDaemonStatus } from '../hooks/useDaemonStatus';
import { useAgentSession } from '../contexts/AgentSessionContext';
import { useIdeProject } from '../contexts/IdeProjectContext';
import { daemonProjectId } from '../services/ideSource';
import daemonService from '../services/daemonService';

const C = v2.colors;

// 워크스페이스 목록 우상단 — 내 PC(데몬) ↔ 가상 서버(클라우드) 연결 상태 인디케이터.
//  · 탭: 내 PC 온라인이면 PC 터미널로 바로 진입(데몬 IDE + 터미널 자동 오픈),
//        아니면 연결/페어링 화면(LocalAgent)으로.
//  · Slice2 에서 워크스페이스 루트가 정해지면 진입 루트를 홈('')→워크스페이스 루트로 교체 예정.
export default function ComputeStatusButton() {
  const navigation = useNavigation<any>();
  const { localOnline, hasDevice, cloudOnline, hasCloudRunner, activeRunnerKind } = useDaemonStatus();
  const { setActiveWorkspace } = useAgentSession();
  const { openIde } = useIdeProject();

  const enterPcTerminal = useCallback(async () => {
    // 활성이 클라우드면 로컬로 되돌린 뒤 내 PC 터미널로(라우팅 일관성).
    if (hasCloudRunner && activeRunnerKind !== 'local') { await daemonService.activateRunner({ kind: 'local' }).catch(() => { /* noop */ }); }
    const pid = daemonProjectId(''); // 데몬 홈 루트(터미널은 트리 로드와 독립적으로 즉시 뜸)
    setActiveWorkspace({ id: pid, name: '내 PC', kind: 'project', runnerKind: 'local' });
    navigation.navigate('Tabs', { screen: 'home' });
    openIde({ ide: { projectId: pid, projectName: '내 PC', openTerminal: true } });
  }, [navigation, setActiveWorkspace, openIde, hasCloudRunner, activeRunnerKind]);

  const onPress = useCallback(() => {
    if (localOnline) void enterPcTerminal();
    else navigation.navigate('LocalAgent');
  }, [localOnline, enterPcTerminal, navigation]);

  const pcDot = localOnline ? C.accent : hasDevice ? C.warn : C.textDim;
  const cloudDot = cloudOnline ? C.accent : C.textDim;

  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: C.elevated2 }}
      hitSlop={6}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 6, paddingHorizontal: 11, borderRadius: 999, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface }}
    >
      <StatChip icon={<Desktop size={14} color={C.text2} weight="fill" />} dot={pcDot} active={activeRunnerKind === 'local'} />
      <View style={{ width: 1, height: 12, backgroundColor: C.border }} />
      <StatChip icon={<Cloud size={14} color={C.text2} weight="fill" />} dot={cloudDot} active={activeRunnerKind === 'cloud'} />
    </Pressable>
  );
}

// active=현재 RPC 라우팅 대상 러너 → 링으로 강조.
function StatChip({ icon, dot, active }: { icon: React.ReactNode; dot: string; active?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: active ? 4 : 0, paddingVertical: active ? 2 : 0, borderRadius: 999, borderWidth: active ? 1 : 0, borderColor: active ? C.accent : 'transparent' }}>
      {icon}
      <View style={{ width: 6, height: 6, borderRadius: 999, backgroundColor: dot }} />
    </View>
  );
}
