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

// Screens (tabs roots)
import HomeScreen from '../screens/HomeScreen';
import LessonListScreen from '../screens/Lesson/LessonListScreen';
import MyPageScreen from '../screens/MyPageScreen';

// Screens (stack details)
import StoreScreen from '../screens/StoreScreen';
import LessonDetailScreen from '../screens/Lesson/LessonDetailScreen';
import ClassProgressScreen from '../screens/Lesson/classProgressScreen';
import LessonLearningScreen from '../screens/Lesson/LessonLearningScreen';
import LessonReportPage from '../screens/Lesson/LessonReportPage';
import LessonOutlineScreen from '../screens/Lesson/LessonOutlineScreen';

import type {
  RootStackParamList,
  HomeStackParamList,
  LearnStackParamList,
  StoreStackParamList,
  MyStackParamList,
  TabsParamList
} from './types';

const RootStack = createNativeStackNavigator<RootStackParamList>();
const HomeStack = createNativeStackNavigator<HomeStackParamList>();
const LearnStack = createNativeStackNavigator<LearnStackParamList>();
const StoreStack = createNativeStackNavigator<StoreStackParamList>();
const MyStack = createNativeStackNavigator<MyStackParamList>();
const Tab = createBottomTabNavigator<TabsParamList>();

/** -------------------------------------------------------
 * 공통 스택 옵션
 * ----------------------------------------------------- */
const commonStackScreenOptions: NativeStackNavigationOptions = {
  headerLargeTitle: Platform.OS === 'ios',
  headerShadowVisible: false,
  headerTitleAlign: Platform.OS === 'android' ? 'left' : undefined,
  animation: 'slide_from_right',
  headerShown: false,
};

/** -------------------------------------------------------
 * Tab 디자인 토큰: 활성/비활성 색상, 바 높이 등
 * ----------------------------------------------------- */
const COLORS = {
    active: '#FFC700',
    inactive: '#606060',
    border: '#E5E7EB', // tailwind border-gray-200
    bg: '#FFFFFF',
    indicator: '#FFC700',
  };
  const SIZES = {
    barHeight: 60,
    icon: 24,
  };

/** -------------------------------------------------------
 * Tab 아이콘 어댑터
 * - react-navigation이 넘겨주는 color/size를 Svg에 매핑
 * - SvgIcon이 color 또는 stroke/fill을 받는 경우를 모두 대비
 * ----------------------------------------------------- */
type IconComp = React.ComponentType<any>;
type RootTabItem = { name: keyof TabsParamList; label: string; Icon: IconComp };

const ROOT_TABS: RootTabItem[] = [
  { name: 'home', label: '홈', Icon: Home },
  { name: 'myLessons', label: '내 레슨', Icon: MyLessons },
  { name: 'store', label: '상점', Icon: Store },
  { name: 'my', label: '마이', Icon: My },
];


// Tab.Item
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
    >
      <item.Icon
        width={SIZES.icon}
        height={SIZES.icon}
        color={color}
        stroke={color}
        fill={active ? color : 'none'}
      />
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

// TabBar 전체
function CustomTabBar({ state, navigation }: any) {
  return (
    <View
      className="flex-row border-t"
      style={{
        backgroundColor: COLORS.bg,
        borderTopColor: COLORS.border,
        height: SIZES.barHeight,
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

/** -------------------------------------------------------
 * 개별 스택
 * ----------------------------------------------------- */
function HomeStackNavigator() {
  return (
    <HomeStack.Navigator screenOptions={commonStackScreenOptions}>
      <HomeStack.Screen name="HomeScreen" component={HomeScreen} />
      <HomeStack.Screen name="LessonDetail" component={LessonDetailScreen} />
      <HomeStack.Screen name="ClassProgress" component={ClassProgressScreen} />
      <HomeStack.Screen name="LessonLearning" component={LessonLearningScreen} />
      <HomeStack.Screen name="LessonReport" component={LessonReportPage} />
      <HomeStack.Screen name="LessonOutline" component={LessonOutlineScreen} />
    </HomeStack.Navigator>
  );
}
function LearnStackNavigator() {
  return (
    <LearnStack.Navigator screenOptions={commonStackScreenOptions}>
      <LearnStack.Screen name="LearnHome" component={LessonListScreen} options={{ title: '내 레슨' }} />
      <LearnStack.Screen name="LessonDetail" component={LessonDetailScreen} />
      <LearnStack.Screen name="ClassProgress" component={ClassProgressScreen} />
      <LearnStack.Screen name="LessonLearning" component={LessonLearningScreen} />
      <LearnStack.Screen name="LessonReport" component={LessonReportPage} />
      <LearnStack.Screen name="LessonOutline" component={LessonOutlineScreen} />
      <LearnStack.Screen name="Store" component={StoreScreen} />
    </LearnStack.Navigator>
  );
}
function StoreStackNavigator() {
  return (
    <StoreStack.Navigator screenOptions={commonStackScreenOptions}>
      <StoreStack.Screen name="StoreHome" component={StoreScreen} options={{ title: '상점' }} />
      <StoreStack.Screen name="LessonDetail" component={LessonDetailScreen} />
    </StoreStack.Navigator>
  );
}
function MyStackNavigator() {
  return (
    <MyStack.Navigator screenOptions={commonStackScreenOptions}>
      <MyStack.Screen name="MyHome" component={MyPageScreen} options={{ title: '마이' }} />
      <MyStack.Screen name="Store" component={StoreScreen} />
    </MyStack.Navigator>
  );
}

/** -------------------------------------------------------
 * 탭 네비게이터
 * - route.name으로 아이콘 매핑 (중앙집중 관리)
 * - 색상: 활성/비활성 지정
 * ----------------------------------------------------- */
function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={{ headerShown: false, tabBarStyle: { display: 'none' } }}
      tabBar={(props) => <CustomTabBar {...props} />}
      backBehavior="history"
    >
      <Tab.Screen name="home" component={HomeStackNavigator} />
      <Tab.Screen name="myLessons" component={LearnStackNavigator} />
      <Tab.Screen name="store" component={StoreStackNavigator} />
      <Tab.Screen name="my" component={MyStackNavigator} />
    </Tab.Navigator>
  );
}

export default function RootNavigator() {
  const theme = {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      background: 'white',
    },
  };

  return (
    <NavigationContainer theme={theme}>
      <RootStack.Navigator screenOptions={{ animation: 'fade' }}>
        <RootStack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
      </RootStack.Navigator>
    </NavigationContainer>
  );
}