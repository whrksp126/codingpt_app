// 채팅 컴포저 도구줄 오른쪽 — [모델] [추론 강도] [사용량 링]. PC conv-view.js 도구줄의 미러(같은 순서·문구·동작).
//  · 모델: 데몬이 목록을 줄 때만. 누르면 버튼 위 오른쪽 정렬 팝오버(PC _toggleModelMenu).
//  · 추론 강도: 그 에이전트 CLI 가 단계를 알려 줄 때만. 팝오버 = "노력 [값]" · 더 빠르게 ↔ 더 스마트하게 단계 트랙 · 기본값(PC _toggleEffortPop).
//  · 사용량 링: 컨텍스트 점유율. 누르면 상세(PC _toggleUsagePop).
import React, { useCallback, useRef, useState } from 'react';
import { View, Text, Modal, Pressable, useWindowDimensions, ActivityIndicator } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Check } from 'phosphor-react-native';

import { v2 } from '../../theme/v2Tokens';
import { PressableRow, PressableScale } from '../../components/ui';
import { haptic } from '../../animations/haptics';
import * as i18n from '../../i18n/index.ts';
import { effortLabel, modelShort } from './convModel';

const C = v2.colors;
type Anchor = { bottom: number; right: number };
type Pop = 'model' | 'effort' | 'usage' | null;

