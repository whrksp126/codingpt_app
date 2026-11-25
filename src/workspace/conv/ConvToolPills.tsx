// 채팅 컴포저 도구줄 오른쪽 — [모델 · 노력] 칩 하나 + [사용량 링].
//  2026-11-25 Claude 앱 문법(사용자 요청 "실제 Claude 앱 수준"):
//  · 모델과 추론 강도는 칩 하나("Opus · 중간") → 바텀시트 "모델 선택"(모델 목록 + 노력 단계).
//  · 사용량 링 → 바텀시트 "사용량"(컨텍스트 창 막대·토큰, 플랜 사용량: 현재 세션·주간 한도와 초기화 시각).
//  PC conv-view.js 도구줄과 같은 정보(자리만 모바일 관용 — 팝오버 대신 시트).
import React, { useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Check, CaretDown } from 'phosphor-react-native';

import { v2 } from '../../theme/v2Tokens';
import { useTheme } from '../../contexts/ThemeContext';
import { PressableRow, PressableScale } from '../../components/ui';
import Sheet from '../../components/ui/Sheet';
import { haptic } from '../../animations/haptics';
import * as i18n from '../../i18n/index.ts';
import { effortLabel, fmtReset, fmtTokens, modelShort, type UsageView } from './convModel';

type Pop = 'model' | 'usage' | null;

