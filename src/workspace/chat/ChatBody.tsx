import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, FlatList, ActivityIndicator, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { ArrowDown, ChatCircleDots, TerminalWindow } from 'phosphor-react-native';

import { v2 } from '../../theme/v2Tokens';
import PressableScale from '../../components/ui/PressableScale';
import chatService from '../../services/chatService';
import { AT_BOTTOM_PX, buildRows, looksBusy, type ChatRowModel, type PendingUser } from '../chatModel';
import ChatRow, { PendingRow } from './ChatRow';
import ChatComposer from './ChatComposer';
import useChatStream from './useChatStream';

// 터미널 탭의 Chat 모드 본문 — 트랜스크립트 읽기(말풍선) + 컴포저(PTY 하네스 전송).
//
// 레이어 규율(PaneView 가 이 컴포넌트를 절대배치 레이어에 넣는다):
//  · 터미널 레이어는 **살아있는 채로 zIndex 0 으로 가려진다**(언마운트 금지 — 재연결 카운터 소진).
//  · opacity:0 숨김 금지(iOS WKWebView 터치 계층이 죽는다) → 이 컴포넌트는 불투명 배경을 칠한다.
//
// 자동 스크롤: 사용자가 맨 아래(±48px)에 있을 때만 즉시 점프(animated:false). 스트리밍 중 애니메이션
//  스크롤은 겹쳐서 잰크가 나고 긴 대화 첫 진입이 느려진다(삭제본 MessageList 교훈).

type RowItem =
  | { t: 'msg'; key: string; row: ChatRowModel }
  | { t: 'pending'; key: string; item: PendingUser };

