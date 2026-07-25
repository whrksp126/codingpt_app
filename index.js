/**
 * @format
 */

import { AppRegistry, NativeModules, Platform } from 'react-native';
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

// 알림 액션(승인 [허용]/[거절]) 드레인 — 컴포넌트 밖에서 등록해야 한다.
//  알림 액션은 앱이 종료된 상태에서도 앱을 백그라운드로 띄우는데, App 트리 마운트를 기다리면
//  네이티브가 붙들어 둔 백그라운드 실행 창(~25s)을 놓친다. 번들 평가 직후 바로 드레인.
try {
  const { startNativeApprovalActionBridge } = require('./src/services/approvalActionQueue');
  startNativeApprovalActionBridge();
} catch (_) { /* dev(리빌드 전) — 무시 */ }

// 승인 알림 액션 버튼(Android) — 앱이 종료돼 있어도 JS 를 깨워 네이티브 액션 큐를 비운다.
//  네이티브(ApprovalActionReceiver)는 결정을 디스크 큐에 적재만 하고, 전송은 위의 드레인이 담당한다
//  (accessToken 401→refresh 회전을 JS 에만 두어 토큰 사본을 만들지 않는다 — approvalActionQueue.ts 근거).
//  iOS 는 알림 액션이 앱을 백그라운드로 띄우면서 번들이 평가되므로 위 startNativeApprovalActionBridge()
//  만으로 충분하지만, Android 는 그 진입점이 없어 HeadlessJsTaskService 가 이 태스크를 깨운다.
//  ⚠ 태스크가 먼저 resolve 되면 RN 인스턴스가 내려가 전송이 끊길 수 있어, 큐가 빌 때까지 붙잡는다.
if (Platform.OS === 'android') {
  AppRegistry.registerHeadlessTask('CptApprovalResponse', () => async () => {
    let q = null;
    try { q = require('./src/services/approvalActionQueue'); } catch (_) { return; }
    const native = NativeModules.CptApproval;
    for (let i = 0; i < 12; i++) {
      try { await q.drainNativeApprovalActions(); } catch (_) { /* 다음 루프에서 재시도 */ }
      let left = 0;
      try { left = ((await native?.pendingActions?.()) || []).length; } catch (_) { left = 0; }
      if (!left) return;
      await new Promise((r) => setTimeout(r, 800)); // 다른 드레인이 진행 중이거나 네트워크 대기
    }
  });
}

AppRegistry.registerComponent(appName, () => App);
