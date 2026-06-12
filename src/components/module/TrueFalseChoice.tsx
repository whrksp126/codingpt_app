import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, Pressable } from 'react-native';
import { False, True } from '../../assets/SvgIcon';
import { haptic } from '../../animations/haptics';

interface TrueFalseChoiceComponentProps {
  setIsNextButtonEnabled?: (isNextButtonEnabled: boolean) => void;
  curSlideIndex: number;
  moduleIndex: number;
  curLesson: any;
  setCurLesson: (curLesson: any) => void;
  isReviewMode?: boolean;
  onSubmitComplete?: (moduleId: number) => void;
  skipAnimation?: boolean; // 애니메이션 스킵 여부
}

export const TrueFalseChoiceComponent = React.memo<TrueFalseChoiceComponentProps>(({
  setIsNextButtonEnabled,
  curSlideIndex,
  moduleIndex,
  curLesson,
  setCurLesson,
  isReviewMode = false,
  onSubmitComplete,
  skipAnimation = false,
}) => {
  // 진입 애니메이션은 부모 <ModuleEnter> 가 담당.

  // 현재 모듈 데이터
  const currentModule = React.useMemo(
    () => curLesson.sliders[curSlideIndex].modules[moduleIndex],
    [curLesson, curSlideIndex, moduleIndex],
  );

  // 복습 모드일 때 버튼 활성화
  useEffect(() => {
    if (currentModule?.readonly || isReviewMode) {
      setIsNextButtonEnabled?.(true);
    }
  }, [currentModule?.readonly, isReviewMode, setIsNextButtonEnabled]);

  // O/X 선택 시
  const onPressOption = (question: any, questionIndex: number, optionValue: number) => {
    if (isReviewMode) {
      return;
    }
    haptic.light();

    const newLesson = { ...curLesson };
    const newSliders = [...newLesson.sliders];
    const newModules = [...newSliders[curSlideIndex].modules];
    const newModule = { ...newModules[moduleIndex] };
    const newQuestions = newModule.questions ? [...newModule.questions] : [];

    const newQuestion = {
      ...newQuestions[questionIndex],
      answer: {
        ...newQuestions[questionIndex].answer,
        userAnswer: optionValue
      }
    };

    newQuestions[questionIndex] = newQuestion;
    newModule.questions = newQuestions;
    newModules[moduleIndex] = newModule;
    newSliders[curSlideIndex].modules = newModules;
    newLesson.sliders = newSliders;
    setCurLesson?.(newLesson);

    setIsNextButtonEnabled?.(true);
  };

  return (
    <View>
      {Array.isArray(curLesson.sliders[curSlideIndex].modules[moduleIndex].questions) &&
        curLesson.sliders[curSlideIndex].modules[moduleIndex].questions.map((question: any, questionIndex: number) => {
          const userAnswer = question.answer?.userAnswer;
          const isSubmitted = question.answer?.isCorrect !== null;

          return (
            <View className="flex-col gap-[20px]" key={questionIndex}>
              {/* <Text className="text-[#111] text-[16px] font-[700]">{question.title}</Text> */}

              {/* O/X 선택 영역 */}
              <View className="flex-row gap-[20px] items-start px-[16px]">
                {/* O (0) 옵션 */}
                <Pressable
                  onPress={() => onPressOption(question, questionIndex, 0)}
                  disabled={isReviewMode || isSubmitted}
                  style={{
                    flex: 1,
                    backgroundColor: isSubmitted
                      ? userAnswer === 0 && question.answer?.isCorrect === true
                        ? '#EDFDF8' // 정답 (사용자 선택)
                        : userAnswer === 0 && question.answer?.isCorrect === false
                          ? '#FEF1F2' // 오답 (사용자 선택)
                          : question.answer?.answer === 0 && question.answer?.isCorrect === false
                            ? '#EDFDF8' // 정답 (미선택)
                            : '#F8F9FC' // 기본
                      : '#F8F9FC', // 선택/미선택 모두 기본 배경 (선택 시 테두리만)
                    borderRadius: 16,
                    paddingHorizontal: 24,
                    paddingVertical: 20,
                    alignItems: 'center',
                    justifyContent: 'center',
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.05,
                    shadowRadius: 12,
                    elevation: 1,
                    borderWidth: 1,
                    borderColor: isSubmitted
                      ? userAnswer === 0 && question.answer?.isCorrect === true
                        ? '#08875D'
                        : userAnswer === 0 && question.answer?.isCorrect === false
                          ? '#E02D3C'
                          : question.answer?.answer === 0 && question.answer?.isCorrect === false
                            ? '#08875D'
                            : 'transparent'
                      : userAnswer === 0
                        ? '#08875D'
                        : 'transparent',
                  }}
                >
                  <True width={84} height={84} fill="#333333" />
                </Pressable>

                {/* X (1) 옵션 */}
                <Pressable
                  onPress={() => onPressOption(question, questionIndex, 1)}
                  disabled={isReviewMode || isSubmitted}
                  style={{
                    flex: 1,
                    backgroundColor: isSubmitted
                      ? userAnswer === 1 && question.answer?.isCorrect === true
                        ? '#EDFDF8'
                        : userAnswer === 1 && question.answer?.isCorrect === false
                          ? '#FEF1F2'
                          : question.answer?.answer === 1 && question.answer?.isCorrect === false
                            ? '#EDFDF8'
                            : '#F8F9FC'
                      : '#F8F9FC',
                    borderRadius: 16,
                    paddingHorizontal: 24,
                    paddingVertical: 20,
                    alignItems: 'center',
                    justifyContent: 'center',
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.05,
                    shadowRadius: 12,
                    elevation: 1,
                    borderWidth: 1,
                    borderColor: isSubmitted
                      ? userAnswer === 1 && question.answer?.isCorrect === true
                        ? '#08875D'
                        : userAnswer === 1 && question.answer?.isCorrect === false
                          ? '#E02D3C'
                          : question.answer?.answer === 1 && question.answer?.isCorrect === false
                            ? '#08875D'
                            : 'transparent'
                      : userAnswer === 1
                        ? '#08875D'
                        : 'transparent',
                  }}
                >
                  <False width={84} height={84} fill="#333333" />
                </Pressable>
              </View>
              {/* 채점은 하단 액션 바의 "채점하기" 버튼이 담당 (부모 handleQuizGrade). */}
            </View>
          );
        })}
    </View>
  );
});