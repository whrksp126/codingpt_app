import React, { memo } from 'react';
import { Platform, Text, TouchableOpacity, View } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import {
  createNativeStackNavigator,
  type NativeStackNavigationOptions,
} from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

// Assets
import { Home, MyLessons, Store, My } from '../assets/SvgIcon';

// Screens (탭 루트)
import HomeScreen from '../screens/HomeScreen';
import LessonListScreen from '../screens/Lesson/LessonListScreen';
import MyPageScreen from '../screens/MyPageScreen';
import StoreScreen from '../screens/StoreScreen';

// Screens (공유 상세/학습 플로우)
import LessonDetailScreen from '../screens/Lesson/LessonDetailScreen';
import ClassProgressScreen from '../screens/Lesson/classProgressScreen';
import LessonLearningScreen from '../screens/Lesson/LessonLearningScreen';
import LessonReportPage from '../screens/Lesson/LessonReportPage';
import LessonOutlineScreen from '../screens/Lesson/LessonOutlineScreen';

// 타입
import type {
  RootStackParamList,
  TabsParamList,
  HomeTabStackParamList,
  LearnTabStackParamList,
  StoreTabStackParamList,
  MyTabStackParamList,
  LessonFlowStackParamList,
} from './types';

/** ----------------------------------------------------------------
 * 네비게이터 인스턴스
 * -------------------------------------------------------------- */
const RootStack = createNativeStackNavigator<RootStackParamList>();
const LessonFlowStack = createNativeStackNavigator<LessonFlowStackParamList>();
const HomeTabStack = createNativeStackNavigator<HomeTabStackParamList>();
const LearnTabStack = createNativeStackNavigator<LearnTabStackParamList>();
const StoreTabStack = createNativeStackNavigator<StoreTabStackParamList>();
const MyTabStack = createNativeStackNavigator<MyTabStackParamList>();
const Tab = createBottomTabNavigator<TabsParamList>();

/** ----------------------------------------------------------------
 * 공통 스택 옵션
 * - 헤더는 화면에서 개별적으로 쓰지 않으니 기본 비표시
 * - iOS 큰 타이틀 비활성(원하면 켜도 됨)
 * -------------------------------------------------------------- */
const commonStackScreenOptions: NativeStackNavigationOptions = {
  headerShown: false,
  headerLargeTitle: false,
  animation: 'slide_from_right',
  headerShadowVisible: false,
  headerTitleAlign: Platform.OS === 'android' ? 'left' : undefined,
};

/** ----------------------------------------------------------------
 * Tab 디자인 토큰 (고정 높이, SafeArea 미사용)
 * -------------------------------------------------------------- */
const COLORS = {
  active: '#FFC700',
  inactive: '#606060',
  border: '#E5E7EB', // TW border-gray-200
  bg: '#FFFFFF',
  indicator: '#FFC700',
};
const SIZES = {
  barHeight: 60, // ✅ 고정 높이
  icon: 24,
};

/** ----------------------------------------------------------------
 * Tab 아이콘 어댑터
 * -------------------------------------------------------------- */
type IconComp = React.ComponentType<any>;
type RootTabItem = { name: keyof TabsParamList; label: string; Icon: IconComp };

const ROOT_TABS: RootTabItem[] = [
  { name: 'home', label: '홈', Icon: Home },
  { name: 'myLessons', label: '내 레슨', Icon: MyLessons },
  { name: 'store', label: '상점', Icon: Store },
  { name: 'my', label: '마이', Icon: My },
];

const TabItem = memo(function TabItem({
  item,
  active,
  onPress,
}: {
  item: RootTabItem;
  active: boolean;
  onPress: () => void;
}) {
  const color = active ? COLORS.active : COLORS.inactive;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={item.label}
      className="flex-1 items-center justify-center"
      // ⚠️ SafeAreaInsets 사용 안 함: 고정 높이 유지
    >
      <item.Icon width={SIZES.icon} height={SIZES.icon} color={color} stroke={color} fill={active ? color : 'none'} />
      <Text className={`text-[10px] mt-1 ${active ? 'font-semibold' : ''}`} style={{ color }}>
        {item.label}
      </Text>

      {/* 활성 탭 하단 인디케이터 */}
      <View
        className="absolute bottom-0 rounded-full"
        style={{
          width: active ? 20 : 0,
          height: 2,
          backgroundColor: active ? COLORS.indicator : 'transparent',
        }}
      />
    </TouchableOpacity>
  );
});

