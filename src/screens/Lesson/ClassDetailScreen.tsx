import React from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import {
  ArrowLeft, BookmarkSimple, CheckCircle, PlayCircle, LockSimple,
  ArrowCounterClockwise, Exam, Gift, Play, LockKeyOpen, SealCheck,
} from 'phosphor-react-native';
import { v2 } from '../../theme/v2Tokens';
import type { LearnTabStackParamList } from '../../navigation/types';

const C = v2.colors;
const ACC = C.accent;

// 목차(고정 목업 데이터 — 디테일 연동은 추후)
const SYL = [
  { sec: '01 시작하기', items: ['코딩이란?', '개발 환경 설정'] },
  { sec: '02 함수와 배열', items: ['배열 기초', 'map & filter', 'reduce 심화'] },
  { sec: '03 실전 프로젝트', items: ['할 일 앱 만들기', '데이터 변환기', '배포하기'] },
];
const TOTAL = SYL.reduce((a, s) => a + s.items.length, 0);

type RowState = 'done' | 'current' | 'free' | 'lock' | 'upcoming';

function Bar({ v, h = 5 }: { v: number; h?: number }) {
  return (
    <View style={{ height: h, backgroundColor: C.borderControl, borderRadius: 999, overflow: 'hidden' }}>
      <View style={{ width: `${Math.max(0, Math.min(100, v))}%`, height: '100%', backgroundColor: ACC }} />
    </View>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ borderWidth: 1, borderColor: C.info, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
      <Text style={{ fontSize: 11, fontWeight: '700', color: C.info }}>{children}</Text>
    </View>
  );
}

function SyllabusRow({ title, st }: { title: string; st: RowState }) {
  const col = st === 'lock' ? C.textDim : st === 'done' ? ACC : C.text2;
  const Icon = st === 'done' ? CheckCircle : st === 'lock' ? LockSimple : PlayCircle;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 12, borderRadius: 9, backgroundColor: st === 'current' ? C.elevated : 'transparent', borderWidth: 1, borderColor: st === 'current' ? C.borderControl : 'transparent' }}>
      <Icon size={st === 'lock' ? 16 : 19} color={col} weight={st === 'done' ? 'fill' : 'regular'} />
      <Text style={{ flex: 1, fontSize: 14, fontWeight: st === 'current' ? '700' : '500', color: st === 'lock' ? C.textDim : C.text }} numberOfLines={1}>{title}</Text>
      {st === 'current' && <Text style={{ fontSize: 11, fontWeight: '700', color: ACC }}>이어서</Text>}
      {st === 'free' && (
        <View style={{ backgroundColor: C.accentTint, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 }}>
          <Text style={{ fontSize: 10.5, fontWeight: '700', color: ACC }}>무료</Text>
        </View>
      )}
      {st === 'done' && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <ArrowCounterClockwise size={13} color={ACC} />
          <Text style={{ fontSize: 11.5, fontWeight: '700', color: ACC }}>복습</Text>
        </View>
      )}
    </View>
  );
}

const ClassDetailScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<LearnTabStackParamList, 'ClassDetail'>>();
  const insets = useSafeAreaInsets();
  const { cls, variant, intent } = route.params;

  const done = variant === 'done';
  const enrolled = variant === 'enrolled';
  const allFree = variant === 'free';
  const paywall = variant === 'paywall';
  const tested = cls?.state === 'tested';

  const doneCount = done ? TOTAL : enrolled ? 3 : allFree ? 2 : 2;
  const pct = Math.round((doneCount / TOTAL) * 100);
  const title = cls?.t || 'JavaScript 배열 마스터';

  const stateOf = (gi: number): RowState => {
    if (done) return 'done';
    if (enrolled) return gi < 3 ? 'done' : gi === 3 ? 'current' : 'upcoming';
    if (allFree) return gi < 2 ? 'done' : gi === 2 ? 'current' : 'upcoming';
    return gi < 2 ? 'done' : gi === 2 ? 'free' : 'lock'; // paywall
  };

  const tag = done ? { t: '수강 완료', c: ACC, bg: C.accentTint }
    : allFree ? { t: '전체 무료', c: ACC, bg: C.accentTint }
    : enrolled ? { t: '수강 중', c: C.text2, bg: C.elevated }
    : { t: '수강 전', c: C.text2, bg: C.elevated };

  const showTestOut = (enrolled || allFree) && !done;

  let gi = -1;

  return (
    <View style={{ flex: 1, backgroundColor: C.base }}>
      {/* 앱바: 뒤로 + 북마크 */}
      <View style={{ paddingTop: Math.max(insets.top, 10) }}>
        <View style={{ height: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14 }}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={8} style={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center' }}>
            <ArrowLeft size={21} color={C.text} />
          </Pressable>
          <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: C.textDim }} numberOfLines={1}>클래스</Text>
          <Pressable hitSlop={8} style={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center' }}>
            <BookmarkSimple size={19} color={C.text2} />
          </Pressable>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        {/* 헤더: 상품명 + 메타 */}
        <View style={{ paddingHorizontal: 20, paddingTop: 6, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: C.border }}>
          <View style={{ flexDirection: 'row', gap: 14 }}>
            <View style={{ width: 54, height: 54, borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.elevated2, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontFamily: v2.font.mono, fontSize: 18, fontWeight: '700', color: C.text2 }}>JS</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 19, fontWeight: '700', color: C.text, letterSpacing: -0.3 }}>{title}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                <Badge>중급</Badge>
                <Text style={{ fontSize: 13, color: C.textDim }}>{TOTAL}강 · 약 2시간</Text>
                <View style={{ backgroundColor: tag.bg, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: tag.c }}>{tag.t}</Text>
                </View>
              </View>
            </View>
          </View>

          {/* 테스트 통과로 완료된 클래스 안내 */}
          {tested && (
            <View style={{ marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: C.accentTint, borderWidth: 1, borderColor: 'rgba(52,211,153,0.28)', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12 }}>
              <SealCheck size={18} color={ACC} weight="fill" />
              <Text style={{ flex: 1, fontSize: 12.5, color: C.text2, lineHeight: 18 }}>개념 테스트를 통과해 완료 처리된 클래스예요. 레슨은 언제든 복습할 수 있어요.</Text>
            </View>
          )}

          {/* 진행률 (완료/수강 중/무료) */}
          {!paywall && (
            <View style={{ marginTop: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={{ fontSize: 12.5, color: C.text2 }}>{done ? '수강 완료' : enrolled ? '이어서 학습 중' : '학습 진행'}</Text>
                <Text style={{ fontFamily: v2.font.mono, fontSize: 12, color: C.textDim }}>{doneCount} / {TOTAL} 완료</Text>
              </View>
              <Bar v={pct} />
            </View>
          )}
          {paywall && (
            <View style={{ marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Gift size={16} color={ACC} />
              <Text style={{ fontSize: 12.5, color: C.text2 }}>처음 3강을 무료로 들어볼 수 있어요.</Text>
            </View>
          )}

          {/* 이미 아는 개념 → 개념 테스트로 완료 처리 */}
          {showTestOut && (
            <View style={{ marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: intent === 'test' ? C.accentTint : C.elevated, borderWidth: 1, borderColor: intent === 'test' ? ACC : C.borderControl, borderRadius: 11, paddingVertical: 12, paddingHorizontal: 13 }}>
              <View style={{ width: 34, height: 34, borderRadius: 9, backgroundColor: C.accentTint, alignItems: 'center', justifyContent: 'center' }}>
                <Exam size={18} color={ACC} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 13.5, fontWeight: '700', color: C.text }}>이미 알고 있나요?</Text>
                <Text style={{ fontSize: 12, color: C.textDim, marginTop: 2 }}>개념 테스트를 통과하면 수강 완료로 처리돼요.</Text>
              </View>
              <Pressable style={{ height: 32, paddingHorizontal: 13, borderRadius: 8, borderWidth: 1, borderColor: ACC, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 12.5, fontWeight: '700', color: ACC }}>테스트 응시</Text>
              </Pressable>
            </View>
          )}
        </View>

        {/* 목차 */}
        <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, paddingHorizontal: 4 }}>
            <Text style={{ fontFamily: v2.font.mono, fontSize: 11, letterSpacing: 0.4, color: C.textDim }}>목차</Text>
            {done && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <ArrowCounterClockwise size={13} color={ACC} />
                <Text style={{ fontSize: 11.5, fontWeight: '700', color: ACC }}>아무 레슨이나 복습</Text>
              </View>
            )}
          </View>
          {SYL.map((s, si) => (
            <View key={si} style={{ marginBottom: 8 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: C.text2, fontFamily: v2.font.mono, paddingHorizontal: 8, paddingTop: 8, paddingBottom: 4 }}>{s.sec}</Text>
              {s.items.map((it, ii) => {
                gi += 1;
                return <SyllabusRow key={ii} title={it} st={stateOf(gi)} />;
              })}
            </View>
          ))}
        </View>
      </ScrollView>

      {/* 하단 CTA */}
      <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 14), borderTopWidth: 1, borderTopColor: C.border }}>
        {paywall ? (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable style={{ flex: 1, height: 48, borderRadius: 11, borderWidth: 1, borderColor: C.borderControl, backgroundColor: C.elevated, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontWeight: '600', fontSize: 13.5, color: C.text }}>무료 3강 듣기</Text>
            </Pressable>
            <Pressable style={{ flex: 1.6, height: 48, borderRadius: 11, backgroundColor: ACC, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 }}>
              <LockKeyOpen size={17} color={C.onAccent} weight="fill" />
              <Text style={{ fontWeight: '700', fontSize: 14.5, color: C.onAccent }}>구매하고 계속 · ₩39,000</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable style={{ width: '100%', height: 48, borderRadius: 11, backgroundColor: ACC, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}>
            {done ? <ArrowCounterClockwise size={18} color={C.onAccent} weight="fill" /> : <Play size={18} color={C.onAccent} weight="fill" />}
            <Text style={{ fontWeight: '700', fontSize: 15, color: C.onAccent }}>
              {done ? '처음부터 복습하기' : enrolled ? '이어서 학습 · map & filter' : '무료로 학습 시작'}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
};

export default ClassDetailScreen;
