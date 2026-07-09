import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Modal, Pressable, TextInput, ActivityIndicator, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { InAppBrowser } from 'react-native-inappbrowser-reborn';
import { SignIn, ArrowSquareOut, CheckCircle, Warning, Cloud, Laptop } from 'phosphor-react-native';

import { v2 } from '../theme/v2Tokens';
import { Btn } from './v2/primitives';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';
import daemonService, { DaemonLoginStatus } from '../services/daemonService';

const C = v2.colors;
const R = v2.radius;

// BYO 로그인 시트(M5 Slice2) — 러너(클라우드 컨테이너/PC)에서 사용자 본인 claude 계정에 로그인.
//  플로우: [시작] → 데몬이 claude auth login 구동 → 인증 URL 을 인앱브라우저로 염 →
//  사용자가 claude.ai 에서 인증 → 콜백페이지에 뜬 코드 복사 → 앱에 붙여넣기 → 제출 → 완료.
//  크레덴셜(토큰)은 그 러너에만 안착하며 앱/우리 서버는 URL·코드만 중계한다(토큰 미열람).
type Phase = 'intro' | 'starting' | 'code' | 'submitting' | 'done' | 'error';

export default function ClaudeLoginSheet({
  visible,
  onClose,
  onLoggedIn,
  runnerId,
  targetLabel = '러너',
  targetKind = 'cloud',
}: {
  visible: boolean;
  onClose: () => void;
  onLoggedIn?: (status?: DaemonLoginStatus) => void;
  runnerId?: number;
  targetLabel?: string;
  targetKind?: 'cloud' | 'local';
}) {
  const insets = useSafeAreaInsets();
  const kbHeight = useKeyboardHeight();
  const [phase, setPhase] = useState<Phase>('intro');
  const [url, setUrl] = useState('');
  const [code, setCode] = useState('');
  const [errMsg, setErrMsg] = useState('');
  const [status, setStatus] = useState<DaemonLoginStatus | null>(null);
  const startedRef = useRef(false); // 언마운트/취소 후 지연 콜백 무시

  useEffect(() => {
    if (visible) {
      setPhase('intro'); setUrl(''); setCode(''); setErrMsg(''); setStatus(null);
      startedRef.current = true;
    } else {
      startedRef.current = false;
    }
  }, [visible]);

  // 인증 URL 을 인앱브라우저로 연다. 콜백은 딥링크가 아니라(플랫폼 콜백페이지가 코드를 표시)
  //  openAuth 가 아닌 일반 open — 사용자가 코드를 복사해 돌아오면 브라우저를 닫는다.
  const openBrowser = useCallback(async (u: string) => {
    try {
      const available = await InAppBrowser.isAvailable();
      if (available) {
        await InAppBrowser.open(u, { showTitle: true, enableUrlBarHiding: true, enableDefaultShare: false, modalEnabled: true });
      } else {
        await Linking.openURL(u);
      }
    } catch (_) { /* 사용자가 닫음 등 — code 단계 유지 */ }
  }, []);

  // 로그인 시작 → 데몬이 URL 반환 → 브라우저 자동 오픈 → 코드 입력 단계.
  const start = useCallback(async () => {
    setPhase('starting'); setErrMsg('');
    try {
      const r = await daemonService.agentLoginStart({ runnerId });
      if (!startedRef.current) return;
      setUrl(r.url);
      setPhase('code');
      openBrowser(r.url);
    } catch (e: any) {
      if (!startedRef.current) return;
      setErrMsg(e?.message || '로그인을 시작할 수 없어요.');
      setPhase('error');
    }
  }, [runnerId, openBrowser]);

  // 인증 코드 제출 → 완료/실패.
  const submit = useCallback(async () => {
    const c = code.trim();
    if (!c) return;
    setPhase('submitting'); setErrMsg('');
    try {
      const r = await daemonService.agentLoginSubmit(c, { runnerId });
      if (!startedRef.current) return;
      if (r.ok) {
        setStatus(r.status || null);
        setPhase('done');
        onLoggedIn?.(r.status);
      } else {
        setErrMsg(r.message || '로그인을 완료하지 못했어요.');
        setPhase('code'); // 코드 재입력 허용
      }
    } catch (e: any) {
      if (!startedRef.current) return;
      setErrMsg(e?.message || '코드를 제출할 수 없어요.');
      setPhase('code');
    }
  }, [code, runnerId, onLoggedIn]);

  // 닫기 — 진행 중인 로그인 PTY 를 데몬에서 정리(코드 미제출로 남겨두지 않음).
  const close = useCallback(() => {
    if (phase === 'code' || phase === 'starting') { daemonService.agentLoginCancel({ runnerId }).catch(() => {}); }
    onClose();
  }, [phase, runnerId, onClose]);

  const TargetIcon = targetKind === 'cloud' ? Cloud : Laptop;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }}>
        <Pressable style={{ flex: 1 }} onPress={close} />
        <View style={{ backgroundColor: C.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, borderColor: C.border, paddingBottom: (kbHeight || insets.bottom) + 14, maxHeight: '86%' }}>
          {/* 헤더 */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18, paddingTop: 18, paddingBottom: 6 }}>
            <SignIn size={20} color={C.accent} weight="fill" />
            <Text style={{ color: C.text, fontSize: 17, fontWeight: '800' }}>Claude 로그인</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 4, backgroundColor: C.elevated2, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>
              <TargetIcon size={12} color={C.text3} weight="bold" />
              <Text style={{ color: C.text3, fontSize: 11.5, fontWeight: '700' }}>{targetLabel}</Text>
            </View>
          </View>

          {phase === 'intro' && (
            <View style={{ paddingHorizontal: 18, paddingTop: 6 }}>
              <Text style={{ color: C.text3, fontSize: 13.5, lineHeight: 20 }}>
                {targetLabel === '러너' ? '이 러너' : targetLabel}에서 <Text style={{ color: C.text2, fontWeight: '700' }}>본인 Claude 계정</Text>으로 로그인해요.
                로그인 자격증명은 {targetKind === 'cloud' ? '이 클라우드 컨테이너' : '이 PC'} 안에만 저장되고, 앱·서버는 인증 링크와 코드만 전달해요.
              </Text>
              <View style={{ backgroundColor: C.base, borderWidth: 1, borderColor: C.border, borderRadius: R.lg, padding: 12, marginTop: 12 }}>
                <Step n={1} text="아래 [로그인 시작] → 브라우저가 열려요." />
                <Step n={2} text="Claude 계정으로 인증하면 코드가 표시돼요." />
                <Step n={3} text="그 코드를 복사해 앱에 붙여넣고 완료." />
              </View>
              <View style={{ marginTop: 16 }}>
                <Btn variant="accent" full onPress={start}>로그인 시작</Btn>
              </View>
            </View>
          )}

          {phase === 'starting' && (
            <View style={{ paddingHorizontal: 18, paddingVertical: 34, alignItems: 'center', gap: 12 }}>
              <ActivityIndicator color={C.accent} />
              <Text style={{ color: C.text3, fontSize: 13 }}>인증 링크를 준비하는 중…</Text>
            </View>
          )}

          {phase === 'code' && (
            <View style={{ paddingHorizontal: 18, paddingTop: 6 }}>
              <Text style={{ color: C.text3, fontSize: 13.5, lineHeight: 20 }}>
                브라우저에서 로그인한 뒤 표시된 <Text style={{ color: C.text2, fontWeight: '700' }}>인증 코드</Text>를 복사해 아래에 붙여넣으세요.
              </Text>
              <Pressable
                onPress={() => openBrowser(url)}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 12, paddingVertical: 10, borderRadius: R.md, borderWidth: 1, borderColor: C.borderControl, backgroundColor: C.elevated2 }}
              >
                <ArrowSquareOut size={15} color={C.text2} weight="bold" />
                <Text style={{ color: C.text2, fontSize: 13, fontWeight: '700' }}>로그인 페이지 다시 열기</Text>
              </Pressable>
              <TextInput
                value={code}
                onChangeText={setCode}
                placeholder="인증 코드 붙여넣기"
                placeholderTextColor={C.text3}
                autoCapitalize="none"
                autoCorrect={false}
                multiline
                style={{ marginTop: 12, minHeight: 46, backgroundColor: C.base, borderWidth: 1, borderColor: C.border, borderRadius: R.md, paddingHorizontal: 12, paddingVertical: 10, color: C.text, fontSize: 13, fontFamily: v2.font.mono }}
              />
              {!!errMsg && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 }}>
                  <Warning size={14} color="#F59E0B" weight="fill" />
                  <Text style={{ color: '#F59E0B', fontSize: 12.5, flex: 1 }}>{errMsg}</Text>
                </View>
              )}
              <View style={{ marginTop: 16 }}>
                <Btn variant="accent" full onPress={submit} disabled={!code.trim()}>완료</Btn>
              </View>
            </View>
          )}

          {phase === 'submitting' && (
            <View style={{ paddingHorizontal: 18, paddingVertical: 34, alignItems: 'center', gap: 12 }}>
              <ActivityIndicator color={C.accent} />
              <Text style={{ color: C.text3, fontSize: 13 }}>로그인을 확인하는 중…</Text>
            </View>
          )}

          {phase === 'done' && (
            <View style={{ paddingHorizontal: 18, paddingTop: 6 }}>
              <View style={{ alignItems: 'center', paddingVertical: 14, gap: 10 }}>
                <CheckCircle size={44} color={C.accent} weight="fill" />
                <Text style={{ color: C.text, fontSize: 15, fontWeight: '800' }}>로그인 완료</Text>
                {!!status?.email && (
                  <Text style={{ color: C.text3, fontSize: 13 }}>
                    {status.email}{status.subscriptionType ? ` · ${status.subscriptionType}` : ''}
                  </Text>
                )}
              </View>
              <View style={{ marginTop: 8 }}>
                <Btn variant="accent" full onPress={onClose}>확인</Btn>
              </View>
            </View>
          )}

          {phase === 'error' && (
            <View style={{ paddingHorizontal: 18, paddingTop: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: C.base, borderWidth: 1, borderColor: C.border, borderRadius: R.lg, padding: 12 }}>
                <Warning size={18} color="#F59E0B" weight="fill" />
                <Text style={{ color: C.text2, fontSize: 13, flex: 1, lineHeight: 19 }}>{errMsg}</Text>
              </View>
              <View style={{ marginTop: 16, flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}><Btn variant="ghost" full onPress={close}>닫기</Btn></View>
                <View style={{ flex: 1 }}><Btn variant="accent" full onPress={start}>다시 시도</Btn></View>
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

function Step({ n, text }: { n: number; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 4 }}>
      <View style={{ width: 20, height: 20, borderRadius: 999, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#052e16', fontSize: 11.5, fontWeight: '800' }}>{n}</Text>
      </View>
      <Text style={{ color: C.text3, fontSize: 13, flex: 1 }}>{text}</Text>
    </View>
  );
}
