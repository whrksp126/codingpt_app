import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, Image } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Lock } from 'phosphor-react-native';

import Heatmap from '../../components/Heatmap';
import AchievementDetailModal, { AchievementDetail } from '../../components/Modal/AchievementDetailModal';
import { Label } from '../../components/v2/primitives';
import { v2 } from '../../theme/v2Tokens';
import { sheetRefreshControl } from '../../components/v2/refresh';
import { useUser } from '../../contexts/UserContext';
import { useLesson } from '../../contexts/LessonContext';
import { parseLessonList } from '../../utils/lessonUtils';
import userService from '../../services/userService';

const C = v2.colors;
const R = v2.radius;

type AchievementMeta = { code: string; name: string; icon: any; condition: string; unlockedDescription: string };
const ACHIEVEMENT_META: AchievementMeta[] = [
  { code: 'HTML', name: 'HTML', icon: require('../../assets/icons/html-5-icon.png'), condition: 'HTML 카테고리의 심화 레슨을 1개 이상 완료하면 획득합니다.', unlockedDescription: 'HTML 심화 학습을 완료하셨습니다!' },
  { code: 'CSS', name: 'CSS', icon: require('../../assets/icons/css-3-icon.png'), condition: 'CSS 카테고리의 심화 레슨을 1개 이상 완료하면 획득합니다.', unlockedDescription: 'CSS 심화 학습을 완료하셨습니다!' },
  { code: 'JS', name: 'JS', icon: require('../../assets/icons/js-icon.png'), condition: 'JavaScript 카테고리의 심화 레슨을 1개 이상 완료하면 획득합니다.', unlockedDescription: 'JavaScript 심화 학습을 완료하셨습니다!' },
  { code: 'Python', name: 'Python', icon: require('../../assets/icons/python-icon.png'), condition: 'Python 카테고리의 심화 레슨을 1개 이상 완료하면 획득합니다.', unlockedDescription: 'Python 심화 학습을 완료하셨습니다!' },
  { code: 'Java', name: 'Java', icon: require('../../assets/icons/java-icon.png'), condition: 'Java 카테고리의 심화 레슨을 1개 이상 완료하면 획득합니다.', unlockedDescription: 'Java 심화 학습을 완료하셨습니다!' },
  { code: 'Nodejs', name: 'Nodejs', icon: require('../../assets/icons/nodejs-icon.png'), condition: 'Node.js 카테고리의 심화 레슨을 1개 이상 완료하면 획득합니다.', unlockedDescription: 'Node.js 심화 학습을 완료하셨습니다!' },
];

function Stat({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <View style={{ flex: 1, borderWidth: 1, borderColor: C.border, borderRadius: R.lg, backgroundColor: C.surface, padding: 14 }}>
      <Text style={{ fontSize: 22, fontWeight: '700', color, fontFamily: v2.font.mono }}>{value}</Text>
      <Text style={{ fontSize: 11.5, color: C.textDim, marginTop: 4 }}>{label}</Text>
    </View>
  );
}

// 학습 상세 — 학습 개요 · 잔디 · 업적 · 완료 레슨 · 진행 클래스. (내정보 → 학습)
const LearningContent: React.FC = () => {
  const { user, loading, refreshUser } = useUser();
  const { lessons } = useLesson();
  const [unlockedSet, setUnlockedSet] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<AchievementDetail | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadAchievements = useCallback(() => userService.getAchievements().then((items) => {
    setUnlockedSet(new Set(items.filter((i) => i.unlocked).map((i) => i.code)));
  }).catch(() => {}), []);

  const refresh = useCallback(() => {
    setRefreshing(true);
    Promise.all([refreshUser(), loadAchievements()]).finally(() => setRefreshing(false));
  }, [refreshUser, loadAchievements]);

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    userService.getAchievements().then((items) => {
      if (cancelled) return;
      setUnlockedSet(new Set(items.filter((i) => i.unlocked).map((i) => i.code)));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []));

  const parsed = useMemo(() => parseLessonList(lessons), [lessons]);
  const doneLessons = useMemo(() => parsed.filter((l) => l.status === '수강완료').length, [parsed]);
  const ongoingClasses = useMemo(() => parsed.filter((l) => l.status === '수강중').length, [parsed]);
  const achievements = ACHIEVEMENT_META.map((m) => ({ ...m, unlocked: unlockedSet.has(m.code) }));

  return (
    <>
      <ScrollView style={{ flex: 1, backgroundColor: C.base }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40 }} showsVerticalScrollIndicator={false} refreshControl={sheetRefreshControl(refreshing, refresh)}>
        {/* 학습 개요 */}
        <Label style={{ marginBottom: 10, paddingHorizontal: 2 }}>학습 개요</Label>
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
          <Stat value={String(user?.studyDays ?? 0)} label="학습 일수" color={C.accent} />
          <Stat value={String(user?.xp ?? 0)} label="총 XP" color={C.warn} />
        </View>
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 22 }}>
          <Stat value={String(doneLessons)} label="완료 레슨" color={C.text} />
          <Stat value={String(ongoingClasses)} label="진행 클래스" color={C.text} />
        </View>

        {/* 잔디 */}
        <Label style={{ marginBottom: 10, paddingHorizontal: 2 }}>잔디</Label>
        <View style={{ borderWidth: 1, borderColor: C.border, borderRadius: R.lg, backgroundColor: C.surface, padding: 14, marginBottom: 22 }}>
          {loading ? (
            <Text style={{ fontSize: 13, color: C.textDim }}>로딩 중...</Text>
          ) : (
            <>
              <Heatmap data={user?.heatmap ?? {}} />
              {(!user?.heatmap || Object.keys(user.heatmap).length === 0) && (
                <Text style={{ fontSize: 13, color: C.text2, textAlign: 'center', marginTop: 8 }}>
                  {(user?.xp ?? 0) > 0 ? '최근 학습 기록이 없어요. 잔디를 다시 심어보아요!' : '아직 학습 기록이 없어요. 첫 잔디를 심어보세요!'}
                </Text>
              )}
            </>
          )}
        </View>

        {/* 업적 */}
        <Label style={{ marginBottom: 10, paddingHorizontal: 2 }}>업적</Label>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between' }}>
          {achievements.map((item, index) => (
            <Pressable
              key={index}
              onPress={() => { setSelected(item); setModalVisible(true); }}
              style={{ width: '31%', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border, borderRadius: R.lg, paddingVertical: 12, backgroundColor: item.unlocked ? C.elevated : C.surface }}
            >
              <View style={{ width: 64, height: 64, alignItems: 'center', justifyContent: 'center' }}>
                <Image source={item.icon} style={{ width: 64, height: 64, opacity: item.unlocked ? 1 : 0.28 }} resizeMode="contain" />
                {!item.unlocked && (
                  <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
                    <Lock size={24} color={C.textDim} weight="fill" />
                  </View>
                )}
              </View>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      {modalVisible && (
        <AchievementDetailModal visible={modalVisible} achievement={selected} onClose={() => setModalVisible(false)} />
      )}
    </>
  );
};

export default LearningContent;
