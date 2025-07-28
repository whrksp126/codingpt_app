import React, { useRef } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { format } from 'date-fns';
import { getColorByCount } from '../utils/heatmapUtils';
import { useHeatmapData } from '../hooks/useHeatmapData';

interface HeatmapProps {
  data: Record<string, number>; // {'2025-07-12': 1, ...}
}

const BOX_SIZE = 18;
const BOX_GAP = 4;

const Heatmap: React.FC<HeatmapProps> = ({ data }) => {
  const scrollRef = useRef<ScrollView>(null);
  const { weeks, monthLabels } = useHeatmapData(data);

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
                if (rowIdx === 0 && colIdx === 0) {
                  return <View key="empty" style={{ width: BOX_SIZE, height: BOX_SIZE }} />;
                }

                if (rowIdx === 0) {
                  const label = monthLabels.find((m) => m.index === colIdx - 1)?.label ?? '';
                  return (
                    <View
                      key={`month-${colIdx}`}
                      style={{ width: BOX_SIZE, height: BOX_SIZE }}
                      className="items-center justify-center"
                    >
                      <Text className="text-[12px] font-medium text-black">{label}</Text>
                    </View>
                  );
                }

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

                const week = weeks[colIdx - 1];
                const day = week?.[rowIdx - 1];
                if (!day) {
                  return <View key={`empty-${rowIdx}-${colIdx}`} style={{ width: BOX_SIZE, height: BOX_SIZE }} />;
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