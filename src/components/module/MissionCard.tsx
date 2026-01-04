import React from 'react';
import { View, Text } from 'react-native';
import * as SvgIcon from '../../assets/SvgIcon';

interface Mission {
  id: string;
  icon?: string;
  iconColor?: string;
  text: string;
  badge?: string;
  badgeColor?: string;
  completed: boolean;
}

interface MissionCardModule {
  type: 'missionCard';
  title: string;
  missions: Mission[];
}

interface Props {
  module: MissionCardModule;
}

export const MissionCardComponent: React.FC<Props> = ({ module }) => {
  const { title, missions } = module;

  return (
    <View
      className="w-full rounded-[16px] bg-white p-6"
      style={{
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 4,
      }}
    >
      {/* Title */}
      <Text className="bold-22 text-Text-Black_Primary text-center mb-6">
        {title}
      </Text>

      {/* Missions */}
      <View className="gap-4">
        {missions.map((mission) => {
          const IconComponent = mission.icon ? (SvgIcon as any)[mission.icon] : null;
          const iconColor = mission.completed
            ? (mission.iconColor || '#08875D')
            : '#333333';

          return (
            <View
              key={mission.id}
              className="flex-row items-center justify-between"
            >
              <View className="flex-row items-center gap-3 flex-1">
                {/* Icon */}
                <View className="w-6 h-6 justify-center items-center">
                  {IconComponent && (
                    <IconComponent width={24} height={24} fill={iconColor} />
                  )}
                </View>

                {/* Text */}
                <Text className="bold-18 text-Text-Black_Secondary">
                  {mission.text}
                </Text>
              </View>

              {/* Badge */}
              {mission.badge && (
                <Text
                  className="bold-16"
                  style={{
                    color: mission.completed
                      ? (mission.badgeColor || '#08875D')
                      : '#333333',
                  }}
                >
                  {mission.badge}
                </Text>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
};

