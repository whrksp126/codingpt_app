import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// 기기별 표시 배율 — 터미널(xterm)/IDE 에디터(CodeMirror) 폰트 크기에 곱하는 로컬 설정.
// 데몬 PC에서 정배율인 내용이 폰/태블릿에선 물리 크기·해상도 차이로 너무 작거나 크게 보이는 문제를
// 기기 로컬 배율로 보정한다("더 넓게(작게) ↔ 더 좁게(크게)"). 프리뷰 줌은 대상 아님.
// keyAssistSettings 와 같은 패턴: Context 없이 모듈 레벨 상태 + 리스너 + AsyncStorage 영속.

const KEY = 'app:displayScale';
const MIN = 0.7;
const MAX = 1.5;

/** 설정 UI 프리셋(세그먼트 5단계). 1.0 = 현행 유지(기본). */
export const DISPLAY_SCALE_PRESETS = [0.8, 0.9, 1.0, 1.15, 1.3] as const;

let scale = 1.0;
let loaded = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

const clamp = (v: number) => Math.min(MAX, Math.max(MIN, v));

async function ensureLoaded() {
  if (loaded) return;
  loaded = true;
  try {
    const s = await AsyncStorage.getItem(KEY);
    const v = s == null ? NaN : parseFloat(s);
    if (isFinite(v) && v >= MIN && v <= MAX && v !== scale) { scale = v; notify(); }
  } catch (_) { /* 기본값 유지 */ }
}

export function getDisplayScale(): number { return scale; }

export async function setDisplayScale(v: number) {
  const next = clamp(v);
  if (!isFinite(next) || next === scale) return;
  scale = next; notify();
  try { await AsyncStorage.setItem(KEY, String(next)); } catch (_) { /* noop */ }
}

/** 비-훅 구독(웹뷰 브리지 등). 반환값 = 해제 함수. 저장값 로드도 트리거한다. */
export function subscribeDisplayScale(fn: () => void): () => void {
  listeners.add(fn);
  ensureLoaded();
  return () => { listeners.delete(fn); };
}

export function useDisplayScale(): number {
  const [v, setV] = useState<number>(scale);
  useEffect(() => {
    const l = () => setV(scale);
    listeners.add(l); ensureLoaded(); setV(scale);
    return () => { listeners.delete(l); };
  }, []);
  return v;
}

/** 기준 폰트에 배율 적용(0.5px 단위 반올림 — 배율 1.0이면 기준값 그대로, 최소 8px). */
export function scaledFontPx(base: number): number {
  return Math.max(8, Math.round(base * scale * 2) / 2);
}
