import React, { memo, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { View, Text, ActivityIndicator, Pressable } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { WarningCircle, ArrowClockwise, Trash, Clock } from 'phosphor-react-native';

import { v2 } from '../../theme/v2Tokens';
import { useTheme } from '../../contexts/ThemeContext';
import PressableScale from '../../components/ui/PressableScale';
import ChatRow from '../chat/ChatRow';
import ChatMarkdown from '../chat/ChatMarkdown';
import { THINKING_LABEL } from '../chatModel';
import { errorText, fmtDuration, isRetryable, noticeText, turnSummary, type ConvItem, type LiveBlock, type Outgoing } from './convModel';
import { renderParts } from './streamMarkdown';
import * as i18n from '../../i18n/index.ts';

// 채팅 v2 의 목록 행. 메시지 본문은 v1 렌더러(ChatRow — 말풍선·마크다운·도구 줄·diff)를 **그대로** 쓰고,
//  여기는 v2 에만 있는 것을 그린다: 낙관 버블(다시 시도·삭제), 대기열 표시, 턴 끝 요약, 안내, 자라는 글.
//
// 규율:
//  · 색은 렌더 시점 v2.colors. 포인트 컬러 없음 — 오류만 색으로 말한다.
//  · memo 컴포넌트는 테마를 **직접 구독**한다(useTheme). 테마 전환은 재렌더 캐스케이드로 퍼지는데
//    memo 가 그 물결을 막는다 → 구독하지 않으면 전환 뒤에도 옛 색으로 남는다.

/** 시:분 — 턴 끝·길게 누른 메뉴에 은은하게. 기기 로케일의 24/12시간 표기를 따르지 않고 짧게 고정한다. */
export function fmtClock(ts: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 날짜까지 — 길게 누른 메뉴의 보낸 시각. */
export function fmtStamp(ts: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()} ${fmtClock(ts)}`;
}

// ── 낙관 버블 ──────────────────────────────────────────────────────────────
// 모양은 v1 의 내 말풍선(ChatRow.UserBubble)과 같은 값이다 — 서버 행으로 바뀌는 순간 모양이 튀면 안 된다.
const PendingBubble = memo(function PendingBubble({ item, offline, onRetry, onDiscard }: {
  item: Outgoing; offline: boolean; onRetry: (id: string) => void; onDiscard: (id: string) => void;
}) {
  useTheme();
  const C = v2.colors;
  const failed = item.status === 'failed';
  return (
    <View style={{ alignSelf: 'flex-end', maxWidth: '88%' }}>
      <View style={{
        backgroundColor: C.elevated2, borderRadius: 18, paddingHorizontal: 13, paddingVertical: 9,
        borderWidth: failed ? 1 : 0, borderColor: C.error,
        opacity: item.status === 'sending' || item.status === 'queued' ? 0.72 : 1,
      }}>
        <Text selectable style={{ color: C.text, fontSize: 14, lineHeight: 20 }}>{item.text}</Text>
      </View>
      {item.status === 'sending' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-end', marginTop: 3 }}>
          <ActivityIndicator size="small" color={C.textDim} />
          <Text style={{ color: C.textDim, fontSize: 10.5 }}>{i18n.t('보내는 중')}</Text>
        </View>
      ) : item.status === 'queued' ? (
        <QueuedMark />
      ) : failed ? (
        <Animated.View entering={FadeIn.duration(160)} style={{ alignSelf: 'flex-end', alignItems: 'flex-end', marginTop: 4, gap: 5 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <WarningCircle size={12} color={C.error} />
            <Text style={{ color: C.error, fontSize: 11 }}>{errorText(item.code)}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <PressableScale
              onPress={() => onRetry(item.clientId)}
              // 꺼진 PC 로는 보내지 않는다 — 버튼은 남기되 흐리게(켜지면 다시 누를 수 있다는 걸 보여 준다).
              disabled={offline}
              baseOpacity={offline ? 0.4 : 1}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={i18n.t('다시 시도')}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 28, paddingHorizontal: 10, borderRadius: v2.radius.sm, borderWidth: 1, borderColor: C.borderControl, backgroundColor: C.elevated }}
            >
              <ArrowClockwise size={12} color={C.text2} />
              <Text style={{ color: C.text, fontSize: 12, fontWeight: '600' }}>{i18n.t('다시 시도')}</Text>
            </PressableScale>
            <PressableScale
              onPress={() => onDiscard(item.clientId)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={i18n.t('삭제')}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 28, paddingHorizontal: 10, borderRadius: v2.radius.sm, borderWidth: 1, borderColor: C.borderControl }}
            >
              <Trash size={12} color={C.text3} />
              <Text style={{ color: C.text2, fontSize: 12, fontWeight: '600' }}>{i18n.t('삭제')}</Text>
            </PressableScale>
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
});

/**
 * 서버가 실패로 적은 내 메시지의 꼬리표 — 사유와 [다시 시도]·[삭제].
 *  다시 보내도 같은 결과인 사유(터미널 전용 명령)는 안내만 하고 [다시 시도] 를 그리지 않는다.
 *  [삭제] 는 이 기기에서만 감춘다(기록은 데몬의 것이다).
 */
function FailedMark({ code, offline, onRetry, onHide }: { code: string; offline: boolean; onRetry: () => void; onHide: () => void }) {
  const C = v2.colors;
  const retry = isRetryable(code);
  return (
    <View style={{ alignSelf: 'flex-end', alignItems: 'flex-end', marginTop: 4, gap: 5 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        {retry ? <WarningCircle size={12} color={C.error} /> : null}
        <Text style={{ color: retry ? C.error : C.text3, fontSize: 11 }}>{errorText(code)}</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {retry ? (
          <PressableScale onPress={onRetry} disabled={offline} baseOpacity={offline ? 0.4 : 1} hitSlop={8}
            accessibilityRole="button" accessibilityLabel={i18n.t('다시 시도')}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 28, paddingHorizontal: 10, borderRadius: v2.radius.sm, borderWidth: 1, borderColor: C.borderControl, backgroundColor: C.elevated }}>
            <ArrowClockwise size={12} color={C.text2} />
            <Text style={{ color: C.text, fontSize: 12, fontWeight: '600' }}>{i18n.t('다시 시도')}</Text>
          </PressableScale>
        ) : null}
        <PressableScale onPress={onHide} hitSlop={8} accessibilityRole="button" accessibilityLabel={i18n.t('삭제')}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 28, paddingHorizontal: 10, borderRadius: v2.radius.sm, borderWidth: 1, borderColor: C.borderControl }}>
          <Trash size={12} color={C.text3} />
          <Text style={{ color: C.text2, fontSize: 12, fontWeight: '600' }}>{i18n.t('삭제')}</Text>
        </PressableScale>
      </View>
    </View>
  );
}

function QueuedMark() {
  const C = v2.colors;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-end', marginTop: 3 }}>
      <Clock size={11} color={C.textDim} />
      <Text style={{ color: C.textDim, fontSize: 10.5 }}>{i18n.t('대기 중')}</Text>
    </View>
  );
}

// ── 목록 한 칸 ─────────────────────────────────────────────────────────────

export interface RowHandlers {
  onOpenFile?: (rel: string) => void;
  onRetry: (clientId: string) => void;
  onDiscard: (clientId: string) => void;
  /** 길게 누르기 — 복사·선택·공유 메뉴를 연다. */
  onMenu: (a: { text: string; ts: number }) => void;
  /** 서버가 실패로 적은 내 메시지 — 같은 clientId 로 다시 보낸다 / 이 기기에서 감춘다. */
  onRetryFailed: (msgKey: string) => void;
  onHideFailed: (msgKey: string) => void;
}

export const ConvRow = memo(function ConvRow({ item, animate, offline, h }: {
  item: ConvItem;
  /** 방금 도착한 행인가 — 처음부터 있던 행(복원·스크롤로 들어온 칸)은 움직이지 않는다. */
  animate: boolean;
  offline: boolean;
  h: RowHandlers;
}) {
  useTheme();
  const C = v2.colors;
  let body: React.ReactNode;
  if (item.t === 'out') {
    body = <PendingBubble item={item.item} offline={offline} onRetry={h.onRetry} onDiscard={h.onDiscard} />;
  } else if (item.t === 'turn') {
    const s = turnSummary(item.mark);
    const at = fmtClock(item.mark.ts);
    if (!s && !at) return null;
    body = (
      <Text style={{ color: C.textDim, fontSize: 11, alignSelf: 'flex-start' }} accessibilityLabel={[s, at].filter(Boolean).join(' · ')}>
        {[s, at].filter(Boolean).join(' · ')}
      </Text>
    );
  } else if (item.t === 'notice') {
    const err = item.mark.level === 'error';
    // 아는 code 는 우리 문구로 — 데몬의 글은 한국어뿐이다(다른 언어 화면에서 그 줄만 한국어로 남는다).
    const text = noticeText(item.mark.code, item.mark.text);
    if (!text) return null;
    body = (
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, alignSelf: 'stretch' }}>
        {err ? <WarningCircle size={13} color={C.error} style={{ marginTop: 2 }} /> : null}
        <Text style={{ flex: 1, color: err ? C.error : C.text3, fontSize: 12, lineHeight: 18 }}>{text}</Text>
      </View>
    );
  } else {
    const m = item.row.msg;
    const talk = !item.row.group && (m.role === 'user' || m.role === 'assistant') && (m.kind === 'text' || m.kind === 'slash') && !!item.text;
    const row = <ChatRow row={item.row} onOpenFile={h.onOpenFile} />;
    body = (
      <>
        {talk ? (
          // 길게 누르기는 말(사용자·에이전트의 글)에만 — 도구 줄은 누르면 펼쳐지는 자기 동작이 있다.
          <Pressable
            onLongPress={() => h.onMenu({ text: item.text, ts: item.ts })}
            delayLongPress={380}
            accessibilityHint={i18n.t('길게 눌러 복사·공유')}
            style={{ opacity: item.queued || item.failed ? 0.6 : 1 }}
          >
            {row}
          </Pressable>
        ) : row}
        {item.queued ? <QueuedMark /> : null}
        {item.failed && item.msgKey ? (
          <FailedMark code={item.failed} offline={offline} onRetry={() => h.onRetryFailed(item.msgKey!)} onHide={() => h.onHideFailed(item.msgKey!)} />
        ) : null}
      </>
    );
  }
  return (
    <Animated.View entering={animate ? FadeInDown.duration(180) : undefined} style={{ marginBottom: 10 }}>
      {body}
    </Animated.View>
  );
});

// ── 자라는 글(스트리밍) ───────────────────────────────────────────────────
// 목록 **밖**(footer)에 산다. 글자가 들어올 때마다 목록 데이터를 새로 만들면 모든 행이 다시 그려진다.

/** 굳은 블록 — 글이 같으면 다시 그리지 않는다(긴 답변의 앞부분이 글자마다 다시 파싱되지 않게). */
const DoneBlock = memo(function DoneBlock({ text, onOpenFile }: { text: string; onOpenFile?: (p: string) => void }) {
  useTheme();
  return <ChatMarkdown text={text} onOpenFile={onOpenFile} />;
});

// 커서는 그리지 않는다 — 본문이 블록이라 커서가 늘 빈 줄에 혼자 놓였다(실기 확인). 진행은 아래 '작업 중' 줄이 알린다.

export const StreamingBlock = memo(function StreamingBlock({ block, onOpenFile }: { block: LiveBlock; onOpenFile?: (p: string) => void }) {
  useTheme();
  const C = v2.colors;
  const parts = useMemo(() => renderParts(block.text), [block.text]);
  if (block.kind === 'thinking') {
    // thinking 본문은 비어 올 수 있다(서명만, §2.5) → 그때는 표시만.
    return (
      <View style={{ marginBottom: 10 }}>
        <Text style={{ color: C.textDim, fontSize: 12, fontStyle: 'italic' }}>{i18n.t(THINKING_LABEL)}</Text>
        {block.text ? <Text style={{ color: C.textDim, fontSize: 12, lineHeight: 18, marginTop: 2 }} numberOfLines={6}>{block.text}</Text> : null}
      </View>
    );
  }
  return (
    <View style={{ alignSelf: 'stretch', marginBottom: 10 }}>
      {/* key = 순번 — 굳은 블록은 뒤로만 늘어난다(앞의 것은 글이 바뀌지 않는다 = memo 가 먹는다). */}
      {parts.done.map((t, i) => <DoneBlock key={i} text={t} onOpenFile={onOpenFile} />)}
      {parts.tail ? <ChatMarkdown text={parts.tail} onOpenFile={onOpenFile} /> : null}
    </View>
  );
});

// ── 작업 중 표시 ──────────────────────────────────────────────────────────

/** 1초마다 다시 그리는 경과 시간. since 를 모르면(0) 이 줄이 뜬 순간부터 센다. */
function Elapsed({ since }: { since: number }) {
  const C = v2.colors;
  const born = useRef(Date.now()).current;
  const [, tick] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(iv);
  }, []);
  const from = since > 0 ? since : born;
  const ms = Math.max(0, Date.now() - from);
  if (ms < 1000) return null;
  return <Text style={{ color: C.textDim, fontSize: 11.5 }}>{fmtDuration(ms)}</Text>;
}

export function WorkingRow({ doing, since }: { doing: { kind: 'tool' | 'thinking'; text: string } | null; since: number }) {
  const C = v2.colors;
  const label = doing && doing.kind === 'tool' && doing.text ? doing.text
    : doing && doing.kind === 'thinking' ? i18n.t(THINKING_LABEL)
      : i18n.t('작업 중');
  return (
    <Animated.View entering={FadeIn.duration(160)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 }}>
      <ActivityIndicator size="small" color={C.text3} />
      <Text
        numberOfLines={1}
        style={{ color: C.text3, fontSize: 12.5, flexShrink: 1, ...(doing && doing.kind === 'tool' ? { fontFamily: v2.font.mono as string } : {}) }}
      >
        {label}
      </Text>
      <Elapsed since={since} />
    </Animated.View>
  );
}

// ── footer 가 읽는 작은 저장소 ─────────────────────────────────────────────
// 목록(FlatList)의 props 가 델타마다 바뀌지 않게, 자라는 값은 이 저장소로만 흘린다.
export interface FooterState {
  live: LiveBlock[];
  working: boolean;
  /** 승인·질문을 기다리는 중 — 이때는 도크가 말한다("작업 중" 줄을 겹쳐 그리지 않는다). */
  waiting: boolean;
  doing: { kind: 'tool' | 'thinking'; text: string } | null;
  since: number;
}
export interface FooterStore { get: () => FooterState; set: (s: FooterState) => void; subscribe: (fn: () => void) => () => void }

export function createFooterStore(): FooterStore {
  let cur: FooterState = { live: [], working: false, waiting: false, doing: null, since: 0 };
  const subs = new Set<() => void>();
  return {
    get: () => cur,
    set: (s) => {
      const same = cur.live === s.live && cur.working === s.working && cur.waiting === s.waiting && cur.since === s.since
        && (cur.doing === s.doing || (!!cur.doing && !!s.doing && cur.doing.kind === s.doing.kind && cur.doing.text === s.doing.text));
      if (same) return;
      cur = s;
      subs.forEach((fn) => fn());
    },
    subscribe: (fn) => { subs.add(fn); return () => { subs.delete(fn); }; },
  };
}

export function ConvFooter({ store, onOpenFile }: { store: FooterStore; onOpenFile?: (p: string) => void }) {
  const s = useSyncExternalStore(store.subscribe, store.get);
  const texts = s.live.filter((l) => l.kind === 'text');
  const thinking = s.live.some((l) => l.kind === 'thinking');
  // 글이 나오는 동안에는 "작업 중" 줄을 감춘다 — 자라는 글과 커서가 이미 같은 말을 하고 있다.
  const showWorking = s.working && !s.waiting && !texts.some((l) => l.text);
  return (
    <View>
      {texts.map((l) => <StreamingBlock key={l.key} block={l} onOpenFile={onOpenFile} />)}
      {showWorking ? <WorkingRow doing={thinking && !s.doing ? { kind: 'thinking', text: '' } : s.doing} since={s.since} /> : null}
    </View>
  );
}
