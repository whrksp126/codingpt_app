import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// "PC 를 사용 중일 땐 이 폰 알림 안 울리기" 토글 — 기본 켬(true=무음).
//  켬(true)  = PC 를 실제로 쓰는 중(present=pc+최근활성)이면 이 폰엔 푸시가 오지 않음(중복 알림 방지).
//  끔(false) = PC 사용 중에도 이 폰에 항상 푸시.
//  폰이 활성(인앱)일 때·아무 기기도 안 볼 때의 라우팅은 이 설정과 무관(서버 present-device 라우팅).
//  서버 저장 필드는 반대 방향(alert_when_pc_active = !silence) — 등록/토글 시 미러한다.
//  autoCheckpointSetting 과 같은 패턴: 모듈 레벨 상태 + 리스너 + AsyncStorage(기기 로컬).

const KEY = 'app:silencePhoneWhenPcActive';

let silence = true; // 기본 켬(무음)
let loaded = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export async function ensureSilenceLoaded(): Promise<void> {
  if (loaded) return;
  loaded = true;
  try {
    const s = await AsyncStorage.getItem(KEY);
    if (s != null && (s === '1') !== silence) { silence = s === '1'; notify(); }
  } catch (_) { /* 기본값 유지 */ }
}

export function getSilenceWhenPcActive(): boolean { return silence; }

// 서버 등록에 실을 값(alert_when_pc_active) — 무음의 반대.
export function getAlertWhenPcActive(): boolean { return !silence; }

export async function setSilenceWhenPcActive(v: boolean) {
  if (v === silence) return;
  silence = v; notify();
  try { await AsyncStorage.setItem(KEY, v ? '1' : '0'); } catch (_) { /* noop */ }
}

/** 비-훅 구독. 반환값 = 해제 함수. 저장값 로드도 트리거한다. */
export function subscribeSilenceWhenPcActive(fn: () => void): () => void {
  listeners.add(fn);
  ensureSilenceLoaded();
  return () => { listeners.delete(fn); };
}

export function useSilenceWhenPcActive(): boolean {
  const [v, setV] = useState<boolean>(silence);
  useEffect(() => {
    const l = () => setV(silence);
    listeners.add(l); ensureSilenceLoaded(); setV(silence);
    return () => { listeners.delete(l); };
  }, []);
  return v;
}
