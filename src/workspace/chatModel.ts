// chatModel.ts — 트랜스크립트 채팅(기능5) 공용 스펙 모듈.
//
// ★ PC `codingpt_pc/src/js/chat-model.js` 와 **동시 수정 대상**이다(한쪽만 고치지 말 것).
//   termSeqFor(KeyAssist.tsx ↔ pane.js) 와 같은 관례: 렌더 규칙(라벨/접힘/자동스크롤 임계값/병합)을
//   여기 한 곳에 모아 두 플랫폼이 같은 문자열·같은 동작을 내게 한다.
//
// 이 파일이 정의하는 타입은 **데몬 transcript.js 가 실제로 보내는 와이어 모델**이다(설계서 초안의
//  추측 ChatMsg 가 아니라 as-built). 근거: codingpt_daemon/packages/runner-core/transcript.js
//   · msg() 직렬화(seq/ts/role/kind/text/truncated/hidden/tool/result/question/attachments/meta)
//   · normalize() 의 role×kind 조합 전량
// RN 의존성 0 — 순수 로직이라 jest 로 직접 검증할 수 있다(__tests__/chatModel.test.ts).

// ── 와이어 타입 ──────────────────────────────────────────────────────

/** 데몬이 쓰는 3-role 모델. UI 의 "말풍선/전폭/시스템" 구분과 1:1. */
export type ChatRole = 'user' | 'assistant' | 'system';

/**
 * 라인 종류. transcript.js normalize() 가 내는 값 전량 + 미래 확장 대비 string.
 *  · assistant: text | thinking | tool_use | question | divider
 *  · user:      text | slash | interrupt | meta | system | tool_result | compact
 *  · system:    compact | divider | system | meta | unknown
 */
export type ChatKind =
  | 'text' | 'thinking' | 'tool_use' | 'question' | 'tool_result'
  | 'slash' | 'interrupt' | 'meta' | 'system' | 'compact' | 'divider' | 'unknown';

/** tool_use 요약 — 제목/경로/인자 프리뷰는 데몬이 이미 만든다(우리는 그대로 그린다). */
export interface ChatTool {
  name: string;
  title: string;
  path?: string;        // 워크스페이스 상대경로(있으면 "열기 ›" 활성)
  lang?: string;
  argsPreview?: string;
  argsBytes?: number;
  id?: string | null;   // tool_use id — tool_result 와 짝짓는 키
}

/** tool_result 요약 — 본문은 앞/뒤 조각 프리뷰(전문은 chat.detail 온디맨드). */
/** 편집 diff(claude structuredPatch) — 데몬이 Edit/Write 결과에서 뽑아 실어 준다. */
export interface ChatPatch {
  hunks: { oldStart: number; newStart: number; lines: string[] }[];
  truncated?: boolean;
  file?: string | null;
}

export interface ChatResult {
  toolUseId: string | null;
  ok: boolean;
  preview: string;
  bytes: number;
  lines: number;
  truncated: boolean;
  images: number;
  /** 편집 결과면 diff. 이게 있으면 preview 는 비어 있다(상투 문구를 데몬이 지운다). */
  patch?: ChatPatch;
}

/** AskUserQuestion 선택지 — 폰이 버튼을 그릴 근거(승인 카드와 동일 구조). */
export interface ChatQuestion {
  header: string;
  question: string;
  options: Array<{ label: string; description?: string }>;
  multiSelect: boolean;
}

export interface ChatAttachment {
  idx: number;
  mediaType: string;
  bytes: number;
}

export interface ChatMsg {
  /** 안정 키·단조 정렬 키. seq = 라인시작오프셋 * SEQ_SCALE + (블록인덱스+1). React key 로 그대로 쓴다. */
  seq: number;
  /** ISO 문자열(데몬이 o.timestamp 를 그대로 싣는다 — epoch ms 아님). 없을 수 있다. */
  ts?: string | null;
  role: ChatRole;
  kind: ChatKind;
  text: string;
  truncated?: boolean;
  /** 기본 접힘(진단용 메타/시스템/thinking 등). UI 는 isDisplayed() 로 판정한다. */
  hidden?: boolean;
  isSidechain?: boolean;
  model?: string | null;
  agentId?: string | null;
  tool?: ChatTool;
  result?: ChatResult;
  question?: ChatQuestion;
  /** AskUserQuestion 전체 질문 배열(데몬 0.1.148+) — TUI 폴백 질문 카드를 다시 세우는 근거.
   *  question(첫 개)은 구 데몬 호환으로 계속 온다. */
  questions?: ChatQuestion[];
  attachments?: ChatAttachment[];
  meta?: Record<string, unknown> | null;
}

/**
 * TUI 선택 화면(`/model`·`/permissions` 류) 미러 — 데몬 status-line.extractDialog 가 화면에서 읽는다.
 *  채팅은 이걸 카드로 그리고, 버튼이 그 번호 키를 누른다(chat.dialog). PC 미러: `.chat-tuidlg`.
 */
export interface TuiDialog {
  title: string;
  desc?: string;
  options: { n: number; label: string; desc?: string }[];
  footer?: string;
}

