import React from 'react';
import { View, Text, ScrollView, Pressable, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import DeviceInfo from 'react-native-device-info';
import { CaretLeft, CaretRight } from 'phosphor-react-native';

import AuthStorage from '../../utils/storage';
import { useAuth } from '../../contexts/AuthContext';
import { useUser } from '../../contexts/UserContext';
import { useTheme } from '../../contexts/ThemeContext';
import { authService } from '../../services/authService';
import githubService, { GithubStatus } from '../../services/githubService';
import GithubConnectModal from '../../components/Github/GithubConnectModal';
import { Label } from '../../components/v2/primitives';
import { v2 } from '../../theme/v2Tokens';
import type { SettingsFlowStackParamList } from '../../navigation/types';

const C = v2.colors;
const R = v2.radius;

// ── 설정 행 ────────────────────────────────────────────────────────
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

// ── 그룹 (라벨 + 카드) ─────────────────────────────────────────────
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

const SettingScreen: React.FC = () => {
  const { logout } = useAuth();
  const { user } = useUser();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<SettingsFlowStackParamList>>();
  const [githubModalVisible, setGithubModalVisible] = React.useState(false);
  const [githubStatus, setGithubStatus] = React.useState<GithubStatus>({ connected: false });
  const [notify, setNotify] = React.useState(true);

  React.useEffect(() => {
    githubService.getStatus().then(setGithubStatus).catch(() => {});
  }, []);

  const themeLabel = theme === 'light' ? '라이트' : theme === 'system' ? '시스템' : '다크';
  const soon = (what: string) => Alert.alert(what, '곧 만나요! 준비 중인 기능이에요.');

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

  const handleDeleteAccount = () => {
    if (!user?.id) {
      Alert.alert('오류', '사용자 정보를 확인할 수 없습니다.');
      return;
    }
    Alert.alert(
      '회원 탈퇴',
      '정말 탈퇴하시겠습니까?\n계정의 모든 데이터가 삭제되며 되돌릴 수 없습니다.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '탈퇴',
          style: 'destructive',
          onPress: async () => {
            try {
              await authService.deleteUser(user.id);
              await performLocalSignOut(true);
            } catch (error) {
              console.error('회원 탈퇴 실패:', error);
              Alert.alert('오류', '회원 탈퇴 중 오류가 발생했습니다.');
            }
          },
        },
      ]
    );
  };

  const handleLogout = () => {
    Alert.alert(
      '로그아웃',
      '정말 로그아웃하시겠습니까?',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '로그아웃',
          style: 'destructive',
          onPress: async () => {
            try {
              await authService.logout();
            } catch (e) {
              console.log('서버 로그아웃 실패 (무시):', e);
            }
            await performLocalSignOut();
          },
        },
      ]
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.base }}>
      {/* 헤더 */}
      <View style={{ paddingTop: Math.max(insets.top, 10) }}>
        <View style={{ height: 52, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14 }}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
            <CaretLeft size={22} color={C.text} />
          </Pressable>
          <Text style={{ flex: 1, fontSize: 17, fontWeight: '700', color: C.text }}>설정</Text>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 6, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <Group label="계정">
          <Row label="이메일" value={user?.email ?? '–'} />
          <Row label="로그인 연결" value="Google" />
          <Row
            label="GitHub"
            value={githubStatus.connected ? `@${githubStatus.login}` : '연결 안됨'}
            onPress={() => setGithubModalVisible(true)}
            last
          />
        </Group>

        <Group label="환경">
          <Row label="테마" value={themeLabel} onPress={() => navigation.navigate('Theme')} />
          <Row label="알림" toggle on={notify} onPress={() => setNotify((v) => !v)} />
          <Row label="에디터 설정" value="줄바꿈 · 글자 크기" onPress={() => soon('에디터 설정')} />
          <Row label="언어" value="한국어" onPress={() => soon('언어 설정')} last />
        </Group>

        <Group label="정보">
          <Row label="후기" onPress={() => navigation.navigate('MyReviews')} />
          <Row label="서비스 약관" onPress={() => soon('서비스 약관')} />
          <Row label="개인정보 처리방침" onPress={() => soon('개인정보 처리방침')} />
          <Row label="버전 정보" value={DeviceInfo.getVersion()} last />
        </Group>

        <Group>
          <Row label="로그아웃" danger onPress={handleLogout} />
          <Row label="회원 탈퇴" danger onPress={handleDeleteAccount} last />
        </Group>
      </ScrollView>

      <GithubConnectModal
        visible={githubModalVisible}
        onClose={() => setGithubModalVisible(false)}
        onStatusChange={setGithubStatus}
      />
    </View>
  );
};

export default SettingScreen;
