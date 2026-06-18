import React from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useAppAlert } from '../../hooks/useAppAlert';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import DeviceInfo from 'react-native-device-info';
import { CaretRight } from 'phosphor-react-native';

import AuthStorage from '../../utils/storage';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { authService } from '../../services/authService';
import { Label } from '../../components/v2/primitives';
import { v2 } from '../../theme/v2Tokens';

const C = v2.colors;
const R = v2.radius;

type RowProps = {
  label: string;
  value?: string;
  onPress?: () => void;
  last?: boolean;
  danger?: boolean;
  toggle?: boolean;
  on?: boolean;
};

function Row({ label, value, onPress, last, danger, toggle, on }: RowProps) {
  const valueMono = value ? /[0-9@.]/.test(value) : false;
  return (
    <Pressable
      onPress={onPress}
      android_ripple={onPress ? { color: C.elevated2 } : undefined}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, paddingHorizontal: 15, borderBottomWidth: last ? 0 : 1, borderBottomColor: C.border }}
    >
      <Text style={{ flex: 1, fontSize: 14.5, color: danger ? C.error : C.text }}>{label}</Text>
      {value ? (
        <Text style={{ fontSize: 13.5, color: C.textDim, fontFamily: valueMono ? v2.font.mono : v2.font.sans }}>{value}</Text>
      ) : null}
      {toggle ? (
        <View style={{ width: 42, height: 25, borderRadius: 999, backgroundColor: on ? C.accent : C.borderControl, justifyContent: 'center' }}>
          <View style={{ width: 19, height: 19, borderRadius: 999, backgroundColor: '#fff', marginLeft: on ? 20 : 3 }} />
        </View>
      ) : null}
      {!toggle && !danger ? <CaretRight size={15} color={C.textDim} /> : null}
    </Pressable>
  );
}

function Group({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 22 }}>
      {label ? <Label style={{ marginBottom: 8, paddingHorizontal: 2 }}>{label}</Label> : null}
      <View style={{ borderWidth: 1, borderColor: C.border, borderRadius: R.lg, overflow: 'hidden', backgroundColor: C.surface }}>
        {children}
      </View>
    </View>
  );
}

// 설정 본문 — 환경 / 정보 / 로그아웃. (계정·회원탈퇴는 계정 뎁스(AccountContent)로 이동)
const SettingsContent: React.FC = () => {
  const { logout } = useAuth();
  const { theme } = useTheme();
  const navigation = useNavigation<any>();
  const { confirm, alert } = useAppAlert();
  const [notify, setNotify] = React.useState(true);

  const themeLabel = theme === 'light' ? '라이트' : theme === 'system' ? '시스템' : '다크';
  const soon = (what: string) => alert({ title: what, message: '곧 만나요! 준비 중인 기능이에요.' });

  const performLocalSignOut = async () => {
    try {
      await GoogleSignin.signOut();
    } catch (googleError) {
      console.log('Google 로그아웃 실패 (무시):', googleError);
    }
    await AsyncStorage.removeItem('accessToken');
    await AsyncStorage.removeItem('refreshToken');
    await AuthStorage.clearUserData();
    logout();
  };

  const handleLogout = async () => {
    const ok = await confirm({ title: '로그아웃', message: '정말 로그아웃하시겠습니까?', confirmText: '로그아웃', danger: true });
    if (!ok) return;
    try {
      await authService.logout();
    } catch (e) {
      console.log('서버 로그아웃 실패 (무시):', e);
    }
    await performLocalSignOut();
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.base }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 6, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
      <Group label="환경">
        <Row label="테마" value={themeLabel} onPress={() => navigation.navigate('SettingsFlow', { screen: 'Theme', initial: false })} />
        <Row label="알림" toggle on={notify} onPress={() => setNotify((v) => !v)} />
        <Row label="에디터 설정" value="줄바꿈 · 글자 크기" onPress={() => soon('에디터 설정')} />
        <Row label="언어" value="한국어" onPress={() => soon('언어 설정')} last />
      </Group>

      <Group label="정보">
        <Row label="후기" onPress={() => navigation.navigate('SettingsFlow', { screen: 'MyReviews', initial: false })} />
        <Row label="서비스 약관" onPress={() => soon('서비스 약관')} />
        <Row label="개인정보 처리방침" onPress={() => soon('개인정보 처리방침')} />
        <Row label="버전 정보" value={DeviceInfo.getVersion()} last />
      </Group>

      <Group>
        <Row label="로그아웃" danger onPress={handleLogout} last />
      </Group>
    </ScrollView>
  );
};

export default SettingsContent;
