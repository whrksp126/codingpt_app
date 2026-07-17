import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// 보조 키보드(보조바+특수키 패널) on/off — 기본 켬.
//  외장 키보드로 작업하는 iPad 등에선 꺼서 화면을 온전히 쓰게 한다(사용자 확정 스펙).
//  autoCheckpointSetting 과 동일한 모듈 싱글턴 + AsyncStorage 지연 로드 패턴.
const KEY = 'app:keyAssistEnabled';

let enabled = true;
let loaded = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => { try { fn(); } catch (_) { /* noop */ } });

async function ensureLoaded() {
  if (loaded) return;
  loaded = true;
  try {
    const v = await AsyncStorage.getItem(KEY);
    if (v === '0') { enabled = false; notify(); }
  } catch (_) { /* 기본값 유지 */ }
}
void ensureLoaded();

export function getKeyAssistEnabled(): boolean { return enabled; }

export async function setKeyAssistEnabled(v: boolean): Promise<void> {
  enabled = v;
  notify();
  try { await AsyncStorage.setItem(KEY, v ? '1' : '0'); } catch (_) { /* noop */ }
}

export function subscribeKeyAssistEnabled(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function useKeyAssistEnabled(): boolean {
  const [v, setV] = useState(enabled);
  useEffect(() => subscribeKeyAssistEnabled(() => setV(enabled)), []);
  return v;
}
