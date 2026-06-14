import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { ArrowLeft, X } from 'phosphor-react-native';
import ProgressBar from '../../components/ui/ProgressBar';
import { v2Colors } from '../../theme/v2Tokens';

export const TOTAL_STEPS = 7; // 진입 온보딩 3 + 설문 4

interface OnboardingProgressProps {
  progress: number;            // 0 ~ 1 (통합 진행률)
  variant?: 'back' | 'close';  // back=뒤로(설문), close=X 종료(캐러셀)
  canGoBack?: boolean;
  onBack?: () => void;
  onClose?: () => void;
}

// 통합 상단 진행 바. 좌측 액션은 변형에 따라 X(종료) 또는 뒤로 화살표.
const OnboardingProgress: React.FC<OnboardingProgressProps> = ({
  progress,
  variant = 'back',
  canGoBack = false,
  onBack,
  onClose,
}) => {
  return (
    <View style={styles.row}>
      {variant === 'close' ? (
        <Pressable onPress={onClose} hitSlop={8} style={styles.iconBtn}>
          <X size={22} color={v2Colors.text2} weight="bold" />
        </Pressable>
      ) : (
        <Pressable
          onPress={onBack}
          hitSlop={8}
          style={[styles.iconBtn, { opacity: canGoBack ? 1 : 0 }]}
          disabled={!canGoBack}
        >
          <ArrowLeft size={20} color={v2Colors.text2} />
        </Pressable>
      )}
      <View style={{ flex: 1 }}>
        <ProgressBar progress={progress} height={6} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 20,
    paddingTop: 2,
    paddingBottom: 12,
  },
  iconBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default OnboardingProgress;
