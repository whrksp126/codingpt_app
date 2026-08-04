// 단축키 재바인딩의 보관·적용(앱).
//
// PC(codingpt_pc/src/js/shortcuts.js)의 미러다. 같은 계정 봉투(appearance.shortcuts)를 타므로
//  PC 에서 바꾼 것이 폰에도, 폰에서 바꾼 것이 PC 에도 온다 — 기존 글꼴·터미널 스타일과 같은 경로.
//
// 규율:
//  · 값 `null` 은 "이 명령은 단축키 없음"이라는 **유효한 의사**다. 기본값으로 되살리지 않는다.
//  · 서버발 적용은 silent(재푸시 금지) — 에코 루프 방지(appearanceSync 규율과 동일).
//  · 판정(정규화·충돌·병합)은 전부 palette/commands.ts 다. 여기는 보관과 배선만.
//
// ⚠ 폰에서 이 조합이 **실제로 눌리는 경로는 아직 없다**(하드웨어 키보드 라우팅 규칙이 미확정 —
//   터미널이 먹을지 앱이 먹을지). 그래서 앱의 팔레트 진입점은 헤더 버튼이다. 이 표를 지금 두는
//   이유는 두 가지: ① PC 와 같은 값을 보여 주고 폰에서도 고칠 수 있어야 하고, ② 라우팅 규칙이
//   정해지면 붙일 자리가 이미 있어야 한다.
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { resolveBindings, normalizeCombo, defaultBindings, comboFromEvent } from './commands';

const KEY = 'app:shortcuts';

/** ⌘ 를 쓰는 플랫폼인가 — 조합의 `Mod` 가 무엇으로 풀리는지를 정한다. */
export const IS_APPLE = Platform.OS === 'ios';

let overrides: Record<string, string | null> = {};
let resolved = resolveBindings('app', null);
let loaded = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

function recompute() {
  resolved = resolveBindings('app', overrides);
  notify();
}

async function ensureLoaded() {
  if (loaded) return;
  loaded = true;
  try {
    const s = await AsyncStorage.getItem(KEY);
    const raw = s ? JSON.parse(s) : null;
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) { overrides = raw; recompute(); }
  } catch (_) { /* 손상된 값은 무시 — 기본값으로 시작 */ }
}

/** 지금 적용 중인 조합표(id → 조합|null). */
export function bindings(): Record<string, string | null> { return resolved; }

export function overridesSnapshot(): Record<string, string | null> { return { ...overrides }; }

export function isDefault(id: string): boolean {
  return !Object.prototype.hasOwnProperty.call(overrides, id);
}

async function persist(opts?: { silent?: boolean }) {
  try { await AsyncStorage.setItem(KEY, JSON.stringify(overrides)); } catch (_) { /* noop */ }
  if (!opts?.silent) {
    // 구 서버는 이 키를 모른 채 버린다(화이트리스트) — 오류가 아니라 "동기화만 안 됨"이다.
    const { schedulePushAppearance } = require('../utils/appearanceSync');
    schedulePushAppearance();
  }
}

/** 하나 바꾸기. combo=null 이면 "단축키 없음", 기본값과 같아지면 override 를 뺀다. */
export async function setBinding(id: string, combo: string | null) {
  const def = defaultBindings('app');
  if (!Object.prototype.hasOwnProperty.call(def, id)) return;
  const next = combo == null ? null : normalizeCombo(combo);
  if (combo != null && next == null) return;   // 못 읽는 조합은 아무 일도 안 한다
  const defCombo = def[id] == null ? null : normalizeCombo(def[id]);
  if (next === defCombo) delete overrides[id];
  else overrides[id] = next;
  recompute();
  await persist();
}

export async function resetBinding(id: string) {
  if (!Object.prototype.hasOwnProperty.call(overrides, id)) return;
  delete overrides[id];
  recompute();
  await persist();
}

export async function resetAll() {
  if (!Object.keys(overrides).length) return;
  overrides = {};
  recompute();
  await persist();
}

/** 서버/타 기기발 적용 — 되밀지 않는다(silent). */
export function applyRemoteShortcuts(sc: unknown) {
  if (!sc || typeof sc !== 'object' || Array.isArray(sc)) return;
  loaded = true;   // 서버 정본이 왔으면 로컬 로드가 이걸 덮어쓰면 안 된다
  if (JSON.stringify(sc) === JSON.stringify(overrides)) return;
  overrides = { ...(sc as Record<string, string | null>) };
  recompute();
  void persist({ silent: true });
}

export function subscribeShortcuts(fn: () => void): () => void {
  listeners.add(fn);
  void ensureLoaded();
  return () => { listeners.delete(fn); };
}

export function useShortcuts(): Record<string, string | null> {
  const [v, setV] = useState(resolved);
  useEffect(() => {
    const l = () => setV(bindings());
    listeners.add(l);
    void ensureLoaded();
    setV(bindings());
    return () => { listeners.delete(l); };
  }, []);
  return v;
}

/** 키 이벤트 → 조합(이 플랫폼 기준). 설정 화면의 "새 조합 받기"가 쓴다. */
export function comboOf(e: Parameters<typeof comboFromEvent>[0]): string | null {
  return comboFromEvent(e, IS_APPLE);
}
