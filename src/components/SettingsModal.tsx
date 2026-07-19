import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Modal, Pressable, ScrollView, Switch, ActivityIndicator } from 'react-native';
import KeyTextInput from './keyboard/KeyTextInput';
import { KeyAssistOverlay } from './keyboard/KeyAssist';
import { useKeyboardOS, setKeyboardOS } from '../utils/keyboardOSSetting';
import { useKaTheme, setKaTheme, useKaKeySize, setKaKeySize, useKaPanelKeySize, setKaPanelKeySize } from './keyboard/keyAssistSettings';
import { useDisplayScale, setDisplayScale, DISPLAY_SCALE_PRESETS } from '../utils/displayScaleSetting';
import { useAutoCheckpointEnabled, setAutoCheckpointEnabled } from '../utils/autoCheckpointSetting';
import { useKeyAssistEnabled, setKeyAssistEnabled } from '../utils/keyAssistEnabledSetting';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GearSix, User as UserIc, Desktop, DeviceMobile, Cloud, X, MagnifyingGlass, Trash, DotsThree, CaretRight, CaretLeft } from 'phosphor-react-native';

import { v2 } from '../theme/v2Tokens';
import { useResponsive } from '../hooks/useResponsive';
import { useWorkspaceShell } from '../contexts/WorkspaceShellContext';
import { useUser } from '../contexts/UserContext';
import { useAuth } from '../contexts/AuthContext';
import { useAppAlert } from '../hooks/useAppAlert';
import { authService } from '../services/authService';
import daemonService, { AccountDevice } from '../services/daemonService';

const C = v2.colors;
const R = v2.radius;

type Section = 'general' | 'account' | 'about';
const NAV: { key: Section; label: string; icon: (c: string) => React.ReactNode }[] = [
  { key: 'general', label: '일반', icon: (c) => <GearSix size={18} color={c} /> },
  { key: 'account', label: '계정', icon: (c) => <UserIc size={18} color={c} /> },
  { key: 'about', label: '정보', icon: (c) => <Desktop size={18} color={c} /> },
];

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

// 최근 작업 시각 — 가까울수록 상대 표기(방금/분/시간), 하루 넘으면 날짜(직관 우선, PC 미러).
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

// ── 프레젠테이션 컴포넌트는 반드시 모듈 스코프에 둔다 ──
// (컴포넌트 내부에서 정의하면 렌더마다 새 함수 정체성이 생겨 서브트리가 언마운트/리마운트됨.
//  그 결과 Rail 안의 검색 TextInput 이 매 키 입력마다 리마운트되어 포커스를 잃고 "한 글자만 입력되는"
//  버그가 발생했음.)
const Card: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <View style={{ backgroundColor: C.elevated, borderWidth: 1, borderColor: C.border, borderRadius: R.md, padding: 14, marginBottom: 12 }}>{children}</View>
);
const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Text style={{ fontSize: 20, fontWeight: '800', color: C.text, marginBottom: 16 }}>{children}</Text>
);
// 세그먼트 토글(설정 행 우측) — 보조 키보드 설정 등 소수 옵션 선택용.
const Seg = <T extends string>({ value, options, onChange }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void }) => (
  <View style={{ flexDirection: 'row', backgroundColor: C.elevated2, borderRadius: R.sm, padding: 2, gap: 2 }}>
    {options.map((o) => (
      <Pressable
        key={o.v}
        onPress={() => onChange(o.v)}
        style={{ paddingHorizontal: 12, paddingVertical: 5, borderRadius: R.sm - 2, backgroundColor: value === o.v ? C.accent : 'transparent' }}
      >
        <Text style={{ fontSize: 12.5, fontWeight: '600', color: value === o.v ? '#fff' : C.text2 }}>{o.label}</Text>
      </Pressable>
    ))}
  </View>
);
// 설정 행(라벨 + 우측 컨트롤)
const Row: React.FC<{ label: string; children: React.ReactNode; last?: boolean }> = ({ label, children, last }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: last ? 0 : 1, borderBottomColor: C.border }}>
    <Text style={{ fontSize: 14, color: C.text }}>{label}</Text>
    {children}
  </View>
);

