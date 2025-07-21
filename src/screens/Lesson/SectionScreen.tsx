import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Image, ScrollView } from 'react-native';

const LessonDetailScreen = ({ route, navigation }: any) => {
    const { id, title, icon, description, price, lessonCount, progress, date } = route.params;
  
    return (
      <View className="flex-1 bg-white">
        <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
          {/* 상단 헤더: 뒤로가기 버튼 */}
          <View className="flex-row items-center justify-between bg-white px-[20px] pt-[20px] pb-[20px] gap-x-[20px]">
            <TouchableOpacity onPress={() => navigation.goBack()}>
              <Image source={require('../../assets/icons/arrow_l.png')} className="w-[13.13px] h-[24.06px] mt-1.5" />
            </TouchableOpacity>
            <View className="flex-row items-center">
              <Image source={icon} className="w-[35px] h-[35px] mt-1" resizeMode="contain" />
              <Text>진행율</Text>
            </View>
          </View>
          <View className="px-4 py-6">
            <Text>테스트</Text>
            <Text></Text>
            <Text className="text-[22px] font-bold text-[#111111]">{title}</Text>
          </View>
        </ScrollView>
      </View>
    );
  };
  
  export default LessonDetailScreen;