/** chat.open 응답 = 스냅샷. chat.since 는 {epoch, headSeq, more, messages} 또는 epochChanged 형태. */
export interface ChatSnapshot {
  /** ⚠ noSession 응답에서는 null 이다(구독할 tail 이 없다) — 그래서 nullable 이다. */
  chatId: string | null;
  sessionId: string | null;
  transcriptPath?: string | null;
  agent?: string;
  epoch: string;
  headSeq: number;
  bytes?: number;
  headTruncated?: boolean;
  source?: 'hook' | 'explicit' | 'scan' | string;
  messages: ChatMsg[];
  /** 데몬이 지원 불가를 알릴 때(claude 미설치 등). */
  supported?: boolean;
  reason?: string;
  /**
   * ★ "보여줄 대화가 없다"는 **성공 응답**(오류가 아니다 — 데몬 계약 2026-07-27).
   *  이때 `chatId: null`, `messages: []`, `epoch: ''`, `headSeq: 0` 으로 온다.
   *  UI 는 오류/경고 배너 대신 빈 상태(인사 + 컴포저)를 그린다. 그리고 **재오픈을 자동으로 반복하지
   *  않는다** — chatId 가 null 이라 "chatId 없으면 다시 열기" 류의 조건이 매 틱 참이 되어 화면은
   *  정상인데 데몬/릴레이만 계속 두들기는 조용한 폭주가 된다(useChatStream 의 noSession 게이트).
   */
  noSession?: boolean;
  /** TUI statusline 미러 초기값(ANSI 원문 줄들) — 데몬 status-line.js 가 화면에서 뽑는다. */
  statusLines?: string[];
  /** 에이전트 상태(공식 채널). 데몬이 아는 게 없으면 필드 자체가 없다. */
  agentStatus?: AgentStatus;
  /** 에이전트 권한 모드 초기값 — 컴포저 알약이 그린다(claude 만, 모르면 없음). */
  statusMode?: AgentMode;
  /** TUI 선택 화면이 지금 떠 있으면 그 내용(카드로 미러). */
  statusDialog?: TuiDialog | null;
  /**
   * noSession 사유:
   *  · 'not_started' = 이 터미널에 바인딩은 있는데 트랜스크립트 파일이 아직 없다(claude 는 돌지만
   *    대화를 시작하지 않았다). **가장 흔한 경우** — 이걸 폴백 스캔으로 메우면 "다른 터미널의 대화가
   *    내 터미널에 보인다"가 된다(실기기에서 실제로 그렇게 나타났다).
   *  · 'ambiguous'   = 바인딩이 없고 후보 대화가 2개 이상 → 어느 것이 이 터미널인지 단정 불가.
   *  · 'none'        = 후보 없음.
   */
  candidates?: number;
}

/** 라이브 델타(WS chat_event) — back 이 데몬 프레임을 그대로 중계한다. */
export interface ChatEventFrame {
  type: 'chat_event';
  chatId: string;
  sessionId?: string | null;
  epoch?: string;
  headSeq?: number;
  epochChanged?: boolean;
  messages?: ChatMsg[];
  /** 구독 소멸/에포크 리셋/세션 전환/TUI statusline 미러 통보. */
  control?: {
    kind: 'gone' | 'epoch_reset' | 'session_switch' | 'status_line' | 'agent_status';
    reason?: string;
    epoch?: string;
    newSessionId?: string | null;
    /** kind='status_line' — TUI 하단 상태줄 원문(ANSI 포함). */
    lines?: string[];
    /** kind='status_line' — 화면에서 읽은 에이전트 권한 모드(statusline 과 **독립** 필드). */
    mode?: AgentMode;
    /** kind='agent_status' — 공식 채널 상태(claude statusLine 훅 / codex rollout). */
    status?: AgentStatus | null;
    /** kind='status_line' — TUI 선택 화면(없어지면 null 이 온다 → 카드를 걷는다). */
    dialog?: TuiDialog | null;
  };
}

// ── 대화에 적힌 파일(이미지/영상/문서) 표현 규칙 — PC 미러: chat-model.js mediaRefOf ─────────────
// 사용자 확정(2026-08-02): 의도 판별은 **마크다운 문법이 이미 해준다**.
//  `![라벨](경로)` = "그려라" → 실제로 띄운다 / `[라벨](경로)`·맨 경로 = 참조 → 칩(누르면 열림).
//  어느 쪽이든 경로를 화면에 남기므로 "경로를 보여주려던 의도"였어도 잃는 정보가 0이다.
const MEDIA_EXT: Record<string, string[]> = {
  image: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'heic', 'heif', 'tif', 'tiff', 'svg'],
  video: ['mp4', 'm4v', 'mov', 'webm'],
};

export interface MediaRef { via: 'url' | 'path'; kind: 'image' | 'video' | 'file'; name: string; ext: string; target: string }

