import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { TermScheme } from '../theme/terminalSchemes';

// 터미널 스타일(계정 전체 동기화) — 스타일 "계열"만 저장하고 다크/라이트 변형은 앱 테마가 결정.
// 값 키는 백엔드 화이트리스트/PC(theme.js)와 일치. displayScaleSetting 과 같은 모듈 패턴.

const KEY = 'app:termStyle';
const LEGACY_KEY = 'app:termScheme'; // 구 키(one-dark 등) 마이그레이션
// 'solarized' 는 2026-08-15 4종 개편으로 은퇴 — 가장 가까운 페이퍼(dracula 키)로 이관.
const LEGACY_MAP: Record<string, TermScheme> = { 'one-dark': 'one', 'solarized-dark': 'dracula', 'solarized-light': 'dracula', 'solarized': 'dracula' };
const VALID: TermScheme[] = ['auto', 'ghostty', 'one', 'dracula'];

let scheme: TermScheme = 'auto';
let loaded = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

async function ensureLoaded() {
  if (loaded) return;
  loaded = true;
  try {
    let s = await AsyncStorage.getItem(KEY);
    if (!s) {
      const legacy = await AsyncStorage.getItem(LEGACY_KEY);
      if (legacy) s = legacy;
    }
    if (s) s = LEGACY_MAP[s] || s; // 현행 키(app:termStyle)에 남은 'solarized' 저장값도 이관
    if (s && VALID.includes(s as TermScheme) && s !== scheme) { scheme = s as TermScheme; notify(); }
  } catch (_) { /* 기본값 유지 */ }
}

export function getTermScheme(): TermScheme { return scheme; }
/** 서버발 값 검증 — 은퇴 키('solarized' 등)는 normalizeStoredTermScheme 로 이관해서 넘길 것. */
export function isValidTermScheme(v: unknown): v is TermScheme { return typeof v === 'string' && VALID.includes(v as TermScheme); }
/** 서버/저장소에 남아 있을 수 있는 은퇴 키 이관(없으면 원값 그대로). */
export function normalizeStoredTermScheme(v: unknown): unknown {
  return typeof v === 'string' && LEGACY_MAP[v] ? LEGACY_MAP[v] : v;
}

/** silent=true — 서버발 적용(appearanceSync) 시 재푸시 방지. */
export async function setTermScheme(v: TermScheme, opts?: { silent?: boolean }) {
  if (!VALID.includes(v) || v === scheme) return;
  scheme = v; notify();
  try { await AsyncStorage.setItem(KEY, v); } catch (_) { /* noop */ }
  if (!opts?.silent) {
    const { schedulePushAppearance } = require('./appearanceSync');
    schedulePushAppearance();
  }
}

/** 비-훅 구독. 반환값 = 해제 함수. 저장값 로드도 트리거한다. */
export function subscribeTermScheme(fn: () => void): () => void {
  listeners.add(fn);
  ensureLoaded();
  return () => { listeners.delete(fn); };
}

export function useTermScheme(): TermScheme {
  const [v, setV] = useState<TermScheme>(scheme);
  useEffect(() => {
    const l = () => setV(scheme);
    listeners.add(l); ensureLoaded(); setV(scheme);
    return () => { listeners.delete(l); };
  }, []);
  return v;
}
