import React, { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { LockKey, ShieldCheck, Desktop, DeviceMobile, Trash, CaretRight } from 'phosphor-react-native';

import { v2 } from '../../theme/v2Tokens';
import { useWorkspaceShell } from '../../contexts/WorkspaceShellContext';
import e2eeSvc, { type E2eePolicy, type TrustedDeviceKey } from '../../services/e2ee';
import { hostLockLabel, stateLabel } from '../../services/e2ee/e2eeState';
import hostLock from '../../services/e2ee/hostLock';
import { openDeviceTrustSheet } from './e2eeUi';
import KeyTextInput from '../keyboard/KeyTextInput';

// 설정 > 계정 > "종단간 암호화" 카드 — 3플랫폼(모바일/PC) 동일 정보 구조.
//  ① 상태(켜짐/승인 대기/꺼짐/미지원) ② 정책 토글(킬스위치) ③ QR·지문 재검증(강한 검증)
//  ④ 복구 코드 보기/저장 ⑤ 신뢰 기기 목록 + 신뢰 해제(+ epoch 회전)
//
// 정직성 고지(설계 §7-3): 폴더명·브랜치명 등 **메타데이터는 서버가 본다**. 여기서 그대로 밝힌다.

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
    { v: 'off', label: '끄기' },
    { v: 'preferred', label: '자동' },
    { v: 'required', label: '항상' },
  ];
  return (
    <View style={{ flexDirection: 'row', backgroundColor: C.elevated2, borderRadius: R.sm, padding: 2 }}>
      {opts.map((o) => {
        const on = o.v === value;
        return (
          <Pressable
            key={o.v}
            onPress={() => onChange(o.v)}
            style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: R.sm - 1, backgroundColor: on ? C.elevated : 'transparent' }}
          >
            <Text style={{ fontSize: 12, fontWeight: on ? '700' : '500', color: on ? C.text : C.textDim }}>{o.label}</Text>
          </Pressable>
        );
      })}
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
  const hosts = S.devices.filter((d) => d.role === 'host' && d.online && typeof d.id === 'number');

  const [verifyOpen, setVerifyOpen] = useState(false);
  const [recovery, setRecovery] = useState<string | null>(null);
  const [recBusy, setRecBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [keys, setKeys] = useState<TrustedDeviceKey[]>([]);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [restoreCode, setRestoreCode] = useState('');
  const [restoreBusy, setRestoreBusy] = useState(false);
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
    catch (e: any) { setErr(e?.message || '복구 코드를 만들 수 없어요.'); }
    finally { setRecBusy(false); }
  }, []);

  // 복구 코드로 복원 — 모든 신뢰 기기를 잃은 경우의 유일한 출구(코드 자체가 열쇠를 담는다).
  const onRestore = useCallback(async () => {
    setErr(null);
    setRestoreBusy(true);
    try {
      const ok = await e2eeSvc.restoreFromRecovery(restoreCode);
      if (ok) { setRestoreOpen(false); setRestoreCode(''); }
      else setErr('복구 코드가 올바르지 않아요(오타를 확인해 주세요).');
    } finally { setRestoreBusy(false); }
  }, [restoreCode]);

  const onRevoke = useCallback(async (d: TrustedDeviceKey) => {
    if (armId !== d.deviceKeyId) { setArmId(d.deviceKeyId); setTimeout(() => setArmId(null), 4000); return; }
    setArmId(null);
    setBusyId(d.deviceKeyId);
    setErr(null);
    try { await e2eeSvc.revokeTrustAndRotate(d.deviceKeyId); await loadKeys(); }
    catch (e: any) { setErr(e?.message || '신뢰 해제에 실패했어요.'); }
    finally { setBusyId(null); }
  }, [armId, loadKeys]);

  return (
    <View style={{ borderWidth: 1, borderColor: C.border, borderRadius: R.md, padding: 14, gap: 12, marginTop: 18 }}>
      {/* 헤더 */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
        <LockKey size={16} color={st.ready ? C.accent : C.text3} />
        <Text style={{ flex: 1, color: C.text, fontSize: 13.5, fontWeight: '700' }}>종단간 암호화</Text>
        <Pill text={label.text} tone={label.tone} />
      </View>

      <Text style={{ color: C.text2, fontSize: 12, lineHeight: 18 }}>
        {st.ready
          ? '이 기기에는 열쇠가 있어요. 실제 암호화는 상대 PC 에도 열쇠가 있을 때 걸립니다 — PC 별 상태는 아래에.'
          : '지원되는 기기끼리는 자동으로 암호화하고, 아니면 기존 방식(평문)으로 그대로 동작합니다.'}
      </Text>

      {/* PC 별 실제 자물쇠(정직성) — 열쇠 없는 PC 로 가는 트래픽은 평문임을 그대로 밝힌다 */}
      {st.policy !== 'off' && hosts.length ? (
        <View style={{ gap: 5 }}>
          {hosts.map((d) => {
            // 세대까지 대조한다 — 회전 직후 그 PC 가 옛 epoch 면(데몬은 폴링으로만 감지) 트래픽은 평문이다.
            const hl = hostLockLabel(st.ready, hostLock.hostE2eeEpoch(Number(d.id)), st.epoch);
            return (
              <View key={String(d.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                <Desktop size={13} color={C.textDim} />
                <Text style={{ flex: 1, color: C.text2, fontSize: 12 }} numberOfLines={1}>{d.name}</Text>
                <Pill text={hl.text} tone={hl.tone} />
              </View>
            );
          })}
        </View>
      ) : null}
      {st.reason ? <Text style={{ color: C.textDim, fontSize: 11.5, lineHeight: 17 }}>{st.reason}</Text> : null}
      {st.storageMissing ? (
        <Text style={{ color: C.warn, fontSize: 11.5, lineHeight: 17 }}>
          이 빌드에는 보안 저장소(Keychain/Keystore)가 포함되지 않아 열쇠를 만들 수 없어요. 앱을 업데이트하면 자동으로 켜집니다.
        </Text>
      ) : null}
      {err ? <Text style={{ color: C.error, fontSize: 11.5 }}>{err}</Text> : null}

      {/* 승인 대기 — 이 기기가 대기 중이거나, 다른 기기가 승인을 기다릴 때 진입점 */}
      {st.state === 'pending' || S.trustRequests.length > 0 ? (
        <Pressable
          onPress={openDeviceTrustSheet}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: C.warn, borderRadius: R.sm, padding: 11 }}
        >
          <ShieldCheck size={15} color={C.warn} />
          <Text style={{ flex: 1, color: C.text, fontSize: 12.5, fontWeight: '600' }}>
            {st.state === 'pending'
              ? `이 기기 승인 대기 중 · 안전 코드 ${st.safetyCode || '—'}`
              : `승인을 기다리는 기기 ${S.trustRequests.length}대`}
          </Text>
          <CaretRight size={13} color={C.text3} />
        </Pressable>
      ) : null}

      {/* 정책(킬스위치) */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: C.text2, fontSize: 12.5 }}>암호화 사용</Text>
          <Text style={{ color: C.textDim, fontSize: 11, marginTop: 2 }}>
            자동 = 양쪽이 지원하면 암호화(권장) · 항상 = 지원 안 하면 조작 차단
          </Text>
        </View>
        <Seg value={st.policy} onChange={onPolicy} />
      </View>

      {/* 강한 검증(QR / 지문) */}
      <Pressable onPress={() => setVerifyOpen((v) => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ flex: 1, color: C.text2, fontSize: 12.5 }}>QR 로 재검증 · 지문 확인</Text>
        <Text style={{ color: C.accent, fontSize: 12, fontWeight: '600' }}>{verifyOpen ? '닫기' : '열기'}</Text>
      </Pressable>
      {verifyOpen ? (
        <View style={{ gap: 8, backgroundColor: C.elevated, borderRadius: R.sm, padding: 11 }}>
          <Text style={{ color: C.textDim, fontSize: 11.5, lineHeight: 17 }}>
            이 기기의 안전 코드입니다. PC 설정 → 계정 → 종단간 암호화 에 표시된 값과{' '}
            <Text style={{ fontWeight: '700', color: C.text2 }}>글자까지</Text> 같은지 확인하세요(대조는 이 값으로 합니다).
          </Text>
          <Text selectable style={{ color: C.text, fontSize: 20, fontWeight: '800', fontFamily: v2.font.mono as string, letterSpacing: 1.5 }}>
            {st.safetyCode || '—'}
          </Text>
          <Text style={{ color: C.textDim, fontSize: 10.5 }}>
            기기 목록 표기용 지문: {st.fingerprint || '— — —'}
          </Text>
          <Text style={{ color: C.textDim, fontSize: 11.5, lineHeight: 17 }}>
            새 PC 를 추가할 때는 PC 화면의 QR 을 카메라로 스캔하면 지문이 자동 검증됩니다(추가 조작 없음).
            지문이 다르면 열쇠를 전달하지 않고 차단합니다.
          </Text>
        </View>
      ) : null}

      {/* 복구 코드 */}
      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: C.text2, fontSize: 12.5 }}>복구 코드</Text>
            <Text style={{ color: C.textDim, fontSize: 11, marginTop: 2 }}>
              {st.recoverySet ? '설정됨 — 새로 만들면 이전 코드는 무효' : '모든 기기를 잃으면 열쇠를 되살릴 수 없어요'}
            </Text>
          </View>
          <Pressable
            onPress={onRecovery}
            disabled={recBusy || !st.ready}
            style={{ paddingHorizontal: 12, height: 32, borderRadius: R.sm, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, borderWidth: 1, borderColor: C.borderControl, backgroundColor: C.elevated, opacity: st.ready ? (recBusy ? 0.6 : 1) : 0.5 }}
          >
            {recBusy ? <ActivityIndicator size="small" color={C.text2} /> : null}
            <Text style={{ color: C.text, fontSize: 12, fontWeight: '600' }}>{st.recoverySet ? '새로 만들기' : '만들기'}</Text>
          </Pressable>
        </View>
        {/* 복원 — 열쇠가 없을 때만 노출(있으면 필요 없다) */}
        {!st.ready && st.state !== 'unavailable' && st.state !== 'off' ? (
          <View style={{ gap: 8 }}>
            <Pressable onPress={() => setRestoreOpen((v) => !v)}>
              <Text style={{ color: C.accent, fontSize: 12, fontWeight: '600' }}>
                {restoreOpen ? '닫기' : '복구 코드가 있어요 — 코드로 복원하기'}
              </Text>
            </Pressable>
            {restoreOpen ? (
              <View style={{ gap: 8 }}>
                <KeyTextInput
                  value={restoreCode}
                  onChangeText={setRestoreCode}
                  placeholder="CPT1-XXXXX-XXXXX-…"
                  placeholderTextColor={C.textDim}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  multiline
                  style={{ borderWidth: 1, borderColor: C.borderControl, borderRadius: R.sm, paddingHorizontal: 10, paddingVertical: 8, color: C.text, fontSize: 12.5, fontFamily: v2.font.mono as string, minHeight: 60 }}
                />
                <Pressable
                  onPress={onRestore}
                  disabled={restoreBusy || restoreCode.trim().length < 20}
                  style={{ alignSelf: 'flex-start', paddingHorizontal: 14, height: 34, borderRadius: R.sm, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, backgroundColor: C.accent, opacity: restoreCode.trim().length < 20 ? 0.5 : (restoreBusy ? 0.7 : 1) }}
                >
                  {restoreBusy ? <ActivityIndicator size="small" color={C.onAccent} /> : null}
                  <Text style={{ color: C.onAccent, fontSize: 12.5, fontWeight: '700' }}>복원</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        ) : null}
        {recovery ? (
          <View style={{ gap: 6, borderWidth: 1, borderColor: C.accent, borderRadius: R.sm, padding: 11 }}>
            <Text style={{ color: C.accent, fontSize: 11.5, fontWeight: '700' }}>이 화면을 닫으면 다시 볼 수 없어요 — 지금 안전한 곳에 적어두세요.</Text>
            <Text selectable style={{ color: C.text, fontSize: 15, fontWeight: '700', fontFamily: v2.font.mono as string, lineHeight: 24 }}>{recovery}</Text>
            <Pressable onPress={() => setRecovery(null)} style={{ alignSelf: 'flex-start', paddingHorizontal: 12, height: 30, borderRadius: R.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: C.elevated2 }}>
              <Text style={{ color: C.text2, fontSize: 12 }}>적어뒀어요</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      {/* 신뢰 기기 목록 */}
      {keys.length ? (
        <View style={{ gap: 6 }}>
          <Text style={{ color: C.text2, fontSize: 12.5, fontWeight: '600' }}>열쇠를 가진 기기</Text>
          {keys.map((d) => {
            const isPc = d.platform === 'darwin' || d.platform === 'win32' || d.platform === 'linux';
            const mine = !!st.fingerprint && d.fingerprint === st.fingerprint;
            return (
              <View key={String(d.deviceKeyId)} style={{ flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 7, borderTopWidth: 1, borderTopColor: C.border }}>
                {isPc ? <Desktop size={14} color={C.textDim} /> : <DeviceMobile size={14} color={C.textDim} />}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: C.text, fontSize: 12.5 }} numberOfLines={1}>
                    {d.label}{mine ? ' · 이 기기' : ''}
                  </Text>
                  <Text style={{ color: C.textDim, fontSize: 10.5, fontFamily: v2.font.mono as string }}>🔒 {d.fingerprint}</Text>
                </View>
                {!mine ? (
                  <Pressable onPress={() => void onRevoke(d)} disabled={busyId === d.deviceKeyId} hitSlop={8} style={{ padding: 4 }}>
                    {busyId === d.deviceKeyId
                      ? <ActivityIndicator size="small" color={C.error} />
                      : <Trash size={15} color={armId === d.deviceKeyId ? C.error : C.textDim} />}
                  </Pressable>
                ) : null}
              </View>
            );
          })}
          <Text style={{ color: C.textDim, fontSize: 10.5, lineHeight: 16 }}>
            신뢰를 해제하면 열쇠를 새로 만들어 남은 기기에만 다시 나눠줍니다. 해제 이전에 그 기기가 이미 받은
            데이터는 회수할 수 없습니다.
          </Text>
        </View>
      ) : null}

      <Text style={{ color: C.textDim, fontSize: 10.5, lineHeight: 16 }}>
        암호화해도 폴더명·브랜치명 같은 메타데이터와 알림 제목은 서버가 봅니다(기기 목록·그룹핑·잠금화면
        알림이 그 정보로 동작합니다).
      </Text>
    </View>
  );
}
