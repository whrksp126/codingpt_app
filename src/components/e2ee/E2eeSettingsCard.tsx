import React, { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { LockKey, ShieldCheck, Desktop, DeviceMobile, Trash, CaretDown, CaretUp, WarningCircle } from 'phosphor-react-native';

import { v2 } from '../../theme/v2Tokens';
import PressableScale from '../ui/PressableScale';
import { useWorkspaceShell } from '../../contexts/WorkspaceShellContext';
import e2eeSvc, { type TrustedDeviceKey } from '../../services/e2ee';
import { hostLockLabel, stateLabel } from '../../services/e2ee/e2eeState';
import hostLock from '../../services/e2ee/hostLock';
import daemonService, { type AccountDevice } from '../../services/daemonService';
import DeviceTrustCard, { DeviceTrustWaiting } from './DeviceTrustCard';
import COPY from './e2eeCopy';

// 설정 > 계정 > **`기기` 섹션** — 3플랫폼(모바일/PC) 동일 계층. (파일명은 히스토리 유지)
//
// 2026-07-27 개정 2(사용자 요구): 구 '종단간 암호화' 카드와 구 '내 기기' 목록을 **한 섹션으로 합쳤다**.
//  왜: 암호화 카드 안에 '열쇠를 가진 기기' 목록이 있고 그 바로 아래에 '내 기기' 목록이 또 있어서 같은
//  기기가 한 화면에 두 번 나왔다(어느 쪽이 정본인지 알 수 없다). 열쇠 보유·암호화 여부는 **기기의
//  속성**이므로 기기 행이 단일 진실이고, 목록은 하나뿐이어야 한다.
//
// 2026-07-27 개정 3(사용자 요구: "기기 목록에서 카드 안에 카드 구조인데 그렇게 안햇으면 좋겠어!
//  차라리 테이블 구조는 어떨까"): 목록을 **표**로 바꿨다 — 바깥 카드는 1겹뿐이고 행에는 배경·테두리·
//  라운드가 없다(1px 구분선 + 열 정렬만). 행동 행(승인/대기/업데이트)도 같은 표의 행이다.
//  **박스는 한 곳만 남긴다** = 펼친 승인 카드(DeviceTrustCard) — 대조+승인/거절이 한 덩어리여야 하고
//  경고색 테두리가 그 자체로 보안 어포던스다. 헤더 행은 **두지 않는다**(지난 라운드의 텍스트 감축).
//   행1   🔒 기기 ................................... [self 배지 = 계정 열쇠 상태]
//   행2   (배지 톤이 on 이 아니고 **행동 행이 없을 때만**) reason 1줄
//   ┌ 표(한 목록) ────────────────────────────────────────────────────────────
//   행3   (대기 요청 있으면) 새 기기 N대 승인 ▾ → 펼치면 **그 자리에서** 안전 코드 대조 + 승인/거절
//   행4   (이 기기가 대기 중이면) 대기 행(안전 코드 + [승인됐는지 확인]) — flat, PC 와 동일 구성
//   행5~  기기 행: [아이콘] [이름 [이 기기]] [{OS} · {최근}] [암호화 배지] [🗑]
//   행N   (온라인 PC 가 0대일 때) 🖥 연결된 PC 없음 ..... [확인 중]   ← §2.7 정직성 기제
//   └────────────────────────────────────────────────────────────────────────
//  ★ 개정 4(2026-07-27 사용자 확정): `자세히` 는 없다 — 정책 자동 고정 · 안전 코드는 승인 카드에서만 ·
//   복구 UI 삭제 · 메타 고지 문서 이관 · 행 메타 지문 삭제. 정본 = 카피 감사 §3 개정 4 블록.
//
// ★ 암호화 배지는 **그 기기의 실제 상태**다(§2.7 거짓 자물쇠 금지): 온라인 PC 만 근거(runner_status.
//  e2eeEpoch)를 가지므로 그 행에만 그린다. 오프라인·모바일 행에는 아무 배지도 그리지 않는다 — 모름을
//  '암호화됨' 도 '평문' 도 아닌 것으로 남기는 유일한 정직한 표시다(배지 도메인 4종은 계약이라
//  '오프라인' 을 새로 만들지 않는다 — 카피 감사 §4-2).
// ★ 섹션 헤더 배지(self)는 개별 기기 상태를 **덮어쓰지 않는다**: 제목 자물쇠 색은 온라인 PC 전부가
//  tone='on' 일 때만 accent 다(st.ready 로 점등하면 모든 PC 가 평문인데 초록이 된다 = 실측 결함).
// ⚠ 문구는 전부 `e2eeCopy.ts`(계약 정본 미러)에서 온다 — 여기서 윤문하면 PC 와 어긋난다.

const C = v2.colors;
const R = v2.radius;

/**
 * 암호화 배지를 그릴 **호스트 행 집합** — PC `host-lock.js isHostRow()` 와 **같은 조건**이어야 한다.
 *  (동치 고정 = codingpt_pc/test/e2ee-crossimpl.mjs 5절이 이 식을 소스에서 오려 같은 격자로 대조한다 —
 *   형태를 바꾸면 그 테스트가 터진다 = "앱이 규칙을 바꿨으니 PC 도 보라" 는 신호다)
 */
const isHostRow = (d: AccountDevice) => d.role === 'host' && !!d.online && d.runnerKind !== 'cloud' && typeof d.id === 'number';

function osLabel(d: AccountDevice): string {
  if (d.runnerKind === 'cloud') return 'Linux';
  const p = String(d.platform || '').toLowerCase();
  if (p === 'darwin') return 'macOS';
  if (p === 'win32' || p === 'windows') return 'Windows';
  if (p === 'linux') return 'Linux';
  if (p === 'ios') return /ipad/i.test(d.name || '') ? 'iPadOS' : 'iOS';
  if (p === 'ipados') return 'iPadOS';
  if (p === 'android') return 'Android';
  return d.role === 'controller' ? '모바일' : '기기';
}
function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}
/** 최근 작업 시각 — 가까울수록 상대 표기(PC settings.js fmtRecent 미러). */
function fmtRecent(iso?: string | null): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (isNaN(t)) return '—';
  const diff = Date.now() - t;
  if (diff < 60_000) return '방금 전';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}분 전`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}시간 전`;
  return fmtDate(iso);
}