function CustomTabBar({ state, navigation }: any) {
  return (
    <View
      className="flex-row border-t"
      style={{
        backgroundColor: COLORS.bg,
        borderTopColor: COLORS.border,
        height: SIZES.barHeight, // ✅ 고정 높이
        paddingHorizontal: 10,
      }}
    >
      {ROOT_TABS.map((t) => {
        const routeIndex = state.routes.findIndex((r: any) => r.name === t.name);
        const isActive = state.index === routeIndex;
        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: state.routes[routeIndex].key,
            canPreventDefault: true,
          });
          if (!isActive && !event.defaultPrevented) {
            navigation.navigate(t.name);
          }
        };
        return <TabItem key={t.name} item={t} active={isActive} onPress={onPress} />;
      })}
    </View>
  );
}

/** ----------------------------------------------------------------
 * 탭 내부 스택들 (루트는 얕게 유지)
 * - 상세/학습 화면은 절대 여기 넣지 않음!
 * -------------------------------------------------------------- */
function HomeTabNavigator() {
  return (
    <HomeTabStack.Navigator screenOptions={commonStackScreenOptions}>
      <HomeTabStack.Screen name="HomeScreen" component={HomeScreen} />
      {/* ⚠️ 상세/학습 화면은 Root의 LessonFlow 에만 둡니다. */}
    </HomeTabStack.Navigator>
  );
}
function LearnTabNavigator() {
  return (
    <LearnTabStack.Navigator screenOptions={commonStackScreenOptions}>
      <LearnTabStack.Screen name="MyLessonsScreen" component={LessonListScreen} />
    </LearnTabStack.Navigator>
  );
}
function StoreTabNavigator() {
  return (
    <StoreTabStack.Navigator screenOptions={commonStackScreenOptions}>
      <StoreTabStack.Screen name="StoreScreen" component={StoreScreen} />
    </StoreTabStack.Navigator>
  );
}
function MyTabNavigator() {
  return (
    <MyTabStack.Navigator screenOptions={commonStackScreenOptions}>
      <MyTabStack.Screen name="MyHome" component={MyPageScreen} />
    </MyTabStack.Navigator>
  );
}

/** ----------------------------------------------------------------
 * 전역 공유 레슨 플로우 (어디서든 push)
 * - 어떤 탭에서 들어오든 동일한 스택을 쌓기 위함
 * - fromTab 등의 메타를 params 로 받아서 뒤로가기 정책에 활용 가능
 * -------------------------------------------------------------- */
function LessonFlowNavigator() {
  return (
    <LessonFlowStack.Navigator screenOptions={commonStackScreenOptions}>
      <LessonFlowStack.Screen name="LessonDetail" component={LessonDetailScreen} />
      <LessonFlowStack.Screen name="ClassProgress" component={ClassProgressScreen} />
      <LessonFlowStack.Screen name="LessonLearning" component={LessonLearningScreen} />
      <LessonFlowStack.Screen name="LessonReport" component={LessonReportPage} />
      <LessonFlowStack.Screen name="LessonOutline" component={LessonOutlineScreen} />
    </LessonFlowStack.Navigator>
  );
}

/** ----------------------------------------------------------------
 * 탭 네비게이터
 * -------------------------------------------------------------- */
function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={{ headerShown: false, tabBarStyle: { display: 'none' } }}
      backBehavior="history"
      tabBar={(props) => <CustomTabBar {...props} />}
    >
      <Tab.Screen name="home" component={HomeTabNavigator} />
      <Tab.Screen name="myLessons" component={LearnTabNavigator} />
      <Tab.Screen name="store" component={StoreTabNavigator} />
      <Tab.Screen name="my" component={MyTabNavigator} />
    </Tab.Navigator>
  );
}

/** ----------------------------------------------------------------
 * 루트 스택
 * - Tabs (하단 탭)
 * - LessonFlow (전역 공유 상세/학습 플로우)
 * -------------------------------------------------------------- */
export default function RootNavigator() {
  const theme = {
    ...DefaultTheme,
    colors: { ...DefaultTheme.colors, background: 'white' },
  };

  return (
    <NavigationContainer theme={theme}>
      <RootStack.Navigator screenOptions={{ animation: 'slide_from_right', headerShown: false }}>
        <RootStack.Screen name="Tabs" component={Tabs} />
        {/* ✅ 전역 공유 레슨 플로우 (항상 Tabs 위로 push) */}
        <RootStack.Screen name="LessonFlow" component={LessonFlowNavigator} />
      </RootStack.Navigator>
    </NavigationContainer>
  );
}