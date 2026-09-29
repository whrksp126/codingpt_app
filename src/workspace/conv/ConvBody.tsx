import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, FlatList, ActivityIndicator, Modal, Pressable, ScrollView, Share, Clipboard,
  type NativeScrollEvent, type NativeSyntheticEvent,
} from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';
import { ArrowDown, ChatCircleDots, ListBullets, NotePencil, DotsThree, TerminalWindow, Copy, TextAa, ShareNetwork, WifiSlash, ArrowsClockwise, X } from 'phosphor-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { v2 } from '../../theme/v2Tokens';
import PressableScale from '../../components/ui/PressableScale';
import KeyTextInput from '../../components/keyboard/KeyTextInput';
import { haptic } from '../../animations/haptics';
import QuestionDock from '../../components/approval/QuestionDock';
import type { ApprovalRow } from '../../services/approvalService';
import { AT_BOTTOM_PX, type AgentMode, type AgentStatus, type SlashCommand } from '../chatModel';
import ChatComposer from '../chat/ChatComposer';
import AgentStatusStrip from '../chat/AgentStatusStrip';
import ImageViewer from '../chat/ImageViewer';
import AgentLogo from '../AgentLogo';
import { agentDisplayName, attachToken, resolveAttachTokens, type AttachEntry } from '../chat/composer';
import { attachWordsAll, attachWordsNow } from '../chat/attachWords';
import ConversationListSheet from './ConversationListSheet';
import { ConvFooter, ConvRow, createFooterStore, fmtStamp, type RowHandlers } from './ConvRows';
import useConv, { type RespondOpts } from './useConv';
import { convModeChoices, convModeLabel, errorText, reqToApproval, type ConvItem, type Thread } from './convModel';
import { toConvError } from '../../services/convService';
import * as i18n from '../../i18n/index.ts';

// 채팅 탭 본문(채팅 v2 — 구조화 대화). 계약: codingpt_daemon/docs/chat-v2-design.md §10.
//
// v1(터미널 탭의 Chat 모드)과 다른 점: 이 화면은 **터미널이 없다**. 입력은 PTY 에 타이핑되지 않고
//  conv.send 로 가며, 승인·질문은 화면 파싱이 아니라 데이터(req)로 온다. 그래서 v1 의 ChatBody 를
//  고쳐 쓰지 않고 새로 조립한다 — 행 렌더러·마크다운·컴포저·질문 카드는 같은 부품이다.
//
// 레이아웃 규율(v1 에서 실사고로 굳은 것들 — 여기도 똑같이 지킨다):
//  · **이중 인셋 금지**: 셸이 키보드만큼 이미 밀려 있다. KeyboardAvoidingView/insets.bottom 을 쓰지 않는다.
//  · 불투명 배경을 칠한다(PaneView 가 절대배치 레이어로 겹친다 — opacity 숨김은 iOS 에서 터치를 죽인다).
//  · 따라가기 스크롤은 즉시 점프(animated:false). 스트리밍 중 애니메이션 스크롤은 겹쳐서 덜컹거린다.

export interface ConvBodyProps {
  cwd: string;
  host: number | null;
  /** 이 워크스페이스의 PC 가 켜져 있는가. */
  hostOnline: boolean;
  /** 그 PC 가 채팅을 지원하는가 — false 면 "PC 업데이트 필요". null = 아직 모름(막지 않는다). */
  supported: boolean | null;
  account: string | number | null;
  wsName?: string;
  threadId: string | null;
  title: string;
  initialDraft: string;
  /** 지금 화면에 보이는가(가려진 탭은 폴링하지 않는다). */
  active: boolean;
  /** 탭/pane 에 값을 쓴다 — threadId·제목·초안. 대화 본문은 절대 넣지 않는다(§10.7). */
  onPatch: (patch: { threadId?: string | null; title?: string; chatDraft?: string; sid?: undefined }) => void;
  /** 다른 대화를 연다 — 이미 다른 탭에 열려 있으면 그 탭으로 가고(true), 아니면 이 탭이 그 대화가 된다(false). */
  onFocusExisting?: (threadId: string) => boolean;
  onOpenFile?: (relPath: string) => void;
  /** 새 터미널 탭을 열어 그 에이전트를 인자(`--resume <id>`)와 함께 실행한다(터미널에서 이어가기). 없으면 메뉴를 감춘다. */
  onOpenTerminal?: (agent: string, args: string[]) => void;
}

const DRAFT_MAX = 4096;

/**
 * 터미널로 넘길 **인자**(§4.4) — 실행 파일은 데몬의 카탈로그가 정하므로 여기엔 인자만 온다.
 *  응답의 `args` 가 정본이고, 없으면(구 데몬) `command` 에서 실행 파일을 뺀 나머지를 쓴다.
 *  인자는 데몬이 셸에 **타이핑**한다 → 셸이 뜻을 두는 글자가 든 인자는 받지 않는다. 그리고 이 대화의 id 가
 *  들어 있어야 한다(다른 대화를 여는 인자를 받아 실행하지 않는다).
 */
