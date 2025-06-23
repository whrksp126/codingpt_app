import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import Button from '../../components/Button';
import CodeEditor from '../../components/CodeEditor';

interface SlideScreenProps {
  navigation: any;
  route: any;
}

const SlideScreen: React.FC<SlideScreenProps> = ({ navigation, route }) => {
  const { lessonId, slideIndex } = route.params;
  const [currentSlideIndex, setCurrentSlideIndex] = useState(slideIndex || 0);
  const [userCode, setUserCode] = useState('');

  // Mock slides data
  const slides = [
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
      language: 'html',
    },
    {
      id: 3,
      title: '제목 태그',
      content: 'HTML에서는 h1부터 h6까지의 제목 태그를 사용할 수 있습니다.\n\n예시:\n<h1>가장 큰 제목</h1>\n<h2>두 번째 제목</h2>\n<h3>세 번째 제목</h3>',
      type: 'text',
    },
  ];

  const currentSlide = slides[currentSlideIndex];
  const isLastSlide = currentSlideIndex === slides.length - 1;

  const handleNext = () => {
    if (isLastSlide) {
      // 강의 완료
      navigation.navigate('LessonComplete', { lessonId });
    } else {
      setCurrentSlideIndex(currentSlideIndex + 1);
      setUserCode('');
    }
  };

  const handlePrevious = () => {
    if (currentSlideIndex > 0) {
      setCurrentSlideIndex(currentSlideIndex - 1);
      setUserCode('');
    }
  };

  const handleRunCode = () => {
    // TODO: 코드 실행 로직 구현
    console.log('실행할 코드:', userCode);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButton}>‹ 뒤로</Text>
        </TouchableOpacity>
        <Text style={styles.progress}>
          {currentSlideIndex + 1} / {slides.length}
        </Text>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>{currentSlide.title}</Text>
        
        {currentSlide.type === 'text' ? (
          <Text style={styles.textContent}>{currentSlide.content}</Text>
        ) : (
          <View style={styles.codeSection}>
            <Text style={styles.codeTitle}>예시 코드:</Text>
            <CodeEditor
              code={currentSlide.content}
              onCodeChange={() => {}}
              language={currentSlide.language}
              readOnly
            />
            
            <Text style={styles.codeTitle}>실습해보세요:</Text>
            <CodeEditor
              code={userCode}
              onCodeChange={setUserCode}
              language={currentSlide.language}
              placeholder="여기에 코드를 작성해보세요..."
            />
            
            <Button
              title="코드 실행"
              onPress={handleRunCode}
              style={styles.runButton}
            />
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.navigationButtons}>
          <Button
            title="이전"
            onPress={handlePrevious}
            disabled={currentSlideIndex === 0}
            style={styles.navButton}
          />
          <Button
            title={isLastSlide ? '완료' : '다음'}
            onPress={handleNext}
            style={styles.navButton}
          />
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  backButton: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '500',
  },
  progress: {
    fontSize: 14,
    color: '#6C757D',
    fontWeight: '500',
  },
  content: {
    flex: 1,
    padding: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#212529',
    marginBottom: 20,
  },
  textContent: {
    fontSize: 16,
    color: '#212529',
    lineHeight: 24,
  },
  codeSection: {
    gap: 16,
  },
  codeTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212529',
    marginBottom: 8,
  },
  runButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 24,
  },
  footer: {
    padding: 24,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  navigationButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
  },
  navButton: {
    flex: 1,
  },
});

export default SlideScreen; 