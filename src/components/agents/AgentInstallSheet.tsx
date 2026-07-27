// AgentInstallSheet — 미설치 에이전트의 3단계 설치 안내. PC `agents-view.js` openInstallSheet 의 미러.
//
//   ① 권장 설치 명령 확인(복사 + 공식 문서)   ② **이 시트 안의 실제 PC 터미널**에서 실행
//   ③ 재감지로 검증 → 연동
//
// 왜 이 설계인가(사용자 확정 2026-07-27): Orca·cmux 는 둘 다 에이전트를 **설치해 주지 않는다**
//  (감지 후 훅만 얹는다). 우리는 3플랫폼에 실제 터미널이 있으니 안내를 끝까지 할 수 있다.
//  단 두 가지를 지킨다:
//   · 명령을 몰래 실행하지 않는다 — 사용자가 보는 터미널에서 돌고, Ctrl+C 로 멈출 수 있다.
//   · **성공 판정은 명령의 종료 코드가 아니라 재감지 결과**다. "npm 은 성공했는데 PATH 에 없다"가
//     흔하고, 그때 "설치 완료"라고 말하면 거짓말이 된다.
// 설치 명령은 데몬 카탈로그에서 온다(서버가 만들지 않는다 — 서버가 실행 문자열을 내려주면 그게
//  곧 원격 코드 실행 통로다).
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Modal, Pressable, ScrollView, ActivityIndicator, Linking, Clipboard } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { v2 } from '../../theme/v2Tokens';
import AgentLogo from '../../workspace/AgentLogo';
import TerminalWebView, { TerminalHandle } from '../module/ide/TerminalWebView';
import daemonService, { DaemonAgent } from '../../services/daemonService';
import { haptic } from '../../animations/haptics';

const C = v2.colors;

