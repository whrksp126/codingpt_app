import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, Image, Alert } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import {
  Plus, CaretRight, Desktop, GithubLogo, Cloud, ArrowsClockwise,
  Receipt, Star, GearSix, Lock,
} from 'phosphor-react-native';
import dayjs from 'dayjs';

import Heatmap from '../components/Heatmap';
import AchievementDetailModal, { AchievementDetail } from '../components/Modal/AchievementDetailModal';
import { HamburgerButton } from '../components/AppTopBar';
import { Btn, Chip, Label } from '../components/v2/primitives';
import { v2 } from '../theme/v2Tokens';
import { useUser } from '../contexts/UserContext';
import { useLesson } from '../contexts/LessonContext';
import { useMyInfo } from '../contexts/MyInfoContext';
import { parseLessonList } from '../utils/lessonUtils';
import userService from '../services/userService';
import githubService, { GithubStatus } from '../services/githubService';
import workspaceService from '../services/workspaceService';

const C = v2.colors;
const R = v2.radius;

// ── 업적 메타 (기존 데이터 유지, V2 다크로 고도화) ────────────────
type AchievementMeta = {
  code: string;
  name: string;
  icon: any;
  condition: string;
  unlockedDescription: string;
};

const ACHIEVEMENT_META: AchievementMeta[] = [
  { code: 'HTML', name: 'HTML', icon: require('../assets/icons/html-5-icon.png'), condition: 'HTML 카테고리의 심화 레슨을 1개 이상 완료하면 획득합니다.', unlockedDescription: 'HTML 심화 학습을 완료하셨습니다!' },
  { code: 'CSS', name: 'CSS', icon: require('../assets/icons/css-3-icon.png'), condition: 'CSS 카테고리의 심화 레슨을 1개 이상 완료하면 획득합니다.', unlockedDescription: 'CSS 심화 학습을 완료하셨습니다!' },
  { code: 'JS', name: 'JS', icon: require('../assets/icons/js-icon.png'), condition: 'JavaScript 카테고리의 심화 레슨을 1개 이상 완료하면 획득합니다.', unlockedDescription: 'JavaScript 심화 학습을 완료하셨습니다!' },
  { code: 'Python', name: 'Python', icon: require('../assets/icons/python-icon.png'), condition: 'Python 카테고리의 심화 레슨을 1개 이상 완료하면 획득합니다.', unlockedDescription: 'Python 심화 학습을 완료하셨습니다!' },
  { code: 'Java', name: 'Java', icon: require('../assets/icons/java-icon.png'), condition: 'Java 카테고리의 심화 레슨을 1개 이상 완료하면 획득합니다.', unlockedDescription: 'Java 심화 학습을 완료하셨습니다!' },
  { code: 'Nodejs', name: 'Nodejs', icon: require('../assets/icons/nodejs-icon.png'), condition: 'Node.js 카테고리의 심화 레슨을 1개 이상 완료하면 획득합니다.', unlockedDescription: 'Node.js 심화 학습을 완료하셨습니다!' },
];

// ── 섹션 헤더 (라벨 + 우측 액션) ───────────────────────────────────
function SecRow({ label, action, onAction }: { label: string; action?: string; onAction?: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, paddingHorizontal: 2 }}>
      <Label>{label}</Label>
      {action ? <Text onPress={onAction} style={{ fontSize: 12, color: C.accent, fontWeight: '600' }}>{action}</Text> : null}
    </View>
  );
}

// ── 연결·동기화 행 ─────────────────────────────────────────────────
function ConnRow({
  icon, name, meta, status, tone = 'on', action, last,
}: {
  icon: React.ReactNode; name: string; meta: string;
  status?: string; tone?: 'on' | 'wait' | 'off'; action?: string; last?: boolean;
}) {
  const dot = tone === 'on' ? C.accent : tone === 'wait' ? C.warn : C.textDim;
  const numeric = /[0-9]/.test(meta);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: last ? 0 : 1, borderBottomColor: C.border }}>
      <View style={{ width: 34, height: 34, borderRadius: 9, backgroundColor: C.elevated2, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}>{icon}</View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 13.5, fontWeight: '600', color: C.text }} numberOfLines={1}>{name}</Text>
        <Text style={{ fontSize: 11.5, color: C.textDim, marginTop: 1, fontFamily: numeric ? v2.font.mono : v2.font.sans }} numberOfLines={1}>{meta}</Text>
      </View>
      {action ? (
        <Text style={{ fontSize: 12, color: C.accent, fontWeight: '600' }}>{action}</Text>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <View style={{ width: 7, height: 7, borderRadius: 999, backgroundColor: dot }} />
          <Text style={{ fontSize: 12, color: tone === 'off' ? C.textDim : C.text2 }}>{status}</Text>
        </View>
      )}
    </View>
  );
}

