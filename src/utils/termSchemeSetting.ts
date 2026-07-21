import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { TermScheme } from '../theme/terminalSchemes';

// 터미널 컬러 스킴(기기 로컬) — displayScaleSetting 과 같은 패턴.
// 목록/값은 3플랫폼 통일(terminalSchemes.ts), 선택 저장은 기기별.

const KEY = 'app:termScheme';
const VALID: TermScheme[] = ['auto', 'ghostty', 'one-dark', 'dracula', 'solarized-dark', 'solarized-light'];

let scheme: TermScheme = 'auto';
let loaded = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

async function ensureLoaded() {
  if (loaded) return;
  loaded = true;
  try {
    const s = await AsyncStorage.getItem(KEY);
    if (s && VALID.includes(s as TermScheme) && s !== scheme) { scheme = s as TermScheme; notify(); }
  } catch (_) { /* 기본값 유지 */ }
}

export function getTermScheme(): TermScheme { return scheme; }

export async function setTermScheme(v: TermScheme) {
  if (v === scheme) return;
  scheme = v; notify();
  try { await AsyncStorage.setItem(KEY, v); } catch (_) { /* noop */ }
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