// rail(일반/계정/정보) — wide=세로 좌측(검색 포함), narrow=가로 상단 탭
type RailProps = {
  isWide: boolean;
  q: string;
  setQ: (v: string) => void;
  navItems: { key: Section; label: string; icon: (c: string) => React.ReactNode }[];
  section: Section;
  setSection: (s: Section) => void;
};
const Rail: React.FC<RailProps> = ({ isWide, q, setQ, navItems, section, setSection }) => (
  <View style={isWide
    ? { width: 190, borderRightWidth: 1, borderRightColor: C.border, paddingVertical: 14, paddingHorizontal: 10 }
    : { flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: C.border }}>
    {isWide ? (
      <>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.elevated2, borderRadius: R.sm, paddingHorizontal: 8, height: 34, marginBottom: 12 }}>
          <MagnifyingGlass size={14} color={C.textDim} />
          <KeyTextInput value={q} onChangeText={setQ} placeholder="검색" placeholderTextColor={C.textDim} style={{ flex: 1, color: C.text, fontSize: 13, padding: 0 }} autoCapitalize="none" autoCorrect={false} />
        </View>
        <Text style={{ fontSize: 11, color: C.textDim, fontWeight: '700', marginBottom: 6, paddingHorizontal: 6 }}>설정</Text>
      </>
    ) : null}
    {navItems.map((n) => {
      const active = n.key === section;
      return (
        <Pressable key={n.key} onPress={() => setSection(n.key)} style={isWide
          ? { flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 10, height: 38, borderRadius: R.sm, backgroundColor: active ? C.elevated2 : 'transparent' }
          : { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 36, borderRadius: R.sm, backgroundColor: active ? C.elevated2 : 'transparent', borderWidth: 1, borderColor: active ? C.borderControl : 'transparent' }}>
          {n.icon(active ? C.accent : C.textDim)}
          <Text style={{ fontSize: 13.5, color: active ? C.text : C.text2, fontWeight: active ? '700' : '500' }}>{n.label}</Text>
        </Pressable>
      );
    })}
  </View>
);

