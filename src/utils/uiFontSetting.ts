import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, Text } from 'react-native';

// 인터페이스 글꼴(계정 전체 동기화) — 목록은 3플랫폼 통일(전부 앱 내장 폰트).
// 값 키는 백엔드 화이트리스트/PC(theme.js UI_FONT_OPTIONS)와 일치.
// 적용은 v2Font.sans 제자리 교체 + App key 리마운트(테마 전환과 같은 방식).

export type UiFont = 'pretendard' | 'notoserif' | 'gowun' | 'gmarket';

const KEY = 'app:uiFont';
const VALID: UiFont[] = ['pretendard', 'notoserif', 'gowun', 'gmarket'];

export const UI_FONT_OPTIONS: { v: UiFont; label: string }[] = [
  { v: 'pretendard', label: 'Pretendard' },
  { v: 'notoserif', label: 'Noto Serif KR' },
  { v: 'gowun', label: 'Gowun Dodum' },
  { v: 'gmarket', label: 'Gmarket Sans' },
];

// RN 네이티브 fontFamily 토큰(assets/fonts 등록명 — Android=파일명, iOS=폰트 내부명. 둘을 일치시킴)
const NATIVE_FAMILY: Record<UiFont, string> = {
  pretendard: 'PretendardVariable',
  notoserif: 'NotoSerifKR',
  gowun: 'GowunDodum',
  gmarket: 'GmarketSans',
};

let font: UiFont = 'pretendard';
let loaded = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

async function ensureLoaded() {
  if (loaded) return;
  loaded = true;
  try {
    const s = await AsyncStorage.getItem(KEY);
    if (s && VALID.includes(s as UiFont) && s !== font) { font = s as UiFont; notify(); }
  } catch (_) { /* 기본값 유지 */ }
}

export function getUiFont(): UiFont { return font; }
export function isValidUiFont(v: unknown): v is UiFont { return typeof v === 'string' && VALID.includes(v as UiFont); }

/** silent=true — 서버발 적용(appearanceSync) 시 재푸시 방지. */
export async function setUiFont(v: UiFont, opts?: { silent?: boolean }) {
  if (!VALID.includes(v) || v === font) return;
  font = v; notify();
  try { await AsyncStorage.setItem(KEY, v); } catch (_) { /* noop */ }
  if (!opts?.silent) {
    const { schedulePushAppearance } = require('./appearanceSync');
    schedulePushAppearance();
  }
}

export function subscribeUiFont(fn: () => void): () => void {
  listeners.add(fn);
  ensureLoaded();
  return () => { listeners.delete(fn); };
}

export function useUiFont(): UiFont {
  const [v, setV] = useState<UiFont>(font);
  useEffect(() => {
    const l = () => setV(font);
    listeners.add(l); ensureLoaded(); setV(font);
    return () => { listeners.delete(l); };
  }, []);
  return v;
}

/** RN 네이티브 fontFamily(설정값 → 등록된 폰트 토큰). */
export function nativeUiFontFamily(v: UiFont = font): string {
  return NATIVE_FAMILY[v] || NATIVE_FAMILY.pretendard;
}

// 전역 기본 글꼴 — RN Text 는 기본 fontFamily 개념이 없어(스타일 미지정=시스템 폰트),
// Text.render 를 한 번 감싸 스타일 맨 앞에 fontFamily 를 끼워 넣는다(명시 지정이 항상 이김).
// defaultProps 방식은 style prop 이 있으면 무시되므로 쓰지 않는다. App 리마운트(key)와 함께 동작.
let patchedBaseRender: ((...args: any[]) => any) | null = null;
let globalFamily: string | null = null;
export function applyGlobalTextFont(family: string) {
  globalFamily = family;
  const T = Text as any;
  if (!patchedBaseRender && typeof T.render === 'function') {
    patchedBaseRender = T.render;
    T.render = function (props: any, ref: any) {
      const style = globalFamily ? [{ fontFamily: globalFamily }, props?.style] : props?.style;
      return patchedBaseRender!.call(this, { ...props, style }, ref);
    };
  }
}
/** 코드 글꼴 미리보기 등 임의 네이티브 패밀리 조회용. */
export const UI_NATIVE_FAMILY = NATIVE_FAMILY;
export const MONO_NATIVE_FAMILY: Record<string, string> = {
  default: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }) as string,
  jetbrains: 'JetBrainsMonoApp',
  fira: 'FiraCodeApp',
  d2coding: 'D2CodingApp',
};
