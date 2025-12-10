import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';

type ClickSequenceQuizFeedback = {
  correct?: { message?: string };
  incorrect?: { message?: string };
};

type ClickSequenceQuizModule = {
  id: number;
  type: 'clickSequenceQuiz';
  question: string;
  slots: number;
  options: { id: string; label: string }[];
  answer: string[]; // 정답 순서 (id 배열)
  feedback?: ClickSequenceQuizFeedback;
};

interface ClickSequenceQuizProps {
  module: ClickSequenceQuizModule;
  // 부모(LessonLearningScreenV2)에서 내려주는 버튼 제어 함수
  setIsNextButtonEnabled?: (enabled: boolean) => void;
  isReviewMode?: boolean;
}

/**
 * 클릭 → 슬롯에 순서대로 채우는 퀴즈 컴포넌트
 * - 빈 슬롯은 "_____" 표시
 * - 슬롯을 다시 클릭하면 보기로 되돌아감
 * - 확인 버튼 누를 때만 채점
 */
export const ClickSequenceQuizComponent: React.FC<ClickSequenceQuizProps> = ({
  module,
  setIsNextButtonEnabled,
  isReviewMode = false,
}) => {
  // 각 슬롯에 어떤 option id가 들어있는지 저장 (빈 칸은 null)
  const [selectedIds, setSelectedIds] = useState<(string | null)[]>(
    () => Array(module.slots).fill(null)
  );

  // 채점 상태
  const [status, setStatus] = useState<'idle' | 'correct' | 'wrong'>('idle');

  // 피드백 메시지
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  // id → label 매핑
  const optionMap = useMemo(() => {
    const map: Record<string, string> = {};
    module.options.forEach((opt) => {
      map[opt.id] = opt.label;
    });
    return map;
  }, [module.options]);

  // 이미 선택된 옵션인지 체크
  const isOptionUsed = (optionId: string) => {
    return selectedIds.includes(optionId);
  };

  // 보기(옵션)를 클릭했을 때 처리
  const handleOptionPress = (optionId: string) => {
    // 리뷰 모드거나 이미 채점된 상태면 수정 불가
    if (isReviewMode || status !== 'idle') return;

    // 이미 사용 중인 옵션이면 무시
    if (isOptionUsed(optionId)) return;

    // 첫 번째 빈 슬롯 찾기
    const emptyIndex = selectedIds.findIndex((value) => value === null);
    if (emptyIndex === -1) {
      // 슬롯이 꽉 찼으면 아무 것도 하지 않음 (혹은 토스트 등)
      return;
    }

    const next = [...selectedIds];
    next[emptyIndex] = optionId;
    setSelectedIds(next);
  };

  // 슬롯을 클릭했을 때 → 다시 보기로 되돌리기
  const handleSlotPress = (index: number) => {
    if (isReviewMode || status !== 'idle') return;

    const next = [...selectedIds];
    // 이미 차 있는 슬롯만 제거
    if (next[index] !== null) {
      next[index] = null;
      setSelectedIds(next);
    }
  };

  // 확인 버튼 눌렀을 때 채점
  const handleCheckAnswer = () => {
    if (status !== 'idle') return;

    // 모든 슬롯이 채워져 있는지 확인
    const isAllFilled = selectedIds.every((v) => v !== null);
    if (!isAllFilled) {
      // 안전장치 – 버튼 비활성화로 막고 있지만 혹시 모를 상황 대비
      return;
    }

    const userSequence = selectedIds.filter(
      (v): v is string => v !== null
    );

    const correctAnswer = module.answer;

    // 길이 먼저 체크
    let isCorrect =
      userSequence.length === correctAnswer.length &&
      userSequence.every((id, idx) => id === correctAnswer[idx]);

    setStatus(isCorrect ? 'correct' : 'wrong');

    // 피드백 메시지 세팅
    if (isCorrect) {
      setFeedbackMessage(
        module.feedback?.correct?.message ??
          '정답이에요! 잘하셨어요. 🎉'
      );
      // 채점 후에만 "다음" 버튼 활성화
      if (setIsNextButtonEnabled) {
        setIsNextButtonEnabled(true);
      }
    } else {
      setFeedbackMessage(
        module.feedback?.incorrect?.message ??
          '아쉽지만 정답이 아니에요. 다시 한 번 시도해볼까요?'
      );
      // 오답이면 다음 버튼은 여전히 비활성화 상태 유지
      if (setIsNextButtonEnabled) {
        setIsNextButtonEnabled(false);
      }
    }

    // TODO: 필요하다면 여기서 curLesson에 userAnswer 저장하는 로직 추가 가능
  };

  // 슬롯이 모두 채워졌는지
  const isAllSlotsFilled = selectedIds.every((v) => v !== null);

  // 확인 버튼 라벨
  const confirmButtonLabel =
    status === 'idle' ? '정답 확인' : status === 'correct' ? '다음으로' : '다시 시도해보기';

  // 오답 후 다시 시도할 때 로직 (원하면 status === 'wrong'일 때 버튼을 재사용해서 초기화)
  const handleConfirmButtonPress = () => {
    if (status === 'wrong') {
      // 다시 시도: 슬롯 초기화, 상태 초기화
      setSelectedIds(Array(module.slots).fill(null));
      setStatus('idle');
      setFeedbackMessage(null);
      if (setIsNextButtonEnabled) {
        setIsNextButtonEnabled(false);
      }
      return;
    }

    if (status === 'correct') {
      // "다음으로"는 실제로는 아래 글로벌 Next 버튼을 누르게 유도
      // 여기서는 아무 동작 안 하거나, 토스트 정도만 띄우면 됨.
      return;
    }

    // status === 'idle'일 때만 실제 채점
    handleCheckAnswer();
  };

  return (
    <View className="mt-4">
      {/* 질문 */}
      <Text className="text-[15px] font-[600] text-[#111] mb-8">
        {module.question}
      </Text>

      {/* 슬롯 영역 */}
      <View className="flex-row justify-between mb-16">
        {selectedIds.map((slotId, index) => {
          const label = slotId ? optionMap[slotId] : '_____';

          return (
            <TouchableOpacity
              key={`slot-${index}`}
              onPress={() => handleSlotPress(index)}
              activeOpacity={0.7}
              style={{
                flex: 1,
                marginHorizontal: 4,
                paddingVertical: 10,
                alignItems: 'center',
              }}
            >
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: '600',
                  color: slotId ? '#111' : '#9CA3AF',
                  // 밑줄 느낌을 주기 위한 border
                  borderBottomWidth: 1,
                  borderStyle: 'dashed',
                  borderColor: '#D1D5DB',
                  paddingBottom: 4,
                  minWidth: 60,
                  textAlign: 'center',
                }}
              >
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* 보기(옵션) 영역 */}
      <View className="flex-row flex-wrap gap-y-3">
        {module.options.map((option) => {
          const used = isOptionUsed(option.id);

          return (
            <TouchableOpacity
              key={option.id}
              activeOpacity={used || isReviewMode || status !== 'idle' ? 1 : 0.7}
              onPress={() => handleOptionPress(option.id)}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: used ? '#D1D5DB' : '#111827',
                marginRight: 8,
                opacity: used ? 0.4 : 1,
              }}
            >
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: '500',
                  color: used ? '#9CA3AF' : '#111827',
                }}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* 피드백 영역 */}
      {feedbackMessage && (
        <View
          style={{
            marginTop: 16,
            padding: 12,
            borderRadius: 12,
            backgroundColor: status === 'correct' ? '#ECFDF3' : '#FEF2F2',
          }}
        >
          <Text
            style={{
              fontSize: 13,
              color: status === 'correct' ? '#166534' : '#B91C1C',
            }}
          >
            {feedbackMessage}
          </Text>
        </View>
      )}

      {/* 확인 버튼 (슬롯 다 채워질 때만 활성화, 정답일 때는 숨김) */}
      {!isReviewMode && status !== 'correct' && (
        <TouchableOpacity
          onPress={handleConfirmButtonPress}
          activeOpacity={isAllSlotsFilled ? 0.7 : 1}
          disabled={!isAllSlotsFilled}
          style={{
            marginTop: 24,
            alignSelf: 'flex-end',
            paddingHorizontal: 18,
            paddingVertical: 10,
            borderRadius: 999,
            backgroundColor: isAllSlotsFilled ? '#111827' : '#9CA3AF',
          }}
        >
          <Text
            style={{
              fontSize: 14,
              fontWeight: '600',
              color: '#FFFFFF',
            }}
          >
            {confirmButtonLabel}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
};
