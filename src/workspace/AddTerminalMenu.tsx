// AddTerminalMenu — 헤더 "터미널 추가" 드롭다운. [터미널] + 이 PC 에 **설치된** 에이전트.
//  PC `workspace-view.js` openAddTermMenu 의 미러(같은 목록·같은 순서).
//
// 미설치 항목은 넣지 않는다: 여기서 할 일은 "지금 띄우기"이고, 설치 안내는 설정 > 에이전트가 맡는다.
//  (회색으로 걸어두면 누를 때마다 "설치하러 가기"를 또 안내해야 하고, 목록이 길어져 실사용이 느려진다)
import React, { useEffect, useState } from 'react';
import { View, Text, Modal, Pressable, ActivityIndicator } from 'react-native';
import { TerminalWindow } from 'phosphor-react-native';

import { v2 } from '../theme/v2Tokens';
import AgentLogo from './AgentLogo';
import daemonService, { DaemonAgent } from '../services/daemonService';

const C = v2.colors;

export default function AddTerminalMenu({ visible, host, onClose, onPick }: {
  visible: boolean;
  host?: number | null;
  onClose: () => void;
  /** agentId=null → 그냥 새 터미널 */
  onPick: (agentId: string | null) => void;
}) {
  const [agents, setAgents] = useState<DaemonAgent[] | null>(null);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    // 실패하면 [터미널] 만 보여준다(구 데몬·오프라인) — 메뉴 자체를 막지 않는다.
    daemonService.listAgents(host ?? null, false)
      .then((r) => { if (alive) setAgents(r.agents.filter((a) => a.installed)); })
      .catch(() => { if (alive) setAgents([]); });
    return () => { alive = false; };
  }, [visible, host]);

  if (!visible) return null;
  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}
      supportedOrientations={['portrait', 'portrait-upside-down', 'landscape', 'landscape-left', 'landscape-right']}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(5,7,12,0.45)' }} onPress={onClose}>
        <View style={{
          position: 'absolute', top: 54, right: 12, minWidth: 200,
          backgroundColor: C.elevated, borderRadius: 12, borderWidth: 1, borderColor: C.borderControl,
          paddingVertical: 5, shadowColor: '#000', shadowOpacity: 0.32, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 8,
        }}>
          <MenuRow
            icon={<TerminalWindow size={16} color={C.textDim} />}
            label="터미널"
            onPress={() => { onClose(); onPick(null); }}
          />
          {agents === null ? (
            <View style={{ paddingVertical: 10, alignItems: 'center' }}><ActivityIndicator color={C.text3} size="small" /></View>
          ) : agents.map((a) => (
            <MenuRow
              key={a.id}
              icon={<AgentLogo brand={a.id} size={16} />}
              label={a.name}
              onPress={() => { onClose(); onPick(a.id); }}
            />
          ))}
        </View>
      </Pressable>
    </Modal>
  );
}

// ★ Pressable 의 **함수형 style 금지**(CLAUDE.md 절대 함정). NativeWind 4 가 Pressable 을 감싸면서
//  `style={({pressed}) => ({...})}` 를 통째로 버린다 → flexDirection/height/padding/fontSize 가 전부
//  사라져 아이콘이 라벨 위로 올라가고 글자가 커진다(2026-07-28 실기기에서 이 메뉴가 그 상태였다).
//  눌림 표현은 state 로 직접 만든다.
function MenuRow({ icon, label, onPress }: { icon: React.ReactNode; label: string; onPress: () => void }) {
  const [pressed, setPressed] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 12, height: 40,
        backgroundColor: pressed ? C.elevated2 : 'transparent',
      }}
    >
      <View style={{ width: 18, alignItems: 'center' }}>{icon}</View>
      <Text style={{ fontSize: 13.5, color: C.text }}>{label}</Text>
    </Pressable>
  );
}
