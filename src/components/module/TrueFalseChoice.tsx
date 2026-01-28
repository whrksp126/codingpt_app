import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Animated, Easing, TouchableOpacity, Pressable, Image } from 'react-native';
import { False, True } from '../../assets/SvgIcon';

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

  // console.log("curLesson", curLesson.sliders[curSlideIndex].modules[moduleIndex].questions[0].answer)

  // 애니메이션 상태
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;

  // 컴포넌트 마운트 시 애니메이션
  useEffect(() => {
    if (skipAnimation) {
      // 애니메이션 스킵: 즉시 최종 상태로 설정
      fadeAnim.setValue(1);
      slideAnim.setValue(0);
      scaleAnim.setValue(1);
      return;
    }

    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 800,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(slideAnim, {
          toValue: 0,
          tension: 80,
          friction: 8,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 100,
          friction: 6,
          useNativeDriver: true,
        }),
      ]).start();
    }, 100);

    return () => clearTimeout(timer);
  }, [skipAnimation, fadeAnim, slideAnim, scaleAnim]);

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
    <Animated.View
      style={{
        opacity: fadeAnim,
        transform: [
          { translateY: slideAnim },
          { scale: scaleAnim }
        ],
      }}
    >
      {Array.isArray(curLesson.sliders[curSlideIndex].modules[moduleIndex].questions) && 
        curLesson.sliders[curSlideIndex].modules[moduleIndex].questions.map((question: any, questionIndex: number) => {
          const userAnswer = question.answer?.userAnswer;
          const isSubmitted = question.answer?.isCorrect !== null;
          const isSubmitEnabled = userAnswer !== null && 
                                userAnswer !== undefined &&
                                !isSubmitted;

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
                        ? '#D7FFB8'
                        : userAnswer === 0 && question.answer?.isCorrect === false
                        ? '#FFE5E5'
                        : question.answer?.answer === 0 && question.answer?.isCorrect === false
                        ? '#DDF4FF'
                        : '#f8f9fc'
                      : userAnswer === 0
                      ? '#DDF4FF'
                      : '#f8f9fc',
                    borderRadius: 16,
                    paddingHorizontal: 24,
                    paddingVertical: 20,
                    alignItems: 'center',
                    justifyContent: 'center',
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 0 },
                    shadowOpacity: 0.25,
                    shadowRadius: 5,
                    elevation: 5,
                    borderWidth: isSubmitted
                      ? userAnswer === 0 && question.answer?.isCorrect === true
                        ? 2
                        : userAnswer === 0 && question.answer?.isCorrect === false
                        ? 2
                        : question.answer?.answer === 0 && question.answer?.isCorrect === false
                        ? 2
                        : 0
                      : userAnswer === 0
                      ? 2
                      : 0,
                    borderColor: isSubmitted
                      ? userAnswer === 0 && question.answer?.isCorrect === true
                        ? '#58CC02'
                        : userAnswer === 0 && question.answer?.isCorrect === false
                        ? '#FE4C4A'
                        : question.answer?.answer === 0 && question.answer?.isCorrect === false
                        ? '#84D8FF'
                        : 'transparent'
                      : userAnswer === 0
                      ? '#84D8FF'
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
                        ? '#D7FFB8'
                        : userAnswer === 1 && question.answer?.isCorrect === false
                        ? '#FFE5E5'
                        : question.answer?.answer === 1 && question.answer?.isCorrect === false
                        ? '#DDF4FF'
                        : '#f8f9fc'
                      : userAnswer === 1
                      ? '#DDF4FF'
                      : '#f8f9fc',
                    borderRadius: 16,
                    paddingHorizontal: 24,
                    paddingVertical: 20,
                    alignItems: 'center',
                    justifyContent: 'center',
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 0 },
                    shadowOpacity: 0.25,
                    shadowRadius: 5,
                    elevation: 5,
                    borderWidth: isSubmitted
                      ? userAnswer === 1 && question.answer?.isCorrect === true
                        ? 2
                        : userAnswer === 1 && question.answer?.isCorrect === false
                        ? 2
                        : question.answer?.answer === 1 && question.answer?.isCorrect === false
                        ? 2
                        : 0
                      : userAnswer === 1
                      ? 2
                      : 0,
                    borderColor: isSubmitted
                      ? userAnswer === 1 && question.answer?.isCorrect === true
                        ? '#58CC02'
                        : userAnswer === 1 && question.answer?.isCorrect === false
                        ? '#FE4C4A'
                        : question.answer?.answer === 1 && question.answer?.isCorrect === false
                        ? '#84D8FF'
                        : 'transparent'
                      : userAnswer === 1
                      ? '#84D8FF'
                      : 'transparent',
                  }}
                >
                    <False width={84} height={84} fill="#333333" />
                </Pressable>
              </View>

              {/* 선택 완료 버튼 */}
              <View className="items-center mt-[20px]">
                <TouchableOpacity
                  onPress={() => {
                    const isCorrect = question.answer?.userAnswer === question.answer?.answer;
                    
                    // isCorrect 업데이트
                    const newLesson = { ...curLesson };
                    const newSliders = [...newLesson.sliders];
                    const newModules = [...newSliders[curSlideIndex].modules];
                    const newModule = { ...newModules[moduleIndex] };
                    const newQuestions = newModule.questions ? [...newModule.questions] : [];
                    const newQuestion = { 
                      ...newQuestions[questionIndex], 
                      answer: { 
                        ...newQuestions[questionIndex].answer, 
                        isCorrect: isCorrect 
                      } 
                    };
                    newQuestions[questionIndex] = newQuestion;
                    newModule.questions = newQuestions;
                    newModules[moduleIndex] = newModule;
                    newSliders[curSlideIndex].modules = newModules;
                    newLesson.sliders = newSliders;
                    setCurLesson?.(newLesson);

                    // 다음 모듈 표시를 위한 콜백 호출
                    onSubmitComplete?.(currentModule.id);
                  }}
                  disabled={!isSubmitEnabled}
                  activeOpacity={0.8}
                  style={{
                    backgroundColor: isSubmitEnabled ? '#E02D3C' : '#f8f9fc',
                    width: 160,
                    height: 50,
                    borderRadius: 10,
                    justifyContent: 'center',
                    alignItems: 'center',
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 0 },
                    shadowOpacity: 0.25,
                    shadowRadius: 5,
                    elevation: 5,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: 'PretendardVariable',
                      fontWeight: '700',
                      fontSize: 16,
                      lineHeight: 24,
                      color: isSubmitEnabled ? '#FFFFFF' : 'rgba(51, 51, 51, 0.65)',
                      letterSpacing: -0.32,
                    }}
                  >
                    선택 완료
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
    </Animated.View>
  );
});