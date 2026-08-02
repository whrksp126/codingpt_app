import React, { memo, useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, Image } from 'react-native';
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

type AttachFetch = (seq: number, idx: number) => Promise<{ mediaType?: string; base64?: string; missing?: boolean }>;
type AttachPreview = (seq: number, idx: number, label: string) => void;

function toneColor(t: 'dim' | 'accent' | 'error'): string {
  const C = v2.colors;
  // 도구 성공 표시도 중립으로 — 실패(error)만 색으로 말한다(포인트 컬러 제거).
  return t === 'accent' ? C.text2 : t === 'error' ? C.error : C.textDim;
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

/** 보낸 메시지의 인라인 첨부 칩(2026-07-30 사용자 확정: 컴포저와 같은 표현 + 탭=미리보기).
 *  데몬이 이미지 자리에 심은 위치 마커 [Image #N] 을 칩으로 그린다. Android 는 Text 안 인라인 뷰의
 *  크기 제약이 있어 워드 단위 flexWrap 으로 한 흐름 줄바꿈을 만든다(짧은 사용자 메시지 전제). */
function UserRichText({ msg, onFetch, onPreview }: {
  msg: import('../chatModel').ChatMsg; onFetch?: AttachFetch; onPreview?: AttachPreview;
}) {
  const C = v2.colors;
  const text = String(msg.text || '');
  const n = msg.attachments ? msg.attachments.length : 0;
  const parts: React.ReactNode[] = [];
  let k = 0;
  const pushPlain = (t: string) => {
    if (!t) return;
    for (const w of t.split(/(\s+)/)) {
      if (!w) continue;
      if (/\n/.test(w)) { parts.push(<View key={'n' + k++} style={{ width: '100%', height: 0 }} />); continue; }
      parts.push(<Text key={'t' + k++} selectable style={{ color: C.text, fontSize: 14, lineHeight: 20 }}>{w}</Text>);
    }
  };
  // 인용 절대경로('/…/x.ext')는 [확장자 배지·파일명] 칩으로 — 전송 원문은 경로, 표현은 칩(PC 동일).
  const pushText = (t: string) => {
    if (!t) return;
    const PATH_RE = /'(\/[^'\n]{1,300}?\.[A-Za-z0-9]{1,8})'/g;
    let last = 0;
    let pm: RegExpExecArray | null;
    while ((pm = PATH_RE.exec(t))) {
      const path = pm[1];
      const name = path.split('/').pop() || path;
      const ext = name.includes('.') ? (name.split('.').pop() || '') : '';
      pushPlain(t.slice(last, pm.index));
      parts.push(
        <View key={'p' + k++} style={{
          flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: C.borderControl,
          borderRadius: 7, backgroundColor: C.elevated, paddingHorizontal: 6, paddingVertical: 2,
          marginHorizontal: 2, marginVertical: 1,
        }}>
          {ext ? (
            <Text style={{ color: C.text3, fontSize: 8.5, fontWeight: '700', borderWidth: 1, borderColor: C.borderControl, borderRadius: 4, paddingHorizontal: 3, paddingVertical: 1 }}>
              {ext.toUpperCase().slice(0, 4)}
            </Text>
          ) : null}
          <Text numberOfLines={1} style={{ color: C.text2, fontSize: 11, maxWidth: 120 }}>{name}</Text>
        </View>,
      );
      last = pm.index + pm[0].length;
    }
    pushPlain(t.slice(last));
  };
  // ⚠ 토큰 번호는 claude 의 세션 전역 카운터(예: #10)라 인덱스가 아니다 — 순서로 짝짓는다:
  //  텍스트의 j번째 [Image #N] 토큰 ↔ attachments[j]. 라벨은 원문 번호 그대로.
  const re = /\[Image #(\d+)\]/g;
  let last = 0;
  let j = 0;
  let mt: RegExpExecArray | null;
  while ((mt = re.exec(text)) && j < n) {
    pushText(text.slice(last, mt.index));
    parts.push(<MsgChip key={'c' + k++} seq={msg.seq} idx={j} label={mt[0].slice(1, -1)} onFetch={onFetch} onPreview={onPreview} />);
    last = mt.index + mt[0].length;
    j += 1;
  }
  pushText(text.slice(last));
  for (let i = j; i < n; i++) parts.push(<MsgChip key={'x' + i} seq={msg.seq} idx={i} label={`Image #${i + 1}`} onFetch={onFetch} onPreview={onPreview} />);
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }}>{parts}</View>;
}

