import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, TouchableOpacity, Animated } from 'react-native';
import { useDragAndDrop, DraggableItem } from '../DragAndDrop';
import { Warning, Correct } from '../../assets/SvgIcon';

type DragAndDropQuizFeedback = {
  correct?: { message?: string };
  incorrect?: { message?: string };
};

type DragAndDropQuizModule = {
  id: number | string;
  type: 'dragAndDropQuiz';
  question: string;
  slots: number;
  options: { id: string; label: string }[];
  answer: string[]; // 정답 순서 (id 배열)
  feedback?: DragAndDropQuizFeedback;
};

interface DragAndDropQuizProps {
  module: DragAndDropQuizModule;
  setIsNextButtonEnabled?: (enabled: boolean) => void;
  onCorrectAnswer?: () => void;
  isReviewMode?: boolean;
}

/**
 * 드래그 앤 드롭으로 순서대로 채우는 퀴즈 컴포넌트
 * - 기존 DragAndDrop 컴포넌트를 재사용
 * - 자동 채점
 */
export const DragAndDropQuizComponent: React.FC<DragAndDropQuizProps> = ({
  module,
  setIsNextButtonEnabled,
  onCorrectAnswer,
  isReviewMode = false,
}) => {
  // 각 슬롯에 어떤 option id가 들어있는지 저장 (빈 칸은 null)
  const [dropZones, setDropZones] = useState<(DraggableItem | null)[]>(
    () => Array(module.slots).fill(null)
  );

  // 채점 상태
  const [status, setStatus] = useState<'idle' | 'correct' | 'wrong'>('idle');

  // 피드백 메시지
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  // 사용 가능한 아이템들 (드롭존에 없는 것들)
  const availableItems = useMemo(() => {
    const usedIds = dropZones
      .filter((item): item is DraggableItem => item !== null)
      .map((item) => item.id);
    
    return module.options
      .filter((opt) => !usedIds.includes(opt.id))
      .map((opt) => ({ id: opt.id, label: opt.label } as DraggableItem));
  }, [module.options, dropZones]);

  // id → label 매핑
  const optionMap = useMemo(() => {
    const map: Record<string, string> = {};
    module.options.forEach((opt) => {
      map[opt.id] = opt.label;
    });
    return map;
  }, [module.options]);

  // 드롭 처리
  const handleDrop = (item: DraggableItem, dropZoneIndex: number) => {
    // 정답일 때는 드롭 불가
    if (isReviewMode || status === 'correct') return;

    // 이미 아이템이 있는 경우 교체
    const newDropZones = [...dropZones];
    newDropZones[dropZoneIndex] = item;
    setDropZones(newDropZones);
    
    // 오답 상태에서 드롭하면 상태를 idle로 리셋
    if (status === 'wrong') {
      setStatus('idle');
      setFeedbackMessage(null);
    }
  };

  // 드롭존에서 제거
  const handleRemoveFromDropZone = (dropZoneIndex: number) => {
    // 정답일 때는 제거 불가
    if (isReviewMode || status === 'correct') return;

    const newDropZones = [...dropZones];
    newDropZones[dropZoneIndex] = null;
    setDropZones(newDropZones);
    
    // 오답 상태에서 제거하면 상태를 idle로 리셋
    if (status === 'wrong') {
      setStatus('idle');
      setFeedbackMessage(null);
    }
  };

  // 채점
  const handleCheckAnswer = () => {
    if (status !== 'idle') return;

    // 모든 슬롯이 채워져 있는지 확인
    const isAllFilled = dropZones.every((v) => v !== null);
    if (!isAllFilled) {
      return;
    }

    const userSequence = dropZones
      .filter((v): v is DraggableItem => v !== null)
      .map((item) => item.id);

    const correctAnswer = module.answer;

    // 길이 먼저 체크
    let isCorrect =
      userSequence.length === correctAnswer.length &&
      userSequence.every((id, idx) => id === correctAnswer[idx]);

    setStatus(isCorrect ? 'correct' : 'wrong');

    // 피드백 메시지 세팅
    if (isCorrect) {
      setFeedbackMessage('정답입니다!');
      // 정답 시 콜백 호출 (자동 슬라이드 전환 트리거)
      if (onCorrectAnswer) {
        onCorrectAnswer();
      }
    } else {
      setFeedbackMessage('순서가 올바르지 않습니다.');
      // 오답일 때는 다음 버튼 비활성화
      if (setIsNextButtonEnabled) {
        setIsNextButtonEnabled(false);
      }
    }
  };

  // 슬롯이 모두 채워졌을 때 자동 채점
  useEffect(() => {
    const isAllFilled = dropZones.every((v) => v !== null);
    
    if (isAllFilled && status === 'idle' && !isReviewMode) {
      // 모든 슬롯이 채워지면 자동으로 채점
      handleCheckAnswer();
    }
  }, [dropZones, status, isReviewMode]);

  // 정답일 때만 다음 버튼 활성화
  useEffect(() => {
    if (setIsNextButtonEnabled) {
      setIsNextButtonEnabled(status === 'correct');
    }
  }, [status, setIsNextButtonEnabled]);

  // 초기 마운트 시 다음 버튼 비활성화
  useEffect(() => {
    if (setIsNextButtonEnabled) {
      setIsNextButtonEnabled(false);
    }
  }, [setIsNextButtonEnabled]);

  // useDragAndDrop 훅 사용
  const {
    panResponders,
    draggingItem,
    draggingPosition,
    dragOffset,
    itemRefs,
    dropZoneRefs,
    handleDropZoneLayout,
  } = useDragAndDrop({
    items: availableItems,
    dropZones,
    onDrop: handleDrop,
  });

  return (
    <View className="mt-[50px]">
      {/* 드롭존 영역 (회색 배경) */}
      <View 
        className="bg-Background-White_Secondary rounded-[14px] px-[20px] py-[20px] mb-[60px]"
        style={{
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.2,
          shadowRadius: 4,
          elevation: 4,
        }}
      >
        <View className="flex-row gap-[10px] items-center justify-center">
          {dropZones.map((item, index) => {
            const label = item ? optionMap[item.id] || item.label : '';
            
            // 드롭존 스타일 결정
            let dropZoneStyle: any = {
              borderWidth: 1.5,
              borderStyle: 'dashed',
              borderColor: '#6C757D', // Line-Black
            };
            
            if (status === 'correct') {
              dropZoneStyle = {
                borderWidth: 1,
                borderStyle: 'solid',
                borderColor: '#08875D', // Success-Default-700
                backgroundColor: '#EDFDF8', // Success-Default-100
              };
            } else if (status === 'wrong') {
              dropZoneStyle = {
                borderWidth: 1,
                borderStyle: 'solid',
                borderColor: '#E02D3C', // Danger-Default-700
                backgroundColor: '#FEF1F2', // Danger-Default-100
              };
            }
            
            return (
              <TouchableOpacity
                key={index}
                ref={(ref) => {
                  dropZoneRefs.current[index] = ref;
                }}
                onLayout={handleDropZoneLayout(index)}
                className={`${status !== 'idle' ? 'h-[40px] rounded-[10px]' : 'h-[40px] rounded-[8px]'} bg-Background-White_Base flex-1 min-w-[100px] justify-center items-center`}
                style={dropZoneStyle}
                onPress={() => {
                  if (item && !isReviewMode && status !== 'correct') {
                    handleRemoveFromDropZone(index);
                  }
                }}
                activeOpacity={item && !isReviewMode && status !== 'correct' ? 0.7 : 1}
                disabled={status === 'correct'}
              >
                {item ? (
                  <Text className={`bold-14 ${status === 'wrong' ? 'text-[#E02D3C]' : status === 'correct' ? 'text-[#08875D]' : 'text-Text-Black_Primary'}`}>{label}</Text>
                ) : (
                  <Text className="bold-14 text-Text-Black_Secondary">{label}</Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* 드래그 가능한 아이템들 */}
      <View className="flex-row gap-3 items-center justify-center w-full mb-8">
        {module.options.map((opt, index) => {
          const item = { id: opt.id, label: opt.label } as DraggableItem;
          const isInDropZone = dropZones.some((dz) => dz?.id === opt.id);
          const availableIndex = availableItems.findIndex((ai) => ai.id === opt.id);
          
          // 드롭존에 있는 아이템은 흰색 placeholder 표시
          if (isInDropZone) {
            return (
              <View
                key={opt.id}
                className="bg-Background-White_Base rounded-[8px] px-[12px] py-[8px] min-w-[87px]"
              >
                <Text className="bold-14 opacity-0">
                  {optionMap[opt.id] || opt.label}
                </Text>
              </View>
            );
          }
          
          // 드롭존에 없는 아이템은 원래대로 표시
          return (
            <Animated.View
              key={opt.id}
              ref={(ref) => {
                if (ref && 'measureInWindow' in ref && availableIndex >= 0) {
                  itemRefs.current[availableIndex] = ref as View;
                }
              }}
              {...(availableIndex >= 0 ? panResponders[availableIndex].panHandlers : {})}
              style={{
                opacity: draggingItem?.id === opt.id ? 0.5 : 1,
              }}
            >
              <View className="bg-Success-Default-700 rounded-[8px] px-[12px] py-[8px] min-w-[100px]">
                <Text className="bold-14 text-Text-White_Primary text-center">
                  {optionMap[opt.id] || opt.label}
                </Text>
              </View>
            </Animated.View>
          );
        })}
      </View>

      {/* 드래그 중인 아이템 오버레이 */}
      {draggingItem && (
        <View
          style={{
            position: 'absolute',
            left: draggingPosition.x - dragOffset.x,
            top: draggingPosition.y - dragOffset.y,
            zIndex: 1000,
            pointerEvents: 'none',
          }}
        >
          <View className="bg-Success-Default-700 rounded-[8px] px-4 py-3 min-w-[100px] opacity-80">
            <Text className="bold-14 text-Text-White_Primary text-center">
              {optionMap[draggingItem.id] || draggingItem.label}
            </Text>
          </View>
        </View>
      )}

      {/* 피드백 영역 */}
      {feedbackMessage && (
        <View 
          className="flex-row justify-center items-center gap-3 mt-4 px-[16px] py-[10px] rounded-[8px] self-center"
          style={
            status === 'wrong' 
              ? {
                  backgroundColor: '#FEF1F2',
                  borderWidth: 0.667,
                  borderColor: '#E02D3C',
                  borderStyle: 'solid',
                  shadowColor: '#E02D3C',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.3,
                  shadowRadius: 12,
                  elevation: 4,
                  alignSelf: 'center',
                }
              : status === 'correct'
              ? {
                  backgroundColor: '#EDFDF8',
                  borderWidth: 0.667,
                  borderColor: '#08875D',
                  borderStyle: 'solid',
                  shadowColor: '#08875D',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.3,
                  shadowRadius: 12,
                  elevation: 4,
                  alignSelf: 'center',
                }
              : { alignSelf: 'center' }
          }
        >
          {status === 'correct' ? (
            <Correct width={24} height={24} fill="#EDFDF8" bgColor="#08875D" />
          ) : (
            <Warning width={24} height={24} fill="#FEF1F2" bgColor="#E02D3C" />
          )}
          <Text 
            className={status === 'correct' ? 'semibold-15' : 'bold-14'}
            style={{
              color: status === 'correct' ? '#08875D' : '#E02D3C',
            }}
          >
            {feedbackMessage}
          </Text>
        </View>
      )}
    </View>
  );
};