/** 타깃 문자열 → { via, kind, name, ext, target }. 빈 값이면 null. (PC chat-model.js 와 동일 규칙) */
export function mediaRefOf(target: string | null | undefined): MediaRef | null {
  const raw = String(target == null ? '' : target).trim();
  if (!raw) return null;
  const url = /^(https?:)?\/\//i.test(raw) || raw.startsWith('data:');
  const clean = raw.split(/[?#]/)[0];
  const base = clean.replace(/\/+$/, '').split('/').pop() || clean;
  const ext = (base.includes('.') ? base.split('.').pop() : '')!.toLowerCase();
  const kind = MEDIA_EXT.image.includes(ext) ? 'image' : MEDIA_EXT.video.includes(ext) ? 'video' : 'file';
  return { via: url ? 'url' : 'path', kind, name: base || raw, ext, target: raw };
}

// ── 에이전트 권한 모드(TUI 의 shift+tab) ─────────────────────────────
// PC 미러: `codingpt_pc/src/js/chat-model.js` 의 AGENT_MODES/agentModeView/agentModeChoices —
//  **한쪽만 고치면 같은 모드가 폰/PC 에서 다르게 보인다**(양 플랫폼 동시 수정 대상).
//  label 은 TUI 원문 그대로(사용자 확정 2026-08-01, 번역 금지), desc 만 우리 한 줄 설명.
export interface AgentMode { id: string; label?: string; symbol?: string; /** codex 계획 모드(권한과 독립 토글) */ plan?: boolean }

export interface AgentModeItem { id: string; symbol: string; label: string; desc: string; hidden?: boolean; /** 라디오가 아니라 토글(codex 계획 모드) */ toggle?: boolean }

export const AGENT_MODES: AgentModeItem[] = [
  { id: 'default', symbol: '⏸', label: 'manual mode on', desc: '매번 승인받고 진행' },
  { id: 'acceptEdits', symbol: '⏵⏵', label: 'accept edits on', desc: '파일 편집은 자동 수락' },
  { id: 'plan', symbol: '⏸', label: 'plan mode on', desc: '계획만, 변경 안 함' },
  { id: 'auto', symbol: '⏵⏵', label: 'auto mode on', desc: '안전한 작업은 자동 진행' },
  // bypass 는 `--dangerously-skip-permissions` 세션에만 있다 → 지금 그 모드일 때만 목록에 낀다.
  { id: 'bypassPermissions', symbol: '⏵⏵', label: 'bypassing permissions', desc: '모든 승인 건너뜀', hidden: true },
];

// codex 알약은 **shift+tab 이 바꾸는 것만** 담는다(사용자 확정 2026-08-03).
//  권한 3종(`/permissions`)은 다른 축이라 섞지 않는다 — 팔레트에서 그 명령을 실행하면 선택 화면
//  카드가 떠서 거기서 고른다. 섞으면 체크가 둘 켜져 "중복 선택"처럼 보인다(그 지적의 원인).
export const CODEX_MODES: AgentModeItem[] = [
  { id: 'codexDefault', symbol: '', label: 'Default mode', desc: '평소대로 실행' },
  { id: 'codexPlan', symbol: '', label: 'Plan mode', desc: '계획만 세우고 실행하지 않음' },
];

/** 모드 id 가 속한 카탈로그(모르면 claude). 알약/목록이 에이전트를 따로 몰라도 되게 하는 지점. */
function catalogFor(id: string | null | undefined) {
  return CODEX_MODES.some((m) => m.id === String(id ?? '')) ? CODEX_MODES : AGENT_MODES;
}

/** 모드 id → 카탈로그 항목(모르는 id 는 null). */
export function agentModeOf(id: string | null | undefined) {
  const s = String(id ?? '');
  return AGENT_MODES.find((m) => m.id === s) || CODEX_MODES.find((m) => m.id === s) || null;
}

/** 목록 항목이 "지금 켜진" 것인가 — 양쪽 카탈로그 모두 하나만 켜진다(라디오). */
export function agentModeIsOn(item: { id: string }, current: AgentMode | string | null | undefined): boolean {
  if (!item || !current) return false;
  const cur: AgentMode = typeof current === 'string' ? { id: current } : current;
  return item.id === cur.id;
}

/** 알약 라벨(낙관 적용용) — 데몬 label 이 오기 전에 클라이언트가 카탈로그로 만든다. */
export function agentModeLabel(mode: AgentMode | null | undefined): string {
  if (!mode || !mode.id) return '';
  const cat = agentModeOf(mode.id);
  return cat?.label || mode.label || mode.id;
}

/** 알약/목록 표시값 — 데몬이 준 label/symbol 우선, 없으면 카탈로그로 메운다. 모르면 null. */
export function agentModeView(mode: AgentMode | null | undefined): { id: string; symbol: string; label: string; desc: string } | null {
  if (!mode || !mode.id) return null;
  const cat = agentModeOf(mode.id);
  return {
    id: mode.id,
    symbol: mode.symbol || cat?.symbol || '',
    label: mode.label || cat?.label || mode.id,
    desc: cat?.desc || '',
  };
}

/** 목록에 그릴 선택지 — 지금 모드(id 또는 모드 객체)가 속한 카탈로그. 숨김은 "지금 그 모드일 때"만. */
export function agentModeChoices(current: AgentMode | string | null | undefined) {
  const cur: AgentMode = typeof current === 'string' || current == null ? { id: String(current ?? '') } : current;
  return catalogFor(cur.id).filter((m) => !m.hidden || m.id === cur.id);
}


// ── 슬래시 명령 팔레트(TUI 의 `/` 목록) — PC 미러: chat-model.js slashQuery/filterCommands ────────
// 여는 조건과 정렬을 양 플랫폼이 **같은 규칙**으로 판정한다(한쪽만 고치면 폰/PC 가 다르게 뜬다).
export interface SlashCommand {
  name: string;
  desc: string;
  /** 'ok' = 채팅에서 실행 · 'dialog' = 선택 화면이 뜬다 · 'tui' = 채팅에선 곤란(고를 수 없음) */
  chat: 'ok' | 'dialog' | 'tui';
  source: 'builtin' | 'user' | 'project';
}

/** 초안 전체가 `/토큰` 한 개일 때만 질의(공백을 치면 인자 모드 → null = 닫는다). */
export function slashQuery(text: string | null | undefined): string | null {
  // ⚠ trim() 금지: 뒤 공백은 "인자를 치기 시작했다"는 신호라 팔레트가 **닫혀야** 한다
  //  (`/dep ` 에서 목록이 계속 떠 있으면 전송이 목록 조작에 가로채인다).
  const m = /^\s*\/([A-Za-z0-9:_-]*)$/.exec(String(text ?? ''));
  return m ? m[1] : null;
}

/** 접두사 일치 먼저, 그다음 부분 일치. 목록 자체의 순서(프로젝트→개인→빌트인)는 데몬이 준다. */
export function filterCommands(items: SlashCommand[] | null | undefined, q: string, max?: number): SlashCommand[] {
  const all = Array.isArray(items) ? items : [];
  const s = String(q || '').toLowerCase();
  const cap = max || CMD_MAX;
  if (!s) return all.slice(0, cap);
  const pre: SlashCommand[] = [];
  const rest: SlashCommand[] = [];
  for (const c of all) {
    const n = String(c.name || '').slice(1).toLowerCase();
    if (n.startsWith(s)) pre.push(c);
    else if (n.includes(s)) rest.push(c);
  }
  return pre.concat(rest).slice(0, cap);
}

/** 팔레트 행 배지 — 출처/제약을 한 단어로. */
export function commandBadges(cmd: SlashCommand | null | undefined): string[] {
  const out: string[] = [];
  if (!cmd) return out;
  if (cmd.source === 'project') out.push('프로젝트');
  else if (cmd.source === 'user') out.push('내 것');
  if (cmd.chat === 'dialog') out.push('선택 화면');
  if (cmd.chat === 'tui') out.push('터미널에서');
  return out;
}

/** 팔레트에 한 번에 그리는 최대 행수(PC CHAT.CMD_MAX 미러). */
export const CMD_MAX = 60;

// ── 표시 규칙(양 플랫폼 동일 문자열) ─────────────────────────────────

/** 자동 스크롤 유지 임계값(px) — 이보다 위로 올라가 있으면 "맨 아래로" FAB 를 띄운다. */
export const AT_BOTTOM_PX = 48;
/** tool_result 본문 기본 클램프 줄수(넘으면 "더 보기"). */
export const OUTPUT_CLAMP_LINES = 6;
/** 편집 diff 접힘 줄수(PC CHAT.PATCH_CLAMP_LINES 미러). */
export const PATCH_CLAMP_LINES = 12;

/** patch → 렌더용 행 목록(PC chat-model.js patchLines 와 **같은 규칙**). 색·박스는 각 플랫폼이 그린다. */
export function patchLines(patch: ChatPatch | undefined, limit?: number): { lines: { type: 'add' | 'del' | 'ctx' | 'gap'; text: string; no: number | null }[]; more: boolean } {
  const hunks = patch && Array.isArray(patch.hunks) ? patch.hunks : [];
  const out: { type: 'add' | 'del' | 'ctx' | 'gap'; text: string; no: number | null }[] = [];
  const cap = limit || 200;
  for (const h of hunks) {
    let oldNo = h.oldStart || 0;
    let newNo = h.newStart || 0;
    if (out.length) out.push({ type: 'gap', text: '⋯', no: null });
    for (const raw of h.lines || []) {
      if (out.length >= cap) return { lines: out, more: true };
      const sign = raw.charAt(0);
      const text = raw.slice(1);
      if (sign === '+') out.push({ type: 'add', text, no: newNo++ });
      else if (sign === '-') out.push({ type: 'del', text, no: oldNo++ });
      else { out.push({ type: 'ctx', text, no: newNo }); oldNo++; newNo++; }
    }
  }
  return { lines: out, more: !!(patch && patch.truncated) };
}
/** thinking 본문은 실측상 전량 빈 문자열(signature 만 옴) → 접힌 마커 문구만 그린다. */
export const THINKING_LABEL = '생각 중';
/** 낙관적 user 버블 ↔ 트랜스크립트 user 메시지 중복 판정 창(ms). */
export const OPTIMISTIC_MATCH_MS = 60_000;
/** 중복 판정 키 길이 — 앞부분만 비교(claude 가 프롬프트를 재가공해 뒤가 달라질 수 있다). */
export const OPTIMISTIC_KEY_LEN = 200;

/** ISO ts → epoch ms(정렬/시간 표시용). 없으면 0. */
export function tsMs(m: Pick<ChatMsg, 'ts'>): number {
  if (!m.ts) return 0;
  const n = Date.parse(m.ts);
  return Number.isFinite(n) ? n : 0;
}

/**
 * 이 메시지를 화면에 그리는가.
 *  hidden 은 데몬이 "기본 접힘"으로 표시한 진단 라인 → 감춘다. 단 thinking 은 hidden 이지만
 *  접힌 마커("생각 중")로 존재를 보여준다(사용자 확정 정책 §6-2 (a)).
 */
export function isDisplayed(m: ChatMsg): boolean {
  if (m.kind === 'thinking') return true;
  if (m.hidden) return false;
  // 빈 텍스트 tool_result(구버전 형태)는 그릴 게 없다.
  if (m.kind === 'tool_result' && !m.text && !(m.result && m.result.images)) return false;
  return true;
}

/**
 * 도구 카드 라벨. 데몬 summarizeTool() 이 이미 '$ npm run dev' / '읽기 x.ts' / '수정 x.ts' 형태의
 *  title 을 만들어 준다 — 여기서 다시 조립하면 두 곳이 갈라지므로 title 을 신뢰하고 폴백만 둔다.
 */
export function toolLabel(m: ChatMsg): string {
  if (m.tool) return m.tool.title || m.tool.name || '도구';
  return m.text || '도구';
}

/** 도구 상태 마크 — undefined(진행 중)=…, 성공=✓, 실패=✕. PC 와 동일 글리프. */
export function statusMark(ok: boolean | undefined): string {
  return ok === undefined ? '…' : ok ? '✓' : '✕';
}
/** 상태 색 토큰 이름(플랫폼별 팔레트 키로 해석) — 'dim' | 'accent' | 'error'. */
export function statusTone(ok: boolean | undefined): 'dim' | 'accent' | 'error' {
  return ok === undefined ? 'dim' : ok ? 'accent' : 'error';
}

/** 앞 n 줄만(넘으면 잘린 문자열 + true). */
export function clampLines(text: string, n: number): { text: string; clamped: boolean } {
  const s = (text || '').replace(/\n+$/, '');
  const lines = s.split('\n');
  if (lines.length <= n) return { text: s, clamped: false };
  return { text: lines.slice(0, n).join('\n'), clamped: true };
}

// ── 병합/워터마크 ────────────────────────────────────────────────────

/**
 * seq 오름차순 병합(멱등). 같은 seq 는 나중 값으로 교체한다.
 *  · push 프레임과 pull(chat.since) 이 같은 구간을 중복 배달할 수 있다(다기기가 tail 오프셋을
 *    되감기는 경우 — transcript.js chat.since 가 t.offset 을 재설정한다). 중복 렌더 금지의 근거.
 *  · 대화가 길어질 수 있으므로 이미 정렬된 두 배열을 선형 병합한다(정렬 재수행 없음).
 */
export function mergeMessages(prev: ChatMsg[], incoming: ChatMsg[]): ChatMsg[] {
  if (!incoming || !incoming.length) return prev;
  if (!prev.length) return dedupeSorted(incoming.slice().sort((a, b) => a.seq - b.seq));
  const add = incoming.slice().sort((a, b) => a.seq - b.seq);
  const out: ChatMsg[] = [];
  let i = 0;
  let j = 0;
  while (i < prev.length || j < add.length) {
    if (i >= prev.length) { pushUniq(out, add[j++]); continue; }
    if (j >= add.length) { pushUniq(out, prev[i++]); continue; }
    if (prev[i].seq === add[j].seq) { pushUniq(out, add[j++]); i++; continue; }
    if (prev[i].seq < add[j].seq) pushUniq(out, prev[i++]);
    else pushUniq(out, add[j++]);
  }
  return out;
}

function pushUniq(out: ChatMsg[], m: ChatMsg): void {
  if (!m) return;
  const last = out[out.length - 1];
  if (last && last.seq === m.seq) { out[out.length - 1] = m; return; }
  out.push(m);
}

function dedupeSorted(list: ChatMsg[]): ChatMsg[] {
  const out: ChatMsg[] = [];
  for (const m of list) pushUniq(out, m);
  return out;
}

/** 워터마크 = 지금까지 받은 최대 seq(chat.since 의 sinceSeq 로 그대로 넘긴다). */
export function lastSeqOf(msgs: ChatMsg[], headSeq = 0): number {
  // headSeq(데몬 워터마크)와 실제 수신 최대 seq 중 큰 값. headSeq 만 믿으면 프레임 절단(more:true)
  //  시 아직 못 받은 구간을 건너뛰고, 메시지만 믿으면 "새 메시지 없는 전진"(오프셋만 이동)을 잃는다.
  let mx = headSeq || 0;
  for (const m of msgs) if (m.seq > mx) mx = m.seq;
  return mx;
}

// ── 낙관적 user 버블 ────────────────────────────────────────────────

export interface PendingUser {
  /** 로컬 전용 키(음수 seq 대신 별도 배열로 관리 — 실 메시지 seq 공간을 오염시키지 않는다). */
  id: string;
  text: string;
  at: number;
  state: 'sending' | 'failed';
  /** 트랜스크립트 원문을 예측할 수 없는 전송(이미지 경로 → [Image #N] 변환 등) — 창 안의 **아무** user 메시지와 짝지어 걷는다. */
  any?: boolean;
}

/** 중복 판정 키 — trim 후 앞 200자(공백 정규화 없음: 멀티라인 원문이 그대로 트랜스크립트에 남는다). */
export function optimisticKey(text: string): string {
  return String(text || '').trim().slice(0, OPTIMISTIC_KEY_LEN);
}

/**
 * 트랜스크립트에 같은 텍스트의 user 메시지가 도착했으면 낙관적 버블을 걷어낸다.
 *  · 창(60s) 밖의 옛 메시지와는 매칭하지 않는다(같은 프롬프트 재전송을 지워버리지 않게).
 *  · state==='failed' 는 사용자가 직접 지울 때까지 남긴다(전송 실패는 알려야 한다).
 */
export function pruneOptimistic(pending: PendingUser[], msgs: ChatMsg[], now: number): PendingUser[] {
  if (!pending.length) return pending;
  const keys = new Set<string>();
  for (const m of msgs) {
    if (m.role !== 'user') continue;
    if (m.kind !== 'text' && m.kind !== 'slash') continue;
    const t = tsMs(m);
    // ts 가 없으면(구형 라인) 시간 조건을 통과시킨다 — 텍스트 일치만으로 판정.
    if (t && now - t > OPTIMISTIC_MATCH_MS) continue;
    keys.add(optimisticKey(m.text));
  }
  if (!keys.size) return pending;
  const next = pending.filter((p) => p.state === 'failed' || !(p.any || keys.has(optimisticKey(p.text))));
  return next.length === pending.length ? pending : next;
}

// ── 표시 행(row) 구성 ───────────────────────────────────────────────

/**
 * 렌더 단위. tool_use 와 그 tool_result 를 **한 카드로 접는다**(Claude 앱과 같은 모양) —
 *  두 줄로 흩어지면 "무슨 도구의 결과인지"가 스크롤로 멀어져 읽을 수 없다.
 */
export interface ChatRowModel {
  key: string;
  msg: ChatMsg;
  /** tool_use 행에 짝지어진 결과(없으면 진행 중). */
  result?: ChatResult;
  /** 결과가 붙은 원본 메시지(첨부 로드 시 seq 가 필요하다). */
  resultSeq?: number;
  /** 끝난 도구 행 묶음(TUI 의 "Called X 6 times, ran 5 shell commands") — 펼치면 개별 행. */
  group?: ChatRowModel[];
}

// ── 끝난 도구 행 묶기(TUI 미러) — PC 미러: chat-model.js TOOL_GROUP_MIN/toolRunLabel ──────────
// TUI 는 연속으로 끝난 도구 호출을 **한 줄 요약**으로 접는다("Called claude-in-chrome 6 times,
//  ran 5 shell commands"). 채팅은 한 줄짜리 도구 행을 열몇 개씩 그대로 쌓아서 본문(사람이 읽을 글)이
//  묻혔다(2026-08-02 사용자 지적: "보여줄 건 보여주고 아닌 건 접어라"). 규칙:
//   · **연속**으로 끝난(결과가 붙은) tool 행이 TOOL_GROUP_MIN 개 이상이면 한 줄로 접는다.
//   · 진행 중인 도구·질문 행은 절대 접지 않는다(지금 무슨 일이 일어나는지가 사라지면 안 된다).
export const TOOL_GROUP_MIN = 4;

/** 도구 이름 → 사람이 읽는 묶음 라벨 조각. Bash 는 "셸", mcp 는 서버/도구 이름 그대로. */
function toolRunName(m: ChatMsg): string {
  const n = String(m.tool?.name || '').trim();
  if (!n) return '도구';
  if (n === 'Bash' || n === 'shell') return '셸';
  if (n === 'Edit' || n === 'Write' || n === 'MultiEdit' || n === 'apply_patch') return '편집';
  if (n === 'Read' || n === 'NotebookRead') return '읽기';
  if (n === 'Grep' || n === 'Glob' || n === 'Search') return '검색';
  if (n.startsWith('mcp__')) return n.split('__')[1] || n;      // mcp__claude-in-chrome__computer → claude-in-chrome
  return n;
}

/** 묶음 요약 문구 — "claude-in-chrome 6 · 셸 5" (많은 순, 최대 3종). */
export function toolRunLabel(rows: ChatRowModel[]): string {
  const count = new Map<string, number>();
  for (const r of rows) {
    const k = toolRunName(r.msg);
    count.set(k, (count.get(k) || 0) + 1);
  }
  const top = [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const rest = count.size > 3 ? ' 외' : '';
  return top.map(([k, n]) => `${k} ${n}`).join(' · ') + rest;
}

/**
 * 표시 행 생성 — 2-pass.
 *  1) tool_result 를 toolUseId → 결과로 색인(결과는 항상 tool_use 뒤에 오므로 1-pass 로는 못 붙인다)
 *  2) 표시 대상만 순서대로 방출하고, 짝지어진 tool_result 행은 흡수(중복 표시 금지)
 * 짝을 못 찾은 tool_result(예: 스냅샷이 앞부분에서 잘려 tool_use 가 없음)는 독립 카드로 남긴다.
 */
export function buildRows(msgs: ChatMsg[]): ChatRowModel[] {
  const byToolUse = new Map<string, { r: ChatResult; seq: number }>();
  for (const m of msgs) {
    if (m.kind !== 'tool_result' || !m.result) continue;
    const id = m.result.toolUseId;
    if (id) byToolUse.set(id, { r: m.result, seq: m.seq });
  }
  const consumed = new Set<number>();
  const rows: ChatRowModel[] = [];
  for (const m of msgs) {
    if ((m.kind === 'tool_use' || m.kind === 'question') && m.tool && m.tool.id) {
      const hit = byToolUse.get(m.tool.id);
      if (hit) consumed.add(hit.seq);
      rows.push({ key: String(m.seq), msg: m, result: hit ? hit.r : undefined, resultSeq: hit ? hit.seq : undefined });
      continue;
    }
    if (m.kind === 'tool_result' && consumed.has(m.seq)) continue;
    if (!isDisplayed(m)) continue;
    rows.push({ key: String(m.seq), msg: m });
  }
  // 흡수 판정이 rows 방출보다 늦게 확정되는 경우(결과가 tool_use 앞에 색인됐지만 tool_use 행이
  //  아직 안 나온 순서) 대비 — 마지막에 한 번 더 걸러낸다.
  return groupToolRuns(rows.filter((r) => !(r.msg.kind === 'tool_result' && consumed.has(r.msg.seq))));
}

/** 연속으로 끝난 도구 행을 한 줄로 접는다(TUI 미러). 진행 중/질문 행은 건드리지 않는다. */
export function groupToolRuns(rows: ChatRowModel[]): ChatRowModel[] {
  const out: ChatRowModel[] = [];
  let run: ChatRowModel[] = [];
  const flush = () => {
    const tools = run.filter((r) => r.msg.kind === 'tool_use');
    if (tools.length >= TOOL_GROUP_MIN) {
      out.push({ key: 'g:' + run[0].key, msg: run[0].msg, group: run });
    } else {
      out.push(...run);
    }
    run = [];
  };
  for (const r of rows) {
    // ★ diff 가 붙은 편집 행은 **묶지 않는다** — TUI 도 Update 는 diff 를 펼쳐 두고 나머지(셸·조회)만
    //  "ran 5 shell commands" 로 접는다. 파일이 어떻게 바뀌었는지가 이 대화에서 가장 중요한 정보다.
    const finishedTool = r.msg.kind === 'tool_use' && !!r.result && !r.result.patch;
    if (finishedTool) { run.push(r); continue; }
    // '생각 중' 줄은 묶음을 **끊지 않는다** — 도구 사이에 섞여 들어와 run 을 토막내면 실제로는 연속인
    //  도구 10여 개가 하나도 안 접힌다(실기기 실측). 접힌 뒤 펼치면 원래 순서 그대로 보인다.
    if (r.msg.kind === 'thinking' && run.length) { run.push(r); continue; }
    flush();
    out.push(r);
  }
  flush();
  return out;
}

/**
 * "에이전트가 지금 작업 중인가" **추정** — 중단(Ctrl-C) 버튼 노출 판정에만 쓴다.
 *
 * ⚠ 추정인 이유: 기능3(데몬 agent_state push)이 아직 클라이언트까지 오지 않는다
 *   (codingpt_back/config/caps.js 의 'agentstate.v1' 은 아직 미선언 = 서버에 처리 코드 없음).
 *   그래서 트랜스크립트 모양만으로 본다:
 *    · 마지막 표시 메시지가 사람 말 → 답을 기다리는 중
 *    · 결과가 아직 안 붙은 tool_use 가 마지막 → 도구 실행 중
 *   틀려도 피해는 "중단 버튼이 잠깐 보이거나 안 보임"뿐이다(전송/표시에는 영향 없음).
 *   기능3 이 도달하면 이 함수 대신 state==='working' 을 쓰고 여기를 삭제할 것.
 */
/**
 * 이 행을 대화 내역에서 감출까 — **아직 답하지 않은 질문**만, 그리고 **도크가 그 질문을 그리고
 * 있을 때만** 감춘다(PC chat-view.js `_appendAll` 과 같은 규칙 — 한쪽만 바꾸지 말 것).
 *
 * 판정 근거는 트랜스크립트 하나다: 짝 tool_result 가 없으면 미응답 = TUI 가 질문을 계속 띄우는
 * 것과 같은 근거. (승인 요청의 toolUseId 와 대조하던 옛 규칙은 claude 의 PermissionRequest
 * 페이로드에 tool_use_id 가 없으면 통째로 빗나가, 질문이 대화와 도크에 둘 다 그려졌다.)
 * 카드가 없을 땐 감추지 않는다 — "TUI 엔 질문이 있는데 채팅엔 아무것도 없다"가 더 나쁘다.
 */
export function hiddenByQuestionCard(row: ChatRowModel, hasQuestionCard: boolean): boolean {
  return row.msg.kind === 'question' && !row.result && hasQuestionCard;
}

/**
 * TUI 로 폴백된(승인 카드가 회수된) **미응답 질문** — 채팅이 트랜스크립트 기준으로 질문 카드를
 * 다시 세우는 근거(2026-07-28 사용자 확정: "TUI 에 떠 있으면 채팅에도 떠 있어야 한다").
 *
 * 판정: **마지막 표시 행**이 결과 없는 question 이고 전체 질문 배열(questions)이 있을 때만.
 *  · 그 뒤로 대화가 이어졌다면 다이얼로그는 이미 지나간 것 — 카드를 세우면 거짓 UI 다.
 *  · questions 가 없는(구 데몬) 질문은 첫 질문밖에 몰라 조작 계획을 세울 수 없다 → 세우지 않는다.
 * 실제로 다이얼로그가 화면에 있는지는 데몬(chat.answer 의 스크린 가드)이 최종 확인한다 —
 *  여기서 틀려도 답이 엉뚱한 곳에 타이핑되는 일은 없다.
 */
export function pendingTuiQuestion(rows: ChatRowModel[]): ChatRowModel | null {
  const last = rows.length ? rows[rows.length - 1] : null;
  if (!last || last.msg.kind !== 'question' || last.result) return null;
  const qs = last.msg.questions;
  if (!qs || !qs.length || !qs.every((q) => Array.isArray(q.options) && q.options.length)) return null;
  return last;
}

export function looksBusy(rows: ChatRowModel[]): boolean {
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i];
    const m = r.msg;
    if (m.kind === 'thinking') return true;
    if (m.kind === 'tool_use' || m.kind === 'question') return !r.result;
    if (m.role === 'user' && (m.kind === 'text' || m.kind === 'slash')) return true;
    if (m.role === 'assistant' && m.kind === 'text') return false;
    if (m.kind === 'tool_result') return true; // 도구 결과 직후 = 다음 스텝 진행 중
  }
  return false;
}

export default {
  AT_BOTTOM_PX, OUTPUT_CLAMP_LINES, THINKING_LABEL, looksBusy,
  tsMs, isDisplayed, toolLabel, statusMark, statusTone, clampLines,
  mergeMessages, lastSeqOf, optimisticKey, pruneOptimistic, buildRows,
};

// ── 에이전트 상태(공식 채널) — 표시 규칙 ─────────────────────────────────────────
// ★ PC `chat-model.js` 의 같은 절과 **동시 수정 대상**(codingpt_pc/test/chat-status.mjs 가 두 구현을
//  실행 대조로 고정한다). 원천은 데몬 `agent-status.js` — claude statusLine 훅 / codex rollout 이며
//  화면 스크랩이 아니다(2026-08-03 재설계). 사용자 확정: "채팅 UI답게 새로 그리기".

/** 데몬 agent-status.js 가 내는 정규 상태. 모르는 필드는 아예 오지 않는다(모름 ≠ 0). */
export interface AgentStatusLimit { id: string; label: string; pct: number; resetsAt?: number | null }
export interface AgentStatus {
  agent?: string;
  model?: string;
  effort?: string;
  fast?: boolean;
  thinking?: boolean;
  contextPct?: number;
  contextUsed?: number;
  contextMax?: number;
  limits?: AgentStatusLimit[];
  costUsd?: number;
  linesAdded?: number;
  linesRemoved?: number;
  sessionName?: string;
  /** codex 전용 — shift+tab 축(파일 기반 원천). 알약 판정의 보조 근거. */
  planMode?: boolean;
  approvalPolicy?: string;
  source?: 'hook' | 'file';
  at?: number;
}

/** 토큰 수 → '310k' / '1.0M' / '820'. */
export function fmtTokens(n: number | null | undefined): string {
  const v = Number(n) || 0;
  if (v >= 1000000) return (v / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (v >= 1000) return Math.round(v / 1000) + 'k';
  return String(v);
}

/** epoch 초 → '3시간 21분 후 리셋' / '4일 후 리셋' / 지났으면 ''. now 는 ms. */
export function fmtReset(resetsAt: number | null | undefined, now: number): string {
  const at = Number(resetsAt) || 0;
  if (!at) return '';
  const ms = at * 1000 - (Number(now) || 0);
  if (ms <= 0) return '';
  const min = Math.floor(ms / 60000);
  if (min < 60) return `${Math.max(1, min)}분 후 리셋`;
  const h = Math.floor(min / 60);
  if (h < 24) { const m = min % 60; return m ? `${h}시간 ${m}분 후 리셋` : `${h}시간 후 리셋`; }
  // 일 단위는 **반올림**한다 — floor 면 95시간(≈4일)이 "3일 후"로 읽혀 하루를 손해 본다
  //  (경계에서 몇 초 차이로 눈금이 통째로 떨어지는 것도 같은 이유).
  return `${Math.max(1, Math.round(h / 24))}일 후 리셋`;
}

/** 상태 → 한 줄 칩 목록. **왼쪽이 더 중요**(좁으면 뒤부터 버린다). */
export function statusChips(st: AgentStatus | null | undefined): { key: string; text: string }[] {
  if (!st) return [];
  const out: { key: string; text: string }[] = [];
  if (st.model) out.push({ key: 'model', text: String(st.model) });
  if (st.contextPct != null) out.push({ key: 'ctx', text: `컨텍스트 ${st.contextPct}%` });
  for (const l of Array.isArray(st.limits) ? st.limits : []) {
    if (l && l.pct != null) out.push({ key: 'lim:' + l.id, text: `${l.label} ${l.pct}%` });
  }
  return out;
}

/** 상태 → 상세 행 목록. now 는 ms(리셋 남은 시간 계산 시점 — 데몬이 아니라 여기서 잰다). */
export function statusDetail(st: AgentStatus | null | undefined, now: number): { key: string; label: string; value: string; sub: string }[] {
  if (!st) return [];
  const rows: { key: string; label: string; value: string; sub: string }[] = [];
  if (st.contextUsed != null || st.contextPct != null) {
    const size = st.contextMax ? `${fmtTokens(st.contextUsed)} / ${fmtTokens(st.contextMax)}` : fmtTokens(st.contextUsed);
    rows.push({
      key: 'ctx', label: '컨텍스트',
      value: st.contextPct != null ? `${size} (${st.contextPct}%)` : size, sub: '',
    });
  }
  for (const l of Array.isArray(st.limits) ? st.limits : []) {
    if (!l || l.pct == null) continue;
    rows.push({ key: 'lim:' + l.id, label: `${l.label} 한도`, value: `${l.pct}%`, sub: fmtReset(l.resetsAt, now) });
  }
  const bits: string[] = [];
  if (st.costUsd != null) bits.push('$' + Number(st.costUsd).toFixed(2));
  if (st.linesAdded != null || st.linesRemoved != null) bits.push(`+${st.linesAdded || 0} / -${st.linesRemoved || 0} 줄`);
  if (bits.length) rows.push({ key: 'cost', label: '이번 세션', value: bits.join(' · '), sub: '' });
  const meta: string[] = [];
  if (st.effort) meta.push('추론 ' + st.effort);
  if (st.fast) meta.push('고속');
  if (st.approvalPolicy) meta.push('승인 ' + st.approvalPolicy);
  if (meta.length) rows.push({ key: 'meta', label: '설정', value: meta.join(' · '), sub: '' });
  return rows;
}

/** 상태 표시를 그릴 값이 하나라도 있는가(없으면 화면 미러 폴백을 쓴다). */
export function hasStatus(st: AgentStatus | null | undefined): boolean { return statusChips(st).length > 0; }