/** 첨부 칩 — 썸네일 자동 로드(사용자 확정, ChatBody 캐시로 1회만), 탭=미리보기 모달. */
function MsgChip({ seq, idx, label, onFetch, onPreview }: { seq: number; idx: number; label?: string; onFetch?: AttachFetch; onPreview?: AttachPreview }) {
  const C = v2.colors;
  const [thumb, setThumb] = useState<string | null>(null);
  useEffect(() => {
    let on = true;
    onFetch?.(seq, idx)
      .then((a) => { if (on && a && a.base64) setThumb(`data:${a.mediaType || 'image/png'};base64,${a.base64}`); })
      .catch(() => { /* 라벨 칩으로 남는다 */ });
    return () => { on = false; };
  }, [seq, idx, onFetch]);
  const name = label || `Image #${idx + 1}`;
  return (
    <PressableScale
      onPress={() => onPreview?.(seq, idx, name)}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: C.borderControl,
        borderRadius: 7, backgroundColor: C.elevated, paddingHorizontal: 6, paddingVertical: 2,
        marginHorizontal: 2, marginVertical: 1,
      }}
    >
      {thumb ? <Image source={{ uri: thumb }} style={{ width: 20, height: 20, borderRadius: 4 }} /> : null}
      <Text style={{ color: C.text2, fontSize: 11 }}>{name}</Text>
    </PressableScale>
  );
}

/** 내 말풍선 — 참고 앱 3종(Claude/ChatGPT/Gemini) 공통 규격(사용자 확정 2026-07-27 2차):
 *  **중립 회색 + 본문색 글자 + 완전 둥근 모서리**. 파란 채움 + 흰 글자는 메신저 어휘라 코딩 대화에서
 *  튀었고, 꼬리(우상단 각짐)도 참고 앱엔 없다. PC `.chat-msg-user` 와 같은 값을 유지한다. */
