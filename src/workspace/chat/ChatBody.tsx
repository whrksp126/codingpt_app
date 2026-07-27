import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, FlatList, ActivityIndicator, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { ArrowDown, ChatCircleDots, TerminalWindow } from 'phosphor-react-native';

import { v2 } from '../../theme/v2Tokens';
import PressableScale from '../../components/ui/PressableScale';
import chatService from '../../services/chatService';
import { AT_BOTTOM_PX, buildRows, looksBusy, type ChatRowModel, type PendingUser } from '../chatModel';
import ChatRow, { PendingRow } from './ChatRow';
import ChatComposer from './ChatComposer';
import ChatSessionsSheet from './ChatSessionsSheet';
import useChatStream from './useChatStream';
import { agentDisplayName } from './composer';
import AgentLogo from '../AgentLogo';

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
  sessionOverride, onPickSession,
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
  /** 사용자가 'ambiguous' 에서 고른 대화(탭에 기억된 값) — 있으면 그 세션으로 연다. */
  sessionOverride?: string | null;
  /** 대화 선택 결과를 탭에 기억시킨다(mode 와 같은 규율 = 영속·탭 이동 시 자동 승계). */
  onPickSession?: (sessionId: string) => void;
}) {
  const C = v2.colors;
  const stream = useChatStream({ cwd, tid, host, active, sessionId: sessionOverride ?? null });
  const [sessionsOpen, setSessionsOpen] = useState(false);
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
  // `+` 삽입 전용 — **디바운스 없이 즉시 영속**한다. 업로드/파일 선택은 수 초 걸려서 그 사이 사용자가
  //  탭을 바꾸거나 TUI 로 돌아가면 컴포저가 언마운트되는데, 그때 디바운스 타이머에만 의존하면 방금 고른
  //  경로가 어디에도 안 남는다(에러 0건 — 사용자는 "+ 눌렀는데 아무것도 안 들어왔다" 로만 겪는다).
  const onDraftAppend = useCallback((t: string) => {
    setDraft(t);
    if (draftTimer.current) { clearTimeout(draftTimer.current); draftTimer.current = null; }
    persistRef.current(t);
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
        ) : stream.state === 'empty' && empty ? (
          // ── 아직 대화가 없다 = **오류가 아니다** ─────────────────────────────────
          //  주류 에이전트 앱(ChatGPT/Claude/Gemini) 형태: 중앙에 글리프 + 짧은 인사 한 줄,
          //  주인공은 아래 컴포저다. 오류/경고 프레이밍 금지, 설명문 최소(사용자는 텍스트를 안 읽는다).
          //  "곧 시작됩니다" 같은 거짓 진행 표현도 쓰지 않는다 — 실제로 진행 중인 것이 없다.
          //  다른 세션의 대화를 대신 보여주는 일은 절대 하지 않는다(그게 원래 신고된 증상이다).
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 }}>
            {/* 글리프는 붙어 있는 에이전트를 알면 그 로고(참고 앱들도 자기 로고를 쓴다), 모르면 말풍선.
                PC `chat-view._renderBlank()` 와 같은 규칙. */}
            {stream.agent ? <AgentLogo brand={stream.agent} color={C.text3} size={34} />
              : <ChatCircleDots size={34} color={C.text3} />}
            <Text style={{ color: C.text2, fontSize: 15, fontWeight: '600' }}>무엇이든 요청하세요</Text>
            {/* 'ambiguous'(후보 여럿) / 'claimed'(후보가 전부 다른 터미널의 것) = 사람이 고를 여지가
                있는 두 경우. 조용한 보조 액션으로만 둔다(기본 동작은 "새로 시작" 이다). */}
            {stream.noSession === 'ambiguous' || stream.noSession === 'claimed' ? (
              <PressableScale
                onPress={() => setSessionsOpen(true)} hitSlop={8}
                style={{ paddingHorizontal: 12, height: 32, borderRadius: v2.radius.sm, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.borderControl, backgroundColor: C.elevated2 }}
              >
                <Text style={{ color: C.text2, fontSize: 12.5 }}>
                  {stream.candidates > 0 ? `다른 대화 보기 (${stream.candidates})` : '다른 대화 보기'}
                </Text>
              </PressableScale>
            ) : null}
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
        onDraftAppend={onDraftAppend}
        onSend={send}
        onStop={stop}
        busy={sending}
        running={agentAlive && busyGuess}
        // 컴포저 `+`(첨부 업로드 · 워크스페이스 파일 목록)의 대상 — 이 워크스페이스 루트/호스트 PC.
        cwd={cwd}
        host={host}
        agentName={agentDisplayName(stream.agent)}
        // ★ noSession 이어도 컴포저는 활성이다 — 전송이 곧 대화를 시작시킨다(훅이 바인딩을 만든다).
        disabled={tid == null}
        disabledHint={tid == null ? '터미널이 아직 준비되지 않았어요.' : undefined}
      />

      {/* 대화 고르기 — ambiguous 에서만 띄운다. 고른 세션은 탭에 기억되고 그 즉시 재오픈된다. */}
      {sessionsOpen ? (
        <ChatSessionsSheet
          visible={sessionsOpen}
          onClose={() => setSessionsOpen(false)}
          onPick={(sid) => { onPickSession?.(sid); }}
          cwd={cwd}
          host={host}
        />
      ) : null}
    </View>
  );
}
