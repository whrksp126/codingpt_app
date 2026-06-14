import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, LayoutChangeEvent } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSequence, withDelay,
  cancelAnimation, interpolate, Easing, useReducedMotion,
} from 'react-native-reanimated';
import { Sparkle, FilePlus, GraduationCap, X } from 'phosphor-react-native';
import { v2Colors, v2Font, v2Syntax } from '../../theme/v2Tokens';
import { MockKind } from './data';

// 온보딩 일러스트 = 실제 UI 화면 조각(다크). 디자인 Batch1.jsx 의 MockChat/MockCode/MockLesson 재현.
// 디자인의 CSS 루프 애니메이션(floaty/caret/sparkle/indet/dot/codeline/lessonfill)을 Reanimated 로 구현.
// prefers-reduced-motion 시 정적(디자인의 @media 규칙과 동일).

const W = 300;
const EASE = Easing.inOut(Easing.ease);

// ── floaty: 카드 전체가 위아래로 부드럽게 떠다님 (5.5s) ──
function useFloaty() {
  const reduced = useReducedMotion();
  const y = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    y.value = withRepeat(withTiming(-5, { duration: 2750, easing: EASE }), -1, true);
    return () => cancelAnimation(y);
  }, [reduced, y]);
  return useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
}

// ── caret: 2px 액센트 막대 깜빡임 ──
const Caret: React.FC = () => {
  const reduced = useReducedMotion();
  const o = useSharedValue(1);
  useEffect(() => {
    if (reduced) return;
    o.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 0 }), withTiming(1, { duration: 480 }),
        withTiming(0, { duration: 0 }), withTiming(0, { duration: 480 }),
      ), -1,
    );
    return () => cancelAnimation(o);
  }, [reduced, o]);
  const st = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[styles.caret, st]} />;
};

// ── sparkle: opacity .6↔1 + scale 1↔1.15 ──
const SparkleBox: React.FC = () => {
  const reduced = useReducedMotion();
  const p = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    p.value = withRepeat(withTiming(1, { duration: 850, easing: EASE }), -1, true);
    return () => cancelAnimation(p);
  }, [reduced, p]);
  const st = useAnimatedStyle(() => ({
    opacity: 0.6 + 0.4 * p.value,
    transform: [{ scale: 1 + 0.15 * p.value }],
  }));
  return (
    <Animated.View style={[styles.sparkleBox, st]}>
      <Sparkle size={15} color={v2Colors.accent} weight="fill" />
    </Animated.View>
  );
};

// ── indeterminate bar: 38% 폭 막대가 좌→우로 흐름 ──
const IndetBar: React.FC = () => {
  const reduced = useReducedMotion();
  const [w, setW] = useState(0);
  const tx = useSharedValue(0);
  useEffect(() => {
    if (!w || reduced) return;
    const barW = w * 0.38;
    tx.value = withRepeat(
      withSequence(
        withTiming(-1.3 * barW, { duration: 0 }),
        withTiming(3.6 * barW, { duration: 1400, easing: Easing.bezier(0.4, 0, 0.2, 1) }),
      ), -1,
    );
    return () => cancelAnimation(tx);
  }, [w, reduced, tx]);
  const st = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }] }));
  return (
    <View
      onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}
      style={styles.indetTrack}
    >
      <Animated.View style={[styles.indetBar, st]} />
    </View>
  );
};

// ── dot bounce (3개, stagger) ──
const Dot: React.FC<{ delay: number }> = ({ delay }) => {
  const reduced = useReducedMotion();
  const v = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    v.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 360, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: 840, easing: Easing.in(Easing.quad) }),
        ), -1,
      ),
    );
    return () => cancelAnimation(v);
  }, [reduced, v, delay]);
  const st = useAnimatedStyle(() => ({
    opacity: interpolate(v.value, [0, 1], [0.35, 1]),
    transform: [{ translateY: interpolate(v.value, [0, 1], [0, -4]) }],
  }));
  return <Animated.View style={[styles.dot, st]} />;
};

