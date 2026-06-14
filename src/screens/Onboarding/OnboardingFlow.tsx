import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, BackHandler } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import OnboardingProgress, { TOTAL_STEPS } from './OnboardingProgress';
import { CarouselContent, SurveyContent, Direction } from './steps';
import OnboardingDone from './OnboardingDone';
import LoginScreen from '../Auth/LoginScreen';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import PressableScale from '../../components/ui/PressableScale';

import { CAROUSEL_STEPS, SURVEY_QUESTIONS } from './data';
import { v2Colors, v2Font } from '../../theme/v2Tokens';
import { getOrCreateAnonId, setOnboardingSeen } from '../../utils/anonId';
import { onboardingService } from '../../services/onboardingService';

// 온보딩 CTA — 레퍼런스 그린(딥그린) + 흰 글씨.
const ONBOARDING_GREEN = '#08875D';

export interface SurveyAnswers {
  job?: string;
  referralSource?: string;
  aiExperience?: string;
  purposes?: string[];
}

type Phase = 'carousel' | 'survey' | 'done' | 'login';

interface OnboardingFlowProps {
  // 이미 온보딩을 거친 기기는 로그인부터 시작.
  startAtLogin?: boolean;
}

const CAROUSEL_LEN = CAROUSEL_STEPS.length; // 3
const SURVEY_LEN = SURVEY_QUESTIONS.length; // 4

const OnboardingFlow: React.FC<OnboardingFlowProps> = ({ startAtLogin }) => {
  const insets = useSafeAreaInsets();

  const [phase, setPhase] = useState<Phase>(startAtLogin ? 'login' : 'carousel');
  const [carouselIdx, setCarouselIdx] = useState(0);
  const [surveyIdx, setSurveyIdx] = useState(0);
  const [answers, setAnswers] = useState<SurveyAnswers>({});
  const [exitVisible, setExitVisible] = useState(false);
  const [direction, setDirection] = useState<Direction>('forward');
  const anonIdRef = useRef<string | null>(null);

  useEffect(() => {
    getOrCreateAnonId().then((id) => { anonIdRef.current = id; });
  }, []);

  // 개인화 완료 진입 시 익명 설문 응답 제출(로그인 전 보존). 실패해도 흐름은 진행.
  const submitOnboarding = async () => {
    try {
      const anonId = anonIdRef.current ?? (await getOrCreateAnonId());
      await onboardingService.submit({
        anonId,
        job: answers.job,
        referralSource: answers.referralSource,
        aiExperience: answers.aiExperience,
        purposes: answers.purposes ?? [],
      });
    } catch (e) {
      console.warn('온보딩 응답 제출 실패(무시):', e);
    }
  };

  const goNext = () => {
    setDirection('forward');
    if (phase === 'carousel') {
      if (carouselIdx < CAROUSEL_LEN - 1) setCarouselIdx((i) => i + 1);
      else { setPhase('survey'); setSurveyIdx(0); }
      return;
    }
    if (phase === 'survey') {
      if (surveyIdx < SURVEY_LEN - 1) setSurveyIdx((i) => i + 1);
      else { setPhase('done'); submitOnboarding(); }
    }
  };

  const goBack = () => {
    setDirection('back');
    if (phase === 'carousel') {
      if (carouselIdx > 0) setCarouselIdx((i) => i - 1);
      return;
    }
    if (phase === 'survey') {
      if (surveyIdx > 0) setSurveyIdx((i) => i - 1);
      else { setPhase('carousel'); setCarouselIdx(CAROUSEL_LEN - 1); }
    }
  };

  const goToLogin = async () => {
    await setOnboardingSeen(); // 개인화 완료 후엔 재진입 시 온보딩 스킵
    setPhase('login');
  };

  // ── 로그인 단계: 자체 인셋/배경 보유 ──
  if (phase === 'login') return <LoginScreen />;

  // ── 개인화 완료 단계 ──
  if (phase === 'done') return <OnboardingDone answers={answers} onStart={goToLogin} />;

  // ── 진입 온보딩 / 설문 단계 (상단 통합 프로그래스 고정) ──
  const globalStep = phase === 'carousel' ? carouselIdx + 1 : CAROUSEL_LEN + surveyIdx + 1;

  let content: React.ReactNode;
  let cta: string;
  let canGoBack: boolean;
  let canProceed = true; // 캐러셀은 항상 진행 가능

  if (phase === 'carousel') {
    const step = CAROUSEL_STEPS[carouselIdx];
    content = <CarouselContent step={step} direction={direction} />;
    cta = '다음';
    canGoBack = carouselIdx > 0;
  } else {
    const q = SURVEY_QUESTIONS[surveyIdx];
    const value = answers[q.key];
    content = (
      <SurveyContent
        question={q}
        value={value}
        onChange={(next) => setAnswers((a) => ({ ...a, [q.key]: next }))}
        direction={direction}
      />
    );
    cta = q.cta;
    canGoBack = true;
    // 설문은 선택해야 다음으로 진행 가능
    canProceed = q.multi
      ? Array.isArray(value) && value.length > 0
      : typeof value === 'string' && value.length > 0;
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <OnboardingProgress
        progress={globalStep / TOTAL_STEPS}
        variant={phase === 'carousel' && carouselIdx === 0 ? 'close' : 'back'}
        canGoBack={canGoBack}
        onBack={goBack}
        onClose={() => setExitVisible(true)}
      />
      <Animated.View key={phase === 'carousel' ? `c${carouselIdx}` : `s${surveyIdx}`} style={{ flex: 1 }}>
        {content}
      </Animated.View>
      <View style={[styles.footer, { paddingHorizontal: phase === 'carousel' ? 28 : 24, paddingBottom: 28 + insets.bottom }]}>
        {/* 인라인 스타일 Pressable — Button 컴포넌트 머지 이슈 우회, 배경색 확실히 적용. */}
        <PressableScale
          onPress={goNext}
          disabled={!canProceed}
          android_ripple={{ color: 'rgba(255,255,255,0.18)' }}
          style={[styles.ctaBtn, !canProceed && styles.ctaBtnDisabled]}
        >
          <Text style={styles.ctaText}>{cta}</Text>
        </PressableScale>
      </View>

      <ConfirmDialog
        visible={exitVisible}
        title="앱을 종료할까요?"
        message="둘러보기를 멈추고 코딩PT를 닫아요."
        confirmText="종료"
        cancelText="계속 둘러보기"
        destructive
        onConfirm={() => { setExitVisible(false); BackHandler.exitApp(); }}
        onCancel={() => setExitVisible(false)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: v2Colors.base,
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 10,
  },
  ctaBtn: {
    height: 54,
    borderRadius: 14,
    backgroundColor: ONBOARDING_GREEN,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaBtnDisabled: {
    opacity: 0.45,
  },
  ctaText: {
    fontFamily: v2Font.sans,
    fontSize: 16,
    fontWeight: v2Font.weight.bold,
    color: '#FFFFFF',
  },
});

export default OnboardingFlow;
