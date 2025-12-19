import React from 'react';
import { View, Text, ScrollView, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { AngleBrackets, X } from '../../assets/SvgIcon';
import Card from '../../components/Card';
import ConceptExplanationItem from '../../components/ConceptExplanationItem';

export default function LessonHTMLConceptScreen() {
  const navigation = useNavigation();

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
              <View className="flex-1 h-[3px] rounded-[5px] bg-Line-White" />
              <View className="flex-1 h-[3px] rounded-[5px] bg-Line-White" />
              <View className="flex-1 h-[3px] rounded-[5px] bg-Line-White" />
            </View>
            
            <View className="flex-row justify-between items-center">
              <Text className="bold-16 text-Text-Black_Secondary tracking-[-0.32px]">
                02. 버튼 태그의 개념
              </Text>
              <View className="w-6 h-6 justify-center items-center">
                <X width={24} height={24} fill="#6C757D" />
              </View>
            </View>
          </View>

          {/* Main Content */}
          <View className="pt-[40px] pb-[20px] items-center gap-[60px]">
            {/* Title Section */}
            <View className="items-center gap-[24px]">
              <View className="items-center w-full gap-5">
                <View className="w-[64px] h-[64px] rounded-full bg-Blue-Background-100 justify-center items-center">
                  <AngleBrackets width={32} height={32} fill="#2F6FED" />
                </View>
                
                <View className="items-center">
                  <Text className="bold-22 text-Text-Black_Primary text-center leading-[33px] tracking-[-0.44px]">
                    HTML은 <Text className="text-Blue-Default-700">햄버거</Text>와 같아요.
                  </Text>
                  <Text className="bold-22 text-Text-Black_Primary text-center leading-[33px] tracking-[-0.44px]">
                    우리가 보여주고 싶은 내용을
                  </Text>
                  <Text className="bold-22 text-Text-Black_Primary text-center leading-[33px] tracking-[-0.44px]">
                    <Text className="text-Blue-Default-700">태그(Tag)</Text> 라는 빵으로 감싸줘야 해요.
                  </Text>
                </View>
              </View>

              {/* Hamburger Image */}
              <View className="w-[100px] h-[100px]">
                <Image
                  source={require('../../assets/images/hamburger.png')}
                  className="w-full h-full"
                  resizeMode="contain"
                />
              </View>
            </View>

            {/* Code Explanation Card */}
            <Card 
              className="w-full" 
              contentClassName="p-5 gap-[15px]"
              style={{
                shadowOpacity: 0.2,
                shadowRadius: 10,
                elevation: 10,
              }}
            >
              <ConceptExplanationItem
                code={`<button>`}
                description={`"자, 이제 버튼을 만들 거야!" 라고 컴퓨터에게 알려줘요.`}
              />
              <ConceptExplanationItem
                code="text"
                description="빵 사이에 우리가 보여주고 싶은 핵심 내용을 넣어요."
                codeBgColor="bg-Line-White"
                codeTextColor="text-Text-Black_Secondary"
              />
              <ConceptExplanationItem
                code={`</button>`}
                description="내용물이 흐르지 않게 마감을 해줘야 해요. 닫는 태그에는 마감 표시 슬래시(/)를 꼭 넣어주세요!"
                showBorder={false}
              />
            </Card>
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

