import { useEffect, useState } from 'react';
import { AppState, NativeEventEmitter, NativeModules, Platform } from 'react-native';

// 물리(외장) 키보드 연결 여부 — **OS 에 직접 물어본다**.
//
// 왜 추측하지 않나: "키보드 높이가 작으면 외장" 같은 휴리스틱은 플로팅 키보드·분할 키보드·
//  기기별 액세서리 바 높이에서 전부 틀린다. iOS 는 GameController 의 GCKeyboard, Android 는
//  Configuration.keyboard/hardKeyboardHidden 이라는 정답 API 가 있으므로 그걸 쓴다.
//
// 네이티브 모듈이 없는 빌드(구버전 설치본·테스트 환경)에서는 조용히 false — 기존 동작 유지.
const Native = NativeModules.HardwareKeyboard as
  | { getConnected(): Promise<boolean>; addListener?(e: string): void; removeListeners?(n: number): void }
  | undefined;

let connected = false;
let started = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => { try { fn(); } catch (_) { /* noop */ } });

function setConnected(v: boolean) {
  if (connected === v) return;
  connected = v;
  notify();
}

function start() {
  if (started || !Native) return;
  started = true;
  Native.getConnected().then(setConnected).catch(() => { /* 조회 실패 → false 유지 */ });
  try {
    const emitter = new NativeEventEmitter(Native as any);
    emitter.addListener('hardwareKeyboardChanged', (e: { connected?: boolean }) => setConnected(!!e?.connected));
  } catch (_) { /* 이벤트 미지원 빌드 — 최초 조회값만 쓴다 */ }
  // 백그라운드에 있는 동안 꽂거나 뽑으면 알림을 놓칠 수 있다 — 돌아올 때 한 번 다시 묻는다.
  AppState.addEventListener('change', (s) => { if (s === 'active') refreshHardwareKeyboard(); });
}

export function isHardwareKeyboardConnected(): boolean { return connected; }

/** 재조회 — 앱이 포그라운드로 돌아왔을 때처럼 이벤트를 놓쳤을 수 있는 시점에 부른다. */
export function refreshHardwareKeyboard(): void {
  if (!Native) return;
  Native.getConnected().then(setConnected).catch(() => { /* noop */ });
}

export function useHardwareKeyboard(): boolean {
  const [v, setV] = useState(connected);
  useEffect(() => {
    start();
    const fn = () => setV(connected);
    listeners.add(fn);
    fn();
    return () => { listeners.delete(fn); };
  }, []);
  return v;
}

export const _internals = { setConnected, supported: !!Native, platform: Platform.OS };
export default useHardwareKeyboard;
