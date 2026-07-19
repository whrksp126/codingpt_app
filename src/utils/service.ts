import Config from 'react-native-config';
import { Platform } from 'react-native';
import DeviceInfo from 'react-native-device-info';

const isEmulator = DeviceInfo.isEmulatorSync();

const resolveLocalUrl = (
  emulatorHost: string,
  realDeviceUrl: string | undefined,
  port: string,
): string => {
  if (isEmulator) {
    return `http://${emulatorHost}:${port}`;
  }
  return realDeviceUrl!;
};

const BACK_PORT = '5300';
const FRONT_PORT = '3100';

const BACK_URL =
  Config.NODE_ENV === 'local'
    ? Platform.OS === 'android'
      ? resolveLocalUrl('10.0.2.2', Config.ANDROID_BACK_URL, BACK_PORT)
      : resolveLocalUrl('localhost', Config.IOS_BACK_URL, BACK_PORT)
    : Config.BACK_URL!;

const FRONT_URL =
  Config.NODE_ENV === 'local'
    ? Platform.OS === 'android'
      ? resolveLocalUrl('10.0.2.2', Config.ANDROID_FRONT_URL, FRONT_PORT)
      : resolveLocalUrl('localhost', Config.IOS_FRONT_URL, FRONT_PORT)
    : Config.FRONT_URL!;

// 결제 웹 서비스(인앱 결제 금지 → 별도 웹에서 월 구독). 한도 도달 시 인앱 브라우저로 유도.
const PAYMENT_WEB_URL = Config.PAYMENT_WEB_URL || 'https://codingpt.ghmate.com';

// 터미널/pane WS 릴레이 전용 저지연 엔드포인트 — Cloudflare 우회 직결 도메인(wss://codingpt-direct...).
// 키 입력이 매번 CF 엣지를 왕복(≈120ms/leg)하던 걸 직결(≈수ms)로 단축. 설정된 경우 터미널 WS 만
// 이 base 를 쓰고(REST/기타는 BACK_URL=CF 유지), 미설정(local/dev)이면 BACK_URL 에서 파생(기존 동작).
const RELAY_WS_URL = Config.RELAY_WS_URL
  ? Config.RELAY_WS_URL.replace(/\/+$/, '')
  : BACK_URL.replace(/^http/, 'ws').replace(/\/+$/, '');

export { BACK_URL, FRONT_URL, PAYMENT_WEB_URL, RELAY_WS_URL };