export default function ChatBody({
  cwd, host, tid, wsName, initialDraft, onDraftPersist, onOpenFile, onExitChat, agentAlive, headerSlot, active,
}: {
  cwd: string;
  host: number | null;
  /** 이 탭의 터미널 tid(안정 31-bit). null 이면 아직 win 미확보 → 구독하지 않는다. */
  tid: number | null;
  wsName?: string;
  /** 복원된 초안(탭에 영속된 값). 이후 편집은 로컬 state 로 두고 디바운스로만 영속한다 —
   *  글자마다 레이아웃 트리를 갱신하면 pane 전체가 리렌더된다. */
  initialDraft: string;
  onDraftPersist: (t: string) => void;
  onOpenFile?: (relPath: string) => void;
  /** TUI 모드로 되돌리기(에이전트 종료 배너의 버튼) */
  onExitChat: () => void;
  /** 에이전트가 아직 붙어 있는가(기능3 미도달 → tab.cmd 폴백 판정 결과) */
  agentAlive: boolean;
  /** 승인 카드 배너 등 상단 삽입 영역 */
  headerSlot?: React.ReactNode;
  /** 지금 화면에 보이는가 — false 면 구독을 끊어 폴링 트래픽을 0 으로(마운트는 유지). */
  active: boolean;
}) {
  const C = v2.colors;
  const stream = useChatStream({ cwd, tid, host, active });
  const listRef = useRef<FlatList<RowItem>>(null);
  const atBottomRef = useRef(true);
  const [showJump, setShowJump] = useState(false);
  const [sending, setSending] = useState(false);

  // 초안 — 로컬 state(즉시 반영) + 600ms 디바운스 영속(+언마운트 시 flush).
  const [draft, setDraft] = useState(initialDraft || '');
  const draftRef = useRef(draft); draftRef.current = draft;
  const persistRef = useRef(onDraftPersist); persistRef.current = onDraftPersist;
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onDraftChange = useCallback((t: string) => {
    setDraft(t);
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => persistRef.current(t), 600);
  }, []);
  useEffect(() => () => {
    if (draftTimer.current) clearTimeout(draftTimer.current);
    persistRef.current(draftRef.current); // 언마운트 시 마지막 값 flush(전환/앱 종료에도 보존)
  }, []);

  const msgRows = useMemo(() => buildRows(stream.messages), [stream.messages]);
  const rows = useMemo<RowItem[]>(() => {
    const base: RowItem[] = msgRows.map((r) => ({ t: 'msg', key: 'm' + r.key, row: r }));
    for (const p of stream.pending) base.push({ t: 'pending', key: 'p' + p.id, item: p });
    return base;
  }, [msgRows, stream.pending]);
  // 작업 중 추정(중단 버튼 노출용) — 낙관적 버블이 남아 있으면 아직 응답 전이므로 작업 중으로 본다.
  const busyGuess = useMemo(
    () => (stream.pending.some((p) => p.state === 'sending') ? true : looksBusy(msgRows)),
    [msgRows, stream.pending],
  );

  // 맨 아래 유지 — 새 행이 붙을 때만(스크롤 위치를 사용자가 잡고 있으면 건드리지 않는다).
  const lenRef = useRef(0);
  useEffect(() => {
    const grew = rows.length > lenRef.current;
    lenRef.current = rows.length;
    if (!grew) return;
    if (atBottomRef.current) {
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: false }));
      setShowJump(false);
    } else {
      setShowJump(true);
    }
  }, [rows.length]);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const dist = contentSize.height - contentOffset.y - layoutMeasurement.height;
    const at = dist < AT_BOTTOM_PX;
    atBottomRef.current = at;
    if (at && showJump) setShowJump(false);
  }, [showJump]);

  const jump = useCallback(() => {
    atBottomRef.current = true;
    setShowJump(false);
    listRef.current?.scrollToEnd({ animated: true });
  }, []);

  const attachCtx = useCallback(() => ({ cwd, host }), [cwd, host]);

  const send = useCallback(async (text: string) => {
    if (tid == null) return;
    const optId = stream.addPending(text);
    setSending(true);
    try {
      // 데몬이 bracketed paste + 지연 Enter 로 넣는다(멀티라인이 줄마다 실행되지 않게).
      await chatService.chatInput({ cwd, tid, text, submit: true, host });
      // 트랜스크립트 반영을 기다리지 않고 곧바로 캐치업 — 폴링 주기(4s)만큼 멍하지 않게.
      stream.poke();
    } catch (_) {
      stream.failPending(optId);
    } finally { setSending(false); }
  }, [cwd, tid, host, stream]);

  const stop = useCallback(() => {
    if (tid == null) return;
    // 중단 = Ctrl-C 를 그 PTY 에 넣는다(제출 없이 바이트만) — TUI 에서 Esc/Ctrl-C 와 동일 효과.
    void chatService.chatInput({ cwd, tid, text: '\x03', submit: false, host }).catch(() => { /* noop */ });
  }, [cwd, tid, host]);

  const renderItem = useCallback(({ item }: { item: RowItem }) => (
    <View style={{ marginBottom: 10 }}>
      {item.t === 'pending' ? <PendingRow item={item.item} /> : <ChatRow row={item.row} onOpenFile={onOpenFile} />}
    </View>
  ), [onOpenFile]);

  const empty = !rows.length;

  return (
    <View style={{ flex: 1, backgroundColor: C.base }}>
      {headerSlot}
      {!agentAlive ? (
        // 사용자 의사 없이 화면을 바꾸지 않는다(§6-4 (a)) — 배너만 띄우고 전환은 사용자가 누른다.
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: C.elevated, borderBottomWidth: 1, borderBottomColor: C.border }}>
          <Text style={{ flex: 1, color: C.text3, fontSize: 12 }}>에이전트가 종료됐어요. 대화 기록은 계속 볼 수 있어요.</Text>
          <PressableScale onPress={onExitChat} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, height: 28, borderRadius: v2.radius.sm, borderWidth: 1, borderColor: C.borderControl, backgroundColor: C.elevated2 }}>
            <TerminalWindow size={13} color={C.text2} />
            <Text style={{ color: C.text2, fontSize: 12, fontWeight: '600' }}>터미널</Text>
          </PressableScale>
        </View>
      ) : null}

      <View style={{ flex: 1 }}>
        {stream.state === 'loading' && empty ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={C.accent} />
          </View>
        ) : stream.state === 'unsupported' || (stream.state === 'error' && empty) ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 }}>
            <ChatCircleDots size={30} color={C.textDim} />
            <Text style={{ color: C.text3, fontSize: 13, textAlign: 'center', lineHeight: 20 }}>
              {stream.error || '대화를 불러올 수 없어요.'}
            </Text>
            <PressableScale onPress={stream.reload} hitSlop={8} style={{ paddingHorizontal: 14, height: 34, borderRadius: v2.radius.sm, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.borderControl, backgroundColor: C.elevated2 }}>
              <Text style={{ color: C.text, fontSize: 12.5, fontWeight: '600' }}>다시 시도</Text>
            </PressableScale>
          </View>
        ) : (
          <>
            <FlatList
              ref={listRef}
              data={rows}
              keyExtractor={(it) => it.key}
              renderItem={renderItem}
              onScroll={onScroll}
              scrollEventThrottle={64}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 14, paddingBottom: 8 }}
              // 상단에 과거 대화가 붙어도 현재 보던 위치가 튀지 않게.
              maintainVisibleContentPosition={{ minIndexForVisible: 1 }}
              ListHeaderComponent={stream.headTruncated ? (
                <Text style={{ color: C.textDim, fontSize: 11, textAlign: 'center', marginBottom: 10 }}>
                  이전 대화는 PC 에 더 있어요(최근 부분만 표시)
                </Text>
              ) : null}
              ListEmptyComponent={(
                <View style={{ paddingTop: 40, alignItems: 'center', gap: 8 }}>
                  <ChatCircleDots size={28} color={C.textDim} />
                  <Text style={{ color: C.textDim, fontSize: 12.5 }}>
                    {wsName ? `「${wsName}」 대화가 아직 없어요` : '대화가 아직 없어요'}
                  </Text>
                </View>
              )}
            />
            {showJump ? (
              <PressableScale
                onPress={jump}
                hitSlop={10}
                style={{
                  position: 'absolute', right: 14, bottom: 12, zIndex: 3, elevation: 3,
                  width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: C.elevated2, borderWidth: 1, borderColor: C.borderControl,
                }}
              >
                <ArrowDown size={17} color={C.text2} />
              </PressableScale>
            ) : null}
          </>
        )}
      </View>

      <ChatComposer
        draft={draft}
        onDraftChange={onDraftChange}
        onSend={send}
        onStop={stop}
        busy={sending}
        running={agentAlive && busyGuess}
        attachCtx={attachCtx}
        disabled={tid == null}
        disabledHint={tid == null ? '터미널이 아직 준비되지 않았어요.' : undefined}
      />
    </View>
  );
}
