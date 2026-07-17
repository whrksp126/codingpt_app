import { NativeModules, Platform } from 'react-native';

// Android 창 softInputMode 런타임 전환(네이티브 모듈 SoftInputModeModule).
//  특수키 패널 세션 동안 'nothing'(키보드가 창을 안 줄임 — 패널이 키보드 뒤에 깔림),
//  평소/복귀 시 'resize'. iOS 는 창 리사이즈 개념이 없어 no-op.
export function setSoftInputMode(mode: 'nothing' | 'resize'): void {
  if (Platform.OS !== 'android') return;
  try { NativeModules.SoftInputMode?.setMode(mode); } catch (_) { /* 구 빌드(모듈 없음) — 무시 */ }
}
