import React, { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { LockKey, ShieldCheck, Desktop, DeviceMobile, Trash, CaretRight, CaretDown, CaretUp, WarningCircle } from 'phosphor-react-native';

import { v2 } from '../../theme/v2Tokens';
import PressableScale from '../ui/PressableScale';
import { useWorkspaceShell } from '../../contexts/WorkspaceShellContext';
import e2eeSvc, { type E2eePolicy, type TrustedDeviceKey } from '../../services/e2ee';
import { hostLockLabel, stateLabel } from '../../services/e2ee/e2eeState';
import hostLock from '../../services/e2ee/hostLock';
import { openDeviceTrustSheet } from './e2eeUi';
import COPY from './e2eeCopy';
import KeyTextInput from '../keyboard/KeyTextInput';

// 설정 > 계정 > "종단간 암호화" 카드 — 3플랫폼(모바일/PC) 동일 **계층**.
//
// 2026-07-27 카피 감사(docs/구현설계-2026-07-25/14-설정-카피-감사.md) 반영: 첫 화면은 상시 설명문 0줄,
//  최대 6행이다 — 사용자는 텍스트를 읽지 않으므로 "지금 안전한가(배지) → 내가 뭘 해야 하나(행동 행)"
//  두 질문만 남기고 나머지 전부를 `자세히` 접기 안으로 내렸다.
//   행1  🔒 종단간 암호화 ......... [self 배지]
//   행2~ 🖥 {PC 이름} .............. [host 배지]   ← §2.7 정직성 기제. **절대 접지 않는다**
//   행N  (배지 톤이 on 이 아니고 **행동 행이 없을 때만**) reason 1줄
//   행N+1 ⚠ 행동 행(동시 1개: 승인 > 이 기기 대기 > 앱 업데이트)
//   행N+2 자세히 ▾
//  자세히 안(순서 고정): ① 정책 ② 안전 코드 ④ 복구 코드(+복원) ⑤ 열쇠 목록 ⑥ 메타 고지.
//   (③ '지문' 행은 2026-07-27 삭제 — ⑤ 자기 행과 완전 중복이었다. 번호는 카피 감사 표와 맞춘다)
//
// ⚠ 문구는 전부 `e2eeCopy.ts`(계약 정본 미러)에서 온다 — 여기서 윤문하면 PC 와 어긋난다.
// 정직성 고지(설계 §7-3): 폴더명·알림 제목은 **서버가 본다**. 접기 안 마지막 줄에서 그대로 밝힌다.

const C = v2.colors;
const R = v2.radius;

function Pill({ text, tone }: { text: string; tone: 'on' | 'wait' | 'off' }) {
  const bg = tone === 'on' ? C.accentTint : tone === 'wait' ? 'rgba(251,191,36,0.14)' : C.elevated2;
  const fg = tone === 'on' ? C.accent : tone === 'wait' ? C.warn : C.textDim;
  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: bg }}>
      <Text style={{ color: fg, fontSize: 10.5, fontWeight: '800' }}>{text}</Text>
    </View>
  );
}

