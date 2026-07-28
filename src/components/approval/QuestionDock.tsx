import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { X, PencilSimple, Check } from 'phosphor-react-native';

import { v2 } from '../../theme/v2Tokens';
import PressableScale from '../ui/PressableScale';
import { useWorkspaceShell } from '../../contexts/WorkspaceShellContext';
import { approvalKind, type ApprovalRow } from '../../services/approvalService';

// 질문 도크 — 컴포저 **바로 위에 고정**되는 카드(사용자 지정 형태, Claude Code 의 AskUserQuestion 도크).
//
// 세 가지를 동시에 만족해야 한다:
//  ① 대화 스크롤 **안**에 들어가지 않는다 — 답하는 중에 새 메시지가 붙어 질문이 위로 밀려 사라지면 안 된다.
//     (짝으로, 답하기 전까지 그 질문은 **대화 내역에도 안 넣는다** — ChatBody 가 감춘다. 같은 질문이
//      대화와 도크에 두 번 보이던 문제.)
//  ② 화면 **전역**에 뜨지 않는다 — 다른 터미널을 보고 있을 땐 존재하지 않아야 한다(스코프는 paneApproval).
//  ③ **저절로 사라지지 않는다** — 남은 시간을 세지 않고, 답하거나 ✕ 를 누를 때만 없어진다.
//     (카운트다운을 보여주면 "곧 사라지겠구나" 로 읽힌다 — 사용자 확정 2026-07-28.)
//
// ★ 질문은 **여러 개일 수 있다**(AskUserQuestion 실측: 한 번에 4개). 하나씩 진행하고 마지막에 한 번에
//   보낸다 — 첫 답만 보내면 claude 는 나머지를 못 받은 채 턴을 끝낸다(사용자 신고 증상).
//
// 색: 포인트 컬러를 쓰지 않는다. 선택 상태는 밝기·테두리로만 구분한다.

const NUM = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

/** 이 요청이 물어보는 질문들(0개면 권한/계획 승인). */
export function questionsOf(a: ApprovalRow) {
  const qs = a.prompt && Array.isArray(a.prompt.questions) ? a.prompt.questions : [];
  return qs.filter((q) => q && Array.isArray(q.options));
}

