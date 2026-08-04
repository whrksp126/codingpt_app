import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, ActivityIndicator } from 'react-native';
import { CaretLeft, CaretRight, ChatCircle, X } from 'phosphor-react-native';

import { v2 } from '../../theme/v2Tokens';
import PressableScale from '../../components/ui/PressableScale';
import { haptic } from '../../animations/haptics';
import { tx } from '../../text';
import { REVIEW_TEXT } from '../../text/review';
import * as D from './diffParse';

const TX = tx(REVIEW_TEXT);

// 코드 리뷰 화면(폰) — IDE 안에서 덩어리마다 승인/거절하고 줄에 코멘트를 단다.
//
// 이 화면이 뜨는 조건: **에이전트가 스스로 요청했을 때만**(`cpt review`). 사용자가 부른 적 없는
//  화면이라 맨 위에 왜 떴는지를 한 줄 적는다(사용자 확정: 강제 관문이 아니라 도구).
//
// PC 미러: `codingpt_pc/src/js/review-view.js`. 판정(덩어리 세기·파일 판정·제출 페이로드)은
//  ide/diffParse.ts 를, 문구는 text/review.ts 를 **양쪽이 공유**한다 — 두 기기가 덩어리를 다르게
//  세면 엉뚱한 곳을 승인한 결과가 에이전트에게 간다.
//
// 폰만의 판단: 코드 줄은 **가로 스크롤**한다. 긴 줄을 접으면 diff 가 읽히지 않는다.

export type ReviewState = {
  reviewId: string;
  title: string;
  files: (D.ReviewFile & { hunkList: D.DiffHunk[] })[];
  index: number;
  decisions: Record<string, D.Decision>;
  comments: D.ReviewComment[];
  note: string;
  sending: boolean;
  error: string | null;
};

export function createReview(payload: {
  reviewId: string; title?: string; files?: { path: string; diffText?: string; truncated?: boolean }[];
}): ReviewState {
  const files = (payload.files || []).map((f) => {
    const hunkList = D.parseHunks(f.diffText);
    return { path: f.path, diffText: f.diffText, truncated: !!f.truncated, hunkList, hunks: hunkList.length };
  });
  return {
    reviewId: payload.reviewId,
    title: payload.title || TX.title,
    files,
    index: 0,
    decisions: {},
    comments: [],
    note: '',
    sending: false,
    error: null,
  };
}

