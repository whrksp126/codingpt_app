import React from 'react';
import { View, Text, ScrollView, Pressable, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Play, X } from '../../assets/SvgIcon';
import Card from '../../components/Card';
import CharacterSpeechBubble from '../../components/CharacterSpeechBubble';
import BrowserHeader from '../../components/BrowserHeader';

export default function LessonButtonExecuteScreen() {
  return (
    <SafeAreaView className="flex-1 bg-Background-White_Base" edges={['top']}>
      <StatusBar barStyle="dark-content" />

      {/* NOTE: Figma는 그라데이션 배경이지만, RN에서는 추가 라이브러리 없이 단색(토큰)으로 근사 */}
      <View className="flex-1 bg-Purple-Background-100">
        <ScrollView className="flex-1 px-[16px]" contentContainerStyle={{ paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
          {/* 상단 진행바 + 헤더 */}
          <View className="pb-1">
            <View className="flex-row gap-1 mb-[10px]">
              <View className="flex-1 h-[3px] rounded-[5px] bg-Success-Default-700" />
              <View className="flex-1 h-[3px] rounded-[5px] bg-Success-Default-700" />
              <View className="flex-1 h-[3px] rounded-[5px] bg-Success-Default-700" />
              <View className="flex-1 h-[3px] rounded-[5px] bg-Success-Default-700" />
              <View className="flex-1 h-[3px] rounded-[5px] bg-Success-Default-700" />
              <View className="flex-1 h-[3px] rounded-[5px] bg-Line-White" />
            </View>

            <View className="flex-row justify-between items-center">
              <Text className="bold-16 text-Text-Black_Secondary">
                04. 버튼 태그 실행
              </Text>
              <View className="w-6 h-6 items-center justify-center">
                <X width={24} height={24} fill="#6C757D" />
              </View>
            </View>
          </View>

          {/* 본문 */}
          <View className="py-[60px] items-center gap-[80px]">
            {/* 코드 카드 + 실행 버튼 */}
            <View className="w-full items-center gap-[30px]">
              <View 
                className="w-full rounded-[16px] bg-Background-Black_Base px-4 pt-4 pb-[26px] gap-4"
                style={{ height: 166 }}
              >
                <BrowserHeader size="small" gap={6} />

                <View className="flex-row flex-wrap items-center">
                  <Text className="bold-14 text-Text-White_Primary leading-[24px]">{'<'}</Text>
                  <Text className="bold-14 leading-[24px]" style={{ color: '#FB64B6' }}>button</Text>
                  <Text className="bold-14 text-Text-White_Primary leading-[24px]">{'>'}</Text>

                  <View className="mx-2 bg-Background-Black_Secondary border-[1.5px] border-dashed border-Line-White rounded-[4px] min-w-[50px] min-h-[24px] px-2 items-center justify-center">
                    <Text className="bold-14 text-Text-White_Primary leading-[24px]">
                      송금하기
                    </Text>
                  </View>

                  <Text className="bold-14 text-Text-White_Primary leading-[24px]">{'</'}</Text>
                  <Text className="bold-14 leading-[24px]" style={{ color: '#FB64B6' }}>button</Text>
                  <Text className="bold-14 text-Text-White_Primary leading-[24px]">{'>'}</Text>
                </View>
              </View>

              <Pressable className="w-[160px] h-[50px] rounded-[10px] bg-Blue-Default-700 shadow-sm items-center justify-center flex-row gap-3">
                <Play width={24} height={24} fill="#FFFFFF" />
                <Text className="bold-16 text-Text-White_Primary tracking-[-0.32px]">
                  코드 실행
                </Text>
              </Pressable>
            </View>

            {/* 결과 카드 + 말풍선 */}
            <View className="w-full gap-[30px]">
            <Card header={<BrowserHeader />}>
                <View className="gap-3">
                  <View className="gap-1">
                    <Text className="regular-14 text-Text-Black_Disabled">
                      보내는 분
                    </Text>
                    <Text className="bold-18 text-Text-Black_Secondary">
                      1호 회원
                    </Text>
                  </View>
                  <View className="gap-1">
                    <Text className="regular-14 text-Text-Black_Disabled">
                      받는 분
                    </Text>
                    <Text className="bold-18 text-Text-Black_Secondary">
                      너구리 PT쌤
                    </Text>
                  </View>
                  <View className="gap-1">
                    <Text className="regular-14 text-Text-Black_Disabled">
                      송금액
                    </Text>
                    <Text className="bold-18 text-Text-Black_Secondary">
                      500,000원
                    </Text>
                  </View>
                </View>

                <View className="w-full h-[50px] rounded-[10px] bg-Success-Default-700 items-center justify-center">
                  <Text className="bold-16 text-Text-White_Primary">
                    송금하기
                  </Text>
                </View>
              </Card>

              <CharacterSpeechBubble
                characterImage={require('../../assets/images/turtle.png')}
                characterSize={{ width: 160, height: 160 }}
              >
                <Text className="semibold-15 text-Text-Black_Primary">
                  우와! 송금하기 버튼이 생겼어!
                </Text>
              </CharacterSpeechBubble>
            </View>
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}


