import React from 'react';
import { View } from 'react-native';
import { getColorByCount } from '../utils/heatmapUtils';

interface Props {
  recentData: { date: string; count: number }[];
}

const BOX_SIZE = 16;

const RecentStudyBar: React.FC<Props> = ({ recentData }) => {
  return (
    <View className="flex-row gap-[6px]">
      {recentData.map((item, index) => {
        const bgColor = getColorByCount(item.count);
        return (
          <View
            key={index}
            style={{
              width: BOX_SIZE,
              height: BOX_SIZE,
              backgroundColor: bgColor,
              borderRadius: 4,
            }}
          />
        );
      })}
    </View>
  );
};

export default RecentStudyBar;