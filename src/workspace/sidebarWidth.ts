// 사이드바(워크스페이스 목록) 폭 — 우측 테두리 드래그로 조절, AsyncStorage 영속(기기 로컬).
//  PC(--sb-w localStorage)와 같은 개념: 태블릿 도킹 사이드바와 폰 오버레이 드로어가 공유한다.
//  keyAssistSettings 와 같은 패턴: 모듈 레벨 상태 + 리스너(Context 없이 실시간 공유).
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'app:sidebarW';
export const SB_MIN = 220;
export const SB_DEFAULT = 300;

let width = SB_DEFAULT;
let loaded = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

// 화면 폭에 따른 상한 — 내부 콘텐츠 가독(최소)과 메인 영역 확보(최대) 사이 클램프.
export function clampSbWidth(w: number, screenW: number): number {
  const max = Math.min(480, Math.round(screenW * 0.6));
  return Math.max(SB_MIN, Math.min(max, Math.round(w)));
}

async function ensureLoaded() {
  if (loaded) return;
  loaded = true;
  try {
    const v = parseInt((await AsyncStorage.getItem(KEY)) || '', 10);
    if (v && v !== width) { width = v; notify(); }
  } catch (_) { /* 기본값 유지 */ }
}

export function getSidebarWidth(): number { return width; }
export function setSidebarWidth(w: number, persist = true) {
  const v = Math.round(w);
  if (v === width) return;
  width = v;
  notify();
  if (persist) AsyncStorage.setItem(KEY, String(v)).catch(() => { /* noop */ });
}

export function useSidebarWidth(): number {
  const [v, setV] = useState(width);
  useEffect(() => {
    const l = () => setV(width);
    listeners.add(l);
    void ensureLoaded();
    setV(width);
    return () => { listeners.delete(l); };
  }, []);
  return v;
}
