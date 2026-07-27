import { Platform, PermissionsAndroid } from 'react-native';

// speechInput — 마이크 → 텍스트(STT). 채팅 컴포저의 마이크 버튼 하나가 유일한 소비자다.
//
// 범위(사용자 확정 2026-07-27): **모바일 전용**. PC 앱 웹뷰(WKWebView)에는 Web Speech API 가 없어
//  네이티브 구현이 따로 필요하므로 PC 는 마이크 버튼을 **아예 두지 않는다**("있지만 안 되는 버튼" 금지).
//
// ★ 네이티브 모듈 부재를 **정상 경로로** 취급한다. `@react-native-voice/voice` 는 오토링킹이지만
//   iOS 는 `pod install` 이, Android 는 재빌드가 선행돼야 실제로 붙는다. 그 전에 만든 번들에서
//   최상위 import 를 하면 화면 진입 자체가 크래시한다 → **지연 require + try/catch** 로 감싸고,
//   없으면 `isSpeechAvailable() === false` 로 마이크 버튼을 숨긴다(사용자에게 죽은 버튼을 보이지 않는다).
//
// ★ 권한: Android 는 RECORD_AUDIO 런타임 권한(AndroidManifest 선언 + 여기서 요청).
//   iOS 는 NSMicrophoneUsageDescription / NSSpeechRecognitionUsageDescription(Info.plist)이 있어야
//   시스템 프롬프트가 뜬다. plist 편집은 Xcode 작업이라 사용자 몫이다(설명은 문서/체크리스트에).

type Voice = {
  start: (locale?: string) => Promise<void>;
  stop: () => Promise<void>;
  cancel: () => Promise<void>;
  destroy: () => Promise<void>;
  removeAllListeners: () => void;
  onSpeechResults?: (e: { value?: string[] }) => void;
  onSpeechPartialResults?: (e: { value?: string[] }) => void;
  onSpeechError?: (e: { error?: { message?: string; code?: string } }) => void;
  onSpeechEnd?: () => void;
  onSpeechStart?: () => void;
};

let mod: Voice | null | undefined; // undefined = 아직 시도 안 함, null = 없음

function voice(): Voice | null {
  if (mod !== undefined) return mod;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const m = require('@react-native-voice/voice');
    mod = (m && (m.default || m)) as Voice;
    if (typeof mod?.start !== 'function') mod = null;
  } catch (_e) {
    mod = null; // 네이티브 미설치(pod install/재빌드 전) — 정상 경로
  }
  return mod;
}

/** 이 기기에서 음성 입력을 쓸 수 있는가(네이티브 모듈이 실제로 붙어 있는가). */
export function isSpeechAvailable(): boolean {
  return !!voice();
}

/** 기본 인식 언어 — 한국어 사용자 기준. 필요해지면 설정으로 뺀다(지금은 고정이 정직하다). */
export const SPEECH_LOCALE = 'ko-KR';

/** 자동 종료(무음) 후 재시작 상한 — 무제한 재시작은 배터리/권한 루프가 된다. */
export const SPEECH_MAX_RESTARTS = 10;

async function ensureMicPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true; // iOS 는 라이브러리가 시스템 프롬프트를 띄운다
  try {
    const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
      title: '마이크 사용',
      message: '음성으로 입력하려면 마이크 권한이 필요합니다.',
      buttonPositive: '허용',
      buttonNegative: '거부',
    });
    return r === PermissionsAndroid.RESULTS.GRANTED;
  } catch (_e) {
    return false;
  }
}

export interface SpeechHandlers {
  /** 인식 중간/최종 결과 — 호출측은 **같은 자리에 덮어쓴다**(누적 금지: 부분 결과가 계속 온다). */
  onText: (text: string, final: boolean) => void;
  /** 사용자에게 보일 짧은 메시지(권한 거부·미지원 등). */
  onError: (msg: string) => void;
  /** 세션이 끝났다(자동 종료 포함) — 호출측은 마이크 UI 를 끈다. */
  onDone: () => void;
}

let active = false;
let restarts = 0;

/** 지금 듣고 있는가(뷰가 언마운트돼도 모듈 상태는 하나뿐이므로 여기서 관리). */
export function isListening(): boolean { return active; }

/**
 * 듣기 시작. 이미 듣고 있으면 아무것도 하지 않는다(버튼 연타 방어).
 *  · 무음으로 자동 종료되면 **다시 시작**한다(문장 사이 쉼에서 꺼지면 "말하다 끊겼다"가 된다).
 *    상한(SPEECH_MAX_RESTARTS)을 넘으면 정직하게 끝낸다.
 */
export async function startSpeech(h: SpeechHandlers): Promise<boolean> {
  const V = voice();
  if (!V) { h.onError('이 기기에서는 음성 입력을 쓸 수 없습니다.'); return false; }
  if (active) return true;
  if (!(await ensureMicPermission())) { h.onError('마이크 권한이 필요합니다.'); return false; }

  active = true;
  restarts = 0;
  const emit = (e: { value?: string[] }, final: boolean) => {
    const t = (e && e.value && e.value[0]) || '';
    if (!t) return;
    restarts = 0; // 결과가 오면 재시작 예산을 회복(실제로 말하고 있다)
    h.onText(t, final);
  };
  V.onSpeechPartialResults = (e) => emit(e, false);
  V.onSpeechResults = (e) => emit(e, true);
  V.onSpeechError = (e) => {
    const code = String(e?.error?.code || '');
    // 안드로이드 7 = "no match"(무음), 6 = 타임아웃 — 오류가 아니라 쉼이다 → 재시작 경로로 넘긴다.
    if (active && (code === '7' || code === '6')) { void restart(h); return; }
    active = false;
    h.onError(String(e?.error?.message || '음성 인식에 실패했습니다.'));
    void teardown();
    h.onDone();
  };
  V.onSpeechEnd = () => { if (active) void restart(h); };

  try {
    await V.start(SPEECH_LOCALE);
    return true;
  } catch (e) {
    active = false;
    h.onError('음성 인식을 시작할 수 없습니다.');
    await teardown();
    h.onDone();
    return false;
  }
}

async function restart(h: SpeechHandlers) {
  const V = voice();
  if (!V || !active) return;
  if (restarts >= SPEECH_MAX_RESTARTS) { await stopSpeech(); h.onDone(); return; }
  restarts += 1;
  try { await V.start(SPEECH_LOCALE); } catch (_e) { active = false; await teardown(); h.onDone(); }
}

/** 듣기 종료(사용자가 마이크를 다시 눌렀다). 이미 꺼져 있으면 무해하게 통과. */
export async function stopSpeech(): Promise<void> {
  const V = voice();
  active = false;
  if (!V) return;
  try { await V.stop(); } catch (_e) { /* 이미 종료 */ }
  await teardown();
}

async function teardown() {
  const V = voice();
  if (!V) return;
  try { V.removeAllListeners(); } catch (_e) { /* noop */ }
}

export default { isSpeechAvailable, isListening, startSpeech, stopSpeech, SPEECH_LOCALE, SPEECH_MAX_RESTARTS };
