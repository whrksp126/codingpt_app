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
import { useNavigation } from '@react-navigation/native';

const { width } = Dimensions.get('window');

export default function LessonHTMLConceptScreen() {
  const navigation = useNavigation();

  return (
    <SafeAreaView className="flex-1 bg-[#FAFAFA]" edges={['top']}>
      <StatusBar barStyle="dark-content" />
      
      {/* Background Gradient Effect - using solid color for RN as gradients need extra library */}
      <View className="flex-1 bg-[#DBEAFE]">
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
              <View className="flex-1 h-[3px] rounded-[5px] bg-[#E1E6EF]" />
              <View className="flex-1 h-[3px] rounded-[5px] bg-[#E1E6EF]" />
              <View className="flex-1 h-[3px] rounded-[5px] bg-[#E1E6EF]" />
              <View className="flex-1 h-[3px] rounded-[5px] bg-[#E1E6EF]" />
            </View>
            
            <View className="flex-row justify-between items-center">
              <Text className="font-pretendard text-[16px] font-bold text-[rgba(51,51,51,0.8)] tracking-[-0.32px]">
                02. 버튼 태그의 개념
              </Text>
              <View className="w-6 h-6 justify-center items-center">
                <Text className="text-[18px] text-[rgba(51,51,51,0.8)]">✕</Text>
              </View>
            </View>
          </View>

          {/* Main Content */}
          <View className="px-4 pt-10 pb-[20px] items-center gap-[60px]">
            {/* Title Section */}
            <View className="items-center gap-[30px] w-full">
              <View className="items-center w-full gap-[20px]">
                <View className="w-[64px] h-[64px] rounded-[32px] bg-[#F0F5FF] justify-center items-center">
                  <Text className="text-[32px] text-[#2F6FED]">{`<>`}</Text>
                </View>
                
                <View className="items-center">
                  <Text className="font-pretendard text-[22px] font-bold text-[#333333] leading-[33px] tracking-[-0.44px] text-center">
                    HTML은 <Text className="text-[#2F6FED]">햄버거</Text>와 같아요.
                  </Text>
                  <Text className="font-pretendard text-[22px] font-bold text-[#333333] leading-[33px] tracking-[-0.44px] text-center">
                    우리가 보여주고 싶은 내용을
                  </Text>
                  <Text className="font-pretendard text-[22px] font-bold text-[#333333] leading-[33px] tracking-[-0.44px] text-center">
                    <Text className="text-[#2F6FED]">태그(Tag)</Text> 라는 빵으로 감싸줘야 해요.
                  </Text>
                </View>
              </View>

              {/* Hamburger Image */}
              <View className="w-[100px] h-[100px] shadow-lg">
                <Image
                  source={require('../../assets/images/hamburger.png')}
                  className="w-full h-full"
                  resizeMode="contain"
                />
              </View>
            </View>

            {/* Code Explanation Card */}
            <View className="w-full bg-[#F8F9FC] rounded-[16px] p-5 shadow-sm gap-[15px]">
              
              {/* Item 1: Opening Tag */}
              <View className="border-b-[0.75px] border-[#E1E6EF] pb-[15.75px] gap-[10px]">
                <View className="bg-[#F0F5FF] rounded-[6px] px-2 py-1 self-start">
                  <Text className="font-pretendard text-[14px] font-bold text-[#2F6FED] tracking-[-0.28px]">
                    {`<button>`}
                  </Text>
                </View>
                <Text className="font-pretendard text-[15px] font-normal text-[#333333] leading-[22.5px] tracking-[-0.3px]">
                  "자, 이제 버튼을 만들 거야!" 라고 컴퓨터에게 알려줘요.
                </Text>
              </View>

              {/* Item 2: Content */}
              <View className="border-b-[0.75px] border-[#E1E6EF] pb-[15.75px] gap-[10px]">
                <View className="bg-[#E1E6EF] rounded-[6px] px-2 py-1 self-start">
                  <Text className="font-pretendard text-[14px] font-bold text-[rgba(51,51,51,0.8)] tracking-[-0.28px]">
                    text
                  </Text>
                </View>
                <Text className="font-pretendard text-[15px] font-normal text-[#333333] leading-[22.5px] tracking-[-0.3px]">
                  빵 사이에 우리가 보여주고 싶은 핵심 내용을 넣어요.
                </Text>
              </View>

              {/* Item 3: Closing Tag */}
              <View className="gap-[10px]">
                <View className="bg-[#F0F5FF] rounded-[6px] px-2 py-1 self-start">
                  <Text className="font-pretendard text-[14px] font-bold text-[#2F6FED] tracking-[-0.28px]">
                    {`</button>`}
                  </Text>
                </View>
                <Text className="font-pretendard text-[15px] font-normal text-[#333333] leading-[22.5px] tracking-[-0.3px]">
                  내용물이 흐르지 않게 마감을 해줘야 해요. 닫는 태그에는 마감 표시 슬래시(/)를 꼭 넣어주세요!
                </Text>
              </View>

            </View>
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

