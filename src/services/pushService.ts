import { Platform } from 'react-native';
import { api } from '../utils/api';

// 푸시 알림(M3-3 GA) — @react-native-firebase/messaging(FCM) 연동.
// iOS 도 Firebase 가 APNs 를 릴레이하므로 토큰은 양 플랫폼 모두 FCM 토큰(provider='fcm').
// 백엔드 발송(pushProviderService: FCM HTTP v1)이 이 토큰으로 전송한다.
// 네이티브 모듈 미링크(리빌드 전 dev) 환경에선 require 가 throw → try/catch 로 조용히 스킵(크래시 없음).

// 딥링크(codingpt://session/...)로 앱을 연 알림을 잠깐 보관 → 네비게이터 준비 후 소비.
//  · 콜드스타트(종료 상태에서 알림 탭): getInitialNotification → pendingDeeplink 에 보관, 화면이 뜬 뒤 take.
//  · 앱 실행 중(백그라운드) 탭: onNotificationOpenedApp → 즉시 구독자에게 통지 + 보관(구독자 없을 때 대비).
let pendingDeeplink: string | null = null;
export function takePendingPushDeeplink(): string | null { const d = pendingDeeplink; pendingDeeplink = null; return d; }

// 딥링크 도착 시 즉시 반응할 구독자(HomeScreen 등). 여러 화면이 붙어도 되게 배열.
type DeeplinkListener = (link: string) => void;
const deeplinkListeners = new Set<DeeplinkListener>();
export function addPushDeeplinkListener(fn: DeeplinkListener): () => void {
  deeplinkListeners.add(fn);
  return () => { deeplinkListeners.delete(fn); };
}
function emitDeeplink(link: string) {
  pendingDeeplink = link;                              // 구독자 없거나 화면 미준비 시 pull 로 소비되게 보관
  for (const fn of deeplinkListeners) { try { fn(link); } catch (_) { /* noop */ } }
}

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

// 네이티브 일회성 셋업(권한 요청 + 핸들러 등록)은 앱 수명 동안 1회만.
//  토큰 등록은 매 initPush 호출마다(=로그인마다) 수행해야 계정이 바뀌어도 현재 사용자에 재귀속된다.
let _nativeInited = false;

// 앱 로그인 후 호출(App.tsx). 로그인 계정이 바뀔 때마다 다시 불려 현재 사용자로 토큰을 재등록한다.
//  네이티브 미링크(리빌드 전)면 require 가 throw → 조용히 스킵(크래시 없음).
export async function initPush(): Promise<void> {
  try {
    const messaging = require('@react-native-firebase/messaging').default;

    // ── 일회성 셋업(권한 + 수신 핸들러) ──
    if (!_nativeInited) {
      // 권한 요청(iOS 팝업 / Android 13+ POST_NOTIFICATIONS). 거부면 아래 토큰 등록에서 스킵.
      const authStatus = await messaging().requestPermission();
      const granted = authStatus === messaging.AuthorizationStatus.AUTHORIZED
        || authStatus === messaging.AuthorizationStatus.PROVISIONAL;

      // 토큰 재발급 시 현재 세션(=현재 사용자)으로 upsert. 핸들러는 1회만 등록(중복 방지).
      messaging().onTokenRefresh((t: string) => { void registerPushToken(t, 'fcm'); });

      // 알림 탭으로 앱 진입(백그라운드) → 즉시 구독자 통지 + 보관.
      messaging().onNotificationOpenedApp((msg: any) => {
        const link = msg?.data?.deeplink;
        if (typeof link === 'string' && link) emitDeeplink(link);
      });
      // 종료 상태에서 알림 탭으로 콜드스타트 → 보관(화면 준비 후 take).
      const initial = await messaging().getInitialNotification();
      const initLink = initial?.data?.deeplink;
      if (typeof initLink === 'string' && initLink) pendingDeeplink = initLink;

      _nativeInited = true;
      if (!granted) return; // 권한 거부 — 토큰 등록 스킵(핸들러는 이미 등록)
    }

    // ── 매 호출: 현재 사용자로 토큰 등록(로그인 계정 변경 대응) ──
    const token = await messaging().getToken();
    if (token) await registerPushToken(token, 'fcm');
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

export default { initPush, registerPushToken, unregisterPushToken, parseSessionDeeplink, takePendingPushDeeplink, addPushDeeplinkListener };
