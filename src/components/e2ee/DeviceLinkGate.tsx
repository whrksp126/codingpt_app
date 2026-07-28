import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CheckCircle, Desktop } from 'phosphor-react-native';

import { v2 } from '../../theme/v2Tokens';
import PressableScale from '../ui/PressableScale';
import { useWorkspaceShell } from '../../contexts/WorkspaceShellContext';
import e2eeSvc from '../../services/e2ee';
import COPY from './e2eeCopy';

/**
 * 연동 안내 화면 — 모바일 첫 로그인의 **온보딩식 전체 화면**(★ 2026-07-28 개정 8, 사용자 확정).
 *
 * 사용자 원문: "그래도 그 전에 사용자한테 android에서 내 pc 목록에 승인 요청할까요? 라고 물어보면서
 *  뭔가 온보딩 식으로 알려줘야 하지 않을까? … 승인 요청을 보낸 거니까 연동할 pc에 요청을 보냈어요!
 *  확인 후 승인해주세요! 라는 식으로 android, ios에서도 초기에 온보딩식으로 해줘야 하는 거 아니냐는
 *  거야!"
 *
 * ★ 이 화면이 성립하려면 **요청이 실제로 아직 안 나가 있어야 한다**. 그래서 앱 enroll 은 항상
 *  `announce:false` 로 올리고(services/e2ee.ts), 서버는 그 신청을 승인자 목록에서도 감춘다
 *  (deviceTrustService listPending — 감추지 않으면 켜져 있는 PC 가 폴링으로 먼저 승인 카드를 띄워
 *  "보낼까요?" 를 묻는 순간 이미 보낸 뒤가 된다). 알리는 것은 [승인 요청 보내기] 하나뿐이다.
 *
 * 온보딩 슬라이드 문법(2026-07-15 확립) 준수 = 1주제 · 단일 CTA · 즉시 적용 · 자동 진행:
 *   ① ask(아직 안 보냄) → ② sent(보냄 · 스피너) → ③ done(연동됨 · 자동 닫힘)
 * `나중에` 는 이 계정에서 다시 로그인할 때까지 화면을 닫는다(services/e2ee dismissLinkPrompt) —
 *  연동은 설정 > 계정 > 기기의 [연동] 으로 언제든 다시 시작할 수 있다(개정 6 경로).
 *
 * ⚠ 계정 첫 기기에서는 **뜨지 않는다**: 승인해 줄 기기가 없으면 서버가 bootstrap 을 주고 앱이 스스로
 *  열쇠를 만든다(state: bootstrap → trusted) → 물어볼 것이 없다.
 * ⚠ 버튼에 포인트 컬러를 쓰지 않는다(개정 11 — PC 온보딩과 같은 무채색 CTA). accent 는 상태 신호
 *  (연동 완료 체크·미확인 점)에만 남는다.
 */
export default function DeviceLinkGate() {
  const C = v2.colors;
  const S = useWorkspaceShell();
  const st = S.e2ee;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // 연동 성공 순간을 잡아 ③ 화면을 잠깐 보여 준다(성공을 조용히 지나가면 뭐가 된 건지 알 수 없다).
  const [doneAt, setDoneAt] = useState<number | null>(null);

  const waiting = st.state === 'pending';
  const armed = waiting && !st.linkDismissed;

  //  ②→③ 전환 — **이 화면을 보고 있다가** 승인된 경우만 축하한다(wasShown). 그러지 않으면 이미 연동된
  //   기기가 앱을 켤 때마다(bootstrap→trusted) 축하 화면이 한 번씩 스치고 지나간다.
  const wasShown = React.useRef(false);
  useEffect(() => { if (armed) wasShown.current = true; }, [armed]);
  useEffect(() => {
    if (waiting || !wasShown.current) return;
    if (st.state !== 'trusted') return;
    wasShown.current = false;
    setDoneAt(Date.now());
  }, [waiting, st.state]);
  useEffect(() => {
    if (doneAt == null) return;
    const t = setTimeout(() => setDoneAt(null), 1400);
    return () => clearTimeout(t);
  }, [doneAt]);

  const send = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try { await e2eeSvc.requestLink(); }
    catch (e: any) { setErr(e?.message || COPY.err.link); }
    finally { setBusy(false); }
  }, []);
  const later = useCallback(() => { void e2eeSvc.dismissLinkPrompt(); }, []);

  const step: 'ask' | 'sent' | 'done' | null = doneAt != null ? 'done'
    : armed ? (st.linkAnnounced ? 'sent' : 'ask') : null;
  if (!step) return null;

  const title = step === 'ask' ? COPY.link.askTitle : step === 'sent' ? COPY.link.sentTitle : COPY.link.doneTitle;
  const body = step === 'ask' ? COPY.link.askBody : step === 'sent' ? COPY.link.sentBody : null;

  return (
    <Modal visible transparent={false} animationType="fade" onRequestClose={later}>
      <SafeAreaView style={{ flex: 1, backgroundColor: C.base }}>
        <View style={{ flex: 1, paddingHorizontal: 28, alignItems: 'center', justifyContent: 'center', gap: 14 }}>
          <View style={{ width: 72, height: 72, borderRadius: 36, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' }}>
            {step === 'done'
              ? <CheckCircle size={32} color={C.accent} weight="fill" />
              : step === 'sent'
                ? <ActivityIndicator size="small" color={C.text3} />
                : <Desktop size={30} color={C.text2} />}
          </View>
          <Text style={{ fontSize: 20, fontWeight: '700', color: C.text, textAlign: 'center' }}>{title}</Text>
          {body ? (
            <Text style={{ fontSize: 14, lineHeight: 21, color: C.text3, textAlign: 'center' }}>{body}</Text>
          ) : null}
          {err ? (
            <Text style={{ fontSize: 12.5, color: C.error, textAlign: 'center' }}>{err}</Text>
          ) : null}
        </View>

        <View style={{ paddingHorizontal: 24, paddingBottom: 28, gap: 4 }}>
          {/*  ★ 개정 11(2026-07-28 사용자 확정): CTA 는 **PC 온보딩과 같은 무채색 버튼**이다
               (PC `styles.css .btn.primary` = `background: var(--text)` + `color: var(--base)`).
               accent 채움 버튼은 사용자가 반복해서 지적한 '과한 포인트 컬러' 다 — accent 는 상태 신호
               (미확인 점·온라인 점) 전용이고 버튼에는 쓰지 않는다. 대비는 명도로 만든다.
               부제('나중에 설정 > …')도 삭제 — 같은 화면에 탈출로가 둘(`나중에` 링크)이면 CTA 가 흐려진다. */}
          {step === 'ask' ? (
            <PressableScale
              onPress={() => void send()}
              disabled={busy}
              android_ripple={{ color: 'rgba(0,0,0,0.12)' }}
              style={{ height: 52, borderRadius: 14, backgroundColor: C.text, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, opacity: busy ? 0.7 : 1 }}
            >
              {busy ? <ActivityIndicator size="small" color={C.base} /> : null}
              <Text style={{ fontSize: 15.5, fontWeight: '700', color: C.base }}>{busy ? COPY.link.sending : COPY.link.askCta}</Text>
            </PressableScale>
          ) : null}
          {step !== 'done' ? (
            <PressableScale onPress={later} style={{ height: 44, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 13.5, fontWeight: '600', color: C.textDim }}>{COPY.link.later}</Text>
            </PressableScale>
          ) : null}
        </View>
      </SafeAreaView>
    </Modal>
  );
}