export default function ConvToolPills({ models, curModel, onPickModel, efforts, effortDefault, effort, onPickEffort, busy, usage }: {
  models: Array<{ id: string; label: string }>;
  curModel: string | null;
  onPickModel: (id: string) => void;
  efforts: string[];
  effortDefault: string | null;
  effort: string;
  onPickEffort: (level: string) => void;
  busy: boolean;
  usage: UsageView | null;
}) {
  useTheme();
  const C = v2.colors;
  const [pop, setPop] = useState<Pop>(null);
  const open = (w: Exclude<Pop, null>) => { haptic.keyPress(); setPop(w); };

  const isOn = (id: string) => {
    // 별칭(opus)과 실제 id(claude-opus-4-1-…)가 섞여 온다 — 낱말 경계로 같은 모델인지 본다.
    const cur = String(curModel || '');
    return !!cur && (cur === id || modelShort(cur) === modelShort(id) || cur.split(/[-_/\s]/).includes(id));
  };
  const onModel = models.find((m) => isOn(m.id));
  const modelTxt = onModel ? onModel.label : curModel ? modelShort(curModel) : i18n.t('기본 모델');
  const effCur = effort || effortDefault || '';
  const effIdx = Math.max(0, efforts.indexOf(effCur));
  const effTxt = efforts.length ? (effort ? effortLabel(effort) : effortDefault ? effortLabel(effortDefault) : '') : '';

  // 링 = 컨텍스트 점유율. 컨텍스트를 모르면(모델 창 크기 미상) 현재 세션 한도로 대신한다.
  const ring = usage ? (usage.pct != null ? usage.pct : usage.session ? usage.session.pct : null) : null;
  const R = 7.5; const CIRC = 2 * Math.PI * R;
  const hasChip = models.length > 0 || efforts.length > 0;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1 }}>
      {hasChip ? (
        <PressableScale onPress={() => open('model')} disabled={busy} hitSlop={6} scaleTo={0.97} accessibilityRole="button"
          accessibilityLabel={models.length ? i18n.t('모델') : i18n.t('추론 강도')}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 28, paddingHorizontal: 10, borderRadius: 999, backgroundColor: C.elevated2, opacity: busy ? 0.55 : 1, flexShrink: 1 }}>
          <Text numberOfLines={1} style={{ color: C.text2, fontSize: v2.font.size.small, fontWeight: '500', flexShrink: 1 }}>
            {models.length ? modelTxt : ''}{models.length && effTxt ? ' ' : ''}{effTxt ? <Text style={{ color: C.text3, fontWeight: '400' }}>{effTxt}</Text> : null}
          </Text>
          {busy ? <ActivityIndicator size="small" color={C.textDim} style={{ transform: [{ scale: 0.6 }] }} /> : <CaretDown size={10} color={C.textDim} weight="bold" />}
        </PressableScale>
      ) : null}
      {ring != null ? (
        <PressableScale onPress={() => open('usage')} hitSlop={8} scaleTo={0.94} accessibilityRole="button" accessibilityLabel={i18n.t('사용량')}
          style={{ height: 28, paddingHorizontal: 7, alignItems: 'center', justifyContent: 'center' }}>
          <Svg width={18} height={18} viewBox="0 0 20 20">
            <Circle cx={10} cy={10} r={R} fill="none" stroke={C.borderControl} strokeWidth={2.4} />
            <Circle cx={10} cy={10} r={R} fill="none" stroke={ring >= 80 ? C.warn : C.text2} strokeWidth={2.4} strokeLinecap="round"
              strokeDasharray={`${CIRC} ${CIRC}`} strokeDashoffset={CIRC * (1 - ring / 100)} transform="rotate(-90 10 10)" />
          </Svg>
        </PressableScale>
      ) : null}

      {/* 모델 선택 — 모델 목록(체크) + 노력 단계 트랙 */}
      <Sheet visible={pop === 'model'} onClose={() => setPop(null)} title={i18n.t('모델 선택')} paddingHorizontal={10} maxHeightPct={0.75}>
        <View>
          {models.map((m) => {
            const on = isOn(m.id);
            return (
              <PressableRow key={m.id} radius={v2.radius.md} accessibilityLabel={m.label} onPress={() => { haptic.select(); setPop(null); if (!on) onPickModel(m.id); }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, minHeight: 52 }}>
                <Text numberOfLines={1} style={{ flex: 1, color: C.text, fontSize: v2.font.size.body, fontWeight: on ? '600' : '400' }}>{m.label}</Text>
                {on ? <Check size={17} color={C.text} weight="bold" /> : null}
              </PressableRow>
            );
          })}
          {efforts.length ? (
            <View style={{ marginTop: models.length ? 10 : 0, marginHorizontal: 2, padding: 14, borderRadius: v2.radius.xl, backgroundColor: C.elevated2, gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                <Text style={{ color: C.text, fontSize: v2.font.size.body, fontWeight: '500' }}>{i18n.t('노력')}</Text>
                <View style={{ flex: 1 }} />
                <Text style={{ color: C.text2, fontSize: v2.font.size.small, fontWeight: '600' }}>{effortLabel(efforts[effIdx])}</Text>
              </View>
              {/* 단계 트랙 — 눈금마다 터치 영역. 지금 단계까지 진하게. */}
              <View style={{ height: 32, justifyContent: 'center' }}>
                <View style={{ position: 'absolute', left: 10, right: 10, height: 3, borderRadius: 2, backgroundColor: C.borderControl }} />
                <View style={{ position: 'absolute', left: 10, height: 3, borderRadius: 2, backgroundColor: C.text2,
                  width: efforts.length > 1 ? `${(effIdx / (efforts.length - 1)) * 100}%` as any : 0 }} />
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  {efforts.map((lv, i) => (
                    <Pressable key={lv} hitSlop={8} accessibilityRole="button" accessibilityLabel={effortLabel(lv)}
                      onPress={() => { haptic.select(); onPickEffort(lv); }}
                      style={{ width: 20, height: 32, alignItems: 'center', justifyContent: 'center' }}>
                      <View style={{ width: i === effIdx ? 16 : 8, height: i === effIdx ? 16 : 8, borderRadius: 8,
                        backgroundColor: i <= effIdx ? C.text2 : C.borderControl, borderWidth: i === effIdx ? 2 : 0, borderColor: C.elevated2 }} />
                    </Pressable>
                  ))}
                </View>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: C.textDim, fontSize: v2.font.size.caption }}>{i18n.t('더 빠르게')}</Text>
                <PressableScale onPress={() => { haptic.select(); onPickEffort(''); }} hitSlop={6}>
                  <Text style={{ color: C.text3, fontSize: v2.font.size.caption }}>
                    {effortDefault ? i18n.t('기본값 ({name})', { name: effortLabel(effortDefault) }) : i18n.t('기본값')}
                  </Text>
                </PressableScale>
                <Text style={{ color: C.textDim, fontSize: v2.font.size.caption }}>{i18n.t('더 스마트하게')}</Text>
              </View>
            </View>
          ) : null}
        </View>
      </Sheet>

      {/* 사용량 — 컨텍스트 창 + 플랜 사용량(현재 세션 · 주간 한도) */}
      <Sheet visible={pop === 'usage'} onClose={() => setPop(null)} title={i18n.t('사용량')} paddingHorizontal={14} maxHeightPct={0.8}>
        {usage ? <UsageBody u={usage} /> : null}
      </Sheet>
    </View>
  );
}

