// QR 페어링 딥링크 자동승인 — 폰 카메라로 PC 화면의 QR(`codingpt://pair?code=...`)을 스캔하면
//  시스템이 이 앱을 그 URL 로 연다 → 로그인돼 있으면 자동으로 승인(approve)해 PC 를 이 계정에 연결한다.
//  (github OAuth 등 다른 codingpt:// 딥링크와 충돌하지 않도록 `pair` + `code=` 만 처리.)
import { useCallback, useEffect, useRef } from 'react';
import { Linking, Alert } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import daemonService from '../services/daemonService';

// codingpt://pair?code=XXXX-XXXX  →  "XXXX-XXXX"
export function extractPairCode(url: string | null | undefined): string | null {
  if (!url) return null;
  if (!/pair/i.test(url)) return null;
  const m = url.match(/[?&]code=([^&#]+)/i);
  if (!m) return null;
  try { return decodeURIComponent(m[1]).trim().toUpperCase(); } catch { return m[1].trim().toUpperCase(); }
}

export function usePairDeepLink() {
  const { isLoggedIn } = useAuth();
  const busy = useRef(false);
  const pending = useRef<string | null>(null);

  const doApprove = useCallback(async (code: string) => {
    if (busy.current) return;
    busy.current = true;
    try {
      const { deviceName } = await daemonService.approvePairSession(code);
      Alert.alert('PC 연결 승인됨', `${deviceName || '내 PC'} 연결을 마무리하는 중이에요. 잠시 후 자동으로 연결됩니다.`);
    } catch (e: any) {
      Alert.alert('연결 실패', e?.message || '연결 코드가 유효하지 않거나 만료되었어요.');
    } finally {
      busy.current = false;
    }
  }, []);

  // 보안: 딥링크는 어떤 앱/웹페이지든 발생시킬 수 있으므로(codingpt://pair 는 exported scheme),
  //  자동 승인하지 않고 반드시 사용자에게 코드를 보여주고 확인받는다 — 악성 사이트가 피해자 계정에
  //  공격자 PC 를 페어링하는 CSRF 를 차단(PC 화면의 코드와 대조).
  const approve = useCallback((code: string) => {
    if (busy.current) return;
    Alert.alert(
      '이 PC를 연결할까요?',
      `PC 화면에 표시된 코드와 같은지 확인하세요.\n\n${code}`,
      [
        { text: '취소', style: 'cancel' },
        { text: '연결', style: 'default', onPress: () => { void doApprove(code); } },
      ],
      { cancelable: true },
    );
  }, [doApprove]);

  const handleUrl = useCallback((url: string | null | undefined) => {
    const code = extractPairCode(url);
    if (!code) return;
    if (!isLoggedIn) { pending.current = code; return; } // 로그인 후 처리
    void approve(code);
  }, [isLoggedIn, approve]);

  // Linking 구독 + 콜드스타트 초기 URL
  useEffect(() => {
    const sub = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    Linking.getInitialURL().then(handleUrl).catch(() => { /* noop */ });
    return () => sub.remove();
  }, [handleUrl]);

  // 로그인 완료 시 보류된 코드 승인
  useEffect(() => {
    if (isLoggedIn && pending.current) {
      const c = pending.current;
      pending.current = null;
      void approve(c);
    }
  }, [isLoggedIn, approve]);
}
