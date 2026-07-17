import React, { memo, useEffect } from 'react';
import { PanResponder, Platform, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { haptic } from '../animations/haptics';
import { SPRING_TIGHT } from '../animations/presets';

// Tab icons (phosphor) — 디자인 V2 바텀 네비
import { House, Folders, GraduationCap, User } from 'phosphor-react-native';
import { v2 } from '../theme/v2Tokens';

// Screens (탭 루트)
import LessonListScreen from '../screens/Lesson/LessonListScreen';
import ClassDetailScreen from '../screens/Lesson/ClassDetailScreen';
import MyPageScreen from '../screens/MyPageScreen';
import LocalAgentScreen from '../screens/LocalAgent/LocalAgentScreen';

// Screens (공유 상세/학습 플로우)
import LessonDetailScreen from '../screens/Lesson/LessonDetailScreen';
import ClassProgressScreen from '../screens/Lesson/classProgressScreen';
import LessonLearningScreenV5 from '../screens/Lesson/LessonLearningScreenV5';
import LessonReportPage from '../screens/Lesson/LessonReportPage';
import LessonOutlineScreen from '../screens/Lesson/LessonOutlineScreen';
import HtmlLessonScreen from '../screens/Lesson/HtmlLessonScreen';

// modals
import BaseModal from '../components/Modal/BaseModal';

// 좌측 사이드바 — 폰=오버레이 드로어 / 태블릿=도킹
import { DrawerProvider, useDrawer } from '../contexts/DrawerContext';
import { MyInfoProvider } from '../contexts/MyInfoContext';
import { HomeActionProvider } from '../contexts/HomeActionContext';
import AppDrawer from '../components/AppDrawer';
import SidebarContent from '../components/SidebarContent';
import WorkspaceView from '../workspace/WorkspaceView';
import NotifSound from '../components/NotifSound';
import MyInfoSheet from '../components/MyInfoSheet';
import NewWorkspaceSheet from '../components/NewWorkspaceSheet';
import SettingsModal from '../components/SettingsModal';
import AppBackHandler from './AppBackHandler';
import PaywallSheet from '../components/Billing/PaywallSheet';
import { useResponsive } from '../hooks/useResponsive';
import { useSidebarWidth, setSidebarWidth, clampSbWidth, getSidebarWidth } from '../workspace/sidebarWidth';

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
type TabPalette = { active: string; inactive: string; border: string; bg: string };
const COLORS_LIGHT: TabPalette = {
  active: v2.colors.cta,        // 딥그린
  inactive: '#94A3B8',
  border: '#E2E8F0',
  bg: '#FFFFFF',
};
const COLORS_DARK: TabPalette = {
  active: v2.colors.accent,     // 민트
  inactive: v2.colors.textDim,  // dim
  border: v2.colors.border,     // 헤어라인
  bg: v2.colors.base,
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

// 디자인 V2 바텀 네비: 홈 · 프로젝트 · 배우기 · 내 정보
// (라우트 키는 기존 유지: store 슬롯 = 프로젝트, myLessons 슬롯 = 배우기)
const ROOT_TABS: RootTabItem[] = [
  { name: 'home', label: '홈', Icon: House },
  { name: 'store', label: '프로젝트', Icon: Folders },
  { name: 'myLessons', label: '배우기', Icon: GraduationCap },
  { name: 'my', label: '내 정보', Icon: User },
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
    width: progress.value * 22,
    height: 1.5,
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
      <Animated.View
        className="absolute top-0 rounded-full"
        style={indicatorStyle}
      />
      <Animated.View style={iconWrapStyle}>
        <item.Icon
          size={SIZES.icon}
          color={iconColor}
          weight={active ? 'fill' : 'regular'}
        />
      </Animated.View>
      <Text
        className={`text-[10px] mt-1 ${active ? 'font-semibold' : ''}`}
        style={{ color: labelColor }}
      >
        {item.label}
      </Text>
    </TouchableOpacity>
  );
});

