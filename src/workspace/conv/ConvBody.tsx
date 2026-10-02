import React, { memo, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  View, Text, FlatList, ActivityIndicator, Modal, Pressable, ScrollView, Share, Clipboard,
  type NativeScrollEvent, type NativeSyntheticEvent,
} from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';
import {
  ArrowDown, ChatCircleDots, ListBullets, NotePencil, DotsThree, TerminalWindow, Copy, TextAa, ShareNetwork, WifiSlash, ArrowsClockwise, X,
  MagnifyingGlass, CaretUp, CaretDown, Cpu, Check,
} from 'phosphor-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { v2 } from '../../theme/v2Tokens';
import PressableScale from '../../components/ui/PressableScale';
import PressableRow from '../../components/ui/PressableRow';
import Sheet, { MODAL_ORIENTATIONS } from '../../components/ui/Sheet';
import KeyTextInput from '../../components/keyboard/KeyTextInput';
import { haptic } from '../../animations/haptics';
import QuestionDock from '../../components/approval/QuestionDock';
import type { ApprovalRow } from '../../services/approvalService';
import { AT_BOTTOM_PX, type AgentMode, type SlashCommand } from '../chatModel';
import ChatComposer from '../chat/ChatComposer';
import ImageViewer from '../chat/ImageViewer';
import { seedMedia, type MediaFetcher } from '../chat/ChatMedia';
import AgentLogo from '../AgentLogo';
import { agentDisplayName, attachToken, resolveAttachTokens, type AttachEntry } from '../chat/composer';
import { attachWordsAll, attachWordsNow } from '../chat/attachWords';
import ConversationListSheet from './ConversationListSheet';
import { ConvFooter, ConvRow, attachMediaKey, createFooterStore, fmtStamp, type RowHandlers } from './ConvRows';
import useConv, { type RespondOpts } from './useConv';
import {
  convModeChoices, convModeLabel, errorText, findMatches, modelChoices, modelShort, pickableAgents, reqToApproval, stepMatch, usageLine,
  type ConvAttachment, type ConvItem, type Thread,
} from './convModel';
import convService, { toConvError } from '../../services/convService';
import { registerConvAttach, type ChatAttachItem } from '../uiControls';
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
  onPatch: (patch: { threadId?: string | null; title?: string; chatDraft?: string; sid?: undefined; convAgent?: string }) => void;
  /** 탭에 적힌 에이전트(탭 아이콘용) — 대화의 에이전트와 다르면 맞춘다. */
  agent?: string;
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
    //  ★ threadId 는 **탭이 대화를 갖고 있지 않을 때만**(첫 메시지가 대화를 만든 순간) 쓴다. 탭이 이미 다른 대화를
    //   가리키면 그 탭의 값이 정본이다 — 이 화면의 상태가 늦게 도착한 것으로 탭을 덮으면 대화 A 의 탭이 B 로
    //   갈아치워진다(2026-09-30 실기 신고). 제목도 같은 대화일 때만 맞춘다.
    const cur = tabThreadRef.current;
    if (cur && cur !== t.id) return;
    const p: { threadId?: string; title?: string } = {};
    if (!cur) p.threadId = t.id;
    if (t.title && titleRef.current !== t.title) p.title = t.title;
    if (Object.keys(p).length) patchRef.current(p);
  }, []);

  const conv = useConv({ host, cwd, threadId, active, account, hostOnline, onThread });
  // 콜백은 conv 를 ref 로 읽는다 — conv 객체는 렌더마다 새것이라, 의존성에 넣으면 컴포저·행의 memo 가 매번 깨진다.
  const convRef = useRef(conv); convRef.current = conv;
  const blocked = supported === false;

  // 탭 제목 = 그 대화의 제목. 탭이 다른 대화로 바뀌었거나(목록·알림) 다른 기기가 제목을 바꿨는데 탭 라벨이
  //  옛 대화의 제목으로 남던 것(실기 신고)을 여기서 맞춘다 — 헤더와 탭이 같은 말을 해야 한다.
  const liveTitle = conv.thread?.title || '';
  useEffect(() => {
    if (!threadId || conv.threadId !== threadId || !liveTitle || liveTitle === title) return;
    patchRef.current({ title: liveTitle });
  }, [threadId, conv.threadId, liveTitle, title]);
  // 탭 아이콘 = 그 대화의 에이전트 로고 — 대화가 알려 준 에이전트를 탭에 적는다(같은 대화일 때만).
  const liveAgent = (conv.thread as { agent?: string } | null)?.agent || '';
  const tabAgent = props.agent || '';
  useEffect(() => {
    if (!threadId || conv.threadId !== threadId || !liveAgent || liveAgent === tabAgent) return;
    patchRef.current({ convAgent: liveAgent });
  }, [threadId, conv.threadId, liveAgent, tabAgent]);

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
  // 화면에서 집어 온 것(프리뷰 요소 선택·모바일 화면 캡처)을 이 대화의 컴포저에 넣는 창구 — 설명 글 + 칩.
  //  초안은 최신 값(draftRef)에 이어 붙인다(업로드가 오래 걸려 옛 초안에 덧붙이면 그 사이 친 글이 날아간다).
  const activeRef = useRef(active); activeRef.current = active;
  const attachKey = useRef('conv-' + Math.random().toString(36).slice(2)).current;
  const attachFromSurface = useCallback((a: ChatAttachItem) => {
    const [added] = addAttachEntries([{ path: a.path, name: a.name, image: a.image, base64: a.base64 }]);
    const head = draftRef.current ? draftRef.current.replace(/\s*$/, '') + ' ' : '';
    onDraftAppend(`${head}${a.text ? a.text + ' ' : ''}${added.token} `);
  }, [addAttachEntries, onDraftAppend]);
  useEffect(() => registerConvAttach(attachKey, { attach: attachFromSurface, isActive: () => activeRef.current }), [attachKey, attachFromSurface]);
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
  // 질문을 물어 답을 기다리는 동안엔 입력창을 숨긴다(2026-10 QA) — 답은 질문 카드(선택지·'기타' 직접 입력)로 받는다.
  //  카드를 접으면(foldedReq) 입력창이 돌아온다.
  const asking = dockOpen && !!req && req.kind === 'question';

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
  // 파일 바이트는 conv.file(§4.5) — 그 대화에 등장한 경로만 데몬이 내준다. 대화가 바뀌면 새 함수(캐시 key 도 대화별).
  const fetcher = useMemo<MediaFetcher | undefined>(() => {
    const tid = conv.threadId;
    return tid ? (path: string) => convService.file(host, tid, path) : undefined;
  }, [host, conv.threadId]);
  const onPreviewMedia = useCallback((a: { uri: string; mediaType: string; name: string }) => setPreview({ uri: a.uri, mediaType: a.mediaType, name: a.name }), []);
  const media = useMemo(() => ({ host, threadId: conv.threadId, chatId: conv.threadId, fetcher, onPreview: onPreviewMedia }), [host, conv.threadId, fetcher, onPreviewMedia]);
  const handlers = useMemo<RowHandlers>(() => ({
    onOpenFile, onRetry: conv.retry, onDiscard: conv.discard, onMenu, onRetryFailed: conv.retryFailed, onHideFailed: conv.hideFailed,
    media, onDetail: conv.loadDetail,
  }), [onOpenFile, conv.retry, conv.discard, onMenu, conv.retryFailed, conv.hideFailed, media, conv.loadDetail]);

  // ── 대화 안 검색(§4.5) — 불러온 행에서만. 더 앞은 "이전 내역 더 불러오기"로 넓힌다. ──
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [hitIdx, setHitIdx] = useState(-1);
  const q = searchOpen ? query.trim() : '';
  const hits = useMemo(() => (q ? findMatches(conv.items, q) : []), [conv.items, q]);
  const hitTotal = useMemo(() => hits.reduce((n, h) => n + h.count, 0), [hits]);
  const hitMap = useMemo(() => {
    const m = new Map<string, 1 | 2>();
    hits.forEach((h, i) => m.set(h.key, i === hitIdx ? 2 : 1));
    return m;
  }, [hits, hitIdx]);
  const scrollToHit = useCallback((i: number) => {
    const h = hits[i];
    if (!h) return;
    // 일치로 옮겨 가면 따라가기를 멈춘다 — 새 글이 와도 보던 자리가 바닥으로 끌려가지 않게.
    atBottomRef.current = false;
    setShowJump(true);
    try { listRef.current?.scrollToIndex({ index: h.index, viewPosition: 0.3, animated: true }); } catch (_) { /* 아래 실패 처리 */ }
  }, [hits]);
  const moveHit = useCallback((dir: 1 | -1) => {
    // 아래(-1 = 위로·옛 쪽) — 처음 누르면 가장 최근 일치부터 본다(대화는 아래가 최신이다).
    const next = hitIdx < 0 ? (hits.length ? hits.length - 1 : -1) : stepMatch(hits.length, hitIdx, dir);
    if (next < 0) return;
    haptic.select();
    setHitIdx(next);
    scrollToHit(next);
  }, [hitIdx, hits.length, scrollToHit]);
  // 검색어가 바뀌면 가장 최근 일치로(아래 "보던 일치 따라가기"가 옛 검색어의 자리를 되살리지 않게 먼저 비운다).
  const hitKeyRef = useRef<string | null>(null);
  useEffect(() => {
    hitKeyRef.current = null;
    if (!q) { setHitIdx(-1); return; }
    const i = hits.length ? hits.length - 1 : -1;
    setHitIdx(i);
    if (i >= 0) scrollToHit(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  // 이전 내역을 불러와 일치가 앞에 늘어도 보던 일치를 그대로 가리킨다(인덱스가 아니라 key 로 따라간다).
  useEffect(() => {
    const key = hitKeyRef.current;
    if (!key) return;
    const i = hits.findIndex((h) => h.key === key);
    if (i >= 0 && i !== hitIdx) setHitIdx(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hits]);
  hitKeyRef.current = hits[hitIdx]?.key || null;
  const closeSearch = useCallback(() => { setSearchOpen(false); setQuery(''); setHitIdx(-1); }, []);
  useEffect(() => { closeSearch(); }, [conv.threadId, closeSearch]);
  const onScrollFail = useCallback((info: { index: number; averageItemLength: number }) => {
    // 아직 그려지지 않은 칸 — 대략 자리로 먼저 가서 그리게 한 뒤 다시 간다.
    listRef.current?.scrollToOffset({ offset: Math.max(0, info.averageItemLength * info.index - 80), animated: false });
    setTimeout(() => { try { listRef.current?.scrollToIndex({ index: info.index, viewPosition: 0.3, animated: true }); } catch (_) { /* noop */ } }, 120);
  }, []);

  const renderItem = useCallback(({ item }: { item: ConvItem }) => {
    const hit = hitMap.get(item.key) || 0;
    return <ConvRow item={item} animate={settledRef.current && !knownRef.current.has(item.key)} offline={offline} h={handlers} hit={hit} q={hit ? q : ''} />;
  }, [handlers, offline, hitMap, q]);
  const keyOf = useCallback((it: ConvItem) => it.key, []);

  // ── 보내기 ──
  const sendMsg = useCallback(async (text: string) => {
    const t = text.trim();
    if (!t) return;
    // 첨부는 본문에 경로를 끼우지 않고 attachments 로 보낸다(§4.1) — 데몬이 본문 끝에 `[첨부] <경로>` 줄을 붙이고,
    //  그 줄에 적힌 경로만 conv.file 로 썸네일을 받을 수 있다(§4.5). 입력칸의 토큰([사진 1])은 본문에서 걷는다.
    const used = attachReg.filter((a) => text.includes(a.token));
    const body = resolveAttachTokens(text, [], attachWordsAll()).replace(/[ \t]+\n/g, '\n').trim();
    if (!body && !used.length) return;
    const files: ConvAttachment[] = used.map((a) => ({ path: a.path, name: a.name, image: a.image, ...(a.image ? { mediaType: imageMime(a.name) } : {}) }));
    // 방금 첨부한 사진은 이미 바이트가 있다 — 썸네일 캐시를 미리 채워 보내자마자 다시 받지 않게.
    for (const a of used) if (a.image && a.base64) seedMedia(attachMediaKey(host, a.path), { uri: `data:${imageMime(a.name)};base64,${a.base64}`, mediaType: imageMime(a.name) });
    setAttachReg((r) => r.filter((a) => !text.includes(a.token)));
    convRef.current.send(body, body, files);
    // 보낸 직후에는 항상 바닥으로(§10.4) — 위를 보고 있었어도 내 말이 보여야 한다.
    atBottomRef.current = true;
    setShowJump(false);
    toBottom(false);
  }, [attachReg, toBottom, host]);

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
  // 데몬 능력(conv.caps) — 에이전트·모드·모델 목록. PC 마다 한 번 받아 두고 탭들이 같이 쓴다.
  const convCaps = useSyncExternalStore(convService.subscribeConvCaps, () => convService.peekConvCaps(host));
  useEffect(() => { if (hostOnline && !blocked) void convService.loadConvCaps(host); }, [host, hostOnline, blocked]);
  // 목록 = 데몬이 받는 모드 ∩ 우리가 아는 모드(위험 모드는 지금 그 모드일 때만 — convModeChoices 규칙 그대로).
  const modeChoices = useMemo(() => convModeChoices(modeId, convCaps?.modes || null), [modeId, convCaps]);

  // ── 모델(§4.5) — 데몬이 목록을 줄 때만 고를 수 있다. 없으면 입구를 감춘다. ──
  const models = useMemo(() => modelChoices(convCaps, conv.thread?.agent || conv.agent), [convCaps, conv.thread?.agent, conv.agent]);
  const [modelSheet, setModelSheet] = useState(false);
  const [modelBusy, setModelBusy] = useState(false);
  const pickModel = useCallback((id: string) => {
    setModelSheet(false);
    if (modelBusy) return;
    setModelBusy(true);
    convRef.current.setModel(id).catch((e) => flashErr(toConvError(e).code)).finally(() => setModelBusy(false));
  }, [modelBusy, flashErr]);

  // ── 에이전트(§4.5) — 쓸 수 있는 것이 2개 이상일 때만, 새 대화에서만 고른다. ──
  const agents = useMemo(() => pickableAgents(convCaps), [convCaps]);
  const pickedAgent = conv.agent || (agents[0] ? agents[0].id : null);

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

  // ── 더 보기(⋯) — 머리줄을 없앴다(2026-10 QA). 목록·새 대화·검색·터미널 이어가기는 컴포저 도구줄의 ⋯ 시트로 갔다. ──
  const [listOpen, setListOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

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

  // 사용량 줄(§4.5) — "모델 · 컨텍스트 n%". 필드는 null 일 수 있다(모르는 것은 빼고, 둘 다 모르면 줄이 없다).
  const usage = useMemo(() => usageLine(conv.thread), [conv.thread]);

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
        <Text style={{ color: C.textDim, fontSize: v2.font.size.caption }}>{i18n.t('이전 대화 더 보기')}</Text>
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
      onScrollToIndexFailed={onScrollFail}
      ListHeaderComponent={headerEl}
      ListFooterComponent={footerEl}
      initialNumToRender={14}
      windowSize={9}
      removeClippedSubviews={false}
    />
  ), [conv.items, keyOf, renderItem, onScroll, onBeginDrag, onEndDrag, onMomentumEnd, stick, headerEl, footerEl, onScrollFail]);

  return (
    <View style={{ flex: 1, backgroundColor: C.base }}>
      {/* ⋯ — 입력창이 아니라 채팅 pane 우측 상단에 떠 있다(2026-10-02 사용자 확정). 머리줄을 없앤 자리다. */}
      <View pointerEvents="box-none" style={{ position: 'absolute', top: 6, right: 8, zIndex: 20, elevation: 4 }}>
        <PressableScale
          onPress={() => { haptic.keyPress(); setMoreOpen(true); }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={i18n.t('더 보기')}
          style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: C.base }}
        >
          {handing ? <ActivityIndicator size="small" color={C.text2} /> : <DotsThree size={20} color={C.text3} weight="bold" />}
        </PressableScale>
      </View>

      {/* ── 검색 줄 ── */}
      {searchOpen ? (
        <Animated.View entering={FadeIn.duration(140)} exiting={FadeOut.duration(120)}
          style={{ borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.surface }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, height: 44, paddingLeft: 12, paddingRight: 48 }}>
            <MagnifyingGlass size={16} color={C.text3} />
            <KeyTextInput
              value={query}
              onChangeText={setQuery}
              autoFocus
              noBar
              returnKeyType="search"
              onSubmitEditing={() => moveHit(-1)}
              blurOnSubmit={false}
              accessibilityLabel={i18n.t('대화에서 찾기')}
              placeholder={i18n.t('대화에서 찾기')}
              placeholderTextColor={C.textDim}
              style={{ flex: 1, color: C.text, fontSize: v2.font.size.body, paddingVertical: 0, paddingHorizontal: 8 }}
            />
            {q ? (
              <Text style={{ color: C.textDim, fontSize: v2.font.size.caption, marginRight: 4 }} accessibilityLiveRegion="polite">
                {hits.length ? `${hitIdx + 1}/${hits.length}` : i18n.t('결과 없음')}
              </Text>
            ) : null}
            <HeadBtn label={i18n.t('이전 일치')} onPress={() => moveHit(-1)} disabled={!hits.length}><CaretUp size={16} color={C.text2} /></HeadBtn>
            <HeadBtn label={i18n.t('다음 일치')} onPress={() => moveHit(1)} disabled={!hits.length}><CaretDown size={16} color={C.text2} /></HeadBtn>
            <HeadBtn label={i18n.t('검색 닫기')} onPress={closeSearch}><X size={16} color={C.text2} /></HeadBtn>
          </View>
          {q && (conv.olderAvailable || conv.loadingOlder) ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingBottom: 8 }}>
              <Text style={{ flex: 1, color: C.textDim, fontSize: v2.font.size.caption }} numberOfLines={1}>
                {hitTotal ? i18n.t('불러온 내역에서 {n}개 찾았어요', { n: hitTotal }) : i18n.t('불러온 내역에는 없어요')}
              </Text>
              <PressableScale onPress={() => { void conv.loadOlder(); }} disabled={conv.loadingOlder} hitSlop={6} accessibilityRole="button" accessibilityLabel={i18n.t('이전 내역 더 불러오기')}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 5, height: 32, paddingHorizontal: 12, borderRadius: v2.radius.md, borderWidth: 1, borderColor: C.borderControl, backgroundColor: C.hover }}>
                {conv.loadingOlder ? <ActivityIndicator size="small" color={C.text2} /> : null}
                <Text style={{ color: C.text, fontSize: v2.font.size.small, fontWeight: '500' }}>{i18n.t('이전 내역 더 불러오기')}</Text>
              </PressableScale>
            </View>
          ) : null}
        </Animated.View>
      ) : null}

      {/* ── 연결 상태 줄 — 무채색. 끊긴 동안 화면이 왜 멈췄는지 말한다. ── */}
      {conv.conn !== 'ok' ? (
        <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(160)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: C.elevated, borderBottomWidth: 1, borderBottomColor: C.border }}>
          {conv.conn === 'offline' ? <WifiSlash size={13} color={C.text3} /> : <ArrowsClockwise size={13} color={C.text3} />}
          <Text style={{ flex: 1, color: C.text2, fontSize: v2.font.size.small }}>
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
            <Text style={{ color: C.text2, fontSize: v2.font.size.small, textAlign: 'center', lineHeight: 20 }}>{errorText(conv.error)}</Text>
            <PressableScale onPress={() => { void conv.refresh(); }} hitSlop={8} accessibilityRole="button" accessibilityLabel={i18n.t('다시 시도')}
              style={{ paddingHorizontal: 12, height: 36, borderRadius: v2.radius.md, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.borderControl, backgroundColor: C.hover }}>
              <Text style={{ color: C.text, fontSize: v2.font.size.body, fontWeight: '500' }}>{i18n.t('다시 시도')}</Text>
            </PressableScale>
          </View>
        ) : empty && !conv.working ? (
          // 새 대화 — 오류가 아니다. 가운데 글리프 + 짧은 인사, 주인공은 아래 입력칸이다.
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 }}>
            <AgentLogo brand={conv.thread?.agent || pickedAgent || 'claude'} color={C.text3} size={34} />
            <Text style={{ color: C.text2, fontSize: v2.font.size.body, fontWeight: '500' }}>{i18n.t('무엇이든 요청하세요')}</Text>
            <Text style={{ color: C.textDim, fontSize: v2.font.size.small, textAlign: 'center', lineHeight: 18 }}>
              {i18n.t('PC에 설치된 에이전트가 이 워크스페이스에서 작업해요.')}
            </Text>
            {!conv.threadId && agents.length >= 2 ? (
              // 세그먼트 문법(Seg 와 같은 규칙): 트랙 elevated2 · 선택 = selected 워시 + text · 나머지 text2 · 반경 sm.
              <View accessibilityRole="radiogroup" accessibilityLabel={i18n.t('에이전트 선택')} style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 2, marginTop: 8, padding: 2, borderRadius: v2.radius.sm, backgroundColor: C.elevated2 }}>
                {agents.map((a) => {
                  const on = a.id === pickedAgent;
                  return (
                    <PressableScale key={a.id} onPress={() => { haptic.select(); conv.setAgent(a.id); }} hitSlop={4}
                      accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={a.label}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 7, height: 32, paddingHorizontal: 12, borderRadius: v2.radius.sm - 1, backgroundColor: on ? C.selected : 'transparent' }}>
                      <AgentLogo brand={a.id} color={on ? C.text : C.text2} size={15} />
                      <Text style={{ color: on ? C.text : C.text2, fontSize: v2.font.size.small, fontWeight: on ? '500' : '400' }}>{a.label}</Text>
                    </PressableScale>
                  );
                })}
              </View>
            ) : null}
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
                  style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: C.elevated, borderWidth: 1, borderColor: C.borderControl }}
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
            <Text style={{ color: C.textDim, fontSize: v2.font.size.caption, paddingHorizontal: 14, paddingTop: 4 }}>
              {i18n.t('{n}개 더 기다리는 중', { n: conv.reqs.length - 1 })}
            </Text>
          ) : null}
          {dockErr ? <Text style={{ color: C.error, fontSize: v2.font.size.caption, paddingHorizontal: 14, paddingTop: 4 }}>{errorText(dockErr)}</Text> : null}
        </Animated.View>
      ) : req && foldedReq === req.id ? (
        // 접어 둔 요청 — 요청은 살아 있다(마감이 없다). 다시 펼 길을 남긴다.
        <PressableScale onPress={() => setFoldedReq(null)} hitSlop={6} accessibilityRole="button" accessibilityLabel={i18n.t('기다리는 요청 보기')}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 10, marginTop: 8, paddingHorizontal: 12, height: 40, borderRadius: v2.radius.lg, borderWidth: 1, borderColor: C.border, backgroundColor: C.elevated }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.warn }} />
          <Text style={{ flex: 1, color: C.text2, fontSize: v2.font.size.small }}>{i18n.t('답을 기다리는 요청 {n}개', { n: conv.reqs.length })}</Text>
        </PressableScale>
      ) : null}

      {actErr ? <Text style={{ color: C.error, fontSize: v2.font.size.caption, paddingHorizontal: 14, paddingTop: 2 }}>{errorText(actErr)}</Text> : null}

      {asking ? null : (
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
        mode={mode}
        modeChoices={modeChoices}
        modeBusy={modeBusy}
        onPickMode={pickMode}
        commands={cmds}
        commandsLoading={cmdsLoading}
        onNeedCommands={loadCmds}
        disabled={blocked || !!gone || busyInTerminal}
        ctlRight={usage && (usage.model || usage.pct != null) ? (
          // 모델 · 컨텍스트 — 누르면 모델 시트(PC 도구줄의 모델 버튼 + 사용량 링을 한 알약으로).
          <PressableScale
            onPress={() => { if (models.length) { haptic.keyPress(); setModelSheet(true); } }}
            disabled={!models.length}
            hitSlop={8}
            scaleTo={0.97}
            accessibilityRole={models.length ? 'button' : 'text'}
            accessibilityLabel={[usage.model ? modelShort(usage.model) : '', usage.pct != null ? i18n.t('컨텍스트 {n}%', { n: usage.pct }) : ''].filter(Boolean).join(' · ')}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 5, height: 28, paddingHorizontal: 8, maxWidth: 170, flexShrink: 1 }}
          >
            {usage.model ? <Text numberOfLines={1} style={{ flexShrink: 1, color: C.text2, fontSize: v2.font.size.caption, fontWeight: '500' }}>{modelShort(usage.model)}</Text> : null}
            {usage.pct != null ? <Text style={{ color: C.textDim, fontSize: v2.font.size.caption }}>{Math.round(usage.pct)}%</Text> : null}
            {modelBusy ? <ActivityIndicator size="small" color={C.textDim} style={{ transform: [{ scale: 0.7 }] }} /> : null}
          </PressableScale>
        ) : null}
      />
      )}

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

      {/* 더 보기 — 머리줄에 있던 기능이 전부 여기로 왔다. */}
      <Sheet visible={moreOpen} onClose={() => setMoreOpen(false)} paddingHorizontal={8}>
        <SheetRow icon={<NotePencil size={20} color={C.text2} />} label={i18n.t('새 대화')} disabled={!conv.threadId}
          onPress={() => { setMoreOpen(false); newChat(); }} />
        <SheetRow icon={<ListBullets size={20} color={C.text2} />} label={i18n.t('대화 목록')}
          onPress={() => { setMoreOpen(false); setTimeout(() => setListOpen(true), 250); }} />
        {conv.threadId ? (
          <SheetRow icon={<MagnifyingGlass size={20} color={C.text2} />} label={i18n.t('대화에서 찾기')}
            onPress={() => { setMoreOpen(false); setTimeout(() => setSearchOpen(true), 250); }} />
        ) : null}
        {models.length ? (
          <SheetRow icon={<Cpu size={20} color={C.text2} />} label={i18n.t('모델 바꾸기')}
            sub={conv.model ? modelShort(conv.model) : undefined}
            onPress={() => { setMoreOpen(false); setTimeout(() => setModelSheet(true), 250); }} />
        ) : null}
        {onOpenTerminal && conv.threadId ? (
          <SheetRow icon={<TerminalWindow size={20} color={C.text2} />} label={i18n.t('터미널에서 이어가기')}
            sub={conv.working ? i18n.t('작업이 끝난 뒤에 할 수 있어요.') : i18n.t('이 대화를 새 터미널에서 계속해요.')}
            disabled={conv.working} onPress={() => { void handoff(); }} />
        ) : null}
      </Sheet>

      {/* 모델 — 데몬이 알려 준 목록에서만(conv.set {model}). 없으면 이 시트는 열릴 길이 없다. */}
      <Sheet visible={modelSheet} onClose={() => setModelSheet(false)} title={i18n.t('모델')} maxHeightPct={0.7} paddingHorizontal={8}>
        <ScrollView>
          {models.map((m) => {
            // 별칭(opus)과 실제 id(claude-opus-4-1-…)가 섞여 온다 — 낱말 경계로 같은 모델인지 본다.
            const cur = String(conv.model || '');
            const on = !!cur && (cur === m.id || modelShort(cur) === modelShort(m.id) || cur.split(/[-_/\s]/).includes(m.id));
            return (
              <SheetRow key={m.id} label={m.label} selected={on} onPress={() => pickModel(m.id)}
                trailing={on ? <Check size={16} color={C.text} weight="bold" /> : null} />
            );
          })}
        </ScrollView>
      </Sheet>

      {/* 메시지 길게 누르기 — 올라온 면(elevated) r-xl 카드, 150ms 등장(설계 §0.8 컨텍스트 메뉴). */}
      <Modal visible={!!menu} transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={() => setMenu(null)}
        supportedOrientations={MODAL_ORIENTATIONS}>
        <Animated.View entering={FadeIn.duration(150)} style={{ flex: 1, backgroundColor: C.scrim }}>
          <Pressable style={{ flex: 1 }} onPress={() => setMenu(null)} accessibilityLabel={i18n.t('닫기')} />
        </Animated.View>
        <Animated.View entering={FadeInDown.duration(150)}
          style={{ position: 'absolute', left: 10, right: 10, bottom: Math.max(insets.bottom, 10) + 6, backgroundColor: C.elevated, borderRadius: v2.radius.xl, borderWidth: 1, borderColor: C.border, overflow: 'hidden', padding: 6 }}>
          {menu && menu.ts ? (
            <Text style={{ color: C.textDim, fontSize: v2.font.size.caption, paddingHorizontal: 10, paddingTop: 6, paddingBottom: 4 }}>{fmtStamp(menu.ts)}</Text>
          ) : null}
          <SheetRow icon={<Copy size={20} color={C.text2} />} label={copied ? i18n.t('복사됨') : i18n.t('복사')}
            onPress={() => { if (menu) { try { Clipboard.setString(menu.text); setCopied(true); } catch (_) { /* noop */ } setTimeout(() => setMenu(null), 350); } }} />
          <SheetRow icon={<TextAa size={20} color={C.text2} />} label={i18n.t('텍스트 선택')}
            onPress={() => { const t = menu ? menu.text : ''; setMenu(null); setTimeout(() => setSelectText(t), 250); }} />
          <SheetRow icon={<ShareNetwork size={20} color={C.text2} />} label={i18n.t('공유')}
            onPress={() => { const t = menu ? menu.text : ''; setMenu(null); setTimeout(() => { Share.share({ message: t }).catch(() => { /* 취소 */ }); }, 250); }} />
        </Animated.View>
      </Modal>

      {/* 텍스트 선택 — 마크다운으로 그린 글은 범위 선택이 안 된다 → 원문을 선택 가능한 글로 펼친다. */}
      <Modal visible={selectText != null} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={() => setSelectText(null)}
        supportedOrientations={MODAL_ORIENTATIONS}>
        <View style={{ flex: 1, backgroundColor: C.base, paddingTop: Math.max(insets.top, 12), paddingBottom: Math.max(insets.bottom, 12) }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, height: 44 }}>
            <Text style={{ flex: 1, color: C.text, fontSize: v2.font.size.h2, fontWeight: '600' }}>{i18n.t('텍스트 선택')}</Text>
            <HeadBtn label={i18n.t('닫기')} onPress={() => setSelectText(null)}><X size={20} color={C.text2} /></HeadBtn>
          </View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}>
            <Text selectable style={{ color: C.text, fontSize: v2.font.size.body, lineHeight: 22 }}>{selectText || ''}</Text>
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

