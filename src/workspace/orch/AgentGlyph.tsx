// AgentGlyph.tsx — 에이전트 상태 표식 한 벌(사이드바 에이전트 행 · pane 탭이 같이 쓴다). PC agent-glyph.js 와 같은 어휘.
//  일하는 중 = 도는 고리, 끝 = 체크, 답이 필요 = 물음표, 근거 없음 = 점선 고리, 막힘·실패 = 빨간 점, 멈춤 = 흐린 점, 한가함 = 회색 점.
//  색은 상태 신호에만 쓴다(무채색 규칙의 예외는 여기뿐).
import React, { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing, cancelAnimation, useReducedMotion } from 'react-native-reanimated';
import { CheckCircle, Question, CircleDashed } from 'phosphor-react-native';
import { v2 } from '../../theme/v2Tokens';
import type { AgentGlyphKind } from './orchModel';

const COLOR = { working: '#eab308', done: '#10b981', waiting: '#ea580c', unverifiable: '#f59e0b', error: '#ef4444' };

function Spinner({ size }: { size: number }) {
  const r = useSharedValue(0);
  const still = useReducedMotion();
  useEffect(() => {
    if (still) return undefined;
    r.value = withRepeat(withTiming(360, { duration: 1000, easing: Easing.linear }), -1, false);
    return () => { cancelAnimation(r); };
  }, [r, still]);
  const st = useAnimatedStyle(() => ({ transform: [{ rotate: `${r.value}deg` }] }));
  const d = Math.round(size * 0.72);
  return <Animated.View style={[{ width: d, height: d, borderRadius: d / 2, borderWidth: 2, borderColor: COLOR.working, borderTopColor: 'transparent' }, st]} />;
}

export default function AgentGlyph({ glyph, size = 13 }: { glyph: AgentGlyphKind | string; size?: number }) {
  const C = v2.colors;
  let inner: React.ReactNode;
  if (glyph === 'working') inner = <Spinner size={size} />;
  else if (glyph === 'done') inner = <CheckCircle size={size} color={COLOR.done} weight="bold" />;
  else if (glyph === 'waiting') inner = <Question size={size} color={COLOR.waiting} weight="bold" />;
  else if (glyph === 'unverifiable') inner = <CircleDashed size={size} color={COLOR.unverifiable} weight="bold" />;
  else {
    const bg = glyph === 'blocked' || glyph === 'failed' ? COLOR.error : glyph === 'interrupted' ? C.text3 : C.textDim;
    inner = <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: bg, opacity: glyph === 'idle' ? 0.6 : 1 }} />;
  }
  return <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>{inner}</View>;
}
