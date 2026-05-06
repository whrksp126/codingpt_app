import React, { memo, useEffect } from 'react';
import { Platform, Text, TouchableOpacity, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { useTheme } from '../contexts/ThemeContext';
import {
  createNativeStackNavigator,
  type NativeStackNavigationOptions,
} from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { haptic } from '../animations/haptics';
import { SPRING_TIGHT } from '../animations/presets';

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
import LessonLearningScreenV5 from '../screens/Lesson/LessonLearningScreenV5';
import LessonReportPage from '../screens/Lesson/LessonReportPage';
import LessonOutlineScreen from '../screens/Lesson/LessonOutlineScreen';
import HtmlLessonScreen from '../screens/Lesson/HtmlLessonScreen';
import SettingScreen from '../screens/Settings/SettingScreen';
import MyReviewsScreen from '../screens/Settings/MyReviewsScreen';
import ThemeScreen from '../screens/Settings/ThemeScreen';

// modals
import BaseModal from '../components/Modal/BaseModal';

// 타입
import type {
  RootStackParamList,
  TabsParamList,
  HomeTabStackParamList,
  LearnTabStackParamList,
  StoreTabStackParamList,
  MyTabStackParamList,
  LessonFlowStackParamList,
  SettingsFlowStackParamList,
} from './types';

/** ----------------------------------------------------------------
 * 모달 래퍼 컴포넌트 (네비게이션 호환)
 * -------------------------------------------------------------- */
function BaseModalScreen() {
  return (
    <BaseModal
      visible={true}
      onClose={() => { }}
      children={<></>}
    />
  );
}

/** ----------------------------------------------------------------
 * 네비게이터 인스턴스
 * -------------------------------------------------------------- */
const RootStack = createNativeStackNavigator<RootStackParamList>();
const LessonFlowStack = createNativeStackNavigator<LessonFlowStackParamList>();
const SettingsFlowStack = createNativeStackNavigator<SettingsFlowStackParamList>();
const HomeTabStack = createNativeStackNavigator<HomeTabStackParamList>();
const LearnTabStack = createNativeStackNavigator<LearnTabStackParamList>();
const StoreTabStack = createNativeStackNavigator<StoreTabStackParamList>();
const MyTabStack = createNativeStackNavigator<MyTabStackParamList>();
const Tab = createBottomTabNavigator<TabsParamList>();

/** ----------------------------------------------------------------
 * 공통 스택 옵션
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
const COLORS_LIGHT = {
  active: '#FFC700',
  inactive: '#606060',
  border: '#E5E7EB', // TW border-gray-200
  bg: '#FFFFFF',
};
const COLORS_DARK = {
  active: '#FFC700',
  inactive: '#9CA3AF',
  border: '#3F444D',
  bg: '#0A0D14',
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
  palette,
}: {
  item: RootTabItem;
  active: boolean;
  onPress: () => void;
  palette: typeof COLORS_LIGHT;
}) {
  const progress = useSharedValue(active ? 1 : 0);
  const scale = useSharedValue(1);

  useEffect(() => {
    progress.value = withTiming(active ? 1 : 0, { duration: 220 });
  }, [active, progress]);

  const indicatorStyle = useAnimatedStyle(() => ({
    width: progress.value * 20,
    height: 2,
    backgroundColor: palette.active,
  }));

  const iconWrapStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const labelColor = active ? palette.active : palette.inactive;
  const iconColor = active ? palette.active : palette.inactive;

  const handlePress = () => {
    if (!active) {
      scale.value = withSpring(1.12, SPRING_TIGHT, () => {
        scale.value = withSpring(1, SPRING_TIGHT);
      });
    }
    onPress();
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.75}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={item.label}
      className="flex-1 items-center justify-center"
    >
      <Animated.View style={iconWrapStyle}>
        <item.Icon
          width={SIZES.icon}
          height={SIZES.icon}
          color={iconColor}
          stroke={iconColor}
          fill={iconColor}
        />
      </Animated.View>
      <Text
        className={`text-[10px] mt-1 ${active ? 'font-semibold' : ''}`}
        style={{ color: labelColor }}
      >
        {item.label}
      </Text>

      <Animated.View
        className="absolute bottom-0 rounded-full"
        style={indicatorStyle}
      />
    </TouchableOpacity>
  );
});

function CustomTabBar({ state, navigation }: any) {
  const { resolvedScheme } = useTheme();
  const palette = resolvedScheme === 'dark' ? COLORS_DARK : COLORS_LIGHT;
  return (
    <View
      className="flex-row border-t"
      style={{
        backgroundColor: palette.bg,
        borderTopColor: palette.border,
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
            haptic.select();
            navigation.navigate(t.name);
          }
        };
        return <TabItem key={t.name} item={t} active={isActive} onPress={onPress} palette={palette} />;
      })}
    </View>
  );
}

/** ----------------------------------------------------------------
 * 탭 내부 스택들 (루트는 얕게 유지)
 * -------------------------------------------------------------- */
function HomeTabNavigator() {
  return (
    <HomeTabStack.Navigator screenOptions={commonStackScreenOptions}>
      <HomeTabStack.Screen name="HomeScreen" component={HomeScreen} />
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
 * 전역 설정 플로우 (탭 위로 풀스크린 push)
 * -------------------------------------------------------------- */
function SettingsFlowNavigator() {
  return (
    <SettingsFlowStack.Navigator screenOptions={commonStackScreenOptions}>
      <SettingsFlowStack.Screen name="Settings" component={SettingScreen} />
      <SettingsFlowStack.Screen name="MyReviews" component={MyReviewsScreen} />
      <SettingsFlowStack.Screen name="Theme" component={ThemeScreen} />
    </SettingsFlowStack.Navigator>
  );
}
/** ----------------------------------------------------------------
 * 전역 공유 레슨 플로우 (어디서든 push)
 * -------------------------------------------------------------- */
function LessonFlowNavigator() {
  return (
    <LessonFlowStack.Navigator screenOptions={commonStackScreenOptions}>
      <LessonFlowStack.Screen name="LessonDetail" component={LessonDetailScreen} />
      <LessonFlowStack.Screen name="ClassProgress" component={ClassProgressScreen} />
      <LessonFlowStack.Screen name="LessonLearning" component={LessonLearningScreenV5} />
      <LessonFlowStack.Screen name="HtmlLessonScreen" component={HtmlLessonScreen} />
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
      screenOptions={{
        headerShown: false,
        tabBarStyle: { display: 'none' },
        animation: 'shift',
      }}
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
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';
  const baseTheme = isDark ? DarkTheme : DefaultTheme;
  const theme = {
    ...baseTheme,
    colors: {
      ...baseTheme.colors,
      background: isDark ? '#0A0D14' : 'white',
      card: isDark ? '#0A0D14' : 'white',
    },
  };

  return (
    <NavigationContainer theme={theme}>
      <RootStack.Navigator screenOptions={{ animation: 'slide_from_right', headerShown: false }}>
        {/* ✅ 하단 탭 */}
        <RootStack.Screen name="Tabs" component={Tabs} />

        {/* ✅ 전역 공유 레슨 플로우 (항상 Tabs 위로 push) */}
        <RootStack.Screen name="LessonFlow" component={LessonFlowNavigator} />

        {/* ✅ 전역 설정 플로우 (Tabs 위로 풀스크린 push, 탭 가려짐) */}
        <RootStack.Screen name="SettingsFlow" component={SettingsFlowNavigator} />

        {/* ✅ 여러 종류 모달 등록 */}
        <RootStack.Screen
          name="BaseModal"
          component={BaseModalScreen}
          options={{ presentation: 'modal', animation: 'fade' }}
        />
      </RootStack.Navigator>
    </NavigationContainer>
  );
}