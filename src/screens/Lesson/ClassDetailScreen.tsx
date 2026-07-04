import React, { useMemo } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import {
  ArrowLeft, CheckCircle, PlayCircle, ArrowCounterClockwise, Gift, Play, LockKeyOpen,
} from 'phosphor-react-native';
import { v2 } from '../../theme/v2Tokens';
import { useStore } from '../../contexts/StoreContext';
import { useLesson } from '../../contexts/LessonContext';
import type { LearnTabStackParamList } from '../../navigation/types';

const C = v2.colors;
const ACC = C.accent;

// 카테고리명 → 언어 아이콘(상점 상세 진입 시 전달용). 상점 화면과 동일 매핑.
const getCategoryIcon = (categoryName?: string) => {
  const code = (categoryName || '').split('(')[0].trim();
  switch (code) {
    case 'HTML': return require('../../assets/icons/html-5-icon.png');
    case 'CSS': return require('../../assets/icons/css-3-icon.png');
    case 'JS': return require('../../assets/icons/js-icon.png');
    case 'JAVA': return require('../../assets/icons/java-icon.png');
    default: return require('../../assets/icons/js-icon.png');
  }
};

type RowState = 'done' | 'current' | 'upcoming';

function Bar({ v, h = 5 }: { v: number; h?: number }) {
  return (
    <View style={{ height: h, backgroundColor: C.borderControl, borderRadius: 999, overflow: 'hidden' }}>
      <View style={{ width: `${Math.max(0, Math.min(100, v))}%`, height: '100%', backgroundColor: ACC }} />
    </View>
  );
}

function SyllabusRow({ title, st, onPress }: { title: string; st: RowState; onPress?: () => void }) {
  const col = st === 'done' ? ACC : C.text2;
  const Icon = st === 'done' ? CheckCircle : PlayCircle;
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: C.elevated2 }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 12, borderRadius: 9, backgroundColor: st === 'current' ? C.elevated : 'transparent', borderWidth: 1, borderColor: st === 'current' ? C.borderControl : 'transparent' }}
    >
      <Icon size={19} color={col} weight={st === 'done' ? 'fill' : 'regular'} />
      <Text style={{ flex: 1, fontSize: 14, fontWeight: st === 'current' ? '700' : '500', color: C.text }} numberOfLines={1}>{title}</Text>
      {st === 'current' && <Text style={{ fontSize: 11, fontWeight: '700', color: ACC }}>이어서</Text>}
      {st === 'done' && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <ArrowCounterClockwise size={13} color={ACC} />
          <Text style={{ fontSize: 11.5, fontWeight: '700', color: ACC }}>복습</Text>
        </View>
      )}
    </Pressable>
  );
}

const ClassDetailScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<LearnTabStackParamList, 'ClassDetail'>>();
  const insets = useSafeAreaInsets();
  const { cls, variant } = route.params;
  const productId = cls.productId;

  const { productIndex, categoryIndex } = useStore();
  const { lessons, setActiveProduct } = useLesson();

  const enrolledP = useMemo(() => lessons.find((p) => p.id === productId), [lessons, productId]);
  const storeP = productIndex.get(productId);
  const product: any = enrolledP || storeP;

  const done = variant === 'done';
  const enrolled = variant === 'enrolled' || variant === 'done';
  const paywall = variant === 'paywall';

  // 실제 목차(섹션 → 레슨) + 완료 상태
  const { sections, total, doneCount, currentLessonId, firstLessonId } = useMemo(() => {
    const doneIds = new Set((enrolledP?.status || []).filter((s) => s.status === 2).map((s) => s.lesson_id));
    const secs = (product?.Classes || []).flatMap((cl: any) => cl.Sections || []);
    const all = secs.flatMap((s: any) => s.Lessons || []);
    const dc = all.filter((l: any) => doneIds.has(l.id)).length;
    const cur = enrolledP ? (all.find((l: any) => !doneIds.has(l.id))?.id ?? null) : null;
    return {
      sections: secs.map((s: any) => ({
        ...s,
        Lessons: (s.Lessons || []).map((l: any) => ({
          id: l.id,
          name: l.name,
          st: (doneIds.has(l.id) ? 'done' : l.id === cur ? 'current' : 'upcoming') as RowState,
        })),
      })),
      total: all.length || storeP?.lessonCount || cls.lessons || 0,
      doneCount: dc,
      currentLessonId: cur,
      firstLessonId: (all[0]?.id ?? null) as number | null,
    };
  }, [product, enrolledP, storeP, cls.lessons]);

  const pct = total ? Math.round((doneCount / total) * 100) : 0;
  const title = cls.t || product?.name || '클래스';
  const price = storeP?.price ?? 0;

  const tag = done ? { t: '수강 완료', c: ACC, bg: C.accentTint }
    : variant === 'free' ? { t: '전체 무료', c: ACC, bg: C.accentTint }
    : variant === 'enrolled' ? { t: '수강 중', c: C.text2, bg: C.elevated }
    : { t: '수강 전', c: C.text2, bg: C.elevated };

  // 수강 중/완료 → 해당 레슨으로 바로 학습(목록 페이지 거치지 않음). 미수강 → 상품 상세(수강 등록/구매).
  const goLesson = (lessonId: number | null, mode: 'learn' | 'review') => {
    if (!lessonId) return;
    setActiveProduct(productId);
    navigation.navigate('LessonFlow', {
      screen: 'LessonLearning',
      params: { lessonId, myclassId: enrolledP?.myclass_id, mode },
    });
  };
  const goDetail = () => {
    navigation.navigate('LessonFlow', {
      screen: 'LessonDetail',
      params: { id: productId, name: title, icon: getCategoryIcon(categoryIndex.get(productId)), description: product?.description || '', price },
    });
  };
  // 하단 CTA: 이어서 학습(현재 레슨) / 완료면 처음부터 복습(첫 레슨).
  const onPrimary = () => (enrolled ? goLesson(done ? firstLessonId : (currentLessonId ?? firstLessonId), done ? 'review' : 'learn') : goDetail());
  // 목차 레슨 탭: 수강 중이면 해당 레슨 바로 학습(완료 레슨은 복습), 미수강이면 상품 상세.
  const onRowLesson = (l: { id: number; st: RowState }) => (enrolled ? goLesson(l.id, l.st === 'done' ? 'review' : 'learn') : goDetail());

  return (
    <View style={{ flex: 1, backgroundColor: C.base }}>
      {/* 앱바: 뒤로 */}
      <View style={{ paddingTop: Math.max(insets.top, 10) }}>
        <View style={{ height: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14 }}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={8} style={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center' }}>
            <ArrowLeft size={21} color={C.text} />
          </Pressable>
          <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: C.textDim }} numberOfLines={1}>클래스</Text>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        {/* 헤더: 상품명 + 실제 메타 */}
        <View style={{ paddingHorizontal: 20, paddingTop: 6, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: C.border }}>
          <Text style={{ fontSize: 20, fontWeight: '700', color: C.text, letterSpacing: -0.3 }}>{title}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 7, flexWrap: 'wrap' }}>
            <Text style={{ fontSize: 13, color: C.textDim }}>{total}강</Text>
            <View style={{ backgroundColor: tag.bg, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: tag.c }}>{tag.t}</Text>
            </View>
            {paywall && price > 0 ? (
              <Text style={{ fontSize: 13, color: C.textDim }}>₩{price.toLocaleString()}</Text>
            ) : null}
          </View>
          {!!product?.description && (
            <Text style={{ fontSize: 13, color: C.text3, marginTop: 10, lineHeight: 19 }}>{product.description}</Text>
          )}

          {/* 진행률 (수강 중/완료) */}
          {enrolled && total > 0 && (
            <View style={{ marginTop: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={{ fontSize: 12.5, color: C.text2 }}>{done ? '수강 완료' : '이어서 학습 중'}</Text>
                <Text style={{ fontFamily: v2.font.mono, fontSize: 12, color: C.textDim }}>{doneCount} / {total} 완료</Text>
              </View>
              <Bar v={pct} />
            </View>
          )}
          {paywall && (
            <View style={{ marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Gift size={16} color={ACC} />
              <Text style={{ fontSize: 12.5, color: C.text2 }}>구매하면 모든 레슨을 들을 수 있어요.</Text>
            </View>
          )}
        </View>

        {/* 목차 — 실제 섹션/레슨 */}
        <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, paddingHorizontal: 4 }}>
            <Text style={{ fontFamily: v2.font.mono, fontSize: 11, letterSpacing: 0.4, color: C.textDim }}>목차</Text>
          </View>
          {!product ? (
            <View style={{ paddingVertical: 32, alignItems: 'center' }}><ActivityIndicator size="small" color={ACC} /></View>
          ) : sections.length === 0 ? (
            <Text style={{ color: C.textDim, fontSize: 13, paddingVertical: 24, textAlign: 'center' }}>아직 목차가 없어요.</Text>
          ) : (
            sections.map((s: any, si: number) => (
              <View key={s.id ?? si} style={{ marginBottom: 8 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: C.text2, fontFamily: v2.font.mono, paddingHorizontal: 8, paddingTop: 8, paddingBottom: 4 }}>
                  {String(si + 1).padStart(2, '0')} {s.name}
                </Text>
                {s.Lessons.map((l: any) => (
                  <SyllabusRow key={l.id} title={l.name} st={l.st} onPress={() => onRowLesson(l)} />
                ))}
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* 하단 CTA */}
      <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 14), borderTopWidth: 1, borderTopColor: C.border }}>
        {paywall ? (
          <Pressable onPress={goDetail} style={{ width: '100%', height: 48, borderRadius: 11, backgroundColor: ACC, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 }}>
            <LockKeyOpen size={17} color={C.onAccent} weight="fill" />
            <Text style={{ fontWeight: '700', fontSize: 14.5, color: C.onAccent }}>
              {price > 0 ? `구매하고 시작 · ₩${price.toLocaleString()}` : '학습 시작'}
            </Text>
          </Pressable>
        ) : (
          <Pressable onPress={onPrimary} style={{ width: '100%', height: 48, borderRadius: 11, backgroundColor: ACC, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}>
            {done ? <ArrowCounterClockwise size={18} color={C.onAccent} weight="fill" /> : <Play size={18} color={C.onAccent} weight="fill" />}
            <Text style={{ fontWeight: '700', fontSize: 15, color: C.onAccent }}>
              {done ? '처음부터 복습하기' : enrolled ? '이어서 학습' : '무료로 학습 시작'}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
};

export default ClassDetailScreen;