function MockChat() {
  const floaty = useFloaty();
  return (
    <Animated.View style={[styles.card, { width: W }, floaty]}>
      <View style={styles.userBubble}>
        <Text style={styles.userBubbleText}>할 일 앱 만들어줘</Text>
      </View>
      <SparkleBox />
      <View style={styles.caretRow}>
        <Text style={styles.chatLine}>구조를 잡고 파일을 만들게요</Text>
        <Caret />
      </View>
      <View style={styles.fileRow}>
        <FilePlus size={16} color={v2Colors.accent} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.fileName}>App.jsx</Text>
          <Text style={styles.fileSub}>파일 생성</Text>
        </View>
        <Text style={styles.fileView}>보기</Text>
        <IndetBar />
      </View>
      <View style={styles.statusRow}>
        <Text style={styles.statusText}>코드 작성 중</Text>
        <View style={{ flexDirection: 'row', gap: 3 }}>
          <Dot delay={0} /><Dot delay={150} /><Dot delay={300} />
        </View>
      </View>
    </Animated.View>
  );
}

// ── code line: 페이드 인/홀드/아웃 사이클 (4s, per-line delay) ──
const CodeLineAnim: React.FC<{ n: number; delay: number; children: React.ReactNode; caret?: boolean }> = ({ n, delay, children, caret }) => {
  const reduced = useReducedMotion();
  const v = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) return;
    v.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 480 }),
          withTiming(1, { duration: 3040 }),
          withTiming(0, { duration: 480 }),
        ), -1,
      ),
    );
    return () => cancelAnimation(v);
  }, [reduced, v, delay]);
  const st = useAnimatedStyle(() => ({
    opacity: v.value,
    transform: [{ translateY: interpolate(v.value, [0, 1], [5, 0]) }],
  }));
  return (
    <Animated.View style={[styles.codeLine, st]}>
      <Text style={styles.codeNum}>{n}</Text>
      <Text style={styles.codeText}>{children}</Text>
      {caret && <Caret />}
    </Animated.View>
  );
};

function MockCode() {
  const floaty = useFloaty();
  const kw = (t: string) => <Text style={{ color: v2Syntax.keyword }}>{t}</Text>;
  const st = (t: string) => <Text style={{ color: v2Syntax.string }}>{t}</Text>;
  const df = (t: string) => <Text style={{ color: v2Syntax.default }}>{t}</Text>;
  const cm = (t: string) => <Text style={{ color: v2Syntax.comment }}>{t}</Text>;
  return (
    <Animated.View style={[styles.codeCard, { width: W }, floaty]}>
      <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: v2Colors.border }}>
        <View style={{ paddingVertical: 9, paddingHorizontal: 14, backgroundColor: v2Colors.elevated, borderTopWidth: 2, borderTopColor: v2Colors.accent }}>
          <Text style={{ fontFamily: v2Font.mono, fontSize: 12, color: v2Colors.text }}>App.jsx</Text>
        </View>
        <View style={{ paddingVertical: 9, paddingHorizontal: 14 }}>
          <Text style={{ fontFamily: v2Font.mono, fontSize: 12, color: v2Colors.textDim }}>Todo.jsx</Text>
        </View>
      </View>
      <View style={{ paddingVertical: 12, paddingHorizontal: 14, position: 'relative' }}>
        <CodeLineAnim n={1} delay={0}>{kw('function')}{df(' App() {')}</CodeLineAnim>
        <CodeLineAnim n={2} delay={300}>{df('  ')}{cm('// 할 일 목록')}</CodeLineAnim>
        <CodeLineAnim n={3} delay={600} caret>{df('  ')}{kw('return')}{df(' <')}{st('Todos')}{df(' />')}</CodeLineAnim>
        <CodeLineAnim n={4} delay={900}>{df('}')}</CodeLineAnim>
        <IndetBar />
      </View>
    </Animated.View>
  );
}

// ── lesson fill: 8%→60%→hold→8% 사이클 ──
const LessonFill: React.FC = () => {
  const reduced = useReducedMotion();
  const [w, setW] = useState(0);
  const f = useSharedValue(0.08);
  useEffect(() => {
    if (reduced) return;
    f.value = withRepeat(
      withSequence(
        withTiming(0.60, { duration: 1428, easing: EASE }),
        withTiming(0.60, { duration: 612 }),
        withTiming(0.08, { duration: 1360, easing: EASE }),
      ), -1,
    );
    return () => cancelAnimation(f);
  }, [reduced, f]);
  const st = useAnimatedStyle(() => ({ width: w ? f.value * w : 0 }));
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={styles.lessonTrack}>
      <Animated.View style={[styles.lessonFill, st]} />
    </View>
  );
};

