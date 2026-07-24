import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// 실물키보드 특수키 패널 배치(Windows/Mac) — 전역 설정(설정 화면에서 변경, IDE 패널이 소비).
// Context/Provider 없이 쓰도록 모듈 레벨 상태 + 리스너로 반응형 공유.
export type KeyboardOS = 'win' | 'mac';
const KEY = 'app:keyboardOS';

let current: KeyboardOS = 'mac';           // 기본값 = Mac (현재 macOS PC 앱만 개발됨)
let loaded = false;
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((l) => l());

async function ensureLoaded() {
  if (loaded) return;
  loaded = true;
  try {
    const v = await AsyncStorage.getItem(KEY);
    if (v === 'win' || v === 'mac') { current = v; notify(); }
  } catch (_) { /* 기본값 유지 */ }
}

export function getKeyboardOS(): KeyboardOS { return current; }

export async function setKeyboardOS(v: KeyboardOS) {
  if (current === v) return;
  current = v;
  notify();
  try { await AsyncStorage.setItem(KEY, v); } catch (_) { /* noop */ }
}

// 반응형 훅 — 설정 화면과 IDE 패널이 같은 값을 실시간 공유.
export function useKeyboardOS(): KeyboardOS {
  const [os, setOs] = useState<KeyboardOS>(current);
  useEffect(() => {
    const l = () => setOs(current);
    listeners.add(l);
    ensureLoaded();
    setOs(current);
    return () => { listeners.delete(l); };
  }, []);
  return os;
}
