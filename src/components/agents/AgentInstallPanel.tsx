// AgentInstallPanel — 미설치 에이전트의 설치 안내. **행 아래 인라인 확장**(모달 위 모달 금지,
//  사용자 확정 2026-07-27). PC `agents-view.js` 의 `buildInstallPanel` 미러.
//
//   1. 설치 명령 — 방법이 여러 개면 **탭이 아니라 위에서 아래로 전부** 보여준다(각 줄에 복사 버튼)
//   2. 이 패널 안의 실제 PC 터미널에서 실행
//   3. 재감지로 검증 → 연동
//
// 지켜야 하는 것:
//  · 명령을 몰래 실행하지 않는다 — 사용자가 보는 터미널에서 돌고, Ctrl+C 로 멈출 수 있다.
//  · **성공 판정은 명령의 종료 코드가 아니라 재감지 결과**다("npm 성공 + PATH 없음"이 흔하다).
//  · 명령은 낡을 수 있으니 공식 문서 링크를 항상 함께 둔다.
//  · 이 영역에 포인트 컬러(accent)를 쓰지 않는다 — 버튼은 중립 테두리, 링크는 밑줄.
// 설치 명령은 데몬 카탈로그에서 온다(서버가 실행 문자열을 내려주면 그게 원격 코드 실행 통로다).
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, Linking, Clipboard } from 'react-native';

import { v2 } from '../../theme/v2Tokens';
import TerminalWebView, { TerminalHandle } from '../module/ide/TerminalWebView';
import daemonService, { DaemonAgent } from '../../services/daemonService';
import { haptic } from '../../animations/haptics';

const C = v2.colors;

