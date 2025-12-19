import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyReturn, X } from '../../assets/SvgIcon';
import CharacterSpeechBubble from '../../components/CharacterSpeechBubble';
import Card from '../../components/Card';
import BrowserHeader from '../../components/BrowserHeader';

export default function LessonIntroScreen() {
  return (
    <SafeAreaView className="flex-1 bg-Background-White_Base" edges={['top']}>
      
      <View className="flex-1">
        <ScrollView 
          className="flex-1 px-[16px]"
          contentContainerStyle={{ paddingBottom: 20 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Progress Bar */}
          <View className="pb-[10px]">
            <View className="flex-row gap-1 mb-[10px]">
              <View className="flex-1 h-[3px] rounded-[5px] bg-Success-Default-700" />
              <View className="flex-1 h-[3px] rounded-[5px] bg-Line-White" />
              <View className="flex-1 h-[3px] rounded-[5px] bg-Line-White" />
              <View className="flex-1 h-[3px] rounded-[5px] bg-Line-White" />
              <View className="flex-1 h-[3px] rounded-[5px] bg-Line-White" />
              <View className="flex-1 h-[3px] rounded-[5px] bg-Line-White" />
            </View>
            
            {/* Header */}
            <View className="flex-row justify-between items-center">
              <Text className="bold-16 text-Text-Black_Secondary tracking-[-0.32px]">
                01. 버튼을 만들고 싶어요
              </Text>
              <View className="w-6 h-6 justify-center items-center">
                <X width={24} height={24} fill="#6C757D" />
              </View>
            </View>
          </View>

          {/* Main Content */}
          <View className="py-[50px] gap-[60px]">
            {/* Title Section */}
            <View className="items-center gap-5">
              <View className="w-16 h-16 rounded-full bg-Success-Background-100 justify-center items-center">
                <KeyReturn width={32} height={32} fill="#08875D" />
              </View>
              
              <Text className="bold-22 text-Text-Black_Primary text-center tracking-[-0.44px]">
                내 생애 <Text className="text-Success-Default-700">첫 버튼</Text> 만들기
              </Text>
            </View>

            {/* Card */}
            <Card header={<BrowserHeader />}>
              <View className="gap-3">
                <View className="gap-1">
                  <Text className="regular-14 text-Text-Black_Disabled tracking-[-0.28px]">보내는 분</Text>
                  <Text className="bold-18 text-Text-Black_Secondary tracking-[-0.36px]">1호 회원</Text>
                </View>

                <View className="gap-1">
                  <Text className="regular-14 text-Text-Black_Disabled tracking-[-0.28px]">받는 분</Text>
                  <Text className="bold-18 text-Text-Black_Secondary tracking-[-0.36px]">너구리 PT쌤</Text>
                </View>

                <View className="gap-1">
                  <Text className="regular-14 text-Text-Black_Disabled tracking-[-0.28px]">송금액</Text>
                  <Text className="bold-18 text-Text-Black_Secondary tracking-[-0.36px]">500,000원</Text>
                </View>
              </View>

              {/* Error Box */}
              <View className="flex-row items-center justify-center gap-2 h-[60px] bg-Danger-Background-100 rounded-[10px] border-2 border-dashed border-Danger-Default-700">
                <View className="w-5 h-5 rounded-full bg-Danger-Default-700 justify-center items-center">
                  <Text className="bold-14 text-Text-White_Primary">!</Text>
                </View>
                <Text className="bold-16 text-Danger-Default-700 tracking-[-0.32px]">버튼이 사라졌어요!</Text>
              </View>
            </Card>
          </View>

          {/* Bottom Section with Turtle */}
          <View>
            <CharacterSpeechBubble
              characterImage={require('../../assets/images/turtle.png')}
              characterSize={{ width: 160, height: 160 }}
            >
              <Text className="semibold-15 text-Text-Black_Primary tracking-[-0.3px] leading-[22.5px]">
                송금을 해야하는데 버튼이 없네..?{'\n'}
                <Text className="font-bold">송금하기 </Text>
                <Text className="font-bold text-Success-Default-700">버튼</Text>
                을 만들고 싶어요!
              </Text>
            </CharacterSpeechBubble>
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

