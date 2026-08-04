import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { View, Text, FlatList, ScrollView, ActivityIndicator, Platform, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { ArrowDown, ChatCircleDots, TerminalWindow } from 'phosphor-react-native';

import { v2 } from '../../theme/v2Tokens';
import PressableScale from '../../components/ui/PressableScale';
import chatService from '../../services/chatService';
import ImageViewer from './ImageViewer';
import { AT_BOTTOM_PX, agentModeLabel, agentModeOf, buildRows, type SlashCommand, hiddenByQuestionCard, looksBusy, pendingTuiQuestion, type AgentMode, type ChatRowModel, type PendingUser } from '../chatModel';
import ChatRow, { PendingRow } from './ChatRow';
import ChatComposer from './ChatComposer';
import TuiDialogCard from './TuiDialogCard';
import AgentStatusStrip from './AgentStatusStrip';
import useChatStream from './useChatStream';
import { agentDisplayName, resolveAttachTokens, type AttachEntry } from './composer';
import AgentLogo from '../AgentLogo';
import QuestionDock from '../../components/approval/QuestionDock';
import { usePaneApprovals } from '../../components/approval/paneApproval';
import type { ApprovalRow } from '../../services/approvalService';
import { useWorkspaceShell } from '../../contexts/WorkspaceShellContext';
import { subscribeAgentState, agentSnapOf } from '../../services/agentStateStore';
import { parseAnsiLine } from './ansi';
import { termPalette } from '../../theme/terminalSchemes';
import { useTermScheme } from '../../utils/termSchemeSetting';
import { useTheme } from '../../contexts/ThemeContext';
import * as i18n from '../../i18n/index.ts';

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
  cwd, host, tid, agent, wsName, initialDraft, onDraftPersist, onOpenFile, onExitChat, agentAlive, active,
}: {
  cwd: string;
  host: number | null;
  /** 이 탭의 터미널 tid(안정 31-bit). null 이면 아직 win 미확보 → 구독하지 않는다. */
  tid: number | null;
  /** 이 터미널에서 도는 CLI('claude'|'codex'…) — 데몬이 읽을 대화 로그를 정한다. */
  agent?: string | null;
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
  /** 지금 화면에 보이는가 — false 면 구독을 끊어 폴링 트래픽을 0 으로(마운트는 유지). */
  active: boolean;
}) {
  const C = v2.colors;
  const S = useWorkspaceShell();
  const stream = useChatStream({ cwd, tid, host, active, agent });
  // 알림을 눌러 채팅 모드로 들어온 것도 해당 터미널을 실제로 확인한 것이다. TUI 터치에만 읽음을
  // 묶으면 채팅 내용을 보고도 배지·알림이 계속 남는다.
  useEffect(() => {
    if (active && typeof tid === 'number') S.markScopeRead(cwd, tid);
  }, [active, cwd, tid, S]);
  // 이 터미널의 대기 질문/승인 — 컴포저 바로 위 도크에 붙는다(다른 터미널 것은 절대 안 온다).
  const pending = usePaneApprovals(cwd, tid);
  const [dockClosed, setDockClosed] = useState<string | null>(null);
  const ask = pending[0];
  const dockOpen = !!ask && dockClosed !== ask.id;
  const listRef = useRef<FlatList<RowItem>>(null);
  const atBottomRef = useRef(true);
  const [showJump, setShowJump] = useState(false);
  const [sending, setSending] = useState(false);
  // 에이전트 권한 모드 전환 상태 — 요청 중(중복 탭 차단)과 실패 문구(조용한 실패 금지).
  const [modeBusy, setModeBusy] = useState(false);
  const [modeErr, setModeErr] = useState('');

  // 초안 — 로컬 state(즉시 반영) + 600ms 디바운스 영속(+언마운트 시 flush).
  const [draft, setDraft] = useState(initialDraft || '');
  // 첨부 칩 레지스트리(2026-07-30 사용자 확정: 모바일도 칩 컴포저) — 입력칸 토큰([사진 N])과 짝.
  //  초안은 문자열로 영속되지만 레지스트리는 세션 로컬 — 복원된 고아 토큰은 전송 시 걷는다(resolveAttachTokens).
  const [attachReg, setAttachReg] = useState<AttachEntry[]>([]);
  const attachSeq = useRef(0);
  // 원격 첨부(트랜스크립트) base64 캐시 — 칩 썸네일 자동 로드(사용자 확정)와 미리보기 공용.
  const attCache = useRef(new Map<string, Promise<{ mediaType?: string; base64?: string; missing?: boolean }>>());
  const [preview, setPreview] = useState<{ mediaType?: string; base64?: string; uri?: string; name: string } | null>(null);
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

  // ★ **아직 답하지 않은** 질문은 대화 내역에 넣지 않는다(사용자 확정 2026-07-28). 도크가 같은
  //  선택지를 그리고 있어서, 넣으면 같은 질문이 화면에 두 번 보인다.
  //  판정 근거는 **트랜스크립트 하나**다: 짝 tool_result 가 없으면 미응답(= TUI 가 질문을 계속
  //  띄우고 있는 것과 같은 근거). 예전엔 승인 요청의 toolUseId 와 대조했는데, claude 의
  //  PermissionRequest 페이로드에 tool_use_id 가 없으면 대조가 통째로 빗나가 질문이 대화와 도크에
  //  **둘 다** 그려졌다.
  //  단 이 터미널에 실제로 질문 카드가 떠 있을 때만 감춘다 — 카드가 없는데 감추면
  //  "TUI 엔 질문이 있는데 채팅엔 아무것도 없다"가 된다(그게 더 나쁘다).
  const hasQuestionCard = useMemo(
    () => pending.some((a) => !a.expired && (a.prompt?.kind === 'choice' || !!a.prompt?.questions?.length)),
    [pending],
  );
  const rowsAll = useMemo(() => buildRows(stream.messages), [stream.messages]);
  // ── TUI 폴백 질문(승인 카드가 회수된 미응답 질문) — 트랜스크립트 기준으로 카드를 다시 세운다. ──
  //  TUI 가 질문을 띄우고 있는 한 채팅에서도 같은 카드로 계속 답할 수 있어야 한다(사용자 확정
  //  2026-07-28). 답은 chat.answer(데몬이 다이얼로그를 키 조작)로 간다. 승인 카드가 있으면 그쪽이 정본.
  const [tuiClosed, setTuiClosed] = useState<string | null>(null);
  const tuiRow = useMemo(
    () => (pending.some((a) => !a.expired) ? null : pendingTuiQuestion(rowsAll)),
    [pending, rowsAll],
  );
  const tuiKey = tuiRow ? 'tui:' + (tuiRow.msg.tool?.id || tuiRow.msg.seq) : null;
  const tuiOpen = !!tuiRow && tuiClosed !== tuiKey;
  const tuiApproval = useMemo<ApprovalRow | null>(() => {
    if (!tuiRow || !tuiKey) return null;
    const qs = tuiRow.msg.questions!;
    return {
      id: tuiKey, agent: stream.agent || agent || 'claude', tool: 'AskUserQuestion',
      summary: qs[0].question || qs[0].header,
      prompt: { kind: 'choice', questions: qs },
      cwd, win: tid, requestedAt: 0, deadlineAt: 0,
    } as ApprovalRow;
  }, [tuiRow, tuiKey, cwd, tid, stream.agent, agent]);
  const submitTui = useCallback(async (answers: Array<{ questionIndex: number; labels: string[]; text?: string | null }>) => {
    if (!tuiRow || tid == null) return;
    const qs = tuiRow.msg.questions!;
    const wire = qs.map((qq, i) => {
      const a = answers.find((x) => x.questionIndex === i)!;
      const optionCount = qq.options.length;
      if (a.text) return { optionIndexes: [], text: a.text, multiSelect: !!qq.multiSelect, optionCount };
      return {
        optionIndexes: a.labels.map((l) => qq.options.findIndex((o) => o.label === l) + 1).filter((n) => n >= 1),
        multiSelect: !!qq.multiSelect, optionCount,
      };
    });
    await chatService.chatAnswer({ cwd, tid, expect: qs[0].question || qs[0].header, answers: wire, host });
    stream.poke();   // 답이 트랜스크립트에 붙으면(tool_result) 카드가 저절로 내려간다
  }, [tuiRow, cwd, tid, host, stream]);
  const msgRows = useMemo(
    () => rowsAll.filter((r) => !hiddenByQuestionCard(r, hasQuestionCard || tuiOpen)),
    [rowsAll, hasQuestionCard, tuiOpen],
  );
  const rows = useMemo<RowItem[]>(() => {
    const base: RowItem[] = msgRows.map((r) => ({ t: 'msg', key: 'm' + r.key, row: r }));
    for (const p of stream.pending) base.push({ t: 'pending', key: 'p' + p.id, item: p });
    return base;
  }, [msgRows, stream.pending]);
  // ★ 작업 중 판정 — 데몬 push(agent_state)가 있으면 그게 정본이다. 트랜스크립트 모양만 보는 추정은
  //  codex 처럼 중간 설명(commentary)을 계속 뱉는 에이전트에서 '마지막이 assistant 텍스트 = 안 바쁨'
  //  으로 잘못 접힌다. push 가 없을 때만(구 데몬·재접속 직후) 추정으로 내려간다.
  const pushState = useSyncExternalStore(
    subscribeAgentState,
    () => agentSnapOf(host, cwd, tid)?.state ?? null,
  );
  // 작업 중 추정(중단 버튼 노출용) — 낙관적 버블이 남아 있으면 아직 응답 전이므로 작업 중으로 본다.
  const busyGuess = useMemo(
    () => {
      if (stream.pending.some((p) => p.state === 'sending')) return true;
      // ★ needsInput 은 busy 가 아니다(2026-07-30 실사고): 60초 유휴 훅(idle_prompt)이 세우는
      //  "**사용자** 입력 대기" 상태다 — TUI 는 유휴 컴포저인데 채팅만 '작업 중…'이 영영 남았다.
      if (pushState) return pushState === 'working';
      return looksBusy(msgRows);
    },
    [msgRows, stream.pending, pushState],
  );

  // 따라가기 — 표준 LLM 앱 규칙(2026-07-30 사용자 확정): 맨 아래에 있으면 **어떤** 내용 변화든
  //  (새 행 추가뿐 아니라 기존 행이 자라는 스트리밍/결과 채움 포함) 자동으로 따라 내려가고,
  //  사용자가 위로 스크롤해 두면 멈춘다(맨 아래로 돌아오면 재개 — onScroll 이 atBottomRef 갱신).
  const lenRef = useRef(0);
  useEffect(() => {
    const grew = rows.length > lenRef.current;
    lenRef.current = rows.length;
    if (atBottomRef.current) {
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: false }));
      if (grew) setShowJump(false);
    } else if (grew) {
      setShowJump(true);
    }
  }, [rows]);

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

  // 질문이 떠 있을 때 컴포저에 친 글은 **그 질문의 답**이다(도크의 '아래에 직접 답장').
  //  화면에 입력창을 두 개 두지 않기 위한 라우팅 — 스크린샷의 '또는 직접 답장…' 과 같은 동작.
  //  권한 요청(허용/거절)에는 자유 입력이 답이 될 수 없으므로 라우팅하지 않는다(그냥 대화로 보낸다).
  //  ⚠ 질문이 **여러 개**면 라우팅하지 않는다 — 컴포저에 친 글이 몇 번째 질문의 답인지 화면이
  //   말해주지 않아서, 첫 질문의 답으로 조용히 들어가면 오응답이 된다. 그땐 카드의 '기타' 를 쓴다.
  const answerable = dockOpen && !!ask && ask.prompt?.kind === 'choice'
    && (ask.prompt?.questions?.length ?? 0) <= 1;
  // TUI 폴백 질문이 1개면 컴포저 입력도 그 질문의 자유 답이다(승인 카드의 '직접 답장'과 동일 규칙).
  const fetchAttachment = useCallback((seq: number, idx: number) => {
    const chatId = stream.chatId;
    if (!chatId) return Promise.reject(new Error(i18n.t('대화 없음')));
    const key = `${chatId}:${seq}:${idx}`;
    let pr = attCache.current.get(key);
    if (!pr) {
      pr = chatService.chatAttachment(chatId, seq, idx, host);
      attCache.current.set(key, pr);
      pr.catch(() => attCache.current.delete(key));
    }
    return pr;
  }, [stream.chatId, host]);
  const previewAttachment = useCallback((seq: number, idx: number, label: string) => {
    fetchAttachment(seq, idx)
      .then((a) => { if (a && a.base64) setPreview({ mediaType: a.mediaType, base64: a.base64, name: label }); })
      .catch(() => { /* 라벨 칩으로 남는다 */ });
  }, [fetchAttachment]);

  const tuiAnswerable = tuiOpen && (tuiRow?.msg.questions?.length ?? 0) === 1;
  const send = useCallback(async (text: string) => {
    if (answerable && ask) {
      const t = text.trim();
      if (!t) return;
      await S.respondApproval(ask.id, 'answer', { answer: { questionIndex: 0, labels: [], text: t } }).catch(() => { /* 실패는 카드가 남아 재시도 가능 */ });
      return;
    }
    if (tuiAnswerable) {
      const t = text.trim();
      if (!t) return;
      await submitTui([{ questionIndex: 0, labels: [], text: t }]).catch(() => { /* 카드가 남아 재시도 가능 */ });
      return;
    }
    if (tid == null) return;
    // 첨부 토큰([사진 N]) → 인용 경로 변환(고아 토큰은 걷는다). 낙관 버블은 토큰 원문으로 보여주고,
    //  이미지 경로가 실린 전송은 트랜스크립트에 [Image #N] 으로 변환돼 남으므로 any 매칭으로 걷는다.
    const sendText = resolveAttachTokens(text, attachReg);
    if (!sendText.trim()) return;
    const hadAttach = attachReg.some((a) => a.token && text.includes(a.token));
    setAttachReg((r) => r.filter((a) => !text.includes(a.token)));
    const optId = stream.addPending(text, hadAttach || /'[^']+\.(png|jpe?g|gif|webp|bmp|heic|tiff)'/i.test(sendText));
    setSending(true);
    try {
      // 데몬이 bracketed paste + 지연 Enter 로 넣는다(멀티라인이 줄마다 실행되지 않게).
      await chatService.chatInput({ cwd, tid, text: sendText, submit: true, host });
      // 트랜스크립트 반영을 기다리지 않고 곧바로 캐치업 — 폴링 주기(4s)만큼 멍하지 않게.
      stream.poke();
      // 화면(선택 화면 카드·상태줄)도 같이 앞당긴다 — `/model` 류는 제출 51ms 뒤면 TUI 에 이미 떠 있다.
      stream.pokeScreen();
    } catch (_) {
      stream.failPending(optId);
    } finally { setSending(false); }
  }, [cwd, tid, host, stream, answerable, ask, S, tuiAnswerable, submitTui, attachReg]);

  // ── 에이전트 권한 모드(TUI shift+tab) 전환 ────────────────────────────────
  // 데몬이 그 터미널에 shift+tab 을 눌러 목표 라벨이 뜰 때까지 순환시키고 화면으로 검증한다.
  //  실패는 **반드시 보인다** — 모드가 안 바뀐 채 바뀐 것처럼 보이면 무엇이 자동 실행되는지 오해한다.
  const pickMode = useCallback(async (id: string) => {
    if (tid == null || modeBusy) return;
    setModeBusy(true);
    setModeErr('');
    // 낙관 적용(PC `_pickMode` 와 같은 규칙): 누른 즉시 알약을 목표값으로 — 실패하면 아래에서 되돌린다.
    const prev = stream.statusMode;
    const next: AgentMode = { id, label: agentModeLabel({ id }) };
    stream.setStatusMode(next);
    try {
      const r = await chatService.chatMode({ cwd, tid, mode: id, host });
      stream.setStatusMode(r.mode && r.mode.id ? r.mode : next);
    } catch (e) {
      stream.setStatusMode(prev);   // 낙관 적용 취소 — 화면이 거짓말하지 않게
      const msg = String((e as Error)?.message || e);
      setModeErr(
        /MODE_BLOCKED/.test(msg) ? i18n.t('승인/질문 카드가 떠 있어 지금은 모드를 바꿀 수 없어요.')
          : /MODE_UNREACHABLE/.test(msg) ? i18n.t('이 세션에서는 그 모드로 바꿀 수 없어요.')
            : /MODE_UNKNOWN/.test(msg) ? i18n.t('터미널 화면에서 모드를 읽지 못했어요.')
              : i18n.t('모드를 바꾸지 못했어요.'),
      );
      setTimeout(() => setModeErr(''), 3500);
    } finally { setModeBusy(false); }
  }, [cwd, tid, host, stream, modeBusy]);

  // ── TUI 선택 화면 카드(/model 류) ────────────────────────────────────────
  // 데몬이 화면에서 읽어 준 선택지를 그대로 그리고, 버튼이 그 번호 키를 누른다.
  //  낙관 반영: 성공하면 응답의 다음 화면(이어지는 확인 화면일 수 있다)으로 즉시 교체한다.
  const [dlgBusy, setDlgBusy] = useState(false);
  const driveDialog = useCallback(async (pick: number, cancel?: boolean) => {
    const d = stream.statusDialog;
    if (!d || tid == null || dlgBusy) return;
    setDlgBusy(true);
    try {
      const r = await chatService.chatDialog({ cwd, tid, ...(cancel ? { cancel: true } : { pick }), expect: d.title, host });
      stream.setStatusDialog(r.dialog || null);
      setModeErr('');
    } catch (e) {
      const msg = String((e as Error)?.message || e);
      if (/DIALOG_GONE/.test(msg)) stream.setStatusDialog(null);
      else setModeErr(/DIALOG_MISMATCH/.test(msg) ? i18n.t('터미널 화면이 바뀌었어요 — 다시 확인해 주세요.') : i18n.t('선택을 전달하지 못했어요.'));
      setTimeout(() => setModeErr(''), 3500);
    } finally { setDlgBusy(false); }
  }, [cwd, tid, host, stream, dlgBusy]);

  // ── 슬래시 명령 목록(팔레트) ─────────────────────────────────────────────
  // `/` 를 처음 칠 때 한 번만 받아 둔다(데몬이 빌트인 표 + 디스크 스킬/명령을 합쳐 준다).
  //  실패해도 조용히 빈 목록으로 둔다 — 팔레트만 안 뜨고 직접 타이핑은 그대로 동작한다.
  const [cmds, setCmds] = useState<SlashCommand[] | null>(null);
  const [cmdsLoading, setCmdsLoading] = useState(false);
  const cmdsOnceRef = useRef(false);
  const loadCmds = useCallback(() => {
    if (cmdsOnceRef.current || tid == null) return;
    cmdsOnceRef.current = true;
    setCmdsLoading(true);
    chatService.chatCommands({ cwd, tid, agent: stream.agent || undefined, host })
      .then((r) => setCmds(Array.isArray(r.items) ? r.items : []))
      .catch(() => setCmds([]))
      .finally(() => setCmdsLoading(false));
  }, [cwd, tid, host, stream.agent]);
  // 터미널이 바뀌면 목록도 다시 받는다(프로젝트 스킬이 워크스페이스마다 다르다).
  useEffect(() => { cmdsOnceRef.current = false; setCmds(null); }, [cwd, tid]);

  const stop = useCallback(() => {
    if (tid == null) return;
    // 중단 = Ctrl-C 를 그 PTY 에 넣는다(제출 없이 바이트만) — TUI 에서 Esc/Ctrl-C 와 동일 효과.
    void chatService.chatInput({ cwd, tid, text: '\x03', submit: false, host }).catch(() => { /* noop */ });
  }, [cwd, tid, host]);

  // ★ 리스트 행에 넘기는 문맥은 **참조가 고정**돼야 한다. 인라인 객체로 넘기면 statusline push(3초)
  //  같은 사소한 갱신마다 행이 리렌더/리마운트되고, 그때마다 이미지가 다시 그려진다(사용자 신고
  //  2026-08-02 "이미지가 반복적으로 새로 그려진다"). 미디어 캐시(ChatMedia)와 함께 이 memo 가 그 방어다.
  const mediaCtx = useMemo(() => ({
    chatId: stream.chatId,
    host,
    onPreview: (a: { uri: string; mediaType: string; name: string }) => setPreview({ uri: a.uri, mediaType: a.mediaType, name: a.name }),
  }), [stream.chatId, host]);

  const renderItem = useCallback(({ item }: { item: RowItem }) => (
    <View style={{ marginBottom: 10 }}>
      {item.t === 'pending' ? <PendingRow item={item.item} /> : (
        <ChatRow
          row={item.row}
          onOpenFile={onOpenFile}
          onFetchAttachment={fetchAttachment}
          onPreviewAttachment={previewAttachment}
          // 대화가 참조한 파일(에이전트가 `![라벨](경로)` 로 넣은 스크린샷 등)을 실제로 띄우기 위한 문맥.
          media={mediaCtx}
        />
      )}
    </View>
  ), [onOpenFile, fetchAttachment, previewAttachment, mediaCtx]);

  const empty = !rows.length;

  return (
    <View style={{ flex: 1, backgroundColor: C.base }}>
      {!agentAlive ? (
        // 사용자 의사 없이 화면을 바꾸지 않는다(§6-4 (a)) — 배너만 띄우고 전환은 사용자가 누른다.
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: C.elevated, borderBottomWidth: 1, borderBottomColor: C.border }}>
          <Text style={{ flex: 1, color: C.text3, fontSize: 12 }}>{i18n.t('에이전트가 종료됐어요. 대화 기록은 계속 볼 수 있어요.')}</Text>
          <PressableScale onPress={onExitChat} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, height: 28, borderRadius: v2.radius.sm, borderWidth: 1, borderColor: C.borderControl, backgroundColor: C.elevated2 }}>
            <TerminalWindow size={13} color={C.text2} />
            <Text style={{ color: C.text2, fontSize: 12, fontWeight: '600' }}>{i18n.t('터미널')}</Text>
          </PressableScale>
        </View>
      ) : null}

      <View style={{ flex: 1 }}>
        {stream.state === 'loading' && empty ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={C.text3} />
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
            <Text style={{ color: C.text2, fontSize: 15, fontWeight: '600' }}>{i18n.t('무엇이든 요청하세요')}</Text>
          </View>
        ) : stream.state === 'unsupported' || (stream.state === 'error' && empty) ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 }}>
            <ChatCircleDots size={30} color={C.textDim} />
            <Text style={{ color: C.text3, fontSize: 13, textAlign: 'center', lineHeight: 20 }}>
              {stream.error || i18n.t('대화를 불러올 수 없어요.')}
            </Text>
            <PressableScale onPress={stream.reload} hitSlop={8} style={{ paddingHorizontal: 14, height: 34, borderRadius: v2.radius.sm, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.borderControl, backgroundColor: C.elevated2 }}>
              <Text style={{ color: C.text, fontSize: 12.5, fontWeight: '600' }}>{i18n.t('다시 시도')}</Text>
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
              // ★ 작업 중 표시 — 없으면 '아무 반응이 없다' 로 보인다(사용자 신고: 채팅에서 물었는데
              //  조용해서 TUI 로 바꿔 보니 실제로는 돌고 있었다). 도구 실행·생각 중에는 항상 뭔가 보인다.
              ListFooterComponent={busyGuess && !dockOpen && !tuiOpen ? <WorkingRow /> : null}
              ListHeaderComponent={stream.headTruncated ? (
                <Text style={{ color: C.textDim, fontSize: 11, textAlign: 'center', marginBottom: 10 }}>
                  
                  {i18n.t('이전 대화는 PC 에 더 있어요(최근 부분만 표시)')}
                </Text>
              ) : null}
              ListEmptyComponent={(
                <View style={{ paddingTop: 40, alignItems: 'center', gap: 8 }}>
                  <ChatCircleDots size={28} color={C.textDim} />
                  <Text style={{ color: C.textDim, fontSize: 12.5 }}>
                    {wsName ? `「${wsName}」 대화가 아직 없어요` : i18n.t('대화가 아직 없어요')}
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

      {/* 만료 카드("PC 터미널로 넘어갔어요")보다 **답할 수 있는** TUI 카드가 우선이다 —
          같은 질문이 TUI 로 넘어간 상태라면 이제 채팅 카드가 그 다이얼로그를 대신 조작한다. */}
      {dockOpen && ask && !(ask.expired && tuiOpen) ? (
        <QuestionDock
          approval={ask}
          // ✕ — 만료분은 목록에서도 치운다(더 할 일이 없다). 아직 대기 중이면 이번 화면에서만 접는다
          //  (요청은 살아 있으므로 탭의 점과 알림으로 계속 남는다).
          onDismiss={() => { if (ask.expired) S.dismissApproval(ask.id); else setDockClosed(ask.id); }}
        />
      ) : tuiOpen && tuiApproval ? (
        <QuestionDock
          approval={tuiApproval}
          tuiSubmit={submitTui}
          onDismiss={() => setTuiClosed(tuiKey)}
        />
      ) : null}

      {/* TUI 선택 화면(/model 류) 미러 카드 — 승인/질문 도크 아래, 상태줄 위. */}
      {stream.statusDialog ? (
        <TuiDialogCard
          dialog={stream.statusDialog}
          busy={dlgBusy}
          onPick={(n) => { void driveDialog(n); }}
          onCancel={() => { void driveDialog(0, true); }}
        />
      ) : null}

      {/* TUI statusline 미러 — 데몬이 터미널 화면에서 뽑은 원문(ANSI)을 컴포저 바로 위에 그린다. */}
      {/* 상태 표시 — 공식 채널 값(agentStatus)이 있으면 그걸 그리고, 없을 때만 TUI 원문 미러 폴백.
          (훅이 아직 안 붙은 세션 · codex 첫 턴 전 구간이 폴백 대상이다.) */}
      {stream.agentStatus
        ? <AgentStatusStrip status={stream.agentStatus} />
        : stream.statusLines && stream.statusLines.length ? <StatusLineStrip lines={stream.statusLines} /> : null}
      {modeErr ? (
        <Text style={{ color: C.textDim, fontSize: 11.5, paddingHorizontal: 14, paddingTop: 2 }}>{modeErr}</Text>
      ) : null}

      <ChatComposer
        attachReg={attachReg}
        onAttachAdd={(items) => {
          const added: AttachEntry[] = items.map((it) => {
            attachSeq.current += 1;
            return { token: '', path: it.path, name: it.name, image: it.image, base64: it.base64 } as AttachEntry;
          }).map((a, i) => ({ ...a, token: `[${items[i].image ? i18n.t('사진') : i18n.t('파일')} ${attachSeq.current - items.length + 1 + i}]` }));
          setAttachReg((r) => [...r, ...added]);
          return added;
        }}
        onAttachRemove={(token) => setAttachReg((r) => r.filter((a) => a.token !== token))}
        onPreviewLocal={(a) => { if (a.base64) setPreview({ base64: a.base64, name: a.name }); }}
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
        placeholderOverride={answerable || tuiAnswerable ? i18n.t('또는 직접 답장…') : undefined}
        // ★ noSession 이어도 컴포저는 활성이다 — 전송이 곧 대화를 시작시킨다(훅이 바인딩을 만든다).
        //  단 TUI 다이얼로그가 떠 있고 질문이 여러 개면 막는다 — 이때 chatInput 으로 보낸 글자는
        //  대화가 아니라 **다이얼로그에 타이핑**되어 선택지를 오조작한다.
        mode={stream.statusMode}
        modeBusy={modeBusy}
        onPickMode={(id) => { void pickMode(id); }}
        commands={cmds}
        commandsLoading={cmdsLoading}
        onNeedCommands={loadCmds}
        disabled={tid == null || (tuiOpen && !tuiAnswerable)}
        disabledHint={tid == null ? i18n.t('터미널이 아직 준비되지 않았어요.')
          : tuiOpen && !tuiAnswerable ? i18n.t('위 카드에서 답해주세요.') : undefined}
      />
      {/* 확대/이동/더블탭/아래로 밀어 닫기 — 사진 뷰어 관례(사용자 요청 2026-08-02). */}
      <ImageViewer item={preview} onClose={() => setPreview(null)} />

    </View>
  );
}

