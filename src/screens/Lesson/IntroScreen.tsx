import React from 'react';
import { View, Text, ScrollView, Image, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useNavigation } from '@react-navigation/native';
import DefaultIconBtn from '../../components/Button/DefaultIconBtn';
import { KeyReturn, X } from '../../assets/SvgIcon';

// Figma에서 가져온 이미지 URL들
const imgPtLogo1 = 'http://localhost:3845/assets/a0efe1450068ff42b9617cb0d4852c45ca7c7055.png';
const img4 = 'http://localhost:3845/assets/7adba603018d437c6226e4afdcb2e350d61a4591.png';
const imgIcon = 'http://localhost:3845/assets/f07eb149dbdde46c128d46b23c72f26a91faf0bb.svg';
const imgContainer = 'http://localhost:3845/assets/9a71a05102046992d69f8801de4096362a77152e.svg';
const imgEllipse40 = 'http://localhost:3845/assets/144feaecb5eed837190be6a064076da098099000.svg';
const imgEllipse41 = 'http://localhost:3845/assets/d165875ff12568139996ef36ee80834b5cf38cbb.svg';
const imgEllipse42 = 'http://localhost:3845/assets/d981c6266edbf06ad89f05f8cb48a4ee7d7d5efd.svg';
const img3 = 'http://localhost:3845/assets/6b276e58eed217219d3893cd4bdab8b1c5c2f3cc.svg';

const IntroScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  const handleExitPress = () => {
    navigation.goBack();
  };

  return (
    <View
      className="flex-1"
      style={{
        backgroundColor: '#FAFAFA',
      }}
    >
      {/* 그라데이션 배경 - React Native에서는 단색 배경 사용 */}
      <View
        style={[
          StyleSheet.absoluteFillObject,
          { backgroundColor: 'rgba(215, 243, 224, 0.65)' }
        ]}
      />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 20 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Progress Bar */}
        <View
          className="px-4 pb-1"
          style={{ paddingTop: Math.max(insets.top, 16) }}
        >
          <View className="flex-row gap-1 mb-2.5">
            <View className="flex-1 h-[3px] rounded-[5px] bg-Success-Default-700" />
            <View className="flex-1 h-[3px] rounded-[5px] bg-Line-White" />
            <View className="flex-1 h-[3px] rounded-[5px] bg-Line-White" />
            <View className="flex-1 h-[3px] rounded-[5px] bg-Line-White" />
            <View className="flex-1 h-[3px] rounded-[5px] bg-Line-White" />
            <View className="flex-1 h-[3px] rounded-[5px] bg-Line-White" />
            <View className="flex-1 h-[3px] rounded-[5px] bg-Line-White" />
          </View>

          {/* Header */}
          <View className="flex-row justify-between items-center h-[44px]">
            <Text className="bold-16 text-Text-Black_Secondary">
              01. 인트로
            </Text>
            <DefaultIconBtn
              onPress={handleExitPress}
              size={32}
              enableHapticFeedback
            >
              <X width={24} height={24} fill="#6C757D" />
            </DefaultIconBtn>
          </View>
        </View>

        {/* Content */}
        <View className="flex-1 px-4 py-[50px]">
          <View className="flex-col gap-[60px] items-center">
            {/* Icon Badge & Title */}
            <View className="flex-col gap-5 items-center w-full">
              <View className="bg-Success-Background-100 rounded-full w-16 h-16 items-center justify-center">
                <KeyReturn width={32} height={32} fill="#08875D" />
              </View>
              <Text className="bold-22 text-center">
                <Text className="text-Success-Default-700">HTML</Text>
                <Text className="text-Text-Black_Primary">이란 무엇인가?</Text>
              </Text>
            </View>

            {/* WebView Card */}
            <View className="bg-Background-White_Primary rounded-2xl shadow-lg w-full overflow-hidden">
              {/* Browser Header */}
              <View className="px-4 py-4">
                <Image
                  source={{ uri: imgContainer }}
                  style={{ width: '100%', height: 8 }}
                  resizeMode="contain"
                />
              </View>

              {/* Web Content */}
              <View className="bg-white">
                {/* Header with Logo and Navigation */}
                <View
                  className="px-4 py-2 flex-row justify-between items-center"
                  style={{ backgroundColor: 'rgba(148, 201, 62, 0.9)' }}
                >
                  <View className="w-[38px] h-5">
                    <Image
                      source={{ uri: imgPtLogo1 }}
                      style={{ width: '100%', height: '100%' }}
                      resizeMode="contain"
                    />
                  </View>
                  <View className="flex-row gap-[18px] items-center">
                    <Text
                      style={{
                        fontFamily: 'PretendardVariable',
                        fontSize: 12,
                        fontWeight: '700',
                        color: '#FFFFFF',
                      }}
                    >
                      클래스
                    </Text>
                    <Text
                      style={{
                        fontFamily: 'PretendardVariable',
                        fontSize: 12,
                        fontWeight: '700',
                        color: '#FFFFFF',
                      }}
                    >
                      로드맵
                    </Text>
                    <Text
                      style={{
                        fontFamily: 'PretendardVariable',
                        fontSize: 12,
                        fontWeight: '700',
                        color: '#FFFFFF',
                      }}
                    >
                      AI
                    </Text>
                  </View>
                </View>

                {/* Main Content */}
                <View className="px-0 py-6 flex-col gap-4 items-center">
                  {/* Logo Section */}
                  <View className="flex-col gap-0.5 items-center">
                    <View className="w-[57px] h-[30px]">
                      <Image
                        source={{ uri: imgPtLogo1 }}
                        style={{ width: '100%', height: '100%' }}
                        resizeMode="contain"
                      />
                    </View>
                    <Text
                      className="text-xs"
                      style={{
                        fontFamily: 'Racing Sans One',
                        color: '#93c93e', // 그라데이션 대신 단색 사용
                      }}
                    >
                      Coding Personal Trainer
                    </Text>
                  </View>

                  {/* Title Section */}
                  <View className="flex-col gap-[18px] items-center">
                    <View className="flex-col items-center">
                      <Text className="bold-16 text-Text-Black_Primary text-center">
                        코딩의 시작{'\n'}CodingPT와 함께
                      </Text>
                    </View>
                    <Text
                      style={{
                        fontFamily: 'PretendardVariable',
                        fontSize: 12,
                        fontWeight: '400',
                        color: '#333333',
                        textAlign: 'center',
                      }}
                    >
                      초보자부터 취업 준비생까지 단계별 맞춤 커리큘럼
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Code Block */}
            <View className="w-full px-4">
              <View className="bg-Background-Black_Base rounded-2xl px-4 py-4">
                {/* Window Controls */}
                <View className="flex-row gap-1.5 mb-4">
                  <Image
                    source={{ uri: imgEllipse40 }}
                    style={{ width: 8, height: 8 }}
                    resizeMode="contain"
                  />
                  <Image
                    source={{ uri: imgEllipse41 }}
                    style={{ width: 8, height: 8 }}
                    resizeMode="contain"
                  />
                  <Image
                    source={{ uri: imgEllipse42 }}
                    style={{ width: 8, height: 8 }}
                    resizeMode="contain"
                  />
                </View>

                {/* Code Content */}
                <View className="flex-wrap">
                  <Text className="bold-14 text-white leading-6">
                    {`<!DOCTYPE html>\n<html lang="ko">\n<head>\n    <meta charset="UTF-8">\n    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n    <title>웹페이지 제목</title>\n</head>\n<body>\n    <h1>안녕하세요!</h1><!-- 큰 제목 -->\n    <p>이것은 첫 번째 문단입니다.</p><!-- 문단 -->\n    <p>HTML은 웹 페이지를 만드는 기본 언어입니다.</p>\n</body>\n</html>`}
                  </Text>
                </View>
              </View>
            </View>

            {/* Character Speech Bubble */}
            <View className="w-full flex-col gap-2.5 items-end pb-[110px]">
              <View className="flex-row items-center justify-end pl-4 pr-[60px]">
                <View className="bg-Background-White_Primary rounded-[15px] px-[18px] py-3 shadow-lg max-w-[80%]">
                  <Text className="semibold-15 text-Text-Black_Primary">
                    이게 뭐야..? 웹사이트는 그냥…{'\n'}누가 알아서 만들어주는 거 아니에요?
                  </Text>
                </View>
              </View>

              {/* Character Image */}
              <View className="absolute bottom-0 right-0">
                <View className="w-[160px] h-[160px] relative">
                  <Image
                    source={{ uri: img3 }}
                    style={{
                      position: 'absolute',
                      left: '50%',
                      top: '50%',
                      width: 75,
                      height: 75,
                      marginLeft: -37.5,
                      marginTop: -37.5,
                    }}
                    resizeMode="contain"
                  />
                  <Image
                    source={{ uri: img4 }}
                    style={{ width: '100%', height: '100%' }}
                    resizeMode="contain"
                  />
                </View>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

export default IntroScreen;

