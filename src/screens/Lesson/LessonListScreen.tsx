import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
} from 'react-native';

// 강의 항목 인터페이스 정의
interface Lesson {
  id: string;
  title: string;
  icon: any; // 아이콘 이미지 (require 사용)
  date: string; // "1일 전" 등 날짜 텍스트
  progress: number; // 진행률 (0~100)
}

const LessonListScreen = () => {
  // 필터 상태 ('전체', '수강중', '수강완료')
  const [filter, setFilter] = useState<'전체' | '수강중' | '수강완료'>('전체');

  // 더미 강의 데이터 (아이콘은 assets 폴더 기준)
  const lessons: Lesson[] = [
    {
      id: '1',
      title: '웹 개발의 시작 HTML(기초)',
      icon: require('../../assets/icons/html-5-icon.png'),
      date: '1일 전',
      progress: 75,
    },
    {
      id: '2',
      title: '스타일 산다 CSS(기초)',
      icon: require('../../assets/icons/css-3-icon.png'),
      date: '1일 전',
      progress: 75,
    },
    {
      id: '3',
      title: '처음 만나는 자바스크립트(기초)',
      icon: require('../../assets/icons/js-icon.png'),
      date: '1일 전',
      progress: 75,
    },
    {
      id: '4',
      title: '파이썬 알고리즘 & 자동화(심화)',
      icon: require('../../assets/icons/python-icon.png'),
      date: '1일 전',
      progress: 100,
    },
  ];

  // 선택된 필터에 따라 강의 필터링
  const filteredLessons = lessons.filter((lesson) => {
    if (filter === '전체') return true;
    if (filter === '수강중') return lesson.progress < 100;
    if (filter === '수강완료') return lesson.progress === 100;
    return true;
  });

  // 각 강의 아이템 렌더링
  const renderLesson = ({ item }: { item: Lesson }) => (
    <View style={styles.card}>
      {/* 아이콘 */}
      <Image source={item.icon} style={styles.icon} />
      
      {/* 텍스트 및 진행률 바 */}
      <View style={styles.textContainer}>
        <Text style={styles.title}>{item.title}</Text>
        <Text style={styles.date}>{item.date}</Text>

        {/* 진행률 바 */}
        <Text style={styles.progressPercent}>{item.progress}%</Text>
        <View style={styles.progressBarBackground}>
          <View style={[styles.progressBarFill, { width: `${item.progress}%` }]} />
        </View>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* 상단 제목 */}
      <Text style={styles.header}>내 강의</Text>

      {/* 필터 버튼 그룹 */}
      <View style={styles.filterContainer}>
        {['전체', '수강중', '수강완료'].map((label) => (
          <TouchableOpacity
            key={label}
            style={[styles.filterButton, filter === label && styles.activeFilterButton]}
            onPress={() => setFilter(label as typeof filter)}
          >
            <Text style={[styles.filterText, filter === label && styles.activeFilterText]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.separator} />

      {/* 강의 목록 */}
      <FlatList
        data={filteredLessons}
        renderItem={renderLesson}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
};

// 스타일 정의
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: 20,
  },
  header: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 20,
    paddingLeft: 16,
  },
  // 필터(전체, 수강중, 수강완료)
  filterContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    paddingLeft: 16,
  },
  filterButton: {
    borderRadius: 20,
    borderStyle: 'solid',
    borderWidth: 1,
    borderColor: '#606060',
    paddingVertical: 5,
    paddingHorizontal: 14,
    backgroundColor: '#fff',
    marginRight: 8  ,
  },
  activeFilterButton: {
    backgroundColor: '#606060',
  },
  filterText: {
    color: '#606060',
    fontSize: 16,
  },
  activeFilterText: {
    color: '#fff',
  },
  // 구분선
  separator: {
    borderBottomWidth: 1,
    borderStyle: 'solid',
    borderColor: '#CCCCCC',
    marginVertical: 20,
  },
  // 내강의 리스트
  list: {
    paddingHorizontal: 16,
  },
  card: { // 클래스
    flexDirection: 'row',
    alignItems: 'center', // 이미지 수직중앙정렬
    backgroundColor: '#fff',
    padding: 10,
    borderStyle: 'solid',
    borderWidth: 1,
    borderColor: '#CCCCCC',
    borderRadius: 16,
    marginBottom: 10,
    //elevation: 5,
    //shadowColor: '#CCCCCC',
    //shadowOffset: { width: 0, height: 1 },
    //shadowOpacity: 0.2,
  },
  icon: {
    width: 70,
    height: 70,
    resizeMode: 'contain',
    marginRight: 14,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111111',
  },
  date: {
    fontSize: 14,
    color: '#777777',
    marginBottom: 10,
  },
  progressPercent: {
    fontSize: 10,
    color: '#58CC02',
    marginLeft: 3,
  },
  progressBarBackground: {
    height: 10,
    borderRadius: 20,
    backgroundColor: '#F5F5F5',
  },
  progressBarFill: {
    height: 10,
    borderRadius: 20,
    backgroundColor: '#FFC700', // 노란색 진행률
  },
});

export default LessonListScreen;