function MockLesson() {
  const floaty = useFloaty();
  return (
    <Animated.View style={[{ width: W, gap: 12 }, floaty]}>
      <View style={styles.lessonChip}>
        <GraduationCap size={17} color={v2Colors.accent} />
        <Text style={{ fontSize: 12.5, color: v2Colors.text, lineHeight: 18, fontFamily: v2Font.sans, flex: 1 }}>
          이 개념 처음이죠? <Text style={{ color: v2Colors.accent, fontWeight: '700' }}>3분 레슨</Text>
        </Text>
        <X size={13} color={v2Colors.textDim} />
      </View>
      <View style={{ backgroundColor: v2Colors.surface, borderColor: v2Colors.border, borderWidth: 1, borderRadius: 14, padding: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: v2Colors.text, fontFamily: v2Font.sans }}>배열 .map() 이해하기</Text>
          <Text style={{ fontFamily: v2Font.mono, fontSize: 11, color: v2Colors.textDim }}>3 / 5</Text>
        </View>
        <Text style={{ fontSize: 12, color: v2Colors.textDim, marginBottom: 12, fontFamily: v2Font.sans }}>초급 · 데이터 변환</Text>
        <LessonFill />
      </View>
    </Animated.View>
  );
}

const Mock: React.FC<{ kind: MockKind }> = ({ kind }) => {
  if (kind === 'chat') return <MockChat />;
  if (kind === 'code') return <MockCode />;
  return <MockLesson />;
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: v2Colors.surface, borderColor: v2Colors.border, borderWidth: 1,
    borderRadius: 14, padding: 16, gap: 12,
  },
  codeCard: {
    backgroundColor: v2Colors.base, borderColor: v2Colors.border, borderWidth: 1,
    borderRadius: 14, overflow: 'hidden',
  },
  userBubble: {
    alignSelf: 'flex-end', maxWidth: '82%',
    backgroundColor: v2Colors.elevated2, borderColor: v2Colors.border, borderWidth: 1,
    borderTopLeftRadius: 12, borderTopRightRadius: 12, borderBottomLeftRadius: 12, borderBottomRightRadius: 4,
    paddingVertical: 9, paddingHorizontal: 12,
  },
  userBubbleText: { fontSize: 13, color: v2Colors.text, fontFamily: v2Font.sans },
  caretRow: { flexDirection: 'row', alignItems: 'center' },
  caret: { width: 2, height: 13, backgroundColor: v2Colors.accent, marginLeft: 3, borderRadius: 1 },
  chatLine: { fontSize: 12.5, color: v2Colors.text2, lineHeight: 19, fontFamily: v2Font.sans },
  fileName: { fontFamily: v2Font.mono, fontSize: 12.5, color: v2Colors.text },
  fileSub: { fontSize: 10.5, color: v2Colors.textDim, fontFamily: v2Font.sans, marginTop: 1 },
  fileView: { fontSize: 11, color: v2Colors.accent, fontWeight: '600', fontFamily: v2Font.sans },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  statusText: { fontSize: 11, color: v2Colors.textDim, fontFamily: v2Font.sans },
  sparkleBox: {
    width: 30, height: 30, borderRadius: 8, backgroundColor: v2Colors.accentTint,
    alignItems: 'center', justifyContent: 'center',
  },
  fileRow: {
    flexDirection: 'row', alignItems: 'center', gap: 9, overflow: 'hidden',
    backgroundColor: v2Colors.base, borderColor: v2Colors.borderControl, borderWidth: 1,
    borderRadius: 9, paddingVertical: 8, paddingHorizontal: 10,
  },
  indetTrack: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, overflow: 'hidden' },
  indetBar: { width: '38%', height: 2, backgroundColor: v2Colors.accent, borderRadius: 999 },
  dot: { width: 5, height: 5, borderRadius: 999, backgroundColor: v2Colors.accent },
  codeLine: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  codeNum: { width: 16, textAlign: 'right', color: v2Colors.textDim, fontFamily: v2Font.mono, fontSize: 12, lineHeight: 22 },
  codeText: { fontFamily: v2Font.mono, fontSize: 12, lineHeight: 22 },
  lessonTrack: { height: 4, backgroundColor: v2Colors.borderControl, borderRadius: 999, overflow: 'hidden' },
  lessonFill: { height: '100%', backgroundColor: v2Colors.accent, borderRadius: 999 },
  lessonChip: {
    flexDirection: 'row', alignItems: 'center', gap: 9,
    backgroundColor: v2Colors.accentTint, borderColor: 'rgba(52,211,153,0.3)', borderWidth: 1,
    borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12,
  },
});

export default Mock;
