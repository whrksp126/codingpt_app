import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { X, PencilSimple } from 'phosphor-react-native';

import { v2 } from '../../theme/v2Tokens';
import PressableScale from '../ui/PressableScale';
import { useWorkspaceShell } from '../../contexts/WorkspaceShellContext';
import { approvalKind, type ApprovalRow } from '../../services/approvalService';

// 질문 도크 — 컴포저 **바로 위에 고정**되는 카드(사용자 지정 형태, Claude Code 의 AskUserQuestion 도크).
//
// 두 가지를 동시에 만족해야 한다:
//  ① 대화 스크롤 **안**에 들어가지 않는다 — 답하는 중에 새 메시지가 붙어 질문이 위로 밀려 사라지면 안 된다.
//  ② 화면 **전역**에 뜨지 않는다 — 다른 터미널을 보고 있을 땐 존재하지 않아야 한다(스코프는 paneApproval).
// 그래서 위치는 "컴포저 바로 위, 이 탭 안". 떠 있는 카드도, 올라오는 시트도 아니다.
//
// 상호작용:
//  · 단일 선택 = 탭 = **즉시 응답**(따로 [보내기] 를 누르지 않는다 — 모바일에서 두 번 누르게 하지 않는다)
//  · 다중 선택 = 탭으로 토글 + [보내기] 행이 나타난다
//  · 직접 답장 = 이 도크가 아니라 **아래 컴포저**에 그대로 입력한다(ChatBody 가 라우팅)
//  · ✕ = 이번만 접기(요청은 그대로 대기 — 알림/탭 배지로 남는다)
//
// 색: 포인트 컬러를 쓰지 않는다(2026-07-28 사용자 확정). 선택 상태는 밝기·테두리로만 구분한다.

const NUM = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

function fmtLeft(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}분` : `${s}초`;
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
  const questions = approval.prompt && Array.isArray(approval.prompt.questions) ? approval.prompt.questions : [];
  const q = questions[0];
  const planApproval = kind === 'choice' && !q;
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => { const iv = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(iv); }, []);
  // 요청이 바뀌면 고른 것을 버린다 — 이전 질문의 선택이 다음 질문에 남으면 오응답이 된다.
  useEffect(() => { setPicked([]); setBusy(false); }, [approval.id]);

  const left = approval.deadlineAt - now;
  const expired = left <= 0;
  const disabled = busy || expired || !!approval.claimed;

  const respond = (
    decision: 'allow' | 'deny' | 'answer',
    opts?: { message?: string; answer?: { questionIndex: number; labels: string[]; text?: string | null } },
  ) => {
    if (disabled) return;
    setBusy(true);
    void S.respondApproval(approval.id, decision, opts).catch(() => setBusy(false));
  };

  // 행 목록 — 선택형이면 선택지, 권한형이면 허용/거절, 계획 승인이면 승인/거절.
  const rows = useMemo<Array<{ label: string; desc?: string; onPress: () => void; selected: boolean }>>(() => {
    if (q) {
      return q.options.map((o) => ({
        label: o.label,
        desc: o.description,
        selected: picked.includes(o.label),
        onPress: () => {
          if (q.multiSelect) {
            setPicked((cur) => (cur.includes(o.label) ? cur.filter((x) => x !== o.label) : [...cur, o.label]));
            return;
          }
          respond('answer', { answer: { questionIndex: 0, labels: [o.label], text: null } });
        },
      }));
    }
    if (planApproval) {
      return [
        { label: '계획대로 진행', selected: false, onPress: () => respond('allow') },
        { label: '거절', selected: false, onPress: () => respond('deny', { message: '원격 기기에서 계획을 거절했습니다' }) },
      ];
    }
    return [
      { label: '허용', selected: false, onPress: () => respond('allow') },
      { label: '거절', selected: false, onPress: () => respond('deny', { message: '폰에서 거절' }) },
    ];
    // respond 는 매 렌더 새로 만들어지지만 내부에서 최신 state 를 읽으므로 의존성에서 뺀다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, planApproval, picked, disabled, approval.id]);

  const title = q ? (q.question || approval.summary) : (approval.summary || approval.tool);

  return (
    <View style={{ paddingHorizontal: 10, paddingTop: 8 }}>
      <View style={{
        backgroundColor: C.elevated, borderWidth: 1, borderColor: C.borderControl,
        borderRadius: v2.radius.md, overflow: 'hidden',
      }}>
        {/* 제목 줄 — 질문 그대로. 부제·설명·배지를 얹지 않는다(사용자 확정: 불필요한 텍스트 금지). */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 12, paddingTop: 11, paddingBottom: 9 }}>
          <Text style={{ flex: 1, color: C.text, fontSize: 13.5, lineHeight: 19 }} numberOfLines={4}>{title}</Text>
          {!expired && left < 60000 ? (
            <Text style={{ color: C.text3, fontSize: 11, marginTop: 2 }}>{fmtLeft(left)}</Text>
          ) : null}
          <PressableScale onPress={onDismiss} hitSlop={10} style={{ marginTop: 1 }}>
            <X size={15} color={C.text3} />
          </PressableScale>
        </View>

        {expired ? (
          <Text style={{ color: C.text3, fontSize: 12, paddingHorizontal: 12, paddingBottom: 12 }}>
            시간이 지났어요 — PC 터미널에서 답해주세요.
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
                  <Text style={{ color: r.selected ? C.text : C.text3, fontSize: 11.5, fontWeight: '600' }}>{NUM[i] || '•'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.text, fontSize: 13.5 }} numberOfLines={2}>{r.label}</Text>
                  {r.desc ? <Text style={{ color: C.text3, fontSize: 11.5, marginTop: 1 }} numberOfLines={2}>{r.desc}</Text> : null}
                </View>
              </PressableScale>
            ))}

            {/* 직접 답장 안내 — 실제 입력은 바로 아래 컴포저에서 한다(입력창을 두 개 두지 않는다). */}
            {q ? (
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 10,
                paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: C.border,
              }}>
                <View style={{ width: 22, height: 22, borderRadius: 5, alignItems: 'center', justifyContent: 'center', backgroundColor: C.elevated2 }}>
                  <PencilSimple size={12} color={C.text3} />
                </View>
                <Text style={{ flex: 1, color: C.text3, fontSize: 12.5 }}>아래에 직접 답장</Text>
                {q.multiSelect && picked.length ? (
                  <PressableScale
                    onPress={() => respond('answer', { answer: { questionIndex: 0, labels: picked, text: null } })}
                    disabled={disabled}
                    style={{ paddingHorizontal: 12, height: 30, borderRadius: v2.radius.sm, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderControl }}
                  >
                    {busy ? <ActivityIndicator size="small" color={C.text2} /> : null}
                    <Text style={{ color: C.text, fontSize: 12.5, fontWeight: '600' }}>보내기 {picked.length}</Text>
                  </PressableScale>
                ) : (
                  <PressableScale
                    onPress={() => respond('deny', { message: '폰에서 건너뜀' })}
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
