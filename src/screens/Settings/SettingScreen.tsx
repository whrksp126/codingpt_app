import React from "react";
import { View, Text, ScrollView, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import AsyncStorage from "@react-native-async-storage/async-storage";
import AuthStorage from "../../utils/storage";
import { useAuth } from "../../contexts/AuthContext";
import { useUser } from "../../contexts/UserContext";
import { authService } from "../../services/authService";
import { CaretLeft, CaretRight } from "../../assets/SvgIcon";
import DefaultBtn from "../../components/Button/DefaultBtn";
import DefaultIconBtn from "../../components/Button/DefaultIconBtn";
import RippleButton from "../../components/Button/RippleButton";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { SettingsFlowStackParamList } from "../../navigation/types";
import DeviceInfo from "react-native-device-info";
import GithubConnectModal from "../../components/Github/GithubConnectModal";
import githubService, { GithubStatus } from "../../services/githubService";

// 설정 행 타입
type SettingsRowProps = {
  label: string;
  danger?: boolean;
  showArrow?: boolean;
  showDivider?: boolean;
  rightText?: string;
  onPress?: () => void;
};

// 설정 행
const SettingsRow: React.FC<SettingsRowProps> = ({
  label,
  danger,
  showArrow = false,
  showDivider = false,
  rightText,
  onPress,
}) => {
  const textColor = danger
    ? "text-[#fe4c4a]"
    : "text-[#3c3c3c] dark:text-[#E1E6EF]";
  const dividerClass = showDivider
    ? "border-b border-[#cccccc] dark:border-[#3F444D]"
    : "";

  return (
    <RippleButton
      onPress={onPress}
      className={`flex-row items-center justify-between px-[10px] py-[10px] ${dividerClass}`}
    >
      <View className="flex-1">
        <Text
          className={`text-[20px] font-bold ${textColor}`}
          numberOfLines={1}
        >
          {label}
        </Text>
      </View>
      {rightText !== undefined ? (
        <View className="items-center justify-center">
          <Text className="text-[16px] text-[#777777] dark:text-[#9CA3AF]">{rightText}</Text>
        </View>
      ) : showArrow ? (
        <View className="items-center justify-center">
          <CaretRight width={25} height={25} fill="#CCCCCC" />
        </View>
      ) : null}
    </RippleButton>
  );
};

// 설정 섹션 타입
type SettingsSectionProps = {
  title: string;
  children: React.ReactNode;
};

// 설정 섹션
const SettingsSection: React.FC<SettingsSectionProps> = ({ title, children }) => {
  return (
    <View className="w-full">
      <View className="py-[10px]">
        <Text className="text-[22px] font-bold text-black dark:text-white">{title}</Text>
      </View>
      <View className="rounded-[10px] border border-[#cccccc] dark:border-[#3F444D] overflow-hidden">
        {children}
      </View>
    </View>
  );
};

// 설정 헤더
const Header: React.FC = () => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  return (
    <View className="w-full bg-white dark:bg-[#0A0D14] border-b border-[#cccccc] dark:border-[#3F444D]">
      <View
        className="flex-row items-center px-[16px] pt-[4px] pb-[10px]"
        style={{ paddingTop: Math.max(insets.top, 10) }}
      >
        {/* 상단 헤더: 뒤로가기 버튼 */}
        <DefaultIconBtn
          onPress={() => navigation.goBack()}
          size={35}
          enableHapticFeedback={true}
          enableSound={true}
          pressScale={0.85}
          pressOpacity={0.6}
          bounceScale={1.15}
        >
          <CaretLeft width={35} height={35} fill="#CCCCCC" />
        </DefaultIconBtn>
        <View className="flex-1 items-center justify-center">
          <Text className="text-[22px] font-bold text-[#111111] dark:text-white">설정</Text>
        </View>
        <View className="w-[35px]" />
      </View>
    </View>
  );
};

// 설정 푸터
type FooterProps = {
  onPressDeleteAccount?: () => void;
};

const Footer: React.FC<FooterProps> = ({ onPressDeleteAccount }) => {
  return (
    <View className="w-full py-[10px]">
      <View className="gap-[10px]">
        <RippleButton className="px-[10px] py-[6px] rounded-[6px]">
          <Text className="text-[20px] font-bold text-[#3c3c3c] dark:text-[#E1E6EF]">
            약관 및 개인정보처리방침
          </Text>
        </RippleButton>
        <RippleButton
          onPress={onPressDeleteAccount}
          className="px-[10px] py-[6px] rounded-[6px]"
        >
          <Text className="text-[20px] font-bold text-[#fe4c4a]">회원 탈퇴</Text>
        </RippleButton>
      </View>
    </View>
  );
};

