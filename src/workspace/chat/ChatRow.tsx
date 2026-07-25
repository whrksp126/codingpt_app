import React, { memo, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { CaretRight, Image as ImageIcon, WarningCircle } from 'phosphor-react-native';

import { v2 } from '../../theme/v2Tokens';
import PressableScale from '../../components/ui/PressableScale';
import ChatMarkdown from './ChatMarkdown';
import {
  OUTPUT_CLAMP_LINES, THINKING_LABEL, clampLines, statusMark, statusTone, toolLabel,
  type ChatRowModel, type PendingUser,
} from '../chatModel';

// 채팅 한 줄 렌더 — Claude 앱 스타일(내 말=오른쪽 버블, 어시스턴트=전폭 마크다운, 도구=접힌 카드).
//  · 색은 전부 렌더 시점 v2.colors(테마 전환 대응 — StyleSheet.create 에 굳히기 금지).
//  · 눌림 모션은 PressableScale(리포 규율). NativeWind 함수형 style 금지라 인라인 객체만 쓴다.
//  · tool_use + tool_result 는 chatModel.buildRows 가 한 카드로 접어 준다(여기선 result 만 그린다).

const monoFamily = () => v2.font.mono as string;

function toneColor(t: 'dim' | 'accent' | 'error'): string {
  const C = v2.colors;
  return t === 'accent' ? C.accent : t === 'error' ? C.error : C.textDim;
}

/** 첨부 칩 — 바이트만 아는 상태(이미지 원본은 chat.attachment 온디맨드, v1 은 칩 표시까지). */
function AttachChips({ n }: { n: number }) {
  const C = v2.colors;
  if (!n) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5 }}>
      <ImageIcon size={12} color={C.text3} />
      <Text style={{ color: C.text3, fontSize: 11 }}>이미지 {n}장</Text>
    </View>
  );
}

/** 내 말풍선 — 사용자 확정: 일반적인 Claude 앱과 동일 스타일(우측 정렬, 우상단 모서리만 각짐). */
function UserBubble({ text, attachments, state }: { text: string; attachments?: number; state?: 'sending' | 'failed' }) {
  const C = v2.colors;
  return (
    <View style={{ alignSelf: 'flex-end', maxWidth: '88%' }}>
      <View style={{
        backgroundColor: state === 'failed' ? C.elevated2 : C.infoStrong,
        borderRadius: 14, borderTopRightRadius: 4, paddingHorizontal: 12, paddingVertical: 9,
        borderWidth: state === 'failed' ? 1 : 0, borderColor: C.error,
        opacity: state === 'sending' ? 0.72 : 1,
      }}>
        <Text selectable style={{ color: state === 'failed' ? C.text2 : '#fff', fontSize: 14, lineHeight: 20 }}>{text}</Text>
        <AttachChips n={attachments || 0} />
      </View>
      {state === 'sending' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-end', marginTop: 3 }}>
          <ActivityIndicator size="small" color={C.textDim} />
          <Text style={{ color: C.textDim, fontSize: 10.5 }}>보내는 중</Text>
        </View>
      ) : state === 'failed' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-end', marginTop: 3 }}>
          <WarningCircle size={12} color={C.error} />
          <Text style={{ color: C.error, fontSize: 10.5 }}>전송 실패 — 다시 시도해 주세요</Text>
        </View>
      ) : null}
    </View>
  );
}

/** 낙관적 버블(전송 즉시 표시) — 트랜스크립트에 같은 텍스트가 오면 chatModel.pruneOptimistic 이 걷는다. */
export const PendingRow = memo(function PendingRow({ item }: { item: PendingUser }) {
  return <UserBubble text={item.text} state={item.state} />;
});

/** 시스템 구분선 — 압축/오류/링크 등. 좌우 헤어라인 + 가운데 문구. */
function DividerRow({ text }: { text: string }) {
  const C = v2.colors;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 4 }}>
      <View style={{ flex: 1, height: 1, backgroundColor: C.border }} />
      <Text style={{ color: C.textDim, fontSize: 11 }} numberOfLines={2}>{text}</Text>
      <View style={{ flex: 1, height: 1, backgroundColor: C.border }} />
    </View>
  );
}

