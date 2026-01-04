import React from 'react';
import { View, Text, ScrollView, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card as CardIcon, MissionCheck, X } from '../../assets/SvgIcon';
import Card from '../../components/Card';
import CharacterSpeechBubble from '../../components/CharacterSpeechBubble';

export default function LessonGoalScreen() {
  return (
    <SafeAreaView className="flex-1 bg-[#FAFAFA]" edges={['top']}>
      <StatusBar barStyle="dark-content" />
      
      <View className="flex-1 px-[16px]">
        <ScrollView 
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 20 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Progress Bar */}
          <View className="pb-1">
            <View className="flex-row gap-1 mb-[10px]">
              <View className="flex-1 h-[3px] rounded-[5px] bg-Success-Default-700" />
              <View className="flex-1 h-[3px] rounded-[5px] bg-Success-Default-700" />
              <View className="flex-1 h-[3px] rounded-[5px] bg-Line-White" />
              <View className="flex-1 h-[3px] rounded-[5px] bg-Line-White" />
              <View className="flex-1 h-[3px] rounded-[5px] bg-Line-White" />
              <View className="flex-1 h-[3px] rounded-[5px] bg-Line-White" />
            </View>
            
            {/* Header */}
            <View className="flex-row justify-between items-center">
              <Text className="bold-16 text-Text-Black_Secondary tracking-[-0.32px]">
                02. 버튼 만들기 학습 목표
              </Text>
              <View className="w-6 h-6 justify-center items-center">
                <X width={24} height={24} fill="#6C757D" />
              </View>
            </View>
          </View>

          {/* Main Content */}
          <View className="py-10 items-center gap-[30px]">
            {/* Icon Section */}
            <View className="items-center">
              <View className="w-16 h-16 rounded-full bg-Warning-Background-100 justify-center items-center">
                <CardIcon width={32} height={32} fill="#B25E09" />
              </View>
            </View>

            {/* Title */}
            <Text className="bold-22 text-Text-Black_Primary text-center tracking-[-0.44px]">
              이번 레슨의 목표
            </Text>
          </View>

          {/* Mission Card */}
          <View className="items-center">
            <Card className="w-full" contentClassName="gap-[24px]">
              <Text className="bold-22 text-Text-Black_Primary text-center tracking-[-0.44px]">
                Mission
              </Text>
              
              <View className="gap-[16px]">
                {/* Mission Item 1 */}
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-3 flex-1">
                    <View className="justify-center items-center">
                      <MissionCheck width={24} height={24} fill="#333333" />
                    </View>
                    <Text className="bold-18 text-Text-Black_Secondary">버튼 이해하기</Text>
                  </View>
                  <Text className="bold-16 text-Text-Black_Secondary">6 단계</Text>
                </View>

                {/* Mission Item 2 */}
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-3 flex-1">
                    <View className="justify-center items-center">
                      <MissionCheck width={24} height={24} fill="#333333" />
                    </View>
                    <Text className="bold-18 text-Text-Black_Secondary">버튼 만들기</Text>
                  </View>
                </View>

                {/* Mission Item 3 */}
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-3 flex-1">
                    <View className="justify-center items-center">
                      <MissionCheck width={24} height={24} fill="#333333" />
                    </View>
                    <Text className="bold-18 text-Text-Black_Secondary">송금하기</Text>
                  </View>
                </View>
              </View>
            </Card>
          </View>

          {/* Bottom Section with Character */}
          <View className="mt-[60px]">
            <CharacterSpeechBubble
              characterImage={require('../../assets/images/raccoon.png')}
              characterSize={{ width: 160, height: 160 }}
            >
              <Text className="semibold-15 text-Text-Black_Primary">
                이제 송금하기 버튼을 만들러 가볼까요?
              </Text>
            </CharacterSpeechBubble>
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

