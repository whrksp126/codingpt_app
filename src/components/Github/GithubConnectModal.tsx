import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, Modal, ActivityIndicator, Alert, Image, Linking } from 'react-native';
import { InAppBrowser } from 'react-native-inappbrowser-reborn';
import DefaultBtn from '../Button/DefaultBtn';
import DefaultIconBtn from '../Button/DefaultIconBtn';
import { CaretLeft } from '../../assets/SvgIcon';
import githubService, { GithubStatus } from '../../services/githubService';

type Props = {
  visible: boolean;
  onClose: () => void;
  onStatusChange?: (status: GithubStatus) => void;
};

// 시스템 인증세션 복귀용 딥링크 (백엔드 콜백이 이 scheme 으로 302 리디렉트 → 세션 자동 종료)
const REDIRECT_URL = 'codingpt://github-auth';

// GitHub 연동 모달.
// 미연동: "GitHub 연결하기" → 시스템 인증세션(ASWebAuthenticationSession / Chrome Custom Tabs)으로
//   GitHub 인가 페이지를 연다(시스템 브라우저 세션 공유 → Google SSO·기존 로그인 사용 가능).
//   인증 후 백엔드가 codingpt://github-auth 로 리디렉트 → 세션 자동 종료 → 상태 새로고침.
// 연동됨: 계정 정보 + "연결 해제".
const GithubConnectModal: React.FC<Props> = ({ visible, onClose, onStatusChange }) => {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<GithubStatus>({ connected: false });
  const [working, setWorking] = useState(false);

  const refreshStatus = useCallback(async () => {
    setLoading(true);
    try {
      const s = await githubService.getStatus();
      setStatus(s);
      onStatusChange?.(s);
    } finally {
      setLoading(false);
    }
  }, [onStatusChange]);

  useEffect(() => {
    if (visible) refreshStatus();
  }, [visible, refreshStatus]);

  const startConnect = async () => {
    setWorking(true);
    try {
      const url = await githubService.getAuthorizeUrl();
      if (!url) {
        Alert.alert('오류', 'GitHub 연결을 시작할 수 없습니다.');
        return;
      }

      const available = await InAppBrowser.isAvailable();
      if (available) {
        // 시스템 인증세션: 인증 후 REDIRECT_URL 도달 시 자동 종료되어 result 반환
        const result = await InAppBrowser.openAuth(url, REDIRECT_URL, {
          ephemeralWebSession: false, // 시스템 브라우저 세션 공유 (재로그인 최소화)
          showTitle: false,
          enableUrlBarHiding: true,
          enableDefaultShare: false,
        });
        if (result.type === 'success' && result.url) {
          if (result.url.includes('status=error')) {
            const msg = decodeURIComponent((result.url.split('message=')[1] || '').split('&')[0] || '연결 실패');
            Alert.alert('GitHub 연결 실패', msg);
          } else {
            await refreshStatus();
          }
        }
        // type === 'cancel' 이면 사용자가 닫은 것 → 아무 동작 안 함
      } else {
        // 폴백: 외부 브라우저로 열기 (복귀 시 AppState 로 상태 갱신은 안 되므로 안내)
        await Linking.openURL(url);
        Alert.alert('GitHub 연결', '브라우저에서 인증을 마친 뒤 앱으로 돌아와 주세요.', [
          { text: '확인', onPress: () => refreshStatus() },
        ]);
      }
    } catch (e: any) {
      Alert.alert('오류', e?.message || 'GitHub 연결 중 문제가 발생했습니다.');
    } finally {
      setWorking(false);
    }
  };

  const handleDisconnect = () => {
    Alert.alert('GitHub 연결 해제', '연결을 해제하면 더 이상 학습 산출물이 자동 저장되지 않습니다.', [
      { text: '취소', style: 'cancel' },
      {
        text: '연결 해제',
        style: 'destructive',
        onPress: async () => {
          const ok = await githubService.disconnect();
          if (ok) await refreshStatus();
          else Alert.alert('오류', '연결 해제에 실패했습니다.');
        },
      },
    ]);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 bg-white dark:bg-[#0A0D14]">
        {/* 헤더 */}
        <View className="flex-row items-center px-[16px] pt-[50px] pb-[10px] border-b border-[#cccccc] dark:border-[#3F444D]">
          <DefaultIconBtn onPress={onClose} size={35}>
            <CaretLeft width={35} height={35} fill="#CCCCCC" />
          </DefaultIconBtn>
          <View className="flex-1 items-center justify-center">
            <Text className="text-[22px] font-bold text-[#111111] dark:text-white">GitHub 연결</Text>
          </View>
          <View className="w-[35px]" />
        </View>

        {loading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" />
          </View>
        ) : (
          <View className="flex-1 px-[20px] pt-[30px]">
            {status.connected ? (
              <>
                <View className="items-center mb-[24px]">
                  {status.avatarUrl ? (
                    <Image source={{ uri: status.avatarUrl }} className="w-[72px] h-[72px] rounded-full mb-[10px]" />
                  ) : null}
                  <Text className="text-[20px] font-bold text-[#111111] dark:text-white">@{status.login}</Text>
                  <Text className="text-[14px] text-[#777777] dark:text-[#9CA3AF] mt-[4px]">
                    레슨 완료 시 산출물이 이 계정에 자동 저장됩니다.
                  </Text>
                </View>
                <DefaultBtn
                  onPress={handleDisconnect}
                  text="연결 해제"
                  buttonClassName="bg-white dark:bg-[#1B1F27] border border-[#FE4C4A] rounded-[10px] py-[12px] px-[10px] flex-row items-center justify-center"
                  textClassName="text-[#FE4C4A] text-[18px] font-bold"
                  flex={false}
                />
              </>
            ) : (
              <>
                <Text className="text-[16px] text-[#3c3c3c] dark:text-[#E1E6EF] leading-[24px] mb-[24px]">
                  GitHub 계정을 연결하면, 레슨을 완료할 때마다 학습한 코드와 산출물이{'\n'}
                  자동으로 내 GitHub 레포지토리(클래스 단위)에 저장됩니다.
                </Text>
                <DefaultBtn
                  onPress={startConnect}
                  text={working ? '연결 중…' : 'GitHub 연결하기'}
                  buttonClassName="bg-[#24292f] rounded-[10px] py-[12px] px-[10px] flex-row items-center justify-center"
                  textClassName="text-white text-[18px] font-bold"
                  flex={false}
                />
              </>
            )}
          </View>
        )}
      </View>
    </Modal>
  );
};

export default GithubConnectModal;
