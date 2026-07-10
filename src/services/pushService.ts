import { Platform } from 'react-native';
import { api } from '../utils/api';

// 푸시 알림(M3-3 GA) — @react-native-firebase/messaging(FCM) 연동.
// iOS 도 Firebase 가 APNs 를 릴레이하므로 토큰은 양 플랫폼 모두 FCM 토큰(provider='fcm').
// 백엔드 발송(pushProviderService: FCM HTTP v1)이 이 토큰으로 전송한다.
// 네이티브 모듈 미링크(리빌드 전 dev) 환경에선 require 가 throw → try/catch 로 조용히 스킵(크래시 없음).

// 딥링크(codingpt://session/...)로 앱을 연 알림을 잠깐 보관 → 네비게이터 준비 후 소비.
let pendingDeeplink: string | null = null;
export function takePendingPushDeeplink(): string | null { const d = pendingDeeplink; pendingDeeplink = null; return d; }

function platformTag(): string {
  return Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';
}

// 디바이스 토큰을 백엔드에 등록(재발급 시 upsert). 토큰만 있으면 지금도 동작한다.
export async function registerPushToken(token: string, provider?: string): Promise<boolean> {
  if (!token) return false;
  try {
    const res = await api.push.register({ token, platform: platformTag(), provider });
    return !!res.success;
  } catch (_) { return false; }
}

export async function unregisterPushToken(token: string): Promise<boolean> {
  if (!token) return false;
  try {
    const res = await api.push.unregister(token);
    return !!res.success;
  } catch (_) { return false; }
}

// 앱 시작 시 호출(App.tsx, 로그인 후). 권한 요청 → FCM 토큰 획득 → 등록 → 갱신/수신 핸들러.
//  네이티브 미링크(리빌드 전)면 require 가 throw → 조용히 스킵(크래시 없음).
let _pushInited = false;
export async function initPush(): Promise<void> {
  if (_pushInited) return;
  try {
    const messaging = require('@react-native-firebase/messaging').default;

    // 권한 요청(iOS 팝업 / Android 13+ POST_NOTIFICATIONS). 거부면 토큰 등록 스킵.
    const authStatus = await messaging().requestPermission();
    const enabled = authStatus === messaging.AuthorizationStatus.AUTHORIZED
      || authStatus === messaging.AuthorizationStatus.PROVISIONAL;
    if (!enabled) { _pushInited = true; return; }

    const token = await messaging().getToken();
    if (token) await registerPushToken(token, 'fcm');
    messaging().onTokenRefresh((t: string) => { void registerPushToken(t, 'fcm'); });

    // 알림 탭으로 앱 진입(백그라운드/종료) → 딥링크 보관(네비게이터가 소비).
    messaging().onNotificationOpenedApp((msg: any) => {
      const link = msg?.data?.deeplink;
      if (typeof link === 'string' && link) pendingDeeplink = link;
    });
    const initial = await messaging().getInitialNotification();
    const initLink = initial?.data?.deeplink;
    if (typeof initLink === 'string' && initLink) pendingDeeplink = initLink;

    _pushInited = true;
  } catch (_) {
    // 네이티브 messaging 미링크(dev, 리빌드 전) — 조용히 스킵. 리빌드 후 정상 동작.
  }
}

// 세션 딥링크 파싱: codingpt://session/<sessionId>?kind=<done|permission_request|crashed>
//  푸시 탭 → 이 함수로 해석 → 최근세션/워크스페이스에서 sessionId 매칭해 openSession.
export function parseSessionDeeplink(url: string | null | undefined): { sessionId: string; kind: string | null } | null {
  if (!url || typeof url !== 'string') return null;
  const m = url.match(/^codingpt:\/\/session\/([^/?]+)(?:\?(.*))?$/);
  if (!m) return null;
  const sessionId = decodeURIComponent(m[1] || '');
  if (!sessionId) return null;
  let kind: string | null = null;
  if (m[2]) { const km = m[2].match(/(?:^|&)kind=([^&]+)/); if (km) kind = decodeURIComponent(km[1]); }
  return { sessionId, kind };
}

export default { initPush, registerPushToken, unregisterPushToken, parseSessionDeeplink, takePendingPushDeeplink };
