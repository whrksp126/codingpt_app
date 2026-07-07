import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { CaretLeft, Desktop, ArrowsClockwise, Terminal as TerminalIcon, FolderOpen } from 'phosphor-react-native';

import TerminalWebView, { TerminalHandle } from '../../components/module/ide/TerminalWebView';
import { useTerminalKeyboard } from '../../components/keyboard/TerminalKeyboard';
import DaemonFileBrowser from './DaemonFileBrowser';
import { Btn, Label } from '../../components/v2/primitives';
import { v2 } from '../../theme/v2Tokens';
import daemonService, { DaemonStatus } from '../../services/daemonService';

const C = v2.colors;
const R = v2.radius;

// ── "내 PC" 터미널 기반 에이전트 환경 ─────────────────────────────────
// 사용자 PC(codingpt_daemon)의 tmux 세션에 붙는 풀스크린 터미널.
// 여기서 사용자가 자기 claude CLI 를 직접 실행/조작한다(비용 0 — API 트래픽은 PC→Anthropic 직결).
// 상태별 화면: 미페어링(페어링 코드 발급) → 오프라인(실행 안내) → 온라인(터미널).

type Phase = 'loading' | 'unpaired' | 'offline' | 'online';

const LocalAgentScreen = () => {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const termRef = useRef<TerminalHandle>(null);

  const [status, setStatus] = useState<DaemonStatus | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [wsUrl, setWsUrl] = useState<string | null>(null);
  const [pairCode, setPairCode] = useState<string | null>(null);
  const [pairBusy, setPairBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<'terminal' | 'files'>('terminal'); // 온라인 시 터미널 ↔ 파일 전환

  // 보조키바 + 실물키보드 특수키 패널 (모바일 IDE 터미널과 동일 시스템 — 공유 훅)
  // 터미널 탭이 보일 때만 활성(파일 탭에선 에디터가 자체 키보드 처리).
  const kb = useTerminalKeyboard({ termRef, enabled: phase === 'online' && !!wsUrl && tab === 'terminal' });

  const refreshStatus = useCallback(async () => {
    try {
      const s = await daemonService.getStatus();
      setStatus(s);
      setError(null);
      if (s.online) setPhase('online');
      else if (s.devices.length > 0) setPhase('offline');
      else setPhase('unpaired');
      return s;
    } catch (e: any) {
      setError(e?.message || '상태 조회 실패');
      setPhase((p) => (p === 'loading' ? 'offline' : p));
      return null;
    }
  }, []);

  // 진입 시 + 온라인 전까지 5초 폴링(페어링/데몬 실행이 끝나면 자동으로 터미널로 전환).
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = async () => {
      const s = await refreshStatus();
      if (cancelled) return;
      if (!s || !s.online) timer = setTimeout(tick, 5000);
    };
    tick();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [refreshStatus]);

  // 온라인 → 터미널 토큰 발급 후 WS 연결.
  useEffect(() => {
    if (phase !== 'online' || wsUrl) return;
    daemonService.startTerminal()
      .then((token) => setWsUrl(daemonService.buildTerminalWsUrl(token)))
      .catch((e) => { setError(e?.message || '터미널 시작 실패'); setPhase('offline'); });
  }, [phase, wsUrl]);

  const issuePairCode = async () => {
    setPairBusy(true);
    try {
      const { code } = await daemonService.createPairCode();
      setPairCode(code);
    } catch (e: any) {
      setError(e?.message || '페어링 코드 발급 실패');
    } finally {
      setPairBusy(false);
    }
  };

  const device = status?.current || status?.devices?.[0] || null;

  return (
    // KeyButton(롱프레스 팝업)의 GestureDetector 요구 — IDE 처럼 화면 단위로 래핑.
    <GestureHandlerRootView style={{ flex: 1 }}>
    <View style={{ flex: 1, backgroundColor: C.base }}>
      {/* 탑바 */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 10,
        paddingTop: Math.max(insets.top, 10), paddingBottom: 10, paddingHorizontal: 10,
        borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.base,
      }}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={{ padding: 6 }}>
          <CaretLeft size={20} color={C.text2} />
        </Pressable>
        <Desktop size={18} color={C.text2} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: C.text }} numberOfLines={1}>
            내 PC{device ? ` · ${device.deviceName}` : ''}
          </Text>
          {device ? (
            <Text style={{ fontSize: 11, color: C.textDim, fontFamily: v2.font.mono }} numberOfLines={1}>
              {device.platform || ''}{device.daemonVersion ? ` · daemon v${device.daemonVersion}` : ''}
            </Text>
          ) : null}
        </View>
        {phase === 'online' && wsUrl ? (
          <View style={{ flexDirection: 'row', backgroundColor: C.elevated2, borderRadius: 8, padding: 2, marginRight: 4 }}>
            {([['terminal', TerminalIcon], ['files', FolderOpen]] as const).map(([key, Icon]) => (
              <Pressable
                key={key}
                onPress={() => setTab(key)}
                hitSlop={4}
                style={{ paddingHorizontal: 11, paddingVertical: 6, borderRadius: 6, backgroundColor: tab === key ? C.surface : 'transparent' }}
              >
                <Icon size={17} color={tab === key ? C.text : C.textDim} weight={tab === key ? 'fill' : 'regular'} />
              </Pressable>
            ))}
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingRight: 6 }}>
          <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: phase === 'online' ? C.accent : C.textDim }} />
          <Text style={{ fontSize: 12, color: phase === 'online' ? C.text2 : C.textDim }}>
            {phase === 'online' ? '온라인' : phase === 'loading' ? '확인 중' : '오프라인'}
          </Text>
        </View>
      </View>

      {/* 본문 — KAV 가 보조바/특수키 패널 좌표 기준 컨테이너(IDE 와 동일 공식: adjustResize 전제) */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        onLayout={kb.onContainerLayout}
      >
      {phase === 'online' && wsUrl ? (
        // 터미널 탭에선 kb.contentStyle 이 고정 높이를 줘 키보드↔패널 전환 시 팅김 방지(파일 탭은 flex:1).
        <View style={tab === 'terminal' ? kb.contentStyle : { flex: 1 }}>
          {/* 터미널은 언마운트하지 않고 숨김만 — PTY 세션/스크롤백 유지(탭 전환에도 셸 살아있음) */}
          <View style={{ flex: 1, display: tab === 'terminal' ? 'flex' : 'none' }}>
            <TerminalWebView ref={termRef} wsUrl={wsUrl} {...kb.terminalProps} />
          </View>
          {tab === 'files' ? <DaemonFileBrowser /> : null}
        </View>
      ) : phase === 'loading' ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={C.accent} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
          {phase === 'unpaired' ? (
            <>
              <Label>PC 연결하기</Label>
              <Text style={{ fontSize: 13.5, color: C.text2, marginTop: 8, lineHeight: 21 }}>
                내 컴퓨터를 CodingPT에 연결하면 폰에서 PC 터미널을 그대로 쓰고,
                PC에서 실행 중인 claude 같은 CLI 에이전트를 어디서든 이어서 조작할 수 있어요.
              </Text>
              <View style={{ borderWidth: 1, borderColor: C.border, borderRadius: R.lg, backgroundColor: C.surface, padding: 16, marginTop: 16 }}>
                <Text style={{ fontSize: 12.5, color: C.textDim, lineHeight: 20 }}>
                  1. PC 터미널에서 데몬 폴더로 이동{'\n'}
                  <Text style={{ fontFamily: v2.font.mono, color: C.text2 }}>   cd codingpt_service/codingpt_daemon</Text>{'\n'}
                  2. 페어링 실행{'\n'}
                  <Text style={{ fontFamily: v2.font.mono, color: C.text2 }}>   node index.js pair --server {'<서버주소>'}</Text>{'\n'}
                  3. 아래에서 발급한 코드를 입력
                </Text>
                {pairCode ? (
                  <View style={{ marginTop: 14, alignItems: 'center', paddingVertical: 14, borderRadius: R.md, backgroundColor: C.elevated2, borderWidth: 1, borderColor: C.border }}>
                    <Text style={{ fontSize: 24, fontWeight: '700', letterSpacing: 3, color: C.accent, fontFamily: v2.font.mono }}>{pairCode}</Text>
                  </View>
                ) : null}
                <View style={{ marginTop: 14 }}>
                  <Btn variant="outline" sm full onPress={issuePairCode} disabled={pairBusy}>
                    {pairBusy ? '발급 중…' : pairCode ? '코드 재발급' : '페어링 코드 발급'}
                  </Btn>
                </View>
                {pairCode ? (
                  <Text style={{ fontSize: 11.5, color: C.textDim, marginTop: 10, textAlign: 'center' }}>
                    코드는 10분간 유효해요. 페어링이 끝나면 자동으로 연결됩니다.
                  </Text>
                ) : null}
              </View>
            </>
          ) : (
            <>
              <Label>PC 오프라인</Label>
              <Text style={{ fontSize: 13.5, color: C.text2, marginTop: 8, lineHeight: 21 }}>
                {device ? `${device.deviceName} 이(가) 아직 연결되지 않았어요.` : 'PC가 아직 연결되지 않았어요.'}{'\n'}
                PC에서 데몬이 실행 중인지 확인해 주세요.
              </Text>
              <View style={{ borderWidth: 1, borderColor: C.border, borderRadius: R.lg, backgroundColor: C.surface, padding: 16, marginTop: 16 }}>
                <Text style={{ fontFamily: v2.font.mono, fontSize: 12.5, color: C.text2 }}>
                  cd codingpt_service/codingpt_daemon{'\n'}npm start
                </Text>
              </View>
              <View style={{ marginTop: 16, flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Btn variant="outline" sm full onPress={() => refreshStatus()}>
                    다시 확인
                  </Btn>
                </View>
              </View>
              <Pressable onPress={issuePairCode} style={{ marginTop: 14, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <ArrowsClockwise size={13} color={C.textDim} />
                <Text style={{ fontSize: 12.5, color: C.textDim }}>다른 PC 연결(새 페어링 코드)</Text>
              </Pressable>
              {pairCode ? (
                <Text style={{ marginTop: 10, textAlign: 'center', fontSize: 20, fontWeight: '700', letterSpacing: 3, color: C.accent, fontFamily: v2.font.mono }}>{pairCode}</Text>
              ) : null}
            </>
          )}
          {error ? (
            <Text style={{ fontSize: 12, color: C.warn, marginTop: 16, textAlign: 'center' }}>{error}</Text>
          ) : null}
        </ScrollView>
      )}
      {kb.overlay}
      {kb.popup}
      </KeyboardAvoidingView>
    </View>
    </GestureHandlerRootView>
  );
};

export default LocalAgentScreen;
