/**
 * @format
 */

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

// FCM 백그라운드 메시지 핸들러(@react-native-firebase 요구) — 컴포넌트 밖에서 등록.
//  네이티브 미링크(리빌드 전)면 require 가 throw → 조용히 스킵. notification 메시지는 시스템이 자동 표시.
//  data-only(type:'notif_dismiss') = 크로스기기 dismiss — 다른 기기에서 읽은 알림의 트레이 배너 회수.
try {
  const messaging = require('@react-native-firebase/messaging').default;
  const { handlePushDataMessage } = require('./src/services/pushService');
  messaging().setBackgroundMessageHandler(async (msg) => { handlePushDataMessage(msg); });
} catch (_) { /* dev(리빌드 전) — 무시 */ }

AppRegistry.registerComponent(appName, () => App);
