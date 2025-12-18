import React from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  StatusBar,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');

export default function LessonButtonCreateScreen() {
  return (
    <SafeAreaView className="flex-1 bg-[#FAFAFA]" edges={['top']}>
      <StatusBar barStyle="dark-content" />
      
      {/* Background Gradient Effect - using solid color for RN */}
      <View className="flex-1 bg-[#F7DCDE]">
        <ScrollView 
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Progress Bar & Header */}
          <View className="px-4 pb-1">
            <View className="flex-row gap-1 mb-[10px]">
              <View className="flex-1 h-[3px] rounded-[5px] bg-[#08875D]" />
              <View className="flex-1 h-[3px] rounded-[5px] bg-[#08875D]" />
              <View className="flex-1 h-[3px] rounded-[5px] bg-[#08875D]" />
              <View className="flex-1 h-[3px] rounded-[5px] bg-[#E1E6EF]" />
              <View className="flex-1 h-[3px] rounded-[5px] bg-[#E1E6EF]" />
              <View className="flex-1 h-[3px] rounded-[5px] bg-[#E1E6EF]" />
            </View>
            
            <View className="flex-row justify-between items-center">
              <Text className="font-pretendard text-[16px] font-bold text-[rgba(51,51,51,0.8)] tracking-[-0.32px]">
                03. 버튼 태그 만들기
              </Text>
              <View className="w-6 h-6 justify-center items-center">
                <Text className="text-[18px] text-[rgba(51,51,51,0.8)]">✕</Text>
              </View>
            </View>
          </View>

          {/* Main Content */}
          <View className="px-4 pt-[90px] pb-[20px] items-center gap-[50px]">
            
            {/* Top Speech Bubble & Character */}
            <View className="w-full items-end pb-[110px] relative">
              <View className="items-end pr-[44px]">
                <View className="bg-[#F8F9FC] rounded-[15px] px-[18px] py-3 shadow-sm max-w-[calc(100%-76px)]">
                  <Text className="font-pretendard text-[15px] font-semibold text-[#333333] leading-[22.5px] tracking-[-0.3px]">
                    태그로 감싸서 버튼을 만들어 볼까요?{'\n'}
                    블록을 순서대로 채워보세요.
                  </Text>
                </View>
              </View>
              
              {/* Character */}
              <View className="absolute right-0 bottom-0 w-[160px] h-[160px]">
                <Image
                  source={require('../../assets/images/turtle.png')}
                  className="w-full h-full"
                  resizeMode="contain"
                />
              </View>
            </View>

            {/* Bottom Speech Bubble & Character Icon */}
            <View className="w-full items-start">
              <View className="flex-row items-center justify-end gap-[10px] w-full">
                <View className="relative">
                  <View className="bg-[#F8F9FC] rounded-[15px] px-[18px] py-3">
                    <Text className="font-pretendard text-[15px] font-semibold text-[#333333] leading-[22.5px] tracking-[-0.3px]">
                      태그로 감싸서 버튼을 만들어 볼까요?{'\n'}
                      블록을 순서대로 채워보세요.
                    </Text>
                  </View>
                  {/* Speech bubble tail */}
                  <View className="absolute right-[-8px] top-[27.5px] w-[17px] h-[20px]">
                    <View className="w-full h-full bg-[#F8F9FC] rotate-[270deg]" style={{ transform: [{ rotate: '270deg' }] }}>
                      <View className="w-0 h-0 border-l-[8px] border-l-[#F8F9FC] border-t-[8px] border-t-transparent border-b-[8px] border-b-transparent" />
                    </View>
                  </View>
                </View>
                
                {/* Character Icon */}
                <View className="w-[75px] h-[75px] rounded-full overflow-hidden">
                  <Image
                    source={require('../../assets/images/turtle.png')}
                    className="w-full h-full"
                    resizeMode="cover"
                  />
                </View>
              </View>
            </View>

            {/* Drop Zone Container */}
            <View className="w-full bg-[#F1F3F9] rounded-[14px] px-4 py-5 shadow-sm">
              <View className="flex-row gap-[10px] items-center justify-center">
                {/* Drop Zone 1 */}
                <View className="bg-white border-[1.5px] border-dashed border-[#3F444D] h-[40px] rounded-[8px] flex-1 max-w-[100px]" />
                
                {/* Drop Zone 2 */}
                <View className="bg-white border-[1.5px] border-dashed border-[#3F444D] h-[40px] rounded-[8px] flex-1 max-w-[100px]" />
                
                {/* Drop Zone 3 */}
                <View className="bg-white border-[1.5px] border-dashed border-[#3F444D] h-[40px] rounded-[8px] flex-1 max-w-[100px]" />
              </View>
            </View>

            {/* Draggable Blocks */}
            <View className="flex-row gap-3 items-center justify-center w-full">
              {/* Block 1: <button> */}
              <View className="bg-[#08875D] rounded-[8px] px-3 py-2">
                <Text className="font-pretendard text-[14px] font-bold text-white tracking-[-0.28px]">
                  {`<button>`}
                </Text>
              </View>

              {/* Block 2: 송금하기 */}
              <View className="bg-[#08875D] rounded-[8px] px-3 py-2">
                <Text className="font-pretendard text-[14px] font-bold text-white tracking-[-0.28px]">
                  송금하기
                </Text>
              </View>

              {/* Block 3: </button> */}
              <View className="bg-[#08875D] rounded-[8px] px-3 py-2">
                <Text className="font-pretendard text-[14px] font-bold text-white tracking-[-0.28px]">
                  {`</button>`}
                </Text>
              </View>
            </View>

          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

