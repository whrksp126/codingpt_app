import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { haptic } from '../../animations/haptics';

interface ClickSequenceOption {
  id: string;
  label: string;
}

interface ClickSequenceSlot {
  optionId: string | null;
}

interface ClickSequenceModule {
  id: number | string;
  type: 'clickSequenceQuiz';
  question?: string;
  slots: number;
  options: ClickSequenceOption[];
  answer: string[];
  feedback?: {
    correct?: { message: string };
    incorrect?: { message: string };
  };
  userAnswer?: { slots: ClickSequenceSlot[] };
  clickSequenceQuiz?: any;
  isCorrect?: boolean;
  readonly?: boolean;
}

interface Props {
  module: ClickSequenceModule;
  setIsNextButtonEnabled?: (enabled: boolean) => void;
  isReviewMode?: boolean;
}

export const ClickSequenceQuizComponent = React.memo<Props>(({
  module,
  setIsNextButtonEnabled,
  isReviewMode = false,
}) => {
  const slotCount = module.slots ?? 0;
  const options = module.options ?? [];
  const isGraded = typeof module.isCorrect === 'boolean';
  const isReadOnly = isReviewMode || module.readonly === true || isGraded;

  const [slots, setSlots] = useState<ClickSequenceSlot[]>(() => {
    const existing = module.userAnswer?.slots;
    if (existing && existing.length === slotCount) {
      return existing.map((s) => ({ optionId: s?.optionId ?? null }));
    }
    return Array.from({ length: slotCount }, () => ({ optionId: null }));
  });

  // grading 로직(LessonLearningScreenV2:606-610)이 module.clickSequenceQuiz.answer 와
  // module.userAnswer.slots 를 읽어 채점하므로, 컴포넌트가 살아있는 동안 둘을 동기화해 둔다.
  useEffect(() => {
    (module as any).clickSequenceQuiz = {
      question: module.question,
      slots: module.slots,
      options: module.options,
      answer: module.answer,
      feedback: module.feedback,
    };
  }, [module]);

  useEffect(() => {
    (module as any).userAnswer = { slots };
    if (slots.length > 0 && slots.every((s) => !!s.optionId)) {
      setIsNextButtonEnabled?.(true);
    }
  }, [slots, module, setIsNextButtonEnabled]);

  const placedIds = useMemo(
    () => slots.map((s) => s.optionId).filter(Boolean) as string[],
    [slots],
  );
  const remainingOptions = useMemo(
    () => options.filter((o) => !placedIds.includes(o.id)),
    [options, placedIds],
  );

  const onOptionPress = (optionId: string) => {
    if (isReadOnly) return;
    setSlots((prev) => {
      const idx = prev.findIndex((s) => !s.optionId);
      if (idx < 0) return prev;
      const next = [...prev];
      next[idx] = { optionId };
      return next;
    });
    haptic.light();
  };

  const onSlotPress = (slotIndex: number) => {
    if (isReadOnly) return;
    setSlots((prev) => {
      if (!prev[slotIndex]?.optionId) return prev;
      const next = [...prev];
      next[slotIndex] = { optionId: null };
      return next;
    });
    haptic.light();
  };

  return (
    <View className="flex-col gap-[20px]">
      {!!module.question && (
        <Text className="text-[#111] text-[15px] font-[600] leading-[22px]">
          {module.question}
        </Text>
      )}

      <View className="flex-row flex-wrap gap-[8px]">
        {slots.map((slot, i) => {
          const opt = options.find((o) => o.id === slot.optionId);
          const filled = !!slot.optionId;
          const stateClass = !filled
            ? 'bg-[#F5F6F9] border-dashed border-[#C8CCD6]'
            : isGraded
              ? module.isCorrect
                ? 'bg-[#E8F8EE] border-[#2DBE60]'
                : 'bg-[#FDECEC] border-[#E02D3C]'
              : 'bg-white border-[#D5D8E0]';
          return (
            <Pressable
              key={i}
              onPress={() => onSlotPress(i)}
              disabled={isReadOnly || !filled}
              className={`min-h-[44px] min-w-[80px] flex-1 items-center justify-center rounded-[10px] border px-3 py-2 ${stateClass}`}
            >
              <Text className="text-[#111] text-[14px] font-[600]">
                {opt ? opt.label : ''}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View className="flex-row flex-wrap gap-[8px]">
        {remainingOptions.map((opt) => (
          <Pressable
            key={opt.id}
            onPress={() => onOptionPress(opt.id)}
            disabled={isReadOnly}
            className="rounded-[10px] border border-[#D5D8E0] bg-white px-3 py-2"
          >
            <Text className="text-[#111] text-[14px] font-[600]">{opt.label}</Text>
          </Pressable>
        ))}
      </View>

      {isGraded && (
        <View
          className={`rounded-[10px] p-3 ${
            module.isCorrect ? 'bg-[#E8F8EE]' : 'bg-[#FDECEC]'
          }`}
        >
          <Text className="text-[14px] text-[#111]">
            {module.isCorrect
              ? module.feedback?.correct?.message ?? '정답입니다!'
              : module.feedback?.incorrect?.message ?? '다시 시도해 보세요.'}
          </Text>
        </View>
      )}
    </View>
  );
});

ClickSequenceQuizComponent.displayName = 'ClickSequenceQuizComponent';
