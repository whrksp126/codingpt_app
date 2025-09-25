import React from 'react';
import { Platform } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { NativeStackNavigationOptions } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import HomeTestScreen from '../screens/test/HomeTestScreen';
import DetailsTestScreen from '../screens/test/DetailsTestScreen';
import LearnTestScreen from '../screens/test/LearnTestScreen';
import StoreTestScreen from '../screens/test/StoreTestScreen';
import MyPageTestScreen from '../screens/test/MyPageTestScreen';

import type {
  RootStackParamList,
  HomeStackParamList,
  LearnStackParamList,
  MyStackParamList,
} from './types';

// 스택 생성
const RootStack = createNativeStackNavigator<RootStackParamList>();
const HomeStack = createNativeStackNavigator<HomeStackParamList>();
const LearnStack = createNativeStackNavigator<LearnStackParamList>();
const MyStack = createNativeStackNavigator<MyStackParamList>();
// 탭 생성
const Tab = createBottomTabNavigator();

const commonStackScreenOptions: NativeStackNavigationOptions = {
  headerLargeTitle: Platform.OS === 'ios',
  headerShadowVisible: false,
  headerTitleAlign: Platform.OS === 'android' ? 'left' : undefined,
  animation: 'slide_from_right',
};

function HomeStackNavigator() {
  return (
    <HomeStack.Navigator screenOptions={commonStackScreenOptions}>
      <HomeStack.Screen name="Home" component={HomeTestScreen} options={{ title: '홈' }} />
      <HomeStack.Screen name="Details" component={DetailsTestScreen} options={{ title: '상세' }} />
    </HomeStack.Navigator>
  );
}

function LearnStackNavigator() {
  return (
    <LearnStack.Navigator screenOptions={commonStackScreenOptions}>
      <LearnStack.Screen name="LearnHome" component={LearnTestScreen} options={{ title: '학습' }} />
      <LearnStack.Screen name="Lesson" component={StoreTestScreen} options={{ title: '레슨' }} />
    </LearnStack.Navigator>
  );
}

function MyStackNavigator() {
  return (
    <MyStack.Navigator screenOptions={commonStackScreenOptions}>
      <MyStack.Screen name="MyHome" component={MyPageTestScreen} options={{ title: '마이' }} />
    </MyStack.Navigator>
  );
}

// 하단 탭
import { Text } from 'react-native';

// ...

function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarLabelStyle: { fontSize: 12 },
        tabBarStyle: { height: 56 },
        tabBarIconStyle: { marginTop: 4 },
        tabBarHideOnKeyboard: true,
      }}
      backBehavior="history"
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeStackNavigator}
        options={{
          title: '홈',
          tabBarIcon: ({ focused }) => (
            <Text style={{ fontSize: 18 }}>{focused ? '🏠' : '🏠'}</Text>
          ),
        }}
      />
      <Tab.Screen
        name="LearnTab"
        component={LearnStackNavigator}
        options={{
          title: '학습',
          tabBarIcon: ({ focused }) => (
            <Text style={{ fontSize: 18 }}>{focused ? '📚' : '📚'}</Text>
          ),
        }}
      />
      <Tab.Screen
        name="MyTab"
        component={MyStackNavigator}
        options={{
          title: '마이',
          tabBarIcon: ({ focused }) => (
            <Text style={{ fontSize: 18 }}>{focused ? '👤' : '👤'}</Text>
          ),
        }}
      />
    </Tab.Navigator>
  );
}


// 루트 스택 (모달/전체 화면 전환 등)
export default function TestRootNavigator() {
  const theme = {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      background: 'white', // NativeWind와 어울리게
    },
  };

  return (
    <NavigationContainer theme={theme}>
      <RootStack.Navigator screenOptions={{ animation: 'fade' }}>
        <RootStack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
        {/* 필요하면 모달을 이런 식으로 */}
        {/* <RootStack.Screen name="TestModal" component={SomeModalScreen} options={{ presentation: 'modal', title: '모달' }} /> */}
      </RootStack.Navigator>
    </NavigationContainer>
  );
}
