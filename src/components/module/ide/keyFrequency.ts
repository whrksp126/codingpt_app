// 보조키 사용빈도 가중 — 규칙 기반 순서를 "백본"으로 두고, 사용자가 컨텍스트별로 자주 쓰는
// 키만 ±2칸 안에서 부드럽게 끌어올린다(절대 랜덤하게 안 느껴지게). 로컬 영속(AsyncStorage).
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { KeyDef } from './keyContexts';

const STORE_KEY = 'ide:keyfreq:v1';
// ctxKey('mode:scope') → { symbolId: count }
type FreqMap = Record<string, Record<string, number>>;

let mem: FreqMap = {};
let loaded = false;
let flushT: ReturnType<typeof setTimeout> | null = null;

/** 마운트 시 1회 로드. 실패해도 빈 맵으로 동작. */
export async function loadFreq(): Promise<void> {
  if (loaded) return;
  loaded = true;
  try {
    const raw = await AsyncStorage.getItem(STORE_KEY);
    if (raw) mem = JSON.parse(raw) || {};
  } catch { mem = {}; }
}

function scheduleFlush() {
  if (flushT) return;
  flushT = setTimeout(async () => {
    flushT = null;
    try { await AsyncStorage.setItem(STORE_KEY, JSON.stringify(mem)); } catch { /* noop */ }
  }, 1000); // 키 입력마다 쓰지 않음 — 1s 배치.
}

/** 키를 한 번 썼을 때 호출. 인메모리 ++, 디바운스 flush. */
export function bump(ctxKey: string, symbolId: string): void {
  if (!ctxKey || !symbolId) return;
  const c = (mem[ctxKey] || (mem[ctxKey] = {}));
  c[symbolId] = (c[symbolId] || 0) + 1;
  scheduleFlush();
}

/**
 * 규칙 순서를 유지한 채, 컨텍스트 내에서 자주 쓴 키만 최대 2칸 끌어올린다.
 * hot(+2): count>=3 && count>=0.5*max, warm(+1): count>=2. stable-sort 라 동률은 원순서 유지.
 */
export function boostOrder(ctxKey: string, keys: KeyDef[]): KeyDef[] {
  const counts = mem[ctxKey];
  if (!counts || keys.length < 2) return keys;
  let max = 0;
  for (const def of keys) { const v = counts[def.id] || 0; if (v > max) max = v; }
  if (max < 2) return keys; // 의미 있는 신호 없음 — 그대로.
  const boostOf = (id: string): number => {
    const v = counts[id] || 0;
    if (v >= 3 && v >= 0.5 * max) return 2;
    if (v >= 2) return 1;
    return 0;
  };
  // 안정 정렬: baseIndex - clamp(boost,0,2) 오름차순. 인덱스로 tie-break 해 결정론적.
  return keys
    .map((def, i) => ({ def, i, eff: i - boostOf(def.id) }))
    .sort((a, b) => a.eff - b.eff || a.i - b.i)
    .map((x) => x.def);
}
