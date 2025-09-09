import React from 'react';
import { View, Text, TouchableOpacity, Animated, Dimensions } from 'react-native';
import { Home, MyLessons, Store, My } from '../assets/SvgIcon';

// Context
import { useNavigation } from '../contexts/NavigationContext';

// Screens
import HomeScreen from '../screens/HomeScreen';
import LessonListScreen from '../screens/Lesson/LessonListScreen';
import StoreScreen from '../screens/StoreScreen';
import MyPageScreen from '../screens/MyPageScreen';
import LessonDetailScreen from '../screens/Lesson/LessonDetailScreen';
import ClassProgressScreen from '../screens/Lesson/classProgressScreen';
import LessonLearningScreen from '../screens/Lesson/LessonLearningScreen';
import LessonReportPage from '../screens/Lesson/LessonReportPage';
import LessonOutlineScreen from '../screens/Lesson/LessonOutlineScreen';


const AppNavigator = () => {
  const { currentRoute, navigationParams, currentTab, switchTab, lastAction } = useNavigation();

  const routeName = currentRoute?.name ?? 'home';
  const route = { params: navigationParams };


  const renderScreen = () => {
    switch (routeName) {
      case 'home':
        return <HomeScreen />;
      case 'myLessons':
        return <LessonListScreen />;
      case 'store':
        return <StoreScreen />;
      case 'my':
        return <MyPageScreen />;
      case 'lessonDetail':
        return <LessonDetailScreen route={route} />;
      case 'classProgress':
        return <ClassProgressScreen />;
      case 'lessonLearning':
        return <LessonLearningScreen route={route} />;
      case 'lessonReport':
        return <LessonReportPage route={route}/>;
      case 'lessonOutline':
        return <LessonOutlineScreen />;
      default:
        return <HomeScreen />;
    }
  };

  /** 탭바를 보여줄 화면(= 각 탭의 루트 화면 이름) */
  const rootTabs = [
    { name: 'home' as const, label: '홈', Icon: Home },
    { name: 'myLessons' as const, label: '내 레슨', Icon: MyLessons },
    { name: 'store' as const, label: '상점', Icon: Store },
    { name: 'my' as const, label: '마이', Icon: My },
  ];

  /** 현재 라우트가 탭바를 보여줄 루트인지 여부 */
  const showTabBar = rootTabs.some(t => t.name === routeName);

  return (
    <>
      <View
        className="flex-1"
      >
        {renderScreen()}
      </View>
      {/* <Animated.View
        className="flex-1"
        style={{ transform: [{ translateX }] }}
      >
        {renderScreen()}
      </Animated.View> */}

      {showTabBar && (
        <View className="flex-row bg-white border-t border-gray-200 h-[60px] px-[10px]">
          {rootTabs.map(({ name, label, Icon }) => {
            const isActive = currentTab === name;
            const iconColor = isActive ? '#FFC700' : '#606060';
            return (
              <TouchableOpacity
                key={name}
                className="flex-1 items-center justify-center"
                onPress={() => switchTab(name)}
              >
                <Icon fill={iconColor} />
                <Text className={`text-[10px] mt-1 ${isActive ? 'text-[#FFC700] font-semibold' : 'text-[#606060]'}`}>
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </>
  );
};

export default AppNavigator;