// ── 메뉴 행 ────────────────────────────────────────────────────────
function MenuRow({ icon, label, onPress, last }: { icon: React.ReactNode; label: string; onPress?: () => void; last?: boolean }) {
  return (
    <Pressable onPress={onPress} android_ripple={{ color: C.elevated2 }} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 15, borderBottomWidth: last ? 0 : 1, borderBottomColor: C.border }}>
      <View style={{ width: 22, alignItems: 'center' }}>{icon}</View>
      <Text style={{ flex: 1, fontSize: 14.5, color: C.text }}>{label}</Text>
      <CaretRight size={16} color={C.textDim} />
    </Pressable>
  );
}

const card = { borderWidth: 1, borderColor: C.border, borderRadius: R.lg, backgroundColor: C.surface } as const;

const MyPageScreen = () => {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { user, loading } = useUser();
  const { lessons } = useLesson();
  const { openSheet, pushSettings } = useMyInfo();
  // (구) 설정 풀스크린 제거 → 내 정보 시트의 설정 패널 열기
  const openSettings = () => { openSheet(); pushSettings(); };

  const [unlockedSet, setUnlockedSet] = useState<Set<string>>(new Set());
  const [selectedAchievement, setSelectedAchievement] = useState<AchievementDetail | null>(null);
  const [achievementModalVisible, setAchievementModalVisible] = useState(false);
  const [github, setGithub] = useState<GithubStatus>({ connected: false });
  const [projectCount, setProjectCount] = useState<number | null>(null);

  // 업적 / GitHub / 프로젝트 수 — 실데이터 로드
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      userService.getAchievements().then((items) => {
        if (cancelled) return;
        setUnlockedSet(new Set(items.filter((i) => i.unlocked).map((i) => i.code)));
      }).catch(() => {});
      githubService.getStatus().then((s) => { if (!cancelled) setGithub(s); }).catch(() => {});
      workspaceService.listWorkspaces().then((r) => { if (!cancelled) setProjectCount((r.workspaces || []).length); }).catch(() => {});
      return () => { cancelled = true; };
    }, [])
  );

  // 활동 통계 — 레슨/프로젝트 실데이터
  const parsed = useMemo(() => parseLessonList(lessons), [lessons]);
  const doneLessons = useMemo(() => parsed.filter((l) => l.status === '수강완료').length, [parsed]);
  const ongoingClasses = useMemo(() => parsed.filter((l) => l.status === '수강중').length, [parsed]);

  const achievements = ACHIEVEMENT_META.map((m) => ({ ...m, unlocked: unlockedSet.has(m.code) }));

  if (!user) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.base }}>
        <Text style={{ color: C.text2 }}>사용자 정보를 불러오는 중입니다...</Text>
      </View>
    );
  }

  const avatar = String(user.nickname || '코').trim().charAt(0).toUpperCase();
  const soon = (what: string) => Alert.alert(what, '곧 만나요! 준비 중인 기능이에요.');
  const stats: Array<[string, string]> = [
    ['완료 레슨', String(doneLessons)],
    ['진행 클래스', String(ongoingClasses)],
    ['프로젝트', projectCount === null ? '–' : String(projectCount)],
  ];

  return (
    <>
      <ScrollView
        style={{ flex: 1, backgroundColor: C.base }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 36 }}
        showsVerticalScrollIndicator={false}
      >
        {/* 햄버거 (드로어 열기) */}
        <View style={{ flexDirection: 'row', marginLeft: -8, marginBottom: 2, paddingTop: Math.max(insets.top, 12) }}>
          <HamburgerButton color={C.text2} />
        </View>

        {/* 프로필 */}
        <Animated.View entering={FadeInDown.springify().damping(14)}>
          <Pressable
            onPress={() => openSettings()}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 13, paddingTop: 8, paddingBottom: 18 }}
          >
            <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: C.elevated2, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 19, fontWeight: '700', color: C.text2 }}>{avatar}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                <Text style={{ fontSize: 18, fontWeight: '700', color: C.text }} numberOfLines={1}>{user.nickname}</Text>
                <Chip tone="accent">Pro</Chip>
              </View>
              <Text style={{ fontSize: 12.5, color: C.textDim, marginTop: 3, fontFamily: v2.font.mono }} numberOfLines={1}>{user.email}</Text>
            </View>
            <CaretRight size={18} color={C.textDim} />
          </Pressable>
        </Animated.View>

        {/* 구독 플랜 (정적 목업) */}
        <View style={{ marginBottom: 18 }}>
          <View style={{ ...card, padding: 14 }}>
            <Label>구독 플랜</Label>
            <Text style={{ fontSize: 22, fontWeight: '700', color: C.text, marginTop: 7, marginBottom: 10 }}>Pro</Text>
            <Btn variant="outline" sm full onPress={() => soon('플랜 관리')}>플랜 관리</Btn>
          </View>
        </View>

        {/* 연결 · 동기화 (GitHub 실데이터 / 나머지 목업) */}
        <SecRow label="연결 · 동기화" action="연결 관리" onAction={() => openSettings()} />
        <View style={{ ...card, overflow: 'hidden', marginBottom: 18 }}>
          <ConnRow icon={<Desktop size={18} color={C.text2} />} name="내 PC · MacBook Pro" meta="macOS 14 · daemon v1.2.0" status="온라인" tone="on" />
          <ConnRow
            icon={<GithubLogo size={18} color={C.text2} />}
            name="GitHub"
            meta={github.connected ? `${github.login} · 자동 푸시 켜짐` : '아직 연결되지 않았어요'}
            status={github.connected ? '연결됨' : undefined}
            tone={github.connected ? 'on' : 'off'}
            action={github.connected ? undefined : '연결'}
          />
          <ConnRow icon={<Cloud size={18} color={C.text2} />} name="서버 · 클라우드 컴퓨팅" meta="PC 오프라인 시 자동 전환" status="대기" tone="wait" />
          <ConnRow icon={<ArrowsClockwise size={18} color={C.text2} />} name="동기화" meta="todo-app · 외 3개 프로젝트" status="방금 전" tone="on" last />
        </View>

        {/* 활동 통계 (레슨/프로젝트 실데이터) */}
        <View style={{ flexDirection: 'row', ...card, marginBottom: 18 }}>
          {stats.map(([l, v], i) => (
            <View key={l} style={{ flex: 1, paddingVertical: 13, alignItems: 'center', borderRightWidth: i < 2 ? 1 : 0, borderRightColor: C.border }}>
              <Text style={{ fontSize: 19, fontWeight: '700', color: C.text, fontFamily: v2.font.mono }}>{v}</Text>
              <Text style={{ fontSize: 11.5, color: C.textDim, marginTop: 3 }}>{l}</Text>
            </View>
          ))}
        </View>

        {/* 메뉴 */}
        <View style={{ ...card, overflow: 'hidden', marginBottom: 22 }}>
          <MenuRow icon={<Receipt size={19} color={C.text3} />} label="구매 내역" onPress={() => soon('구매 내역')} />
          <MenuRow icon={<Star size={19} color={C.text3} />} label="앱 평가하기" onPress={() => soon('앱 평가하기')} />
          <MenuRow icon={<GearSix size={19} color={C.text3} />} label="설정" onPress={() => openSettings()} last />
        </View>

        {/* ─── 학습 (기존 기능 유지 · V2 고도화) ─── */}
        {/* 개요: 학습 일수 / 총 XP */}
        <Animated.View entering={FadeInDown.springify().damping(14).delay(60)}>
          <SecRow label="학습 개요" />
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 18 }}>
            <View style={{ flex: 1, ...card, padding: 14 }}>
              <Text style={{ fontSize: 22, fontWeight: '700', color: C.accent, fontFamily: v2.font.mono }}>{user?.studyDays ?? 0}</Text>
              <Text style={{ fontSize: 11.5, color: C.textDim, marginTop: 4 }}>학습 일수</Text>
            </View>
            <View style={{ flex: 1, ...card, padding: 14 }}>
              <Text style={{ fontSize: 22, fontWeight: '700', color: C.warn, fontFamily: v2.font.mono }}>{user.xp ?? 0}</Text>
              <Text style={{ fontSize: 11.5, color: C.textDim, marginTop: 4 }}>총 XP</Text>
            </View>
          </View>
        </Animated.View>

        {/* 잔디 */}
        <Animated.View entering={FadeInDown.springify().damping(14).delay(120)}>
          <SecRow label="잔디" />
          <View style={{ ...card, padding: 14, marginBottom: 18 }}>
            {loading ? (
              <Text style={{ fontSize: 13, color: C.textDim }}>로딩 중...</Text>
            ) : (
              <>
                <Heatmap data={user?.heatmap ?? {}} />
                {(!user?.heatmap || Object.keys(user.heatmap).length === 0) && (
                  <Text style={{ fontSize: 13, color: C.text2, textAlign: 'center', marginTop: 8 }}>
                    {user.xp > 0 ? '최근 학습 기록이 없어요. 잔디를 다시 심어보아요!' : '아직 학습 기록이 없어요. 첫 잔디를 심어보세요!'}
                  </Text>
                )}
              </>
            )}
          </View>
        </Animated.View>

        {/* 업적 */}
        <Animated.View entering={FadeInDown.springify().damping(14).delay(180)}>
          <SecRow label="업적" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between' }}>
            {achievements.map((item, index) => (
              <Pressable
                key={index}
                onPress={() => { setSelectedAchievement(item); setAchievementModalVisible(true); }}
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
        </Animated.View>
      </ScrollView>

      {achievementModalVisible && (
        <AchievementDetailModal
          visible={achievementModalVisible}
          achievement={selectedAchievement}
          onClose={() => setAchievementModalVisible(false)}
        />
      )}
    </>
  );
};

export default MyPageScreen;
