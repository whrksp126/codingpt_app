import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// 자동 체크포인트 on/off — 기본 끔(사용자 확정 스펙). 켜면 useDaemonAutoCheckpoint 가
// 턴 종료/주기/전환 직전 스냅샷을 자동으로 찍는다(변경 없으면 데몬이 skip).
// 수동 체크포인트(IDE 동기화 버튼)와 클라우드 핸드오프 스냅샷은 이 설정과 무관하게 동작.
// displayScaleSetting 과 같은 패턴: 모듈 레벨 상태 + 리스너 + AsyncStorage 영속(기기 로컬).

const KEY = 'app:autoCheckpoint';

let enabled = false; // 기본 끔
let loaded = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

async function ensureLoaded() {
  if (loaded) return;
  loaded = true;
  try {
    const s = await AsyncStorage.getItem(KEY);
    if (s != null && (s === '1') !== enabled) { enabled = s === '1'; notify(); }
  } catch (_) { /* 기본값 유지 */ }
}

export function getAutoCheckpointEnabled(): boolean { return enabled; }

export async function setAutoCheckpointEnabled(v: boolean) {
  if (v === enabled) return;
  enabled = v; notify();
  try { await AsyncStorage.setItem(KEY, v ? '1' : '0'); } catch (_) { /* noop */ }
}

/** 비-훅 구독. 반환값 = 해제 함수. 저장값 로드도 트리거한다. */
export function subscribeAutoCheckpoint(fn: () => void): () => void {
  listeners.add(fn);
  ensureLoaded();
  return () => { listeners.delete(fn); };
}

export function useAutoCheckpointEnabled(): boolean {
  const [v, setV] = useState<boolean>(enabled);
  useEffect(() => {
    const l = () => setV(enabled);
    listeners.add(l); ensureLoaded(); setV(enabled);
    return () => { listeners.delete(l); };
  }, []);
  return v;
}
