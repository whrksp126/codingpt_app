import { useSyncExternalStore } from 'react';
import { NativeEventEmitter, NativeModules } from 'react-native';

// ── 읽어 주기(TTS) — 채팅 답변 아래 [읽어 주기] 버튼 ──
//  엔진 = 자체 네이티브 CptSpeech(Android TextToSpeech · iOS AVSpeechSynthesizer). 기기 안에서만 돈다(서버 0).
//  한 번에 하나만 읽는다 — 다른 답변을 누르면 앞의 것은 멈춘다. 지금 읽는 id 는 작은 저장소로 구독한다.

interface TtsNative {
  speak?(id: string, text: string, lang: string): Promise<boolean>;
  stopSpeaking?(): Promise<boolean>;
}
const N: TtsNative | null = (NativeModules.CptSpeech as TtsNative | undefined) ?? null;
const emitter = N ? new NativeEventEmitter(NativeModules.CptSpeech) : null;

let current: string | null = null;
const subs = new Set<() => void>();
function set(id: string | null) {
  if (current === id) return;
  current = id;
  subs.forEach((fn) => fn());
}
emitter?.addListener('cptTtsEnd', (e: { id?: string }) => { if (e && e.id === current) set(null); });

/** 이 빌드에 읽어 주기 엔진이 있는가(구 네이티브 빌드면 버튼을 숨긴다). */
export function ttsAvailable(): boolean {
  return !!(N && typeof N.speak === 'function');
}

/** 마크다운 → 소리 내어 읽을 평문. 코드 블록은 읽지 않는다(기호 나열은 듣기 고역이다). */
export function speakable(md: string): string {
  return String(md || '')
    .replace(/```[\s\S]*?(```|$)/g, '\n')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+[.)]\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*\|?\s*:?-{2,}.*$/gm, '')
    .replace(/\|/g, ', ')
    .replace(/(\*\*|__|\*|_|~~)(?=\S)([\s\S]*?\S)\1/g, '$2')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** 글에 한글이 섞여 있으면 한국어 목소리, 아니면 영어. */
export function langOf(text: string): string {
  const ko = (text.match(/[가-힣]/g) || []).length;
  const latin = (text.match(/[A-Za-z]/g) || []).length;
  return ko > 0 && ko * 3 >= latin ? 'ko-KR' : 'en-US';
}

export function speak(id: string, markdown: string): void {
  if (!ttsAvailable()) return;
  const text = speakable(markdown);
  if (!text) return;
  set(id);
  N!.speak!(id, text, langOf(text)).catch(() => { if (current === id) set(null); });
}

export function stopSpeaking(): void {
  set(null);
  N?.stopSpeaking?.().catch(() => { /* noop */ });
}

/** 읽기/멈춤 토글. */
export function toggleSpeak(id: string, markdown: string): void {
  if (current === id) stopSpeaking();
  else speak(id, markdown);
}

/** 지금 이 id 를 읽고 있는가. */
export function useSpeaking(id: string): boolean {
  return useSyncExternalStore(
    (fn) => { subs.add(fn); return () => { subs.delete(fn); }; },
    () => current === id,
  );
}
