import { apiRequest } from '../utils/api';
import type { AgentMode, AgentStatus, ChatEventFrame, ChatMsg, ChatSnapshot, SlashCommand, TuiDialog } from '../workspace/chatModel';
import * as i18n from '../i18n/index.ts';

// 트랜스크립트 채팅(기능5) REST 클라이언트 — back `/api/daemon/chat/*` 의 얇은 래퍼.
//  · 서버는 데몬 rpc(chat.sessions/open/since/detail/attachment/close/input)를 그대로 프록시한다
//    (codingpt_back/controllers/daemonController.js 의 chatRpc). 새 배관 없음.
//  · 라이브 델타는 여기가 아니라 agent/stream WSS 의 {type:'chat_event'} 프레임(notificationService
//    가 dispatch)으로 온다. **push 는 힌트, pull(chat.since)이 정본** — 유실은 폴링이 메꾼다.
//  · hostDeviceId 는 멀티 PC 직결 규약(fs/터미널과 동일). GET 은 쿼리, POST 는 body.

const hostQS = (host?: number | null) => (host != null ? `&hostDeviceId=${host}` : '');
const hostBody = (host?: number | null) => (host != null ? { hostDeviceId: host } : {});

export interface ChatSessionRow {
  sessionId: string;
  title: string;
  lastPrompt: string | null;
  lastAt: string;
  bytes: number;
  lines: number | null;
  permissionMode: string | null;
  gitBranch: string | null;
  cwdMatch: boolean;
  live: boolean;
  oversize: boolean;
}

/** chat.since 응답 — 정상 델타 | 에포크 교체(스냅샷 대체, 로컬 버퍼를 비워야 한다). */
// ★ statusMode 는 두 갈래 모두에 실린다 — **캐치업이 모드의 정본**이기 때문이다(push 는 변경 순간
//  1회뿐이라 앱이 백그라운드였거나 소켓이 끊겨 있었으면 그 프레임을 영영 놓친다, 2026-08-02 실사고).
export type ChatSince =
  | { epochChanged?: false; epoch: string; headSeq: number; more?: boolean; messages: ChatMsg[]; statusMode?: { id: string; label?: string; symbol?: string } }
  | { epochChanged: true; epoch: string; headSeq: number; headTruncated?: boolean; messages: ChatMsg[]; statusMode?: { id: string; label?: string; symbol?: string } };

/** 트랜스크립트 기능 자체가 꺼져 있거나(서버 killswitch) 구 데몬이면 이 에러로 떨어진다. */
export class ChatUnavailableError extends Error {}

// 세션 목록(대화 고르기 — v1 UI 에선 진단용).
export async function chatSessions(cwd: string, host?: number | null): Promise<{ supported: boolean; agent: string; sessions: ChatSessionRow[]; reason?: string }> {
  const r = await apiRequest<{ supported: boolean; agent: string; sessions: ChatSessionRow[]; reason?: string }>(
    `/api/daemon/chat/sessions?cwd=${encodeURIComponent(cwd)}${hostQS(host)}`,
    { method: 'GET', silent: true, timeoutMs: 25000 },
  );
  if (!r.success || !r.data) throw new ChatUnavailableError(r.error || r.message || i18n.t('대화 목록을 불러올 수 없어요.'));
  return { ...r.data, sessions: r.data.sessions || [] };
}

/**
 * 구독 시작(멱등) — 그 터미널(tid)에 붙은 claude 세션의 트랜스크립트를 찾아 스냅샷 + tail 등록.
 *  tid 를 주면 데몬이 훅 바인딩(cwd|tid → sessionId)으로 정확히 그 터미널의 대화를 고른다.
 *  바인딩이 없으면(훅 미발화) 슬러그 스캔 최신으로 폴백하므로 첫 진입에도 화면이 빈 채로 남지 않는다.
 */
