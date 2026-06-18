import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ActivityIndicator, Image, Linking, Pressable, Dimensions, BackHandler } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import { InAppBrowser } from 'react-native-inappbrowser-reborn';
import { ArrowLeft, GithubLogo } from 'phosphor-react-native';
import githubService, { GithubStatus } from '../../services/githubService';
import { useAppAlert } from '../../hooks/useAppAlert';
import { v2 } from '../../theme/v2Tokens';

const C = v2.colors;
const W = Dimensions.get('window').width;
const TIMING = { duration: 280, easing: Easing.out(Easing.cubic) };

type Props = {
  visible: boolean;
  onClose: () => void;
  onStatusChange?: (status: GithubStatus) => void;
};

// 시스템 인증세션 복귀용 딥링크 (백엔드 콜백이 이 scheme 으로 302 리디렉트 → 세션 자동 종료)
const REDIRECT_URL = 'codingpt://github-auth';

// GitHub 연동 시트 (계정 시트 위에 우측에서 push — RN Modal 의 bottom-up 대신 시트 흐름과 통일).
const GithubConnectModal: React.FC<Props> = ({ visible, onClose, onStatusChange }) => {
  const insets = useSafeAreaInsets();
  const { confirm, alert } = useAppAlert();
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<GithubStatus>({ connected: false });
  const [working, setWorking] = useState(false);

  const tx = useSharedValue(W); // 닫힘=W(우측 밖), 열림=0
  useEffect(() => {
    tx.value = withTiming(visible ? 0 : W, TIMING);
  }, [visible, tx]);
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }] }));

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

  // 열려 있을 때 하드웨어 백 → 이 시트만 닫기
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { onClose(); return true; });
    return () => sub.remove();
  }, [visible, onClose]);

  const startConnect = async () => {
    setWorking(true);
    try {
      const url = await githubService.getAuthorizeUrl();
      if (!url) {
        alert({ title: '오류', message: 'GitHub 연결을 시작할 수 없습니다.' });
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
            alert({ title: 'GitHub 연결 실패', message: msg });
          } else {
            await refreshStatus();
          }
        }
        // type === 'cancel' 이면 사용자가 닫은 것 → 아무 동작 안 함
      } else {
        // 폴백: 외부 브라우저로 열기 (복귀 시 AppState 로 상태 갱신은 안 되므로 안내)
        await Linking.openURL(url);
        await alert({ title: 'GitHub 연결', message: '브라우저에서 인증을 마친 뒤 앱으로 돌아와 주세요.' });
        refreshStatus();
      }
    } catch (e: any) {
      alert({ title: '오류', message: e?.message || 'GitHub 연결 중 문제가 발생했습니다.' });
    } finally {
      setWorking(false);
    }
  };

  const handleDisconnect = async () => {
    const yes = await confirm({ title: 'GitHub 연결 해제', message: '연결을 해제하면 더 이상 학습 산출물이 자동 저장되지 않습니다.', confirmText: '연결 해제', danger: true });
    if (!yes) return;
    const ok = await githubService.disconnect();
    if (ok) await refreshStatus();
    else alert({ title: '오류', message: '연결 해제에 실패했습니다.' });
  };

  return (
    <View pointerEvents={visible ? 'auto' : 'none'} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
      <Animated.View style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: C.base }, sheetStyle]}>
        {/* 헤더 (계정/설정 시트와 동일) */}
        <View style={{ paddingTop: Math.max(insets.top, 10), backgroundColor: C.base, borderBottomWidth: 1, borderBottomColor: C.border }}>
          <View style={{ height: 52, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 }}>
            <Pressable onPress={onClose} hitSlop={8} style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
              <ArrowLeft size={22} color={C.text} />
            </Pressable>
            <Text style={{ flex: 1, fontSize: 17, fontWeight: '700', color: C.text }}>GitHub 연결</Text>
          </View>
        </View>

        {loading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator size="large" color={C.accent} />
          </View>
        ) : (
          <View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 28 }}>
            {status.connected ? (
              <>
                <View style={{ alignItems: 'center', marginBottom: 28 }}>
                  {status.avatarUrl ? (
                    <Image source={{ uri: status.avatarUrl }} style={{ width: 72, height: 72, borderRadius: 36, marginBottom: 12, borderWidth: 1, borderColor: C.border }} />
                  ) : (
                    <View style={{ width: 72, height: 72, borderRadius: 36, marginBottom: 12, backgroundColor: C.elevated2, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}>
                      <GithubLogo size={34} color={C.text2} />
                    </View>
                  )}
                  <Text style={{ fontSize: 19, fontWeight: '700', color: C.text, fontFamily: v2.font.mono }}>@{status.login}</Text>
                  <Text style={{ fontSize: 13.5, color: C.textDim, marginTop: 8, textAlign: 'center', lineHeight: 20 }}>
                    레슨 완료 시 산출물이 이 계정에{'\n'}자동 저장됩니다.
                  </Text>
                </View>
                <Pressable
                  onPress={handleDisconnect}
                  style={{ height: 48, borderRadius: v2.radius.md, borderWidth: 1, borderColor: C.error, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text style={{ color: C.error, fontSize: 15, fontWeight: '700' }}>연결 해제</Text>
                </Pressable>
              </>
            ) : (
              <>
                <View style={{ alignItems: 'center', marginBottom: 24 }}>
                  <View style={{ width: 64, height: 64, borderRadius: 16, backgroundColor: C.elevated2, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                    <GithubLogo size={32} color={C.text} weight="fill" />
                  </View>
                  <Text style={{ fontSize: 14, color: C.text2, lineHeight: 22, textAlign: 'center' }}>
                    GitHub 계정을 연결하면, 레슨을 완료할 때마다{'\n'}학습한 코드와 산출물이 내 GitHub{'\n'}레포지토리(클래스 단위)에 자동 저장됩니다.
                  </Text>
                </View>
                <Pressable
                  onPress={startConnect}
                  disabled={working}
                  style={{ height: 48, borderRadius: v2.radius.md, backgroundColor: '#24292f', borderWidth: 1, borderColor: C.borderControl, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: working ? 0.6 : 1 }}
                >
                  <GithubLogo size={19} color="#fff" weight="fill" />
                  <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>{working ? '연결 중…' : 'GitHub 연결하기'}</Text>
                </Pressable>
              </>
            )}
          </View>
        )}
      </Animated.View>
    </View>
  );
};

export default GithubConnectModal;
