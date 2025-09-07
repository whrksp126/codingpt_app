import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, Image, ScrollView, Alert, Pressable } from 'react-native';
import { Star } from 'phosphor-react-native';
import { useUser } from '../../contexts/UserContext';
import { useStore } from '../../contexts/StoreContext';
import { useLesson } from '../../contexts/LessonContext';
import { useNavigation } from '../../contexts/NavigationContext';
import lessonService from '../../services/lessonService';
import { countSectionsAndLessons } from '../../utils/lessonUtils';
import { CaretLeft, ListNumbers, Files, SealQuestion, TerminalWindow, TreeStructure } from '../../assets/SvgIcon';
import DefaultIconBtn from '../../components/Button/DefaultIconBtn';
import DefaultBtn from '../../components/Button/DefaultBtn';
// import ClassProgressScreen from './classProgressScreen';
import ClassIntroShowcase from '../../components/ClassIntro';
import { showcaseByProductName } from '../../data/class/classIntro_data';

const LessonDetailScreen = ({ route }: any) => {
  const { user } = useUser();
  const { lessons, reloadLessons, setActiveProduct } = useLesson();
  const { productIndex } = useStore();
  const { navigate, goBack } = useNavigation();

  console.log("LessonDetailScreen route,", route);
  console.log("LessonDetailScreen user,", user);
  console.log("LessonDetailScreen lessons,", lessons);
  console.log("LessonDetailScreen productIndex,", productIndex);

  // 네비게이션 파라미터 (product)
  const { id, name, icon, description, price } = route.params as {
    id: number;
    name: string;
    icon: any;
    description: string;
    price: number;
  };

  const productId = Number(id);

  // StoreContext에서 집계값(단일 출처) 조회
  const productFromStore = productIndex.get(productId);
  const sectionCount = productFromStore?.sectionCount ?? 0; // 목차 개수
  const lessonCount = productFromStore?.lessonCount ?? 0;   // 레슨 개수

  // 수강 여부 확인
  const isEnrolled = useMemo(() => lessons.some(l => l.id === productId), [lessons, productId]);

  // 탭 구성
  const [activeTab, setActiveTab] = useState('강의소개');
  const tabs = ['강의소개', '목차', '관련상품', '후기'];

  // 상세 화면에서 재사용할 route payload (최소)
  const item = { id: productId, name, icon, description, price };

  // 수강 등록 핸들러
  const handleEnroll = async () => {
    try {
      const registered = await lessonService.postMyclass(user!.id, id);
      if (registered) {
        await reloadLessons(); // ✅ 즉시 반영
        setActiveProduct(productId);     // ✅ 선택 상태 저장
        navigate('classProgress');
        
      } else {
        Alert.alert('수강 등록 실패');
      }
    } catch (err) {
      console.error(err);
      Alert.alert('오류', '수강 등록 중 문제가 발생했습니다.');
    }
  };

  const goStudy = () => {
    setActiveProduct(productId);         // ✅ 선택 상태 저장
    navigate('classProgress');
  };

  return (
    <View className="flex-1 bg-white">
      <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
        {/* 상단 헤더: 뒤로가기 버튼 */}
        <View className="flex-row items-center justfy-between bg-white px-[20px] pt-[20px] pb-[20px] gap-x-[20px]">
          <DefaultIconBtn
            onPress={() => goBack()}
            size={35}
            enableHapticFeedback={true}
            enableSound={true}
            pressScale={0.85}
            pressOpacity={0.6}
            bounceScale={1.15}
            className="mt-[5px]"
          >
            <CaretLeft width={35} height={35} fill="#CCCCCC" />
          </DefaultIconBtn>
          <Text className="text-[22px] font-bold text-[#111111]">{name}</Text>
        </View>

        {/* 강의 기본 정보 */}
        <View className="px-[16px] py-[20px]">
          <View className="flex-row items-center gap-x-[10px]">
            <Image source={icon} className="w-[50px] h-[50px] mt-1" resizeMode="contain" />
            <Text className="text-[27px] font-bold text-black">{name}</Text>
          </View>
          <Text className="text-[15px] text-[#606060] mt-1">{description.replace(/\\n/g, ' ')}</Text>
          <View className="border border-[#CCCCCC] rounded-[16px] px-[40px] py-[10px] my-[30px]">
            <View className="flex-row justify-between items-center">
              {[
                { label: '목차', value: sectionCount, icon: <ListNumbers width={18} height={18} fill="#000000" /> },
                { label: '레슨', value: lessonCount, icon: <Files width={18} height={18} fill="#000000" /> },
                { label: '퀴즈', value: 60, icon: <SealQuestion width={18} height={18} fill="#000000" /> },
                { label: '코드 실습', value: 60, icon: <TerminalWindow width={18} height={18} fill="#000000" /> },
                { label: '프로젝트', value: 0, icon: <TreeStructure width={18} height={18} fill="#000000" /> },
              ].map((item, idx) => (
                <View key={idx} className="items-center flex-1">
                  <View className="mb-[6px]">{item.icon}</View>
                  <Text className="text-[10px] font-medium text-[#777777]">{item.label}</Text>
                  <Text className="text-[10px] font-medium text-[#58CC02] mt-1">{item.value}개</Text>
                </View>
              ))}
            </View>
          </View>
          {/* 학습하기 버튼 */}
          <View className="mb-[30px]">
            <DefaultBtn
              onPress={() => {
                if (isEnrolled) {
                  setActiveProduct(productId);      // ✅ 선택 상태 저장
                  navigate('classProgress');
                } else {
                  handleEnroll();
                }
              }}
              text={isEnrolled ? '이어서 학습하기' : '수강신청하기'}
              buttonClassName="bg-[#58CC02] rounded-[10px] py-[15px] px-6 flex-row items-center justify-center"
              textClassName="text-white text-[18px] font-bold mt-[-3px]"
              enableHapticFeedback={true}
              enableSound={true}
              flex={false}
            />
          </View>
          <View className="flex-row items-center space-x-1">
            {/* 별 아이콘 5개 */}
            {Array.from({ length: 5 }).map((_, idx) => (
              <Star key={idx} size={16} color="#cccccc" weight="fill" /> //FFC700
            ))}

            {/* 평점, 후기, 수강생 */}
            <Text className="text-[10px] text-black ml-[5px] pb-[4px]">
              <Text className="underline">(0) 후기 0개</Text>{' '}
              {/* <Text className="">수강생 3,000명</Text> */}
            </Text>
          </View>
          <Text className="font-bold text-[27px]">{price.toLocaleString()}원</Text>
        </View>

        {/* 탭 메뉴 */}
        <View className="flex-row border-b border-[#CCCCCC]">
          {tabs.map((tab) => {
            const isActive = activeTab === tab;
            return (
              <TouchableOpacity
                key={tab}
                className={`flex-1 items-center py-3 ${isActive ? 'border-b-2 border-[#58CC02]' : ''}`}
                onPress={() => setActiveTab(tab)}
              >
                <Text className={`text-[18px] font-semibold ${isActive ? 'text-[#58CC02]' : 'text-black'}`}>
                  {tab}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* 탭 내용 */}
        <View className="px-4 py-6">
          {activeTab === '강의소개' && (
            <ClassIntroShowcase blocks={showcaseByProductName(name)} />
          )}
          {activeTab === '목차' && (
            <Text className="text-sm text-gray-600">목차 내용이 여기에 들어갑니다.</Text>
          )}
          {activeTab === '관련상품' && (
            <Text className="text-sm text-gray-600">관련 코스 정보가 여기에 들어갑니다.</Text>
          )}
          {activeTab === '후기' && (
            <Text className="text-sm text-gray-600">등록된 후기가 없습니다.</Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
};

export default LessonDetailScreen;