// TUI statusline 미러 — 데몬이 터미널 화면 하단에서 뽑은 원문 줄(ANSI)을 컴포저 위에 그대로 그린다
//  (2026-07-30 사용자 확정: 구조화 재구성이 아니라 원문 미러). 색 = 터미널 팔레트와 동일.
function StatusLineStrip({ lines }: { lines: string[] }) {
  const { resolvedScheme } = useTheme();
  const dark = resolvedScheme !== 'light';
  const scheme = useTermScheme();
  const pal = useMemo(() => termPalette(scheme, dark), [scheme, dark]);
  const C = v2.colors;
  const mono = Platform.OS === 'ios' ? 'Menlo' : 'monospace';
  return (
    <View style={{ paddingHorizontal: 14, paddingTop: 3, paddingBottom: 1 }}>
      {lines.map((l, i) => (
        <ScrollView key={i} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 14 }}>
        <Text style={{ fontFamily: mono, fontSize: 10.5, lineHeight: 15, color: C.text3 }}>
          {parseAnsiLine(l, pal).map((s, j) => (
            <Text
              key={j}
              style={{
                ...(s.color ? { color: s.color } : {}),
                ...(s.backgroundColor ? { backgroundColor: s.backgroundColor } : {}),
                ...(s.bold ? { fontWeight: '700' as const } : {}),
                ...(s.dim ? { opacity: 0.6 } : {}),
                ...(s.italic ? { fontStyle: 'italic' as const } : {}),
                ...(s.underline ? { textDecorationLine: 'underline' as const } : {}),
              }}
            >
              {s.text}
            </Text>
          ))}
        </Text>
        </ScrollView>
      ))}
    </View>
  );
}

// 작업 중 한 줄 — 스피너 + '작업 중'. 대화 맨 아래에 붙는다(메시지가 아니라 상태 표시라 말풍선이 아니다).
function WorkingRow() {
  const C = v2.colors;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 }}>
      <ActivityIndicator size="small" color={C.text3} />
      <Text style={{ color: C.text3, fontSize: 12.5 }}>{i18n.t('작업 중…')}</Text>
    </View>
  );
}
