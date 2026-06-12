import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { MultipleChoiceOption } from '../Button/MultipleChoiceOption';
import { haptic } from '../../animations/haptics';

interface MultipleChoiceComponentProps {
  setIsNextButtonEnabled?: (isNextButtonEnabled: boolean) => void;
  curSlideIndex: number;
  moduleIndex: number;
  curLesson: any;
  setCurLesson: (curLesson: any) => void;
  isReviewMode?: boolean;
  onSubmitComplete?: (moduleId: number) => void; // 선택 완료 후 콜백
  skipAnimation?: boolean; // 애니메이션 스킵 여부
}

// 마크다운 스타일 설정
const markdownStyles: any = {
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
    backgroundColor: '#f8f9fa',
    borderColor: '#e9ecef',
    borderWidth: 1,
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

// 컴포넌트 본문
export const MultipleChoiceComponent = React.memo<MultipleChoiceComponentProps>(({
  setIsNextButtonEnabled,
  curSlideIndex,
  moduleIndex,
  curLesson,
  setCurLesson,
  isReviewMode = false,
  onSubmitComplete,
  skipAnimation = false,
}) => {
  // 진입 애니메이션은 부모 <ModuleEnter> 가 담당. 여기서는 데이터/인터랙션 로직만.

  // 현재 모듈 데이터를 메모이제이션
  const currentModule = React.useMemo(
    () => curLesson.sliders[curSlideIndex].modules[moduleIndex],
    [curLesson, curSlideIndex, moduleIndex],
  );

  // 복습 모드일 때 버튼 활성화 (현재 모듈의 readonly 값이 바뀔 때만 실행)
  useEffect(() => {
    if (currentModule?.readonly || isReviewMode) {
      console.log('🔍 MultipleChoice 복습 모드 - 버튼 활성화');
      setIsNextButtonEnabled?.(true);
    }
  }, [currentModule?.readonly, isReviewMode, setIsNextButtonEnabled]);

  // 옵션 클릭 시
  const onPressOption = (question: any, questionIndex: number, optionIndex: number) => {

    // 복습 모드에서는 선택 불가
    if (isReviewMode) {
      return;
    }
    // curLesson의 복사본을 만듭니다.
    const newLesson = { ...curLesson };
    // 해당 슬라이드의 복사본
    const newSliders = [...newLesson.sliders];
    // 해당 모듈의 복사본
    const newModules = [...newSliders[curSlideIndex].modules];
    // 해당 모듈(문제)의 복사본
    const newModule = { ...newModules[moduleIndex] };
    // questions 배열 복사
    const newQuestions = newModule.questions ? [...newModule.questions] : [];
    // 해당 question 객체 복사 및 answer의 userAnswer 갱신
    const newQuestion = {
      ...newQuestions[questionIndex],
      answer: {
        ...newQuestions[questionIndex].answer,
        userAnswer: optionIndex
      }
    };
    newQuestions[questionIndex] = newQuestion;
    newModule.questions = newQuestions;
    newModules[moduleIndex] = newModule;
    newSliders[curSlideIndex].modules = newModules;
    newLesson.sliders = newSliders;
    setCurLesson?.(newLesson);

    setIsNextButtonEnabled?.(true);
  }

  return (
    <View>
      {Array.isArray(curLesson.sliders[curSlideIndex].modules[moduleIndex].questions) && curLesson.sliders[curSlideIndex].modules[moduleIndex].questions.map((question: any, questionIndex: number) => {
        return (
          <View className="flex-col gap-[20px]" key={questionIndex}>
            {/* <Text className="text-[#111] text-[16px] font-[700]">{question.title}</Text> */}
            <View className="flex-col gap-[10px]">
              {Array.isArray(question.interactionOptions) && question.interactionOptions.map((option: any, optionIndex: number) => (
                <MultipleChoiceOption
                  key={`${questionIndex}-${optionIndex}`}
                  option={option}
                  questionIndex={questionIndex}
                  optionIndex={optionIndex}
                  question={question}
                  onPress={onPressOption}
                  markdownStyles={markdownStyles}
                  isReadOnly={isReviewMode || currentModule?.readonly}
                />
              ))}
            </View>
            {/* 채점은 하단 액션 바의 "채점하기" 버튼이 담당 (부모 handleQuizGrade). */}
          </View>
        );
      })}
    </View>
  );
});