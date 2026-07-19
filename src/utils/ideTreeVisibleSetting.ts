import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// IDE 파일 탐색기(트리) 표시 여부 — 기기 로컬 전역 기본값. 사용자가 트리를 닫으면 그 선택을 유지해
// 다음에 IDE 를 열 때도 닫힌 상태로 시작한다(매번 열려 불편하다는 피드백). 세션 내 pane 별 토글은
// 여전히 가능하되, 새 pane/탭의 기본값과 앱 재시작 후 상태가 이 값을 따른다.
// displayScaleSetting 과 동일 패턴: Context 없이 모듈 레벨 상태 + 리스너 + AsyncStorage 영속.

const KEY = 'app:ideTreeVisible';

let visible = true;               // 기본 = 열림(기존 동작)
let loaded = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

async function ensureLoaded() {
  if (loaded) return;
  loaded = true;
  try {
    const s = await AsyncStorage.getItem(KEY);
    if (s != null) {
      const v = s === '1' || s === 'true';
      if (v !== visible) { visible = v; notify(); }
    }
  } catch (_) { /* 기본값 유지 */ }
}

export function getIdeTreeVisible(): boolean { return visible; }

export async function setIdeTreeVisible(v: boolean) {
  if (v === visible) return;
  visible = v; notify();
  try { await AsyncStorage.setItem(KEY, v ? '1' : '0'); } catch (_) { /* noop */ }
}

/** 훅 — 전역 기본 표시값 구독(로드도 트리거). */
export function useIdeTreeVisible(): boolean {
  const [v, setV] = useState<boolean>(visible);
  useEffect(() => {
    const l = () => setV(visible);
    listeners.add(l); ensureLoaded(); setV(visible);
    return () => { listeners.delete(l); };
  }, []);
  return v;
}