// 내 정보 = PC(codingpt_pc settings.js) 미러 설정 모달. 일반/계정/정보 3섹션.
//   iPad(wide)=2패널 카드(좌 rail + 우 content), 폰=상단 탭 + content.
export default function SettingsModal() {
  const insets = useSafeAreaInsets();
  const { isWide } = useResponsive();
  const S = useWorkspaceShell();
  const { user } = useUser();
  const { logout } = useAuth();
  const { alert } = useAppAlert();

  // narrow(폰)에서는 section=null → 마스터 목록(일반/계정/정보), 하나 선택하면 그 뎁스로 push.
  // wide(태블릿)에서는 좌측 rail 이 항상 보이므로 null 이면 '일반' 을 기본 표시.
  const [section, setSection] = useState<Section | null>(null);
  const [q, setQ] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false); // 탈퇴 확인 영역 펼침
  const [deleteEmail, setDeleteEmail] = useState('');        // 확인 문구 입력("회원탈퇴" 일치해야 실행)
  const [deleting, setDeleting] = useState(false);           // 탈퇴 처리 중(버튼 스피너)
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [confirmRevokeId, setConfirmRevokeId] = useState<number | null>(null);

  const open = S.settingsOpen;

  useEffect(() => {
    if (!open) { setSection(null); setQ(''); setConfirmDelete(false); setDeleteEmail(''); setDeleting(false); setConfirmLogout(false); setConfirmRevokeId(null); return; }
    S.loadMe();
    S.loadDevices();
  }, [open]);

  const me: any = S.me || user || {};
  const name = me.nickname || me.name || me.email || '사용자';
  const email = me.email || '';
  const initial = String(name).trim().charAt(0).toUpperCase();

  const navItems = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? NAV.filter((n) => n.label.toLowerCase().includes(s)) : NAV;
  }, [q]);

  // 인라인 2단계 확인 — SettingsModal 은 네이티브 Modal 이라, useAppAlert 의 확인창(ModalProvider 가
  // 앱 루트에서 렌더)이 이 모달 "뒤"에 떠서 안 보인다 → 클릭해도 반응이 없어 보였음(로그아웃 먹통 버그).
  // 회원탈퇴처럼 버튼 자체를 눌러 확인하는 방식으로 바꿔 중첩 모달 문제를 회피한다.
  const onLogout = useCallback(async () => {
    if (!confirmLogout) { setConfirmLogout(true); setTimeout(() => setConfirmLogout(false), 4000); return; }
    setConfirmLogout(false);
    S.closeSettings();
    await logout();
  }, [confirmLogout, logout, S]);

  // 탈퇴 = 이메일 일치 입력 확인 방식(파괴적 작업 가드, 사용자 확정 스펙).
  //  버튼 1탭 → 확인 영역 펼침(이메일 입력), 계정 이메일과 정확히 일치할 때만 "영구 삭제" 활성.
  const onDelete = useCallback(async () => {
    if (!confirmDelete) { setConfirmDelete(true); setDeleteEmail(''); return; }
    // UI 가드와 동일하게 확인 문구("회원탈퇴") 일치만 검사(과거엔 이메일을 검사해 문구를 넣어도 무반응이던 버그).
    if (deleteEmail.trim() !== '회원탈퇴') return;
    if (deleting) return;
    // id 는 user 또는 loadMe 로 채워진 S.me 에서 — 없으면 토큰 기반 daemon/account 로 탈퇴(확실히 처리).
    const uid = (user as any)?.id ?? (S.me as any)?.id ?? null;
    setDeleting(true);
    try {
      if (uid != null) await authService.deleteUser(Number(uid));
      else await daemonService.deleteAccount();
      setConfirmDelete(false);
      setDeleteEmail('');
      S.closeSettings();
      await logout();
    } catch (e: any) {
      alert({ title: '오류', message: e?.message || '회원 탈퇴 중 오류가 발생했어요.' });
    } finally {
      setDeleting(false);
    }
  }, [confirmDelete, deleteEmail, deleting, user, logout, alert, S]);

  // 기기 삭제도 인라인 2단계(같은 중첩 모달 회피). 첫 탭=무장(빨간 확인), 두번째 탭=삭제.
  const onRevoke = useCallback(async (d: AccountDevice) => {
    if (typeof d.id !== 'number') return;
    if (confirmRevokeId !== d.id) { setConfirmRevokeId(d.id); setTimeout(() => setConfirmRevokeId(null), 4000); return; }
    setConfirmRevokeId(null);
    try { await daemonService.revokeDevice(d.id); await S.loadDevices(); } catch (_) { /* noop */ }
  }, [confirmRevokeId, S]);

  // 보조 키보드(전역 특수키 패널/보조키바) 설정 — 모듈 레벨 상태와 실시간 공유.
  const kbOS = useKeyboardOS();
  const kaTheme = useKaTheme();
  const kaKeySize = useKaKeySize();
  const kaPanelKeySize = useKaPanelKeySize();
  // 기기별 표시 배율 — 터미널/에디터 폰트 크기(기기 로컬, 열려있는 모든 터미널·에디터 즉시 반영).
  const displayScale = useDisplayScale();
  const autoCkpt = useAutoCheckpointEnabled(); // 자동 체크포인트(기본 끔)
  const kaEnabled = useKeyAssistEnabled(); // 보조 키보드(기본 켬 — 외장 키보드 사용 시 끔)

  const renderContent = () => {
    const sec: Section = section ?? 'general';
    if (sec === 'general') {
      return (
        <>
          <SectionTitle>일반</SectionTitle>
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: C.elevated2, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border }}>
                <Text style={{ fontSize: 22, fontWeight: '700', color: C.accent }}>{initial}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: C.text }} numberOfLines={1}>{name}</Text>
                {email ? <Text style={{ fontSize: 12.5, color: C.textDim, marginTop: 2 }} numberOfLines={1}>{email}</Text> : null}
              </View>
            </View>
          </Card>
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 14, color: C.text }}>테마</Text>
              <Text style={{ fontSize: 13, color: C.textDim }}>다크</Text>
            </View>
          </Card>
          {/* 보조 키보드 — 전역 특수키 패널/보조키바(⌨︎) 설정 */}
          <Text style={{ fontSize: 13, fontWeight: '700', color: C.textDim, marginBottom: 8, marginTop: 4 }}>보조 키보드</Text>
          <Card>
            <Row label="보조 키보드 사용">
              <Switch
                value={kaEnabled}
                onValueChange={(v) => void setKeyAssistEnabled(v)}
                trackColor={{ false: C.borderControl, true: C.accent }}
                thumbColor="#fff"
              />
            </Row>
            <Row label="보조키 배치">
              <Seg value={kbOS} options={[{ v: 'win', label: 'Windows' }, { v: 'mac', label: 'Mac' }]} onChange={(v) => void setKeyboardOS(v)} />
            </Row>
            <Row label="배경 테마">
              <Seg value={kaTheme} options={[{ v: 'light', label: '라이트' }, { v: 'dark', label: '다크' }]} onChange={(v) => void setKaTheme(v)} />
            </Row>
            <Row label="보조키 크기">
              <Seg value={kaKeySize} options={[{ v: 'sm', label: '작게' }, { v: 'md', label: '보통' }, { v: 'lg', label: '크게' }]} onChange={(v) => void setKaKeySize(v)} />
            </Row>
            <Row label="특수키 패널 크기" last>
              <Seg value={kaPanelKeySize} options={[{ v: 'sm', label: '작게' }, { v: 'md', label: '보통' }, { v: 'lg', label: '크게' }]} onChange={(v) => void setKaPanelKeySize(v)} />
            </Row>
          </Card>
          {/* 화면 표시 — 터미널/에디터 폰트 표시 배율(기기 로컬). 작게=더 넓게, 크게=더 좁게 보임 */}
          <Text style={{ fontSize: 13, fontWeight: '700', color: C.textDim, marginBottom: 8, marginTop: 4 }}>화면 표시</Text>
          <Card>
            <Text style={{ fontSize: 14, color: C.text, marginBottom: 8 }}>터미널·에디터 배율</Text>
            {/* 5단계 프리셋 — 좁은 화면에서도 안 넘치게 라벨 아래 별도 줄 배치 */}
            <View style={{ flexDirection: 'row', alignSelf: 'flex-start' }}>
              <Seg
                value={String(displayScale)}
                options={DISPLAY_SCALE_PRESETS.map((p) => ({ v: String(p), label: p === 1 ? '1×' : `${p}×` }))}
                onChange={(v) => void setDisplayScale(parseFloat(v))}
              />
            </View>
            <Text style={{ fontSize: 11.5, color: C.textDim, marginTop: 8 }}>이 기기에서 터미널과 코드 에디터의 글자 크기에만 적용돼요. 작게 하면 더 넓게 보여요.</Text>
          </Card>
          {/* 작업 스냅샷 — 자동 체크포인트(기본 끔). 수동 스냅샷·핸드오프와는 무관 */}
          <Text style={{ fontSize: 13, fontWeight: '700', color: C.textDim, marginBottom: 8, marginTop: 4 }}>작업 스냅샷</Text>
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 14, color: C.text }}>자동 체크포인트</Text>
              <Switch
                value={autoCkpt}
                onValueChange={(v) => void setAutoCheckpointEnabled(v)}
                trackColor={{ false: C.borderControl, true: C.accent }}
                thumbColor="#fff"
              />
            </View>
            <Text style={{ fontSize: 11.5, color: C.textDim, marginTop: 8 }}>
              켜면 작업 중 주기적으로(및 워크스페이스 전환 시) 스냅샷을 자동 저장해요. 미푸시 작업 유실을 막아주지만 저장 공간을 조금 더 써요.
            </Text>
          </Card>
        </>
      );
    }
    if (sec === 'about') {
      return (
        <>
          <SectionTitle>정보</SectionTitle>
          <Card>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 }}>
              <Text style={{ fontSize: 14, color: C.text }}>버전</Text>
              <Text style={{ fontSize: 13, color: C.textDim }}>CodingPT 0.1.0</Text>
            </View>
          </Card>
        </>
      );
    }
    // account
    return (
      <>
        <SectionTitle>계정</SectionTitle>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border }}>
          <Text style={{ flex: 1, fontSize: 13.5, color: C.text2 }}>이 기기에서 로그아웃</Text>
          <Pressable onPress={onLogout} style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: R.sm, borderWidth: 1, borderColor: confirmLogout ? C.accent : C.borderControl, backgroundColor: C.elevated }}>
            <Text style={{ fontSize: 13, color: confirmLogout ? C.accent : C.text, fontWeight: '600' }}>{confirmLogout ? '정말 로그아웃?' : '로그아웃'}</Text>
          </Pressable>
        </View>
        <View style={{ paddingVertical: 12, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <Text style={{ flex: 1, fontSize: 12.5, color: C.textDim }}>회원 탈퇴 시 계정과 모든 데이터가 삭제되며 되돌릴 수 없습니다.</Text>
            {!confirmDelete ? (
              <Pressable onPress={onDelete} style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: R.sm, borderWidth: 1, borderColor: C.error }}>
                <Text style={{ fontSize: 13, color: C.error, fontWeight: '700' }}>회원 탈퇴</Text>
              </Pressable>
            ) : (
              <Pressable onPress={() => { setConfirmDelete(false); setDeleteEmail(''); }} style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: R.sm, borderWidth: 1, borderColor: C.borderControl }}>
                <Text style={{ fontSize: 13, color: C.text2, fontWeight: '600' }}>취소</Text>
              </Pressable>
            )}
          </View>
          {confirmDelete ? (() => {
            // "회원탈퇴" 문구 입력 가드 — 정확히 입력해야 "영구 삭제" 활성(파괴적 작업 확인).
            const match = deleteEmail.trim() === '회원탈퇴';
            return (
              <View style={{ gap: 8, padding: 12, borderRadius: R.md, borderWidth: 1, borderColor: C.error, backgroundColor: C.elevated }}>
                <Text style={{ fontSize: 12.5, color: C.text2 }}>
                  계속하려면 <Text style={{ color: C.text, fontWeight: '700' }}>회원탈퇴</Text> 를 입력하세요.
                </Text>
                <KeyTextInput
                  value={deleteEmail}
                  onChangeText={setDeleteEmail}
                  placeholder="회원탈퇴"
                  placeholderTextColor={C.textDim}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={{ borderWidth: 1, borderColor: match ? C.error : C.borderControl, borderRadius: R.sm, paddingHorizontal: 10, paddingVertical: 8, color: C.text, fontSize: 13.5 }}
                />
                <Pressable onPress={onDelete} disabled={!match || deleting}
                  style={{ height: 40, borderRadius: R.sm, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, backgroundColor: match ? C.error : C.elevated2, opacity: match ? (deleting ? 0.8 : 1) : 0.6 }}>
                  {deleting ? <ActivityIndicator size="small" color="#fff" /> : null}
                  <Text style={{ fontSize: 13.5, fontWeight: '700', color: match ? '#fff' : C.textDim }}>{deleting ? '탈퇴 처리 중…' : '영구 삭제'}</Text>
                </Pressable>
              </View>
            );
          })() : null}
        </View>

        <Text style={{ fontSize: 13, fontWeight: '700', color: C.text, marginTop: 18, marginBottom: 8 }}>내 기기</Text>
        <View style={{ borderWidth: 1, borderColor: C.border, borderRadius: R.md, overflow: 'hidden' }}>
          {/* header */}
          <View style={{ flexDirection: 'row', paddingVertical: 9, paddingHorizontal: 12, backgroundColor: C.elevated2 }}>
            <Text style={{ flex: 2, fontSize: 11, color: C.textDim, fontWeight: '700' }}>기기</Text>
            <Text style={{ flex: 1, fontSize: 11, color: C.textDim, fontWeight: '700' }}>운영체제</Text>
            <Text style={{ flex: 1, fontSize: 11, color: C.textDim, fontWeight: '700' }}>최근 작업</Text>
            <View style={{ width: 28 }} />
          </View>
          {S.devices.length === 0 ? (
            <Text style={{ color: C.textDim, fontSize: 12, padding: 14 }}>불러오는 중…</Text>
          ) : S.devices.map((d) => {
            const isCur = d.isCurrent || (S.currentDeviceId != null && d.id === S.currentDeviceId);
            const icon = d.runnerKind === 'cloud' ? <Cloud size={15} color={C.textDim} /> : d.role === 'controller' ? <DeviceMobile size={15} color={C.textDim} /> : <Desktop size={15} color={C.textDim} />;
            const canRevoke = d.runnerKind !== 'cloud' && typeof d.id === 'number' && !isCur;
            return (
              <View key={String(d.id)} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 11, paddingHorizontal: 12, borderTopWidth: 1, borderTopColor: C.border }}>
                <View style={{ flex: 2, flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  {icon}
                  {/* flexShrink — 긴 기기명이 배지/온라인점을 밀어내지 않고 말줄임 */}
                  <Text style={{ flexShrink: 1, color: C.text, fontSize: 13 }} numberOfLines={1}>{d.name || '기기'}</Text>
                  {isCur ? <View style={{ paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, backgroundColor: C.accentTint }}><Text style={{ fontSize: 9, color: C.accent, fontWeight: '700' }}>이 기기</Text></View> : null}
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: d.online ? C.accent : C.textDim }} />
                </View>
                <Text style={{ flex: 1, fontSize: 12, color: C.text2 }} numberOfLines={1}>{osLabel(d)}</Text>
                <Text style={{ flex: 1, fontSize: 11.5, color: C.textDim }} numberOfLines={1}>{fmtRecent(d.lastSeenAt || d.createdAt)}</Text>
                <View style={{ width: 28, alignItems: 'flex-end' }}>
                  {canRevoke ? (
                    <Pressable onPress={() => onRevoke(d)} hitSlop={8}><Trash size={15} color={confirmRevokeId === d.id ? C.error : C.textDim} weight={confirmRevokeId === d.id ? 'fill' : 'regular'} /></Pressable>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      </>
    );
  };

  const rail = (
    <Rail isWide={isWide} q={q} setQ={setQ} navItems={navItems} section={section ?? 'general'} setSection={setSection} />
  );

  // narrow 마스터 목록(일반/계정/정보) — 탭하면 그 뎁스로 push.
  const narrowMasterList = (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', height: 46, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: C.border }}>
        <Text style={{ flex: 1, fontSize: 16, fontWeight: '700', color: C.text }}>내 정보</Text>
        <Pressable onPress={S.closeSettings} hitSlop={8} style={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center' }}><X size={18} color={C.text2} /></Pressable>
      </View>
      <ScrollView contentContainerStyle={{ paddingVertical: 8 }}>
        {NAV.map((n, i) => (
          <Pressable key={n.key} onPress={() => setSection(n.key)} android_ripple={{ color: C.elevated2 }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 16, borderBottomWidth: i < NAV.length - 1 ? 1 : 0, borderBottomColor: C.border }}>
            {n.icon(C.text2)}
            <Text style={{ flex: 1, fontSize: 15.5, color: C.text }}>{n.label}</Text>
            <CaretRight size={16} color={C.textDim} />
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );

  // narrow 상세 뎁스 — 뒤로(←) + 섹션 제목 + 닫기(X).
  const narrowDetail = (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', height: 46, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: C.border }}>
        <Pressable onPress={() => setSection(null)} hitSlop={8} style={{ width: 38, height: 38, alignItems: 'center', justifyContent: 'center' }}><CaretLeft size={20} color={C.text2} /></Pressable>
        <Text style={{ flex: 1, fontSize: 16, fontWeight: '700', color: C.text }}>{NAV.find((n) => n.key === section)?.label ?? '내 정보'}</Text>
        <Pressable onPress={S.closeSettings} hitSlop={8} style={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center' }}><X size={18} color={C.text2} /></Pressable>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
        {renderContent()}
      </ScrollView>
    </View>
  );

  return (
    <Modal visible={open} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent supportedOrientations={['portrait', 'portrait-upside-down', 'landscape', 'landscape-left', 'landscape-right']} onRequestClose={S.closeSettings}>
      <View style={{ flex: 1, backgroundColor: 'rgba(5,7,12,0.68)', justifyContent: isWide ? 'center' : 'flex-start', alignItems: isWide ? 'center' : 'stretch', paddingTop: isWide ? 0 : insets.top }}>
        <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} onPress={S.closeSettings} />
        {isWide ? (
          <View style={{ width: '88%', maxWidth: 720, height: '80%', maxHeight: 560, backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.border, overflow: 'hidden', flexDirection: 'row' }}>
            {rail}
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', height: 46, paddingHorizontal: 12 }}>
                <Pressable onPress={S.closeSettings} hitSlop={8} style={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center' }}><X size={18} color={C.text2} /></Pressable>
              </View>
              <ScrollView contentContainerStyle={{ padding: 26, paddingTop: 30 }} keyboardShouldPersistTaps="handled">
                {renderContent()}
              </ScrollView>
            </View>
          </View>
        ) : (
          <View style={{ flex: 1, backgroundColor: C.base }}>
            {section === null ? narrowMasterList : narrowDetail}
          </View>
        )}
      </View>
      {/* 네이티브 Modal 윈도 안에도 전역 키보드 액세서리 오버레이 */}
      <KeyAssistOverlay inModal />
    </Modal>
  );
}