function UserBubble({ text, msg, state, onFetch, onPreview }: {
  text: string; msg?: import('../chatModel').ChatMsg; state?: 'sending' | 'failed';
  onFetch?: AttachFetch; onPreview?: AttachPreview;
}) {
  const C = v2.colors;
  const hasAtt = !!(msg && ((msg.attachments && msg.attachments.length) || /'\/[^'\n]+\.[A-Za-z0-9]{1,8}'/.test(msg.text || '')));
  return (
    <View style={{ alignSelf: 'flex-end', maxWidth: '88%' }}>
      <View style={{
        backgroundColor: C.elevated2,
        borderRadius: 18, paddingHorizontal: 13, paddingVertical: 9,
        borderWidth: state === 'failed' ? 1 : 0, borderColor: C.error,
        opacity: state === 'sending' ? 0.72 : 1,
      }}>
        {hasAtt && msg
          ? <UserRichText msg={msg} onFetch={onFetch} onPreview={onPreview} />
          : <Text selectable style={{ color: C.text, fontSize: 14, lineHeight: 20 }}>{text}</Text>}
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
  // 도구 행 접기(TUI 미러 — 2026-07-30 사용자 확정): TUI 는 끝난 도구를 한 줄("Ran 1 shell
  //  command")로 접는다. 채팅도 동일 — 진행 중엔 명령(argsPreview)을 보이고, 결과가 오면 한 줄로
  //  접는다. 머리 탭으로 펼침/접기(PC .chat-tool[data-fold] 미러).
  const [open, setOpen] = useState(false);
  const m = row.msg;
  const res = row.result;
  const done = m.kind === 'tool_use' && !!res; // tool_use 짝만 접는다(고아 결과 행은 그대로)
  const ok = res ? res.ok : undefined;
  const path = m.tool?.path || null;
  const tappable = !!path && !!onOpenFile;
  const out = res ? res.preview : '';
  const clamp = clampLines(out, OUTPUT_CLAMP_LINES);
  const shown = expanded ? out.replace(/\n+$/, '') : clamp.text;
  const folded = done && !open;
  // ★ 카드(테두리+배경) 폐기 — 사용자 확정 2026-07-27: "한 줄 요약은 유지하고 스타일만 참고 서비스들처럼
  //  깔끔하게". 참고 앱들의 대화 본문엔 박스가 없고, 사용자가 실제로 보는 TUI 도 `● Update(index.html)` /
  //  `└ Added 1 line` 형태다 → 같은 어휘로 본문 흐름에 녹인다. PC `.chat-tool` 과 같은 규칙(미러).
  return (
    <View style={{ alignSelf: 'stretch' }}>
      <PressableScale
        onPress={() => { if (done) setOpen((v) => !v); }}
        disabled={!done}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}
      >
        <Text style={{ color: toneColor(statusTone(ok)), fontSize: 11, width: 11, textAlign: 'center' }}>{statusMark(ok)}</Text>
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
      </PressableScale>
      {/* 들여쓰기 18 + 왼쪽 헤어라인 = TUI 의 `└` 역할(PC `.chat-tool-args/.chat-tool-result` 미러). */}
      {!folded && (m.tool?.argsPreview || shown || (res && res.images) || clamp.clamped || (res && res.truncated)) ? (
        <View style={{ marginLeft: 18, paddingLeft: 9, borderLeftWidth: 1, borderLeftColor: C.border, marginTop: 3 }}>
          {m.tool?.argsPreview ? (
            <Text style={{ color: C.textDim, fontSize: 11 }} numberOfLines={2}>{m.tool.argsPreview}</Text>
          ) : null}
          {shown ? (
            <Text selectable style={{ color: C.text3, fontSize: 11.5, fontFamily: monoFamily(), marginTop: 3, lineHeight: 17 }}>
              {shown}
            </Text>
          ) : null}
          {res && res.images ? <AttachChips n={res.images} /> : null}
          {clamp.clamped || (res && res.truncated) ? (
            <PressableScale onPress={() => setExpanded((v) => !v)} hitSlop={8} style={{ alignSelf: 'flex-start', marginTop: 4 }}>
              <Text style={{ color: C.info, fontSize: 11, fontWeight: '600' }}>{expanded ? '접기' : '더 보기'}</Text>
            </PressableScale>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** AskUserQuestion — 트랜스크립트에는 "무엇을 물었는지"만 남는다. 응답은 승인 카드가 담당한다.
 *  내역은 **간결하게**(2026-07-30 사용자 확정: TUI 보다 많은 정보를 보여주지 말 것 — TUI 내역도
 *  질문 문구만 남긴다). 선택지 전체·테두리 박스·바이트 메타는 그리지 않는다(PC .chat-q 미러). */
function QuestionCard({ row }: { row: ChatRowModel }) {
  const C = v2.colors;
  const q = row.msg.question;
  if (!q) return <ToolCard row={row} />;
  return (
    <View style={{ alignSelf: 'stretch' }}>
      {q.header ? <Text style={{ color: C.text3, fontSize: 11, fontWeight: '700', marginBottom: 2 }}>{q.header}</Text> : null}
      <Text style={{ color: C.text, fontSize: 13.5, lineHeight: 20 }}>{q.question}</Text>
      {row.result ? (
        <Text style={{ color: C.textDim, fontSize: 12, marginTop: 3 }} numberOfLines={6}>
          {String(row.result.preview || '').trim() || '응답됨'}
        </Text>
      ) : (
        <Text style={{ color: C.warn, fontSize: 11, marginTop: 3 }}>응답 대기 중 — 위 승인 카드에서 선택해 주세요</Text>
      )}
    </View>
  );
}

const ChatRow: React.FC<{
  row: ChatRowModel;
  onOpenFile?: (relPath: string) => void;
  onFetchAttachment?: AttachFetch;
  onPreviewAttachment?: AttachPreview;
  /** 대화가 참조한 파일(이미지/영상)을 띄우기 위한 문맥 — 없으면 미디어는 칩으로만 보인다. */
  media?: { chatId: string | null; host: number | null; onPreview?: (a: { uri: string; mediaType: string; name: string }) => void };
}> = ({ row, onOpenFile, onFetchAttachment, onPreviewAttachment, media }) => {
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
    return <UserBubble text={m.text} msg={m} onFetch={onFetchAttachment} onPreview={onPreviewAttachment} />;
  }
  if (m.role === 'assistant') {
    // 전폭 마크다운(모바일 화면을 최대한 채운다 — 우측 여백 없음, 삭제본 규칙 유지).
    return (
      <View style={{ alignSelf: 'stretch' }}>
        {/* media 는 ChatBody 가 memo 로 고정해 넘긴다 — 여기서 객체를 새로 만들면 그 고정이 깨진다. */}
        <ChatMarkdown text={m.text} media={media} onOpenFile={onOpenFile} />
        {m.truncated ? <Text style={{ color: C.textDim, fontSize: 11 }}>… 본문이 길어 잘렸어요</Text> : null}
      </View>
    );
  }
  // system 잔여(kind 'system'/'meta'/'unknown')는 isDisplayed 가 걸러내지만 방어적으로 접힌 줄로.
  return <DividerRow text={m.text || ''} />;
};

export default memo(ChatRow);