export function safeResumeArgs(args: unknown, command: unknown, threadId: string | null): string[] | null {
  if (!threadId) return null;
  let list: string[] = Array.isArray(args) ? args.filter((x): x is string => typeof x === 'string' && !!x) : [];
  if (!list.length) list = String(command || '').trim().split(/\s+/).filter(Boolean).slice(1);
  if (!list.length || list.length > 8) return null;
  if (!list.every((a) => /^[A-Za-z0-9_.=:@/+-]{1,120}$/.test(a))) return null;
  if (!list.includes(threadId)) return null;
  return list;
}

export default function ConvBody(props: ConvBodyProps) {
  const { cwd, host, hostOnline, supported, account, threadId, title, initialDraft, active, onPatch, onFocusExisting, onOpenFile, onOpenTerminal } = props;
  const C = v2.colors;
  const insets = useSafeAreaInsets();

  const patchRef = useRef(onPatch); patchRef.current = onPatch;
  const titleRef = useRef(title); titleRef.current = title;
  const tabThreadRef = useRef(threadId); tabThreadRef.current = threadId;

  const onThread = useCallback((t: { id: string; title: string }) => {
    // 탭에 아직 없는 값만 쓴다 — 같은 값을 다시 쓰면 레이아웃 영속·표면 동기화가 헛돈다.
    const p: { threadId?: string; title?: string } = {};
    if (tabThreadRef.current !== t.id) p.threadId = t.id;
    if (t.title && titleRef.current !== t.title) p.title = t.title;
    if (Object.keys(p).length) patchRef.current(p);
  }, []);

  const conv = useConv({ host, cwd, threadId, active, account, hostOnline, onThread });
  // 콜백은 conv 를 ref 로 읽는다 — conv 객체는 렌더마다 새것이라, 의존성에 넣으면 컴포저·행의 memo 가 매번 깨진다.
  const convRef = useRef(conv); convRef.current = conv;
  const blocked = supported === false;

  // ── 초안 — 로컬 state(즉시) + 600ms 디바운스 영속(+언마운트 flush). 글자마다 레이아웃을 갱신하지 않는다. ──
  const [draft, setDraft] = useState(initialDraft || '');
  const draftRef = useRef(draft); draftRef.current = draft;
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistDraft = useCallback((t: string) => {
    patchRef.current({ chatDraft: t.length > DRAFT_MAX ? t.slice(0, DRAFT_MAX) : t });
  }, []);
  const onDraftChange = useCallback((t: string) => {
    setDraft(t);
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => persistDraft(t), 600);
  }, [persistDraft]);
  const onDraftAppend = useCallback((t: string) => {
    setDraft(t);
    if (draftTimer.current) { clearTimeout(draftTimer.current); draftTimer.current = null; }
    persistDraft(t);
  }, [persistDraft]);
  useEffect(() => () => {
    if (draftTimer.current) clearTimeout(draftTimer.current);
    persistDraft(draftRef.current);
  }, [persistDraft]);

  // ── 첨부 칩(컴포저의 `+`) — v1 과 같은 방식: PC 로 올리고 본문에 경로를 인용한다(§4.1) ──
  const [attachReg, setAttachReg] = useState<AttachEntry[]>([]);
  const attachSeq = useRef(0);
  const [preview, setPreview] = useState<{ mediaType?: string; base64?: string; uri?: string; name: string } | null>(null);
  const addAttachEntries = useCallback((items: { path: string; name: string; image: boolean; base64?: string }[]) => {
    const added: AttachEntry[] = items.map((it) => {
      attachSeq.current += 1;
      return { token: attachToken(attachSeq.current, it.image, attachWordsNow()), path: it.path, name: it.name, image: it.image, base64: it.base64 };
    });
    setAttachReg((r) => [...r, ...added]);
    return added;
  }, []);
  const removeAttach = useCallback((token: string) => setAttachReg((r) => r.filter((a) => a.token !== token)), []);
  const previewLocal = useCallback((a: AttachEntry) => { if (a.base64) setPreview({ base64: a.base64, name: a.name }); }, []);

  // ── 요청 도크(§10.8) — 가장 오래된 것부터 하나씩 ──
  const req = conv.reqs[0] || null;
  const [dockErr, setDockErr] = useState<string | null>(null);
  const [foldedReq, setFoldedReq] = useState<string | null>(null);
  useEffect(() => { setDockErr(null); }, [req?.id]);
  const approval = useMemo(() => (req ? (reqToApproval(req, conv.thread, cwd) as unknown as ApprovalRow) : null), [req, conv.thread, cwd]);
  const respondRef = useRef(conv.respond); respondRef.current = conv.respond;
  const reqIdRef = useRef<string | null>(null); reqIdRef.current = req ? req.id : null;
  const onRespond = useCallback(async (decision: 'allow' | 'deny' | 'answer', o?: RespondOpts) => {
    const id = reqIdRef.current;
    if (!id) return;
    setDockErr(null);
    try { await respondRef.current(id, decision, o); }
    catch (e) { setDockErr(toConvError(e).code); throw e; }
  }, []);
  const dockOpen = !!req && !!approval && foldedReq !== req.id;
  // 질문이 하나뿐이면 컴포저에 친 글이 곧 그 질문의 답이다(입력칸을 두 개 두지 않는다 — v1 과 같은 규칙).
  const answerable = dockOpen && !!req && req.kind === 'question' && (req.questions?.length || 0) === 1;

  // ── 따라가기 스크롤(§10.4) ──
  const listRef = useRef<FlatList<ConvItem>>(null);
  const atBottomRef = useRef(true);
  /** 사용자가 손으로 굴리는 중인가 — 콘텐츠가 자라서 생긴 스크롤 이벤트와 구분하는 유일한 근거. */
  const userScrollRef = useRef(false);
  const [showJump, setShowJump] = useState(false);
  const toBottom = useCallback((animated = false) => {
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated }));
  }, []);
  const olderRef = useRef({ avail: false, busy: false, load: conv.loadOlder });
  olderRef.current = { avail: conv.olderAvailable, busy: conv.loadingOlder, load: conv.loadOlder };
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const dist = contentSize.height - contentOffset.y - layoutMeasurement.height;
    const at = dist < AT_BOTTOM_PX;
    if (at) {
      if (!atBottomRef.current) { atBottomRef.current = true; setShowJump(false); }
    } else if (userScrollRef.current && atBottomRef.current) {
      // 바닥을 떠나는 것은 **사용자가 굴렸을 때만** 인정한다. 글이 자라면 다음 프레임에 바닥이 멀어지는데,
      //  그걸 "위로 올렸다"로 읽으면 따라가기가 스스로 꺼진다(긴 답변 중간에 화면이 멈추던 증상).
      atBottomRef.current = false;
      setShowJump(true);
    }
    // 맨 위 근처까지 당겼다 → 이전 내역.
    if (userScrollRef.current && contentOffset.y < 60 && olderRef.current.avail && !olderRef.current.busy) void olderRef.current.load();
  }, []);
  const onBeginDrag = useCallback(() => { userScrollRef.current = true; }, []);
  const onEndDrag = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    // 관성이 없으면 여기서 끝난다(관성이 있으면 onMomentumScrollEnd 가 끝낸다).
    const v = e.nativeEvent.velocity;
    if (!v || (Math.abs(v.x || 0) < 0.05 && Math.abs(v.y || 0) < 0.05)) userScrollRef.current = false;
  }, []);
  const onMomentumEnd = useCallback(() => { userScrollRef.current = false; }, []);
  /** 콘텐츠가 자랐다·키보드가 떠서 목록이 줄었다 → 바닥에 있었으면 바닥 유지. */
  const stick = useCallback(() => { if (atBottomRef.current) toBottom(false); }, [toBottom]);
  const jump = useCallback(() => {
    atBottomRef.current = true;
    setShowJump(false);
    listRef.current?.scrollToEnd({ animated: true });
  }, []);

  // ── 행 등장 모션 — 처음부터 있던 행은 움직이지 않는다 ──
  const knownRef = useRef<Set<string>>(new Set());
  const settledRef = useRef(false);
  useEffect(() => {
    for (const it of conv.items) knownRef.current.add(it.key);
    if (conv.phase === 'ready') settledRef.current = true;
  }, [conv.items, conv.phase]);
  useEffect(() => { knownRef.current = new Set(); settledRef.current = false; }, [conv.threadId]);

  // ── footer 저장소(자라는 글·작업 중 표시) ──
  const footerStore = useRef(createFooterStore()).current;
  useEffect(() => {
    footerStore.set({ live: conv.live, working: conv.working, waiting: dockOpen, doing: conv.doing, since: conv.turnStartedAt });
  }, [footerStore, conv.live, conv.working, conv.doing, conv.turnStartedAt, dockOpen]);

  // ── 메시지 길게 누르기 메뉴 ──
  const [menu, setMenu] = useState<{ text: string; ts: number } | null>(null);
  const [selectText, setSelectText] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const onMenu = useCallback((a: { text: string; ts: number }) => { haptic.holdOpen(); setCopied(false); setMenu(a); }, []);

  const offline = conv.conn === 'offline';
  const handlers = useMemo<RowHandlers>(() => ({
    onOpenFile, onRetry: conv.retry, onDiscard: conv.discard, onMenu, onRetryFailed: conv.retryFailed, onHideFailed: conv.hideFailed,
  }), [onOpenFile, conv.retry, conv.discard, onMenu, conv.retryFailed, conv.hideFailed]);

  const renderItem = useCallback(({ item }: { item: ConvItem }) => (
    <ConvRow item={item} animate={settledRef.current && !knownRef.current.has(item.key)} offline={offline} h={handlers} />
  ), [handlers, offline]);
  const keyOf = useCallback((it: ConvItem) => it.key, []);

  // ── 보내기 ──
  const sendMsg = useCallback(async (text: string) => {
    const t = text.trim();
    if (!t) return;
    if (answerable && reqIdRef.current) {
      // 실패하면 쓴 글을 입력칸에 되돌린다 — 컴포저는 보내기 전에 입력칸을 비우고, 답에는 낙관 버블이 없다.
      try { await onRespond('answer', { answers: [{ questionIndex: 0, labels: [], text: t }] }); }
      catch (_) { const cur = draftRef.current; onDraftAppend(cur && cur.trim() ? `${text}\n${cur}` : text); }
      return;
    }
    const sendText = resolveAttachTokens(text, attachReg, attachWordsAll());
    if (!sendText.trim()) return;
    setAttachReg((r) => r.filter((a) => !text.includes(a.token)));
    convRef.current.send(text, sendText);
    // 보낸 직후에는 항상 바닥으로(§10.4) — 위를 보고 있었어도 내 말이 보여야 한다.
    atBottomRef.current = true;
    setShowJump(false);
    toBottom(false);
  }, [answerable, onRespond, onDraftAppend, attachReg, toBottom]);

  const [actErr, setActErr] = useState<string | null>(null);
  const flashErr = useCallback((code: string) => {
    setActErr(code);
    setTimeout(() => setActErr((c) => (c === code ? null : c)), 3500);
  }, []);
  const stop = useCallback(() => { convRef.current.interrupt().catch((e) => flashErr(toConvError(e).code)); }, [flashErr]);

  // ── 모드 ──
  const [modeBusy, setModeBusy] = useState(false);
  const modeBusyRef = useRef(false);
  const pickMode = useCallback((id: string) => {
    if (modeBusyRef.current) return;
    modeBusyRef.current = true;
    setModeBusy(true);
    convRef.current.setMode(id).catch((e) => flashErr(toConvError(e).code)).finally(() => { modeBusyRef.current = false; setModeBusy(false); });
  }, [flashErr]);
  // 알약·목록은 사람이 읽는 이름으로(v1 은 TUI 원문을 그대로 쓴다 — 그쪽은 화면을 미러하는 것이라 그렇다).
  const modeId = conv.mode || 'default';
  const mode = useMemo<AgentMode | null>(() => ({ id: modeId, label: convModeLabel(modeId) }), [modeId]);
  const modeChoices = useMemo(() => convModeChoices(modeId), [modeId]);

  // ── 슬래시 명령 ──
  const [cmds, setCmds] = useState<SlashCommand[] | null>(null);
  const [cmdsLoading, setCmdsLoading] = useState(false);
  const cmdsBusyRef = useRef(false);
  const loadCmds = useCallback(() => {
    if (cmdsBusyRef.current) return;
    cmdsBusyRef.current = true;
    setCmdsLoading(true);
    convRef.current.loadCommands()
      .then((items) => setCmds(items.map((c) => ({
        name: String(c.name || '').startsWith('/') ? String(c.name) : '/' + String(c.name || ''),
        desc: c.desc || '', chat: 'ok' as const, source: 'builtin' as const,
      }))))
      // 실패해도 조용히 빈 목록 — 팔레트만 안 뜨고 직접 치는 것은 그대로 된다.
      .catch(() => setCmds([]))
      .finally(() => { cmdsBusyRef.current = false; setCmdsLoading(false); });
  }, []);
  useEffect(() => { setCmds(null); }, [cwd, host, conv.threadId]);

  // ── 머리줄: 제목·목록·새 대화·더 보기 ──
  const [listOpen, setListOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [titleText, setTitleText] = useState('');
  const shownTitle = conv.thread?.title || title || '';
  const startRename = useCallback(() => {
    if (!conv.threadId) return;
    setTitleText(shownTitle);
    setRenaming(true);
  }, [conv.threadId, shownTitle]);
  const renamingRef = useRef(false); renamingRef.current = renaming;
  const commitRename = useCallback(() => {
    // 제출(⏎)과 포커스 이탈이 연달아 온다 — 한 번만 보낸다.
    if (!renamingRef.current) return;
    renamingRef.current = false;
    const v = titleText.trim();
    setRenaming(false);
    if (!v || v === shownTitle) return;
    patchRef.current({ title: v });
    convRef.current.setTitle(v).catch((e) => flashErr(toConvError(e).code));
  }, [titleText, shownTitle, flashErr]);

  const newChat = useCallback(() => {
    haptic.keyPress();
    setAttachReg([]);
    // sid 를 비운다 — 이 탭은 이제 다른 표면이다(옛 대화의 표면 등록은 동기화가 걷는다).
    patchRef.current({ threadId: null, title: '', sid: undefined });
  }, []);
  const openThread = useCallback((t: Thread) => {
    if (!t || !t.id || t.id === tabThreadRef.current) return;
    if (onFocusExisting && onFocusExisting(t.id)) return;
    setAttachReg([]);
    patchRef.current({ threadId: t.id, title: t.title || '', sid: undefined });
  }, [onFocusExisting]);

  const [handing, setHanding] = useState(false);
  const handoff = useCallback(async () => {
    setMoreOpen(false);
    if (handing || !onOpenTerminal) return;
    setHanding(true);
    try {
      const r = await convRef.current.toTerminal();
      const args = safeResumeArgs(r.args, r.command, convRef.current.threadId);
      if (!args) { flashErr('BAD_REQUEST'); return; }
      onOpenTerminal(r.agent, args);
    } catch (e) { flashErr(toConvError(e).code); } finally { setHanding(false); }
  }, [handing, onOpenTerminal, flashErr]);

  const status = useMemo<AgentStatus | null>(() => {
    const th = conv.thread;
    if (!th) return null;
    const u = th.usage || null;
    const st: AgentStatus = {};
    if (th.agent) st.agent = th.agent;
    if (th.model) st.model = String(th.model);
    if (u && typeof u.contextTokens === 'number') {
      st.contextUsed = u.contextTokens;
      if (typeof u.contextMax === 'number' && u.contextMax > 0) {
        st.contextMax = u.contextMax;
        st.contextPct = Math.max(0, Math.min(100, Math.round((u.contextTokens / u.contextMax) * 100)));
      }
    }
    if (u && typeof u.costUsd === 'number') st.costUsd = u.costUsd;
    return st.model || st.contextPct != null ? st : null;
  }, [conv.thread]);

  // 대화가 지워졌다(다른 기기에서 삭제) → 이 탭은 빈 새 대화로 되돌아간다(§4.4 — PC 와 같다).
  //  사라진 이유는 잠깐 알려 준다: 보던 대화가 말없이 비면 고장으로 보인다.
  const gone = conv.state.gone;
  const [wasDeleted, setWasDeleted] = useState(false);
  useEffect(() => {
    if (gone !== 'deleted') return;
    setWasDeleted(true);
    setAttachReg([]);
    patchRef.current({ threadId: null, title: '', sid: undefined });
    const t = setTimeout(() => setWasDeleted(false), 6000);
    return () => clearTimeout(t);
  }, [gone]);
  const busyInTerminal = conv.thread?.owner === 'terminal';
  const empty = !conv.items.length && !conv.live.length;
  const agentName = agentDisplayName(conv.thread?.agent || 'claude');

  // 목록 요소는 **재료가 바뀔 때만** 새로 만든다 — 델타(60ms)마다 이 컴포넌트는 다시 그려지지만
  //  FlatList 는 props 가 같으면 건너뛴다(자라는 글은 footer 가 저장소에서 직접 읽는다).
  const footerEl = useMemo(() => <ConvFooter store={footerStore} onOpenFile={onOpenFile} />, [footerStore, onOpenFile]);
  const headerEl = useMemo(() => (
    conv.loadingOlder ? (
      <View style={{ paddingVertical: 8, alignItems: 'center' }}><ActivityIndicator size="small" color={C.textDim} /></View>
    ) : conv.olderAvailable ? (
      <PressableScale
        onPress={() => { void conv.loadOlder(); }}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={i18n.t('이전 대화 더 보기')}
        style={{ alignSelf: 'center', paddingHorizontal: 12, height: 30, justifyContent: 'center', marginBottom: 8 }}
      >
        <Text style={{ color: C.textDim, fontSize: 11.5 }}>{i18n.t('이전 대화 더 보기')}</Text>
      </PressableScale>
    ) : null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [conv.loadingOlder, conv.olderAvailable, conv.loadOlder, C.textDim]);
  const listEl = useMemo(() => (
    <FlatList
      ref={listRef}
      data={conv.items}
      keyExtractor={keyOf}
      renderItem={renderItem}
      onScroll={onScroll}
      onScrollBeginDrag={onBeginDrag}
      onScrollEndDrag={onEndDrag}
      onMomentumScrollEnd={onMomentumEnd}
      onContentSizeChange={stick}
      onLayout={stick}
      scrollEventThrottle={48}
      keyboardShouldPersistTaps="handled"
      // 목록을 끌면 키보드가 내려간다(읽으려고 굴리는데 키보드가 화면 절반을 가리고 있으면 안 된다).
      keyboardDismissMode="on-drag"
      contentContainerStyle={LIST_PAD}
      // 위에 이전 내역이 붙어도 보던 자리가 튀지 않게.
      maintainVisibleContentPosition={KEEP_POS}
      ListHeaderComponent={headerEl}
      ListFooterComponent={footerEl}
      initialNumToRender={14}
      windowSize={9}
      removeClippedSubviews={false}
    />
  ), [conv.items, keyOf, renderItem, onScroll, onBeginDrag, onEndDrag, onMomentumEnd, stick, headerEl, footerEl]);

  return (
    <View style={{ flex: 1, backgroundColor: C.base }}>
      {/* ── 머리줄 ── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', height: 40, paddingLeft: 12, paddingRight: 4, gap: 2, borderBottomWidth: 1, borderBottomColor: C.border }}>
        {renaming ? (
          <KeyTextInput
            value={titleText}
            onChangeText={setTitleText}
            autoFocus
            noBar
            maxLength={120}
            returnKeyType="done"
            onSubmitEditing={commitRename}
            onBlur={commitRename}
            accessibilityLabel={i18n.t('대화 제목')}
            placeholder={i18n.t('대화 제목')}
            placeholderTextColor={C.textDim}
            style={{ flex: 1, color: C.text, fontSize: 13.5, fontWeight: '600', padding: 0 }}
          />
        ) : (
          <PressableScale
            onPress={startRename}
            disabled={!conv.threadId}
            scaleTo={0.98}
            accessibilityRole="button"
            accessibilityLabel={conv.threadId ? i18n.t('대화 제목 바꾸기') : i18n.t('새 대화')}
            style={{ flex: 1, height: 40, justifyContent: 'center' }}
          >
            <Text numberOfLines={1} style={{ color: shownTitle ? C.text : C.text3, fontSize: 13.5, fontWeight: '600' }}>
              {shownTitle || i18n.t('새 대화')}
            </Text>
          </PressableScale>
        )}
        <HeadBtn label={i18n.t('대화 목록')} onPress={() => { haptic.keyPress(); setListOpen(true); }}><ListBullets size={18} color={C.text2} /></HeadBtn>
        <HeadBtn label={i18n.t('새 대화')} onPress={newChat} disabled={!conv.threadId}><NotePencil size={18} color={C.text2} /></HeadBtn>
        {onOpenTerminal && conv.threadId ? (
          <HeadBtn label={i18n.t('더 보기')} onPress={() => { haptic.keyPress(); setMoreOpen(true); }}>
            {handing ? <ActivityIndicator size="small" color={C.text2} /> : <DotsThree size={20} color={C.text2} weight="bold" />}
          </HeadBtn>
        ) : null}
      </View>

      {/* ── 연결 상태 줄 — 무채색. 끊긴 동안 화면이 왜 멈췄는지 말한다. ── */}
      {conv.conn !== 'ok' ? (
        <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(160)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: C.elevated, borderBottomWidth: 1, borderBottomColor: C.border }}>
          {conv.conn === 'offline' ? <WifiSlash size={13} color={C.text3} /> : <ArrowsClockwise size={13} color={C.text3} />}
          <Text style={{ flex: 1, color: C.text3, fontSize: 12 }}>
            {conv.conn === 'offline' ? i18n.t('PC가 꺼져 있거나 연결이 끊겼어요. 켜지면 이어서 받아 와요.') : i18n.t('다시 연결하는 중…')}
          </Text>
        </Animated.View>
      ) : null}
      {blocked ? <Notice text={i18n.t('이 PC 앱을 업데이트해야 채팅을 쓸 수 있어요')} /> : null}
      {wasDeleted || gone === 'deleted' ? <Notice text={i18n.t('이 대화는 삭제됐어요.')} /> : null}
      {busyInTerminal && !gone ? <Notice text={i18n.t('이 대화는 터미널에서 사용 중이에요. 대화 목록에서 채팅으로 가져올 수 있어요.')} /> : null}

      <View style={{ flex: 1 }}>
        {conv.phase === 'loading' && empty ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={C.text3} /></View>
        ) : conv.phase === 'error' && empty ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 }}>
            <ChatCircleDots size={30} color={C.textDim} />
            <Text style={{ color: C.text3, fontSize: 13, textAlign: 'center', lineHeight: 20 }}>{errorText(conv.error)}</Text>
            <PressableScale onPress={() => { void conv.refresh(); }} hitSlop={8} accessibilityRole="button" accessibilityLabel={i18n.t('다시 시도')}
              style={{ paddingHorizontal: 14, height: 34, borderRadius: v2.radius.sm, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.borderControl, backgroundColor: C.elevated2 }}>
              <Text style={{ color: C.text, fontSize: 12.5, fontWeight: '600' }}>{i18n.t('다시 시도')}</Text>
            </PressableScale>
          </View>
        ) : empty && !conv.working ? (
          // 새 대화 — 오류가 아니다. 가운데 글리프 + 짧은 인사, 주인공은 아래 입력칸이다.
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 }}>
            <AgentLogo brand={conv.thread?.agent || 'claude'} color={C.text3} size={34} />
            <Text style={{ color: C.text2, fontSize: 15, fontWeight: '600' }}>{i18n.t('무엇이든 요청하세요')}</Text>
            <Text style={{ color: C.textDim, fontSize: 12.5, textAlign: 'center', lineHeight: 18 }}>
              {i18n.t('PC에 설치된 에이전트가 이 워크스페이스에서 작업해요.')}
            </Text>
          </View>
        ) : (
          <>
            {listEl}
            {showJump ? (
              <Animated.View entering={FadeInDown.duration(160)} exiting={FadeOut.duration(120)} style={{ position: 'absolute', right: 14, bottom: 12, zIndex: 3, elevation: 3 }}>
                <PressableScale
                  onPress={jump}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={i18n.t('맨 아래로')}
                  style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: C.elevated2, borderWidth: 1, borderColor: C.borderControl }}
                >
                  <ArrowDown size={17} color={C.text2} />
                </PressableScale>
              </Animated.View>
            ) : null}
          </>
        )}
      </View>

      {/* ── 요청 도크 ── */}
      {dockOpen && approval ? (
        <Animated.View key={req!.id} entering={FadeInDown.duration(200)}>
          <QuestionDock approval={approval} onRespond={onRespond} onDismiss={() => setFoldedReq(req!.id)} />
          {conv.reqs.length > 1 ? (
            <Text style={{ color: C.textDim, fontSize: 11.5, paddingHorizontal: 14, paddingTop: 4 }}>
              {i18n.t('{n}개 더 기다리는 중', { n: conv.reqs.length - 1 })}
            </Text>
          ) : null}
          {dockErr ? <Text style={{ color: C.error, fontSize: 11.5, paddingHorizontal: 14, paddingTop: 4 }}>{errorText(dockErr)}</Text> : null}
        </Animated.View>
      ) : req && foldedReq === req.id ? (
        // 접어 둔 요청 — 요청은 살아 있다(마감이 없다). 다시 펼 길을 남긴다.
        <PressableScale onPress={() => setFoldedReq(null)} hitSlop={6} accessibilityRole="button" accessibilityLabel={i18n.t('기다리는 요청 보기')}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginHorizontal: 10, marginTop: 8, paddingHorizontal: 12, height: 34, borderRadius: v2.radius.md, borderWidth: 1, borderColor: C.borderControl, backgroundColor: C.elevated }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.warn }} />
          <Text style={{ flex: 1, color: C.text2, fontSize: 12.5 }}>{i18n.t('답을 기다리는 요청 {n}개', { n: conv.reqs.length })}</Text>
        </PressableScale>
      ) : null}

      {status ? <AgentStatusStrip status={status} /> : null}
      {actErr ? <Text style={{ color: C.error, fontSize: 11.5, paddingHorizontal: 14, paddingTop: 2 }}>{errorText(actErr)}</Text> : null}

      <Composer
        attachReg={attachReg}
        onAttachAdd={addAttachEntries}
        onAttachRemove={removeAttach}
        onPreviewLocal={previewLocal}
        draft={draft}
        onDraftChange={onDraftChange}
        onDraftAppend={onDraftAppend}
        onSend={sendMsg}
        onStop={stop}
        // 전송 중에도 다음 글을 쓸 수 있다(§10.2 5) — 컴포저를 잠그지 않는다.
        busy={false}
        running={conv.working}
        stopReplacesSend
        cwd={cwd}
        host={host}
        agentName={agentName}
        placeholderOverride={answerable ? i18n.t('또는 직접 답장…') : undefined}
        mode={mode}
        modeChoices={modeChoices}
        modeBusy={modeBusy}
        onPickMode={pickMode}
        commands={cmds}
        commandsLoading={cmdsLoading}
        onNeedCommands={loadCmds}
        disabled={blocked || !!gone || busyInTerminal}
      />

      <ImageViewer item={preview} onClose={() => setPreview(null)} />
      <ConversationListSheet
        visible={listOpen}
        onClose={() => setListOpen(false)}
        host={host}
        cwd={cwd}
        account={account}
        currentId={conv.threadId}
        onOpen={openThread}
        onNew={newChat}
      />

      {/* 더 보기 */}
      <Modal visible={moreOpen} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={() => setMoreOpen(false)}
        supportedOrientations={['portrait', 'portrait-upside-down', 'landscape', 'landscape-left', 'landscape-right']}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(5,7,12,0.5)' }} onPress={() => setMoreOpen(false)} accessibilityLabel={i18n.t('닫기')} />
        <View style={{ position: 'absolute', left: 10, right: 10, bottom: Math.max(insets.bottom, 10), backgroundColor: C.surface, borderRadius: v2.radius.md, borderWidth: 1, borderColor: C.borderControl, overflow: 'hidden' }}>
          <SheetRow icon={<TerminalWindow size={17} color={C.text2} />} label={i18n.t('터미널에서 이어가기')}
            sub={conv.working ? i18n.t('작업이 끝난 뒤에 할 수 있어요.') : i18n.t('이 대화를 새 터미널에서 계속해요.')}
            disabled={conv.working} onPress={() => { void handoff(); }} />
        </View>
      </Modal>

      {/* 메시지 길게 누르기 */}
      <Modal visible={!!menu} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={() => setMenu(null)}
        supportedOrientations={['portrait', 'portrait-upside-down', 'landscape', 'landscape-left', 'landscape-right']}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(5,7,12,0.5)' }} onPress={() => setMenu(null)} accessibilityLabel={i18n.t('닫기')} />
        <View style={{ position: 'absolute', left: 10, right: 10, bottom: Math.max(insets.bottom, 10), backgroundColor: C.surface, borderRadius: v2.radius.md, borderWidth: 1, borderColor: C.borderControl, overflow: 'hidden' }}>
          {menu && menu.ts ? (
            <Text style={{ color: C.textDim, fontSize: 11, paddingHorizontal: 14, paddingTop: 10 }}>{fmtStamp(menu.ts)}</Text>
          ) : null}
          <SheetRow icon={<Copy size={17} color={C.text2} />} label={copied ? i18n.t('복사됨') : i18n.t('복사')}
            onPress={() => { if (menu) { try { Clipboard.setString(menu.text); setCopied(true); } catch (_) { /* noop */ } setTimeout(() => setMenu(null), 350); } }} />
          <View style={{ height: 1, backgroundColor: C.border }} />
          <SheetRow icon={<TextAa size={17} color={C.text2} />} label={i18n.t('텍스트 선택')}
            onPress={() => { const t = menu ? menu.text : ''; setMenu(null); setTimeout(() => setSelectText(t), 250); }} />
          <View style={{ height: 1, backgroundColor: C.border }} />
          <SheetRow icon={<ShareNetwork size={17} color={C.text2} />} label={i18n.t('공유')}
            onPress={() => { const t = menu ? menu.text : ''; setMenu(null); setTimeout(() => { Share.share({ message: t }).catch(() => { /* 취소 */ }); }, 250); }} />
        </View>
      </Modal>

      {/* 텍스트 선택 — 마크다운으로 그린 글은 범위 선택이 안 된다 → 원문을 선택 가능한 글로 펼친다. */}
      <Modal visible={selectText != null} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={() => setSelectText(null)}
        supportedOrientations={['portrait', 'portrait-upside-down', 'landscape', 'landscape-left', 'landscape-right']}>
        <View style={{ flex: 1, backgroundColor: C.base, paddingTop: Math.max(insets.top, 12), paddingBottom: Math.max(insets.bottom, 12) }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, height: 44 }}>
            <Text style={{ flex: 1, color: C.text, fontSize: 15, fontWeight: '700' }}>{i18n.t('텍스트 선택')}</Text>
            <HeadBtn label={i18n.t('닫기')} onPress={() => setSelectText(null)}><X size={18} color={C.text2} /></HeadBtn>
          </View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}>
            <Text selectable style={{ color: C.text, fontSize: 14.5, lineHeight: 22 }}>{selectText || ''}</Text>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const LIST_PAD = { paddingHorizontal: 14, paddingTop: 14, paddingBottom: 8 };