export default function ReviewView({ state, onChange, onSubmit, onCancel }: {
  state: ReviewState;
  onChange: (next: ReviewState) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const C = v2.colors;
  const file = state.files[state.index];
  const left = useMemo(() => D.undecidedCount(state.files, state.decisions), [state.files, state.decisions]);
  const ready = left === 0;

  const setDecision = useCallback((key: string, val: D.Decision) => {
    haptic.keyPress();
    const next = { ...state.decisions };
    // 같은 것을 다시 누르면 해제 — 잘못 누른 뒤 되돌릴 길이 있어야 한다.
    if (next[key] === val) delete next[key];
    else next[key] = val;
    onChange({ ...state, decisions: next, error: null });
  }, [state, onChange]);

  const nav = useCallback((d: number) => {
    const i = Math.max(0, Math.min(state.files.length - 1, state.index + d));
    if (i !== state.index) onChange({ ...state, index: i });
  }, [state, onChange]);

  const approveFile = useCallback(() => {
    if (!file) return;
    const next = { ...state.decisions };
    for (let i = 0; i < file.hunks; i++) next[`${file.path}#${i}`] = 'approve';
    onChange({ ...state, decisions: next, error: null });
  }, [file, state, onChange]);

  const approveAll = useCallback(() => {
    const next = { ...state.decisions };
    for (const f of state.files) for (let i = 0; i < f.hunks; i++) next[`${f.path}#${i}`] = 'approve';
    onChange({ ...state, decisions: next, error: null });
  }, [state, onChange]);

  const addComment = useCallback((c: D.ReviewComment) => {
    onChange({ ...state, comments: [...state.comments, c], error: null });
  }, [state, onChange]);

  const removeComment = useCallback((c: D.ReviewComment) => {
    onChange({ ...state, comments: state.comments.filter((x) => x !== c) });
  }, [state, onChange]);

  return (
    <View style={{ flex: 1, backgroundColor: C.base }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 10, paddingBottom: 16 }}>
        <Text style={{ color: C.textDim, fontSize: 11.5, paddingBottom: 8 }}>{TX.why}</Text>
        {!file || !file.hunkList.length ? (
          <Text style={{ color: C.textDim, fontSize: 13, textAlign: 'center', paddingVertical: 30 }}>{TX.empty}</Text>
        ) : file.hunkList.map((h) => (
          <Hunk
            key={h.index}
            path={file.path}
            hunk={h}
            decision={state.decisions[`${file.path}#${h.index}`]}
            comments={state.comments.filter((c) => c.path === file.path && c.hunk === h.index)}
            onDecide={(v) => setDecision(`${file.path}#${h.index}`, v)}
            onAddComment={addComment}
            onRemoveComment={removeComment}
          />
        ))}
        {file?.truncated ? (
          <Text style={{ color: C.textDim, fontSize: 11.5, paddingTop: 8 }}>{TX.truncated}</Text>
        ) : null}
      </ScrollView>

      {/* 하단 조작 바 — [◀ 이전][파일 i/N][다음 ▶] … [상태][취소][보내기] (사용자 확정 배치) */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingHorizontal: 8, paddingVertical: 7,
        borderTopWidth: 1, borderTopColor: C.borderControl, backgroundColor: C.surface,
      }}>
        <BarBtn onPress={() => nav(-1)} disabled={state.index <= 0}>
          <CaretLeft size={14} color={C.text2} />
        </BarBtn>
        <Text numberOfLines={1} style={{ flexShrink: 1, minWidth: 70, color: C.text, fontSize: 12.5, textAlign: 'center' }}>
          {(file ? file.path.split('/').pop() : '')} {state.index + 1}/{state.files.length}
        </Text>
        <BarBtn onPress={() => nav(1)} disabled={state.index >= state.files.length - 1}>
          <CaretRight size={14} color={C.text2} />
        </BarBtn>
        <BarBtn onPress={approveFile}><Text style={{ color: C.text2, fontSize: 12 }}>{TX.approveAll}</Text></BarBtn>
        <BarBtn onPress={approveAll}><Text style={{ color: C.text2, fontSize: 12 }}>{TX.approveEverything}</Text></BarBtn>
        <View style={{ flex: 1 }} />
        {/* 실패는 감추지 않는다 — 못 보냈는데 화면이 조용하면 사용자는 보낸 줄 안다. */}
        <Text numberOfLines={1} style={{ flexShrink: 1, color: C.textDim, fontSize: 11 }}>
          {state.error ? `${TX.sendFailed} — ${state.error}`
            : `${ready ? TX.allDecided : TX.remaining(left)} · ${TX.commentCount(state.comments.length)}`}
        </Text>
        <BarBtn onPress={onCancel}><Text style={{ color: C.text2, fontSize: 12 }}>{TX.cancel}</Text></BarBtn>
        <BarBtn onPress={onSubmit} disabled={state.sending} primary>
          {state.sending
            ? <ActivityIndicator size="small" color={C.text} />
            : <Text style={{ color: C.text, fontSize: 12 }}>{TX.send}</Text>}
        </BarBtn>
      </View>
    </View>
  );
}

function BarBtn({ children, onPress, disabled, primary }: {
  children: React.ReactNode; onPress: () => void; disabled?: boolean; primary?: boolean;
}) {
  const C = v2.colors;
  return (
    <PressableScale onPress={disabled ? () => {} : onPress}>
      <View style={{
        paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
        borderWidth: 1, borderColor: primary ? C.textDim : C.borderControl,
        backgroundColor: primary ? C.elevated2 : 'transparent',
        opacity: disabled ? 0.4 : 1,
        alignItems: 'center', justifyContent: 'center',
      }}>
        {children}
      </View>
    </PressableScale>
  );
}

