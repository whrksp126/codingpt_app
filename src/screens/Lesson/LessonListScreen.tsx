import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
} from 'react-native';
import LessonCard from '../../components/LessonCard';

interface LessonListScreenProps {
  navigation: any;
}

const LessonListScreen: React.FC<LessonListScreenProps> = ({ navigation }) => {
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>('all');

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
    {
      id: '4',
      title: 'React 기초',
      description: '현대적인 웹 개발을 위한 React 프레임워크',
      duration: '90분',
      difficulty: 'intermediate' as const,
      progress: 0,
    },
    {
      id: '5',
      title: 'Node.js 서버 개발',
      description: '백엔드 개발의 기초를 배워보세요',
      duration: '120분',
      difficulty: 'advanced' as const,
      progress: 0,
    },
  ];

  const difficulties = [
    { key: 'all', label: '전체' },
    { key: 'beginner', label: '초급' },
    { key: 'intermediate', label: '중급' },
    { key: 'advanced', label: '고급' },
  ];

  const filteredLessons = selectedDifficulty === 'all'
    ? mockLessons
    : mockLessons.filter(lesson => lesson.difficulty === selectedDifficulty);

  const handleLessonPress = (lessonId: string) => {
    navigation.navigate('LessonDetail', { lessonId });
  };

  const renderDifficultyFilter = () => (
    <View style={styles.filterContainer}>
      {difficulties.map((difficulty) => (
        <TouchableOpacity
          key={difficulty.key}
          style={[
            styles.filterButton,
            selectedDifficulty === difficulty.key && styles.filterButtonActive
          ]}
          onPress={() => setSelectedDifficulty(difficulty.key)}
        >
          <Text style={[
            styles.filterButtonText,
            selectedDifficulty === difficulty.key && styles.filterButtonTextActive
          ]}>
            {difficulty.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>강의 목록</Text>
        <Text style={styles.subtitle}>총 {filteredLessons.length}개의 강의</Text>
      </View>

      {renderDifficultyFilter()}

      <FlatList
        data={filteredLessons}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <LessonCard
            title={item.title}
            description={item.description}
            duration={item.duration}
            difficulty={item.difficulty}
            progress={item.progress}
            onPress={() => handleLessonPress(item.id)}
          />
        )}
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
      />
    </View>
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
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#212529',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#6C757D',
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  filterButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginHorizontal: 4,
    borderRadius: 20,
    backgroundColor: '#F8F9FA',
    alignItems: 'center',
  },
  filterButtonActive: {
    backgroundColor: '#007AFF',
  },
  filterButtonText: {
    fontSize: 14,
    color: '#6C757D',
    fontWeight: '500',
  },
  filterButtonTextActive: {
    color: '#FFFFFF',
  },
  listContainer: {
    paddingVertical: 8,
  },
});

export default LessonListScreen; 