const KEEP_POS = { minIndexForVisible: 1 };

// 컴포저는 델타(60ms)마다 다시 그릴 이유가 없다 — props 가 같으면 건너뛴다.
const Composer = memo(ChatComposer);

function HeadBtn({ children, label, onPress, disabled }: { children: React.ReactNode; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <PressableScale onPress={onPress} disabled={disabled} baseOpacity={disabled ? 0.35 : 1} hitSlop={6} accessibilityRole="button" accessibilityLabel={label}
      style={{ width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}>
      {children}
    </PressableScale>
  );
}

function Notice({ text }: { text: string }) {
  const C = v2.colors;
  return (
    <View style={{ paddingHorizontal: 12, paddingVertical: 7, backgroundColor: C.elevated, borderBottomWidth: 1, borderBottomColor: C.border }}>
      <Text style={{ color: C.text3, fontSize: 12, lineHeight: 17 }}>{text}</Text>
    </View>
  );
}

function SheetRow({ icon, label, sub, onPress, disabled }: { icon: React.ReactNode; label: string; sub?: string; onPress: () => void; disabled?: boolean }) {
  const C = v2.colors;
  return (
    <Pressable
      onPress={() => { if (disabled) return; haptic.keyPress(); onPress(); }}
      android_ripple={disabled ? undefined : { color: C.elevated2 }}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, minHeight: 52, paddingVertical: 8, opacity: disabled ? 0.45 : 1 }}
    >
      {icon}
      <View style={{ flex: 1 }}>
        <Text style={{ color: C.text, fontSize: 14, fontWeight: '600' }}>{label}</Text>
        {sub ? <Text style={{ color: C.textDim, fontSize: 11.5, marginTop: 2 }}>{sub}</Text> : null}
      </View>
    </Pressable>
  );
}
