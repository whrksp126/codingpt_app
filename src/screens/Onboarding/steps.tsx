import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import Animated, { FadeInRight, FadeInLeft } from 'react-native-reanimated';
import { v2Colors, v2Font } from '../../theme/v2Tokens';
import Mock from './mocks';
import OptionCard from '../../components/ui/OptionCard';
import OptionRow from '../../components/ui/OptionRow';
import { CarouselStep, SurveyQuestion } from './data';

// 스텝 전환 방향 — forward=다음(오른쪽에서 등장), back=이전(왼쪽에서 등장)
export type Direction = 'forward' | 'back';
const enterFor = (direction: Direction) => (direction === 'back' ? FadeInLeft : FadeInRight);

// ── 진입 온보딩 캐러셀 본문 (상단 타이틀/본문 + mock) — 스태거 등장 ────────
export const CarouselContent: React.FC<{ step: CarouselStep; direction: Direction }> = ({ step, direction }) => {
  const In = enterFor(direction);
  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 28, paddingTop: 6 }}>
        <Animated.Text entering={In.duration(300)} style={styles.carouselTitle}>{step.title}</Animated.Text>
        <Animated.Text entering={In.delay(60).duration(300)} style={styles.carouselBody}>{step.body}</Animated.Text>
      </View>
      <Animated.View entering={In.delay(140).duration(340)} style={styles.mockArea}>
        <Mock kind={step.mock} />
      </Animated.View>
    </View>
  );
};

// ── 설문 본문 (타이틀/서브 + 옵션 그리드/리스트) ────────────────────────
type SurveyValue = string | string[] | undefined;

interface SurveyContentProps {
  question: SurveyQuestion;
  value: SurveyValue;
  onChange: (next: SurveyValue) => void;
  direction: Direction;
}

export const SurveyContent: React.FC<SurveyContentProps> = ({ question, value, onChange, direction }) => {
  const In = enterFor(direction);
  const isSelected = (label: string) =>
    question.multi ? Array.isArray(value) && value.includes(label) : value === label;

  const toggle = (label: string) => {
    if (question.multi) {
      const arr = Array.isArray(value) ? value : [];
      onChange(arr.includes(label) ? arr.filter((v) => v !== label) : [...arr, label]);
    } else {
      onChange(label);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 24, paddingTop: 6 }}>
        <Animated.Text entering={In.duration(300)} style={styles.surveyTitle}>{question.title}</Animated.Text>
        {question.sub && (
          <Animated.Text entering={In.delay(50).duration(300)} style={styles.surveySub}>{question.sub}</Animated.Text>
        )}
      </View>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 20, paddingBottom: 8 }}
        showsVerticalScrollIndicator={false}
      >
        {question.layout === 'grid' ? (
          <View style={styles.grid}>
            {question.options.map((o, i) => (
              <Animated.View key={o.label} entering={In.delay(90 + i * 45).duration(300)} style={styles.gridCell}>
                <OptionCard
                  Icon={o.Icon}
                  label={o.label}
                  selected={isSelected(o.label)}
                  multi={question.multi}
                  onPress={() => toggle(o.label)}
                />
              </Animated.View>
            ))}
          </View>
        ) : (
          <View style={{ gap: 9 }}>
            {question.options.map((o, i) => (
              <Animated.View key={o.label} entering={In.delay(90 + i * 45).duration(300)}>
                <OptionRow
                  Icon={o.Icon}
                  label={o.label}
                  sub={o.sub}
                  selected={isSelected(o.label)}
                  multi={question.multi}
                  onPress={() => toggle(o.label)}
                />
              </Animated.View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  mockArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  carouselTitle: {
    fontFamily: v2Font.sans,
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: -0.78,
    color: v2Colors.text,
    lineHeight: 32,
  },
  carouselBody: {
    fontFamily: v2Font.sans,
    fontSize: 15,
    color: v2Colors.text3,
    marginTop: 12,
    lineHeight: 23,
  },
  surveyTitle: {
    fontFamily: v2Font.sans,
    fontSize: 23,
    fontWeight: '700',
    letterSpacing: -0.69,
    color: v2Colors.text,
    lineHeight: 30,
  },
  surveySub: {
    fontFamily: v2Font.sans,
    fontSize: 13.5,
    color: v2Colors.text3,
    marginTop: 8,
    lineHeight: 20,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -5,
  },
  gridCell: {
    width: '50%',
    paddingHorizontal: 5,
    marginBottom: 10,
  },
});