function Pill({ text, tone }: { text: string; tone: 'on' | 'wait' | 'off' }) {
  const bg = tone === 'on' ? C.accentTint : tone === 'wait' ? 'rgba(251,191,36,0.14)' : C.elevated2;
  const fg = tone === 'on' ? C.accent : tone === 'wait' ? C.warn : C.textDim;
  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: bg }}>
      <Text style={{ color: fg, fontSize: 10.5, fontWeight: '800' }}>{text}</Text>
    </View>
  );
}

// (★ 개정 4: 정책 세그(Seg) 삭제 — '자동' 고정. 구 UI 로 '끄기/항상' 을 저장한 기기는 아래
//  normalize 이펙트가 1회 복원한다. env 킬스위치는 데몬 쪽 판정이라 이 화면과 무관.)

/**
 * 표(table) 한 행의 골격 — 2026-07-27 개정 3(사용자 요구: "기기 목록에서 카드 안에 카드 구조인데
 *  그렇게 안햇으면 좋겠어! 차라리 테이블 구조는 어떨까").
 *  ★ 행에는 배경·테두리·라운드를 **주지 않는다**: 섹션 카드 안에 행 카드를 또 그리면 카드가 겹쳐
 *   보인다(그게 사용자가 지적한 구조다). 구분은 1px 선 하나뿐이고 열 정렬로 표처럼 읽게 한다.
 *  ★ 이 상수를 공유하는 행 = 기기 행 · 행동 행(승인/대기/업데이트) · '연결된 PC 없음' 행.
 *   PC `styles.css .dev-tbl td` 와 같은 시각 규칙이다(폰과 PC 를 나란히 놓고 본다).
 */
const ROW = {
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  gap: 8,
  borderTopWidth: 1,
  borderTopColor: C.border,
  paddingVertical: 9,
};

