import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { House, BookBookmark, Storefront, User } from 'phosphor-react-native';

// Screens
import HomeScreen from '../screens/HomeScreen';
import MyPageScreen from '../screens/MyPageScreen';
import LessonListScreen from '../screens/Lesson/LessonListScreen';
import StoreScreen from '../screens/StoreScreen';
import LessonDetailScreen from '../screens/Lesson/LessonDetailScreen';
import SlideScreen from '../screens/Lesson/SlideScreen';

interface AppNavigatorProps {
  onLogout: () => void;
}

const AppNavigator: React.FC<AppNavigatorProps> = ({ onLogout }) => {
  const [currentScreen, setCurrentScreen] = useState('home');
  const [navigationParams, setNavigationParams] = useState<any>({});

  const navigate = (screen: string, params?: any) => {
    setCurrentScreen(screen);
    setNavigationParams(params || {});
  };

  const renderScreen = () => {
    const nav = {
      navigate,
      goBack: () => setCurrentScreen('home'),
      replace: (screen: string) => setCurrentScreen(screen),
    };

    const route = { params: navigationParams };

    switch (currentScreen) {
      case 'home':
        return <HomeScreen navigation={nav} />;
      case 'myLessons':
        return <LessonListScreen navigation={nav} />;
      case 'store':
        return <StoreScreen />;
      case 'my':
        return <MyPageScreen navigation={nav} onLogout={onLogout} />;
      case 'lessonDetail':
        return <LessonDetailScreen navigation={nav} route={route} />;
      case 'slide':
        return <SlideScreen navigation={nav} route={route} />;
      default:
        return <HomeScreen navigation={nav} />;
    }
  };

  const renderTabBar = () => {
    const tabs = [
      { name: 'home', label: '홈', Icon: House },
      { name: 'myLessons', label: '내 레슨', Icon: BookBookmark },
      { name: 'store', label: '상점', Icon: Storefront },
      { name: 'my', label: '마이', Icon: User },
    ];

    return (
      <View style={styles.tabBar}>
        {tabs.map(({ name, label, Icon }) => {
          const isActive = currentScreen === name;
          const iconColor = isActive ? '#FFC107' : '#6C757D';
          
          return (
            <TouchableOpacity
              key={name}
              style={styles.tabItem}
              onPress={() => navigate(name)}
            >
              <Icon color={iconColor} weight={isActive ? 'fill' : 'regular'} size={24} />
              <Text style={[styles.tabText, isActive && styles.activeTabText]}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {renderScreen()}
      </View>
      {renderTabBar()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  content: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    height: 60,
    paddingHorizontal: 10,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabText: {
    fontSize: 10,
    color: '#6C757D',
    marginTop: 4,
  },
  activeTabText: {
    color: '#FFC107',
    fontWeight: '600',
  },
});

export default AppNavigator; 