export async function chatOpen(opts: { cwd: string; tid?: number; agent?: string | null; sessionId?: string; limit?: number; host?: number | null }): Promise<ChatSnapshot> {
  const r = await apiRequest<ChatSnapshot>('/api/daemon/chat/open', {
    method: 'POST',
    body: {
      cwd: opts.cwd,
      ...(Number.isInteger(opts.tid) ? { tid: opts.tid } : {}),
      // ★ 이 터미널에서 도는 CLI. 안 보내면 데몬이 claude 로 가정해 **다른 에이전트 터미널에
      //  claude 대화가 뜬다**(2026-07-28 실사고). 모를 때만 생략한다(데몬 기본값 = claude).
      ...(opts.agent ? { agent: opts.agent } : {}),
      ...(opts.sessionId ? { sessionId: opts.sessionId } : {}),
      ...(opts.limit ? { limit: opts.limit } : {}),
      ...hostBody(opts.host),
    },
    silent: true,
    timeoutMs: 30000,
  });
  if (!r.success || !r.data) throw new ChatUnavailableError(r.error || r.message || i18n.t('대화를 열 수 없어요.'));
  return { ...r.data, messages: r.data.messages || [] };
}

/** 워터마크 이후 증분(캐치업 정본). epochChanged 면 호출측이 로컬 버퍼를 비우고 messages 로 다시 그린다. */
export async function chatSince(opts: { chatId: string; sinceSeq: number; epoch?: string; host?: number | null }): Promise<ChatSince> {
  const qs = `chatId=${encodeURIComponent(opts.chatId)}&sinceSeq=${opts.sinceSeq}${opts.epoch ? `&epoch=${encodeURIComponent(opts.epoch)}` : ''}${hostQS(opts.host)}`;
  const r = await apiRequest<ChatSince>(`/api/daemon/chat/since?${qs}`, { method: 'GET', silent: true, timeoutMs: 25000 });
  if (!r.success || !r.data) throw new Error(r.error || r.message || i18n.t('대화를 갱신할 수 없어요.'));
  return { ...r.data, messages: (r.data as { messages?: ChatMsg[] }).messages || [] } as ChatSince;
}

export async function chatClose(chatId: string, host?: number | null): Promise<void> {
  await apiRequest('/api/daemon/chat/close', { method: 'POST', body: { chatId, ...hostBody(host) }, silent: true, timeoutMs: 10000 });
}

/** 원본 JSONL 라인(길게 잘린 도구 결과 전문 보기). */
export async function chatDetail(chatId: string, seq: number, host?: number | null): Promise<{ raw: string; truncated?: boolean; missing?: boolean; bytes?: number }> {
  const r = await apiRequest<{ raw: string; truncated?: boolean; missing?: boolean; bytes?: number }>(
    `/api/daemon/chat/detail?chatId=${encodeURIComponent(chatId)}&seq=${seq}${hostQS(host)}`,
    { method: 'GET', silent: true, timeoutMs: 20000 },
  );
  if (!r.success || !r.data) throw new Error(r.error || r.message || i18n.t('원본을 불러올 수 없어요.'));
  return r.data;
}

/** 첨부 이미지(base64). 상한 초과/누락은 missing 으로 온다(예외 아님). */
export async function chatAttachment(chatId: string, seq: number, idx: number, host?: number | null): Promise<{ mediaType?: string; base64?: string; bytes?: number; missing?: boolean; reason?: string }> {
  const r = await apiRequest<{ mediaType?: string; base64?: string; bytes?: number; missing?: boolean; reason?: string }>(
    `/api/daemon/chat/attachment?chatId=${encodeURIComponent(chatId)}&seq=${seq}&idx=${idx}${hostQS(host)}`,
    { method: 'GET', silent: true, timeoutMs: 25000 },
  );
  if (!r.success || !r.data) throw new Error(r.error || r.message || i18n.t('첨부를 불러올 수 없어요.'));
  return r.data;
}

/**
 * 채팅 전송 — 그 터미널에서 **지금 돌고 있는 claude** 에 사람이 타이핑한 것처럼 넣는다.
 *  별도 에이전트 세션을 만들지 않는다(같은 대화 유지). 멀티라인 bracketed paste + 지연 Enter 는
 *  데몬(cpt-server.chatInput)이 처리하므로 앱은 원문을 그대로 보낸다.
 */
