import React, { useState, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { format, subMonths, eachDayOfInterval, startOfWeek } from 'date-fns';

interface HeatmapProps {
  data: Record<string, number>; // {'2025-07-12': 1, ...}
}

// 잔디 색상
const getColorByCount = (count: number): string => {
  if (count >= 3) return '#87FF30';
  if (count === 2) return '#C6FF9C';
  if (count === 1) return '#F0FFE5';
  return '#F5F5F5'; // 없음
};

const BOX_SIZE = 18;
const BOX_GAP = 4;

const Heatmap: React.FC<HeatmapProps> = ({ data }) => {
  //const [tooltip, setTooltip] = useState<{ date: string; count: number; } | null>(null);
  const scrollRef = useRef<ScrollView>(null);
 
  const today = new Date(); // endDate
  const startDate = startOfWeek(subMonths(today, 6), { weekStartsOn: 0 }); // 6개월 전 시작
  const allDays = eachDayOfInterval({ start: startDate, end: today });

  const weeks: Date[][] = [];
  for (let i = 0; i < allDays.length; i += 7) {
    weeks.push(allDays.slice(i, i + 7));
  }

  // 월 라벨: 처음 등장하는 주에만 표시
  const monthLabels: { index: number; label: string }[] = [];
  let lastLabeledMonth = '';

  weeks.forEach((week, weekIdx) => {
  const firstDay = week[0];
  const firstMonth = format(firstDay, 'M');

  // 한 주 안에 월이 바뀌는지 확인
  const hasMonthChange = week.some((day, i, arr) => {
      if (i === 0) return false;
      return format(day, 'M') !== format(arr[i - 1], 'M');
  });

  // 이 주에서 라벨로 쓸 날짜 (가능하면 월이 바뀌는 날, 없으면 첫째 날)
  const labelDay = week.find((day, i, arr) =>
      i === 0 ? format(day, 'M') !== lastLabeledMonth : format(day, 'M') !== format(arr[i - 1], 'M')
  ) || firstDay;

  const labelMonth = format(labelDay, 'M');

  if (weekIdx === 0 || labelMonth !== lastLabeledMonth) {
      monthLabels.push({ index: weekIdx, label: `${labelMonth}월` });
      lastLabeledMonth = labelMonth;
  }
  });

  return (
    <View className="flex-col">
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={true}
        onContentSizeChange={() => {
          scrollRef.current?.scrollToEnd({ animated: false });
        }}
      >
        <View className="flex-col">
            {Array.from({ length: 8 }).map((_, rowIdx) => (
            <View key={rowIdx} className="flex-row gap-[4px] mb-[4px]">
                {Array.from({ length: weeks.length + 1 }).map((_, colIdx) => {
                // (0,0) 위치
                if (rowIdx === 0 && colIdx === 0) {
                    return (
                    <View
                        key="empty"
                        style={{ width: BOX_SIZE, height: BOX_SIZE }}
                    />
                    );
                }

                // x축 월 라벨
                if (rowIdx === 0) {
                    const label = monthLabels.find((m) => m.index === colIdx - 1)?.label ?? '';
                    return (
                    <View
                        key={`month-${colIdx}`}
                        style={{ width: BOX_SIZE, height: BOX_SIZE }}
                        className="items-center justify-center"
                    >
                        <Text className="text-[12px] font-medium text-black">
                        {label}
                        </Text>
                    </View>
                    );
                }

                // y축 요일 라벨
                if (colIdx === 0) {
                    return (
                    <View
                        key={`day-${rowIdx}`}
                        style={{ width: BOX_SIZE, height: BOX_SIZE }}
                        className="items-center justify-center"
                    >
                        <Text className="text-[12px] text-black font-medium">
                        {rowIdx === 2 ? '월' : rowIdx === 4 ? '수' : rowIdx === 6 ? '금' : ''}
                        </Text>
                    </View>
                    );
                }

                // 잔디 박스
                const week = weeks[colIdx - 1];
                const day = week?.[rowIdx - 1];
                if (!day) {
                    return (
                    <View
                        key={`empty-${rowIdx}-${colIdx}`}
                        style={{ width: BOX_SIZE, height: BOX_SIZE }}
                    />
                    );
                }

                const dateStr = format(day, 'yyyy-MM-dd');
                const count = data[dateStr] || 0;
                const bgColor = getColorByCount(count);

                return (
                    <View
                        key={`dot-${rowIdx}-${colIdx}`}
                        style={{
                        width: BOX_SIZE,
                        height: BOX_SIZE,
                        borderRadius: 4,
                        backgroundColor: bgColor,
                        }}
                    />
                );
                })}
            </View>
            ))}
        </View>
      </ScrollView>
    </View>
  );
};

export default Heatmap;