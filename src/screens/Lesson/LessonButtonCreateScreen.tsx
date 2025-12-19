import React from 'react';
import {
  View,
  Text,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X } from '../../assets/SvgIcon';
import CharacterSpeechBubble from '../../components/CharacterSpeechBubble';

export default function LessonButtonCreateScreen() {
  return (
    <SafeAreaView className="flex-1 bg-Background-White_Base" edges={['top']}>
      <View className="flex-1">
        <ScrollView 
          className="flex-1 px-[16px]"
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Progress Bar & Header */}
          <View className="pb-1">
            <View className="flex-row gap-1 mb-[10px]">
              <View className="flex-1 h-[3px] rounded-[5px] bg-Success-Default-700" />
              <View className="flex-1 h-[3px] rounded-[5px] bg-Success-Default-700" />
              <View className="flex-1 h-[3px] rounded-[5px] bg-Success-Default-700" />
              <View className="flex-1 h-[3px] rounded-[5px] bg-Success-Default-700" />
              <View className="flex-1 h-[3px] rounded-[5px] bg-Line-White" />
              <View className="flex-1 h-[3px] rounded-[5px] bg-Line-White" />
            </View>
            
            <View className="flex-row justify-between items-center">
              <Text className="bold-16 text-Text-Black_Secondary">
                03. 버튼 태그 만들기
              </Text>
              <View className="w-6 h-6 justify-center items-center">
                <X width={24} height={24} fill="#6C757D" />
              </View>
            </View>
          </View>

          {/* Main Content */}
          <View className="pt-[90px] pb-[20px] items-center gap-[50px]">
            
            {/* Top Speech Bubble & Character */}
            <View className="w-full">
              <CharacterSpeechBubble
                characterImage={require('../../assets/images/raccoon.png')}
                characterSize={{ width: 160, height: 160 }}
              >
                <Text className="semibold-15 text-Text-Black_Primary tracking-[-0.3px] leading-[22.5px]">
                  태그로 감싸서 버튼을 만들어 볼까요?{'\n'}
                  블록을 순서대로 채워보세요.
                </Text>
              </CharacterSpeechBubble>
            </View>

            {/* Drop Zone Container */}
            <View className="w-full bg-Background-White_Secondary rounded-[14px] px-4 py-5 shadow-sm">
              <View className="flex-row gap-[10px] items-center justify-center">
                {/* Drop Zone 1 */}
                <View className="bg-Background-White_Base border-[1.5px] border-dashed border-Line-Black h-[40px] rounded-[8px] flex-1 max-w-[100px]" />
                {/* Drop Zone 2 */}
                <View className="bg-Background-White_Base border-[1.5px] border-dashed border-Line-Black h-[40px] rounded-[8px] flex-1 max-w-[100px]" />
                {/* Drop Zone 3 */}
                <View className="bg-Background-White_Base border-[1.5px] border-dashed border-Line-Black h-[40px] rounded-[8px] flex-1 max-w-[100px]" />
              </View>
            </View>

            {/* Draggable Blocks */}
            <View className="flex-row gap-3 items-center justify-center w-full">
              {/* Block 1: <button> */}
              <View className="bg-Success-Default-700 rounded-[8px] px-[12px] py-[8px]">
                <Text className="bold-14 text-Text-White_Primary">
                  {`<button>`}
                </Text>
              </View>
              {/* Block 2: 송금하기 */}
              <View className="bg-Success-Default-700 rounded-[8px] px-[12px] py-[8px]">
                <Text className="bold-14 text-Text-White_Primary">
                  송금하기
                </Text>
              </View>
              {/* Block 3: </button> */}
              <View className="bg-Success-Default-700 rounded-[8px] px-[12px] py-[8px]">
                <Text className="bold-14 text-Text-White_Primary">
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

