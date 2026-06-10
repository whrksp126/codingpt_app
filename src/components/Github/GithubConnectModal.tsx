import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, Modal, ActivityIndicator, Alert, Image } from 'react-native';
import { WebView, WebViewNavigation } from 'react-native-webview';
import DefaultBtn from '../Button/DefaultBtn';
import DefaultIconBtn from '../Button/DefaultIconBtn';
import { CaretLeft } from '../../assets/SvgIcon';
import githubService, { GithubStatus } from '../../services/githubService';

type Props = {
  visible: boolean;
  onClose: () => void;
  onStatusChange?: (status: GithubStatus) => void;
};

// GitHub 연동 모달.
// 미연동: "GitHub 연결하기" → WebView 로 OAuth Authorize 페이지를 열고,
//   백엔드 콜백(/api/github/callback) 도달을 감지하면 닫고 상태를 새로고침한다.
// 연동됨: 계정 정보 + "연결 해제".
const GithubConnectModal: React.FC<Props> = ({ visible, onClose, onStatusChange }) => {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<GithubStatus>({ connected: false });
  const [authUrl, setAuthUrl] = useState<string | null>(null); // 설정 시 WebView 표시
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
    if (visible) {
      setAuthUrl(null);
      refreshStatus();
    }
  }, [visible, refreshStatus]);

  const startConnect = async () => {
    setWorking(true);
    try {
      const url = await githubService.getAuthorizeUrl();
      if (!url) {
        Alert.alert('오류', 'GitHub 연결을 시작할 수 없습니다.');
        return;
      }
      setAuthUrl(url);
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

  // WebView 가 백엔드 콜백 URL 에 도달하면 연동 완료로 간주
  const handleNavChange = (navState: WebViewNavigation) => {
    if (navState.url && navState.url.includes('/api/github/callback')) {
      // 콜백 결과 페이지가 로드 완료된 뒤 닫기
      if (!navState.loading) {
        setAuthUrl(null);
        refreshStatus();
      }
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={() => (authUrl ? setAuthUrl(null) : onClose())}>
      <View className="flex-1 bg-white dark:bg-[#0A0D14]">
        {/* 헤더 */}
        <View className="flex-row items-center px-[16px] pt-[50px] pb-[10px] border-b border-[#cccccc] dark:border-[#3F444D]">
          <DefaultIconBtn onPress={() => (authUrl ? setAuthUrl(null) : onClose())} size={35}>
            <CaretLeft width={35} height={35} fill="#CCCCCC" />
          </DefaultIconBtn>
          <View className="flex-1 items-center justify-center">
            <Text className="text-[22px] font-bold text-[#111111] dark:text-white">GitHub 연결</Text>
          </View>
          <View className="w-[35px]" />
        </View>

        {/* WebView (OAuth 진행 중) */}
        {authUrl ? (
          <WebView
            source={{ uri: authUrl }}
            onNavigationStateChange={handleNavChange}
            startInLoadingState
            renderLoading={() => (
              <View className="absolute inset-0 items-center justify-center">
                <ActivityIndicator size="large" />
              </View>
            )}
          />
        ) : loading ? (
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
                  text={working ? '준비 중…' : 'GitHub 연결하기'}
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
