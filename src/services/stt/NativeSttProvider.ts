import type { SttProvider, SttStartOptions } from './SttProvider';
import { addSpeechListener, isNativeSpeechLinked, nativeSpeech } from './nativeSpeech';

// ── 네이티브 온디바이스 STT provider ──
//  iOS SFSpeechRecognizer / Android SpeechRecognizer 를 nativeSpeech 래퍼로 구동.
//  연속 인식(세그먼트 종료 시 자동 재시작)은 네이티브 쪽에서 처리하고, 여기선 이벤트를
//  SttStartOptions 콜백으로 중계한다. 활성 세션 콜백은 모듈 레벨 단일 상태로 보관한다.

let unsubs: Array<() => void> = [];
let active = false;

function detach() {
  for (const u of unsubs) u();
  unsubs = [];
}

export const NativeSttProvider: SttProvider = {
  id: 'native',
  label: '네이티브',
  capabilities: { streaming: true, onDevice: true, codeSwitching: 'weak' },

  isAvailable() {
    if (!isNativeSpeechLinked()) return Promise.resolve(false);
    return nativeSpeech.isAvailable();
  },

  requestPermission() {
    return nativeSpeech.requestPermission();
  },

  async start(opts: SttStartOptions) {
    // 재시작 방어 — 기존 세션 정리 후 새로 붙인다.
    detach();
    active = true;
    unsubs = [
      addSpeechListener('cptSpeechPartial', (p) => { if (active) opts.onPartial(p.text); }),
      addSpeechListener('cptSpeechFinal', (p) => { if (active) opts.onFinal(p.text); }),
      addSpeechListener('cptSpeechError', (p) => { if (active) opts.onError(p); }),
      addSpeechListener('cptSpeechVolume', (p) => { if (active) opts.onVolume?.(p.level); }),
      addSpeechListener('cptSpeechEnd', () => { if (active) opts.onEnd?.(); }),
    ];
    try {
      await nativeSpeech.start({
        locale: opts.locale ?? 'ko-KR',
        contextualStrings: opts.contextualStrings ?? [],
      });
    } catch (e) {
      active = false;
      detach();
      throw e;
    }
  },

  async stop() {
    active = false;
    try {
      await nativeSpeech.stop();
    } finally {
      detach();
    }
  },
};
