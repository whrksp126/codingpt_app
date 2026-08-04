import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Modal, Pressable, ScrollView, ActivityIndicator, Animated, Linking, Platform } from 'react-native';
import DeviceInfo from 'react-native-device-info';
import KeyTextInput from './keyboard/KeyTextInput';
import { KeyAssistOverlay } from './keyboard/KeyAssist';
import { BACK_URL } from '../utils/service';
import { useKeyboardOS, setKeyboardOS } from '../utils/keyboardOSSetting';
import { useKaTheme, setKaTheme, useKaKeySize, setKaKeySize, useKaPanelKeySize, setKaPanelKeySize } from './keyboard/keyAssistSettings';
import { useDisplayScale, setDisplayScale, DISPLAY_SCALE_PRESETS } from '../utils/displayScaleSetting';
import { useSilenceWhenPcActive, setSilenceWhenPcActive } from '../utils/phoneAlertSetting';
import lanLink from '../services/lanLink';
import { useCodeFont, setCodeFont, CODE_FONT_OPTIONS, CodeFont } from '../utils/fontSetting';
import { useTermScheme, setTermScheme } from '../utils/termSchemeSetting';
import { TERM_SCHEME_OPTIONS, termStylePalette, TermScheme } from '../theme/terminalSchemes';
import { useUiFont, setUiFont, UI_FONT_OPTIONS, UI_NATIVE_FAMILY, MONO_NATIVE_FAMILY, UiFont } from '../utils/uiFontSetting';
import { useTheme, ThemePreference } from '../contexts/ThemeContext';
import { api } from '../utils/api';
import { useKeyAssistEnabled, setKeyAssistEnabled } from '../utils/keyAssistEnabledSetting';
import { SafeAreaView } from 'react-native-safe-area-context';
import { User as UserIc, Desktop, X, MagnifyingGlass, CaretRight, CaretLeft, TerminalWindow, Sun, Moon, Bell, Link as LinkIcon, Palette, Keyboard, PuzzlePiece } from 'phosphor-react-native';

import { v2 } from '../theme/v2Tokens';
import { useResponsive } from '../hooks/useResponsive';
import { useWorkspaceShell } from '../contexts/WorkspaceShellContext';
import { useUser } from '../contexts/UserContext';
import { useAuth } from '../contexts/AuthContext';
import { useAppAlert } from '../hooks/useAppAlert';
import { authService } from '../services/authService';
import daemonService from '../services/daemonService';
import E2eeSettingsCard from './e2ee/E2eeSettingsCard';
import AgentsCard from './agents/AgentsCard';
import PressableScale from './ui/PressableScale';
import ShortcutSettings from './ShortcutSettings';
import PluginSettings from './PluginSettings';
import * as i18n from '../i18n/index.ts';
import { LANG_LABELS } from '../i18n/index.ts';
import { useLangSetting, setLangSetting, langOptions, deviceLang, type LangSetting } from '../utils/langSetting';

const C = v2.colors;
const R = v2.radius;

type Section = 'agents' | 'appearance' | 'shortcuts' | 'plugins' | 'notifications' | 'remote' | 'account' | 'about';

// 다른 화면(명령 팔레트의 "단축키 설정" 등)에서 특정 섹션으로 바로 들어오게 하는 통로.
//  모달은 항상 마운트돼 있고 `open` 으로만 켜지므로, 열릴 때 한 번 소비한다.
let pendingSection: Section | null = null;
export function requestSettingsSection(s: string) { pendingSection = s as Section; }
const NAV: { key: Section; label: string; group: string; keywords: string; icon: (c: string) => React.ReactNode }[] = [
  { key: 'agents', label: '에이전트', group: '작업 환경', keywords: 'AI CLI 설치 연결', icon: (c) => <TerminalWindow size={18} color={c} /> },
  { key: 'appearance', label: '화면 및 편집', group: '작업 환경', keywords: '테마 글꼴 터미널 키보드 배율 언어 language locale 다국어 영어 english 日本語 中文', icon: (c) => <Palette size={18} color={c} /> },
  { key: 'shortcuts', label: '단축키', group: '작업 환경', keywords: '키보드 keyboard shortcut 키 조합 팔레트 command palette 재바인딩', icon: (c) => <Keyboard size={18} color={c} /> },
  { key: 'plugins', label: '플러그인', group: '작업 환경', keywords: '마켓플레이스 marketplace 확장 extension 스킬 skill 저장한 명령 번역', icon: (c) => <PuzzlePiece size={18} color={c} /> },
  { key: 'notifications', label: '알림', group: '작업 환경', keywords: '완료 승인 요청 무음', icon: (c) => <Bell size={18} color={c} /> },
  { key: 'account', label: '계정 및 기기', group: '기기 연결', keywords: '프로필 로그인 암호화 기기 로그아웃 탈퇴', icon: (c) => <UserIc size={18} color={c} /> },
  { key: 'remote', label: 'PC 연결', group: '기기 연결', keywords: 'LAN Wi-Fi 직접 연결 서버', icon: (c) => <LinkIcon size={18} color={c} /> },
  { key: 'about', label: '앱 정보', group: '시스템', keywords: '버전 업데이트', icon: (c) => <Desktop size={18} color={c} /> },
];

// (기기 표기 헬퍼 osLabel/fmtRecent 는 `기기` 섹션과 함께 E2eeSettingsCard.tsx 로 이동했다 —
//  2026-07-27 통합. 이 모달에는 더 이상 기기 목록이 없다)

