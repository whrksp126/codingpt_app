import React, { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Desktop, DeviceMobile, Trash, CaretRight, WarningCircle, PencilSimple, CheckCircle, X, SealCheck } from 'phosphor-react-native';

import { v2 } from '../../theme/v2Tokens';
import PressableScale from '../ui/PressableScale';
import KeyTextInput from '../keyboard/KeyTextInput';
import { useWorkspaceShell } from '../../contexts/WorkspaceShellContext';
import e2eeSvc, { type TrustedDeviceKey } from '../../services/e2ee';
import { hostLockLabel, stateLabel } from '../../services/e2ee/e2eeState';
import hostLock from '../../services/e2ee/hostLock';
import daemonService, { type AccountDevice } from '../../services/daemonService';
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
/**
 * 섹션 카드 — ★ 개정 9(2026-07-28 사용자 확정): `이 기기` 와 `다른 기기` 는 **그룹(카드) 자체**다.
 *  원문 — "지금 기기 라는 그룹 안에 이 기기, 다른 기기를 나눠 둔 거 같은데! 이기기, 다른 기기로 그룹을
 *  나눠서 해주고". 개정 7 은 한 카드 안의 소제목이었는데, 카드 제목(`기기`)이 그 위에 또 있어서 계층이
 *  3겹(기기 > 이 기기 > 행)이었다 → 제목 `기기` 를 없애고 두 카드로 나눈다(계층 2겹).
 */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ borderWidth: 1, borderColor: C.border, borderRadius: R.md, padding: 14, gap: 4, marginTop: 18 }}>
      <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '700' }}>{title}</Text>
      {children}
    </View>
  );
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
  icon, name, dim, sub, linked, armed, busy, onDelete, onLink, linkBusy, linkSent, pending, onPress, entryOpen, onEntryClose,
  editable, editing, editValue, onEditValue, onEdit, onEditSave, onEditCancel,
}: {
  icon: React.ReactNode; name: string; dim?: boolean;
  sub?: string; linked?: boolean; armed?: boolean; busy?: boolean; onDelete?: () => void;
  //  개정 6: 연동 전 기기의 [연동] 버튼(승인 절차 재시작). 상태가 바뀌려면 상대 기기의 승인이
  //   필요하므로 누른 뒤에는 "요청 보냄" 으로 굳힌다(사실만 말한다 — 낙관적 '연동됨' 금지).
  onLink?: () => void; linkBusy?: boolean; linkSent?: boolean;
  //  ★ 개정 12: [연동] 을 누르면 **그 행 아래에서** 코드를 입력한다(모달 없음 — 대상이 이 행임이 분명하다).
  entryOpen?: boolean; onEntryClose?: () => void;
  //  ★ 개정 9: 그 기기가 **승인을 기다리는 중** — 행 자체가 미확인 알림이 된다(점 + 탭하면 승인 표면).
  pending?: boolean; onPress?: () => void;
  editable?: boolean; editing?: boolean; editValue?: string; onEditValue?: (v: string) => void;
  onEdit?: () => void; onEditSave?: () => void; onEditCancel?: () => void;
}) {
  //  대기 행은 **행 전체가 문**이다(탭 → 승인 표면). 행 컨테이너만 Pressable 로 바꿔 열 기하는 그대로 둔다
  //   (안쪽 일부만 감싸면 그 행의 열 경계가 다른 행과 어긋난다).
  const RowBox: any = onPress ? PressableScale : View;
  const rowProps = onPress ? { onPress, scaleTo: 0.99 } : {};
  return (
    <View>
      <RowBox style={ROW} {...rowProps}>
        {icon}
        {/* 이름 열 — 승인 대기면 이름 옆에 미확인 점(accent = 상태 신호 전용 규율) */}
        <View style={{ flex: 1.3, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {editing ? (
            <KeyTextInput value={editValue || ''} onChangeText={onEditValue} onSubmitEditing={onEditSave}
              autoFocus maxLength={40} selectTextOnFocus
              style={{ flex: 1, minWidth: 72, height: 30, paddingHorizontal: 8, paddingVertical: 0, borderWidth: 1, borderColor: C.borderControl, borderRadius: R.sm, color: C.text, fontSize: 12.5 }} />
          ) : <Text style={{ flexShrink: 1, color: dim ? C.textDim : C.text, fontSize: 12.5, fontWeight: dim ? '400' : '600' }} numberOfLines={1}>{name}</Text>}
          {linked ? <View accessible accessibilityLabel="인증된 기기"><SealCheck size={16} color={C.text2} weight="regular" /></View> : null}
          {pending ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.text3 }} /> : null}
          {editable && !editing ? <PressableScale onPress={onEdit} hitSlop={8} style={{ padding: 3 }}><PencilSimple size={13} color={C.textDim} /></PressableScale> : null}
          {editing ? <>
            <PressableScale onPress={onEditSave} hitSlop={6} style={{ padding: 2 }}><CheckCircle size={15} color={C.text2} /></PressableScale>
            <PressableScale onPress={onEditCancel} hitSlop={6} style={{ padding: 2 }}><X size={14} color={C.textDim} /></PressableScale>
          </> : null}
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
              {COPY.row.link}
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
          {/*  대기 행은 삭제 대신 진입 표시(>) — 행 전체가 승인 표면으로 가는 문이다. */}
          {!onDelete && onPress ? <CaretRight size={13} color={C.text3} /> : null}
        </View>
      </RowBox>
      {/* 비가역 경고는 **결정 순간**에만 — 열쇠를 가진 기기를 지울 때(= 세대 회전)만 뜬다.
          그 기기 행에 붙는 줄이므로 구분선을 다시 그리지 않는다(PC `.dev-tr-note` 와 같은 규칙) */}
      {armed ? (
        <View style={{ paddingBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 7 }}>
          <WarningCircle size={13} color={C.error} />
          <Text style={{ flex: 1, color: C.error, fontSize: 11.5, fontWeight: '600' }}>한 번 더 누르면 이 기기를 삭제합니다 · 되돌릴 수 없음</Text>
        </View>
      ) : null}
      {entryOpen ? <LinkCodeEntry onDone={onEntryClose} /> : null}
    </View>
  );
}

