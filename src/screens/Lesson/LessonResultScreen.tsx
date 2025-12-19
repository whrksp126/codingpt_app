import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import CharacterSpeechBubble from '../../components/CharacterSpeechBubble';
import Card from '../../components/Card';

export default function LessonResultScreen() {
  return (
    <SafeAreaView className="flex-1 bg-Background-White_Base" edges={['top']}>
      
      {/* Background - 노란색 그라데이션 */}
      <View className="flex-1">
        <ScrollView 
          className="flex-1 px-[16px]"
          contentContainerStyle={{ paddingBottom: 20 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Progress Bar & Header */}
          <View>
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
            <View className="w-full">
              <Card contentClassName="p-6 gap-6">
                <Text className="bold-22 text-Text-Black_Primary text-center">
                  Mission
                </Text>
                
                <View className="gap-4">
                  {/* Mission Item 1 */}
                  <View className="flex-row items-center justify-between h-6">
                    <View className="flex-row items-center gap-3">
                      <View className="w-6 h-6">
                        <Text className="text-[20px] text-Success-Default-700 leading-6">✓</Text>
                      </View>
                      <Text className="bold-18 text-Text-Black_Secondary leading-6">
                        버튼 이해하기
                      </Text>
                    </View>
                    <Text className="bold-16 text-Success-Default-700 leading-6">
                      6 단계
                    </Text>
                  </View>

                  {/* Mission Item 2 */}
                  <View className="flex-row items-center justify-between h-6">
                    <View className="flex-row items-center gap-3">
                      <View className="w-6 h-6">
                        <Text className="text-[20px] text-Success-Default-700 leading-6">✓</Text>
                      </View>
                      <Text className="bold-18 text-Text-Black_Secondary leading-6">
                        버튼 만들기
                      </Text>
                    </View>
                  </View>

                  {/* Mission Item 3 */}
                  <View className="flex-row items-center justify-between h-8">
                    <View className="flex-row items-center gap-3">
                      <View className="w-6 h-6">
                        <Text className="text-[20px] text-Success-Default-700 leading-6">✓</Text>
                      </View>
                      <Text className="bold-18 text-Text-Black_Secondary leading-6">
                        송금하기
                      </Text>
                    </View>
                    <Text className="text-[24px] leading-8">✨</Text>
                  </View>
                </View>
              </Card>
            </View>

            {/* Speech Bubble & Character (Raccoon) */}
            <CharacterSpeechBubble>
              <Text 
                className="bold-22 text-Warning-Default-700"
              >
                축하합니다!
              </Text>
              <View style={{ height: 18 }} />
              <Text 
                className="font-pretendard text-[15px] font-semibold"
                style={{ color: 'rgba(51, 51, 51, 0.8)', letterSpacing: -0.3, lineHeight: 22.5 }}
              >
                이제 <Text style={{ color: '#B25E09' }}>{`<button>`}</Text>태그를{'\n'}
                사용할 수 있어요.{'\n'}
                계속해서 더 많은 태그를 배워보세요!
              </Text>
            </CharacterSpeechBubble>

            {/* Action Buttons */}
            <View className="w-full gap-5">
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