// 설정 화면
const SettingScreen: React.FC = () => {
  const { logout } = useAuth();
  const { user } = useUser();
  const navigation = useNavigation<NativeStackNavigationProp<SettingsFlowStackParamList>>();
  const [githubModalVisible, setGithubModalVisible] = React.useState(false);
  const [githubStatus, setGithubStatus] = React.useState<GithubStatus>({ connected: false });

  React.useEffect(() => {
    githubService.getStatus().then(setGithubStatus).catch(() => {});
  }, []);

  const performLocalSignOut = async (clearUserCache = false) => {
    try {
      await GoogleSignin.signOut();
    } catch (googleError) {
      console.log("Google 로그아웃 실패 (무시):", googleError);
    }
    await AsyncStorage.removeItem("accessToken");
    await AsyncStorage.removeItem("refreshToken");
    await AuthStorage.clearUserData();
    if (clearUserCache) {
      // 회원 탈퇴 시 사용자 종속 캐시 제거 (다음 로그인에서 잔존 표시 방지)
      await AsyncStorage.removeItem("recentLesson");
    }
    logout();
  };

  const handleDeleteAccount = () => {
    if (!user?.id) {
      Alert.alert("오류", "사용자 정보를 확인할 수 없습니다.");
      return;
    }
    Alert.alert(
      "회원 탈퇴",
      "정말 탈퇴하시겠습니까?\n계정의 모든 데이터가 삭제되며 되돌릴 수 없습니다.",
      [
        { text: "취소", style: "cancel" },
        {
          text: "탈퇴",
          style: "destructive",
          onPress: async () => {
            try {
              await authService.deleteUser(user.id);
              await performLocalSignOut(true);
            } catch (error) {
              console.error("회원 탈퇴 실패:", error);
              Alert.alert("오류", "회원 탈퇴 중 오류가 발생했습니다.");
            }
          },
        },
      ]
    );
  };

  const handleLogout = async () => {
    Alert.alert(
      "로그아웃",
      "정말 로그아웃하시겠습니까?",
      [
        { text: "취소", style: "cancel" },
        {
          text: "로그아웃",
          style: "destructive",
          onPress: async () => {
            try {
              // 1. 서버에 로그아웃 요청
              await authService.logout();
              // 2. Google 로그아웃
              try {
                await GoogleSignin.signOut();
              } catch (googleError) {
                console.log("Google 로그아웃 실패 (무시):", googleError);
                // Google 로그아웃 실패해도 계속 진행
              }
              // 3. 로컬 토큰 삭제
              await AsyncStorage.removeItem("accessToken");
              await AsyncStorage.removeItem("refreshToken");
              // 4. 사용자 정보 삭제
              await AuthStorage.clearUserData();

              // 5. App.tsx의 isLoggedIn 상태를 false로 변경
              logout();
            } catch (error) {
              console.error("로그아웃 실패:", error);
              Alert.alert("오류", "로그아웃 중 오류가 발생했습니다.");
            }
          },
        },
      ]
    );
  };

  return (
    <View className="flex-1 bg-white dark:bg-[#0A0D14]">
      <Header />
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-[16px] pt-[10px] pb-[40px]"
      >
        {/* 계정 섹션 */}
        <View>
          <SettingsSection title="계정">
            <SettingsRow label="프로필" showArrow showDivider />
            <SettingsRow
              label="후기"
              showArrow
              showDivider
              onPress={() => navigation.navigate("MyReviews")}
            />
            <SettingsRow
              label="GitHub"
              rightText={githubStatus.connected ? `@${githubStatus.login}` : "연결 안됨"}
              onPress={() => setGithubModalVisible(true)}
            />
          </SettingsSection>

          {/* 로그아웃 버튼 */}
          <View className="mt-[10px]">
            <DefaultBtn
              onPress={handleLogout}
              text="로그아웃"
              buttonClassName="bg-white dark:bg-[#1B1F27] border border-[#FE4C4A] rounded-[10px] py-[10px] px-[10px] flex-row items-center justify-center"
              textClassName="text-[#FE4C4A] text-[20px] font-bold"
              enableHapticFeedback={true}
              enableSound={true}
              flex={false}
              shadowColor="#FE4C4A"
            />
          </View>
        </View>

        {/* 환경 설정 섹션 */}
        <View className="mt-[20px]">
          <SettingsSection title="환경 설정">
            <SettingsRow label="알림" showArrow showDivider />
            <SettingsRow
              label="테마"
              showArrow
              onPress={() => navigation.navigate("Theme")}
            />
          </SettingsSection>
        </View>

        {/* 고객 지원 섹션 */}
        <View className="mt-[20px]">
          <SettingsSection title="고객 지원">
            <SettingsRow label="공지사항" showArrow showDivider />
            <SettingsRow label="자주 묻는 질문" showArrow showDivider />
            <SettingsRow label="문의하기" showArrow showDivider />
            <SettingsRow label="버전 정보" rightText={DeviceInfo.getVersion()} />
          </SettingsSection>
        </View>

        {/* 약관 / 개인정보 / 회원탈퇴 */}
        <View className="mt-[20px]">
          <Footer onPressDeleteAccount={handleDeleteAccount} />
        </View>
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
