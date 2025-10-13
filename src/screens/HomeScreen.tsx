import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ScrollView, TouchableOpacity, Text, View, FlatList, Image, Alert } from 'react-native';
import LessonCard from '../components/LessonCard';
import { useUser } from '../contexts/UserContext';
import { useLesson } from '../contexts/LessonContext';
import { useHearts } from '../contexts/HeartContext';
import { useStore } from '../contexts/StoreContext';
import { getColorByCount, getRecentDays } from '../utils/heatmapUtils';
import { getIconByTitle, parseLessonList } from '../utils/lessonUtils';
import { AnimatedCircularProgress } from 'react-native-circular-progress';
import { CodesandboxLogo, Clover, HeartStraight, Check, CaretRight } from '../assets/SvgIcon';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DefaultIconTextBtn from '../components/Button/DefaultIconTextBtn';
import HeartModal from '../components/Modal/HeartModal';

import { CompositeNavigationProp, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { HomeTabStackParamList, TabsParamList, RootStackParamList } from '../navigation/types';


type HomeNav = CompositeNavigationProp<
  NativeStackNavigationProp<RootStackParamList>,
  CompositeNavigationProp<
    NativeStackNavigationProp<HomeTabStackParamList, 'HomeScreen'>,
    BottomTabNavigationProp<TabsParamList>
  >
>;

type Props = {
  navigation: HomeNav;
};

// 강의 항목 타입
interface Lesson {
  id: string;
  title: string;
  icon: any;
  progress: number;
}

const HomeScreen: React.FC<Props> = ({ navigation }) => {
  // const { navigate } = useNavigation();
  const { user } = useUser();
  const { lessons, setActiveProduct } = useLesson();
  const { storeData } = useStore();
  // HomeScreen 컴포넌트 내부 (return 위)
  const { hearts, secondsToRefill } = useHearts(); // 하트 상태/남은시간
  console.log(hearts);
  const [heartModalOpen, setHeartModalOpen] = useState(false);

  // 남은 시간 MM:SS 포맷(hearts<5일 때만 표시)
  const mmss = secondsToRefill != null
  ? `${String(Math.floor(secondsToRefill / 60)).padStart(2, '0')}:${String(secondsToRefill % 60).padStart(2, '0')}`
  : null;
  
  // UserContext의 heatmap 데이터에서 직접 최근 6일 데이터 계산
  const recentCounts = user?.heatmap ? getRecentDays(user.heatmap, 6) : Array(6).fill(0);

  // 기존 lessonUtils 함수들을 활용하여 최근 학습 강의 정보 생성
  const parsedLessons = useMemo(() => parseLessonList(lessons), [lessons]);
  
  // 최근 학습 강의 정보 (AsyncStorage에서 가져오거나 첫 번째 강의 사용)
  const [recentLessonInfo, setRecentLessonInfo] = useState<{
    productId: number;
    productName: string;
    icon: any;
    progress: number;
  } | null>(null);

  // 진행 중인 클래스 (진행율 100 미만인 상품 2개만)
  const inProgressLessons = useMemo(() => {
    const parsed = parseLessonList(lessons);
    return parsed
      .filter(lesson => lesson.progress < 100)
      .slice(0, 2)
      .map(lesson => ({
        id: lesson.id,
        title: lesson.title,
        icon: getIconByTitle(lesson.title),
        progress: lesson.progress,
      }));
  }, [lessons]);

  // 신규 상품 (mvp용: product.id가 1, 3, 5인 것만) - 모든 상품에서 가져오기
  const newProducts = useMemo(() => {
    // storeData에서 모든 상품을 평면화
    const allProducts = storeData.flatMap(category => category.Products || []);
    
    return allProducts
      .filter(product => [1, 3, 5].includes(product.id))
      .map(product => ({
        id: product.id,
        title: product.name,
        description: product.description,
        icon: getIconByTitle(product.name),
        price: product.price,
      }));
  }, [storeData]);

  // 최근 학습 정보 로드 (기존 lessonUtils 함수 활용)
  const loadRecentLessonInfo = async () => {
    try {
      const recentLessonData = await AsyncStorage.getItem('recentLesson');
      
      if (recentLessonData) {
        // 저장된 최근 학습 데이터가 있으면 해당 정보 사용
        const { productId } = JSON.parse(recentLessonData);
        const product = lessons.find(p => p.id === productId);
        
        if (product) {
          // 기존 parseLessonList 함수로 진행률 계산
          const parsedProduct = parseLessonList([product])[0];
          
          setRecentLessonInfo({
            productId: product.id,
            productName: product.name,
            icon: getIconByTitle(product.name), // 기존 getIconByTitle 함수 활용
            progress: parsedProduct.progress
          });
          return;
        }
      }

      // 최근 학습 정보가 없으면 첫 번째 강의 정보 사용
      if (parsedLessons && parsedLessons.length > 0) {
        const firstLesson = parsedLessons[0];
        const firstProduct = lessons.find(p => p.id === Number(firstLesson.id));
        
        if (firstProduct) {
          setRecentLessonInfo({
            productId: firstProduct.id,
            productName: firstProduct.name,
            icon: getIconByTitle(firstProduct.name), // 기존 getIconByTitle 함수 활용
            progress: firstLesson.progress
          });
        }
      }
    } catch (error) {
      console.error('최근 학습 정보 로딩 오류:', error);
    }
  };

  // lessons가 변경될 때마다 최근 학습 정보 업데이트
  useEffect(() => {
    loadRecentLessonInfo();
  }, [lessons]);

  // 화면 포커스될 때마다 즉시 갱신
  useFocusEffect(
    useCallback(() => {
      loadRecentLessonInfo();
      return () => {};
    }, [lessons])
  );

  // 최근 학습한 강의로 이동하는 함수
  const goToRecentLesson = async () => {
    try {
      // 1. AsyncStorage에서 최근 학습 정보 확인
      const recentLessonData = await AsyncStorage.getItem('recentLesson');
      
      if (recentLessonData) {
        // 저장된 최근 학습 데이터가 있으면 해당 정보로 이동
        const { productId, productName } = JSON.parse(recentLessonData);
        setActiveProduct(productId);
        // 최근 접속 시각 갱신
        await AsyncStorage.setItem('recentLesson', JSON.stringify({
          productId,
          productName: productName ?? recentLessonInfo?.productName,
          timestamp: new Date().toISOString(),
        }));
        navigation.navigate('LessonFlow', { screen: 'ClassProgress', params: { productId } });
        return;
      }

      // 2. AsyncStorage에 데이터가 없으면 Context의 첫 번째 강의 사용
      if (lessons && lessons.length > 0) {
        const firstProduct = lessons[0];
        setActiveProduct(firstProduct.id);
        
        // 최근 학습 정보로 저장
        await AsyncStorage.setItem('recentLesson', JSON.stringify({
          productId: firstProduct.id,
          productName: firstProduct.name,
          timestamp: new Date().toISOString()
        }));
        
        // recentLessonInfo 업데이트
        await loadRecentLessonInfo();
        
        navigation.navigate('LessonFlow', { screen: 'ClassProgress', params: { productId: firstProduct.id } });
        return;
      }

      // 3. 강의가 없으면 상점페이지로 이동
      Alert.alert(
        '알림', 
        '수강 중인 강의가 없습니다.\n상점에서 강의를 구매해 주세요.',
        [
          { text: '취소', style: 'cancel' },
          { text: '상점 둘러보기', onPress: () => navigation.navigate('Tabs', { screen: 'store', params: { screen: 'StoreScreen' } }) }
        ]
      );
      
    } catch (error) {
      console.error('최근 학습 데이터 로딩 오류:', error);
      Alert.alert('오류', '학습 데이터를 불러오는 중 오류가 발생했습니다.');
    }
  };

  // 학습 중인 클래스 클릭 핸들러
  const handleLessonClick = async (lesson: Lesson) => {
    try {
      const productId = Number(lesson.id);
      setActiveProduct(productId);
      // 최근 학습 정보 저장
      await AsyncStorage.setItem('recentLesson', JSON.stringify({
        productId,
        productName: lesson.title,
        timestamp: new Date().toISOString(),
      }));
      navigation.navigate('LessonFlow', { screen: 'ClassProgress', params: { productId } });
    } catch (error) {
      console.error('클래스 이동 오류:', error);
    }
  };

  // 신규 상품 클릭 핸들러
  const handleNewProductClick = async (product: { id: number; title: string; description: string; icon: any; price: number }) => {
    try {
      navigation.navigate('LessonFlow', {
        screen: 'LessonDetail',
        params: {
          id: product.id,
          name: product.title,
          icon: product.icon,
          description: product.description,
          price: product.price,
        },
      });
    } catch (error) {
      console.error('신규 상품 이동 오류:', error);
    }
  };

  // 학습 중인 클래스 구조
  const renderLesson = ({ item }: { item: Lesson }) => (
    <TouchableOpacity
      className="flex-row items-center bg-white border border-[#CCCCCC] rounded-[16px] p-[10px] mt-[10px]"
      onPress={() => handleLessonClick(item)}
      activeOpacity={0.7}
    >
      <Image 
        source={item.icon} 
        className="w-[70px] h-[70px] mr-3.5" 
        resizeMode="contain" 
      />
      <View className="flex-1 flex-col justify-between" style={{ minHeight: 60 }}>
        <Text className="text-[16px] font-bold text-[#111111]">{item.title}</Text>
        <View className="h-2.5 rounded-full bg-[#F5F5F5] mt-0.5">
          <View
            className="h-2.5 rounded-full bg-[#FFC700]"
            style={{ width: `${item.progress}%` }}
          />
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <>
      {/* 헤더 */}
      <View className="flex-row justify-between items-center pl-4 pr-4 border-b border-[#CCCCCC]">
        <Image 
          source={require('../assets/icons/codingpt_logo_text.png')} 
          className="w-[133px]" 
          resizeMode="contain"
        />
        <View className="flex-row items-center gap-x-[10px]">
          {/* 커스텀 모달 테스트 버튼 */}
          {/* <TouchableOpacity
            className="bg-[#3B82F6] rounded-[8px] px-3 py-2"
            onPress={() => navigation.navigate('LessonFlow', { screen: 'ModalFadeTest' })}
            activeOpacity={0.7}
          >
            <Text className="text-white text-[12px] font-bold">커스텀모달</Text>
          </TouchableOpacity> */}
          
          <View className="flex-row items-center gap-x-[5px]">
            <Clover width={34} height={34} fill="#58CC02" />
            <Text className="text-[#58CC02] text-[18px] font-bold">{user?.studyDays ?? 0}</Text>
          </View>
          {/* 하트 ❤️ */}
          <TouchableOpacity
            className="flex-row items-center gap-x-[5px]"
            onPress={() => setHeartModalOpen(true)}
            activeOpacity={0.7}
          >
            <HeartStraight width={34} height={34} fill="#EE5555" />
            <View className="flex-col items-start">
              <Text className="text-[#EE5555] text-[18px] font-bold">{hearts}</Text>
              {/* hearts<5일 때만 MM:SS 보이기 */}
              {/* {hearts < 5 && mmss && (
                <Text className="text-[10px] text-[#606060]">{mmss}</Text>
              )} */}
            </View>
          </TouchableOpacity>
        </View>
      </View>
      <ScrollView className="flex-1 bg-white">
        {/***** 최근 레슨 학습하러 가기: 최근 학습이 없으면 상점으로 이동 *****/}
         <View className="items-center px-[16px] mt-[25px]">
           <View className="flex-row items-center bg-white p-4 gap-x-[20px]">
             <Image
               source={recentLessonInfo?.icon || require('../assets/icons/codingpt_logo_01.png')}
               className="w-[120px] h-[120px]"
               resizeMode="contain"
             />
             {/* 진행률 그래프 */}
             <View className="flex-1 items-center">
               <View className="flex-1 justify-center items-center bg-white">
                 <AnimatedCircularProgress
                   size={60} // 차트 너비/높이
                   width={2} // 진행률 바의 두께
                   fill={recentLessonInfo?.progress || 0} // 진행률 (0-100)
                   tintColor="#58CC02" // 진행된 부분의 색상
                   backgroundColor="#CCCCCC" // 미진행된 부분의 색상
                   rotation={0} // 원형의 시작 위치 (0 = 12시 방향)
                   lineCap="round" // 바의 끝 모양을 둥글게
                   duration={1500} // 애니메이션 지속 시간 (1.5 sec)
                 >
                   {
                     (fill: number) => (
                       <Text className="text-[#58CC02] text-[24px] font-bold">
                         {`${Math.round(fill)}`}
                       </Text>
                     )
                   }
                 </AnimatedCircularProgress>
               </View>
               <Text className="text-[24px] font-bold text-[#111111] mt-[10px]">
                 {recentLessonInfo?.productName || '강의를 선택해주세요'}
               </Text>
               <Text className="text-[14px] text-[#111111] mt-[10px] text-center">
                 {recentLessonInfo 
                   ? '계속해서 학습을 진행해보세요!' 
                   : 'Web 개발을 처음 접하는 사람도\n학습할 수 있어요!'
                 }
               </Text>
             </View>
           </View>
          {/* 학습하러 가기 버튼 */}
          <View className="items-center mt-[14px] mb-[28px]">
            <DefaultIconTextBtn
              onPress={goToRecentLesson}
              text="학습하러 가기"
              icon={<CodesandboxLogo width={40} height={40} fill="#ffffff" />}
              buttonClassName="bg-[#93D333] w-[236px] h-[46px] rounded-[50px] py-3 px-6 flex-row items-center justify-center"
              textClassName="text-white text-[18px] font-bold"
              iconClassName="mr-[10px]"
              enableHapticFeedback={true}
              enableSound={true}
              flex={false}
            />
          </View>
        </View>

        {/***** 학습 기록 *****/}
        <View className="flex-row items-center mt-[10px] mb-[10px] px-[10px]">
          <Text className="text-[16px] font-semibold text-[#111111] mr-[15px]">학습 기록</Text>
          <View className="flex-row gap-x-[10px]">
            {recentCounts.map((count, index) => (
              <View
                key={index}
                className="w-[38px] h-[38px] rounded-full justify-center items-center"
                style={{ backgroundColor: getColorByCount(count) }}
              >
                {count > 0 && (
                  <View className="flex-1 justify-center items-center">
                    <Check width={21} height={17} fill="#58CC02" />
                  </View>
                )}
              </View>
            ))}
          </View>
            <TouchableOpacity
              className="ml-auto"
              onPress={() => navigation.navigate('Tabs', { screen: 'my', params: { screen: 'MyHome' } })}
            >
              <CaretRight width={10} height={18} fill="#CCCCCC" />
            </TouchableOpacity>
        </View>

        {/* 학습 중인 클래스 */}
        <View className="mt-[10px] px-[10px]">
          <View className="flex-row justify-between items-center">
            <Text className="text-[16px] font-semibold text-[#111111]">학습 중인 클래스</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Tabs', { screen: 'myLessons', params: { screen: 'MyLessonsScreen' } })}>
              <CaretRight width={10} height={18} fill="#CCCCCC" />
            </TouchableOpacity>
          </View>

          {/* 강의 목록 */}
          {inProgressLessons.length > 0 ? (
            <FlatList
              data={inProgressLessons}
              renderItem={renderLesson}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ paddingBottom: 10 }}
              showsVerticalScrollIndicator={false}
              scrollEnabled={false}
            />
          ) : (
            <View className="flex-row items-center bg-white border border-[#CCCCCC] rounded-[16px] p-[10px] mt-[10px]">
              <View className="flex-1 flex-col justify-center items-center" style={{ minHeight: 60 }}>
                <Text className="text-[16px] font-bold text-[#111111] text-center">
                  진행 중인 클래스가 없습니다
                </Text>
                <Text className="text-[14px] text-[#666666] text-center mt-1">
                  상점에서 새로운 강의를 구매해보세요!
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* 신규 상품 */}
        <View className="mt-[10px] px-[10px] pb-[20px]">
          <View className="flex-row justify-between items-center">
            <Text className="text-[16px] font-semibold text-[#111111]">신규 상품</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Tabs', { screen: 'store', params: { screen: 'StoreScreen' } })}>
              <CaretRight width={10} height={18} fill="#CCCCCC" />
            </TouchableOpacity>
          </View>
        
          {newProducts.length > 0 ? (
            <FlatList
              data={newProducts}
              renderItem={({ item }) => (
                <TouchableOpacity
                  className="flex-row items-center bg-white border border-[#CCCCCC] rounded-[16px] p-[10px] mt-[10px]"
                  onPress={() => handleNewProductClick(item)}
                  activeOpacity={0.7}
                >
                  <Image 
                    source={item.icon}
                    className="w-[70px] h-[70px] mr-3.5" 
                    resizeMode="contain" 
                  />
                  <View className="flex-1 flex-col justify-center" style={{ minHeight: 70 }}>
                    <Text className="text-[16px] font-bold text-[#111111] mb-1">{item.title}</Text>
                    <Text className="text-[14px] font-medium text-[#111111] leading-5">
                      {item.description?.replace(/\\n/g, '\n') || ''}
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
              keyExtractor={(item) => item.id.toString()}
              contentContainerStyle={{ paddingBottom: 10 }}
              showsVerticalScrollIndicator={false}
              scrollEnabled={false}
            />
          ) : (
            <View className="flex-row items-center bg-white border border-[#CCCCCC] rounded-[16px] p-[10px] mt-[10px]">
              <View className="flex-1 flex-col justify-center items-center" style={{ minHeight: 70 }}>
                <Text className="text-[16px] font-bold text-[#111111] text-center">
                  신규 상품이 없습니다
                </Text>
                <Text className="text-[14px] text-[#666666] text-center mt-1">
                  새로운 강의를 기다려주세요!
                </Text>
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      {/* 하트 상태 모달 */}
      <HeartModal
        visible={heartModalOpen}
        variant="info"                           // 상태 안내용
        onClose={() => setHeartModalOpen(false)} // 닫기
      />
    </>
  );
};

export default HomeScreen;