export default function AgentInstallPanel({ agent, host, onInstalled }: {
  agent: DaemonAgent;
  host: number | null;
  onInstalled: (agents: DaemonAgent[]) => void;
}) {
  const [wsUrl, setWsUrl] = useState<string | null>(null);
  const [termErr, setTermErr] = useState<string | null>(null);
  const [copied, setCopied] = useState<number | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [warn, setWarn] = useState<string | null>(null);
  const termRef = useRef<TerminalHandle>(null);
  const methods = agent.install || [];

  // 설치용 터미널 — 홈 경로(cwd='')의 전용 세션 하나. 워크스페이스 터미널 목록에는 안 보인다.
  //  패널을 닫을 때 죽이지 않는다: 진행 중인 설치를 자르지 않기 위해서다(세션은 최대 1개).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const t = await daemonService.newTerminal('', 'ag-install', host);
        const token = await daemonService.startTerminal('', 'ag-install', t.index, host);
        if (!alive) return;
        setWsUrl(daemonService.buildTerminalWsUrl(token));
      } catch (e: any) {
        if (alive) setTermErr(String(e?.message || e));
      }
    })();
    return () => { alive = false; };
  }, [host]);

  const copy = useCallback((i: number) => {
    haptic.keyPress();
    Clipboard.setString(methods[i]?.cmd || '');
    setCopied(i);
    setTimeout(() => setCopied(null), 1200);
  }, [methods]);

  const run = useCallback(() => {
    haptic.keyPress();
    const cmd = methods[0]?.cmd || '';
    if (!cmd) return;
    // 개행까지 함께 보내 곧바로 실행된다(사용자가 화면에서 그대로 본다).
    termRef.current?.sendKey(cmd + '\r');
  }, [methods]);

  const verify = useCallback(async () => {
    setVerifying(true);
    setWarn(null);
    try {
      const r = await daemonService.rescanAgents(host, false);
      const now = r.agents.find((x) => x.id === agent.id);
      if (now && now.installed) {
        onInstalled(r.agents);          // 패널 접고 목록 갱신 — 행이 바뀐 것이 결과 표시다
      } else {
        // 못 찾았으면 못 찾았다고 말한다.
        setWarn(`아직 못 찾았어요. 설치가 끝났는데도 이러면 터미널에서 ${agent.bin} --version 을 확인해 주세요.`);
      }
    } catch (e: any) {
      setWarn(String(e?.message || e));
    }
    setVerifying(false);
  }, [host, agent.id, agent.bin, onInstalled]);

  return (
    <View style={{ paddingLeft: 31, paddingBottom: 14 }}>
      <StepHead n="1" title="설치 명령" />
      {methods.length ? methods.map((m, i) => (
        <View key={m.label} style={{ marginBottom: 7 }}>
          <Text style={{ fontSize: 11, color: C.textDim, marginBottom: 4 }}>{m.label}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              style={{ flex: 1, backgroundColor: C.elevated2, borderRadius: 7, borderWidth: 1, borderColor: C.border }}
              contentContainerStyle={{ paddingHorizontal: 10, paddingVertical: 7 }}>
              <Text style={{ fontSize: 12, color: C.text, fontFamily: 'monospace' }}>{m.cmd}</Text>
            </ScrollView>
            <Pressable onPress={() => copy(i)} style={{ paddingHorizontal: 11, height: 30, borderRadius: 8, borderWidth: 1, borderColor: C.borderControl, justifyContent: 'center' }}>
              <Text style={{ fontSize: 12, color: C.text }}>{copied === i ? '복사됨' : '복사'}</Text>
            </Pressable>
          </View>
        </View>
      )) : (
        <Text style={{ fontSize: 12, color: C.textDim }}>이 에이전트는 설치 방법이 자주 바뀌어요 — 공식 문서를 확인해 주세요.</Text>
      )}
      <Text style={{ fontSize: 11, color: C.textDim, marginTop: 8 }}>
        설치 방법은 바뀔 수 있어요 — 잘 안 되면{' '}
        <Text
          style={{ color: C.text2, textDecorationLine: 'underline' }}
          onPress={() => { if (agent.docs) Linking.openURL(agent.docs).catch(() => {}); }}
        >공식 문서</Text>
        를 확인하세요.
      </Text>

      <StepHead n="2" title="터미널에서 실행" right={
        <Pressable
          onPress={run}
          disabled={!wsUrl || !methods.length}
          style={{ paddingHorizontal: 12, height: 30, borderRadius: 8, borderWidth: 1, borderColor: C.borderControl, justifyContent: 'center', opacity: !wsUrl || !methods.length ? 0.45 : 1 }}
        >
          <Text style={{ fontSize: 12.5, color: C.text }}>첫 번째 명령 실행</Text>
        </Pressable>
      } />
      <View style={{ height: 190, borderRadius: 8, borderWidth: 1, borderColor: C.border, overflow: 'hidden', backgroundColor: '#0b0f14' }}>
        {termErr ? (
          <Text style={{ color: C.textDim, fontSize: 12, padding: 10 }}>터미널을 열 수 없어요: {termErr}</Text>
        ) : wsUrl ? (
          <TerminalWebView ref={termRef} wsUrl={wsUrl} />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={C.text3} /></View>
        )}
      </View>

      <StepHead n="3" title="CodingPT 연동" right={
        <Pressable
          onPress={() => void verify()}
          disabled={verifying}
          style={{ paddingHorizontal: 12, height: 30, borderRadius: 8, borderWidth: 1, borderColor: C.borderControl, justifyContent: 'center', opacity: verifying ? 0.45 : 1 }}
        >
          <Text style={{ fontSize: 12.5, color: C.text }}>{verifying ? '확인 중…' : '설치 확인하고 연동'}</Text>
        </Pressable>
      } />
      {warn ? <Text style={{ fontSize: 11.5, color: C.textDim }}>{warn}</Text> : null}
    </View>
  );
}

// 단계 제목 줄 — 그 단계의 실행 버튼을 **줄 우측 끝**에 둔다(사용자 확정 2026-07-27).
//  버튼이 본문 아래 따로 떠 있으면 어느 단계의 동작인지 한 번 더 읽어야 한다.
function StepHead({ n, title, right }: { n: string; title: string; right?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 16, marginBottom: 8 }}>
      <Text style={{ fontSize: 12, fontWeight: '600', color: C.text2, flex: 1 }}>{n}. {title}</Text>
      {right}
    </View>
  );
}
