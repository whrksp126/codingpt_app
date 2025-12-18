import React from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  StatusBar,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function LessonResultScreen() {
  return (
    <SafeAreaView className="flex-1 bg-[#FAFAFA]" edges={['top']}>
      <StatusBar barStyle="dark-content" />
      
      {/* Background - 노란색 그라데이션 */}
      <View className="flex-1 bg-[#F2E1C0]">
        <ScrollView 
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 20 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Progress Bar & Header */}
          <View className="px-4">
            {/* Progress Bar - 첫 번째만 완료 */}
            <View className="flex-row gap-1 h-[3px] items-center mb-2">
              <View className="flex-1 bg-[#E1E6EF] rounded-full overflow-hidden">
                <View className="bg-[#08875D] h-full w-full" />
              </View>
              <View className="flex-1 bg-[#08875D] rounded-full" />
              <View className="flex-1 bg-[#08875D] rounded-full" />
              <View className="flex-1 bg-[#08875D] rounded-full" />
              <View className="flex-1 bg-[#E1E6EF] rounded-full" />
              <View className="flex-1 bg-[#E1E6EF] rounded-full" />
            </View>
            
            <View className="flex-row justify-between items-center">
              <Text 
                className="font-pretendard text-[16px] font-bold"
                style={{ color: 'rgba(51, 51, 51, 0.8)', letterSpacing: -0.32 }}
              >
                05. 학습 결과
              </Text>
              <View className="w-6 h-6 justify-center items-center">
                <Text style={{ fontSize: 18, color: 'rgba(51, 51, 51, 0.8)' }}>✕</Text>
              </View>
            </View>
          </View>

          {/* Main Content */}
          <View className="pt-[90px] pb-5 items-center gap-[25px] justify-end" style={{ minHeight: 653, height: 764 }}>
            
            {/* Title */}
            <Text 
              className="font-pretendard text-[22px] font-bold text-center w-full"
              style={{ color: '#333333', letterSpacing: -0.44, lineHeight: 33 }}
            >
              버튼 태그 학습 <Text style={{ color: '#08875D' }}>완료!</Text>
            </Text>

            {/* Mission Card */}
            <View className="w-full px-4">
              <View 
                className="bg-[#F8F9FC] rounded-2xl p-6 gap-6"
                style={{
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 0.25,
                  shadowRadius: 5,
                  elevation: 5,
                }}
              >
                <Text 
                  className="font-pretendard text-[22px] font-bold text-center"
                  style={{ color: '#333333', letterSpacing: -0.44, lineHeight: 33 }}
                >
                  Mission
                </Text>
                
                <View className="gap-4">
                  {/* Mission Item 1 */}
                  <View className="flex-row items-center justify-between h-6">
                    <View className="flex-row items-center gap-3">
                      <View className="w-6 h-6">
                        <Text style={{ color: '#08875D', fontSize: 20 }}>✓</Text>
                      </View>
                      <Text 
                        className="font-pretendard text-[18px] font-bold"
                        style={{ color: 'rgba(51, 51, 51, 0.8)', lineHeight: 24 }}
                      >
                        버튼 이해하기
                      </Text>
                    </View>
                    <Text 
                      className="font-pretendard text-[16px] font-bold"
                      style={{ color: '#08875D', lineHeight: 24 }}
                    >
                      6 단계
                    </Text>
                  </View>

                  {/* Mission Item 2 */}
                  <View className="flex-row items-center justify-between h-6">
                    <View className="flex-row items-center gap-3">
                      <View className="w-6 h-6">
                        <Text style={{ color: '#08875D', fontSize: 20 }}>✓</Text>
                      </View>
                      <Text 
                        className="font-pretendard text-[18px] font-bold"
                        style={{ color: 'rgba(51, 51, 51, 0.8)', lineHeight: 24 }}
                      >
                        버튼 만들기
                      </Text>
                    </View>
                  </View>

                  {/* Mission Item 3 */}
                  <View className="flex-row items-center justify-between h-8">
                    <View className="flex-row items-center gap-3">
                      <View className="w-6 h-6">
                        <Text style={{ color: '#08875D', fontSize: 20 }}>✓</Text>
                      </View>
                      <Text 
                        className="font-pretendard text-[18px] font-bold"
                        style={{ color: 'rgba(51, 51, 51, 0.8)', lineHeight: 24 }}
                      >
                        송금하기
                      </Text>
                    </View>
                    <Text style={{ fontSize: 24, lineHeight: 32 }}>✨</Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Speech Bubble & Character (Raccoon) */}
            <View className="w-full items-end pb-[110px] relative">
              <View className="items-end pr-[44px]">
                <View 
                  className="bg-[#F8F9FC] rounded-[15px] px-[18px] py-3"
                  style={{
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 0 },
                    shadowOpacity: 0.2,
                    shadowRadius: 5,
                    elevation: 5,
                  }}
                >
                  <Text 
                    className="font-pretendard text-[22px] font-bold"
                    style={{ color: '#B25E09', letterSpacing: -0.44, lineHeight: 33 }}
                  >
                    축하합니다!
                  </Text>
                  <View style={{ height: 18 }} />
                  <Text 
                    className="font-pretendard text-[15px] font-semibold"
                    style={{ color: 'rgba(51, 51, 51, 0.8)', letterSpacing: -0.3, lineHeight: 22.5 }}
                  >
                    이제 <Text style={{ color: '#B25E09' }}>{`<button>`}</Text>태그를
                  </Text>
                  <Text 
                    className="font-pretendard text-[15px] font-semibold"
                    style={{ color: 'rgba(51, 51, 51, 0.8)', letterSpacing: -0.3, lineHeight: 22.5 }}
                  >
                    사용할 수 있어요.
                  </Text>
                  <Text 
                    className="font-pretendard text-[15px] font-semibold"
                    style={{ color: 'rgba(51, 51, 51, 0.8)', letterSpacing: -0.3, lineHeight: 22.5 }}
                  >
                    계속해서 더 많은 태그를 배워보세요!
                  </Text>
                </View>
              </View>
              
              {/* Character - Raccoon */}
              <View className="absolute right-0 bottom-0 w-[160px] h-[160px]">
                <Image
                  source={require('../../assets/images/raccoon.png')}
                  className="w-full h-full"
                  resizeMode="contain"
                />
              </View>
            </View>

            {/* Action Buttons */}
            <View className="w-full px-4 gap-5">
              {/* Primary Button */}
              <TouchableOpacity 
                className="bg-[#08875D] h-14 rounded-[10px] justify-center items-center"
                style={{
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 0.25,
                  shadowRadius: 5,
                  elevation: 5,
                }}
                activeOpacity={0.8}
              >
                <Text 
                  className="font-pretendard text-[16px] font-bold"
                  style={{ color: '#FFFFFF', letterSpacing: -0.32 }}
                >
                  다음 레슨 바로가기
                </Text>
              </TouchableOpacity>

              {/* Secondary Button */}
              <TouchableOpacity 
                className="bg-[#EDFDF8] h-14 rounded-[10px] justify-center items-center"
                style={{
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 0.25,
                  shadowRadius: 5,
                  elevation: 5,
                }}
                activeOpacity={0.8}
              >
                <Text 
                  className="font-pretendard text-[16px] font-bold"
                  style={{ color: '#08875D', letterSpacing: -0.32 }}
                >
                  학습 종료
                </Text>
              </TouchableOpacity>
            </View>

          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