function ToolCard({ row, onOpenFile }: { row: ChatRowModel; onOpenFile?: (relPath: string) => void }) {
  const C = v2.colors;
  const [expanded, setExpanded] = useState(false);
  const m = row.msg;
  const res = row.result;
  const ok = res ? res.ok : undefined;
  const path = m.tool?.path || null;
  const tappable = !!path && !!onOpenFile;
  const out = res ? res.preview : '';
  const clamp = clampLines(out, OUTPUT_CLAMP_LINES);
  const shown = expanded ? out.replace(/\n+$/, '') : clamp.text;
  return (
    <View style={{
      alignSelf: 'stretch', backgroundColor: C.elevated, borderWidth: 1, borderColor: C.border,
      borderRadius: v2.radius.md, paddingHorizontal: 11, paddingVertical: 8,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text style={{ color: toneColor(statusTone(ok)), fontSize: 12 }}>{statusMark(ok)}</Text>
        <Text style={{ color: C.text2, fontSize: 12.5, fontFamily: monoFamily(), flexShrink: 1 }} numberOfLines={1}>
          {toolLabel(m)}
        </Text>
        <View style={{ flex: 1 }} />
        {tappable ? (
          <PressableScale onPress={() => onOpenFile?.(path as string)} hitSlop={10} style={{ flexDirection: 'row', alignItems: 'center', gap: 1 }}>
            <Text style={{ color: C.info, fontSize: 11 }}>열기</Text>
            <CaretRight size={11} color={C.info} />
          </PressableScale>
        ) : null}
      </View>
      {m.tool?.argsPreview ? (
        <Text style={{ color: C.textDim, fontSize: 11, marginTop: 3 }} numberOfLines={2}>{m.tool.argsPreview}</Text>
      ) : null}
      {shown ? (
        <Text selectable style={{ color: C.text3, fontSize: 11.5, fontFamily: monoFamily(), marginTop: 5, lineHeight: 17 }}>
          {shown}
        </Text>
      ) : null}
      {res && res.images ? <AttachChips n={res.images} /> : null}
      {clamp.clamped || (res && res.truncated) ? (
        <PressableScale onPress={() => setExpanded((v) => !v)} hitSlop={8} style={{ alignSelf: 'flex-start', marginTop: 5 }}>
          <Text style={{ color: C.info, fontSize: 11, fontWeight: '600' }}>{expanded ? '접기' : '더 보기'}</Text>
        </PressableScale>
      ) : null}
    </View>
  );
}

/** AskUserQuestion — 트랜스크립트에는 "무엇을 물었는지"만 남는다. 응답은 승인 카드가 담당한다. */
function QuestionCard({ row }: { row: ChatRowModel }) {
  const C = v2.colors;
  const q = row.msg.question;
  const answered = !!row.result;
  if (!q) return <ToolCard row={row} />;
  return (
    <View style={{
      alignSelf: 'stretch', backgroundColor: C.elevated, borderWidth: 1,
      borderColor: answered ? C.border : C.accent, borderRadius: v2.radius.md, padding: 11,
    }}>
      {q.header ? <Text style={{ color: C.accent, fontSize: 11, fontWeight: '700', marginBottom: 3 }}>{q.header}</Text> : null}
      <Text style={{ color: C.text, fontSize: 13.5, lineHeight: 20 }}>{q.question}</Text>
      <View style={{ marginTop: 7, gap: 5 }}>
        {q.options.map((o, i) => (
          <View key={`${i}-${o.label}`} style={{ flexDirection: 'row', gap: 6 }}>
            <Text style={{ color: C.textDim, fontSize: 12 }}>·</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.text2, fontSize: 12.5 }}>{o.label}</Text>
              {o.description ? <Text style={{ color: C.textDim, fontSize: 11, marginTop: 1 }}>{o.description}</Text> : null}
            </View>
          </View>
        ))}
      </View>
      {row.result ? (
        <Text style={{ color: C.text3, fontSize: 11.5, fontFamily: monoFamily(), marginTop: 7 }} numberOfLines={4}>
          {row.result.preview}
        </Text>
      ) : (
        <Text style={{ color: C.warn, fontSize: 11, marginTop: 7 }}>응답 대기 중 — 위 승인 카드에서 선택해 주세요</Text>
      )}
    </View>
  );
}

const ChatRow: React.FC<{ row: ChatRowModel; onOpenFile?: (relPath: string) => void }> = ({ row, onOpenFile }) => {
  const C = v2.colors;
  const m = row.msg;

  if (m.kind === 'thinking') {
    // 실측상 thinking 본문은 전량 빈 문자열(signature 만) → 접힌 마커만. 펼칠 내용이 없다.
    return (
      <Text style={{ color: C.textDim, fontSize: 12, fontStyle: 'italic', alignSelf: 'flex-start' }}>
        {THINKING_LABEL}
      </Text>
    );
  }
  if (m.kind === 'question') return <QuestionCard row={row} />;
  if (m.kind === 'tool_use' || m.kind === 'tool_result') return <ToolCard row={row} onOpenFile={onOpenFile} />;
  if (m.kind === 'compact' || m.kind === 'divider') return <DividerRow text={m.text || ''} />;
  if (m.kind === 'interrupt') return <DividerRow text={m.text || '사용자가 중단'} />;

  if (m.role === 'user') {
    return <UserBubble text={m.text} attachments={m.attachments ? m.attachments.length : 0} />;
  }
  if (m.role === 'assistant') {
    // 전폭 마크다운(모바일 화면을 최대한 채운다 — 우측 여백 없음, 삭제본 규칙 유지).
    return (
      <View style={{ alignSelf: 'stretch' }}>
        <ChatMarkdown text={m.text} />
        {m.truncated ? <Text style={{ color: C.textDim, fontSize: 11 }}>… 본문이 길어 잘렸어요</Text> : null}
      </View>
    );
  }
  // system 잔여(kind 'system'/'meta'/'unknown')는 isDisplayed 가 걸러내지만 방어적으로 접힌 줄로.
  return <DividerRow text={m.text || ''} />;
};

export default memo(ChatRow);
