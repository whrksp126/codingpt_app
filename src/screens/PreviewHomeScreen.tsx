import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { PreviewTabStackParamList } from '../navigation/types';

type Props = {
  navigation: NativeStackNavigationProp<PreviewTabStackParamList, 'PreviewHome'>;
};

const PreviewHomeScreen: React.FC<Props> = ({ navigation }) => {
  const previewItems = [
    {
      id: 'lesson-learning-v4',
      title: 'Lesson Learning V4',
      description: '버튼 만들기 레슨 (자동 슬라이드 전환)',
      screen: 'LessonLearningV4' as const,
    },
    // 앞으로 추가될 프리뷰 화면들...
  ];

  return (
    <>
      {/* 헤더 */}
      <View className="flex-row justify-between items-center px-4 py-3 border-b border-[#CCCCCC]">
        <Text className="text-[20px] font-bold text-[#111111]">프리뷰</Text>
        <Text className="text-[14px] text-[#666666]">{previewItems.length}개 화면</Text>
      </View>

      <ScrollView className="flex-1 bg-white">
        <View className="px-4 py-4">
          <Text className="text-[16px] font-semibold text-[#111111] mb-3">
            개발 중인 화면들
          </Text>
          
          {previewItems.map((item) => (
            <TouchableOpacity
              key={item.id}
              className="bg-white border border-[#E1E6EF] rounded-[12px] p-4 mb-3"
              onPress={() => navigation.navigate(item.screen)}
              activeOpacity={0.7}
            >
              <Text className="text-[18px] font-bold text-[#333333] mb-1">
                {item.title}
              </Text>
              <Text className="text-[14px] text-[#666666]">
                {item.description}
              </Text>
            </TouchableOpacity>
          ))}

          {previewItems.length === 0 && (
            <View className="items-center justify-center py-20">
              <Text className="text-[16px] text-[#999999]">
                프리뷰할 화면이 없습니다
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </>
  );
};

export default PreviewHomeScreen;

