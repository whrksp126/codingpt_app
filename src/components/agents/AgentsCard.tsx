// AgentsCard — 연결된 PC 에 설치된 AI 에이전트 목록·연동 토글·**행 아래 인라인 설치 패널**.
//
// PC(`codingpt_pc/src/js/agents-view.js`)의 미러다. **등급 라벨은 글자까지 같아야 한다** — 상세
//  설명문을 걷어낸 뒤로는 이 라벨이 "codex 는 원격 승인이 안 된다" 를 전하는 **유일한 채널**이다.
//   full    claude — 상태 감지 · 원격 승인 · 알림 (실행 인자 --settings 주입)
//   partial codex  — 알림만. **원격 승인 없음** (실행 인자 -c notify)
//   launch  그 외  — 실행 · 탭 표시까지만
//
// 사용자 확정(2026-07-27 2차): 좌측 상태 점 제거 · 에이전트별 설명문 제거 · 하단 요약 문단 제거 ·
//  설치는 모달 위 모달을 만들지 않고 **그 행 아래에서 펼친다** · 이 영역에 포인트 컬러 금지.
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';

import { v2 } from '../../theme/v2Tokens';
import Toggle from '../ui/Toggle';
import AgentLogo from '../../workspace/AgentLogo';
import daemonService, { DaemonAgent } from '../../services/daemonService';
import AgentInstallPanel from './AgentInstallPanel';

const C = v2.colors;

export const TIER_LABEL: Record<string, string> = {
  full: '완전 연동',
  partial: '알림+승인 연동',
  launch: '실행 전용',
};

export default function AgentsCard({ host }: { host?: number | null }) {
  const [agents, setAgents] = useState<DaemonAgent[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

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
    return <View style={{ paddingVertical: 18, alignItems: 'center' }}><ActivityIndicator color={C.text3} /></View>;
  }

  return (
    <View>
      {agents.map((a, i) => (
        <View key={a.id} style={{ borderTopWidth: i === 0 ? 0 : 1, borderTopColor: C.border }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 11 }}>
            <View style={{ width: 20, alignItems: 'center' }}><AgentLogo brand={a.id} size={17} /></View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 13.5, color: a.installed ? C.text : C.textDim }}>{a.name}</Text>
              <Text style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>
                {a.installed
                  ? `${a.version ? a.version + ' · ' : ''}${TIER_LABEL[a.tier] || a.tier}`
                  : `미설치 · ${TIER_LABEL[a.tier] || a.tier}`}
              </Text>
            </View>
            {!a.installed ? (
              <Pressable
                onPress={() => setOpenId(openId === a.id ? null : a.id)}
                style={{ paddingHorizontal: 12, height: 30, borderRadius: 8, borderWidth: 1, borderColor: C.borderControl, justifyContent: 'center' }}
              >
                <Text style={{ color: C.text, fontSize: 12.5 }}>{openId === a.id ? '닫기' : '설치'}</Text>
              </Pressable>
            ) : a.wirable ? (
              <Toggle value={a.wired} onValueChange={(v) => void toggle(a, v)} disabled={busy === a.id} />
            ) : null}
          </View>
          {openId === a.id ? (
            <AgentInstallPanel
              agent={a}
              host={host ?? null}
              onInstalled={(list) => { setAgents(list); setOpenId(null); }}
            />
          ) : null}
        </View>
      ))}
      {err ? <Text style={{ color: C.textDim, fontSize: 11.5, marginTop: 6 }}>{err}</Text> : null}
    </View>
  );
}