export default function ConvToolPills({ models, curModel, onPickModel, efforts, effortDefault, effort, onPickEffort, busy, usage }: {
  models: Array<{ id: string; label: string }>;
  curModel: string | null;
  onPickModel: (id: string) => void;
  efforts: string[];
  effortDefault: string | null;
  effort: string;
  onPickEffort: (level: string) => void;
  busy: boolean;
  usage: { model: string | null; pct: number | null } | null;
}) {
  const { width: winW, height: winH } = useWindowDimensions();
  const [pop, setPop] = useState<Pop>(null);
  const [at, setAt] = useState<Anchor>({ bottom: 120, right: 8 });
  const refs = { model: useRef<View>(null), effort: useRef<View>(null), usage: useRef<View>(null) };
  const open = useCallback((which: Exclude<Pop, null>) => {
    haptic.keyPress();
    // 먼저 연다(측정 콜백이 안 오는 환경에서도 열린다) — 앵커는 측정되는 대로 맞춘다.
    setPop(which);
    refs[which].current?.measureInWindow((x, y, w) => {
      if ([x, y, w].every(Number.isFinite)) setAt({ bottom: Math.max(8, winH - y + 6), right: Math.max(6, winW - (x + w)) });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [winW, winH]);

  const isOn = (id: string) => {
    // 별칭(opus)과 실제 id(claude-opus-4-1-…)가 섞여 온다 — 낱말 경계로 같은 모델인지 본다.
    const cur = String(curModel || '');
    return !!cur && (cur === id || modelShort(cur) === modelShort(id) || cur.split(/[-_/\s]/).includes(id));
  };
  const onModel = models.find((m) => isOn(m.id));
  const modelTxt = onModel ? onModel.label : curModel ? modelShort(curModel) : i18n.t('기본 모델');
  const effTxt = effort ? effortLabel(effort) : i18n.t('기본값');
  const pct = usage && usage.pct != null ? Math.max(0, Math.min(100, usage.pct)) : null;

  // 추론 강도 — 단계 트랙(PC 의 range 슬라이더를 터치용 눈금으로). 기본값이면 CLI 기본 단계에 표시.
  const effCur = effort || effortDefault || '';
  const effIdx = Math.max(0, efforts.indexOf(effCur));

  const R = 7.5; const CIRC = 2 * Math.PI * R;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1 }}>
      {models.length ? (
        <View ref={refs.model} collapsable={false} style={{ flexShrink: 1 }}>
          <Tool onPress={() => open('model')} disabled={busy} label={i18n.t('모델')}>
            <Text numberOfLines={1} style={{ color: C.text2, fontSize: v2.font.size.small, maxWidth: 130 }}>{modelTxt}</Text>
          </Tool>
        </View>
      ) : null}
      {efforts.length ? (
        <View ref={refs.effort} collapsable={false}>
          <Tool onPress={() => open('effort')} disabled={busy} label={i18n.t('추론 강도')}>
            <Text numberOfLines={1} style={{ color: C.text2, fontSize: v2.font.size.small }}>{effTxt}</Text>
          </Tool>
        </View>
      ) : null}
      {pct != null ? (
        <View ref={refs.usage} collapsable={false}>
          <Tool onPress={() => open('usage')} label={i18n.t('사용량')}>
            <Svg width={18} height={18} viewBox="0 0 20 20">
              <Circle cx={10} cy={10} r={R} fill="none" stroke={C.borderControl} strokeWidth={2.4} />
              <Circle cx={10} cy={10} r={R} fill="none" stroke={pct >= 80 ? C.warn : C.text2} strokeWidth={2.4} strokeLinecap="round"
                strokeDasharray={`${CIRC} ${CIRC}`} strokeDashoffset={CIRC * (1 - pct / 100)} transform="rotate(-90 10 10)" />
            </Svg>
          </Tool>
        </View>
      ) : null}
      {busy ? <ActivityIndicator size="small" color={C.textDim} style={{ transform: [{ scale: 0.7 }] }} /> : null}

      <Modal visible={pop != null} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setPop(null)}
        supportedOrientations={['portrait', 'portrait-upside-down', 'landscape', 'landscape-left', 'landscape-right']}>
        <Pressable style={{ flex: 1 }} onPress={() => setPop(null)}>
          <Pressable onPress={() => { /* 팝오버 안 터치는 닫지 않는다 */ }} style={{
            position: 'absolute', bottom: at.bottom, right: at.right, minWidth: pop === 'effort' ? 288 : 240, maxWidth: winW - 16,
            backgroundColor: C.elevated, borderRadius: v2.radius.lg, borderWidth: 1, borderColor: C.borderControl,
            padding: pop === 'effort' ? 14 : 4, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 8,
          }}>
            {pop === 'model' ? models.map((m) => {
              const on = isOn(m.id);
              return (
                <PressableRow key={m.id} radius={v2.radius.sm} accessibilityLabel={m.label} onPress={() => { setPop(null); if (!on) onPickModel(m.id); }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, minHeight: 44 }}>
                  <Text numberOfLines={1} style={{ flex: 1, color: C.text, fontSize: v2.font.size.body }}>{m.label}</Text>
                  {on ? <Check size={15} color={C.text2} weight="bold" /> : null}
                </PressableRow>
              );
            }) : null}
            {pop === 'effort' ? (
              <View style={{ gap: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                  <Text style={{ color: C.text3, fontSize: v2.font.size.small }}>{i18n.t('노력')}</Text>
                  <Text style={{ color: C.text, fontSize: v2.font.size.small, fontWeight: '600' }}>{effortLabel(efforts[effIdx])}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ color: C.textDim, fontSize: v2.font.size.caption }}>{i18n.t('더 빠르게')}</Text>
                  <Text style={{ color: C.textDim, fontSize: v2.font.size.caption }}>{i18n.t('더 스마트하게')}</Text>
                </View>
                {/* 단계 트랙 — 눈금마다 터치 영역. 지금 단계까지 진하게(range 의 채움과 같은 읽기). */}
                <View style={{ height: 32, justifyContent: 'center' }}>
                  <View style={{ position: 'absolute', left: 10, right: 10, height: 3, borderRadius: 2, backgroundColor: C.borderControl }} />
                  <View style={{ position: 'absolute', left: 10, height: 3, borderRadius: 2, backgroundColor: C.text2,
                    width: efforts.length > 1 ? `${(effIdx / (efforts.length - 1)) * 100}%` as any : 0 }} />
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    {efforts.map((lv, i) => (
                      <Pressable key={lv} hitSlop={8} accessibilityRole="button" accessibilityLabel={effortLabel(lv)}
                        onPress={() => { haptic.keyPress(); onPickEffort(lv); }}
                        style={{ width: 20, height: 32, alignItems: 'center', justifyContent: 'center' }}>
                        <View style={{ width: i === effIdx ? 16 : 8, height: i === effIdx ? 16 : 8, borderRadius: 8,
                          backgroundColor: i <= effIdx ? C.text2 : C.borderControl, borderWidth: i === effIdx ? 2 : 0, borderColor: C.elevated }} />
                      </Pressable>
                    ))}
                  </View>
                </View>
                <PressableScale onPress={() => { setPop(null); onPickEffort(''); }} hitSlop={6} style={{ alignSelf: 'center', paddingHorizontal: 8, paddingVertical: 4 }}>
                  <Text style={{ color: C.text3, fontSize: v2.font.size.small }}>
                    {effortDefault ? i18n.t('기본값 ({name})', { name: effortLabel(effortDefault) }) : i18n.t('기본값')}
                  </Text>
                </PressableScale>
              </View>
            ) : null}
            {pop === 'usage' ? (
              <View style={{ paddingHorizontal: 10, paddingVertical: 8, gap: 4 }}>
                {usage && usage.model ? <Text style={{ color: C.text, fontSize: v2.font.size.body }}>{modelShort(usage.model)}</Text> : null}
                {pct != null ? <Text style={{ color: C.text2, fontSize: v2.font.size.small }}>{i18n.t('컨텍스트 {n}%', { n: Math.round(pct) })}</Text> : null}
              </View>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// 도구 버튼 — PC .conv-tool(높이 26·투명·텍스트2). 터치 목표는 hitSlop 으로 넓힌다.
function Tool({ onPress, disabled, label, children }: { onPress: () => void; disabled?: boolean; label: string; children: React.ReactNode }) {
  return (
    <PressableScale onPress={onPress} disabled={disabled} hitSlop={8} scaleTo={0.97} accessibilityRole="button" accessibilityLabel={label}
      style={{ flexDirection: 'row', alignItems: 'center', height: 28, paddingHorizontal: 7, opacity: disabled ? 0.55 : 1 }}>
      {children}
    </PressableScale>
  );
}
