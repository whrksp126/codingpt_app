import React, { useEffect } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import {
  ArrowFatRight,
  ArrowFatLineLeft,
  ArrowFatLineRight,
  ArrowCounterClockwise,
  Play,
  Pause,
} from 'phosphor-react-native';
import { useScaleOnPress } from '../../animations/hooks';
import { haptic } from '../../animations/haptics';

// 가운데(재생/일시정지) 버튼 모드
//  - play / pause : 일반 모듈 자동등장 재생/정지
//  - quiz-disabled: 퀴즈가 떴지만 아직 미응답 — 비활성 + 안내 텍스트
//  - quiz-grade   : 응답 완료 — "채점하기" 활성
export type CenterMode = 'play' | 'pause' | 'quiz-disabled' | 'quiz-grade';
export type NextMode = 'next-module' | 'next-slide';

export interface EndingButton {
  id: string;
  text: string;
  action?: any;
  style?: { backgroundColor?: string; textColor?: string };
}

const TRACK = 'rgba(0,0,0,0.08)';
const CORRECT = '#08875D';
const WRONG = '#E02D3C';
// 유리 느낌의 반투명 배경 — 아래 레슨 내용이 살짝 비쳐 영역이 더 넓어 보인다.
const GLASS_BG = 'rgba(255,255,255,0.62)';

interface LessonBottomBarProps {
  canGoPrev: boolean;
  onPrev: () => void;
  onRestart: () => void;
  centerMode: CenterMode;
  quizPrompt?: string;
  onCenterPress: () => void;
  nextMode: NextMode;
  canGoNext: boolean;
  onNext: () => void;
  moduleProgress: number;      // 목표 채움 (0~1) — 실제 오디오 재생 기반
  progressKey: number;         // 슬라이드 바뀔 때 진행바를 0부터 다시 시작시키기 위한 키
  accentColor: string;         // 현재 슬라이드 콘셉 색
  gradeResult: 'correct' | 'wrong' | null;
  endingButtons?: EndingButton[] | null;
  onEndingPress?: (button: EndingButton) => void;
  insetsBottom: number;
}

// 슬라이드 내 모듈 진행도 — target(실제 오디오 재생 기반)으로 부드럽게 따라간다.
const ModuleProgressBar: React.FC<{ target: number; color: string }> = ({ target, color }) => {
  const w = useSharedValue(0);
  useEffect(() => {
    const clamped = Math.max(0, Math.min(1, target));
    // 오디오 progress 가 자주 들어오므로 짧게 따라가기만 하면 연속적으로 보인다.
    w.value = withTiming(clamped, { duration: 180, easing: Easing.linear });
  }, [target, w]);
  const style = useAnimatedStyle(() => ({ width: `${w.value * 100}%` }));
  return (
    <View style={{ height: 3, backgroundColor: TRACK, borderRadius: 2, overflow: 'hidden' }}>
      <Animated.View style={[{ height: 3, backgroundColor: color, borderRadius: 2 }, style]} />
    </View>
  );
};

