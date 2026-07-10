/**
 * @format
 */

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

// FCM 백그라운드 메시지 핸들러(@react-native-firebase 요구) — 컴포넌트 밖에서 등록.
//  네이티브 미링크(리빌드 전)면 require 가 throw → 조용히 스킵. notification 메시지는 시스템이 자동 표시.
try {
  const messaging = require('@react-native-firebase/messaging').default;
  messaging().setBackgroundMessageHandler(async () => { /* data-only 처리용. notification 은 OS 가 표시 */ });
} catch (_) { /* dev(리빌드 전) — 무시 */ }

AppRegistry.registerComponent(appName, () => App);