function Hunk({ path, hunk, decision, comments, onDecide, onAddComment, onRemoveComment }: {
  path: string;
  hunk: D.DiffHunk;
  decision?: D.Decision;
  comments: D.ReviewComment[];
  onDecide: (v: D.Decision) => void;
  onAddComment: (c: D.ReviewComment) => void;
  onRemoveComment: (c: D.ReviewComment) => void;
}) {
  const C = v2.colors;
  const [composing, setComposing] = useState<{ side: 'old' | 'new'; line: number | null } | null>(null);
  const [draft, setDraft] = useState('');
  const mono = 'monospace';

  return (
    <View style={{ borderWidth: 1, borderColor: C.borderControl, borderRadius: 9, overflow: 'hidden', marginBottom: 10 }}>
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 6,
        backgroundColor: C.elevated2, borderBottomWidth: 1, borderBottomColor: C.borderControl,
      }}>
        <Text numberOfLines={1} style={{ flex: 1, color: C.text2, fontSize: 11.5, fontFamily: mono }}>
          {hunk.header.replace(/^@@ | @@.*$/g, '')}
        </Text>
        <Text style={{ color: C.textDim, fontSize: 11 }}>{`+${hunk.adds} −${hunk.dels}`}</Text>
        {/* 고른 것 = 채움(색 아님 — accent 는 상태 신호 전용) */}
        <Choice label={TX.approve} on={decision === 'approve'} onPress={() => onDecide('approve')} />
        <Choice label={TX.reject} on={decision === 'reject'} onPress={() => onDecide('reject')} />
      </View>

      {/* 코드 줄 — 긴 줄을 접으면 diff 가 안 읽힌다 → 가로 스크롤 */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ minWidth: '100%' }}>
          {hunk.lines.map((ln, i) => {
            const a = D.anchorOf(ln);
            const mine = a ? comments.filter((c) => c.side === a.side && c.line === a.line) : [];
            const no = ln.type === 'del' ? ln.oldNo : ln.newNo;
            return (
              <View key={i}>
                <View style={{
                  flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 8, paddingVertical: 1,
                  backgroundColor: ln.type === 'add' ? 'rgba(255,255,255,0.045)'
                    : ln.type === 'del' ? 'rgba(0,0,0,0.16)' : 'transparent',
                }}>
                  <Text style={{ width: 40, textAlign: 'right', paddingRight: 8, color: C.textDim, fontSize: 11.5, fontFamily: mono }}>
                    {no == null ? '' : String(no)}
                  </Text>
                  <Text style={{ width: 12, color: C.textDim, fontSize: 11.5, fontFamily: mono }}>
                    {ln.type === 'add' ? '+' : ln.type === 'del' ? '−' : ' '}
                  </Text>
                  <Text style={{ color: C.text, fontSize: 11.5, fontFamily: mono }}>{ln.text || ' '}</Text>
                  {D.isCommentable(ln) ? (
                    <Pressable
                      onPress={() => { setComposing(a); setDraft(''); }}
                      hitSlop={8}
                      style={{ paddingHorizontal: 8 }}
                    >
                      <ChatCircle size={13} color={C.textDim} />
                    </Pressable>
                  ) : null}
                </View>
                {mine.map((c, ci) => (
                  <View key={ci} style={{
                    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
                    marginLeft: 52, marginRight: 8, marginVertical: 3, padding: 7,
                    borderLeftWidth: 2, borderLeftColor: C.textDim, backgroundColor: C.elevated2,
                  }}>
                    <Text style={{ flex: 1, color: C.text, fontSize: 12 }}>{c.text}</Text>
                    <Pressable onPress={() => onRemoveComment(c)} hitSlop={8}>
                      <X size={12} color={C.textDim} />
                    </Pressable>
                  </View>
                ))}
                {composing && a && composing.side === a.side && composing.line === a.line ? (
                  <View style={{ marginLeft: 52, marginRight: 8, marginVertical: 5, gap: 6 }}>
                    <TextInput
                      value={draft}
                      onChangeText={setDraft}
                      placeholder={TX.commentPlaceholder}
                      placeholderTextColor={C.textDim}
                      multiline
                      autoFocus
                      style={{
                        minHeight: 54, padding: 8, borderRadius: 7, borderWidth: 1, borderColor: C.borderControl,
                        backgroundColor: C.elevated2, color: C.text, fontSize: 12.5, textAlignVertical: 'top',
                      }}
                    />
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      <Choice
                        label={TX.commentSave}
                        on
                        onPress={() => {
                          const text = draft.trim();
                          if (text) onAddComment({ path, hunk: hunk.index, side: a.side, line: a.line, text });
                          setComposing(null); setDraft('');
                        }}
                      />
                      <Choice label={TX.commentCancel} on={false} onPress={() => { setComposing(null); setDraft(''); }} />
                    </View>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

function Choice({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const C = v2.colors;
  return (
    <PressableScale onPress={onPress}>
      <View style={{
        paddingHorizontal: 10, paddingVertical: 4, borderRadius: 7,
        borderWidth: 1, borderColor: on ? C.textDim : C.borderControl,
        backgroundColor: on ? C.elevated : 'transparent',
      }}>
        <Text style={{ color: on ? C.text : C.text2, fontSize: 12 }}>{label}</Text>
      </View>
    </PressableScale>
  );
}