export async function chatInput(opts: { cwd: string; tid: number; text: string; submit?: boolean; host?: number | null }): Promise<{ ok: boolean; tid?: number; bytes?: number }> {
  const r = await apiRequest<{ ok: boolean; tid?: number; bytes?: number }>('/api/daemon/chat/input', {
    method: 'POST',
    body: { cwd: opts.cwd, tid: opts.tid, text: opts.text, submit: opts.submit !== false, ...hostBody(opts.host) },
    silent: true,
    timeoutMs: 20000,
  });
  if (!r.success || !r.data) throw new Error(r.error || r.message || i18n.t('전송하지 못했어요.'));
  return r.data;
}

/** chat.answer 와이어 답변 — 질문 순서대로 전부 있어야 한다(TUI 조작은 건너뛰기가 없다). */
export interface TuiAnswer { optionIndexes: number[]; text?: string | null; multiSelect: boolean; optionCount: number }

/**
 * TUI 로 폴백된 질문에 답하기 — 데몬이 AskUserQuestion 다이얼로그를 키 입력으로 대신 조작한다.
 *  승인 훅이 살아 있으면(카드가 있으면) 그 경로를 쓰고, 이 함수는 **카드가 회수된 뒤** 채팅에
 *  트랜스크립트 기준으로 다시 세운 질문 카드의 전송 경로다.
 */
export async function chatAnswer(opts: { cwd: string; tid: number; expect: string; answers: TuiAnswer[]; host?: number | null }): Promise<{ ok: boolean }> {
  const r = await apiRequest<{ ok: boolean }>('/api/daemon/chat/answer', {
    method: 'POST',
    body: { cwd: opts.cwd, tid: opts.tid, expect: opts.expect, answers: opts.answers, ...hostBody(opts.host) },
    silent: true,
    timeoutMs: 35000,
  });
  if (!r.success) throw new Error(r.error || r.message || i18n.t('답변을 전달하지 못했어요.'));
  return r.data || { ok: true };
}

/**
 * 에이전트 권한 모드 조회/전환 — TUI 에서 shift+tab 으로만 바꾸던 그 모드다.
 *  데몬이 그 터미널에 shift+tab 을 눌러 목표 라벨이 화면에 뜰 때까지 순환시키고 결과를 검증한다
 *  (조용한 성공 금지 — 못 바꾸면 MODE_* 코드로 실패한다). mode 를 빼면 현재 값만 읽는다.
 */
export async function chatMode(opts: { cwd: string; tid: number; mode?: string; host?: number | null }): Promise<{ ok: boolean; mode?: { id: string; label?: string; symbol?: string } | null }> {
  const r = await apiRequest<{ ok: boolean; mode?: { id: string; label?: string; symbol?: string } | null }>('/api/daemon/chat/mode', {
    method: 'POST',
    body: { cwd: opts.cwd, tid: opts.tid, ...(opts.mode ? { mode: opts.mode } : {}), ...hostBody(opts.host) },
    silent: true,
    timeoutMs: 25000,
  });
  if (!r.success || !r.data) throw new Error(r.error || r.message || i18n.t('모드를 바꾸지 못했어요.'));
  return r.data;
}


/**
 * 대화 바인딩과 무관한 화면 상태(상태줄·모드·선택 화면) — 짝이 안 지어진 터미널(codex ambiguous 등)
 *  에서도 채팅이 TUI 를 미러할 수 있게 하는 폴링 경로(2026-08-03 실사고).
 */
export async function chatScreen(opts: { cwd: string; tid: number; agent?: string | null; host?: number | null }): Promise<{ lines?: string[] | null; mode?: AgentMode | null; dialog?: TuiDialog | null; agentStatus?: AgentStatus | null }> {
  const r = await apiRequest<{ lines?: string[] | null; mode?: AgentMode | null; dialog?: TuiDialog | null }>('/api/daemon/chat/screen', {
    method: 'POST',
    body: { cwd: opts.cwd, tid: opts.tid, ...(opts.agent ? { agent: opts.agent } : {}), ...hostBody(opts.host) },
    silent: true,
    timeoutMs: 20000,
  });
  if (!r.success || !r.data) throw new Error(r.error || r.message || i18n.t('화면 상태를 불러오지 못했어요.'));
  return r.data;
}

/**
 * 채팅 카드로 미러한 TUI 선택 화면 조작 — pick(번호) 또는 cancel(Esc).
 *  expect(제목)를 함께 보내 **화면이 그 사이 바뀌었으면 데몬이 거절**하게 한다(오답 방지).
 */
