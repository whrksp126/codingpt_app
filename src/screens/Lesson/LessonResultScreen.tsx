import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import CharacterSpeechBubble from '../../components/CharacterSpeechBubble';
import Card from '../../components/Card';
import DefaultBtn from '../../components/Button/DefaultBtn';
import { MissionCheck, X } from '../../assets/SvgIcon';

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
          <View className="pb-1">
            <View className="flex-row gap-1 mb-[10px]">
              <View className="flex-1 h-[3px] rounded-[5px] bg-Success-Default-700" />
              <View className="flex-1 h-[3px] rounded-[5px] bg-Success-Default-700" />
              <View className="flex-1 h-[3px] rounded-[5px] bg-Success-Default-700" />
              <View className="flex-1 h-[3px] rounded-[5px] bg-Success-Default-700" />
              <View className="flex-1 h-[3px] rounded-[5px] bg-Success-Default-700" />
              <View className="flex-1 h-[3px] rounded-[5px] bg-Success-Default-700" />
            </View>
            
            {/* Header */}
            <View className="flex-row justify-between items-center">
              <Text className="bold-16 text-Text-Black_Secondary tracking-[-0.32px]">
                05. 학습 결과
              </Text>
              <View className="w-6 h-6 justify-center items-center">
                <X width={24} height={24} fill="#6C757D" />
              </View>
            </View>
          </View>

          {/* Main Content */}
          <View className="pt-[90px] pb-5 items-center gap-[25px] justify-end" style={{ minHeight: 653, height: 764 }}>
            
            {/* Title */}
            <Text className="bold-22 text-Text-Black_Primary text-center w-full">
              버튼 태그 학습 <Text className="text-Success-Default-700">완료!</Text>
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
                        <MissionCheck width={24} height={24} fill="#08875D" />
                      </View>
                      <Text className="bold-18 text-Text-Black_Secondary">
                        버튼 이해하기
                      </Text>
                    </View>
                    <Text className="bold-16 text-Success-Default-700">
                      6 단계
                    </Text>
                  </View>

                  {/* Mission Item 2 */}
                  <View className="flex-row items-center justify-between h-6">
                    <View className="flex-row items-center gap-3">
                      <View className="w-6 h-6">
                        <MissionCheck width={24} height={24} fill="#08875D" />
                      </View>
                      <Text className="bold-18 text-Text-Black_Secondary">
                        버튼 만들기
                      </Text>
                    </View>
                  </View>

                  {/* Mission Item 3 */}
                  <View className="flex-row items-center justify-between h-8">
                    <View className="flex-row items-center gap-3">
                      <View className="w-6 h-6">
                        <MissionCheck width={24} height={24} fill="#08875D" />
                      </View>
                      <Text className="bold-18 text-Text-Black_Secondary">
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
              <Text className="semibold-15 text-Text-Black_Secondary">
                이제 <Text className="text-Warning-Default-700">{`<button>`}</Text>태그를{'\n'}
                사용할 수 있어요.{'\n'}
                계속해서 더 많은 태그를 배워보세요!
              </Text>
            </CharacterSpeechBubble>

            {/* Action Buttons */}
            <View className="w-full gap-5">
              {/* Primary Button */}
              <DefaultBtn
                onPress={() => {
                  // TODO: 다음 레슨으로 이동하는 로직 구현
                  console.log('다음 레슨 바로가기');
                }}
                text="다음 레슨 바로가기"
                buttonClassName="w-full h-14 rounded-[10px] justify-center items-center bg-Success-Default-700"
                textClassName="bold-16 text-Text-White_Primary"
                flex={false}
                shadowColor="#08875D"
              />

              {/* Secondary Button */}
              <DefaultBtn
                onPress={() => {
                  // TODO: 학습 종료 로직 구현
                  console.log('학습 종료');
                }}
                text="학습 종료"
                buttonClassName="w-full h-14 rounded-[10px] justify-center items-center bg-Success-Background-100"
                textClassName="bold-16 text-Success-Default-700"
                flex={false}
                shadowColor="#000"
              />
            </View>

          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

