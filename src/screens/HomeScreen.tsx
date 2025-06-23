import React from 'react';
import Config from 'react-native-config';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import LessonCard from '../components/LessonCard';

console.log(Config)
interface HomeScreenProps {
  navigation: any;
}

const HomeScreen: React.FC<HomeScreenProps> = ({ navigation }) => {
  const mockLessons = [
    {
      id: '1',
      title: 'HTML 기초',
      description: '웹 개발의 첫 걸음, HTML 태그를 배워보세요',
      duration: '30분',
      difficulty: 'beginner' as const,
      progress: 0,
    },
    {
      id: '2',
      title: 'CSS 스타일링',
      description: '웹페이지를 아름답게 꾸며보세요',
      duration: '45분',
      difficulty: 'beginner' as const,
      progress: 25,
    },
    {
      id: '3',
      title: 'JavaScript 기초',
      description: '동적인 웹페이지를 만들어보세요',
      duration: '60분',
      difficulty: 'intermediate' as const,
      progress: 0,
    },
  ];

  const handleLessonPress = (lessonId: string) => {
    navigation.navigate('LessonDetail', { lessonId });
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.greeting}>안녕하세요! 👋</Text>
        <Text style={styles.subtitle}>오늘도 코딩을 배워봅시다 {Config.ENV}</Text>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>추천 강의</Text>
          <TouchableOpacity onPress={() => navigation.navigate('LessonList')}>
            <Text style={styles.seeAll}>모두 보기</Text>
          </TouchableOpacity>
        </View>

        {mockLessons.map((lesson) => (
          <LessonCard
            key={lesson.id}
            title={lesson.title}
            description={lesson.description}
            duration={lesson.duration}
            difficulty={lesson.difficulty}
            progress={lesson.progress}
            onPress={() => handleLessonPress(lesson.id)}
          />
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>최근 학습</Text>
        <View style={styles.recentCard}>
          <Text style={styles.recentTitle}>CSS 스타일링</Text>
          <Text style={styles.recentProgress}>25% 완료</Text>
          <TouchableOpacity
            style={styles.continueButton}
            onPress={() => handleLessonPress('2')}
          >
            <Text style={styles.continueButtonText}>계속하기</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  header: {
    padding: 24,
    backgroundColor: '#FFFFFF',
  },
  greeting: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#212529',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#6C757D',
  },
  section: {
    marginTop: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#212529',
  },
  seeAll: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '500',
  },
  recentCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    padding: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  recentTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#212529',
    marginBottom: 8,
  },
  recentProgress: {
    fontSize: 14,
    color: '#6C757D',
    marginBottom: 16,
  },
  continueButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  continueButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },
});

export default HomeScreen; 