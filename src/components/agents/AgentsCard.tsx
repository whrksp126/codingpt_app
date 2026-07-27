// AgentsCard — 연결된 PC 에 설치된 AI 에이전트 목록·연동 토글·설치 진입. 설정 > 에이전트 본문.
//
// PC(`codingpt_pc/src/js/agents-view.js`)의 미러다. **등급 문구는 글자까지 같아야 한다** — 한쪽에서
//  "완전 연동"이라 읽은 사용자가 다른 쪽에서 다른 말을 보면 무엇이 되는지 알 수 없게 된다.
//   full    claude — 상태 감지 · 원격 승인 · 알림 (실행 인자 --settings 주입)
//   partial codex  — 알림만. **원격 승인 없음** (실행 인자 -c notify)
//   launch  그 외  — 실행 · 탭 표시까지만
// 배선은 claude/codex 두 종에만 한다(사용자 확정 2026-07-27): 나머지는 그 에이전트의 **개인 설정
//  파일**을 우리가 고쳐야 하는데, 그러면 CodingPT 밖에서 켜도 우리 훅이 발화하고 앱을 지우면
//  "cpt 를 못 찾겠다" 에러가 남는다(shim 이 없는 codex 를 감싸 냈던 사고와 같은 종류).
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';

import { v2 } from '../../theme/v2Tokens';
import Toggle from '../ui/Toggle';
import AgentLogo from '../../workspace/AgentLogo';
import daemonService, { DaemonAgent } from '../../services/daemonService';
import AgentInstallSheet from './AgentInstallSheet';

const C = v2.colors;

export const TIER_LABEL: Record<string, string> = {
  full: '완전 연동',
  partial: '알림 연동',
  launch: '실행 전용',
};
export const TIER_DESC: Record<string, string> = {
  full: '상태 감지 · 원격 승인 · 알림까지 연동돼요',
  partial: '작업 완료 알림이 와요. 원격 승인은 지원하지 않아요',
  launch: '실행과 탭 표시까지만. 알림 · 원격 승인은 안 돼요',
};

export default function AgentsCard({ host }: { host?: number | null }) {
  const [agents, setAgents] = useState<DaemonAgent[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [installing, setInstalling] = useState<DaemonAgent | null>(null);

  const load = useCallback(async (refresh?: boolean) => {
    try {
      const r = await daemonService.listAgents(host ?? null, !!refresh);
      setAgents(r.agents);
      setErr(null);
    } catch (e: any) {
      // 빈 목록으로 뭉개지 않는다 — 오프라인/구 데몬을 그대로 말한다.
      setErr(String(e?.message || e));
    }
  }, [host]);

  useEffect(() => { void load(true); }, [load]);

  const toggle = useCallback(async (a: DaemonAgent, on: boolean) => {
    setBusy(a.id);
    try {
      const r = await daemonService.wireAgent(a.id, on, host ?? null);
      setAgents(r.agents);
    } catch (e: any) {
      setErr(String(e?.message || e));
      void load();                       // 실패 시 서버 상태로 되돌린다(켠 척 금지)
    }
    setBusy(null);
  }, [host, load]);

  if (err && !agents) {
    return (
      <View style={{ paddingVertical: 14 }}>
        <Text style={{ color: C.textDim, fontSize: 12.5 }}>{err}</Text>
        <Pressable onPress={() => void load(true)} style={{ marginTop: 10, alignSelf: 'flex-start', paddingHorizontal: 12, height: 30, borderRadius: 8, borderWidth: 1, borderColor: C.borderControl, justifyContent: 'center' }}>
          <Text style={{ color: C.text, fontSize: 12.5 }}>다시 시도</Text>
        </Pressable>
      </View>
    );
  }
  if (!agents) {
    return <View style={{ paddingVertical: 18, alignItems: 'center' }}><ActivityIndicator color={C.accent} /></View>;
  }

  return (
    <View>
      {agents.map((a, i) => (
        <View key={a.id} style={{ paddingTop: i === 0 ? 4 : 10, paddingBottom: 8, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: C.border }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {/* 상태 점: 초록=연동 중, 회색=설치됐지만 연동 꺼짐, 빈 원=미설치 */}
            <View style={{
              width: 7, height: 7, borderRadius: 999,
              backgroundColor: a.installed ? (a.wired ? C.accent : C.text3) : 'transparent',
              borderWidth: a.installed ? 0 : 1, borderColor: C.borderControl,
            }} />
            <View style={{ width: 20, alignItems: 'center' }}><AgentLogo brand={a.id} size={17} /></View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 13.5, color: a.installed ? C.text : C.textDim }}>{a.name}</Text>
              <Text style={{ fontSize: 11, color: C.textDim, marginTop: 1 }}>
                {a.installed
                  ? `${a.version ? a.version + ' · ' : ''}${TIER_LABEL[a.tier] || a.tier}`
                  : `미설치 · ${TIER_LABEL[a.tier] || a.tier}`}
              </Text>
            </View>
            {!a.installed ? (
              <Pressable
                onPress={() => setInstalling(a)}
                style={{ paddingHorizontal: 12, height: 30, borderRadius: 8, borderWidth: 1, borderColor: C.borderControl, justifyContent: 'center' }}
              >
                <Text style={{ color: C.text, fontSize: 12.5 }}>설치</Text>
              </Pressable>
            ) : a.wirable ? (
              <Toggle value={a.wired} onValueChange={(v) => void toggle(a, v)} disabled={busy === a.id} />
            ) : null}
          </View>
          <Text style={{ fontSize: 11, color: C.textDim, marginTop: 5, marginLeft: 37 }}>{TIER_DESC[a.tier] || ''}</Text>
        </View>
      ))}
      {err ? <Text style={{ color: C.textDim, fontSize: 11.5, marginTop: 6 }}>{err}</Text> : null}
      <Text style={{ fontSize: 11, color: C.textDim, marginTop: 8 }}>
        연동을 켜면 그 에이전트를 실행할 때만 우리 설정이 얹혀요 — 개인 설정 파일(~/.claude · ~/.codex)은
        수정하지 않아요.
      </Text>

      {installing ? (
        <AgentInstallSheet
          agent={installing}
          host={host ?? null}
          onClose={() => setInstalling(null)}
          onInstalled={(list) => setAgents(list)}
        />
      ) : null}
    </View>
  );
}
