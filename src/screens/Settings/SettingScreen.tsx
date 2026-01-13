import React from "react";
import { View, Text, ScrollView, Pressable, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import AsyncStorage from "@react-native-async-storage/async-storage";
import AuthStorage from "../../utils/storage";
import { useAuth } from "../../contexts/AuthContext";
import { authService } from "../../services/authService";
import { CaretLeft, CaretRight } from "../../assets/SvgIcon";
import DefaultBtn from "../../components/Button/DefaultBtn";
import DefaultIconBtn from "../../components/Button/DefaultIconBtn";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { MyTabStackParamList } from "../../navigation/types";

// 설정 행 타입
type SettingsRowProps = {
  label: string;
  danger?: boolean;
  showArrow?: boolean;
  showDivider?: boolean;
  onPress?: () => void;
};

// 설정 행
const SettingsRow: React.FC<SettingsRowProps> = ({
  label,
  danger,
  showArrow = false,
  showDivider = false,
  onPress,
}) => {
  const textColor = danger ? "text-[#fe4c4a]" : "text-[#3c3c3c]";
  const dividerClass = showDivider ? "border-b border-[#cccccc]" : "";

  return (
    <Pressable
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
      {showArrow && (
        <View className="items-center justify-center">
          <CaretRight width={25} height={25} fill="#CCCCCC" />
        </View>
      )}
    </Pressable>
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
        <Text className="text-[22px] font-bold text-black">{title}</Text>
      </View>
      <View className="rounded-[10px] border border-[#cccccc] overflow-hidden">
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
    <View className="w-full bg-white border-b border-[#cccccc]">
      <View
        className="flex-row items-center px-[16px] pb-[20px]"
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
          <Text className="text-[22px] font-bold text-[#111111]">설정</Text>
        </View>
        <View className="w-[35px]" />
      </View>
    </View>
  );
};

// 설정 푸터
const Footer: React.FC = () => {
  return (
    <View className="w-full py-[10px]">
      <View className="gap-[10px]">
        <View>
          <Text className="text-[20px] font-bold text-[#3c3c3c]">
            약관 및 개인정보처리방침
          </Text>
        </View>
        <View>
          <Text className="text-[20px] font-bold text-[#fe4c4a]">회원 탈퇴</Text>
        </View>
      </View>
    </View>
  );
};

// 설정 화면
const SettingScreen: React.FC = () => {
  const { logout } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<MyTabStackParamList>>();

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
    <View className="flex-1 bg-white">
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
            <SettingsRow label="GitHub" showArrow />
          </SettingsSection>

          {/* 로그아웃 버튼 */}
          <View className="mt-[10px]">
            <DefaultBtn
              onPress={handleLogout}
              text="로그아웃"
              buttonClassName="bg-white border border-[#FE4C4A] rounded-[10px] py-[10px] px-[10px] flex-row items-center justify-center"
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
            <SettingsRow label="언어" showArrow showDivider />
            <SettingsRow label="테마" showArrow />
          </SettingsSection>
        </View>

        {/* 고객 지원 섹션 */}
        <View className="mt-[20px]">
          <SettingsSection title="고객 지원">
            <SettingsRow label="공지사항" showArrow showDivider />
            <SettingsRow label="자주 묻는 질문" showArrow showDivider />
            <SettingsRow label="문의하기" showArrow showDivider />
            <SettingsRow label="버전 정보" showArrow />
          </SettingsSection>
        </View>

        {/* 약관 / 개인정보 / 회원탈퇴 */}
        <View className="mt-[20px]">
          <Footer />
        </View>
      </ScrollView>
    </View>
  );
};

export default SettingScreen;
