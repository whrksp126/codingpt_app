import React, { useEffect, useRef } from 'react';
import { View, Pressable } from 'react-native';
import Animated from 'react-native-reanimated';
import Markdown from 'react-native-markdown-display';
import { useScaleOnPress, useShake, useBounce } from '../../animations/hooks';
import { haptic } from '../../animations/haptics';

interface MultipleChoiceOptionProps {
  option: any;
  questionIndex: number;
  optionIndex: number;
  question: any;
  onPress: (question: any, questionIndex: number, optionIndex: number) => void;
  markdownStyles: any;
  isReadOnly?: boolean;
}

const defaultMarkdownStyles: any = {
  body: { color: '#111', fontSize: 14, fontWeight: 400 },
  heading1: { color: '#111', fontSize: 16, fontWeight: 700 },
  strong: { fontWeight: 700 },
  em: { fontStyle: 'italic' },
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
  const { style: scaleStyle, onPressIn, onPressOut } = useScaleOnPress({
    pressed: 0.97,
  });
  const shake = useShake(10);
  const bounce = useBounce(1.05);
  const lastAnsweredRef = useRef<boolean | null>(null);

  // 정/오답 결과가 도착했을 때, 해당 옵션이 사용자가 선택한 옵션이면 피드백 트리거
  useEffect(() => {
    const isCorrect = question.answer?.isCorrect;
    const userAnswer = question.answer?.userAnswer;
    if (isCorrect === null || isCorrect === undefined) {
      lastAnsweredRef.current = null;
      return;
    }
    if (userAnswer !== optionIndex) return;
    if (lastAnsweredRef.current === isCorrect) return;
    lastAnsweredRef.current = isCorrect;

    if (isCorrect) {
      bounce.trigger();
      haptic.success();
    } else {
      shake.trigger();
      haptic.error();
    }
  }, [question.answer?.isCorrect, question.answer?.userAnswer, optionIndex, bounce, shake]);

  const isDisabled = isReadOnly || question.answer?.isCorrect !== null;

  const handlePress = () => {
    if (isReadOnly) return;
    haptic.light();
    onPress(question, questionIndex, optionIndex);
  };

  const handlePressIn = () => {
    if (isDisabled) return;
    onPressIn();
  };

  const handlePressOut = () => {
    if (isDisabled) return;
    onPressOut();
  };

  const getButtonClassName = () => {
    const isDisabledState = isReadOnly || question.answer?.isCorrect !== null;
    if (isDisabledState) {
      if (question.answer?.isCorrect === true && question.answer?.userAnswer === optionIndex) {
        return 'border-[#08875D] bg-[#EDFDF8]';
      }
      if (question.answer?.isCorrect === false && question.answer?.userAnswer === optionIndex) {
        return 'border-[#E02D3C] bg-[#FEF1F2]';
      }
      if (question.answer?.isCorrect === false && question.answer?.answer === optionIndex) {
        return 'border-[#08875D] bg-[#EDFDF8]';
      }
    }
    if (question.answer?.userAnswer === optionIndex) {
      return 'border-[#08875D]';
    }
    return 'border-transparent';
  };

  return (
    <Animated.View style={[scaleStyle, shake.style, bounce.style]}>
      <Pressable
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
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
          <Markdown style={markdownStyles}>{option.label}</Markdown>
        </View>
      </Pressable>
    </Animated.View>
  );
};
