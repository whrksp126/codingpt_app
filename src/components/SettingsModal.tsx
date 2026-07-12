import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Modal, Pressable, ScrollView, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GearSix, User as UserIc, Desktop, DeviceMobile, Cloud, X, MagnifyingGlass, Trash, DotsThree } from 'phosphor-react-native';

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

// 내 정보 = PC(codingpt_pc settings.js) 미러 설정 모달. 일반/계정/정보 3섹션.
//   iPad(wide)=2패널 카드(좌 rail + 우 content), 폰=상단 탭 + content.
export default function SettingsModal() {
  const insets = useSafeAreaInsets();
  const { isWide } = useResponsive();
  const S = useWorkspaceShell();
  const { user } = useUser();
  const { logout } = useAuth();
  const { alert, confirm } = useAppAlert();

  const [section, setSection] = useState<Section>('general');
  const [q, setQ] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const open = S.settingsOpen;

  useEffect(() => {
    if (!open) { setSection('general'); setQ(''); setConfirmDelete(false); return; }
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

  const onLogout = useCallback(async () => {
    const ok = await confirm({ title: '로그아웃', message: '모든 기기에서 로그아웃할까요?', confirmText: '로그아웃' });
    if (!ok) return;
    S.closeSettings();
    await logout();
  }, [confirm, logout, S]);

  const onDelete = useCallback(async () => {
    if (!confirmDelete) { setConfirmDelete(true); setTimeout(() => setConfirmDelete(false), 4000); return; }
    setConfirmDelete(false);
    try {
      if (user?.id != null) await authService.deleteUser(user.id);
      S.closeSettings();
      await logout();
    } catch (e: any) {
      alert({ title: '오류', message: e?.message || '회원 탈퇴 중 오류가 발생했어요.' });
    }
  }, [confirmDelete, user, logout, alert, S]);

  const onRevoke = useCallback(async (d: AccountDevice) => {
    if (typeof d.id !== 'number') return;
    const ok = await confirm({ title: '기기 삭제', message: `'${d.name || '기기'}'를 삭제할까요?`, confirmText: '삭제' });
    if (!ok) return;
    try { await daemonService.revokeDevice(d.id); await S.loadDevices(); } catch (_) { /* noop */ }
  }, [confirm, S]);

  const Card: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <View style={{ backgroundColor: C.elevated, borderWidth: 1, borderColor: C.border, borderRadius: R.md, padding: 14, marginBottom: 12 }}>{children}</View>
  );
  const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <Text style={{ fontSize: 20, fontWeight: '800', color: C.text, marginBottom: 16 }}>{children}</Text>
  );

  const renderContent = () => {
    if (section === 'general') {
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
        </>
      );
    }
    if (section === 'about') {
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
          <Text style={{ flex: 1, fontSize: 13.5, color: C.text2 }}>모든 기기에서 로그아웃</Text>
          <Pressable onPress={onLogout} style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: R.sm, borderWidth: 1, borderColor: C.borderControl, backgroundColor: C.elevated }}>
            <Text style={{ fontSize: 13, color: C.text, fontWeight: '600' }}>로그아웃</Text>
          </Pressable>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, gap: 12 }}>
          <Text style={{ flex: 1, fontSize: 12.5, color: C.textDim }}>회원 탈퇴 시 계정과 모든 데이터가 삭제되며 되돌릴 수 없습니다.</Text>
          <Pressable onPress={onDelete} style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: R.sm, borderWidth: 1, borderColor: C.error }}>
            <Text style={{ fontSize: 13, color: C.error, fontWeight: '700' }}>{confirmDelete ? '정말 탈퇴?' : '회원 탈퇴'}</Text>
          </Pressable>
        </View>

        <Text style={{ fontSize: 13, fontWeight: '700', color: C.text, marginTop: 18, marginBottom: 8 }}>내 기기</Text>
        <View style={{ borderWidth: 1, borderColor: C.border, borderRadius: R.md, overflow: 'hidden' }}>
          {/* header */}
          <View style={{ flexDirection: 'row', paddingVertical: 9, paddingHorizontal: 12, backgroundColor: C.elevated2 }}>
            <Text style={{ flex: 2, fontSize: 11, color: C.textDim, fontWeight: '700' }}>기기</Text>
            <Text style={{ flex: 1, fontSize: 11, color: C.textDim, fontWeight: '700' }}>운영체제</Text>
            <Text style={{ flex: 1, fontSize: 11, color: C.textDim, fontWeight: '700' }}>등록됨</Text>
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
                  <Text style={{ color: C.text, fontSize: 13 }} numberOfLines={1}>{d.name || '기기'}</Text>
                  {isCur ? <View style={{ paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, backgroundColor: C.accentTint }}><Text style={{ fontSize: 9, color: C.accent, fontWeight: '700' }}>이 기기</Text></View> : null}
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: d.online ? C.accent : C.textDim }} />
                </View>
                <Text style={{ flex: 1, fontSize: 12, color: C.text2 }} numberOfLines={1}>{osLabel(d)}</Text>
                <Text style={{ flex: 1, fontSize: 11.5, color: C.textDim }} numberOfLines={1}>{fmtDate(d.createdAt)}</Text>
                <View style={{ width: 28, alignItems: 'flex-end' }}>
                  {canRevoke ? (
                    <Pressable onPress={() => onRevoke(d)} hitSlop={8}><Trash size={15} color={C.textDim} /></Pressable>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      </>
    );
  };

  // rail(일반/계정/정보) — wide=세로 좌측, narrow=가로 상단 탭
  const Rail = () => (
    <View style={isWide
      ? { width: 190, borderRightWidth: 1, borderRightColor: C.border, paddingVertical: 14, paddingHorizontal: 10 }
      : { flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: C.border }}>
      {isWide ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.elevated2, borderRadius: R.sm, paddingHorizontal: 8, height: 34, marginBottom: 12 }}>
            <MagnifyingGlass size={14} color={C.textDim} />
            <TextInput value={q} onChangeText={setQ} placeholder="검색" placeholderTextColor={C.textDim} style={{ flex: 1, color: C.text, fontSize: 13, padding: 0 }} autoCapitalize="none" />
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

  return (
    <Modal visible={open} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={S.closeSettings}>
      <View style={{ flex: 1, backgroundColor: 'rgba(5,7,12,0.68)', justifyContent: isWide ? 'center' : 'flex-start', alignItems: isWide ? 'center' : 'stretch', paddingTop: isWide ? 0 : insets.top }}>
        <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} onPress={S.closeSettings} />
        <View style={isWide
          ? { width: '88%', maxWidth: 720, height: '80%', maxHeight: 560, backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.border, overflow: 'hidden', flexDirection: 'row' }
          : { flex: 1, backgroundColor: C.base }}>
          {isWide ? <Rail /> : null}
          <View style={{ flex: 1 }}>
            {/* 헤더(닫기) */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', height: 46, paddingHorizontal: 12, borderBottomWidth: isWide ? 0 : 1, borderBottomColor: C.border }}>
              {!isWide ? <Text style={{ flex: 1, fontSize: 16, fontWeight: '700', color: C.text }}>내 정보</Text> : null}
              <Pressable onPress={S.closeSettings} hitSlop={8} style={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center' }}><X size={18} color={C.text2} /></Pressable>
            </View>
            {!isWide ? <Rail /> : null}
            <ScrollView contentContainerStyle={{ padding: isWide ? 26 : 16, paddingTop: isWide ? 30 : 16 }} keyboardShouldPersistTaps="handled">
              {renderContent()}
            </ScrollView>
          </View>
        </View>
      </View>
    </Modal>
  );
}
