import { NativeEventEmitter, NativeModules, type EmitterSubscription } from 'react-native';

// ── 네이티브 음성인식 모듈(CptSpeech) 래퍼 ──
//  iOS: SFSpeechRecognizer + AVAudioEngine (CptSpeech.swift/.m)
//  Android: android.speech.SpeechRecognizer (CptSpeechModule.kt)
//  이벤트는 5종(partial/final/error/volume/end) — NativeEventEmitter 로 구독한다.
//  모듈이 아직 링크되지 않은 빌드에서도 import 만으로 크래시하지 않도록 널 가드한다.

interface CptSpeechNative {
  isAvailable(): Promise<boolean>;
  requestPermission(): Promise<boolean>;
  start(opts: { locale: string; contextualStrings: string[] }): Promise<void>;
  stop(): Promise<void>;
  // NativeEventEmitter(iOS RCTEventEmitter) 규약 — Android 에선 no-op 여도 무방.
  addListener?(eventName: string): void;
  removeListeners?(count: number): void;
}

const CptSpeech: CptSpeechNative | null =
  (NativeModules.CptSpeech as CptSpeechNative | undefined) ?? null;

/** 네이티브 CptSpeech 모듈이 이 빌드에 링크돼 있는가(배선 전 그레이스풀 폴백). */
export function isNativeSpeechLinked(): boolean {
  return CptSpeech != null;
}

// 모듈이 없으면 이벤트도 없다 — emitter 는 링크된 경우에만 생성.
const emitter: NativeEventEmitter | null = CptSpeech
  ? new NativeEventEmitter(NativeModules.CptSpeech)
  : null;

export type NativeSpeechEvent =
  | { name: 'cptSpeechPartial'; payload: { text: string } }
  | { name: 'cptSpeechFinal'; payload: { text: string } }
  | { name: 'cptSpeechError'; payload: { code?: string; message: string } }
  | { name: 'cptSpeechVolume'; payload: { level: number } }
  | { name: 'cptSpeechEnd'; payload: Record<string, never> };

type EventName = NativeSpeechEvent['name'];

/** 이벤트 구독 헬퍼 — 반환 함수로 해제. 모듈 미링크 시 no-op 구독. */
export function addSpeechListener<E extends EventName>(
  event: E,
  handler: (payload: Extract<NativeSpeechEvent, { name: E }>['payload']) => void,
): () => void {
  if (!emitter) return () => {};
  const sub: EmitterSubscription = emitter.addListener(event, handler as (p: unknown) => void);
  return () => sub.remove();
}

export const nativeSpeech = {
  isAvailable(): Promise<boolean> {
    if (!CptSpeech) return Promise.resolve(false);
    return CptSpeech.isAvailable();
  },
  requestPermission(): Promise<boolean> {
    if (!CptSpeech) return Promise.resolve(false);
    return CptSpeech.requestPermission();
  },
  start(opts: { locale: string; contextualStrings: string[] }): Promise<void> {
    if (!CptSpeech) return Promise.reject(new Error('CptSpeech 네이티브 모듈이 링크되지 않았습니다.'));
    return CptSpeech.start(opts);
  },
  stop(): Promise<void> {
    if (!CptSpeech) return Promise.resolve();
    return CptSpeech.stop();
  },
};