function Seg({ value, onChange }: { value: E2eePolicy; onChange: (v: E2eePolicy) => void }) {
  const opts: { v: E2eePolicy; label: string }[] = [
    { v: 'off', label: COPY.adv.policy.off },
    { v: 'preferred', label: COPY.adv.policy.auto },
    { v: 'required', label: COPY.adv.policy.required },
  ];
  return (
    <View style={{ flexDirection: 'row', backgroundColor: C.elevated2, borderRadius: R.sm, padding: 2 }}>
      {opts.map((o) => {
        const on = o.v === value;
        return (
          <PressableScale
            key={o.v}
            scaleTo={0.94}
            onPress={() => onChange(o.v)}
            style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: R.sm - 1, backgroundColor: on ? C.elevated : 'transparent' }}
          >
            <Text style={{ fontSize: 12, fontWeight: on ? '700' : '500', color: on ? C.text : C.textDim }}>{o.label}</Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

/** 자세히 안의 한 행 — 제목(+부제) 좌측 / 컨트롤 우측. 긴 기기명·긴 부제에서도 컨트롤을 밀지 않는다. */
function Row({ label, hint, children }: { label: string; hint?: string; children?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: C.text2, fontSize: 12.5 }}>{label}</Text>
        {hint ? <Text style={{ color: C.textDim, fontSize: 11, marginTop: 2 }}>{hint}</Text> : null}
      </View>
      {children}
    </View>
  );
}

export default function E2eeSettingsCard() {
  const S = useWorkspaceShell();
  const st = S.e2ee;
  const label = stateLabel({ state: st.state, policy: st.policy, ready: st.ready });
  // 호스트별 자물쇠 — runner_status.e2eeEpoch 를 실시간으로 받아 그린다(hostLock.ts).
  //  '켜짐' 한 줄로 뭉개면 열쇠 없는 PC 로 가는 평문 트래픽이 사용자에게 안 보인다(거짓 자물쇠).
  useSyncExternalStore(hostLock.subscribeHostLock, hostLock.getHostLockVersion);
  // 클라우드 러너는 제외한다 — BYO 피벗으로 폐기했고 SettingsModal 의 '내 기기' 목록·PC settings.js 도
  //  같은 규칙으로 숨긴다. 안 걸러내면 '내 기기' 에 없는 정체불명 기기가 이 카드에서만 평문 경고를
  //  띄운다(폰에서만 보이는 화면 = 앱↔PC 비대칭).
  const hosts = S.devices.filter((d) => d.role === 'host' && d.online && d.runnerKind !== 'cloud' && typeof d.id === 'number');
  // 세대까지 대조한 host 배지를 **한 번만** 계산해 행 렌더와 제목 자물쇠 색이 같은 근거를 쓰게 한다.
  //  4번째 인자 = 계정 세대. **내가** 뒤처진 경우(상대도 같은 옛 세대라 3인자 대조는 통과한다)를
  //  잡는다 — 그 상태의 봉투는 409(E2EE_EPOCH_MISMATCH)로 거절되므로 초록이면 거짓 자물쇠다.
  //  PC `settings.js` 도 같은 4인자를 넘긴다(앱==PC 라벨 동치 = test/e2ee-crossimpl.mjs).
  const hostRows = useMemo(
    () => hosts.map((d) => ({ d, hl: hostLockLabel(st.ready, hostLock.hostE2eeEpoch(Number(d.id)), st.epoch, st.accountEpoch) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hosts.map((d) => d.id).join(','), st.ready, st.epoch, st.accountEpoch, hostLock.getHostLockVersion()],
  );
  // ★ 제목 자물쇠를 `st.ready`(= 내 폰에 열쇠 있음)로 점등하면 안 된다: 모든 host 가 '평문(열쇠 없음)'
  //  인데 초록 자물쇠가 켜져 §2.7 이 금지한 거짓 자물쇠가 **시각 채널로** 되살아난다(텍스트를 안 읽는
  //  사용자가 가장 먼저 읽는 신호가 이 아이콘이다). self 배지에서 '켜짐' 을 없앤 것과 같은 이유다.
  const allEncrypted = hostRows.length > 0 && hostRows.every((r) => r.hl.tone === 'on');

  const [advOpen, setAdvOpen] = useState(false);
  const [recovery, setRecovery] = useState<string | null>(null);
  const [recBusy, setRecBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [keys, setKeys] = useState<TrustedDeviceKey[]>([]);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [restoreCode, setRestoreCode] = useState('');
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [restoreDone, setRestoreDone] = useState(false);
  const [armId, setArmId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const loadKeys = useCallback(async () => {
    try { setKeys((await e2eeSvc.loadKeyring()).devices); } catch (_) { setKeys([]); }
  }, []);
  useEffect(() => { void loadKeys(); }, [loadKeys, st.epoch, st.state]);

  const onPolicy = useCallback((p: E2eePolicy) => {
    setErr(null);
    void e2eeSvc.setPolicy(p);
  }, []);

  const onRecovery = useCallback(async () => {
    setErr(null);
    setRecBusy(true);
    try { setRecovery(await e2eeSvc.createRecoveryCode()); }
    catch (e: any) { setErr(e?.message || COPY.err.recovery); }
    finally { setRecBusy(false); }
  }, []);

  // 복구 코드로 복원 — 모든 신뢰 기기를 잃은 경우의 유일한 출구(코드 자체가 열쇠를 담는다).
  //  [복원] 첫 탭 = 입력 열기 · 두 번째 탭 = 실제 복원(코드가 충분히 길 때만 활성).
  const onRestore = useCallback(async () => {
    setErr(null);
    if (!restoreOpen) { setRestoreOpen(true); return; }
    setRestoreBusy(true);
    try {
      const ok = await e2eeSvc.restoreFromRecovery(restoreCode);
      if (ok) { setRestoreOpen(false); setRestoreCode(''); setRestoreDone(true); }
      else setErr(COPY.err.restore);
    } finally { setRestoreBusy(false); }
  }, [restoreCode, restoreOpen]);

  const onRevoke = useCallback(async (d: TrustedDeviceKey) => {
    // 1탭 = arm(비가역 경고를 그 자리에 인라인) · 2탭 = 실행. 4초 뒤 자동 해제.
    if (armId !== d.deviceKeyId) { setArmId(d.deviceKeyId); setTimeout(() => setArmId(null), 4000); return; }
    setArmId(null);
    setBusyId(d.deviceKeyId);
    setErr(null);
    try { await e2eeSvc.revokeTrustAndRotate(d.deviceKeyId); await loadKeys(); }
    catch (e: any) { setErr(e?.message || COPY.err.revoke); }
    finally { setBusyId(null); }
  }, [armId, loadKeys]);

  const canRestore = !st.ready && st.state !== 'unavailable' && st.state !== 'off';

  // 행동 행 — **동시에 하나만**. 우선순위 = 승인 대기 요청 > 이 기기가 대기 중 > 앱 업데이트 필요.
  //  (PC 부트스트랩 행은 PC 전용이다 — 앱은 열쇠 0개 계정을 자동으로 켠다)
  //  ★ 이 기기가 대기 중인데 복원까지 가능하면 부제 1줄을 붙인다 — 기기를 전부 잃은 사용자에게
  //   '기존 기기에서 승인' 은 실행 불가능한 지시이고, 유일한 출구가 접힌 `자세히` 안에 있다.
  const action = useMemo(() => {
    if (S.trustRequests.length > 0) return { text: COPY.act.approve(S.trustRequests.length), hint: null, tap: true };
    if (st.state === 'pending') return { text: COPY.act.selfWait, hint: canRestore ? COPY.act.selfWaitHint : null, tap: true };
    if (st.storageMissing) return { text: COPY.act.needUpdate, hint: null, tap: false };
    return null;
  }, [S.trustRequests.length, st.state, st.storageMissing, canRestore]);

  return (
    <View style={{ borderWidth: 1, borderColor: C.border, borderRadius: R.md, padding: 14, gap: 10, marginTop: 18 }}>
      {/* 행1 — 제목 + self 배지(설명문 없음) */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
        <LockKey size={16} color={allEncrypted ? C.accent : C.text3} />
        <Text style={{ flex: 1, color: C.text, fontSize: 13.5, fontWeight: '700' }}>{COPY.card.title}</Text>
        <Pill text={label.text} tone={label.tone} />
      </View>

      {/* 행2~ — PC 별 실제 자물쇠(정직성). 열쇠 없는 PC 로 가는 트래픽은 평문임을 그대로 밝힌다.
          ★ 0개일 때도 **빈 화면으로 두지 않는다**: 초록 배지 한 줄만 남으면 사용자는 '내 데이터가
           안전하다' 로 읽는데 사실은 '이 폰에 열쇠가 있다' 뿐이다(PC 가 켜지는 순간 평문일 수 있다). */}
      {st.policy !== 'off' ? (
        <View style={{ gap: 5 }}>
          {hostRows.length ? hostRows.map(({ d, hl }) => (
            <View key={String(d.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
              <Desktop size={13} color={C.textDim} />
              <Text style={{ flex: 1, color: C.text2, fontSize: 12 }} numberOfLines={1}>{d.name}</Text>
              <Pill text={hl.text} tone={hl.tone} />
            </View>
          )) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
              <Desktop size={13} color={C.textDim} />
              <Text style={{ flex: 1, color: C.text2, fontSize: 12 }} numberOfLines={1}>{COPY.card.noHost}</Text>
              <Pill text={COPY.hostBadge.checking} tone="wait" />
            </View>
          )}
        </View>
      ) : null}

      {/* 배지가 초록이 아니고 **행동 행이 없을 때만** 사유 1줄(데몬·서버가 만든 문장이라 2줄 클램프).
          ★ 행동 행이 뜨는 상태에서는 그리지 않는다: 데몬·서버 reason 원문은 행동 행과 같은 사실을 더
           길게(때로는 상충하게 — 부트스트랩 reason 은 '폰에서 켜라', 행동 행은 이 PC 의 켜기 버튼) 말해
           '설명문 0줄' 이 무너진다. 정보 손실 0 = 행동 행이 사실 + 다음 행동을 함께 말한다. */}
      {label.tone !== 'on' && st.reason && !action ? (
        <Text style={{ color: C.textDim, fontSize: 11.5, lineHeight: 17 }} numberOfLines={2}>{st.reason}</Text>
      ) : null}
      {err ? <Text style={{ color: C.error, fontSize: 11.5 }}>{err}</Text> : null}

      {/* 행동 행 — 동시 1개. 탭 가능한 두 종류는 승인 시트로 들어간다(유일한 승인 진입점) */}
      {action ? (
        action.tap ? (
          <PressableScale
            onPress={openDeviceTrustSheet}
            scaleTo={0.98}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: C.warn, borderRadius: R.sm, padding: 11 }}
          >
            <ShieldCheck size={15} color={C.warn} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: C.text, fontSize: 12.5, fontWeight: '600' }} numberOfLines={2}>{action.text}</Text>
              {action.hint ? <Text style={{ color: C.textDim, fontSize: 11, marginTop: 2 }} numberOfLines={1}>{action.hint}</Text> : null}
            </View>
            <CaretRight size={13} color={C.text3} />
          </PressableScale>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: C.warn, borderRadius: R.sm, padding: 11 }}>
            <WarningCircle size={15} color={C.warn} />
            <Text style={{ flex: 1, color: C.text, fontSize: 12.5, fontWeight: '600' }} numberOfLines={2}>{action.text}</Text>
          </View>
        )
      ) : null}

      {/* 자세히 — 기본 접힘. 나머지 전부가 이 안에 있다 */}
      <PressableScale
        onPress={() => setAdvOpen((v) => !v)}
        scaleTo={0.98}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 }}
      >
        <Text style={{ flex: 1, color: C.text2, fontSize: 12.5, fontWeight: '600' }}>{COPY.adv.toggle}</Text>
        {advOpen ? <CaretUp size={13} color={C.text3} /> : <CaretDown size={13} color={C.text3} />}
      </PressableScale>

      {advOpen ? (
        <Animated.View entering={FadeInDown.duration(180)} style={{ gap: 12 }}>
          {/* ① 정책(킬스위치) */}
          <Row label={COPY.adv.policy.label} hint={COPY.adv.policy.hint}>
            <Seg value={st.policy} onChange={onPolicy} />
          </Row>

          {/* ② 이 기기 안전 코드 — 사람이 두 화면을 대조하는 값(60비트) */}
          <Row label={COPY.adv.safety.label} hint={COPY.adv.safety.hint}>
            <Text
              selectable
              style={{ color: C.text, fontSize: 13, fontWeight: '700', fontFamily: v2.font.mono as string, letterSpacing: 0.5 }}
            >
              {st.safetyCode || '—'}
            </Text>
          </Row>

          {/* (구 ③ '지문' 행은 삭제 — 아래 ⑤ 목록의 자기 행이 같은 6자리를 '이 기기' 배지와 함께
              보여 준다. 대조는 안전 코드로 하므로 이 행은 아무 행동도 유발하지 않는 중복이었다) */}

          {/* ④ 복구 코드 */}
          <View style={{ gap: 8 }}>
            <Row label={COPY.adv.rec.label} hint={st.recoverySet ? COPY.adv.rec.hintSet : COPY.adv.rec.hintUnset}>
              {/* ★ 흐림은 `baseOpacity` 로만 먹는다 — style 의 opacity 는 PressableScale 의 애니메이션
                  스타일이 항상 덮는다(PressableScale.tsx:38). 그러면 열쇠가 없는데도 버튼이 100%
                  밝기로 보이고 눌러도 아무 일이 없다 = "앱이 고장났다" 로 읽힌다 */}
              <PressableScale
                onPress={onRecovery}
                disabled={recBusy || !st.ready}
                baseOpacity={st.ready ? (recBusy ? 0.6 : 1) : 0.5}
                style={{ paddingHorizontal: 12, height: 32, borderRadius: R.sm, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, borderWidth: 1, borderColor: C.borderControl, backgroundColor: C.elevated }}
              >
                {recBusy ? <ActivityIndicator size="small" color={C.text2} /> : null}
                <Text style={{ color: C.text, fontSize: 12, fontWeight: '600' }}>
                  {st.recoverySet ? COPY.adv.rec.btnRenew : COPY.adv.rec.btnCreate}
                </Text>
              </PressableScale>
            </Row>

            {recovery ? (
              <Animated.View entering={FadeInDown.duration(160)} style={{ gap: 6, borderWidth: 1, borderColor: C.accent, borderRadius: R.sm, padding: 11 }}>
                <Text style={{ color: C.accent, fontSize: 11.5, fontWeight: '700' }}>{COPY.adv.rec.shownWarn}</Text>
                <Text selectable style={{ color: C.text, fontSize: 15, fontWeight: '700', fontFamily: v2.font.mono as string, lineHeight: 24 }}>{recovery}</Text>
                <PressableScale onPress={() => setRecovery(null)} style={{ alignSelf: 'flex-start', paddingHorizontal: 12, height: 30, borderRadius: R.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: C.elevated2 }}>
                  <Text style={{ color: C.text2, fontSize: 12 }}>{COPY.adv.rec.shownBtn}</Text>
                </PressableScale>
              </Animated.View>
            ) : null}

            {/* 복원 — 열쇠가 없을 때만 노출(있으면 필요 없다) */}
            {canRestore ? (
              <View style={{ gap: 8 }}>
                <Row label={COPY.adv.rec.restoreLabel}>
                  <PressableScale
                    onPress={onRestore}
                    disabled={restoreBusy || (restoreOpen && restoreCode.trim().length < 20)}
                    baseOpacity={restoreBusy ? 0.7 : (restoreOpen && restoreCode.trim().length < 20 ? 0.5 : 1)}
                    style={{ paddingHorizontal: 14, height: 32, borderRadius: R.sm, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, backgroundColor: C.accent }}
                  >
                    {restoreBusy ? <ActivityIndicator size="small" color={C.onAccent} /> : null}
                    <Text style={{ color: C.onAccent, fontSize: 12, fontWeight: '700' }}>{COPY.adv.rec.restoreBtn}</Text>
                  </PressableScale>
                </Row>
                {restoreOpen ? (
                  <KeyTextInput
                    value={restoreCode}
                    onChangeText={setRestoreCode}
                    placeholder={COPY.adv.rec.placeholder}
                    placeholderTextColor={C.textDim}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    multiline
                    style={{ borderWidth: 1, borderColor: C.borderControl, borderRadius: R.sm, paddingHorizontal: 10, paddingVertical: 8, color: C.text, fontSize: 12.5, fontFamily: v2.font.mono as string, minHeight: 60 }}
                  />
                ) : null}
              </View>
            ) : null}
            {restoreDone ? <Text style={{ color: C.accent, fontSize: 11.5, fontWeight: '600' }}>{COPY.adv.rec.restoreDone}</Text> : null}
          </View>

          {/* ⑤ 열쇠를 가진 기기 — 감사용 목록 + 신뢰 해제(2탭) */}
          {keys.length ? (
            <View style={{ gap: 6 }}>
              <Text style={{ color: C.text2, fontSize: 12.5, fontWeight: '600' }}>{COPY.adv.keys.title}</Text>
              {keys.map((d) => {
                const isPc = d.platform === 'darwin' || d.platform === 'win32' || d.platform === 'linux';
                const mine = !!st.fingerprint && d.fingerprint === st.fingerprint;
                return (
                  <View key={String(d.deviceKeyId)} style={{ borderTopWidth: 1, borderTopColor: C.border, paddingVertical: 7 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                      {isPc ? <Desktop size={14} color={C.textDim} /> : <DeviceMobile size={14} color={C.textDim} />}
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={{ color: C.text, fontSize: 12.5, flexShrink: 1 }} numberOfLines={1}>{d.label}</Text>
                          {mine ? <Pill text={COPY.adv.keys.mine} tone="on" /> : null}
                        </View>
                        <Text style={{ color: C.textDim, fontSize: 10.5, fontFamily: v2.font.mono as string }}>🔒 {d.fingerprint}</Text>
                      </View>
                      {!mine ? (
                        <PressableScale onPress={() => void onRevoke(d)} disabled={busyId === d.deviceKeyId} hitSlop={8} style={{ padding: 4 }}>
                          {busyId === d.deviceKeyId
                            ? <ActivityIndicator size="small" color={C.error} />
                            : <Trash size={15} color={armId === d.deviceKeyId ? C.error : C.textDim} />}
                        </PressableScale>
                      ) : null}
                    </View>
                    {/* 비가역 경고는 **결정 순간**에만 — 상시 문단(구 73자)을 여기로 옮겼다 */}
                    {armId === d.deviceKeyId ? (
                      <Text style={{ color: C.error, fontSize: 10.5, marginTop: 4 }}>{COPY.adv.keys.revokeArm}</Text>
                    ) : null}
                  </View>
                );
              })}
            </View>
          ) : null}

          {/* ⑥ 메타데이터 정직성 고지(축약만 — 삭제 아님) */}
          <Text style={{ color: C.textDim, fontSize: 10.5, lineHeight: 16 }}>{COPY.adv.meta.note}</Text>
        </Animated.View>
      ) : null}
    </View>
  );
}