/**
 * 이 기기의 연동 코드 — `자세히 보기` 를 누르면 코드를 만들어 보여 준다(★ 개정 12).
 *  다른 기기가 이 코드를 입력하면 **그 자리에서** 열쇠가 전달된다(승인 화면 없음).
 *  ⚠ 코드는 3분 만료·1회용이다. 화면에는 남은 시간만 쓰고 설명은 한 줄로 끝낸다(텍스트 최소 규율).
 */
function MyLinkCode() {
  const [code, setCode] = useState<string | null>(null);
  const [until, setUntil] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!until) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [until]);
  const issue = useCallback(async () => {
    setBusy(true); setErr(null);
    try {
      const r = await e2eeSvc.linkStart();
      setCode(r.code); setUntil(Date.now() + r.ttlMs);
    } catch (e: any) { setErr(e?.message || COPY.err.link); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { void issue(); return () => { e2eeSvc.linkCancel(); }; }, [issue]);
  const left = Math.max(0, Math.floor((until - now) / 1000));
  const dead = !!code && left <= 0;
  return (
    <View style={{ paddingVertical: 10, borderTopWidth: 1, borderTopColor: C.border, gap: 8, alignItems: 'center' }}>
      <Text style={{ alignSelf: 'stretch', color: C.text3, fontSize: 12 }}>이 기기 인증 코드</Text>
          {busy ? <ActivityIndicator size="small" color={C.text3} /> : null}
          {code && !dead ? (
            <>
              <Text selectable style={{ color: C.text, fontSize: 26, fontWeight: '800', letterSpacing: 4 }}>{code}</Text>
              <Text style={{ color: C.textDim, fontSize: 11.5 }}>{COPY.link.myCodeHint} · {COPY.link.expiresIn(left)}</Text>
            </>
          ) : null}
          {dead ? (
            <PressableScale onPress={() => void issue()} style={{ paddingHorizontal: 12, height: 32, borderRadius: R.sm, borderWidth: 1, borderColor: C.borderControl, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: C.text2, fontSize: 12.5, fontWeight: '600' }}>{COPY.link.reissue}</Text>
            </PressableScale>
          ) : null}
          {err ? <Text style={{ color: C.error, fontSize: 11.5 }}>{err}</Text> : null}
    </View>
  );
}

/** 다른 기기의 코드를 입력해 이 기기를 연동한다(행 아래 인라인 — ★ 개정 12). */
function LinkCodeEntry({ onDone }: { onDone?: () => void }) {
  const [v, setV] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = useCallback(async () => {
    setBusy(true); setErr(null);
    try { await e2eeSvc.linkClaim(v); onDone?.(); }
    catch (e: any) { setErr(e?.message || COPY.err.link); }
    finally { setBusy(false); }
  }, [v, onDone]);
  return (
    <View style={{ paddingBottom: 10, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <KeyTextInput
          value={v}
          onChangeText={(t: string) => setV(t.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))}
          placeholder={COPY.link.placeholder}
          placeholderTextColor={C.textDim}
          autoCapitalize="characters"
          autoCorrect={false}
          style={{ flex: 1, borderWidth: 1, borderColor: C.borderControl, borderRadius: R.sm, paddingHorizontal: 10, paddingVertical: 8, color: C.text, fontSize: 15, letterSpacing: 2 }}
        />
        <PressableScale onPress={() => void submit()} disabled={busy || v.length !== 8} baseOpacity={busy || v.length !== 8 ? 0.5 : 1}
          style={{ paddingHorizontal: 14, height: 36, borderRadius: R.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: C.text }}>
          <Text style={{ color: C.base, fontSize: 12.5, fontWeight: '700' }}>{busy ? COPY.link.connecting : COPY.link.connect}</Text>
        </PressableScale>
      </View>
      {err ? <Text style={{ color: C.error, fontSize: 11.5 }}>{err}</Text> : null}
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
  //  ★ 개정 12: [연동] = 그 행 아래에서 코드 입력(구 nudge 방식은 승인 개념과 함께 폐기).
  const [entryFor, setEntryFor] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [keys, setKeys] = useState<TrustedDeviceKey[]>([]);
  const [armKey, setArmKey] = useState<string | null>(null); // 삭제 1탭(무장) 대상 행
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  // (개정 5: waitBusy 삭제 — 대기 행의 '승인됐는지 확인' 버튼이 없어졌다. 승인은 WS resolved 로 온다)

  // ★ 개정 4: 정책 '자동' 고정 — 구 UI 로 '끄기/항상' 을 저장한 기기의 탈출로(1회 복원).
  useEffect(() => {
    if (st.policy && st.policy !== 'preferred') void e2eeSvc.setPolicy('preferred');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.policy]);

  //  ★ 개정 11: 키링을 **한 번이라도 받기 전에는 [연동] 을 그리지 않는다**. 받기 전엔 모든 행이
  //   "열쇠 없음" 으로 보여 이미 연동된 PC 에도 버튼이 잠깐 떴다(거짓 어포던스 — 실측으로 확인).
  const [keysLoaded, setKeysLoaded] = useState(false);
  const loadKeys = useCallback(async () => {
    try { setKeys((await e2eeSvc.loadKeyring()).devices); } catch (_) { setKeys([]); }
    finally { setKeysLoaded(true); }
  }, []);
  useEffect(() => { void loadKeys(); }, [loadKeys, st.epoch, st.state]);
  // 연동은 다른 기기에서 끝난다. 완료 push를 받는 즉시 키링과 계정 기기를 함께 갱신해야
  // 설정을 닫았다 다시 열지 않아도 양쪽 화면의 인증 체크가 바로 나타난다.
  useEffect(() => e2eeSvc.addDeviceApprovalListener((ev) => {
    if (ev.kind !== 'link_claim' && ev.kind !== 'link_done' && ev.kind !== 'rotated') return;
    void loadKeys();
    void S.loadDevices();
  }), [loadKeys, S]);

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
    const waiting = false; // (개정 12: '승인 대기' 개념 폐기 — 연동은 코드 입력으로 즉시 끝난다)
    const sub = osLabel(d);
    return (
      <DeviceRow
        key={String(d.id)}
        icon={d.role === 'controller' ? <DeviceMobile size={14} color={C.textDim} /> : <Desktop size={14} color={C.textDim} />}
        name={d.name || '기기'}
        dim={false}
        //  ★ 개정 11(사용자 확정): 목록에 **연동됨/안 됨을 쓰지 않는다**("기기 목록에서 연동됨 안됨
        //   이런거 표현하지마!"). 할 일이 있는 상태(승인 대기)만 말하고 나머지는 최근 시각뿐이다.
        sub={sub}
        linked={linked}
        editable={isCur && typeof d.id === 'number'}
        editing={editingId === String(d.id)}
        editValue={editName}
        onEditValue={setEditName}
        onEdit={() => { setEditingId(String(d.id)); setEditName(d.name || ''); }}
        onEditCancel={() => setEditingId(null)}
        onEditSave={() => {
          const name = editName.trim();
          if (!name || typeof d.id !== 'number') return;
          setBusyKey(`dev:${d.id}`);
          void daemonService.renameOwnDevice(d.id, name)
            .then(() => S.loadDevices())
            .catch((e: any) => setErr(e?.message || '별칭을 저장하지 못했어요.'))
            .finally(() => { setBusyKey(null); setEditingId(null); });
        }}
        //  대기 중이면 행이 곧 문이다(승인 표면으로) — 그 행에는 [연동]·[🗑] 을 두지 않는다:
        //   이미 요청이 가 있으므로 다시 보낼 이유가 없고, 지금 할 일은 승인/거절 하나다.
        //  연동 전 기기 = [연동] 로 승인 절차를 다시 시작한다(서버가 방향 판단 — nudge).
        //   자기 자신에는 두지 않는다: 자기를 자기가 승인할 수는 없다.
        //  ★ 개정 11: [연동] 은 **PC(host) 행에만**. 연동을 요청하는 쪽은 모바일·다른 PC 이고,
        //   이 화면에서 누를 이유가 있는 대상은 PC 뿐이다(모바일 행의 [연동] 은 이득이 없다 — 사용자 지적).
        //  ★ 개정 12 정정: [연동] 은 **이 기기에 열쇠가 없을 때** 뜬다(그때 할 일 = 상대의 코드 입력).
        //   그리고 대상은 **열쇠를 가진 기기**여야 한다 — 열쇠 없는 기기끼리는 서로 줄 것이 없다.
        onLink={keysLoaded && !st.ready && !!k && !isCur && typeof d.id === 'number' ? () => setEntryFor(String(d.id)) : undefined}
        entryOpen={entryFor === String(d.id)}
        onEntryClose={() => setEntryFor(null)}
        // 비가역 경고(회전)는 **열쇠를 가진 기기**를 지울 때만 — 열쇠 없는 기기는 다시 연결하면 된다
        armed={armKey === `dev:${d.id}`}
        busy={busyKey === `dev:${d.id}`}
        onDelete={typeof d.id === 'number' && !isCur ? () => void onDeleteDevice(d) : undefined}
      />
    );
  }, [isCurrentDevice, keyByDevice, st.ready, keysLoaded, entryFor, armKey, busyKey, onDeleteDevice, editingId, editName, S]);

  // 행동 행 — **동시에 하나만**. 우선순위 = 이 기기가 대기 중 > 자동 켜는 중 > 업데이트.
  //  ★ 개정 4: 'bootstrapping' 행 신설 — 앱은 원래 열쇠 0개 계정을 자동으로 켠다(services/e2ee.ts ③).
  //   그 잠깐(수 초)을 빈 화면으로 두지 않고 진행을 말한다(PC settings.js 와 같은 행·같은 문구).
  //  ★ 개정 9: 'approve'(새 기기 N대가 승인을 기다려요) 는 **삭제**됐다 — 사용자 지적("이런 멘트는
  //   필요 없을 거 같은데?"). 그 사실은 이제 대기 중인 **기기 행**이 말한다(renderDeviceRow: 미확인 점 +
  //   `승인 대기` + 탭하면 승인 표면). 행동 행은 **이 기기 자신**의 상태만 다룬다 = `이 기기` 카드 소속.
  const action = useMemo(() => {
    if (st.state === 'bootstrap') return 'bootstrapping';
    if (st.storageMissing) return 'needUpdate';
    return null;
  }, [st.state, st.storageMissing]);

  /**  ★ 개정 9(2026-07-28 사용자 확정) — 화면은 **두 그룹**이다: `이 기기` · `다른 기기`.
   *   구 구성은 카드 제목 `기기` 안에 소제목 두 개(개정 7)였는데 계층이 3겹이었다 → 제목 `기기` 를
   *   없애고 카드로 나눈다. `이 기기` 카드는 이 기기 행 + 이 기기 자신의 상태(대기·준비 중·업데이트),
   *   `다른 기기` 카드는 목록 + 연동/승인 진입이다.
   *   ⚠ self 배지(`열쇠 있음`)·행별 암호화 배지·지문·'이 기기' 배지는 개정 7 에서 전량 삭제됐다 —
   *    되살리지 않는다(사용자: "굳이 사용자는 저런 거 알 필요 없잖아?!"). 판정 함수는 계약과 함께 존치.
   */
  return (
    <>
      <Section title={COPY.card.thisDevice}>
        {myDevices.map(renderDeviceRow)}

        {/* 배지가 초록이 아니고 **행동 행이 없을 때만** 사유 1줄(데몬·서버가 만든 문장이라 2줄 클램프).
            ★ 행동 행이 뜨는 상태에서는 그리지 않는다: reason 원문은 행동 행과 같은 사실을 더 길게
             (때로는 상충하게) 말해 '설명문 0줄' 이 무너진다. */}
        {label.tone !== 'on' && st.reason && !action ? (
          <Text style={{ color: C.textDim, fontSize: 11.5, lineHeight: 17, paddingTop: 8 }} numberOfLines={2}>{st.reason}</Text>
        ) : null}
        {err ? <Text style={{ color: C.error, fontSize: 11.5, paddingTop: 6 }}>{err}</Text> : null}

        {/* 이 기기가 승인을 기다리는 중(인라인, PC 와 같은 구성).
            `flat` = 표 안에서는 박스를 그리지 않는다(승인 시트에서는 그 화면의 유일한 내용이라 박스). */}
        {/*  ★ 개정 12(사용자 확정): 이 기기 영역의 `자세히 보기` = **이 기기의 연동 코드**.
             다른 기기가 이 코드를 입력하면 그 자리에서 연결된다(승인 절차 없음). */}
        {st.ready ? <MyLinkCode /> : null}

        {/* 자동 부트스트랩 진행(개정 4, 수 초짜리 과도 상태 — 버튼 없음) */}
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
      </Section>

      <Section title={COPY.card.otherDevices}>
        {devices.length === 0 ? (
          <Text style={{ color: C.textDim, fontSize: 12, paddingVertical: 9 }}>불러오는 중…</Text>
        ) : (
          <>
            {otherDevices.length || orphanKeys.length ? null : (
              <Text style={{ color: C.textDim, fontSize: 12, paddingVertical: 9 }}>{COPY.card.noOther}</Text>
            )}
            {otherDevices.map(renderDeviceRow)}
            {/*  기기 행에 붙지 않는 열쇠 — 삭제 경로를 잃지 않게 남긴다. 지문(🔒 숫자)은 표시하지 않는다
                 (사용자: "사용자들은 몰라도 되는 정보"). 정상 경로에서는 열쇠가 기기 행에 묶이므로
                 (back enroll 이 deviceId 를 받는다) 이 행 자체가 예외 상황이다. */}
            {/*  ★ 개정 11: 같은 이름의 기기 행이 이미 있으면 고아 열쇠 행을 **그리지 않는다** —
                 승인 직후 신청서에 deviceId 가 없던 경우 같은 폰이 2줄로 보였다(사용자 지적). */}
            {orphanKeys
              .filter((k) => !(!!st.fingerprint && k.fingerprint === st.fingerprint))
              .filter((k) => !devices.some((d) => String(d.name || '') === String(k.label || '')))
              .map((k) => {
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
      </Section>
      {/* (★ 개정 4: `자세히` 섹션 통삭제 — 정책은 자동 고정, 안전 코드 대조는 승인 카드/대기 행에서만,
          복구 코드는 현 스코프에 지킬 저장 데이터가 없어 제거(서비스 API 는 존치), 메타 고지는 문서로.
          카피 감사 §3 개정 4 블록이 정본이다.) */}
    </>
  );
}