function CustomTabBar({ state, navigation }: any) {
  // 디자인상 앱 셸(홈/프로젝트/배우기/내 정보)은 다크 모던 고정 → 탭바도 항상 다크.
  const palette = COLORS_DARK;
  // 하단 세이프에어리어(제스처바/홈 인디케이터)만큼 다크 패딩을 더해 겹침 방지.
  const insets = useSafeAreaInsets();
  return (
    <View
      className="flex-row border-t"
      style={{
        backgroundColor: palette.bg,
        borderTopColor: palette.border,
        height: SIZES.barHeight + insets.bottom, // 고정 높이 + 하단 세이프에어리어
        paddingBottom: insets.bottom,
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
function LearnTabNavigator() {
  return (
    <LearnTabStack.Navigator screenOptions={commonStackScreenOptions}>
      <LearnTabStack.Screen name="MyLessonsScreen" component={LessonListScreen} />
      <LearnTabStack.Screen name="ClassDetail" component={ClassDetailScreen} />
    </LearnTabStack.Navigator>
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

// 반응형 셸:
//  · 태블릿(넓은 화면)=좌측 도킹 사이드바 + 메인 (row). 도킹은 기본 열림, 토글로 접기.
//  · 폰=메인 풀스크린 + AppDrawer 오버레이(햄버거로 열기).
// 사이드바 우측 테두리 리사이즈 핸들 — 드래그로 폭 조절(PC .sb-resizer 미러, 최소/최대 클램프).
function SidebarResizeHandle({ winW }: { winW: number }) {
  const winWRef = React.useRef(winW); winWRef.current = winW;
  const startW = React.useRef(0);
  const [drag, setDrag] = React.useState(false);
  const pan = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        startW.current = clampSbWidth(getSidebarWidth(), winWRef.current);
        setDrag(true);
      },
      onPanResponderMove: (_e, g) => { setSidebarWidth(clampSbWidth(startW.current + g.dx, winWRef.current), false); },
      onPanResponderRelease: (_e, g) => { setSidebarWidth(clampSbWidth(startW.current + g.dx, winWRef.current)); setDrag(false); },
      onPanResponderTerminate: () => setDrag(false),
    }),
  ).current;
  return (
    <View
      {...pan.panHandlers}
      style={{ position: 'absolute', top: 0, bottom: 0, right: -7, width: 14, zIndex: 40 }}
    >
      {drag ? <View style={{ position: 'absolute', top: 0, bottom: 0, left: 5, width: 3, backgroundColor: v2.colors.accent, opacity: 0.6 }} /> : null}
    </View>
  );
}

function ShellLayout() {
  const { isWide } = useResponsive();
  const { dockedOpen } = useDrawer();
  const showDocked = isWide && dockedOpen;
  const { width: winW } = useWindowDimensions();
  const sbW = clampSbWidth(useSidebarWidth(), winW);
  return (
    <View style={{ flex: 1, flexDirection: 'row' }}>
      {showDocked ? (
        <View style={{ width: sbW, borderRightWidth: 1, borderRightColor: v2.colors.border, backgroundColor: v2.colors.surface }}>
          <SidebarContent />
          <SidebarResizeHandle winW={winW} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        {/* 메인 = PC식 워크스페이스뷰(타일 pane). 기존 홈/프로젝트/배우기 탭 셸 대체. */}
        <WorkspaceView />
        {/* 새 알림 도착 효과음(포그라운드) — 0x0 히든 플레이어 */}
        <NotifSound />
        {/* 내 정보 시트(아래) → 드로어(위) 순서로 오버레이. */}
        <MyInfoSheet />
        {/* '+' 새 워크스페이스 생성 방식 선택(내 PC 폴더 / GitHub / 클라우드) */}
        <NewWorkspaceSheet />
        {/* 내 정보 = PC 미러 설정 모달(일반/계정/정보 + 내 기기) */}
        <SettingsModal />
        {/* 폰에서만 오버레이 드로어. 태블릿은 위 도킹 사이드바 사용. */}
        {!isWide ? <AppDrawer /> : null}
        {/* 결제 페이월 — 전역 마운트(내 정보 시트에서 '플랜 관리' 눌러도 동작). */}
        <PaywallSheet />
        {/* 전역 하드웨어 뒤로가기: 드로어 닫기 + 메인 탭 더블백 종료 */}
        <AppBackHandler />
      </View>
    </View>
  );
}

// 하단 탭 대신 좌측 사이드바 사용.
function Tabs() {
  return (
    <DrawerProvider>
      <MyInfoProvider>
        <HomeActionProvider>
          <ShellLayout />
        </HomeActionProvider>
      </MyInfoProvider>
    </DrawerProvider>
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

        {/* (구) 전역 설정 플로우 제거 — 설정/테마/후기는 내 정보 시트 패널로 통합됨 */}

        {/* ✅ 여러 종류 모달 등록 */}
        <RootStack.Screen
          name="BaseModal"
          component={BaseModalScreen}
          options={{ presentation: 'modal', animation: 'fade' }}
        />

        {/* 배우기 카탈로그 — 내 정보 → 배우기 진입(구 myLessons 탭 대체) */}
        <RootStack.Screen name="LearnCatalog" component={LearnTabNavigator} />

        {/* BYO-PC — 내 PC 터미널 기반 에이전트 환경 */}
        <RootStack.Screen name="LocalAgent" component={LocalAgentScreen} />

        {/* 모바일 IDE 는 더 이상 네비게이션 화면이 아님 — IndexScreen 의 MobileIDEHost 오버레이가 상주
            (언마운트 없이 보임/숨김 → 닫았다 열어도 직전 상태 유지). 진입은 useIdeProject().openIde. */}
      </RootStack.Navigator>
    </NavigationContainer>
  );
}