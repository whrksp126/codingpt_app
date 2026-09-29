// useMicDictation — 입력칸 받아쓰기(STT). 채팅 컴포저에서 추출한 것(Agent Tasks 설계 §6.6):
//  새 작업 시트의 프롬프트 입력도 **같은 엔진·같은 규칙**을 쓴다. 두 벌이면 "채팅 받아쓰기는 되는데
//  작업 시트는 이상하다" 가 생긴다(실제로 채팅이 서드파티 엔진이던 시절 겪었다 — 아래 1).
//
//  1) 엔진 = 보조키 패널 STT 와 같은 services/stt(자체 네이티브 CptSpeech + 코딩 용어 바이어스).
//     provider 는 사용자가 패널에서 고른 것(getCurrentSttProvider)을 그대로 따른다.
//  2) "커서 있는 곳에 채운다" — 시작 시점의 커서를 앵커로 굳힌다. 부분 결과는 같은 자리를 덮어쓰고,
//     최종 결과가 오면 그 지점을 새 앵커로 **커밋**한다. 커밋이 없으면 연속 발화에서 두 번째 문장이 첫 문장을
//     덮어써 앞서 말한 내용이 사라진다(사용자 실측 신고 2026-07-27).
//  3) 화면을 떠날 때 듣기를 반드시 멈춘다 — 안 멈추면 마이크가 백그라운드에서 계속 열린다.
//  4) 회복 가능한 종료(무음·타임아웃)는 네이티브가 재시작한다 → 여기서 원문 오류를 띄우지 않는다.

import { useCallback, useEffect, useRef, useState } from 'react';
import { haptic } from '../animations/haptics';
import { spliceSpeech } from '../workspace/chat/composer';
import { getCurrentSttProvider, CODING_TERMS } from '../services/stt';
import { isNativeSpeechLinked } from '../services/stt/nativeSpeech';
import * as i18n from '../i18n/index.ts';

export interface MicDictation {
  /** 네이티브 모듈이 붙은 빌드인가 — 아니면 버튼을 **숨긴다**(죽은 버튼 금지). */
  micOk: boolean;
  listening: boolean;
  micErr: string;
  setMicErr: (s: string) => void;
  /** 입력 레벨(0~1) — state 가 아니라 ref(초당 10~20회 → 리렌더 폭주 방지). MicSpectrum 이 샘플링한다. */
  micLevelRef: React.MutableRefObject<number>;
  /** 현재 커서 위치 — 입력칸의 onSelectionChange 가 채운다(시작 시 앵커가 된다). */
  selRef: React.MutableRefObject<number>;
  toggleMic: () => Promise<void>;
  stopMic: () => void;
}

export function useMicDictation(draft: string, onChange: (value: string) => void, max: number): MicDictation {
  const micOk = useRef(isNativeSpeechLinked()).current;
  const [listening, setListening] = useState(false);
  const [micErr, setMicErr] = useState('');
  const micLevelRef = useRef(0);
  const selRef = useRef(0);
  const anchorRef = useRef(0);
  const baseRef = useRef('');
  const draftRef = useRef(draft); draftRef.current = draft;
  const onChangeRef = useRef(onChange); onChangeRef.current = onChange;

  useEffect(() => () => { void getCurrentSttProvider().stop().catch(() => {}); }, []);

  const applySpeech = useCallback((text: string, final: boolean) => {
    const { value, cursor } = spliceSpeech(baseRef.current, anchorRef.current, text, max);
    onChangeRef.current(value);
    selRef.current = cursor;
    if (final) { baseRef.current = value; anchorRef.current = cursor; }
  }, [max]);

  const stopMic = useCallback(() => {
    setListening(false);
    micLevelRef.current = 0;
    void getCurrentSttProvider().stop().catch(() => {});
  }, []);

  const toggleMic = useCallback(async () => {
    haptic.keyPress();
    setMicErr('');
    const P = getCurrentSttProvider();
    // 듣는 중에 누르면 **종료**(사용자 확정) — 같은 버튼이 시작/종료를 겸한다.
    if (listening) { setListening(false); micLevelRef.current = 0; await P.stop().catch(() => {}); return; }
    if (!(await P.requestPermission().catch(() => false))) { setMicErr(i18n.t('마이크 권한이 필요합니다.')); return; }
    baseRef.current = draftRef.current;
    anchorRef.current = selRef.current;
    setListening(true);
    try {
      await P.start({
        locale: 'ko-KR',
        contextualStrings: CODING_TERMS,
        onPartial: (t) => applySpeech(t, false),
        onFinal: (t) => applySpeech(t, true),
        onError: () => { setMicErr(i18n.t('음성 인식이 중단됐어요. 다시 시도해 주세요.')); setListening(false); micLevelRef.current = 0; },
        // 피크 홀드(어택 즉시·릴리즈는 스펙트럼의 감쇠) — 말의 끝에서 막대가 뚝 끊기지 않게.
        onVolume: (l) => {
          const v = l > 1 ? 1 : l < 0 ? 0 : l;
          micLevelRef.current = Math.max(v, micLevelRef.current * 0.6);
        },
      });
    } catch (_e) {
      setListening(false);
      micLevelRef.current = 0;
      setMicErr(i18n.t('음성 인식을 시작할 수 없습니다.'));
    }
  }, [listening, applySpeech]);

  return { micOk, listening, micErr, setMicErr, micLevelRef, selRef, toggleMic, stopMic };
}

export default useMicDictation;
