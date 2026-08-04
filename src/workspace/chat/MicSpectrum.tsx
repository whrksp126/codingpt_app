import React, { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, type SharedValue } from 'react-native-reanimated';

import { v2 } from '../../theme/v2Tokens';
import * as i18n from '../../i18n/index.ts';

// 수음 스펙트럼 — 음성 입력(STT) 중에 **마이크가 실제로 소리를 받고 있다**는 것을 눈으로 보여준다.
//  (사용자 요구 2026-08-02: "마이크 아이콘 fill 만 말고 [+][mode][수음 스펙트럼][마이크][보내기]".)
//
// 설계:
//  · 막대가 오른쪽에서 밀려 들어오는 **스크롤 파형** — 정지 화면이면 "동작 중"인지 알 수 없다.
//  · 값은 STT 엔진이 주는 실제 입력 레벨(`SttStartOptions.onVolume`, 네이티브 CptSpeech 의
//    `cptSpeechVolume`: iOS = AVAudioPCMBuffer RMS, Android = SpeechRecognizer.onRmsChanged).
//    가짜 애니메이션이 아니다 — 말하면 커지고 조용하면 가라앉는다(그래야 "인식 안 되는 중"도 보인다).
//  · 레벨은 **ref 로 받는다**. 볼륨 이벤트는 초당 10~20 번 오는데 state 로 올리면 컴포저 전체가
//    그만큼 리렌더된다(입력창·첨부 칩까지). ref → 인터벌 1회 샘플링 → reanimated 공유값 = JS 리렌더 0.
//  · reanimated `useFrameCallback` 은 쓰지 않는다: jest 의 공식 mock 에 없어서(mock.js "ADD ME IF
//    NEEDED") 이 컴포넌트를 렌더하는 테스트가 통째로 깨진다. 70ms 인터벌로 충분히 매끄럽다.

/** 막대 개수 — 좁은 폭에서도 파형으로 읽히는 최소치. */
export const SPECTRUM_BARS = 22;
/** 한 칸 밀리는 주기(ms) = 막대 하나의 시간 폭. */
export const SPECTRUM_STEP_MS = 70;
/** 샘플이 끊겼을 때의 감쇠 — 마이크가 죽으면 파형이 스스로 가라앉아야 한다. */
export const SPECTRUM_DECAY = 0.72;
const MIN_H = 3;
const MAX_H = 20;
const HEIGHT = 24;

/** 레벨(0~1) → 막대 높이(px). 감마 0.55 — 원시 RMS 는 작은 값에 몰려 있어 선형이면 거의 안 움직인다. */
export function barHeight(level: number): number {
  'worklet';
  const v = level > 1 ? 1 : level < 0 ? 0 : level;
  return MIN_H + (MAX_H - MIN_H) * Math.pow(v, 0.55);
}

/** 한 칸 스크롤 — 왼쪽 한 개를 버리고 오른쪽에 새 샘플을 넣는다(길이 불변). */
export function pushLevel(prev: number[], level: number): number[] {
  const v = level > 1 ? 1 : level < 0 ? 0 : level;
  const next = prev.slice(1);
  next.push(v);
  return next;
}

export default function MicSpectrum({ active, levelRef }: {
  /** 듣는 중일 때만 그린다(평소엔 자리도 차지하지 않는다 — 컨트롤 행이 늘 넓어 보이면 안 된다). */
  active: boolean;
  /** 최근 입력 레벨(0~1). 컴포저의 onVolume 이 여기에 써 넣는다. */
  levelRef: React.MutableRefObject<number>;
}) {
  const C = v2.colors;
  const bars = useSharedValue<number[]>(new Array(SPECTRUM_BARS).fill(0));

  useEffect(() => {
    if (!active) {
      bars.value = new Array(SPECTRUM_BARS).fill(0);
      levelRef.current = 0;
      return;
    }
    const id = setInterval(() => {
      bars.value = pushLevel(bars.value, levelRef.current);
      levelRef.current *= SPECTRUM_DECAY;
    }, SPECTRUM_STEP_MS);
    return () => clearInterval(id);
  }, [active, bars, levelRef]);

  if (!active) return null;
  return (
    <View
      accessibilityLabel={i18n.t('수음 중')}
      testID="mic-spectrum"
      style={{
        flex: 1, minWidth: 56, height: HEIGHT, marginHorizontal: 4,
        flexDirection: 'row', alignItems: 'center', gap: 2,
      }}
    >
      {/* 색은 **무채색**이다(2026-07-28 색 규율: "과한 포인트 컬러 사용은 AI 스러운 느낌" — accent 는
          상태 신호 전용). 파형은 이미 높이로 말하므로 색을 더 얹을 이유가 없다. */}
      {Array.from({ length: SPECTRUM_BARS }, (_, i) => (
        <Bar key={i} index={i} bars={bars} color={C.text2} />
      ))}
    </View>
  );
}

function Bar({ index, bars, color }: { index: number; bars: SharedValue<number[]>; color: string }) {
  // 높이 애니메이션은 UI 스레드에서만 돈다(막대 22개 × 초당 14칸 = JS 작업 0).
  const style = useAnimatedStyle(() => ({
    height: withTiming(barHeight(bars.value[index] ?? 0), { duration: SPECTRUM_STEP_MS }),
  }));
  return <Animated.View style={[{ flex: 1, minWidth: 2, borderRadius: 999, backgroundColor: color, opacity: 0.85 }, style]} />;
}
