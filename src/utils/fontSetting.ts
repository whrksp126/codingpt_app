import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { jetbrainsMonoFontFaceCss } from '../components/module/ide/jetbrainsMonoFont';
import { firaCodeFontFaceCss } from '../components/module/ide/firaCodeFont';
import { d2codingFontFaceCss } from '../components/module/ide/d2codingFont';

// 코드·터미널 글꼴(기기 로컬) — 터미널(xterm)/IDE 에디터(CodeMirror) WebView 에 적용.
// displayScaleSetting 과 같은 패턴: 모듈 레벨 상태 + 리스너 + AsyncStorage 영속.
// 목록은 3플랫폼(PC/iOS/Android) 통일 — 웹폰트를 앱에 내장해 기기 설치 여부와 무관하게 같은 선택지.
// 폰트 데이터가 커서(특히 D2Coding) @font-face 는 "선택된 폰트만" HTML 에 굽고, 변경 시 WebView 를
// 재마운트한다(터미널은 tmux 라 내용 유지, 에디터는 value prop 으로 복원).

export type CodeFont = 'default' | 'jetbrains' | 'fira' | 'd2coding';

const KEY = 'app:codeFont';

export const CODE_FONT_OPTIONS: { v: CodeFont; label: string }[] = [
  { v: 'default', label: '기본' },
  { v: 'jetbrains', label: 'JetBrains Mono' },
  { v: 'fira', label: 'Fira Code' },
  { v: 'd2coding', label: 'D2Coding' },
];

const VALID: CodeFont[] = ['default', 'jetbrains', 'fira', 'd2coding'];

let font: CodeFont = 'default';
let loaded = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

async function ensureLoaded() {
  if (loaded) return;
  loaded = true;
  try {
    const s = await AsyncStorage.getItem(KEY);
    if (s && VALID.includes(s as CodeFont) && s !== font) { font = s as CodeFont; notify(); }
  } catch (_) { /* 기본값 유지 */ }
}

export function getCodeFont(): CodeFont { return font; }

export async function setCodeFont(v: CodeFont) {
  if (v === font) return;
  font = v; notify();
  try { await AsyncStorage.setItem(KEY, v); } catch (_) { /* noop */ }
}

/** 비-훅 구독(웹뷰 브리지 등). 반환값 = 해제 함수. 저장값 로드도 트리거한다. */
export function subscribeCodeFont(fn: () => void): () => void {
  listeners.add(fn);
  ensureLoaded();
  return () => { listeners.delete(fn); };
}

export function useCodeFont(): CodeFont {
  const [v, setV] = useState<CodeFont>(font);
  useEffect(() => {
    const l = () => setV(font);
    listeners.add(l); ensureLoaded(); setV(font);
    return () => { listeners.delete(l); };
  }, []);
  return v;
}

const CSS_FAMILY: Record<CodeFont, string | null> = {
  default: null,
  jetbrains: 'JetBrains Mono',
  fira: 'Fira Code',
  d2coding: 'D2Coding',
};

/** 터미널(xterm) font-family — 한글 폴백(Nanum Gothic Coding) 유지. D2Coding 은 자체 한글 포함. */
export function codeFontFamilyCss(): string {
  const fam = CSS_FAMILY[font];
  return fam
    ? `'${fam}', 'Nanum Gothic Coding', Menlo, Monaco, Consolas, monospace`
    : "'Nanum Gothic Coding', Menlo, Monaco, Consolas, monospace";
}

/** IDE 에디터(CodeMirror) font-family — DOM 렌더라 per-glyph 폴백이 되므로 한글 웹폰트 불필요. */
export function editorFontFamilyCss(): string {
  const fam = CSS_FAMILY[font];
  return fam
    ? `'${fam}', Menlo, Monaco, Consolas, 'Courier New', monospace`
    : "Menlo, Monaco, Consolas, 'Courier New', monospace";
}

/** 주입 HTML <style> 에 넣을 @font-face 블록 — 선택된 폰트만(데이터 크기 절약). */
export function codeFontFaceCss(): string {
  switch (font) {
    case 'jetbrains': return jetbrainsMonoFontFaceCss();
    case 'fira': return firaCodeFontFaceCss();
    case 'd2coding': return d2codingFontFaceCss();
    default: return '';
  }
}
