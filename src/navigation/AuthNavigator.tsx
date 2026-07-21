import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import OnboardingFlow from '../screens/Onboarding/OnboardingFlow';
import { getOnboardingSeen } from '../utils/anonId';
import { v2Colors } from '../theme/v2Tokens';

// 비로그인 흐름 호스트.
// - 신규 기기: 진입 온보딩(캐러셀 3) → 설문(4) → 개인화 완료 → 로그인
// - 이미 온보딩을 거친 기기(onboardingSeen): 로그인 화면부터 시작
const AuthNavigator: React.FC = () => {
  const [seen, setSeen] = useState<boolean | null>(null);

  useEffect(() => {
    getOnboardingSeen().then(setSeen);
  }, []);

  // 플래그 판별 전: 다크 배경만(스플래시는 AuthContext가 종료)
  if (seen === null) return <View style={styles.container} />;

  // [온보딩 임시 숨김] 신규 기기여도 진입 캐러셀·설문을 건너뛰고 항상 로그인부터 시작.
  //  나중에 온보딩을 되살리려면 startAtLogin={seen} 으로 되돌리면 됨.
  return <OnboardingFlow startAtLogin={true} />;
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: v2Colors.base,
  },
});

export default AuthNavigator;
