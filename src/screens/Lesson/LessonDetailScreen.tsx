import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import Button from '../../components/Button';

interface LessonDetailScreenProps {
  navigation: any;
  route: any;
}

const LessonDetailScreen: React.FC<LessonDetailScreenProps> = ({ navigation, route }) => {
  const { lessonId } = route.params;

  // Mock lesson data
  const lesson = {
    id: lessonId,
    title: 'HTML 기초',
    description: '웹 개발의 첫 걸음, HTML 태그를 배워보세요',
    duration: '30분',
    difficulty: 'beginner',
    slides: [
      {
        id: 1,
        title: 'HTML이란?',
        content: 'HTML은 HyperText Markup Language의 약자로, 웹페이지의 구조를 정의하는 마크업 언어입니다.',
        type: 'text',
      },
      {
        id: 2,
        title: '기본 HTML 구조',
        content: '<!DOCTYPE html>\n<html>\n<head>\n<title>제목</title>\n</head>\n<body>\n내용\n</body>\n</html>',
        type: 'code',
      },
      {
        id: 3,
        title: '제목 태그',
        content: 'HTML에서는 h1부터 h6까지의 제목 태그를 사용할 수 있습니다.',
        type: 'text',
      },
    ],
  };

  const handleStartLesson = () => {
    navigation.navigate('Slide', { lessonId, slideIndex: 0 });
  };

  const handleSlidePress = (slideIndex: number) => {
    navigation.navigate('Slide', { lessonId, slideIndex });
  };

  const getDifficultyColor = (level: string) => {
    switch (level) {
      case 'beginner':
        return '#28A745';
      case 'intermediate':
        return '#FFC107';
      case 'advanced':
        return '#DC3545';
      default:
        return '#6C757D';
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{lesson.title}</Text>
        <Text style={styles.description}>{lesson.description}</Text>
        
        <View style={styles.metaInfo}>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>소요시간</Text>
            <Text style={styles.metaValue}>{lesson.duration}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>난이도</Text>
            <View style={[styles.difficulty, { backgroundColor: getDifficultyColor(lesson.difficulty) }]}>
              <Text style={styles.difficultyText}>{lesson.difficulty}</Text>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.content}>
        <Text style={styles.sectionTitle}>강의 내용</Text>
        
        <View style={styles.slidesContainer}>
          {lesson.slides.map((slide, index) => (
            <TouchableOpacity
              key={slide.id}
              style={styles.slideItem}
              onPress={() => handleSlidePress(index)}
            >
              <View style={styles.slideNumber}>
                <Text style={styles.slideNumberText}>{index + 1}</Text>
              </View>
              <View style={styles.slideInfo}>
                <Text style={styles.slideTitle}>{slide.title}</Text>
                <Text style={styles.slideType}>
                  {slide.type === 'text' ? '📝 텍스트' : '💻 코드'}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.startSection}>
          <Button
            title="강의 시작하기"
            onPress={handleStartLesson}
            style={styles.startButton}
          />
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
    backgroundColor: '#FFFFFF',
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#212529',
    marginBottom: 8,
  },
  description: {
    fontSize: 16,
    color: '#6C757D',
    lineHeight: 24,
    marginBottom: 20,
  },
  metaInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metaItem: {
    alignItems: 'center',
  },
  metaLabel: {
    fontSize: 12,
    color: '#6C757D',
    marginBottom: 4,
  },
  metaValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212529',
  },
  difficulty: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  difficultyText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
  },
  content: {
    padding: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#212529',
    marginBottom: 16,
  },
  slidesContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  slideItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  slideNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  slideNumberText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  slideInfo: {
    flex: 1,
  },
  slideTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#212529',
    marginBottom: 4,
  },
  slideType: {
    fontSize: 12,
    color: '#6C757D',
  },
  startSection: {
    alignItems: 'center',
  },
  startButton: {
    width: '100%',
    paddingVertical: 16,
  },
});

export default LessonDetailScreen; 