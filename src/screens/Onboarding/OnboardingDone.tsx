import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming, withDelay,
  interpolate, Easing, useReducedMotion, cancelAnimation,
} from 'react-native-reanimated';
import { Check, Briefcase, Sparkle, RocketLaunch, IconProps } from 'phosphor-react-native';
import PressableScale from '../../components/ui/PressableScale';
import { v2Colors, v2Font } from '../../theme/v2Tokens';
import { SurveyAnswers } from './OnboardingFlow';
import { SURVEY_QUESTIONS, SurveyKey } from './data';

// 온보딩 CTA 그린 (OnboardingFlow와 동일)
const ONBOARDING_GREEN = '#08875D';

// 설문 답변 라벨 → 해당 옵션의 실제 아이콘
const iconFor = (key: SurveyKey, label?: string) =>
  SURVEY_QUESTIONS.find((q) => q.key === key)?.options.find((o) => o.label === label)?.Icon;

// 체크 링 — scale 1↔1.04 펄스 (디자인 ringPulse)
const Ring: React.FC = () => {
  const reduced = useReducedMotion();
  const s = useSharedValue(1);
  useEffect(() => {
    if (reduced) return;
    s.value = withRepeat(withTiming(1.04, { duration: 1000, easing: Easing.inOut(Easing.ease) }), -1, true);
    return () => cancelAnimation(s);
  }, [reduced, s]);
  const st = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <Animated.View style={[styles.ring, st]}>
      <Check size={34} color={v2Colors.accent} weight="bold" />
    </Animated.View>
  );
};

// 요약 행 — 진입 시 fade up (stagger)
const FadeUpRow: React.FC<{ delay: number; children: React.ReactNode }> = ({ delay, children }) => {
  const reduced = useReducedMotion();
  const v = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) return;
    v.value = withDelay(delay, withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) }));
    return () => cancelAnimation(v);
  }, [reduced, v, delay]);
  const st = useAnimatedStyle(() => ({
    opacity: v.value,
    transform: [{ translateY: interpolate(v.value, [0, 1], [6, 0]) }],
  }));
  return <Animated.View style={[styles.summaryRow, st]}>{children}</Animated.View>;
};

interface OnboardingDoneProps {
  answers: SurveyAnswers;
  onStart: () => void;
}

// 개인화 완료 화면 — 체크 링 + 수집 답변 요약 + CTA(로그인으로). 디자인 OnboardingDone 재현.
const OnboardingDone: React.FC<OnboardingDoneProps> = ({ answers, onStart }) => {
  const insets = useSafeAreaInsets();
  const summary: { Icon: React.ComponentType<IconProps>; label: string; k: string }[] = [];
  if (answers.job)
    summary.push({ Icon: iconFor('job', answers.job) ?? Briefcase, label: answers.job, k: '직업' });
  if (answers.aiExperience)
    summary.push({ Icon: iconFor('aiExperience', answers.aiExperience) ?? Sparkle, label: answers.aiExperience, k: '수준' });
  if (answers.purposes && answers.purposes.length > 0)
    summary.push({ Icon: iconFor('purposes', answers.purposes[0]) ?? RocketLaunch, label: answers.purposes.join(' · '), k: '목적' });

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.body}>
        <Ring />
        <View style={{ alignItems: 'center' }}>
          <Text style={styles.title}>준비가 끝났어요</Text>
          <Text style={styles.sub}>알려주신 내용에 맞춰{'\n'}나만의 워크스페이스를 맞췄어요.</Text>
        </View>
        <View style={styles.summaryWrap}>
          {summary.map((s, i) => (
            <FadeUpRow key={s.k} delay={150 + i * 120}>
              <View style={styles.summaryIcon}>
                <s.Icon size={17} color={v2Colors.accent} />
              </View>
              <Text style={styles.summaryLabel} numberOfLines={1}>{s.label}</Text>
              <Text style={styles.summaryKey}>{s.k}</Text>
            </FadeUpRow>
          ))}
        </View>
      </View>
      <View style={[styles.footer, { paddingBottom: 32 + insets.bottom }]}>
        <PressableScale
          onPress={onStart}
          android_ripple={{ color: 'rgba(255,255,255,0.18)' }}
          style={styles.ctaBtn}
        >
          <Text style={styles.ctaText}>로그인하고 시작하기</Text>
        </PressableScale>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: v2Colors.base },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 22,
  },
  ring: {
    width: 76,
    height: 76,
    borderRadius: 999,
    backgroundColor: v2Colors.accentTint,
    borderWidth: 1.5,
    borderColor: v2Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: v2Font.sans,
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.72,
    color: v2Colors.text,
  },
  sub: {
    fontFamily: v2Font.sans,
    fontSize: 14,
    color: v2Colors.text3,
    marginTop: 10,
    lineHeight: 22,
    textAlign: 'center',
  },
  summaryWrap: {
    width: '100%',
    gap: 9,
    marginTop: 4,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: v2Colors.surface,
    borderColor: v2Colors.border,
    borderWidth: 1,
    borderRadius: 11,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  summaryIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: v2Colors.accentTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryLabel: {
    flex: 1,
    fontFamily: v2Font.sans,
    fontSize: 13.5,
    fontWeight: '600',
    color: v2Colors.text,
  },
  summaryKey: {
    fontFamily: v2Font.mono,
    fontSize: 11,
    color: v2Colors.textDim,
  },
  footer: {
    paddingHorizontal: 28,
    paddingTop: 10,
    paddingBottom: 32,
  },
  ctaBtn: {
    height: 54,
    borderRadius: 14,
    backgroundColor: ONBOARDING_GREEN,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    fontFamily: v2Font.sans,
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});

export default OnboardingDone;
