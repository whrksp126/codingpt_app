// AddTerminalMenu — 헤더 "터미널 추가" 드롭다운. [터미널] + 이 PC 에 **설치된** 에이전트.
//  PC `workspace-view.js` openAddTermMenu 의 미러(같은 목록·같은 순서).
//
// 미설치 항목은 넣지 않는다: 여기서 할 일은 "지금 띄우기"이고, 설치 안내는 설정 > 에이전트가 맡는다.
//  (회색으로 걸어두면 누를 때마다 "설치하러 가기"를 또 안내해야 하고, 목록이 길어져 실사용이 느려진다)
import React, { useEffect, useState } from 'react';
import { View, Text, Modal, Pressable, ActivityIndicator } from 'react-native';
import Animated, { withTiming } from 'react-native-reanimated';
import { TerminalWindow } from 'phosphor-react-native';

import { v2 } from '../theme/v2Tokens';
import { PressableRow } from '../components/ui';
import AgentLogo from './AgentLogo';
import daemonService, { DaemonAgent } from '../services/daemonService';
import * as i18n from '../i18n/index.ts';

const C = v2.colors;

// 팝오버 등장 — 150ms 페이드 + scale .98→1 (설계 §0.4). 퇴장은 즉시.
const popEnter = () => {
  'worklet';
  return {
    initialValues: { opacity: 0, transform: [{ scale: 0.98 }] },
    animations: { opacity: withTiming(1, { duration: 150 }), transform: [{ scale: withTiming(1, { duration: 150 }) }] },
  };
};

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
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={onClose}
      supportedOrientations={['portrait', 'portrait-upside-down', 'landscape', 'landscape-left', 'landscape-right']}>
      {/* 팝오버 — 배경을 가리지 않는다(AddSurfaceSheet 와 같은 규칙). 바깥 영역은 닫기만 담당. */}
      <Pressable style={{ flex: 1 }} onPress={onClose}>
        {/* 팝오버 규격(설계 §0.8): elevated · r-lg · borderControl 헤어라인 · 그림자 0 8 24 .40 · 행 h44 */}
        <Animated.View entering={popEnter} style={{
          position: 'absolute', top: 54, right: 12, minWidth: 200,
          backgroundColor: C.elevated, borderRadius: v2.radius.lg, borderWidth: 1, borderColor: C.borderControl,
          padding: 4, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 8,
        }}>
          <MenuRow
            icon={<TerminalWindow size={18} color={C.text2} />}
            label={i18n.t('터미널')}
            onPress={() => { onClose(); onPick(null); }}
          />
          {agents === null ? (
            <View style={{ paddingVertical: 10, alignItems: 'center' }}><ActivityIndicator color={C.text3} size="small" /></View>
          ) : agents.map((a) => (
            <MenuRow
              key={a.id}
              icon={<AgentLogo brand={a.id} size={18} />}
              label={a.name}
              onPress={() => { onClose(); onPick(a.id); }}
            />
          ))}
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

// ★ Pressable 의 **함수형 style 금지**(CLAUDE.md 절대 함정). NativeWind 4 가 Pressable 을 감싸면서
//  `style={({pressed}) => ({...})}` 를 통째로 버린다(2026-07-28 실기기에서 이 메뉴가 그 상태였다).
//  눌림 표현은 공용 PressableRow(iOS pressed 워시 / Android ripple)가 배열 style 로 만든다.
function MenuRow({ icon, label, onPress }: { icon: React.ReactNode; label: string; onPress: () => void }) {
  return (
    <PressableRow onPress={onPress} radius={v2.radius.sm}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10 }}>
      <View style={{ width: 20, alignItems: 'center' }}>{icon}</View>
      <Text style={{ fontSize: v2.font.size.body, color: C.text, fontFamily: v2.font.sans }}>{label}</Text>
    </PressableRow>
  );
}