// 정사각 아이콘 버튼 — 비활성 시 투명도 30%
const SquareBtn: React.FC<{
  onPress: () => void;
  color: string;
  disabled?: boolean;
  children: React.ReactNode;
}> = ({ onPress, color, disabled = false, children }) => {
  const { style, onPressIn, onPressOut } = useScaleOnPress({ pressed: 0.92 });
  return (
    <Animated.View style={style}>
      <Pressable
        onPress={() => {
          if (disabled) return;
          haptic.light();
          onPress();
        }}
        onPressIn={() => { if (!disabled) onPressIn(); }}
        onPressOut={() => { if (!disabled) onPressOut(); }}
        disabled={disabled}
        style={{
          width: 56,
          height: 56,
          borderRadius: 16,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: color,
          opacity: disabled ? 0.3 : 1,
        }}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
};

// 엔딩 풀폭 버튼 (다음 레슨 바로가기 / 학습 종료)
const EndingFullBtn: React.FC<{ button: EndingButton; color: string; onPress: () => void }> = ({ button, color, onPress }) => {
  const { style, onPressIn, onPressOut } = useScaleOnPress({ pressed: 0.97 });
  return (
    <Animated.View style={style}>
      <Pressable
        onPress={() => { haptic.light(); onPress(); }}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={{
          height: 56,
          borderRadius: 16,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: button.style?.backgroundColor || color,
        }}
      >
        <Text
          style={{
            fontFamily: 'PretendardVariable',
            fontWeight: '700',
            fontSize: 16,
            letterSpacing: -0.32,
            color: button.style?.textColor || '#FFFFFF',
          }}
        >
          {button.text}
        </Text>
      </Pressable>
    </Animated.View>
  );
};

export const LessonBottomBar: React.FC<LessonBottomBarProps> = ({
  canGoPrev,
  onPrev,
  onRestart,
  centerMode,
  quizPrompt,
  onCenterPress,
  nextMode,
  canGoNext,
  onNext,
  moduleProgress,
  progressKey,
  accentColor,
  gradeResult,
  endingButtons,
  onEndingPress,
  insetsBottom,
}) => {
  const { style: centerScale, onPressIn, onPressOut } = useScaleOnPress({ pressed: 0.97 });

  const isQuiz = centerMode === 'quiz-disabled' || centerMode === 'quiz-grade';
  const centerDisabled = centerMode === 'quiz-disabled';
  const isEnding = !!(endingButtons && endingButtons.length > 0);
  const color = accentColor || '#08875D';

  return (
    <View
      style={{
        paddingHorizontal: 16,
        // 상단 패딩 제거 → 모듈 진행바가 위에 딱 붙는다. 엔딩(진행바 없음)일 땐 약간의 여백.
        paddingTop: isEnding ? 16 : 0,
        paddingBottom: Math.max(insetsBottom, 12),
      }}
    >
      {/* 배경: 상단(진행바 영역)만 투명→불투명으로 페이드되고, 버튼/세이프에어리어 영역은 완전 불투명.
          (세이프에어리어 패딩 영역이 비쳐 콘텐츠가 보이던 문제 방지 → 아래쪽은 opacity 1) */}
      <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <LinearGradient id="barFade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0" />
            <Stop offset="0.35" stopColor="#FFFFFF" stopOpacity="1" />
            <Stop offset="1" stopColor="#FFFFFF" stopOpacity="1" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#barFade)" />
      </Svg>

      {/* 모듈 진행도 — 엔딩 화면에선 표시하지 않음 */}
      {!isEnding && (
        <View style={{ marginBottom: 12 }}>
          {/* key 로 슬라이드마다 remount → 이전 슬라이드의 채움값에서 출발하지 않고 0부터 시작 */}
          <ModuleProgressBar key={progressKey} target={moduleProgress} color={color} />
        </View>
      )}

      {/* 채점 결과 텍스트 — 정답/오답 (다음 모듈로 넘어갈 때 제거) */}
      {gradeResult && (
        <Text
          style={{
            fontFamily: 'PretendardVariable',
            fontWeight: '700',
            fontSize: 20,
            letterSpacing: -0.4,
            marginBottom: 12,
            color: gradeResult === 'correct' ? CORRECT : WRONG,
          }}
        >
          {gradeResult === 'correct' ? '정답입니다' : '오답입니다'}
        </Text>
      )}

      {isEnding ? (
        // 엔딩 — 기존 컨트롤 제거하고 액션 버튼들을 위아래로.
        <View style={{ gap: 10 }}>
          {endingButtons!.map((b) => (
            <EndingFullBtn key={b.id} button={b} color={color} onPress={() => onEndingPress?.(b)} />
          ))}
        </View>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {/* 이전 슬라이드 */}
          <SquareBtn onPress={onPrev} color={color} disabled={!canGoPrev}>
            <ArrowFatLineLeft size={26} color="#FFFFFF" weight="fill" />
          </SquareBtn>

          {/* 현재 슬라이드 초기화 */}
          <SquareBtn onPress={onRestart} color={color}>
            <ArrowCounterClockwise size={24} color="#FFFFFF" weight="fill" />
          </SquareBtn>

          {/* 재생/일시정지 (퀴즈 모드 전환) */}
          <Animated.View style={[{ flex: 1 }, centerScale]}>
            <Pressable
              onPress={() => {
                if (centerDisabled) return;
                haptic.light();
                onCenterPress();
              }}
              onPressIn={() => { if (!centerDisabled) onPressIn(); }}
              onPressOut={() => { if (!centerDisabled) onPressOut(); }}
              disabled={centerDisabled}
              style={{
                height: 56,
                borderRadius: 16,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: color,
                opacity: centerDisabled ? 0.3 : 1,
              }}
            >
              {isQuiz ? (
                <Text
                  style={{
                    fontFamily: 'PretendardVariable',
                    fontWeight: '700',
                    fontSize: 16,
                    letterSpacing: -0.32,
                    color: '#FFFFFF',
                  }}
                >
                  {centerMode === 'quiz-grade' ? '채점하기' : (quizPrompt ?? '')}
                </Text>
              ) : centerMode === 'play' ? (
                <Play size={26} color="#FFFFFF" weight="fill" />
              ) : (
                <Pause size={26} color="#FFFFFF" weight="fill" />
              )}
            </Pressable>
          </Animated.View>

          {/* 다음 모듈 / 다음 슬라이드 */}
          <SquareBtn onPress={onNext} color={color} disabled={!canGoNext}>
            {nextMode === 'next-slide' ? (
              <ArrowFatLineRight size={26} color="#FFFFFF" weight="fill" />
            ) : (
              <ArrowFatRight size={26} color="#FFFFFF" weight="fill" />
            )}
          </SquareBtn>
        </View>
      )}
    </View>
  );
};

export default LessonBottomBar;
