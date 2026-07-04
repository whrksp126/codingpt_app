// 배우기 홈 — 스토어 active 상품을 클래스 그리드(바둑판)로. 내 수강 건은 진행 상태로 표현.
//  · 타일 = 스토어 카테고리의 상품(is_active 만 백엔드에서 내려옴)
//  · 내 수강(LessonContext)과 대조해 진행률/완료 상태를 오버레이
import React, { useMemo, useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, Dimensions, ActivityIndicator, RefreshControl } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import {
  CheckCircle, SealCheck, ArrowRight, ArrowCounterClockwise,
} from 'phosphor-react-native';
import { HamburgerButton } from '../../components/AppTopBar';
import { v2 } from '../../theme/v2Tokens';
import { useStore } from '../../contexts/StoreContext';
import { useLesson } from '../../contexts/LessonContext';
import type { LearnClass, ClassDetailVariant } from '../../navigation/types';

const C = v2.colors;
const ACC = C.accent;
const SCREEN_W = Dimensions.get('window').width;
const GRID_PAD = 20;
const GRID_GAP = 12;
const TILE_W = Math.floor((SCREEN_W - GRID_PAD * 2 - GRID_GAP) / 2);

// 그리드 타일 = 스토어 상품 + 내 수강 상태. paid: 미수강 유료 → paywall.
type LearnTile = LearnClass & { paid?: boolean; productId: number };

// 상태/유료여부 → 클래스 상세 variant
const variantFor = (c: LearnTile): ClassDetailVariant =>
  c.state === 'done' || c.state === 'tested' ? 'done'
    : c.state === 'current' ? 'enrolled'
      : c.paid ? 'paywall' : 'free';

// ── 범례 ───────────────────────────────────────────────────────────
function Legend() {
  const items = [
    { label: '완료', fill: true },
    { label: '수강 중', ring: true },
    { label: '수강 전', dim: true },
  ];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
      {items.map((it, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: it.fill ? ACC : 'transparent', borderWidth: it.fill ? 0 : 1.5, borderColor: it.dim ? C.borderControl : ACC }} />
          <Text style={{ fontSize: 11.5, color: C.text3 }}>{it.label}</Text>
        </View>
      ))}
    </View>
  );
}

// ── 그리드 타일 ────────────────────────────────────────────────────
function Tile({ c, onOpen }: { c: LearnTile; onOpen: () => void }) {
  const { state } = c;
  const done = state === 'done', tested = state === 'tested', current = state === 'current', todo = state === 'todo';
  const accent = done || tested || current;

  return (
    <Pressable
      onPress={onOpen}
      style={{
        width: TILE_W, minHeight: 142, borderRadius: 14, padding: 13, paddingBottom: 12,
        backgroundColor: accent ? C.surface : C.elevated,
        borderWidth: current ? 1.5 : 1,
        borderColor: current ? ACC : (done || tested) ? 'rgba(52,211,153,0.45)' : C.border,
      }}
    >
      {/* 상단: 셀 번호 + 상태 마크 */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <Text style={{ fontFamily: v2.font.mono, fontSize: 11, fontWeight: '700', letterSpacing: 0.4, color: accent ? ACC : C.textDim }}>{c.n}</Text>
        {done && <CheckCircle size={20} color={ACC} weight="fill" />}
        {tested && <SealCheck size={20} color={ACC} weight="fill" />}
        {current && <Text style={{ fontFamily: v2.font.mono, fontSize: 11, fontWeight: '700', color: ACC }}>{c.pct}%</Text>}
        {todo && <ArrowRight size={16} color={C.textDim} />}
      </View>

      {/* 제목 + 설명 */}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: C.text, letterSpacing: -0.3, lineHeight: 19 }} numberOfLines={2}>{c.t}</Text>
        <Text style={{ fontSize: 11.5, color: C.textDim, marginTop: 4, lineHeight: 16 }} numberOfLines={2}>{c.d}</Text>
      </View>

      {/* 하단: 상태별 표현 */}
      <View style={{ marginTop: 10 }}>
        {current && (
          <View>
            <View style={{ height: 4, backgroundColor: C.borderControl, borderRadius: 999, overflow: 'hidden', marginBottom: 6 }}>
              <View style={{ width: `${c.pct ?? 0}%`, height: '100%', backgroundColor: ACC }} />
            </View>
            <Text style={{ fontSize: 11.5, fontWeight: '700', color: ACC }}>이어서 학습 ›</Text>
          </View>
        )}
        {done && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <ArrowCounterClockwise size={13} color={ACC} />
            <Text style={{ fontSize: 11.5, fontWeight: '700', color: ACC }}>복습하기</Text>
          </View>
        )}
        {todo && (
          <Text style={{ fontSize: 11.5, color: C.text3 }}>{c.lessons}강{c.paid ? ' · 유료' : ''}</Text>
        )}
      </View>
    </Pressable>
  );
}

const LessonListScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { storeData, loading: storeLoading, reloadStoreData } = useStore();
  const { lessons: enrolled, reloadLessons } = useLesson();
  const [refreshing, setRefreshing] = useState(false);

  // 당겨서 새로고침 — 상점/내수강 데이터 갱신. (IndexScreen bootDone 래치로 스플래시 재진입 없음)
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    Promise.all([reloadStoreData(), reloadLessons()]).finally(() => setRefreshing(false));
  }, [reloadStoreData, reloadLessons]);

  // 내 수강: productId → 수강 상품(진행 상태 포함)
  const enrolledById = useMemo(() => {
    const m = new Map<number, (typeof enrolled)[number]>();
    enrolled.forEach((p) => m.set(p.id, p));
    return m;
  }, [enrolled]);

  // 타일 = 스토어 active 상품 + 내 수강 진행 상태
  const tiles = useMemo<LearnTile[]>(() => {
    const products = storeData.flatMap((cat) => cat.Products || []);
    return products.map((p, idx) => {
      const mine = enrolledById.get(p.id);
      let state: LearnTile['state'] = 'todo';
      let pct: number | undefined;
      let paid = false;
      if (mine) {
        const allLessons = (mine.Classes || []).flatMap((cls) => (cls.Sections || []).flatMap((s) => s.Lessons || []));
        const total = allLessons.length || p.lessonCount || 0;
        const doneCount = (mine.status || []).filter((s) => s.status === 2).length;
        const v = total ? Math.round((doneCount / total) * 100) : 0;
        state = v >= 100 ? 'done' : 'current';
        pct = v;
      } else {
        paid = (p.price ?? 0) > 0;
      }
      return {
        n: String(idx + 1).padStart(2, '0'),
        t: p.name,
        d: p.description || '',
        lessons: p.lessonCount ?? 0,
        state,
        pct,
        paid,
        productId: p.id,
      };
    });
  }, [storeData, enrolledById]);

  const open = (c: LearnTile) =>
    navigation.navigate('ClassDetail', { cls: c, variant: variantFor(c) });

  return (
    <View style={{ flex: 1, backgroundColor: C.base }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: GRID_PAD, paddingBottom: 24, paddingTop: Math.max(insets.top, 12) }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} colors={[C.accent]} progressBackgroundColor={C.surface} />}
      >
        {/* 햄버거 + 타이틀 (다른 페이지와 동일하게 햄버거 우측에 타이틀) */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: -8, marginBottom: 2 }}>
          <HamburgerButton color={C.text2} />
          <Text style={{ fontSize: 22, fontWeight: '700', letterSpacing: -0.4, color: C.text }}>배우기</Text>
        </View>

        {/* 범례 */}
        <View style={{ marginTop: 18, marginBottom: 14 }}><Legend /></View>

        {/* 클래스 그리드 */}
        {storeLoading && tiles.length === 0 ? (
          <View style={{ paddingVertical: 48, alignItems: 'center' }}>
            <ActivityIndicator size="small" color={ACC} />
            <Text style={{ color: C.textDim, fontSize: 13, marginTop: 10 }}>학습 콘텐츠를 불러오는 중…</Text>
          </View>
        ) : tiles.length === 0 ? (
          <View style={{ paddingVertical: 48, alignItems: 'center' }}>
            <Text style={{ color: C.textDim, fontSize: 13.5 }}>아직 등록된 학습 콘텐츠가 없어요.</Text>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP }}>
            {tiles.map((c, i) => (
              <Animated.View key={c.productId} entering={FadeInDown.springify().damping(15).delay(Math.min(i, 6) * 45)}>
                <Tile c={c} onOpen={() => open(c)} />
              </Animated.View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
};

export default LessonListScreen;
