// 공용 jest 셋업 — 네이티브 전용 모듈을 수집 가능하게 목킹한다.
//
// react-native-reanimated: 실제 엔트리가 네이티브 바인딩·신형 문법을 요구해 jest 수집 자체가
//  실패한다(App.test.tsx 가 ThemeContext → reanimated import 로 로드 불가하던 원인). 패키지가
//  동봉한 공식 mock 으로 대체한다 — 애니메이션은 no-op 이 되고 렌더 트리는 그대로 검증된다.
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

// AsyncStorage: 네이티브 모듈이 없어 null — 패키지 동봉 공식 mock(인메모리)으로 대체.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

// DeviceInfo: import 시점에 NativeEventEmitter 를 만들어 네이티브 없이는 로드 자체가 죽는다 —
//  패키지 동봉 공식 mock 으로 대체.
jest.mock('react-native-device-info', () => require('react-native-device-info/jest/react-native-device-info-mock'));

// react-native-config: jest 에선 .env 가 없어 빈 객체 — BACK_URL 파생(.replace)이 즉사한다.
//  테스트용 더미 값만 제공한다(네트워크는 어차피 나가지 않는다).
jest.mock('react-native-config', () => ({ BACK_URL: 'http://localhost:5300' }));

// 제스처 핸들러: 공식 jestSetup(네이티브 모듈 목킹)을 로드한다.
require('react-native-gesture-handler/jestSetup');

// 햅틱: TurboModule 강제 조회가 네이티브 없이는 throw — no-op 으로 대체.
jest.mock('react-native-haptic-feedback', () => ({
  __esModule: true,
  default: { trigger: jest.fn() },
  HapticFeedbackTypes: {},
}));

// ── 이하: import 시점에 네이티브 바인딩을 요구해 수집을 죽이는 모듈들의 최소 no-op ──
//  (App.test.tsx 가 App 트리 전체를 렌더하므로 트리에 걸리는 네이티브 전부가 대상이다)
jest.mock('@react-native-documents/picker', () => ({
  pick: jest.fn(), keepLocalCopy: jest.fn(), types: {}, errorCodes: {}, isErrorWithCode: () => false,
}));
jest.mock('react-native-image-picker', () => ({ launchCamera: jest.fn(), launchImageLibrary: jest.fn() }));
jest.mock('@react-native-firebase/app', () => ({ __esModule: true, default: { apps: [] } }));
jest.mock('@react-native-firebase/messaging', () => {
  const m = () => ({
    getToken: jest.fn(async () => 'tok'), onMessage: jest.fn(() => () => {}),
    onNotificationOpenedApp: jest.fn(() => () => {}), getInitialNotification: jest.fn(async () => null),
    requestPermission: jest.fn(async () => 1), onTokenRefresh: jest.fn(() => () => {}),
    setBackgroundMessageHandler: jest.fn(),
  });
  m.AuthorizationStatus = { AUTHORIZED: 1, PROVISIONAL: 2, DENIED: 0 };
  return { __esModule: true, default: m };
});
jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: { configure: jest.fn(), signIn: jest.fn(), signOut: jest.fn(), hasPlayServices: jest.fn(async () => true) },
  statusCodes: {},
}));
jest.mock('@invertase/react-native-apple-authentication', () => ({
  __esModule: true,
  default: { isSupported: false, performRequest: jest.fn() },
  appleAuth: { isSupported: false, performRequest: jest.fn(), Operation: {}, Scope: {} },
}));
jest.mock('react-native-keychain', () => ({
  getGenericPassword: jest.fn(async () => false), setGenericPassword: jest.fn(async () => true),
  resetGenericPassword: jest.fn(async () => true),
}));
jest.mock('react-native-bootsplash', () => ({ hide: jest.fn(async () => {}), isVisible: jest.fn(async () => false) }));
// 문자열 컴포넌트 목 — 팩토리 안에서 react-native 를 require 하면 nativewind(css-interop) 바벨
//  변환이 밖의 헬퍼 변수를 주입해 jest.mock 팩토리 규칙에 걸린다. 문자열 타입은 호스트 컴포넌트로
//  렌더되므로 트리 검증에 충분하다.
jest.mock('react-native-webview', () => ({ __esModule: true, default: 'WebView', WebView: 'WebView' }));
jest.mock('react-native-get-random-values', () => ({}));
jest.mock('react-native-tcp-socket', () => ({ createConnection: jest.fn(), createServer: jest.fn() }));
jest.mock('react-native-blob-util', () => ({ __esModule: true, default: { fs: { dirs: {} }, config: jest.fn() } }));
jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn() }));
jest.mock('react-native-purchases', () => ({ __esModule: true, default: { configure: jest.fn(), getOfferings: jest.fn() } }));
jest.mock('react-native-inappbrowser-reborn', () => ({ __esModule: true, default: { isAvailable: jest.fn(async () => false), open: jest.fn() } }));
jest.mock('lottie-react-native', () => ({ __esModule: true, default: 'LottieView' }));