export async function chatDialog(opts: { cwd: string; tid: number; pick?: number; cancel?: boolean; expect?: string; host?: number | null }): Promise<{ ok: boolean; dialog?: TuiDialog | null }> {
  const r = await apiRequest<{ ok: boolean; dialog?: TuiDialog | null }>('/api/daemon/chat/dialog', {
    method: 'POST',
    body: {
      cwd: opts.cwd, tid: opts.tid,
      ...(opts.cancel ? { cancel: true } : { pick: opts.pick }),
      ...(opts.expect ? { expect: opts.expect } : {}),
      ...hostBody(opts.host),
    },
    silent: true,
    timeoutMs: 25000,
  });
  if (!r.success || !r.data) throw new Error(r.error || r.message || i18n.t('선택을 전달하지 못했어요.'));
  return r.data;
}

/**
 * TUI 의 `/` 명령 목록(슬래시 팔레트) — 빌트인 실측표 + 그 PC 디스크에서 발견한 스킬/커스텀 명령.
 *  읽기 전용이고 실패해도 치명적이지 않다(팔레트만 비고, 직접 타이핑은 그대로 동작한다).
 */
export async function chatCommands(opts: { cwd: string; tid: number; agent?: string | null; host?: number | null }): Promise<{ agent: string; items: SlashCommand[] }> {
  const r = await apiRequest<{ agent: string; items: SlashCommand[] }>('/api/daemon/chat/commands', {
    method: 'POST',
    body: { cwd: opts.cwd, tid: opts.tid, ...(opts.agent ? { agent: opts.agent } : {}), ...hostBody(opts.host) },
    silent: true,
    timeoutMs: 20000,
  });
  if (!r.success || !r.data) throw new Error(r.error || r.message || i18n.t('명령 목록을 불러오지 못했어요.'));
  return r.data;
}

/**
 * 대화가 참조한 파일 바이트(이미지/영상 인라인 표시) — 에이전트가 답변에 `![라벨](경로)` 로 넣은 것.
 *  권한 판정은 데몬이 한다: **그 대화가 내보낸 메시지에 적힌 경로만** 서빙한다(임의 경로 열람 아님).
 *  실패는 예외가 아니라 { missing, reason } 으로 온다 — 화면이 "왜 안 보이는지" 말할 수 있어야 한다.
 */
export async function chatFile(opts: { chatId: string; path: string; host?: number | null }): Promise<{
  mediaType?: string; base64?: string; bytes?: number; name?: string; missing?: boolean; reason?: string; cap?: number;
}> {
  const r = await apiRequest<{ mediaType?: string; base64?: string; bytes?: number; name?: string; missing?: boolean; reason?: string; cap?: number }>(
    '/api/daemon/chat/file',
    { method: 'POST', body: { chatId: opts.chatId, path: opts.path, ...hostBody(opts.host) }, silent: true, timeoutMs: 45000 },
  );
  if (!r.success || !r.data) throw new Error(r.error || r.message || i18n.t('파일을 불러오지 못했어요.'));
  return r.data;
}

// ── 라이브 델타 리스너(chat_event) ──────────────────────────────────
//  notificationService 의 단일 WSS(agent/stream)에 동승한 프레임을 여기로 흘린다. 구독자는
//  chatId 로 자기 것만 골라 쓴다(여러 pane 이 동시에 채팅 모드일 수 있다).
type ChatEventListener = (f: ChatEventFrame) => void;
const chatListeners = new Set<ChatEventListener>();

export function addChatEventListener(fn: ChatEventListener): () => void {
  chatListeners.add(fn);
  return () => { chatListeners.delete(fn); };
}

/** notificationService(WSS/SSE 양쪽)가 호출. 핸들러 예외가 소켓 루프를 깨지 않게 격리한다. */
export function dispatchChatEvent(f: ChatEventFrame): void {
  for (const fn of [...chatListeners]) { try { fn(f); } catch (_) { /* noop */ } }
}

export default {
  chatSessions, chatOpen, chatSince, chatClose, chatDetail, chatAttachment, chatInput, chatAnswer, chatMode, chatCommands, chatDialog, chatScreen, chatFile,
  addChatEventListener, dispatchChatEvent,
};
