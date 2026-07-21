import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { jetbrainsMonoFontFaceCss } from '../components/module/ide/jetbrainsMonoFont';

// 코드·터미널 글꼴(기기 로컬) — 터미널(xterm)/IDE 에디터(CodeMirror) WebView 에 적용.
// displayScaleSetting 과 같은 패턴: 모듈 레벨 상태 + 리스너 + AsyncStorage 영속.
// 'jetbrains' 는 base64 내장 웹폰트(JetBrains Mono) — cmux(Ghostty 기본 폰트)와 같은 룩.

export type CodeFont = 'default' | 'jetbrains';

const KEY = 'app:codeFont';

export const CODE_FONT_OPTIONS: { v: CodeFont; label: string }[] = [
  { v: 'default', label: '기본' },
  { v: 'jetbrains', label: 'JetBrains Mono' },
];

let font: CodeFont = 'default';
let loaded = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

async function ensureLoaded() {
  if (loaded) return;
  loaded = true;
  try {
    const s = await AsyncStorage.getItem(KEY);
    if ((s === 'default' || s === 'jetbrains') && s !== font) { font = s; notify(); }
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

/** WebView 주입 HTML 의 font-family 문자열(따옴표 포함). 기본은 기존 스택 유지. */
export function codeFontFamilyCss(): string {
  return font === 'jetbrains'
    ? "'JetBrains Mono', 'Nanum Gothic Coding', Menlo, Monaco, Consolas, monospace"
    : "'Nanum Gothic Coding', Menlo, Monaco, Consolas, monospace";
}

/** IDE 에디터(CodeMirror) font-family — DOM 렌더라 per-glyph 폴백이 되므로 한글 웹폰트 불필요. */
export function editorFontFamilyCss(): string {
  return font === 'jetbrains'
    ? "'JetBrains Mono', Menlo, Monaco, Consolas, 'Courier New', monospace"
    : "Menlo, Monaco, Consolas, 'Courier New', monospace";
}

/** 주입 HTML <style> 에 넣을 @font-face 블록(내장 폰트 선택 시에만 내용 있음). */
export function codeFontFaceCss(): string {
  return font === 'jetbrains' ? jetbrainsMonoFontFaceCss() : '';
}