/**
 * 기기 행 한 줄(표) — 열 = [아이콘] [기기 이름(+'이 기기')] [운영체제·최근 작업·지문] [암호화 상태] [삭제].
 *  ★ 열은 **고정 비율**이다(이름 1.3 : 메타 1 + 우측 두 열은 내용 폭): 그래서 행이 여러 개여도 열
 *   경계가 같은 x 에 선다 = 헤더 행 없이도 표로 읽힌다(헤더 3개는 지난 라운드에 텍스트 감축으로
 *   지웠으므로 되살리지 않는다). PC `.dev-tbl` 의 5열 구성과 같다.
 *  ★ 이름 열에 더 큰 비율을 주는 이유(360dp 프록시 렌더 실측): 4열 + 배지가 들어가면 이름에 남는 폭이
 *   90px 뿐이라 `MacBook-P…` 로 잘렸다 — 이름은 그 행이 어느 기기인지 말하는 유일한 값이므로 메타
 *   (dim, 2차 정보)보다 우선한다.
 *  ★ 메타 열은 2줄까지 접힌다(좁은 폰에서 `macOS · 2시간 전 · 🔒 902 774` 가 한 줄에 안 들어간다) —
 *   말줄임으로 지문을 잘라 버리면 열쇠 보유 표시가 조용히 사라진다.
 */