// 머리줄 아이콘 버튼 — IconButton 과 같은 지표(시각 36 · 히트 44 · r-md · 아이콘 20 text2 · 비활성 .34).
//  ★ PressableScale 을 유지한다: 대화 테스트(convBody/convFeatures)가 '더 보기'·'대화에서 찾기'·'이전 일치' 등을
//   PressableScale 타입 + accessibilityLabel 로 집는다.
function HeadBtn({ children, label, onPress, disabled }: { children: React.ReactNode; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <PressableScale onPress={onPress} disabled={disabled} baseOpacity={disabled ? 0.34 : 1} hitSlop={4} accessibilityRole="button" accessibilityLabel={label}
      style={{ width: 36, height: 36, borderRadius: v2.radius.md, alignItems: 'center', justifyContent: 'center' }}>
      {children}
    </PressableScale>
  );
}

function Notice({ text }: { text: string }) {
  const C = v2.colors;
  return (
    <View style={{ paddingHorizontal: 12, paddingVertical: 8, backgroundColor: C.elevated, borderBottomWidth: 1, borderBottomColor: C.border }}>
      <Text style={{ color: C.text2, fontSize: v2.font.size.small, lineHeight: 18 }}>{text}</Text>
    </View>
  );
}

function SheetRow({ icon, label, sub, onPress, disabled, selected, trailing }: {
  icon?: React.ReactNode; label: string; sub?: string; onPress: () => void; disabled?: boolean; selected?: boolean; trailing?: React.ReactNode;
}) {
  const C = v2.colors;
  return (
    <PressableRow
      onPress={() => { if (disabled) return; haptic.keyPress(); onPress(); }}
      disabled={disabled}
      selected={selected}
      accessibilityLabel={label}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 10, paddingVertical: 8 }}
    >
      {icon}
      <View style={{ flex: 1 }}>
        <Text style={{ color: C.text, fontSize: v2.font.size.body, fontWeight: selected ? '500' : '400' }}>{label}</Text>
        {sub ? <Text style={{ color: C.textDim, fontSize: v2.font.size.small, marginTop: 1 }}>{sub}</Text> : null}
      </View>
      {trailing}
    </PressableRow>
  );
}

/** 첨부 이미지의 MIME — 확장자로(썸네일 data: URI·conv 의 attachments.mediaType). */
function imageMime(name: string): string {
  const ext = String(name || '').split('.').pop()!.toLowerCase();
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'heic' || ext === 'heif') return 'image/heic';
  return 'image/png';
}
