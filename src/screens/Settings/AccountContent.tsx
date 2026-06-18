import React from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CaretRight } from 'phosphor-react-native';

import AuthStorage from '../../utils/storage';
import { useAuth } from '../../contexts/AuthContext';
import { useUser } from '../../contexts/UserContext';
import { useMyInfo } from '../../contexts/MyInfoContext';
import { useAppAlert } from '../../hooks/useAppAlert';
import { authService } from '../../services/authService';
import githubService, { GithubStatus } from '../../services/githubService';
import { Label } from '../../components/v2/primitives';
import { v2 } from '../../theme/v2Tokens';

const C = v2.colors;
const R = v2.radius;

type RowProps = { label: string; value?: string; onPress?: () => void; last?: boolean; danger?: boolean; center?: boolean };

function Row({ label, value, onPress, last, danger, center }: RowProps) {
  const valueMono = value ? /[0-9@.]/.test(value) : false;
  return (
    <Pressable
      onPress={onPress}
      android_ripple={onPress ? { color: C.elevated2 } : undefined}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, paddingHorizontal: 15, borderBottomWidth: last ? 0 : 1, borderBottomColor: C.border }}
    >
      <Text style={{ flex: 1, fontSize: 14.5, color: danger ? C.error : C.text, textAlign: center ? 'center' : 'left', fontWeight: danger ? '600' : '400' }}>{label}</Text>
      {value ? (
        <Text style={{ fontSize: 13.5, color: C.textDim, fontFamily: valueMono ? v2.font.mono : v2.font.sans }}>{value}</Text>
      ) : null}
      {/* 화살표는 클릭 가능한(onPress) 비-danger 행에만 */}
      {onPress && !danger ? <CaretRight size={15} color={C.textDim} /> : null}
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

// 계정 본문 — 내 정보 프로필 클릭 시 등장하는 계정 뎁스. (이메일/로그인 연결/GitHub + 회원 탈퇴)
const AccountContent: React.FC = () => {
  const { logout } = useAuth();
  const { user } = useUser();
  const { openGithub, githubOpen } = useMyInfo();
  const { confirm, alert } = useAppAlert();
  const [githubStatus, setGithubStatus] = React.useState<GithubStatus>({ connected: false });

  // GitHub 시트가 닫힐 때(및 마운트 시) 연결 상태 재조회 → 연결/해제 결과를 행에 반영
  React.useEffect(() => {
    if (!githubOpen) githubService.getStatus().then(setGithubStatus).catch(() => {});
  }, [githubOpen]);

  const performLocalSignOut = async (clearUserCache = false) => {
    try {
      await GoogleSignin.signOut();
    } catch (googleError) {
      console.log('Google 로그아웃 실패 (무시):', googleError);
    }
    await AsyncStorage.removeItem('accessToken');
    await AsyncStorage.removeItem('refreshToken');
    await AuthStorage.clearUserData();
    if (clearUserCache) {
      await AsyncStorage.removeItem('recentLesson');
    }
    logout();
  };

  const handleDeleteAccount = async () => {
    if (!user?.id) {
      alert({ title: '오류', message: '사용자 정보를 확인할 수 없습니다.' });
      return;
    }
    const ok = await confirm({
      title: '회원 탈퇴',
      message: '정말 탈퇴하시겠습니까?\n계정의 모든 데이터가 삭제되며 되돌릴 수 없습니다.',
      confirmText: '탈퇴',
      danger: true,
    });
    if (!ok) return;
    try {
      await authService.deleteUser(user.id);
      await performLocalSignOut(true);
    } catch (error) {
      console.error('회원 탈퇴 실패:', error);
      alert({ title: '오류', message: '회원 탈퇴 중 오류가 발생했습니다.' });
    }
  };

  return (
    <>
      <ScrollView style={{ flex: 1, backgroundColor: C.base }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 6, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <Group label="계정">
          <Row label="이메일" value={user?.email ?? '–'} />
          <Row label="로그인 연결" value="Google" />
          <Row
            label="GitHub"
            value={githubStatus.connected ? `@${githubStatus.login}` : '연결 안됨'}
            onPress={openGithub}
            last
          />
        </Group>

        <Group>
          <Row label="회원 탈퇴" danger center onPress={handleDeleteAccount} last />
        </Group>
      </ScrollView>
    </>
  );
};

export default AccountContent;