// semver 비교 — a 가 b 보다 높으면 true(업데이트 있음 판정용).
function isNewerVersion(a: string, b: string): boolean {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return false;
}

// ── 프레젠테이션 컴포넌트는 반드시 모듈 스코프에 둔다 ──
// (컴포넌트 내부에서 정의하면 렌더마다 새 함수 정체성이 생겨 서브트리가 언마운트/리마운트됨.
//  그 결과 Rail 안의 검색 TextInput 이 매 키 입력마다 리마운트되어 포커스를 잃고 "한 글자만 입력되는"
//  버그가 발생했음.)
const Card: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <View style={{ backgroundColor: C.elevated, borderWidth: 1, borderColor: C.border, borderRadius: R.lg, paddingHorizontal: 16, paddingVertical: 6, marginBottom: 16 }}>{children}</View>
);
const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Text style={{ fontSize: 12, fontWeight: '700', color: C.text3, marginBottom: 8, marginTop: 4 }}>{children}</Text>
);
// 세그먼트 토글(설정 행 우측) — 보조 키보드 설정 등 소수 옵션 선택용.
//  ★ 2026-07-28(사용자 확정, PC styles.css `.scale-opt.active` 미러): 선택 상태는 **무채색**이다.
//   "과한 포인트 컬러 사용은 AI 스러운 느낌" — accent 는 상태 신호(배지·점)에만 쓰고 세그·토글·버튼
//   같은 상호작용 요소에는 쓰지 않는다. 대비는 hover 톤 + 1px 테두리로 만든다(라이트 테마 보정).
//  `icon` 을 주면 글자 대신 아이콘을 그린다(테마 행 = [모니터][해][달] — 언어와 무관하고 더 좁다).
//   접근성은 accessibilityLabel 로 유지한다(아이콘만으로는 스크린리더가 못 읽는다).
const Seg = <T extends string>({ value, options, onChange }: {
  value: T;
  options: { v: T; label: string; icon?: (color: string) => React.ReactNode }[];
  onChange: (v: T) => void;
}) => (
  <View style={{ flexDirection: 'row', backgroundColor: C.elevated2, borderRadius: R.sm, padding: 2, gap: 2 }}>
    {options.map((o) => {
      const on = value === o.v;
      const fg = on ? C.text : C.text2;
      return (
        <PressableScale
          key={o.v}
          onPress={() => onChange(o.v)}
          accessibilityRole="radio"
          accessibilityLabel={o.label}
          accessibilityState={{ selected: on }}
          scaleTo={0.97}
          style={{
            minWidth: 34, minHeight: 32, paddingHorizontal: o.icon ? 10 : 12, paddingVertical: 5, borderRadius: R.sm - 1,
            alignItems: 'center', justifyContent: 'center',
            backgroundColor: on ? C.hover : 'transparent',
            borderWidth: 1, borderColor: on ? C.borderControl : 'transparent',
          }}
        >
          {o.icon ? o.icon(fg) : <Text style={{ fontSize: 12.5, fontWeight: '600', color: fg }}>{o.label}</Text>}
        </PressableScale>
      );
    })}
  </View>
);
// 커스텀 토글 — 네이티브 Switch 는 iOS/Android 렌더가 제각각(iOS 는 크고 둥근 캡슐, 트랙색 지정이
//   비활성 상태에서 이상하게 보임)이라 두 플랫폼에서 동일한 모양이 나오도록 직접 그린다. Android 머티리얼
//   느낌(트랙+흰 썸, translateX 애니메이션)으로 통일.
const Toggle: React.FC<{ value: boolean; onValueChange: (v: boolean) => void }> = ({ value, onValueChange }) => {
  const anim = useRef(new Animated.Value(value ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: value ? 1 : 0, duration: 160, useNativeDriver: false }).start();
  }, [value, anim]);
  //  켜짐 트랙도 무채색이다(PC `.tgl:checked{background:var(--text2)}` 미러 — 2026-07-28 색 규율).
  const trackColor = anim.interpolate({ inputRange: [0, 1], outputRange: [C.borderControl, C.text2] });
  const tx = anim.interpolate({ inputRange: [0, 1], outputRange: [2, 20] });
  return (
    <PressableScale
      onPress={() => onValueChange(!value)}
      hitSlop={8}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      scaleTo={0.96}
    >
      <Animated.View style={{ width: 44, height: 26, borderRadius: 13, backgroundColor: trackColor, justifyContent: 'center' }}>
        <Animated.View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff', transform: [{ translateX: tx }], shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 2 }} />
      </Animated.View>
    </PressableScale>
  );
};
// PC 설정과 통일된 "미리보기 드롭다운" — 현재 값 버튼 → 펼침 목록(옵션을 실제 그 글꼴로 렌더 + 샘플).
const DropRow = <T extends string>({ label, value, options, onChange, last }: {
  label: string; value: T;
  options: { v: T; label: string; family?: string; sample?: string }[];
  onChange: (v: T) => void; last?: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const cur = options.find((o) => o.v === value) || options[0];
  return (
    <View style={{ paddingVertical: 8, borderBottomWidth: last ? 0 : 1, borderBottomColor: C.border }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 14, color: C.text }}>{label}</Text>
        <PressableScale
          onPress={() => setOpen(!open)}
          accessibilityRole="button"
          accessibilityLabel={`${label}, 현재 ${cur.label}`}
          accessibilityState={{ expanded: open }}
          scaleTo={0.98}
          style={{ minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: C.borderControl, backgroundColor: C.elevated2 }}
        >
          <Text style={{ fontSize: 13, fontWeight: '600', color: C.text, fontFamily: cur.family }}>{cur.label}</Text>
          <Text style={{ fontSize: 10, color: C.textDim }}>{open ? '▴' : '▾'}</Text>
        </PressableScale>
      </View>
      {open ? (
        <View style={{ marginTop: 10, borderWidth: 1, borderColor: C.borderControl, borderRadius: 10, overflow: 'hidden', backgroundColor: C.elevated }}>
          {options.map((o, i) => (
            <PressableScale
              key={o.v}
              onPress={() => { onChange(o.v); setOpen(false); }}
              accessibilityRole="radio"
              accessibilityState={{ selected: o.v === value }}
              scaleTo={0.99}
              style={{ minHeight: 44, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: o.v === value ? C.hover : 'transparent', borderTopWidth: i ? 1 : 0, borderTopColor: C.border }}
            >
              <Text style={{ fontSize: 14, fontWeight: '700', color: C.text, fontFamily: o.family }}>{o.label}</Text>
              {o.sample ? <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 13, color: C.text3, fontFamily: o.family }}>{o.sample}</Text> : null}
            </PressableScale>
          ))}
        </View>
      ) : null}
    </View>
  );
};
// 터미널 스타일 카드(라디오) — "진짜 터미널에 보이는 모습"(파워라인 프롬프트·claude·diff)을
//  실제 팔레트로 재현한 미리보기(PC settings.js 미러). 세그먼트 글자색은 배경 밝기에 따라 자동
//  (실제 xterm 의 최소 대비 보정과 같은 결).
const __lum = (hex?: string) => {
  const m = /^#?([0-9a-f]{6})/i.exec(hex || '');
  if (!m) return 0;
  const n = parseInt(m[1], 16);
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
};
const __onColor = (bg?: string) => (__lum(bg) < 150 ? '#F4F6FA' : '#15181E');
const SEG_H = 18;
const Tri: React.FC<{ color: string }> = ({ color }) => (
  <View style={{ width: 0, height: 0, borderTopWidth: SEG_H / 2, borderBottomWidth: SEG_H / 2, borderLeftWidth: 7, borderTopColor: 'transparent', borderBottomColor: 'transparent', borderLeftColor: color }} />
);
const TermStyleCards = ({ value, onChange, variant }: { value: TermScheme; onChange: (v: TermScheme) => void; variant: 'dark' | 'light' }) => {
  const mono = MONO_NATIVE_FAMILY.default;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      {TERM_SCHEME_OPTIONS.map((o) => {
        const p = termStylePalette(o.v, variant);
        const sel = o.v === value;
        const seg1 = '#3A4150'; // p10k 기본 세그먼트(256색 회색) — 실제 프롬프트가 쓰는 색 재현
        const seg2 = p.blue || '#61AFEF';
        return (
          <PressableScale
            key={o.v}
            onPress={() => onChange(o.v)}
            accessibilityRole="radio"
            accessibilityLabel={o.label}
            accessibilityState={{ selected: sel }}
            scaleTo={0.98}
            style={{ width: '47%', minWidth: 140 }}
          >
            {/* 타이틀(위) → 미리보기(중간) → 동그라미 라디오(하단 중앙) */}
            <Text style={{ fontSize: 12.5, fontWeight: sel ? '700' : '600', color: sel ? C.text : C.text2, marginBottom: 8 }}>{o.label}</Text>
            <View style={{ backgroundColor: p.background, borderRadius: 10, borderWidth: 1, borderColor: C.borderControl, paddingHorizontal: 11, paddingTop: 10, paddingBottom: 14, gap: 5, overflow: 'hidden' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ height: SEG_H, justifyContent: 'center', paddingHorizontal: 7, backgroundColor: seg1 }}>
                  <Text style={{ fontFamily: mono, fontSize: 10, color: __onColor(seg1) }}>user@mac</Text>
                </View>
                <View style={{ backgroundColor: seg2 }}><Tri color={seg1} /></View>
                <View style={{ height: SEG_H, justifyContent: 'center', paddingHorizontal: 7, backgroundColor: seg2 }}>
                  <Text style={{ fontFamily: mono, fontSize: 10, color: __onColor(seg2) }}>~/project</Text>
                </View>
                <Tri color={seg2} />
              </View>
              <Text numberOfLines={1} style={{ fontFamily: mono, fontSize: 11, color: p.foreground }}>
                claude <Text style={{ opacity: 0.75 }}>{i18n.t('코드 설명해줘')}</Text>
              </Text>
            </View>
            <View style={{ alignSelf: 'center', width: 17, height: 17, borderRadius: 9, borderWidth: 1.5, borderColor: sel ? C.text2 : C.borderControl, alignItems: 'center', justifyContent: 'center', marginTop: 8 }}>
              {sel ? <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: C.text2 }} /> : null}
            </View>
          </PressableScale>
        );
      })}
    </View>
  );
};
// 설정 행(라벨 + 우측 컨트롤)
const Row: React.FC<{ label: string; description?: string; children: React.ReactNode; last?: boolean }> = ({ label, description, children, last }) => (
  <View style={{ minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, paddingVertical: 10, borderBottomWidth: last ? 0 : 1, borderBottomColor: C.border }}>
    <View style={{ flex: 1, gap: 3 }}>
      <Text style={{ fontSize: 14, fontWeight: '500', color: C.text }}>{label}</Text>
      {description ? <Text style={{ fontSize: 11.5, lineHeight: 16, color: C.textDim }}>{description}</Text> : null}
    </View>
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
          <KeyTextInput value={q} onChangeText={setQ} placeholder={i18n.t('검색')} placeholderTextColor={C.textDim} style={{ flex: 1, color: C.text, fontSize: 13, padding: 0 }} autoCapitalize="none" autoCorrect={false} />
        </View>
        <Text style={{ fontSize: 11, color: C.textDim, fontWeight: '700', marginBottom: 6, paddingHorizontal: 6 }}>{i18n.t('설정')}</Text>
      </>
    ) : null}
    {navItems.map((n) => {
      const active = n.key === section;
      return (
        <PressableScale key={n.key} onPress={() => setSection(n.key)} accessibilityRole="tab" accessibilityState={{ selected: active }} scaleTo={0.98} style={isWide
          ? { flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 10, height: 40, borderRadius: R.sm, backgroundColor: active ? C.elevated2 : 'transparent', borderWidth: 1, borderColor: active ? C.border : 'transparent' }
          : { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 36, borderRadius: R.sm, backgroundColor: active ? C.elevated2 : 'transparent', borderWidth: 1, borderColor: active ? C.borderControl : 'transparent' }}>
          {n.icon(active ? C.text : C.textDim)}
          <Text style={{ fontSize: 13.5, color: active ? C.text : C.text2, fontWeight: active ? '700' : '500' }}>{i18n.t(n.label)}</Text>
        </PressableScale>
      );
    })}
  </View>
);

