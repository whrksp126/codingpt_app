import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
} from 'react-native';

interface StoreItem {
  id: string;
  title: string;
  icon: any;
  description: string;
  priceType: '무료' | '유료';
  lessonCount: number;
  category: 'HTML' | 'CSS' | 'JS';
}

// 카테고리별 설명
const categoryDescriptions: Record<string, string> = {
  HTML: 'HTML은 웹 개발의 첫걸음이자 모든 구조의 시작입니다',
  CSS: '웹은 보이는 것이 전부다. 색, 공간, 움직임까지!',
  JS: '당신의 웹에 생명을 불어넣을 언어, JavaScript',
};

// 카테고리 부제
const getCategoryLabel = (key: string) => {
  if (key === 'HTML') return '태그의 정원';
  if (key === 'CSS') return '스타일 연구소';
  if (key === 'JS') return '로직의 숲';
  return '';
};

const StoreScreen = () => {
  const [filter, setFilter] = useState<'전체' | '무료' | '유료'>('전체');

  const lectures: StoreItem[] = [
    {
      id: '1',
      title: '웹 개발의 시작 HTML(기초)',
      icon: require('../assets/icons/html-5-icon.png'),
      description: '웹 개발 배우고 싶은 사람 다 모여라\n웹 개발의 시작 HTML!',
      priceType: '무료',
      lessonCount: 22,
      category: 'HTML',
    },
    {
      id: '2',
      title: 'HTML 완전 정복(심화)',
      icon: require('../assets/icons/html-5-icon.png'),
      description: '시맨틱 태그부터 접근성까지\n전문가처럼 쓰는 HTML의 기술',
      priceType: '유료',
      lessonCount: 32,
      category: 'HTML',
    },
    {
      id: '3',
      title: '스타일 산다 CSS(기초)',
      icon: require('../assets/icons/css-3-icon.png'),
      description: 'CSS가 쉬워지는 시간\n스타일 산다 CSS!',
      priceType: '무료',
      lessonCount: 32,
      category: 'CSS',
    },
    {
      id: '4',
      title: '스타일 산다 CSS(심화)',
      icon: require('../assets/icons/css-3-icon.png'),
      description: '애니메이션, 변수, 프레임워크까지\n한 단계 높은 스타일링',
      priceType: '유료',
      lessonCount: 35,
      category: 'CSS',
    },
    {
      id: '5',
      title: '처음 만나는 자바스크립트(기초)',
      icon: require('../assets/icons/js-icon.png'),
      description: '자바스크립트를 처음 배우는 분을 위한\nJS 초심자 커리큘럼',
      priceType: '무료',
      lessonCount: 41,
      category: 'JS',
    },
  ];

  const filteredLectures = lectures.filter(
    (lec) => filter === '전체' || lec.priceType === filter
  );

  const grouped = filteredLectures.reduce<Record<string, StoreItem[]>>((acc, cur) => {
    if (!acc[cur.category]) acc[cur.category] = [];
    acc[cur.category].push(cur);
    return acc;
  }, {});

  return (
    <View style={styles.container}>
      <Text style={styles.header}>상점</Text>

      <View style={styles.filterContainer}>
        {['전체', '무료', '유료'].map((label) => (
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

      <FlatList
        data={Object.entries(grouped)}
        keyExtractor={([category]) => category}
        renderItem={({ item: [category, items] }) => (
          <View>
            <Text style={styles.categoryTitle}>
              {`${category}(${getCategoryLabel(category)})`}
            </Text>
            <Text style={styles.categoryDesc}>{categoryDescriptions[category]}</Text>

            {items.map((item) => (
              <View key={item.id} style={styles.card}>
                <Image source={item.icon} style={styles.icon} />
                <View style={styles.textContainer}>
                  <Text style={styles.title}>{item.title}</Text>
                  <Text style={styles.description}>{item.description}</Text>
                  <View style={styles.bottomRow}>
                    <Text
                      style={[
                        styles.priceTag,
                        item.priceType === '무료' ? styles.free : styles.paid,
                      ]}
                    >
                      {item.priceType}
                    </Text>
                    <Text style={[styles.priceTag, styles.lessonCount]}>{item.lessonCount}강</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
};

// 스타일 정의 (내 강의와 동일 구조 + 소폭 확장)
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
    marginRight: 8,
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
  separator: {
    borderBottomWidth: 1,
    borderStyle: 'solid',
    borderColor: '#CCCCCC',
    marginVertical: 20,
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  categoryTitle: {
    fontWeight: 'bold',
    fontSize: 16,
    color: '#FFC700',
    marginBottom: 6,
  },
  categoryDesc: {
    fontSize: 14,
    color: '#777777',
    marginBottom: 12,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 10,
    borderStyle: 'solid',
    borderWidth: 1,
    borderColor: '#CCCCCC',
    borderRadius: 16,
    marginBottom: 10,
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
  description: {
    fontSize: 14,
    color: '#777777',
    marginTop: 4,
    marginBottom: 10,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  priceTag: {
    fontSize: 10,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 6,
    overflow: 'hidden',
  },
  free: {
    color: '#58CC02',
    backgroundColor: '#F0FFE5',
  },
  paid: {
    color: '#027FCC',
    backgroundColor: '#EDF8FF',
  },
  lessonCount: {
    color: '#777777',
    backgroundColor: '#F5F5F5',
  },
});

export default StoreScreen;