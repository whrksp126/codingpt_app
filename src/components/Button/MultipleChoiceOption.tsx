import React, { useRef, useState } from 'react';
import { View, Pressable, Animated, Easing, Vibration, Platform } from 'react-native';
import Markdown from 'react-native-markdown-display';

interface MultipleChoiceOptionProps {
  option: any;
  questionIndex: number;
  optionIndex: number;
  question: any;
  onPress: (question: any, questionIndex: number, optionIndex: number) => void;
  markdownStyles: any;
  isReadOnly?: boolean;
}

// 마크다운 스타일 설정
const defaultMarkdownStyles: any = {
  body: {
    color: '#111',
    fontSize: 14,
    fontWeight: 400,
  },
  heading1: {
    color: '#111',
    fontSize: 16,
    fontWeight: 700,
  },
  strong: {
    fontWeight: 700,
  },
  em: {
    fontStyle: 'italic',
  },
  code_block: {
    backgroundColor: '#f1f3f4',
    borderWidth: 1,
    borderColor: '#e1e4e8',
    borderRadius: 6,
    padding: 4,
    marginVertical: 4,
    fontFamily: 'monospace',
    fontSize: 13,
    color: '#495057',
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  code_inline: {
    backgroundColor: '#f1f3f4',
    color: '#d73a49',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 3,
    fontFamily: 'monospace',
    fontSize: 13,
  },
};

export const MultipleChoiceOption: React.FC<MultipleChoiceOptionProps> = ({
  option,
  questionIndex,
  optionIndex,
  question,
  onPress,
  markdownStyles = defaultMarkdownStyles,
  isReadOnly = false,
}) => {
  // 애니메이션 상태 관리
  const buttonScale = useRef(new Animated.Value(1)).current;
  const buttonOpacity = useRef(new Animated.Value(1)).current;
  const [isPressed, setIsPressed] = useState(false);

  // 버튼 효과 함수들
  const playButtonSound = () => {
    if (Platform.OS === 'ios') {
      console.log('버튼 사운드 재생');
    }
  };

  const handleButtonPressIn = () => {
    setIsPressed(true);

    Animated.parallel([
      Animated.spring(buttonScale, {
        toValue: 0.95,
        tension: 300,
        friction: 8,
        useNativeDriver: true,
      }),
      Animated.timing(buttonOpacity, {
        toValue: 0.8,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handleButtonPressOut = () => {
    setIsPressed(false);

    Animated.parallel([
      Animated.spring(buttonScale, {
        toValue: 1,
        tension: 300,
        friction: 8,
        useNativeDriver: true,
      }),
      Animated.timing(buttonOpacity, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handleButtonPress = () => {
    // 읽기 전용 모드에서는 클릭 무시
    if (isReadOnly) return;

    // 햅틱 피드백
    playButtonSound();

    // 기존 로직 실행
    onPress(question, questionIndex, optionIndex);
  };

  // 버튼 상태에 따른 스타일 결정
  const getButtonClassName = () => {
    const isDisabled = isReadOnly || question.answer?.isCorrect !== null;

    if (isDisabled) {
      // 채점 완료 후
      if (question.answer?.isCorrect === true && question.answer?.userAnswer === optionIndex) {
        return 'border-[#08875D] bg-[#EDFDF8]'; // 정답
      }
      if (question.answer?.isCorrect === false && question.answer?.userAnswer === optionIndex) {
        return 'border-[#E02D3C] bg-[#FEF1F2]'; // 오답
      }
      if (question.answer?.isCorrect === false && question.answer?.answer === optionIndex) {
        return 'border-[#08875D] bg-[#EDFDF8]'; // 정답 표시
      }
    }

    // 선택된 상태
    if (question.answer?.userAnswer === optionIndex) {
      return 'border-[#08875D]';
    }

    // 기본 상태
    return 'border-transparent';
  };

  const isDisabled = isReadOnly || question.answer?.isCorrect !== null;

  return (
    <Animated.View
      style={{
        transform: [{ scale: buttonScale }],
        opacity: buttonOpacity,
      }}
    >
      <Pressable
        onPress={handleButtonPress}
        onPressIn={() => !isDisabled && playButtonSound()}
        onPressOut={() => { }}
        className={`border rounded-[16px] px-[24px] py-[20px] bg-[#F8F9FC] mb-[5px] ${getButtonClassName()}`}
        disabled={isDisabled}
        style={{
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.25,
          shadowRadius: 5,
          elevation: 5,
        }}
      >
        <View className="flex-row flex-wrap">
          <Markdown style={markdownStyles}>
            {option.label}
          </Markdown>
        </View>
      </Pressable>
    </Animated.View>
  );
};