// 내 정보 = PC(codingpt_pc settings.js) 미러 설정 모달. 일반/계정/정보 3섹션.
//   iPad(wide)=2패널 카드(좌 rail + 우 content), 폰=상단 탭 + content.
export default function SettingsModal() {
  const { isWide } = useResponsive();
  const S = useWorkspaceShell();
  const { loadMe, loadDevices } = S;
  const { user, refreshUser } = useUser();
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
  const [nick, setNick] = useState('');          // 닉네임 입력(프로필 편집, PC 미러)
  const [nickSaving, setNickSaving] = useState(false);
  // 업데이트 확인(PC 미러 흐름): 확인 → 최신 버전이 더 높으면 '업데이트' 버튼으로 전환 → 스토어 이동.
  const [updState, setUpdState] = useState<'idle' | 'checking' | 'latest' | 'available'>('idle');
  const [updUrl, setUpdUrl] = useState('');
  const curVersion = DeviceInfo.getVersion();

  const open = S.settingsOpen;
  // 팔레트에서 "단축키 설정"으로 들어오면 그 섹션으로 바로 연다(열릴 때 1회 소비).
  useEffect(() => {
    if (open && pendingSection) { setSection(pendingSection); pendingSection = null; }
  }, [open]);

  useEffect(() => {
    if (!open) { setSection(null); setQ(''); setConfirmDelete(false); setDeleteEmail(''); setDeleting(false); setConfirmLogout(false); setUpdState('idle'); setUpdUrl(''); return; }
    loadMe();
    loadDevices();
  }, [open, loadMe, loadDevices]);

  const me: any = S.me || user || {};
  const name = me.nickname || me.name || me.email || i18n.t('사용자');
  const email = me.email || '';
  const initial = String(name).trim().charAt(0).toUpperCase();

  // 프로필 열릴 때 현재 닉네임으로 입력 시드(사용자가 편집하지 않은 동안만 서버 값에 동기화).
  useEffect(() => { if (open) setNick(me.nickname || ''); }, [open, me.nickname]);
  const nickDirty = nick.trim() !== (me.nickname || '') && nick.trim().length > 0;
  const saveNick = useCallback(async () => {
    const v = nick.trim();
    if (!v || v === (me.nickname || '') || nickSaving) return;
    setNickSaving(true);
    try { await daemonService.updateNickname(v); await refreshUser(); }
    catch (e: any) { alert({ title: i18n.t('오류'), message: e?.message || i18n.t('닉네임 저장에 실패했어요.') }); }
    finally { setNickSaving(false); }
  }, [nick, me.nickname, nickSaving, refreshUser, alert]);

  // 업데이트 자동 확인 — back 에서 최신 스토어 버전 조회 후 현재 버전과 비교(클릭 불필요).
  const runUpdateCheck = useCallback(async () => {
    setUpdState('checking');
    try {
      const platform = Platform.OS === 'ios' ? 'ios' : 'android';
      const res = await fetch(`${BACK_URL}/api/app/version?platform=${platform}`);
      const json = await res.json();
      const d = json?.data ?? json;
      const latest = String(d?.version || '');
      const url = String(d?.url || '');
      if (latest && isNewerVersion(latest, curVersion)) { setUpdUrl(url); setUpdState('available'); }
      else setUpdState('latest');
    } catch (_) { setUpdState('latest'); } // 확인 실패(스토어 미게시/네트워크)는 조용히 최신으로
  }, [curVersion]);
  // 설정 열릴 때 자동 확인(사용자가 '확인' 누를 필요 없이).
  useEffect(() => { if (open) runUpdateCheck(); }, [open, runUpdateCheck]);

  const navItems = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? NAV.filter((n) => `${i18n.t(n.label)} ${i18n.t(n.group)} ${n.label} ${n.group} ${n.keywords}`.toLowerCase().includes(s)) : NAV;
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
      alert({ title: i18n.t('오류'), message: e?.message || i18n.t('회원 탈퇴 중 오류가 발생했어요.') });
    } finally {
      setDeleting(false);
    }
  }, [confirmDelete, deleteEmail, deleting, user, logout, alert, S]);

  // (기기 삭제 2탭은 `기기` 섹션 = E2eeSettingsCard 로 이동했다 — 그 행이 열쇠 해제/세대 회전까지
  //  함께 처리해야 하므로 목록과 같은 곳에 있어야 한다)

  // 보조 키보드(전역 특수키 패널/보조키바) 설정 — 모듈 레벨 상태와 실시간 공유.
  const kbOS = useKeyboardOS();
  const kaTheme = useKaTheme();
  const kaKeySize = useKaKeySize();
  const kaPanelKeySize = useKaPanelKeySize();
  // 기기별 표시 배율 — 터미널/에디터 폰트 크기(기기 로컬, 열려있는 모든 터미널·에디터 즉시 반영).
  const displayScale = useDisplayScale();
  const silencePc = useSilenceWhenPcActive(); // PC 사용 중 이 폰 무음(기본 켬)
  // LAN 직결 토글(기기 로컬, 기본 켬) — AsyncStorage 'cpt.lanDirect'. 실제 경로 판정은 lanLink 가 한다.
  const [lanDirect, setLanDirect] = useState(lanLink.isEnabled());
  useEffect(() => { void lanLink.loadEnabled().then(setLanDirect); }, []);
  const kaEnabled = useKeyAssistEnabled(); // 보조 키보드(기본 켬 — 외장 키보드 사용 시 끔)
  const { theme, setTheme, resolvedScheme } = useTheme(); // 앱 테마 — 전환은 페이드+전체 리마운트
  const uiFont = useUiFont(); // 인터페이스 글꼴(계정 동기화)
  const langSetting = useLangSetting(); // 화면 언어(계정 동기화)
  const codeFont = useCodeFont(); // 코드·터미널 글꼴(터미널 xterm + IDE 에디터, 기기 로컬)
  const termScheme = useTermScheme(); // 터미널 컬러 스킴(터미널 전용 팔레트, 기기 로컬)

  const renderContent = () => {
    const sec: Section = section ?? 'appearance';
    if (sec === 'agents') {
      // 연결된 PC 의 AI 에이전트 — 감지·연동 토글·설치까지 전부 폰에서 조작 가능(사용자 확정 2026-07-27).
      //  "어차피 폰에서 내 PC 터미널에 명령 입력할 수 있으니" — 설치도 그 터미널에서 눈에 보이게 돈다.
      return (
        <>
          <Card>
            <AgentsCard host={null} />
          </Card>
        </>
      );
    }
    if (sec === 'plugins') {
      // 설치는 **그 워크스페이스의 호스트 PC** 에서 벌어진다(플러그인은 그 PC 에 놓인다).
      return <PluginSettings host={S.activeWs()?.hostDeviceId ?? null} />;
    }
    if (sec === 'shortcuts') {
      // 명령 팔레트의 목록과 **같은 표**(palette/commands.ts)를 그린다 — 표에 줄을 더하면 두 곳에
      //  동시에 나타난다.
      return (
        <Card>
          <ShortcutSettings />
        </Card>
      );
    }
    if (sec === 'appearance') {
      return (
        <>
          {/* 모양 — 테마 + 인터페이스 글꼴/코드·터미널 글꼴(미리보기 드롭다운) + 터미널 스타일(미리보기 카드).
              글꼴·터미널 스타일은 계정 전체 동기화(PC settings.js 와 목록/값 통일). */}
          <Card>
            {/* 언어 — 계정 전체 동기화. 'system' 이 기본값이다(한국어를 박아 두면 해외 사용자가
                읽을 수 없는 화면에서 설정을 찾아 들어가야 한다). 목록의 이름은 그 언어 자신의 표기라
                번역하지 않는다 — 영어로 "Japanese" 라고 쓰면 일본어 쓰는 사람이 못 찾는다. */}
            <DropRow
              label={i18n.t('언어')}
              value={langSetting}
              options={langOptions().map((o) => ({
                v: o.value,
                label: o.value === 'system' ? i18n.t('시스템 언어') : o.label,
                sample: o.value === 'system' ? LANG_LABELS[deviceLang()] : '',
              }))}
              onChange={(v: LangSetting) => void setLangSetting(v)}
            />
            <Row label={i18n.t('테마')}>
              {/* 아이콘 세그(PC 미러) — 글자 3개보다 좁고 언어와 무관하다(사용자 요구 2026-07-28) */}
              <Seg
                value={theme}
                options={[
                  { v: 'system' as ThemePreference, label: i18n.t('시스템'), icon: (c) => <Desktop size={15} color={c} /> },
                  { v: 'light' as ThemePreference, label: i18n.t('라이트'), icon: (c) => <Sun size={15} color={c} /> },
                  { v: 'dark' as ThemePreference, label: i18n.t('다크'), icon: (c) => <Moon size={15} color={c} /> },
                ]}
                onChange={(v) => void setTheme(v)}
              />
            </Row>
            <DropRow
              label={i18n.t('인터페이스 글꼴')}
              value={uiFont}
              options={UI_FONT_OPTIONS.map((o) => ({ ...o, family: UI_NATIVE_FAMILY[o.v], sample: i18n.t('한글과 English 123') }))}
              onChange={(v: UiFont) => void setUiFont(v)}
            />
            <DropRow
              label={i18n.t('코드·터미널 글꼴')}
              value={codeFont}
              options={CODE_FONT_OPTIONS.map((o) => ({ ...o, family: MONO_NATIVE_FAMILY[o.v], sample: i18n.t('const 한글 = i => 0;') }))}
              onChange={(v: CodeFont) => void setCodeFont(v)}
            />
            <Text style={{ fontSize: 14, color: C.text, marginTop: 12, marginBottom: 10 }}>{i18n.t('터미널 스타일')}</Text>
            <TermStyleCards value={termScheme} onChange={(v) => void setTermScheme(v)} variant={resolvedScheme} />
            <Text style={{ fontSize: 11.5, color: C.textDim, marginTop: 10 }}>{i18n.t('글꼴·터미널 스타일은 계정의 모든 기기(PC·모바일)에 함께 적용돼요. 터미널 스타일은 테마(다크/라이트)에 맞는 변형이 자동 선택돼요.')}</Text>
          </Card>
          {/* 보조 키보드 — 전역 특수키 패널/보조키바(⌨︎) 설정 */}
          <SectionTitle>{i18n.t('보조 키보드')}</SectionTitle>
          <Card>
            <Row label={i18n.t('보조 키보드 사용')}>
              <Toggle value={kaEnabled} onValueChange={(v) => void setKeyAssistEnabled(v)} />
            </Row>
            <Row label={i18n.t('보조키 배치')}>
              <Seg value={kbOS} options={[{ v: 'win', label: 'Windows' }, { v: 'mac', label: 'Mac' }]} onChange={(v) => void setKeyboardOS(v)} />
            </Row>
            <Row label={i18n.t('배경 테마')}>
              <Seg value={kaTheme} options={[{ v: 'light', label: i18n.t('라이트') }, { v: 'dark', label: i18n.t('다크') }]} onChange={(v) => void setKaTheme(v)} />
            </Row>
            <Row label={i18n.t('보조키 크기')}>
              <Seg value={kaKeySize} options={[{ v: 'sm', label: i18n.t('작게') }, { v: 'md', label: i18n.t('보통') }, { v: 'lg', label: i18n.t('크게') }]} onChange={(v) => void setKaKeySize(v)} />
            </Row>
            <Row label={i18n.t('특수키 패널 크기')} last>
              <Seg value={kaPanelKeySize} options={[{ v: 'sm', label: i18n.t('작게') }, { v: 'md', label: i18n.t('보통') }, { v: 'lg', label: i18n.t('크게') }]} onChange={(v) => void setKaPanelKeySize(v)} />
            </Row>
          </Card>
          {/* 화면 표시 — 터미널/에디터 폰트 표시 배율(기기 로컬). 작게=더 넓게, 크게=더 좁게 보임 */}
          <SectionTitle>{i18n.t('화면 표시')}</SectionTitle>
          <Card>
            <Text style={{ fontSize: 14, color: C.text, marginBottom: 8 }}>{i18n.t('터미널·에디터 배율')}</Text>
            {/* 5단계 프리셋 — 좁은 화면에서도 안 넘치게 라벨 아래 별도 줄 배치 */}
            <View style={{ flexDirection: 'row', alignSelf: 'flex-start' }}>
              <Seg
                value={String(displayScale)}
                options={DISPLAY_SCALE_PRESETS.map((p) => ({ v: String(p), label: p === 1 ? '1×' : `${p}×` }))}
                onChange={(v) => void setDisplayScale(parseFloat(v))}
              />
            </View>
            <Text style={{ fontSize: 11.5, color: C.textDim, marginTop: 8 }}>{i18n.t('이 기기에서 터미널과 코드 에디터의 글자 크기에만 적용돼요. 작게 하면 더 넓게 보여요.')}</Text>
          </Card>
          {/* 작업 스냅샷(자동 체크포인트) UI 는 MVP 범위 제외로 잠정 숨김(2026-07-21 결정).
              엔진(데몬 sync·back·클라우드 핸드오프)은 보존 — 되살리려면 이 섹션과
              IdeProjectContext 의 useDaemonAutoCheckpoint 배선을 이전 커밋에서 복원. */}
        </>
      );
    }
    if (sec === 'notifications') {
      return (
        <>
          <SectionTitle>{i18n.t('알림 동작')}</SectionTitle>
          <Card>
            <Row label={i18n.t('PC 사용 중일 땐 이 기기 무음')} description={i18n.t('PC 앱을 보고 있을 때는 PC에서만 알리고, 자리를 비우면 이 기기로 알려줘요.')} last>
              <Toggle value={silencePc} onValueChange={(v) => { void setSilenceWhenPcActive(v); void api.push.setPreferences(!v); }} />
            </Row>
          </Card>
        </>
      );
    }
    if (sec === 'remote') {
      return (
        <>
          <SectionTitle>{i18n.t('연결 방식')}</SectionTitle>
          <Card>
            <Row label={i18n.t('같은 Wi-Fi에서 PC와 직접 연결')} description={i18n.t('가능하면 PC와 직접 연결하고, 연결할 수 없으면 자동으로 서버를 경유해요.')} last>
              <Toggle value={lanDirect} onValueChange={(v) => { setLanDirect(v); void lanLink.setEnabled(v); }} />
            </Row>
          </Card>
        </>
      );
    }
    if (sec === 'about') {
      return (
        <>
          <Card>
            <Row label={i18n.t('버전')}>
              <Text style={{ fontSize: 13, color: C.textDim }}>CodingPT {curVersion}</Text>
            </Row>
            {/* 업데이트 = 열리면 자동 확인. 새 버전 있으면 [업데이트] 버튼(→스토어), 없으면 '최신 버전입니다' */}
            <Row label={i18n.t('업데이트')} last>
              {updState === 'available' ? (
                <PressableScale onPress={() => { if (updUrl) Linking.openURL(updUrl).catch(() => {}); }}
                  style={{ paddingHorizontal: 16, height: 36, borderRadius: R.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: C.text }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: C.base }}>{i18n.t('업데이트')}</Text>
                </PressableScale>
              ) : updState === 'checking' ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <ActivityIndicator size="small" color={C.textDim} />
                  <Text style={{ fontSize: 12.5, color: C.textDim }}>{i18n.t('확인 중…')}</Text>
                </View>
              ) : (
                <Text style={{ fontSize: 12.5, color: C.textDim }}>{i18n.t('최신 버전입니다')}</Text>
              )}
            </Row>
          </Card>
        </>
      );
    }
    // account
    return (
      <>
        {/* 프로필 카드(닉네임 편집 + 이메일) — 계정 섹션 최상단 */}
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: C.elevated2, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border }}>
              <Text style={{ fontSize: 22, fontWeight: '700', color: C.text2 }}>{initial}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              {/* 닉네임 편집 인풋 + 저장(PC settings.js 미러). 변경이 있을 때만 저장 버튼 활성 */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <KeyTextInput
                  value={nick}
                  onChangeText={setNick}
                  placeholder={i18n.t('닉네임')}
                  placeholderTextColor={C.textDim}
                  maxLength={40}
                  autoCorrect={false}
                  onSubmitEditing={saveNick}
                  style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: '700', color: C.text, borderWidth: 1, borderColor: C.borderControl, borderRadius: R.sm, paddingHorizontal: 10, paddingVertical: 7 }}
                />
                <PressableScale onPress={saveNick} disabled={!nickDirty || nickSaving} baseOpacity={nickDirty ? (nickSaving ? 0.7 : 1) : 0.5}
                  style={{ paddingHorizontal: 12, height: 36, borderRadius: R.sm, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, backgroundColor: nickDirty ? C.text : C.elevated2 }}>
                  {nickSaving ? <ActivityIndicator size="small" color={C.base} /> : null}
                  <Text style={{ fontSize: 13, fontWeight: '700', color: nickDirty ? C.base : C.textDim }}>{i18n.t('저장')}</Text>
                </PressableScale>
              </View>
              {email ? <Text style={{ fontSize: 12.5, color: C.textDim, marginTop: 6 }} numberOfLines={1}>{email}</Text> : null}
            </View>
          </View>
        </Card>
        {/* 기기 = **두 그룹 카드**(`이 기기` / `다른 기기`, ★ 개정 9). 구 '내 기기' 표와 구 '종단간 암호화'
            카드는 2026-07-27 에 기기 행으로 흡수됐다(같은 기기가 두 목록에 중복 등장 + 열쇠 상태는 기기의
            속성 = 행이 단일 진실). 구조는 PC settings.js 와 동일하다. */}
        <E2eeSettingsCard />
        {/*  ★ 개정 9(2026-07-28 사용자 확정): 로그아웃·회원 탈퇴는 **계정 화면 맨 아래**다(3플랫폼 동일).
             원문 — "로그아웃과 회원탈퇴는 설정 > 계정에서 제일 아래로 내려줘! pc, andorid, ios 다!"
             이유: 둘은 파괴적·희귀 동작인데 프로필 바로 밑(첫 화면 상단)에 있어 매일 보는 기기 관리보다
             먼저 읽혔다. 순서 = 프로필 → 이 기기 → 다른 기기 → 로그아웃 → 회원 탈퇴. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border }}>
          <Text style={{ flex: 1, fontSize: 13.5, color: C.text2 }}>{i18n.t('이 기기에서 로그아웃')}</Text>
          <Pressable onPress={onLogout} style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: R.sm, borderWidth: 1, borderColor: C.borderControl, backgroundColor: confirmLogout ? C.elevated2 : C.elevated }}>
            <Text style={{ fontSize: 13, color: C.text, fontWeight: '600' }}>{confirmLogout ? i18n.t('정말 로그아웃?') : i18n.t('로그아웃')}</Text>
          </Pressable>
        </View>
        <View style={{ paddingVertical: 12, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <Text style={{ flex: 1, fontSize: 12.5, color: C.textDim }}>{i18n.t('회원 탈퇴 시 계정과 모든 데이터가 삭제되며 되돌릴 수 없습니다.')}</Text>
            {!confirmDelete ? (
              <Pressable onPress={onDelete} style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: R.sm, borderWidth: 1, borderColor: C.error }}>
                <Text style={{ fontSize: 13, color: C.error, fontWeight: '700' }}>{i18n.t('회원 탈퇴')}</Text>
              </Pressable>
            ) : (
              <Pressable onPress={() => { setConfirmDelete(false); setDeleteEmail(''); }} style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: R.sm, borderWidth: 1, borderColor: C.borderControl }}>
                <Text style={{ fontSize: 13, color: C.text2, fontWeight: '600' }}>{i18n.t('취소')}</Text>
              </Pressable>
            )}
          </View>
          {confirmDelete ? (() => {
            // "회원탈퇴" 문구 입력 가드 — 정확히 입력해야 "영구 삭제" 활성(파괴적 작업 확인).
            const match = deleteEmail.trim() === '회원탈퇴';
            return (
              /*  ★ 개정 10(사용자 확정): 경고색은 **[영구 삭제] 버튼 하나만**. 박스 테두리·문구·입력창까지
                   붉게 칠하면 화면이 통째로 경고가 되어 오히려 안 읽힌다(원문: "과한 색상 사용은 ai스러움"). */
              <View style={{ gap: 8, padding: 12, borderRadius: R.md, borderWidth: 1, borderColor: C.border, backgroundColor: C.elevated }}>
                <Text style={{ fontSize: 12.5, color: C.text2 }}>
                  
                  {i18n.t('계속하려면')} <Text style={{ color: C.text, fontWeight: '700' }}>{i18n.t('회원탈퇴')}</Text>  {i18n.t('를 입력하세요.')}
                </Text>
                <KeyTextInput
                  value={deleteEmail}
                  onChangeText={setDeleteEmail}
                  placeholder={i18n.t('회원탈퇴')}
                  placeholderTextColor={C.textDim}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={{ borderWidth: 1, borderColor: C.borderControl, borderRadius: R.sm, paddingHorizontal: 10, paddingVertical: 8, color: C.text, fontSize: 13.5 }}
                />
                <Pressable onPress={onDelete} disabled={!match || deleting}
                  style={{ height: 40, borderRadius: R.sm, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, backgroundColor: match ? C.error : C.elevated2, opacity: match ? (deleting ? 0.8 : 1) : 0.6 }}>
                  {deleting ? <ActivityIndicator size="small" color="#fff" /> : null}
                  <Text style={{ fontSize: 13.5, fontWeight: '700', color: match ? '#fff' : C.textDim }}>{deleting ? i18n.t('탈퇴 처리 중…') : i18n.t('영구 삭제')}</Text>
                </Pressable>
              </View>
            );
          })() : null}
        </View>

      </>
    );
  };

  const rail = (
    <Rail isWide={isWide} q={q} setQ={setQ} navItems={navItems} section={section ?? 'appearance'} setSection={setSection} />
  );

  // narrow 마스터 목록 — 카테고리를 고르면 해당 설정 뎁스로 이동한다.
  const narrowMasterList = (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', height: 46, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: C.border }}>
        <Text style={{ flex: 1, fontSize: 16, fontWeight: '700', color: C.text }}>{i18n.t('설정')}</Text>
        <Pressable onPress={S.closeSettings} hitSlop={8} style={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center' }}><X size={18} color={C.text2} /></Pressable>
      </View>
      <ScrollView contentContainerStyle={{ paddingVertical: 8 }}>
        {NAV.map((n, i) => {
          const firstInGroup = i === 0 || NAV[i - 1].group !== n.group;
          return (
            <React.Fragment key={n.key}>
              {firstInGroup ? <Text style={{ fontSize: 11, fontWeight: '700', color: C.textDim, paddingHorizontal: 18, paddingTop: i ? 20 : 8, paddingBottom: 5 }}>{i18n.t(n.group)}</Text> : null}
              <PressableScale onPress={() => setSection(n.key)} accessibilityRole="button" scaleTo={0.99}
                style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border }}>
                {n.icon(C.text2)}
                <Text style={{ flex: 1, fontSize: 15, color: C.text }}>{i18n.t(n.label)}</Text>
                <CaretRight size={16} color={C.textDim} />
              </PressableScale>
            </React.Fragment>
          );
        })}
      </ScrollView>
    </View>
  );

  // narrow 상세 뎁스 — 뒤로(←) + 섹션 제목 + 닫기(X).
  const narrowDetail = (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', height: 46, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: C.border }}>
        <Pressable onPress={() => setSection(null)} hitSlop={8} style={{ width: 38, height: 38, alignItems: 'center', justifyContent: 'center' }}><CaretLeft size={20} color={C.text2} /></Pressable>
        <Text style={{ flex: 1, fontSize: 16, fontWeight: '700', color: C.text }}>{i18n.t(NAV.find((n) => n.key === section)?.label ?? '설정')}</Text>
        <Pressable onPress={S.closeSettings} hitSlop={8} style={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center' }}><X size={18} color={C.text2} /></Pressable>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
        {renderContent()}
      </ScrollView>
    </View>
  );

  return (
    <Modal visible={open} transparent animationType="fade" supportedOrientations={['portrait', 'portrait-upside-down', 'landscape', 'landscape-left', 'landscape-right']} onRequestClose={S.closeSettings}>
      <View style={{ flex: 1, backgroundColor: 'rgba(5,7,12,0.68)', justifyContent: isWide ? 'center' : 'flex-start', alignItems: isWide ? 'center' : 'stretch' }}>
        <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} onPress={S.closeSettings} />
        {isWide ? (
          <View style={{ width: '88%', maxWidth: 720, height: '80%', maxHeight: 560, backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.border, overflow: 'hidden', flexDirection: 'row' }}>
            {rail}
            <View style={{ flex: 1 }}>
              {/* 헤더 라인 = 섹션 제목 + 닫기(X). 제목은 콘텐츠에서 별도로 그리지 않는다(중복 방지) */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 46, paddingLeft: 26, paddingRight: 12, borderBottomWidth: 1, borderBottomColor: C.border }}>
                <Text style={{ fontSize: 17, fontWeight: '800', color: C.text }}>{i18n.t(NAV.find((n) => n.key === (section ?? 'appearance'))?.label ?? '화면 및 편집')}</Text>
                <Pressable onPress={S.closeSettings} hitSlop={8} style={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center' }}><X size={18} color={C.text2} /></Pressable>
              </View>
              <ScrollView contentContainerStyle={{ padding: 26, paddingTop: 22 }} keyboardShouldPersistTaps="handled">
                {renderContent()}
              </ScrollView>
            </View>
          </View>
        ) : (
          <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: C.base }}>
            {section === null ? narrowMasterList : narrowDetail}
          </SafeAreaView>
        )}
      </View>
      {/* 네이티브 Modal 윈도 안에도 전역 키보드 액세서리 오버레이 */}
      <KeyAssistOverlay inModal />
    </Modal>
  );
}
