import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { Check, X, Desktop, Clock, WarningCircle } from 'phosphor-react-native';

import { v2 } from '../../theme/v2Tokens';
import PressableScale from '../ui/PressableScale';
import KeyTextInput from '../keyboard/KeyTextInput';
import { approvalKind, type ApprovalRow } from '../../services/approvalService';

// 원격 승인 카드(기능1) — 폰에서 claude 의 권한 요청/선택 질문에 답한다.
//
// 두 종류(정본 = prompt.kind. 서버 화이트리스트가 최상위 kind 를 통과시키지 않는다):
//  · permission — Bash/Write/Edit… → [허용]/[거절]
//    ⚠ "항상 허용"은 claude 2.1.220 의 PermissionRequest 계약에 없다 → **절대 만들지 않는다**.
//  · choice — AskUserQuestion/ExitPlanMode → 선택지 버튼(라벨 + 설명, multiSelect 지원) + 자유 입력
//
// 마감: deadlineAt(서버 절대 epoch ms — 기기 시계 오차 회피)까지 카운트다운. 지나면 버튼을 닫고
//  "PC 터미널에서 답해주세요"로 바꾼다(만료 후 응답은 서버가 410 으로 막는다).

const monoFamily = () => v2.font.mono as string;

function fmtLeft(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}분 ${String(s % 60).padStart(2, '0')}초` : `${s}초`;
}

/** 남은 시간(1초 갱신). 만료되면 expired=true. */
function useCountdown(deadlineAt: number): { left: number; expired: boolean } {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);
  const left = deadlineAt - now;
  return { left, expired: left <= 0 };
}

function Row({ label, value }: { label: string; value: string }) {
  const C = v2.colors;
  return (
    <View style={{ flexDirection: 'row', gap: 8, marginTop: 3 }}>
      <Text style={{ color: C.textDim, fontSize: 11.5, width: 52 }}>{label}</Text>
      <Text style={{ color: C.text2, fontSize: 11.5, flex: 1, fontFamily: monoFamily() }} numberOfLines={3}>{value}</Text>
    </View>
  );
}

export default function ApprovalCard({
  approval, onRespond, onDismiss, busy, compact,
}: {
  approval: ApprovalRow;
  /** 실제 전송은 상위(컨텍스트)가 한다 — 409/410 처리와 카드 회수가 한 곳에 모여야 한다. */
  onRespond: (decision: 'allow' | 'deny' | 'answer', opts?: { message?: string; answer?: { questionIndex: number; labels: string[]; text?: string | null } }) => void;
  onDismiss?: () => void;
  busy?: boolean;
  /** 배너에서 펼친 축약형(패딩·폰트 축소). */
  compact?: boolean;
}) {
  const C = v2.colors;
  const kind = approvalKind(approval);
  const { left, expired } = useCountdown(approval.deadlineAt);
  const questions = approval.prompt && Array.isArray(approval.prompt.questions) ? approval.prompt.questions : [];
  const q = questions[0];
  const plan = approval.prompt?.plan || '';
  // ★ 선택형인데 질문 목록이 없는 경우 = ExitPlanMode(계획 승인). 데몬이 kind:'choice' + questions:null +
  //  prompt.plan 으로 보낸다. 이 케이스를 선택지 UI 로 다루면 고를 항목이 없어 "보내기"가 영구 비활성이
  //  되고 거절만 가능해진다(= 계획 승인이 폰에서 불가능). 그래서 [거절]/[승인] 2버튼으로 따로 그린다.
  //  데몬은 choice + allow 를 "계획을 승인했습니다. 계획대로 진행하세요." 로 번역하므로 allow 가 정답이다.
  const planApproval = kind === 'choice' && !q;
  const [picked, setPicked] = useState<string[]>([]);
  const [freeText, setFreeText] = useState('');
  const disabled = !!busy || expired || !!approval.claimed;

  const cmd = useMemo(() => {
    const p = approval.inputPreview as Record<string, unknown> | null;
    if (p && typeof p === 'object' && typeof (p as { command?: string }).command === 'string') return (p as { command: string }).command;
    return '';
  }, [approval.inputPreview]);

  const toggle = (label: string) => {
    if (!q) return;
    setPicked((cur) => {
      if (q.multiSelect) return cur.includes(label) ? cur.filter((x) => x !== label) : [...cur, label];
      return [label];
    });
  };

  const submitAnswer = () => {
    const labels = picked.slice();
    const text = freeText.trim();
    if (!labels.length && !text) return;
    onRespond('answer', { answer: { questionIndex: 0, labels, text: text || null } });
  };

  const pad = compact ? 10 : 14;

  return (
    <View style={{ backgroundColor: C.elevated, borderWidth: 1, borderColor: expired ? C.border : C.warn, borderRadius: v2.radius.md, padding: pad }}>
      {/* 헤더 — 무엇을 요청했는지 + 어느 PC 인지 + 남은 시간 */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text style={{ color: C.warn, fontSize: 11.5, fontWeight: '700' }}>승인 필요</Text>
        <Text style={{ color: C.text3, fontSize: 11.5 }}>·</Text>
        <Text style={{ color: C.text2, fontSize: 11.5, fontWeight: '600' }} numberOfLines={1}>{approval.tool || '도구'}</Text>
        <View style={{ flex: 1 }} />
        {expired ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <WarningCircle size={12} color={C.textDim} />
            <Text style={{ color: C.textDim, fontSize: 11 }}>만료</Text>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <Clock size={12} color={left < 30000 ? C.error : C.textDim} />
            <Text style={{ color: left < 30000 ? C.error : C.textDim, fontSize: 11 }}>{fmtLeft(left)}</Text>
          </View>
        )}
      </View>

      {/* 본문 */}
      {kind === 'choice' && q ? (
        <View style={{ marginTop: 8 }}>
          {q.header ? <Text style={{ color: C.accent, fontSize: 11, fontWeight: '700', marginBottom: 3 }}>{q.header}</Text> : null}
          <Text style={{ color: C.text, fontSize: 14, lineHeight: 20 }}>{q.question || approval.summary}</Text>
          {q.multiSelect ? <Text style={{ color: C.textDim, fontSize: 11, marginTop: 3 }}>여러 개 고를 수 있어요</Text> : null}
          <View style={{ marginTop: 9, gap: 6 }}>
            {q.options.map((o, i) => {
              const on = picked.includes(o.label);
              return (
                <PressableScale
                  key={`${i}-${o.label}`}
                  onPress={() => toggle(o.label)}
                  disabled={disabled}
                  style={{
                    borderWidth: 1, borderColor: on ? C.accent : C.borderControl,
                    backgroundColor: on ? C.accentTint : C.elevated2,
                    borderRadius: v2.radius.sm, paddingHorizontal: 11, paddingVertical: 9,
                    opacity: disabled ? 0.5 : 1,
                  }}
                >
                  <Text style={{ color: on ? C.accent : C.text, fontSize: 13.5, fontWeight: '600' }}>{o.label}</Text>
                  {o.description ? <Text style={{ color: C.text3, fontSize: 11.5, marginTop: 2 }}>{o.description}</Text> : null}
                </PressableScale>
              );
            })}
          </View>
          {/* 자유 입력 — 선택지에 없는 답을 그대로 claude 에 전달(answer.text) */}
          <View style={{ marginTop: 8, borderWidth: 1, borderColor: C.borderControl, backgroundColor: C.elevated2, borderRadius: v2.radius.sm, paddingHorizontal: 10, paddingVertical: 7 }}>
            <KeyTextInput
              value={freeText}
              onChangeText={setFreeText}
              editable={!disabled}
              multiline
              placeholder="직접 답하기(선택)"
              placeholderTextColor={C.textDim}
              style={{ color: C.text, fontSize: 13, padding: 0, minHeight: 20, maxHeight: 90, textAlignVertical: 'top' }}
            />
          </View>
        </View>
      ) : (
        <View style={{ marginTop: 8 }}>
          <Text style={{ color: C.text, fontSize: 13.5, lineHeight: 20 }} numberOfLines={compact ? 3 : 6}>
            {approval.summary || approval.tool}
          </Text>
          {plan ? (
            <ScrollView style={{ maxHeight: compact ? 120 : 220, marginTop: 8, backgroundColor: C.base, borderWidth: 1, borderColor: C.border, borderRadius: v2.radius.sm }} contentContainerStyle={{ padding: 10 }}>
              <Text style={{ color: C.text2, fontSize: 12, lineHeight: 18 }}>{plan}</Text>
            </ScrollView>
          ) : null}
          {!compact ? (
            <View style={{ marginTop: 7 }}>
              {approval.relPath ? <Row label="파일" value={approval.relPath} /> : null}
              {cmd && cmd !== approval.summary ? <Row label="명령" value={cmd} /> : null}
              {approval.wsName ? <Row label="폴더" value={approval.wsName} /> : null}
              {approval.diff ? <Row label="변경" value={`${approval.diff.kind}${approval.diff.truncated ? ' (일부 생략)' : ''}`} /> : null}
            </View>
          ) : null}
          {/* 계획 승인은 의견을 함께 보낼 수 있다(선택) — 거절 시 이유, 승인 시 단서를 claude 에 전달한다. */}
          {planApproval && !compact ? (
            <View style={{ marginTop: 8, borderWidth: 1, borderColor: C.borderControl, backgroundColor: C.elevated2, borderRadius: v2.radius.sm, paddingHorizontal: 10, paddingVertical: 7 }}>
              <KeyTextInput
                value={freeText}
                onChangeText={setFreeText}
                editable={!disabled}
                multiline
                placeholder="의견 남기기(선택)"
                placeholderTextColor={C.textDim}
                style={{ color: C.text, fontSize: 13, padding: 0, minHeight: 20, maxHeight: 90, textAlignVertical: 'top' }}
              />
            </View>
          ) : null}
        </View>
      )}

      {/* 요청 기기 */}
      {approval.hostName ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 }}>
          <Desktop size={12} color={C.textDim} />
          <Text style={{ color: C.textDim, fontSize: 11 }}>{approval.hostName}</Text>
        </View>
      ) : null}

      {/* 액션 */}
      {expired ? (
        <View style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ flex: 1, color: C.text3, fontSize: 12 }}>시간이 지났어요 — PC 터미널에서 답해주세요.</Text>
          {onDismiss ? (
            <PressableScale onPress={onDismiss} hitSlop={8} style={{ paddingHorizontal: 12, height: 32, borderRadius: v2.radius.sm, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.borderControl, backgroundColor: C.elevated2 }}>
              <Text style={{ color: C.text2, fontSize: 12.5, fontWeight: '600' }}>닫기</Text>
            </PressableScale>
          ) : null}
        </View>
      ) : planApproval ? (
        // 계획 승인 — 고를 항목이 없으므로 [거절]/[승인]. 의견(freeText)이 있으면 함께 실어 보낸다.
        <View style={{ marginTop: 10, flexDirection: 'row', gap: 8 }}>
          <PressableScale
            onPress={() => onRespond('deny', { message: freeText.trim() || '원격 기기에서 계획을 거절했습니다' })}
            disabled={disabled}
            style={{ paddingHorizontal: 14, height: 38, borderRadius: v2.radius.sm, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.borderControl, backgroundColor: C.elevated2, opacity: disabled ? 0.5 : 1 }}
          >
            <Text style={{ color: C.text2, fontSize: 13, fontWeight: '600' }}>거절</Text>
          </PressableScale>
          <PressableScale
            onPress={() => {
              const text = freeText.trim();
              // 의견이 있으면 answer.text 로, 없으면 순수 allow. 데몬이 둘 다 "계획 승인" 으로 번역한다.
              if (text) onRespond('answer', { answer: { questionIndex: 0, labels: [], text } });
              else onRespond('allow');
            }}
            disabled={disabled}
            style={{
              flex: 1, height: 38, borderRadius: v2.radius.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
              backgroundColor: C.accent, opacity: disabled ? 0.5 : 1,
            }}
          >
            {busy ? <ActivityIndicator size="small" color={C.onAccent} /> : <Check size={15} color={C.onAccent} weight="bold" />}
            <Text style={{ color: C.onAccent, fontSize: 13.5, fontWeight: '700' }}>승인</Text>
          </PressableScale>
        </View>
      ) : kind === 'choice' ? (
        <View style={{ marginTop: 10, flexDirection: 'row', gap: 8 }}>
          <PressableScale
            onPress={() => onRespond('deny', { message: '폰에서 거절' })}
            disabled={disabled}
            style={{ paddingHorizontal: 14, height: 38, borderRadius: v2.radius.sm, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.borderControl, backgroundColor: C.elevated2, opacity: disabled ? 0.5 : 1 }}
          >
            <Text style={{ color: C.text2, fontSize: 13, fontWeight: '600' }}>취소</Text>
          </PressableScale>
          <PressableScale
            onPress={submitAnswer}
            disabled={disabled || (!picked.length && !freeText.trim())}
            style={{
              flex: 1, height: 38, borderRadius: v2.radius.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
              backgroundColor: C.accent, opacity: disabled || (!picked.length && !freeText.trim()) ? 0.5 : 1,
            }}
          >
            {busy ? <ActivityIndicator size="small" color={C.onAccent} /> : <Check size={15} color={C.onAccent} weight="bold" />}
            <Text style={{ color: C.onAccent, fontSize: 13.5, fontWeight: '700' }}>보내기</Text>
          </PressableScale>
        </View>
      ) : (
        <View style={{ marginTop: 10, flexDirection: 'row', gap: 8 }}>
          <PressableScale
            onPress={() => onRespond('deny', { message: '폰에서 거절' })}
            disabled={disabled}
            style={{ flex: 1, height: 38, borderRadius: v2.radius.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: C.borderControl, backgroundColor: C.elevated2, opacity: disabled ? 0.5 : 1 }}
          >
            <X size={15} color={C.error} weight="bold" />
            <Text style={{ color: C.text2, fontSize: 13.5, fontWeight: '600' }}>거절</Text>
          </PressableScale>
          <PressableScale
            onPress={() => onRespond('allow')}
            disabled={disabled}
            style={{ flex: 1, height: 38, borderRadius: v2.radius.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: C.accent, opacity: disabled ? 0.5 : 1 }}
          >
            {busy ? <ActivityIndicator size="small" color={C.onAccent} /> : <Check size={15} color={C.onAccent} weight="bold" />}
            <Text style={{ color: C.onAccent, fontSize: 13.5, fontWeight: '700' }}>허용</Text>
          </PressableScale>
        </View>
      )}
      {approval.claimed && !expired ? (
        <Text style={{ color: C.textDim, fontSize: 11, marginTop: 6 }}>다른 기기가 응답을 처리하고 있어요…</Text>
      ) : null}
    </View>
  );
}