export default function QuestionDock({
  approval, onDismiss,
}: {
  approval: ApprovalRow;
  /** 접기 — 이 탭에서 이번 요청을 숨긴다(응답이 아니다). */
  onDismiss: () => void;
}) {
  const C = v2.colors;
  const S = useWorkspaceShell();
  const kind = approvalKind(approval);
  const questions = questionsOf(approval);
  const planApproval = kind === 'choice' && !questions.length;
  const [step, setStep] = useState(0);
  /** questionIndex → 고른 라벨들. 마지막 질문에서 한 번에 보낸다. */
  const [picked, setPicked] = useState<Record<number, string[]>>({});
  const [busy, setBusy] = useState(false);

  // 요청이 바뀌면 진행 상태를 버린다 — 이전 질문의 선택이 다음 요청에 남으면 오응답이 된다.
  useEffect(() => { setStep(0); setPicked({}); setBusy(false); }, [approval.id]);

  const expired = !!approval.expired;
  const disabled = busy || expired || !!approval.claimed;
  const q = questions[step];
  const last = step >= questions.length - 1;

  const submit = (extra?: Record<number, string[]>) => {
    if (disabled) return;
    const all = { ...picked, ...(extra || {}) };
    const answers = questions
      .map((qq, i) => ({ questionIndex: i, labels: all[i] || [], text: null as string | null, _q: qq }))
      .filter((a) => a.labels.length)
      .map(({ _q, ...a }) => a);
    if (!answers.length) return;
    setBusy(true);
    void S.respondApproval(approval.id, 'answer', { answers }).catch(() => setBusy(false));
  };

  const pick = (label: string) => {
    if (!q || disabled) return;
    if (q.multiSelect) {
      setPicked((cur) => {
        const now = cur[step] || [];
        return { ...cur, [step]: now.includes(label) ? now.filter((x) => x !== label) : [...now, label] };
      });
      return;
    }
    // 단일 선택 = 탭 한 번이 곧 진행. 마지막 질문이면 그대로 전송한다.
    const next = { ...picked, [step]: [label] };
    setPicked(next);
    if (last) submit({ [step]: [label] });
    else setStep(step + 1);
  };

  const rows = useMemo(() => {
    if (q) {
      return q.options.map((o) => ({
        label: o.label, desc: o.description, selected: (picked[step] || []).includes(o.label),
        onPress: () => pick(o.label),
      }));
    }
    if (planApproval) {
      return [
        { label: '계획대로 진행', desc: undefined, selected: false, onPress: () => { setBusy(true); void S.respondApproval(approval.id, 'allow').catch(() => setBusy(false)); } },
        { label: '거절', desc: undefined, selected: false, onPress: () => { setBusy(true); void S.respondApproval(approval.id, 'deny', { message: '원격 기기에서 계획을 거절했습니다' }).catch(() => setBusy(false)); } },
      ];
    }
    return [
      { label: '허용', desc: undefined, selected: false, onPress: () => { setBusy(true); void S.respondApproval(approval.id, 'allow').catch(() => setBusy(false)); } },
      { label: '거절', desc: undefined, selected: false, onPress: () => { setBusy(true); void S.respondApproval(approval.id, 'deny', { message: '폰에서 거절' }).catch(() => setBusy(false)); } },
    ];
    // pick/submit 은 매 렌더 새로 만들어지지만 내부에서 최신 state 를 읽으므로 의존성에서 뺀다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, planApproval, picked, step, disabled, approval.id]);

  const title = q ? (q.question || approval.summary) : (approval.summary || approval.tool);

  return (
    <View style={{ paddingHorizontal: 10, paddingTop: 8 }}>
      <View style={{
        backgroundColor: C.elevated, borderWidth: 1, borderColor: C.borderControl,
        borderRadius: v2.radius.md, overflow: 'hidden',
      }}>
        {/* 제목 줄 — 질문 그대로. 여러 개면 진행도만 덧붙인다(남은 시간은 **표시하지 않는다**). */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 12, paddingTop: 11, paddingBottom: 9 }}>
          <View style={{ flex: 1 }}>
            {questions.length > 1 ? (
              <Text style={{ color: C.text3, fontSize: 11, marginBottom: 3 }}>{step + 1} / {questions.length}</Text>
            ) : null}
            <Text style={{ color: C.text, fontSize: 13.5, lineHeight: 19 }} numberOfLines={4}>{title}</Text>
            {q?.multiSelect ? <Text style={{ color: C.text3, fontSize: 11, marginTop: 3 }}>여러 개 고를 수 있어요</Text> : null}
          </View>
          <PressableScale onPress={onDismiss} hitSlop={10} style={{ marginTop: 1 }}>
            <X size={15} color={C.text3} />
          </PressableScale>
        </View>

        {expired ? (
          <Text style={{ color: C.text3, fontSize: 12, paddingHorizontal: 12, paddingBottom: 12 }}>
            이 요청은 PC 터미널로 넘어갔어요 — 거기서 답해주세요.
          </Text>
        ) : (
          <ScrollView style={{ maxHeight: 260 }} keyboardShouldPersistTaps="handled">
            {rows.map((r, i) => (
              <PressableScale
                key={`${i}-${r.label}`}
                onPress={r.onPress}
                disabled={disabled}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 10,
                  paddingHorizontal: 12, paddingVertical: 10,
                  borderTopWidth: 1, borderTopColor: C.border,
                  backgroundColor: r.selected ? C.elevated2 : 'transparent',
                  opacity: disabled ? 0.5 : 1,
                }}
              >
                <View style={{
                  width: 22, height: 22, borderRadius: 5, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: r.selected ? C.surface : C.elevated2,
                }}>
                  {r.selected ? <Check size={12} color={C.text} weight="bold" />
                    : <Text style={{ color: C.text3, fontSize: 11.5, fontWeight: '600' }}>{NUM[i] || '•'}</Text>}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.text, fontSize: 13.5 }} numberOfLines={2}>{r.label}</Text>
                  {r.desc ? <Text style={{ color: C.text3, fontSize: 11.5, marginTop: 1 }} numberOfLines={2}>{r.desc}</Text> : null}
                </View>
              </PressableScale>
            ))}

            {/* 직접 답장 안내 + 진행 버튼. 실제 입력은 바로 아래 컴포저에서 한다(입력창을 두 개 두지 않는다). */}
            {q ? (
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 10,
                paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: C.border,
              }}>
                <View style={{ width: 22, height: 22, borderRadius: 5, alignItems: 'center', justifyContent: 'center', backgroundColor: C.elevated2 }}>
                  <PencilSimple size={12} color={C.text3} />
                </View>
                <Text style={{ flex: 1, color: C.text3, fontSize: 12.5 }}>아래에 직접 답장</Text>
                {q.multiSelect && (picked[step] || []).length ? (
                  <PressableScale
                    onPress={() => { if (last) submit(); else setStep(step + 1); }}
                    disabled={disabled}
                    style={{ paddingHorizontal: 12, height: 30, borderRadius: v2.radius.sm, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderControl }}
                  >
                    {busy ? <ActivityIndicator size="small" color={C.text2} /> : null}
                    <Text style={{ color: C.text, fontSize: 12.5, fontWeight: '600' }}>{last ? '보내기' : '다음'}</Text>
                  </PressableScale>
                ) : (
                  <PressableScale
                    onPress={() => {
                      // 이 질문은 건너뛴다. 마지막이면 지금까지 고른 것만 보내고, 아무것도 없으면 전체 취소.
                      if (!last) { setStep(step + 1); return; }
                      if (Object.keys(picked).length) submit();
                      else { setBusy(true); void S.respondApproval(approval.id, 'deny', { message: '폰에서 건너뜀' }).catch(() => setBusy(false)); }
                    }}
                    disabled={disabled}
                    style={{ paddingHorizontal: 11, height: 30, borderRadius: v2.radius.sm, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Text style={{ color: C.text3, fontSize: 12.5 }}>건너뛰기</Text>
                  </PressableScale>
                )}
              </View>
            ) : null}
          </ScrollView>
        )}
      </View>
      {approval.claimed && !expired ? (
        <Text style={{ color: C.textDim, fontSize: 11, marginTop: 5 }}>다른 기기가 응답을 처리하고 있어요…</Text>
      ) : null}
    </View>
  );
}