export default function AgentInstallSheet({ agent, host, onClose, onInstalled }: {
  agent: DaemonAgent;
  host: number | null;
  onClose: () => void;
  onInstalled: (agents: DaemonAgent[]) => void;
}) {
  const insets = useSafeAreaInsets();
  const [mi, setMi] = useState(0);
  const [wsUrl, setWsUrl] = useState<string | null>(null);
  const [termErr, setTermErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const termRef = useRef<TerminalHandle>(null);
  const methods = agent.install || [];
  const cmd = methods[mi]?.cmd || '';

  // 설치용 터미널 — 홈 경로(cwd='')의 전용 세션 하나. 워크스페이스 터미널 목록에는 안 보인다.
  //  닫을 때 죽이지 않는다: 진행 중인 설치를 자르지 않기 위해서다(세션은 최대 1개).
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

  const copy = useCallback(() => {
    haptic.keyPress();
    Clipboard.setString(cmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }, [cmd]);

  const run = useCallback(() => {
    haptic.keyPress();
    // 개행까지 함께 보내 곧바로 실행된다(사용자가 화면에서 그대로 본다).
    termRef.current?.sendKey(cmd + '\r');
  }, [cmd]);

  const verify = useCallback(async () => {
    setVerifying(true);
    setResult(null);
    try {
      const r = await daemonService.rescanAgents(host, false);
      onInstalled(r.agents);
      const now = r.agents.find((x) => x.id === agent.id);
      if (now && now.installed) {
        setResult({ ok: true, text: now.wired ? '✓ 연동 완료' : '✓ 설치 확인' });
      } else {
        // 못 찾았으면 못 찾았다고 말한다.
        setResult({ ok: false, text: `아직 못 찾았어요. 설치가 끝났는데도 이러면 터미널에서 ${agent.bin} --version 을 확인해 주세요.` });
      }
    } catch (e: any) {
      setResult({ ok: false, text: String(e?.message || e) });
    }
    setVerifying(false);
  }, [host, agent.id, agent.bin, onInstalled]);

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      supportedOrientations={['portrait', 'portrait-upside-down', 'landscape', 'landscape-left', 'landscape-right']}
      onRequestClose={onClose}
    >
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(5,7,12,0.62)' }} onPress={onClose} />
      <View style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '90%',
        backgroundColor: C.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18,
        borderTopWidth: 1, borderTopColor: C.borderControl,
        paddingHorizontal: 16, paddingTop: 10, paddingBottom: Math.max(insets.bottom, 14) + 8,
      }}>
        <View style={{ width: 36, height: 4, borderRadius: 999, backgroundColor: C.borderControl, alignSelf: 'center', marginBottom: 12 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <AgentLogo brand={agent.id} size={18} />
          <Text style={{ flex: 1, fontSize: 16, fontWeight: '700', color: C.text }}>{agent.name} 설치</Text>
        </View>

        <ScrollView style={{ maxHeight: 460 }} keyboardShouldPersistTaps="handled">
          {/* 1 */}
          <StepHead n="1" title="설치 명령 확인" />
          {methods.length > 1 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {methods.map((m, i) => (
                <Pressable
                  key={m.label}
                  onPress={() => setMi(i)}
                  style={{
                    paddingHorizontal: 10, height: 28, borderRadius: 7, justifyContent: 'center',
                    backgroundColor: i === mi ? C.elevated2 : 'transparent',
                    borderWidth: 1, borderColor: i === mi ? C.accent : C.borderControl,
                  }}
                >
                  <Text style={{ fontSize: 11.5, color: i === mi ? C.text : C.textDim }}>{m.label}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          {cmd ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <ScrollView horizontal style={{ flex: 1, backgroundColor: C.elevated2, borderRadius: 8, borderWidth: 1, borderColor: C.border }} contentContainerStyle={{ paddingHorizontal: 10, paddingVertical: 8 }}>
                <Text style={{ fontSize: 12, color: C.text, fontFamily: 'monospace' }}>{cmd}</Text>
              </ScrollView>
              <Pressable onPress={copy} style={{ paddingHorizontal: 12, height: 32, borderRadius: 8, borderWidth: 1, borderColor: C.borderControl, justifyContent: 'center' }}>
                <Text style={{ fontSize: 12.5, color: C.text }}>{copied ? '복사됨' : '복사'}</Text>
              </Pressable>
            </View>
          ) : (
            <Text style={{ fontSize: 12, color: C.textDim }}>이 에이전트는 설치 방법이 자주 바뀌어요 — 공식 문서를 확인해 주세요.</Text>
          )}
          <Note>
            설치 방법은 바뀔 수 있어요 — 잘 안 되면{' '}
            <Text style={{ color: C.accent }} onPress={() => { if (agent.docs) Linking.openURL(agent.docs).catch(() => {}); }}>공식 문서</Text>
            를 확인하세요.
          </Note>

          {/* 2 */}
          <StepHead n="2" title="터미널에서 실행" />
          <View style={{ height: 200, borderRadius: 8, borderWidth: 1, borderColor: C.border, overflow: 'hidden', backgroundColor: '#0b0f14' }}>
            {termErr ? (
              <Text style={{ color: C.textDim, fontSize: 12, padding: 10 }}>터미널을 열 수 없어요: {termErr}</Text>
            ) : wsUrl ? (
              <TerminalWebView ref={termRef} wsUrl={wsUrl} />
            ) : (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={C.accent} /></View>
            )}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 9, flexWrap: 'wrap' }}>
            <Pressable
              onPress={run}
              disabled={!wsUrl || !cmd}
              style={{ paddingHorizontal: 14, height: 32, borderRadius: 8, backgroundColor: C.accent, justifyContent: 'center', opacity: !wsUrl || !cmd ? 0.45 : 1 }}
            >
              <Text style={{ fontSize: 12.5, fontWeight: '700', color: '#08130f' }}>붙여넣고 실행</Text>
            </Pressable>
            <Text style={{ fontSize: 11, color: C.textDim, flex: 1 }}>직접 입력해도 돼요. 멈추려면 Ctrl+C.</Text>
          </View>

          {/* 3 */}
          <StepHead n="3" title="CodingPT 연동" />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Pressable
              onPress={() => void verify()}
              disabled={verifying}
              style={{ paddingHorizontal: 14, height: 32, borderRadius: 8, backgroundColor: C.accent, justifyContent: 'center', opacity: verifying ? 0.45 : 1 }}
            >
              <Text style={{ fontSize: 12.5, fontWeight: '700', color: '#08130f' }}>{verifying ? '확인 중…' : '설치 확인하고 연동'}</Text>
            </Pressable>
            {result ? (
              <Text style={{ fontSize: 11.5, color: result.ok ? C.accent : C.textDim, flex: 1 }}>{result.text}</Text>
            ) : null}
          </View>
          <Note>설치가 끝나면 눌러 주세요. 실제로 실행 파일이 잡히는지 확인한 뒤 연동해요.</Note>
        </ScrollView>

        <Pressable onPress={onClose} style={{ alignSelf: 'flex-end', marginTop: 10, paddingHorizontal: 14, height: 32, borderRadius: 8, borderWidth: 1, borderColor: C.borderControl, justifyContent: 'center' }}>
          <Text style={{ fontSize: 12.5, color: C.text }}>닫기</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

function StepHead({ n, title }: { n: string; title: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16, marginBottom: 8 }}>
      <View style={{ width: 18, height: 18, borderRadius: 999, backgroundColor: C.elevated2, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 10.5, fontWeight: '700', color: C.text2 }}>{n}</Text>
      </View>
      <Text style={{ fontSize: 13, fontWeight: '600', color: C.text }}>{title}</Text>
    </View>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <Text style={{ fontSize: 11, color: C.textDim, marginTop: 7 }}>{children}</Text>;
}