function DeviceRow({
  icon, name, dim, mine, badge, sub, armed, busy, onDelete,
}: {
  icon: React.ReactNode; name: string; dim?: boolean; mine?: boolean;
  badge?: { text: string; tone: 'on' | 'wait' | 'off' } | null;
  sub?: string; armed?: boolean; busy?: boolean; onDelete?: () => void;
}) {
  return (
    <View>
      <View style={ROW}>
        {icon}
        {/* 이름 열 */}
        <View style={{ flex: 1.3, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ flexShrink: 1, color: dim ? C.textDim : C.text, fontSize: 12.5, fontWeight: dim ? '400' : '600' }} numberOfLines={1}>{name}</Text>
          {mine ? <Pill text={COPY.row.mine} tone="on" /> : null}
        </View>
        {/* 운영체제·최근 작업·지문 열 */}
        <Text style={{ flex: 1, minWidth: 0, color: C.textDim, fontSize: 10.5, lineHeight: 14 }} numberOfLines={2}>{sub || ''}</Text>
        {/* 암호화 상태 열 — 근거가 있는 행에만 배지가 있다(§2.7). 없으면 **빈 칸**이다(모름을 평문/초록
            으로 단정하지 않는다). 우측 정렬이라 배지가 있는 행끼리 오른쪽 끝이 맞는다 */}
        {badge ? <Pill text={badge.text} tone={badge.tone} /> : null}
        {/* 삭제 열 — 폭을 고정해 버튼이 있는 행/없는 행의 열 경계가 흔들리지 않게 한다 */}
        <View style={{ width: 22, alignItems: 'flex-end' }}>
          {onDelete ? (
            <PressableScale onPress={onDelete} disabled={!!busy} hitSlop={8} style={{ padding: 4 }}>
              {busy
                ? <ActivityIndicator size="small" color={C.error} />
                : <Trash size={15} color={armed ? C.error : C.textDim} weight={armed ? 'fill' : 'regular'} />}
            </PressableScale>
          ) : null}
        </View>
      </View>
      {/* 비가역 경고는 **결정 순간**에만 — 열쇠를 가진 기기를 지울 때(= 세대 회전)만 뜬다.
          그 기기 행에 붙는 줄이므로 구분선을 다시 그리지 않는다(PC `.dev-tr-note` 와 같은 규칙) */}
      {armed ? <Text style={{ color: C.error, fontSize: 10.5, paddingBottom: 6 }}>{COPY.row.revokeArm}</Text> : null}
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

  const [apprOpen, setApprOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [keys, setKeys] = useState<TrustedDeviceKey[]>([]);
  const [armKey, setArmKey] = useState<string | null>(null); // 삭제 1탭(무장) 대상 행
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [apprBusyId, setApprBusyId] = useState<string | null>(null);
  // (개정 5: waitBusy 삭제 — 대기 행의 '승인됐는지 확인' 버튼이 없어졌다. 승인은 WS resolved 로 온다)

  // ★ 개정 4: 정책 '자동' 고정 — 구 UI 로 '끄기/항상' 을 저장한 기기의 탈출로(1회 복원).
  useEffect(() => {
    if (st.policy && st.policy !== 'preferred') void e2eeSvc.setPolicy('preferred');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.policy]);

  const loadKeys = useCallback(async () => {
    try { setKeys((await e2eeSvc.loadKeyring()).devices); } catch (_) { setKeys([]); }
  }, []);
  useEffect(() => { void loadKeys(); }, [loadKeys, st.epoch, st.state]);

  // 클라우드 러너는 목록에서 숨긴다 — BYO 피벗으로 폐기했고 PC settings.js 도 같은 규칙이다.
  const devices = useMemo(() => S.devices.filter((dv) => dv.runnerKind !== 'cloud'), [S.devices]);
  // 온라인 PC(= 암호화 배지의 근거를 가진 행) 집합 — 0대면 아래에서 '연결된 PC 없음' 한 행을 그린다.
  const onlineHosts = useMemo(() => devices.filter(isHostRow), [devices]);
  // 세대까지 대조한 host 배지를 **한 번만** 계산해 행 렌더와 제목 자물쇠 색이 같은 근거를 쓰게 한다.
  //  4번째 인자 = 계정 세대. **내가** 뒤처진 경우(상대도 같은 옛 세대라 3인자 대조는 통과한다)를
  //  잡는다 — 그 상태의 봉투는 409(E2EE_EPOCH_MISMATCH)로 거절되므로 초록이면 거짓 자물쇠다.
  //  PC `settings.js` 도 같은 4인자를 넘긴다(앱==PC 라벨 동치 = test/e2ee-crossimpl.mjs).
  const hostBadges = useMemo(
    () => new Map(onlineHosts.map((d) => [String(d.id), hostLockLabel(st.ready, hostLock.hostE2eeEpoch(Number(d.id)), st.epoch, st.accountEpoch)])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onlineHosts.map((d) => d.id).join(','), st.ready, st.epoch, st.accountEpoch, hostLock.getHostLockVersion()],
  );
  // ★ 제목 자물쇠를 `st.ready`(= 내 폰에 열쇠 있음)로 점등하면 안 된다: 모든 host 가 '평문(열쇠 없음)'
  //  인데 초록 자물쇠가 켜져 §2.7 이 금지한 거짓 자물쇠가 **시각 채널로** 되살아난다(텍스트를 안 읽는
  //  사용자가 가장 먼저 읽는 신호가 이 아이콘이다). self 배지에서 '켜짐' 을 없앤 것과 같은 이유다.
  const allEncrypted = hostBadges.size > 0 && [...hostBadges.values()].every((hl) => hl.tone === 'on');

  // 열쇠를 가진 기기 ↔ 계정 기기 매칭(back publicKeyRow.deviceId) — 구 '열쇠를 가진 기기' 목록을
  //  기기 행의 지문으로 흡수한다. 어느 기기 행에도 붙지 않는 열쇠는 **행을 잃지 않게** 따로 그린다
  //  (그러지 않으면 해제할 방법이 사라진 열쇠가 계정에 남는다 = 보안 후퇴).
  const trustedKeys = useMemo(() => keys.filter((k) => k.state === 'trusted'), [keys]);
  const keyByDevice = useMemo(() => {
    const m = new Map<string, TrustedDeviceKey>();
    for (const k of trustedKeys) if (k.deviceId != null) m.set(String(k.deviceId), k);
    return m;
  }, [trustedKeys]);
  const orphanKeys = useMemo(() => {
    // ⚠ 기기 목록이 아직 안 왔을 때(devices=[]) 는 **판정하지 않는다**: 키링이 먼저 도착하면 모든 열쇠가
    //  '고아' 로 보여 같은 기기가 두 번 뜨는 화면이 잠깐 스친다(합치려던 그 중복이 로딩 중에 재현된다).
    if (!devices.length) return [];
    const ids = new Set(devices.map((d) => String(d.id)));
    return trustedKeys.filter((k) => k.deviceId == null || !ids.has(String(k.deviceId)));
  }, [trustedKeys, devices]);

  // (개정 4: onPolicy/onRecovery/onRestore 삭제 — 정책 자동 고정, 복구 UI 제거.
  //  e2eeSvc.createRecoveryCode/restoreFromRecovery 는 서비스에 존치한다 — UI 만 없다.)

  /**
   * 기기 삭제(2탭) — 열쇠를 가진 기기면 **열쇠 해제 + 세대 회전까지** 함께 한다.
   *  왜 한 동작인가: back `revokeDevice` 는 그 기기의 열쇠를 'revoked' 로 표시하고 rotate_needed 만
   *  팬아웃한다(회전은 사람이 있는 클라이언트가 해야 한다). 회전 없이 지우면 지운 기기가 이미 가진
   *  MK_epoch 로 **이후 트래픽까지** 계속 열 수 있다 → 구 '신뢰 해제' 가 하던 회전을 여기서 한다.
   *  ⚠ 내 폰에 열쇠가 없으면 회전은 불가능하다(봉인문을 만들 주체가 없다) → 기기 삭제만 한다(구 동작).
   */
  const onDeleteDevice = useCallback(async (d: AccountDevice) => {
    const rowKey = `dev:${d.id}`;
    const key = keyByDevice.get(String(d.id));
    if (armKey !== rowKey) { setArmKey(rowKey); setTimeout(() => setArmKey(null), 4000); return; }
    setArmKey(null);
    setBusyKey(rowKey);
    setErr(null);
    try {
      if (key && st.ready) {
        try { await e2eeSvc.revokeTrustAndRotate(key.deviceKeyId); }
        catch (e: any) { setErr(e?.message || COPY.err.revoke); }
      }
      await daemonService.revokeDevice(Number(d.id));
      await S.loadDevices();
      await loadKeys();
    } catch (_) { /* 기기 삭제 실패는 목록이 그대로 남아 사용자에게 보인다 */ }
    finally { setBusyKey(null); }
  }, [armKey, keyByDevice, st.ready, S, loadKeys]);

  /** 기기 행이 없는 열쇠(고아) 해제 — 구 '열쇠를 가진 기기' 목록의 휴지통과 같은 동작(2탭). */
  const onRevokeKey = useCallback(async (k: TrustedDeviceKey) => {
    const rowKey = `key:${k.deviceKeyId}`;
    if (armKey !== rowKey) { setArmKey(rowKey); setTimeout(() => setArmKey(null), 4000); return; }
    setArmKey(null);
    setBusyKey(rowKey);
    setErr(null);
    try { await e2eeSvc.revokeTrustAndRotate(k.deviceKeyId); await loadKeys(); }
    catch (e: any) { setErr(e?.message || COPY.err.revoke); }
    finally { setBusyKey(null); }
  }, [armKey, loadKeys]);

  const onApprove = useCallback(async (enrollmentId: string, ikX: string) => {
    setApprBusyId(enrollmentId);
    setErr(null);
    try { await S.approveDeviceTrust(enrollmentId, ikX); await loadKeys(); }
    catch (e: any) { setErr(e?.message || COPY.err.approve); }
    finally { setApprBusyId(null); }
  }, [S, loadKeys]);
  const onDeny = useCallback(async (enrollmentId: string) => {
    setApprBusyId(enrollmentId);
    setErr(null);
    try { await S.denyDeviceTrust(enrollmentId); }
    catch (e: any) { setErr(e?.message || COPY.err.deny); }
    finally { setApprBusyId(null); }
  }, [S]);

  // 행동 행 — **동시에 하나만**. 우선순위 = 승인 대기 요청 > 이 기기가 대기 중 > 자동 켜는 중 > 업데이트.
  //  ★ 개정 4: 'bootstrapping' 행 신설 — 앱은 원래 열쇠 0개 계정을 자동으로 켠다(services/e2ee.ts ③).
  //   그 잠깐(수 초)을 빈 화면으로 두지 않고 진행을 말한다(PC settings.js 와 같은 행·같은 문구).
  const action = useMemo(() => {
    if (S.trustRequests.length > 0) return 'approve';
    if (st.state === 'pending') return 'selfWait';
    if (st.state === 'bootstrap') return 'bootstrapping';
    if (st.storageMissing) return 'needUpdate';
    return null;
  }, [S.trustRequests.length, st.state, st.storageMissing]);

  return (
    <View style={{ borderWidth: 1, borderColor: C.border, borderRadius: R.md, padding: 14, gap: 10, marginTop: 18 }}>
      {/* 행1 — 섹션 제목 + self 배지(계정 열쇠 상태). 설명문 없음 */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
        <LockKey size={16} color={allEncrypted ? C.accent : C.text3} />
        <Text style={{ flex: 1, color: C.text, fontSize: 13.5, fontWeight: '700' }}>{COPY.card.title}</Text>
        <Pill text={label.text} tone={label.tone} />
      </View>

      {/* 배지가 초록이 아니고 **행동 행이 없을 때만** 사유 1줄(데몬·서버가 만든 문장이라 2줄 클램프).
          ★ 행동 행이 뜨는 상태에서는 그리지 않는다: reason 원문은 행동 행과 같은 사실을 더 길게
           (때로는 상충하게) 말해 '설명문 0줄' 이 무너진다. 정보 손실 0 = 행동 행이 사실 + 다음 행동을
           함께 말한다. */}
      {label.tone !== 'on' && st.reason && !action ? (
        <Text style={{ color: C.textDim, fontSize: 11.5, lineHeight: 17 }} numberOfLines={2}>{st.reason}</Text>
      ) : null}
      {err ? <Text style={{ color: C.error, fontSize: 11.5 }}>{err}</Text> : null}

      {/* ── 표(table) — 행동 행 + 기기 행 + '연결된 PC 없음' 행이 **한 목록**이다(2026-07-27 개정 3).
          예전에는 행동 행마다 테두리 박스였고 그 박스가 섹션 카드 안에 또 있어서 "카드 안에 카드" 였다
          (사용자 지적) → 바깥 카드 1겹 + 1px 구분선. `gap` 없이 붙여야 구분선이 표처럼 이어진다.
          ★ 기기 목록 = **단일 진실**. 각 행의 암호화 배지는 그 기기의 실제 상태고(온라인 PC 만 근거가
           있다), 지문(🔒)은 그 기기가 계정 열쇠를 갖고 있다는 표시다(구 '열쇠를 가진 기기' 흡수).
          ★ 온라인 PC 가 0대여도 그 자리를 비우지 않는다: 초록 self 배지 한 줄만 남으면 사용자는
           '내 데이터가 안전하다' 로 읽는데 사실은 '이 폰에 열쇠가 있다' 뿐이다(§2.7). */}
      <View>
        {/* 행1 — 승인 대기 요청(있을 때만, 목록 맨 위). 탭하면 **그 자리에서** 안전 코드 대조 +
            승인/거절(PC 미러). 알림에서 들어오는 경로(DeviceTrustHost 시트)는 그대로 살아 있다. */}
        {action === 'approve' ? (
          <>
            {/* 개정 5: 이 행도 **무채색**이다 — 경고색은 "사고" 로 읽히지만 이건 사용자가 방금 시작한
                정상 흐름이다(색 규율: accent/warn 은 상태 신호 전용, 상호작용 요소에는 쓰지 않는다). */}
            <PressableScale onPress={() => setApprOpen((v) => !v)} scaleTo={0.99} style={ROW}>
              <ShieldCheck size={15} color={C.text3} />
              <Text style={{ flex: 1, color: C.text, fontSize: 12.5, fontWeight: '700' }} numberOfLines={2}>{COPY.act.approve(S.trustRequests.length)}</Text>
              {apprOpen ? <CaretUp size={13} color={C.text3} /> : <CaretDown size={13} color={C.text3} />}
            </PressableScale>
            {/* ★ **유일한 예외 박스**: 펼친 승인 카드. 안전 코드 대조 + [거절]/[승인] 이 한 덩어리로
                묶여야 하고 경고색 테두리 자체가 보안 어포던스다(PC `.appr-card` 와 같은 예외). */}
            {apprOpen ? (
              <View style={{ gap: 8, paddingBottom: 9 }}>
                {S.trustRequests.map((d) => (
                  <DeviceTrustCard
                    key={d.enrollmentId}
                    device={d}
                    compact
                    busy={apprBusyId === d.enrollmentId}
                    onApprove={() => void onApprove(d.enrollmentId, d.ikX)}
                    onDeny={() => void onDeny(d.enrollmentId)}
                  />
                ))}
              </View>
            ) : null}
          </>
        ) : null}

        {/* 행2 — 이 기기가 승인을 기다리는 중(인라인, PC 와 같은 구성).
            (개정 4: 복구 경로 부제(selfWaitHint)는 복구 UI 와 함께 삭제 — 기기 전손실이면 새 기기에서
             자동으로 새 열쇠가 생긴다.)
            `flat` = 표 안에서는 박스를 그리지 않는다(승인 시트에서는 그 화면의 유일한 내용이라 박스). */}
        {action === 'selfWait' ? (
          <DeviceTrustWaiting
            flat
            safety={st.safetyCode || ''}
            code={st.verifyCode || ''}
            hint={null}
          />
        ) : null}

        {/* 행3 — 자동 부트스트랩 진행(개정 4, 수 초짜리 과도 상태 — 버튼 없음) */}
        {action === 'bootstrapping' ? (
          <View style={ROW}>
            <ActivityIndicator size="small" color={C.textDim} />
            <Text style={{ flex: 1, color: C.textDim, fontSize: 12 }} numberOfLines={1}>{COPY.act.bootstrapping}</Text>
          </View>
        ) : null}

        {action === 'needUpdate' ? (
          <View style={ROW}>
            <WarningCircle size={15} color={C.warn} />
            <Text style={{ flex: 1, color: C.warn, fontSize: 12.5, fontWeight: '700' }} numberOfLines={2}>{COPY.act.needUpdate}</Text>
          </View>
        ) : null}

        {devices.length === 0 ? (
          <Text style={{ color: C.textDim, fontSize: 12, paddingVertical: 9, borderTopWidth: 1, borderTopColor: C.border }}>불러오는 중…</Text>
        ) : devices.map((d) => {
          const isCur = d.isCurrent || (S.currentDeviceId != null && d.id === S.currentDeviceId);
          const k = keyByDevice.get(String(d.id));
          // 개정 4: 정책 UI 삭제('끄기' 없음) — env 킬스위치(state='off')일 때만 배지를 접는다.
          const badge = st.state !== 'off' ? hostBadges.get(String(d.id)) || null : null;
          // 개정 4: 🔒 지문은 행 메타에서 삭제(사용자가 읽을 수 없는 값 — 고아 열쇠 행만 예외).
          const sub = [osLabel(d), fmtRecent(d.lastSeenAt || d.createdAt)].filter(Boolean).join(' · ');
          const canRevoke = typeof d.id === 'number' && !isCur;
          return (
            <DeviceRow
              key={String(d.id)}
              icon={d.role === 'controller' ? <DeviceMobile size={14} color={C.textDim} /> : <Desktop size={14} color={C.textDim} />}
              name={d.name || '기기'}
              dim={!d.online}
              mine={isCur}
              badge={badge}
              sub={sub}
              // 비가역 경고(회전)는 **열쇠를 가진 기기**를 지울 때만 — 열쇠 없는 기기는 다시 연결하면 된다
              armed={armKey === `dev:${d.id}` && !!k}
              busy={busyKey === `dev:${d.id}`}
              onDelete={canRevoke ? () => void onDeleteDevice(d) : undefined}
            />
          );
        })}
        {/* 기기 행에 붙지 않는 열쇠 — 해제 경로를 잃지 않게 같은 목록에 남긴다 */}
        {orphanKeys.map((k) => {
          const isPc = k.platform === 'darwin' || k.platform === 'win32' || k.platform === 'linux';
          const mine = !!st.fingerprint && k.fingerprint === st.fingerprint;
          return (
            <DeviceRow
              key={`key:${k.deviceKeyId}`}
              icon={isPc ? <Desktop size={14} color={C.textDim} /> : <DeviceMobile size={14} color={C.textDim} />}
              name={k.label}
              mine={mine}
              sub={k.fingerprint ? `🔒 ${k.fingerprint}` : ''}
              armed={armKey === `key:${k.deviceKeyId}`}
              busy={busyKey === `key:${k.deviceKeyId}`}
              onDelete={mine ? undefined : () => void onRevokeKey(k)}
            />
          );
        })}
        {st.state !== 'off' && onlineHosts.length === 0 ? (
          <DeviceRow
            icon={<Desktop size={14} color={C.textDim} />}
            name={COPY.card.noHost}
            dim
            badge={{ text: COPY.hostBadge.checking, tone: 'wait' }}
          />
        ) : null}
      </View>
      {/* (★ 개정 4: `자세히` 섹션 통삭제 — 정책은 자동 고정, 안전 코드 대조는 승인 카드/대기 행에서만,
          복구 코드는 현 스코프에 지킬 저장 데이터가 없어 제거(서비스 API 는 존치), 메타 고지는 문서로.
          카피 감사 §3 개정 4 블록이 정본이다.) */}
    </View>
  );
}
