import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// 전역 키보드 액세서리(보조키바/특수키 패널) 외관 설정 — 테마 + 버튼 크기.
// keyboardOSSetting 과 같은 패턴: Context 없이 모듈 레벨 상태 + 리스너로 설정 화면↔오버레이 실시간 공유.

export type KaTheme = 'light' | 'dark';
export type KaKeySize = 'sm' | 'md' | 'lg';

const THEME_KEY = 'app:keyAssistTheme';
const SIZE_KEY = 'app:keyAssistKeySize';

let theme: KaTheme = 'light';   // 기본 = 기존 룩(OS 키보드 톤의 라이트)
let keySize: KaKeySize = 'md';
let loaded = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

async function ensureLoaded() {
  if (loaded) return;
  loaded = true;
  try {
    const [t, s] = await Promise.all([AsyncStorage.getItem(THEME_KEY), AsyncStorage.getItem(SIZE_KEY)]);
    let changed = false;
    if (t === 'light' || t === 'dark') { theme = t; changed = true; }
    if (s === 'sm' || s === 'md' || s === 'lg') { keySize = s; changed = true; }
    if (changed) notify();
  } catch (_) { /* 기본값 유지 */ }
}

export function getKaTheme(): KaTheme { return theme; }
export async function setKaTheme(v: KaTheme) {
  if (theme === v) return;
  theme = v; notify();
  try { await AsyncStorage.setItem(THEME_KEY, v); } catch (_) { /* noop */ }
}
export function getKaKeySize(): KaKeySize { return keySize; }
export async function setKaKeySize(v: KaKeySize) {
  if (keySize === v) return;
  keySize = v; notify();
  try { await AsyncStorage.setItem(SIZE_KEY, v); } catch (_) { /* noop */ }
}

export function useKaTheme(): KaTheme {
  const [v, setV] = useState<KaTheme>(theme);
  useEffect(() => {
    const l = () => setV(theme);
    listeners.add(l); ensureLoaded(); setV(theme);
    return () => { listeners.delete(l); };
  }, []);
  return v;
}
export function useKaKeySize(): KaKeySize {
  const [v, setV] = useState<KaKeySize>(keySize);
  useEffect(() => {
    const l = () => setV(keySize);
    listeners.add(l); ensureLoaded(); setV(keySize);
    return () => { listeners.delete(l); };
  }, []);
  return v;
}

// ── 테마 팔레트 — 보조바/패널/키 공통 색 ──
export interface KaPalette {
  barBg: string;        // 보조바 배경
  panelBg: string;      // 특수키 패널 배경(전환 필러 포함)
  divider: string;      // 보조바 구분선
  key: string;          // 원샷 키 배경
  keyDown: string;      // 키 눌림
  keyText: string;      // 키 글자
  modOff: string;       // 모디파이어(off) 배경
  modOffText: string;
  toggleActiveBg: string; // ⌨︎ 활성(패널 열림)
  toggleActiveFg: string;
}

const PALETTES: Record<KaTheme, KaPalette> = {
  // 기존 룩 그대로 — OS 키보드 톤.
  light: {
    barBg: '#D2D7E1', panelBg: '#C9CFDA', divider: '#9AA3B5',
    key: '#FFFFFF', keyDown: '#AAB2C2', keyText: '#2B2D31',
    modOff: '#E7EAF1', modOffText: '#3A3F4B',
    toggleActiveBg: '#2A2F3A', toggleActiveFg: '#E2E8F0',
  },
  // 앱(v2 다크) 톤에 맞춘 다크.
  dark: {
    barBg: '#141926', panelBg: '#0F131D', divider: '#2A3245',
    key: '#232B3D', keyDown: '#3A4560', keyText: '#DCE3F0',
    modOff: '#1B2232', modOffText: '#93A0B8',
    toggleActiveBg: '#DCE3F0', toggleActiveFg: '#141926',
  },
};
export const kaPalette = (t: KaTheme): KaPalette => PALETTES[t];

// ── 버튼 크기 — 보조바 키 높이/폭/글자, 패널 글자 스케일 ──
export interface KaSizes {
  keyH: number;      // 보조바 키 높이
  keyMinW: number;   // 보조바 키 최소 폭
  barFont: number;   // 보조바 키 글자
  panelFont: number; // 패널 일반 키 글자
  panelModFont: number;
}
const SIZES: Record<KaKeySize, KaSizes> = {
  sm: { keyH: 32, keyMinW: 34, barFont: 15, panelFont: 12, panelModFont: 10.5 },
  md: { keyH: 37, keyMinW: 40, barFont: 17, panelFont: 13.5, panelModFont: 11.5 }, // 기존 값
  lg: { keyH: 44, keyMinW: 48, barFont: 19, panelFont: 15.5, panelModFont: 13 },
};
export const kaSizes = (s: KaKeySize): KaSizes => SIZES[s];
