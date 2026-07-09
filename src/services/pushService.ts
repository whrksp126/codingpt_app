import { Platform } from 'react-native';
import { api } from '../utils/api';

// 푸시 알림(M3-3) — 선골격.
// 토큰 등록/해제 API 배관은 완성돼 있고(백엔드 done/승인대기/크래시 트리거도 완성),
// 실제 디바이스 토큰 획득만 네이티브 라이브러리 연동 대기 상태다.
//
// ── GA 연동 절차(native 리빌드 필요) ─────────────────────────────────
//  1. 라이브러리 설치: @react-native-firebase/app + @react-native-firebase/messaging
//     (iOS: APNs 인증서 + GoogleService-Info.plist / Android: google-services.json)
//  2. 아래 initPush 의 TODO 블록을 활성화(messaging().requestPermission → getToken → registerPushToken)
//  3. onMessage / setBackgroundMessageHandler / getInitialNotification 로 수신+딥링크 라우팅
//     (딥링크는 parseSessionDeeplink 로 해석 → openSession 으로 이동)
// 라이브러리 미설치 상태에선 import 하면 Metro 번들이 깨지므로, 여기선 참조하지 않는다.

const NATIVE_MESSAGING_AVAILABLE = false; // 라이브러리 연동+리빌드 후 true

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

// 앱 시작 시 호출(App.tsx). 권한 요청 → 토큰 획득 → 등록.
//  현재는 네이티브 미연동이라 no-op. 라이브러리 연동 후 아래 블록을 켠다.
export async function initPush(): Promise<void> {
  if (!NATIVE_MESSAGING_AVAILABLE) {
    // 선골격: 네이티브 messaging 미연동 → 건너뜀(등록 API 는 준비됨).
    return;
  }
  // TODO(M3-3 GA): 아래 활성화 — 라이브러리 설치 후에만 import/호출 가능.
  //   const messaging = require('@react-native-firebase/messaging').default;
  //   const authStatus = await messaging().requestPermission();
  //   const enabled = authStatus === messaging.AuthorizationStatus.AUTHORIZED
  //                 || authStatus === messaging.AuthorizationStatus.PROVISIONAL;
  //   if (!enabled) return;
  //   const token = await messaging().getToken();
  //   if (token) await registerPushToken(token);
  //   messaging().onTokenRefresh((t: string) => { void registerPushToken(t); });
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

export default { initPush, registerPushToken, unregisterPushToken, parseSessionDeeplink };