function Bar({ pct }: { pct: number }) {
  const C = v2.colors;
  return (
    <View style={{ height: 5, borderRadius: 3, backgroundColor: C.borderControl, overflow: 'hidden', marginTop: 8 }}>
      <View style={{ width: `${Math.max(pct > 0 ? 2 : 0, pct)}%`, height: 5, borderRadius: 3, backgroundColor: pct >= 80 ? C.warn : C.text2 }} />
    </View>
  );
}

function Card({ title, pct, sub }: { title: string; pct: number | null; sub?: string }) {
  const C = v2.colors;
  return (
    <View style={{ padding: 14, borderRadius: v2.radius.xl, backgroundColor: C.elevated2, marginBottom: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
        <Text style={{ flex: 1, color: C.text, fontSize: v2.font.size.body, fontWeight: '500' }}>{title}</Text>
        {pct != null ? <Text style={{ color: C.text3, fontSize: v2.font.size.small }}>{i18n.t('{n}% 사용됨', { n: pct })}</Text> : null}
      </View>
      {pct != null ? <Bar pct={pct} /> : null}
      {sub ? <Text style={{ color: C.textDim, fontSize: v2.font.size.caption, marginTop: 8 }}>{sub}</Text> : null}
    </View>
  );
}

function Section({ title }: { title: string }) {
  const C = v2.colors;
  return <Text style={{ color: C.text3, fontSize: v2.font.size.small, marginTop: 6, marginBottom: 8, marginLeft: 2 }}>{title}</Text>;
}

function UsageBody({ u }: { u: UsageView }) {
  const C = v2.colors;
  const ctxSub = u.tokens != null
    ? (u.max ? i18n.t('{max} 중 {n} 토큰', { max: fmtTokens(u.max), n: fmtTokens(u.tokens) }) : i18n.t('{n} 토큰', { n: fmtTokens(u.tokens) }))
    : '';
  return (
    <View>
      <Section title={i18n.t('컨텍스트')} />
      <Card title={i18n.t('컨텍스트 창')} pct={u.pct} sub={[u.model ? modelShort(u.model) : '', ctxSub].filter(Boolean).join(' · ')} />
      {u.pct != null && u.pct >= 80 ? (
        <Text style={{ color: C.text3, fontSize: v2.font.size.small, marginBottom: 8, marginHorizontal: 2, lineHeight: 19 }}>
          {i18n.t('컨텍스트가 거의 찼어요. 곧 대화가 자동으로 압축돼요.')}
        </Text>
      ) : null}
      {u.session || u.weekly ? (
        <>
          <Section title={i18n.t('플랜 사용량')} />
          {u.session ? <Card title={i18n.t('현재 세션')} pct={u.session.pct} sub={u.session.resetsAt ? i18n.t('{t}에 초기화', { t: fmtReset(u.session.resetsAt) }) : undefined} /> : null}
          {u.weekly ? <Card title={i18n.t('주간 한도')} pct={u.weekly.pct} sub={u.weekly.resetsAt ? i18n.t('{t}에 초기화', { t: fmtReset(u.weekly.resetsAt) }) : undefined} /> : null}
        </>
      ) : null}
    </View>
  );
}
