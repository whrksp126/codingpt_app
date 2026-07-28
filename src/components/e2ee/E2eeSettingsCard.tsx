import React, { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { LockKey, ShieldCheck, Desktop, DeviceMobile, Trash, CaretRight, WarningCircle } from 'phosphor-react-native';

import { v2 } from '../../theme/v2Tokens';
import PressableScale from '../ui/PressableScale';
import { useWorkspaceShell } from '../../contexts/WorkspaceShellContext';
import e2eeSvc, { type TrustedDeviceKey } from '../../services/e2ee';
import { hostLockLabel, stateLabel } from '../../services/e2ee/e2eeState';
import hostLock from '../../services/e2ee/hostLock';
import daemonService, { type AccountDevice } from '../../services/daemonService';
// 개정 6: 인라인 승인 카드(DeviceTrustCard)는 이 화면에서 쓰지 않는다 — 승인 표면은 시트/알림이다.
import { DeviceTrustWaiting } from './DeviceTrustCard';
import COPY from './e2eeCopy';
// 승인 시트(사건 표면)를 여는 것만 이 화면의 일이다 — 승인/거절 자체는 그 시트·알림·전역 카드가 한다.
import { openDeviceTrustSheet } from './e2eeUi';

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

// (★ 개정 7: 상태 Pill(배지) 컴포넌트 삭제 — self 배지·행별 암호화 배지·'이 기기' 배지가 모두
//  없어졌다. 상태는 글자로 말하고(연동 안 됨), 소속은 자리로 말한다(이 기기 / 다른 기기).

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
/** 표 소제목(`이 기기` / `다른 기기`) — 구분선을 다시 그리지 않는다(소제목이 곧 구분이다). */
function SubHead({ text }: { text: string }) {
  return <Text style={{ color: C.textDim, fontSize: 10.5, paddingTop: 12, paddingBottom: 2 }}>{text}</Text>;
}

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
  icon, name, dim, sub, armed, busy, onDelete, onLink, linkBusy, linkSent,
}: {
  icon: React.ReactNode; name: string; dim?: boolean;
  sub?: string; armed?: boolean; busy?: boolean; onDelete?: () => void;
  //  개정 6: 연동 전 기기의 [연동] 버튼(승인 절차 재시작). 상태가 바뀌려면 상대 기기의 승인이
  //   필요하므로 누른 뒤에는 "요청 보냄" 으로 굳힌다(사실만 말한다 — 낙관적 '연동됨' 금지).
  onLink?: () => void; linkBusy?: boolean; linkSent?: boolean;
}) {
  return (
    <View>
      <View style={ROW}>
        {icon}
        {/* 이름 열 */}
        <View style={{ flex: 1.3, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ flexShrink: 1, color: dim ? C.textDim : C.text, fontSize: 12.5, fontWeight: dim ? '400' : '600' }} numberOfLines={1}>{name}</Text>
        </View>
        {/* 운영체제·최근 작업·지문 열 */}
        <Text style={{ flex: 1, minWidth: 0, color: C.textDim, fontSize: 10.5, lineHeight: 14 }} numberOfLines={2}>{sub || ''}</Text>
        {/* 연동 열 — 승인 절차를 끝내지 않은 기기에만 있다(개정 6). 중립 pill(색 규율: accent 금지). */}
        {onLink ? (
          <PressableScale
            onPress={onLink}
            disabled={!!linkBusy || !!linkSent}
            baseOpacity={linkBusy || linkSent ? 0.6 : 1}
            style={{
              paddingHorizontal: 10, height: 28, borderRadius: R.sm, alignItems: 'center', justifyContent: 'center',
              borderWidth: 1, borderColor: C.borderControl, backgroundColor: C.elevated2,
            }}
          >
            <Text style={{ color: C.text2, fontSize: 11.5, fontWeight: '600' }}>
              {linkBusy ? COPY.row.linking : linkSent ? COPY.row.linkSent : COPY.row.link}
            </Text>
          </PressableScale>
        ) : null}
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

  //  개정 6: 인라인 승인 카드가 없어졌으므로 펼침 상태도 없다(승인 = 시트/알림/전역 카드).
  const [linkBusyId, setLinkBusyId] = useState<string | null>(null);
  const [linkSent, setLinkSent] = useState<Set<string>>(new Set());
  const [err, setErr] = useState<string | null>(null);
  const [keys, setKeys] = useState<TrustedDeviceKey[]>([]);
  const [armKey, setArmKey] = useState<string | null>(null); // 삭제 1탭(무장) 대상 행
  const [busyKey, setBusyKey] = useState<string | null>(null);
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
  //  (★ 개정 7: 온라인 host 집합·행별 암호화 배지 계산은 **삭제**했다 — 배지를 그리지 않으므로
  //   매 렌더마다 세대를 대조할 이유가 없다. 판정 함수(hostLockLabel)와 호스트 필터(isHostRow)는
  //   services/e2ee/e2eeState.ts·이 파일 상단에 계약과 함께 남아 있고, PC 교차검증이 계속 그것을 본다.)

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

  /**
   * [연동] — 그 기기와의 승인 절차를 다시 시작한다(개정 6).
   *  방향 판단은 **서버**가 한다(deviceTrustService.nudge): 내가 대기 중이면 신뢰 기기들에 재알림,
   *  상대에게 열쇠가 없으면 그 기기가 즉시 재신청하도록 팬아웃. 클라가 방향을 정하면 폰과 PC 의
   *  규칙이 갈라진다. 성공 표시는 "요청 보냄"까지다 — 연동 완료는 상대의 승인이 결정한다.
   */
  const onLink = useCallback(async (d: AccountDevice) => {
    const id = String(d.id);
    setLinkBusyId(id);
    setErr(null);
    try {
      await e2eeSvc.nudgeLink(Number(d.id));
      setLinkSent((prev) => new Set(prev).add(id));
    } catch (e: any) {
      setErr(e?.message || COPY.err.link);
    } finally { setLinkBusyId(null); }
  }, []);

  // (개정 6: onApprove/onDeny 삭제 — 승인은 시트(DeviceTrustHost)·알림 행·전역 카드의 일이다.)

  //  개정 7: 이 기기 / 다른 기기 분리. `isCurrent` 가 없는 응답도 있어 currentDeviceId 로 함께 판정한다.
  const isCurrentDevice = useCallback(
    (d: AccountDevice) => !!d.isCurrent || (S.currentDeviceId != null && d.id === S.currentDeviceId),
    [S.currentDeviceId],
  );
  const myDevices = useMemo(() => devices.filter(isCurrentDevice), [devices, isCurrentDevice]);
  const otherDevices = useMemo(() => devices.filter((d) => !isCurrentDevice(d)), [devices, isCurrentDevice]);

  const renderDeviceRow = useCallback((d: AccountDevice) => {
    const isCur = isCurrentDevice(d);
    const k = keyByDevice.get(String(d.id));
    //  연동 여부 = 그 기기가 계정 열쇠를 갖고 있는가(개정 6). 행별 암호화 배지는 삭제됐다.
    const linked = !!k || (isCur && st.ready);
    const sub = [osLabel(d), fmtRecent(d.lastSeenAt || d.createdAt)].filter(Boolean).join(' · ');
    return (
      <DeviceRow
        key={String(d.id)}
        icon={d.role === 'controller' ? <DeviceMobile size={14} color={C.textDim} /> : <Desktop size={14} color={C.textDim} />}
        name={d.name || '기기'}
        dim={!d.online}
        sub={linked ? sub : `${COPY.row.notLinked} · ${sub}`}
        //  연동 전 기기 = [연동] 로 승인 절차를 다시 시작한다(서버가 방향 판단 — nudge).
        //   자기 자신에는 두지 않는다: 자기를 자기가 승인할 수는 없다.
        onLink={!linked && !isCur && typeof d.id === 'number' ? () => void onLink(d) : undefined}
        linkBusy={linkBusyId === String(d.id)}
        linkSent={linkSent.has(String(d.id))}
        // 비가역 경고(회전)는 **열쇠를 가진 기기**를 지울 때만 — 열쇠 없는 기기는 다시 연결하면 된다
        armed={armKey === `dev:${d.id}` && !!k}
        busy={busyKey === `dev:${d.id}`}
        onDelete={typeof d.id === 'number' && !isCur ? () => void onDeleteDevice(d) : undefined}
      />
    );
  }, [isCurrentDevice, keyByDevice, st.ready, onLink, linkBusyId, linkSent, armKey, busyKey, onDeleteDevice]);

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
      {/*  행1 — 섹션 제목만. ★ 개정 7(2026-07-28 사용자 확정): self 배지(`열쇠 있음`)를 **없앴다** —
           원문 "android, ios 기기들에서 기기 열쇠 있음 표현을 왜 하고 있는 거야?! 굳이 사용자는 저런 거
           알 필요 없잖아?!". 열쇠는 연동을 만드는 내부 수단이고, 사용자에게 의미 있는 사실은 각 기기 행이
           말하는 **연동됨/연동 안 됨**이다. 행동이 필요한 상태(승인 대기·준비 중·실패)는 아래 행동 행이
           그대로 말한다. 자물쇠 아이콘의 accent 점등도 제거(§2.7 거짓 자물쇠 논의 자체가 사라졌다). */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
        <LockKey size={16} color={C.text3} />
        <Text style={{ flex: 1, color: C.text, fontSize: 13.5, fontWeight: '700' }}>{COPY.card.title}</Text>
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
        {/*  ★ 개정 6(2026-07-28 사용자 확정): **승인은 이 화면에서 하지 않는다.** 원문 — "기기 목록
             안에서 새 기기 승인을 처리하는 게 이상하지 않니? 승인하는 건 일시적으로 나타나는 거니까
             나눠야 할 것 같은데?" · "승인 같은 건 설정>계정에서 하려고 하지 말고 별도의 알림에서 바로
             승인 … 구글에서 다른 기기로 로그인했을 때 승인된 기기에서 알림이 뜨는 것처럼".
             → 이 행은 **사실 보고 + 사건 표면으로 가는 문**이다: 탭하면 승인 시트(DeviceTrustHost)가
             열린다. 인라인 승인 카드는 삭제했다(같은 사건을 두 화면에서 처리하면 어디를 눌러야 하나). */}
        {action === 'approve' ? (
          <PressableScale onPress={openDeviceTrustSheet} scaleTo={0.99} style={ROW}>
            <ShieldCheck size={15} color={C.text3} />
            <Text style={{ flex: 1, color: C.text, fontSize: 12.5, fontWeight: '700' }} numberOfLines={2}>{COPY.act.approve(S.trustRequests.length)}</Text>
            <CaretRight size={13} color={C.text3} />
          </PressableScale>
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

        {/*  ★ 개정 7(2026-07-28 사용자 확정): **이 기기와 다른 기기를 나눈다.** 원문 — "기기 목록에 이
             기기까지 표현하니까 보기도 안 좋고 복잡해지는 거 같은데! … 기기 목록에서는 이 기기는 안 보이게
             하고!" → 목록은 다른 기기 전용, 이 기기는 위에 한 줄. `이 기기` accent 배지도 함께 삭제
             (자리로 이미 구분된다 = 사용자가 지적한 과한 포인트 컬러). */}
        {devices.length === 0 ? (
          <Text style={{ color: C.textDim, fontSize: 12, paddingVertical: 9, borderTopWidth: 1, borderTopColor: C.border }}>불러오는 중…</Text>
        ) : (
          <>
            {myDevices.length ? <SubHead text={COPY.card.thisDevice} /> : null}
            {myDevices.map(renderDeviceRow)}
            <SubHead text={COPY.card.otherDevices} />
            {otherDevices.length || orphanKeys.length ? null : (
              <Text style={{ color: C.textDim, fontSize: 12, paddingVertical: 9 }}>{COPY.card.noOther}</Text>
            )}
            {otherDevices.map(renderDeviceRow)}
            {/*  기기 행에 붙지 않는 열쇠 — 삭제 경로를 잃지 않게 남긴다. 지문(🔒 숫자)은 표시하지 않는다
                 (사용자: "사용자들은 몰라도 되는 정보"). 정상 경로에서는 열쇠가 기기 행에 묶이므로
                 (back enroll 이 deviceId 를 받는다) 이 행 자체가 예외 상황이다. */}
            {orphanKeys.filter((k) => !(!!st.fingerprint && k.fingerprint === st.fingerprint)).map((k) => {
              const isPc = k.platform === 'darwin' || k.platform === 'win32' || k.platform === 'linux';
              return (
                <DeviceRow
                  key={`key:${k.deviceKeyId}`}
                  icon={isPc ? <Desktop size={14} color={C.textDim} /> : <DeviceMobile size={14} color={C.textDim} />}
                  name={k.label}
                  sub={COPY.row.wasLinked}
                  armed={armKey === `key:${k.deviceKeyId}`}
                  busy={busyKey === `key:${k.deviceKeyId}`}
                  onDelete={() => void onRevokeKey(k)}
                />
              );
            })}
          </>
        )}
      </View>
      {/* (★ 개정 4: `자세히` 섹션 통삭제 — 정책은 자동 고정, 안전 코드 대조는 승인 카드/대기 행에서만,
          복구 코드는 현 스코프에 지킬 저장 데이터가 없어 제거(서비스 API 는 존치), 메타 고지는 문서로.
          카피 감사 §3 개정 4 블록이 정본이다.) */}
    </View>
  );
}
