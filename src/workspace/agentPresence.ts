// agentPresence.ts — "이 터미널 탭에 AI 에이전트가 붙어 있는가" 판정의 **순수 코어**(TUI↔Chat 토글 노출).
//
// 왜 별 파일인가: 이 판정의 두 실패는 대칭이 아니다(진단 문서 13 설계원칙).
//  · 잘못 뜬 토글 = 한 번의 무해한 오클릭(누르면 빈 트랜스크립트가 보이고 되돌아가면 끝).
//  · 잘못 사라진 토글 = 기능의 존재 자체가 사용자 인식에서 지워진다. 에러·로그 0건이라 신고도 안 된다.
//  → 그래서 **신호가 애매하면 켠다. 셸만 떠 있는 터미널이 유일한 항상-숨김 예외다.**
// 판정이 PaneView 안에 인라인으로 있으면 이 비대칭을 테스트로 고정할 수 없다(렌더 없이 못 부른다).
//
// ★ 2026-07-25 실측이 뒤집은 전제: 최신 Claude Code 의 `pane_current_command` 는 `claude` 도 `node` 도
//   아니고 **버전 문자열**이다(사용자 Mac: cmd=`2.1.219`, title=`✳ 히어로 아래에 고객 후기 섹션 추가`).
//   그래서 예전 `/^(claude|codex|gemini)$/` 단독 폴백은 **절대 매치되지 않았고**, push 가 비는 모든 순간
//   (caps `agentstate.v1` 미선언·구 데몬·채널 재접속 직후·15분 스테일·호스트 오프라인·데몬 재기동)에
//   토글이 사라졌다 — 사용자가 본 그 증상이다.
//
// 판정 근거는 데몬 `runner-core/agent-watch.js` 의 `isAgentPane()`/`titleStatus()` 와 **같은 규칙**이어야
// 한다(정본 2벌 = 이번 라운드가 잡은 사고). 앱은 데몬 JS 를 import 할 수 없으므로 아래 SHELL_CMDS /
// agentTitleStatus 는 의도된 미러다 — 데몬 쪽을 고치면 여기도 같이 고칠 것.
//
// ★★ 이 모듈은 **import 를 갖지 않는다**(값이든 `import type` 이든, 상대 경로든 패키지든).
//   PC 의 크로스구현 테스트 `codingpt_pc/test/agent-toggle.mjs` 가 이 파일을 타입만 벗겨 `data:` URL
//   모듈로 실행해 앱↔PC 사다리를 69,300 조합으로 대조하는데, import 가 하나라도 있으면 모듈 해석에
//   실패해 그 절이 **조용히 SKIP** 된다(2026-07-27 실사고: `./tiling` import 하나로 전 조합 대조가
//   사라졌다 = "초록인데 아무것도 검증하지 않는" 상태). 필요한 타입은 아래처럼 로컬 구조 타입으로 두고,
//   외부 헬퍼(tiling.isTermTab 등)는 같은 판정을 로컬로 복제하거나 호출부에서 판정해 넘긴다.

/** 와이어 agent_state 값 — agentStateStore 의 `AgentWireState` 와 **같은 집합**(import 금지 규율 때문에
 *  로컬 정의). 한쪽만 늘리면 타입체크가 즉시 잡는다(agentSnapOf 결과를 그대로 먹이는 호출부에서). */
export type AgentStateLike = 'idle' | 'working' | 'permission' | 'needsInput' | 'gone';

/** ① push 조회 결과(agentStateStore.agentSnapOf) 중 이 판정이 쓰는 부분만. */
export interface AgentPush { state: AgentStateLike }

/**
 * 터미널 목록(`terminal.list`)이 그 탭에 대해 알려주는 것 전부 — 리컨실러가 5~9초 주기로 탭에 싱크한다.
 *  · cmd   = pane_current_command (최신 claude 는 버전 문자열)
 *  · title = window_name. automatic-rename 이 켜져 있으면 **pane_title 그대로**라 에이전트 글리프가
 *            여기까지 이미 도착한다(진단 §근거 iii — 데몬 배포 없이 동작하는 유일한 폴백).
 *  · agent / agentState = 데몬이 additive 로 싣는 **정규화된 판정 결과**(있으면 1순위 폴백).
 *            ⚠ 구 데몬·구 back 에서는 **아예 안 온다** → undefined = "모름"(부정이 아니다).
 */
export interface AgentTabSignal {
  cmd?: string | null;
  title?: string | null;
  /** 데몬 정규화 신호: 에이전트 이름(문자열) | true | false(명시적 부정) | null·undefined(모름). */
  agent?: string | boolean | null;
  /** 데몬이 판별한 에이전트 이름(terminal.list.agentName) — 브랜드 판정 사다리의 최상위 pull 근거. */
  agentName?: string | null;
  agentReady?: boolean | null;
  /** 데몬이 와이어 state 까지 실어 보내는 경우(옵셔널). 'gone' = 명시적 부정. */
  agentState?: string | null;
  mode?: 'tui' | 'chat';
}

/** 판정 근거 — 진단/테스트용. 어느 사다리 칸에서 결정됐는지 그대로 드러낸다. */
export type AgentPresenceFrom =
  | 'push'       // ① 데몬 agent_state push
  | 'shell'      // 셸 확정 = 유일한 항상-숨김 예외
  | 'daemon'     // ② 데몬 정규화 신호(terminal.list) 긍정
  | 'cmd'        // ③ 구 CLI 이름 패턴
  | 'title'      // ③' 제목 글리프(데몬 미배포에서도 동작)
  | 'ambiguous'; // ④ 신호 없음(데몬의 부정 포함) → 켠다(비대칭 원칙)

export interface AgentPresence { on: boolean; from: AgentPresenceFrom }

/**
 * 셸 목록 — 데몬 `agent-watch.js:47 SHELL_CMDS` 미러(문자열 그대로).
 *  에이전트가 끝난 뒤에도 pane_title 은 스테일하게 남으므로(실측: cmd=zsh + title=`⠹ …`)
 *  이 가드가 없으면 빈 셸 탭에 제목 글리프만으로 토글이 뜬다.
 */
export const SHELL_CMDS = new Set<string>([
  'zsh', '-zsh', 'bash', '-bash', 'sh', '-sh', 'fish', '-fish', 'login', 'tcsh', '-tcsh',
]);
export function isShellCmd(cmd?: string | null): boolean {
  return SHELL_CMDS.has((cmd || '').trim());
}

/**
 * pane_title → 에이전트 상태. 데몬 `agent-watch.js:99 titleStatus()` 미러 — **확정 글리프만** 쓴다
 *  (경로·`user@host` 셸 제목은 null). 이름을 특정하진 못해도 "에이전트가 있다" 는 1급 근거다.
 */
export function agentTitleStatus(title?: string | null): 'idle' | 'working' | 'permission' | null {
  const t = String(title || '');
  if (!t) return null;
  if (t.includes('✋')) return 'permission';                 // ✋ (gemini)
  if (t.includes('✦') || t.includes('⏲')) return 'working'; // ✦ ⏲ (gemini)
  if (t.startsWith('✳')) return 'idle';                     // ✳ (claude idle)
  if (t.includes('◇')) return 'idle';                       // ◇ (gemini idle)
  if (/[⠀-⣿]/.test(t)) return 'working';                    // 점자 스피너(claude/codex 등)
  return null;
}

/**
 * ② 데몬 정규화 신호 → 3값(true=에이전트 / false=아님 / null=모름).
 *  ⚠ **null 과 false 를 절대 합치지 말 것**: 구 데몬은 필드를 아예 안 싣고(=모름 → 아래 칸으로 내려가야
 *   한다), 데몬이 `agent:null` 로 "아님"을 표현할 수도 있다. 둘을 구분할 수 없는 값(null·undefined·'')은
 *   전부 **모름**으로 접는다 — 여기서 "아님"으로 단정하면 구 데몬에서 토글이 영구 소멸한다.
 *  필드명은 데몬 담당 구현을 따르되 흔한 3가지 모양(agent 이름/부울, agentState 와이어값)을 모두 받는다.
 *  ★ `false` 는 **사다리에서 OFF 로 쓰지 않는다**(2026-07-25 교차실행으로 확정 — resolveAgentPresence
 *   주석 ★★ 참조). 3값을 유지하는 것은 진단·로그·미래 확장용이며 "긍정 근거 없음"과 구분해 두기 위함이다.
 */
export function normalizeDaemonAgentFlag(sig?: AgentTabSignal | null): boolean | null {
  if (!sig) return null;
  const st = typeof sig.agentState === 'string' ? sig.agentState.trim() : '';
  if (st) return st !== 'gone';       // 와이어 state 를 실어 보내는 데몬 — 'gone' 만 부정
  const a = sig.agent;
  if (a === true) return true;
  if (a === false) return false;
  if (typeof a === 'string') {
    const s = a.trim();
    if (!s) return null;              // 빈 문자열 = 모름(부정 아님)
    if (s === 'none' || s === 'null' || s === 'false') return false;
    return true;
  }
  return null;                        // undefined | null = 모름
}

/**
 * ③ 구 CLI 이름 패턴 — **지우지 말 것**(계약 §1.5). 최신 claude 에는 사문이지만 구 CLI·gemini·
 *  `--settings` 직접 지정·cmux PATH 경합에서는 여전히 유효한 신호다.
 *  · 'node' 는 claude 를 node 스크립트로 띄운 경우(agent-watch 의 node 규칙 미러)라 **이미 chat 모드였던
 *    탭에서만** 인정한다 — 일반 node 프로세스에 토글이 뜨는 오검을 막는 기존 규칙 그대로.
 */
export const AGENT_CMD_RE = /^(claude|codex|gemini)$/i;
export function hasAgentCmd(sig?: AgentTabSignal | null): boolean {
  if (!sig) return false;
  const cmd = (sig.cmd || '').trim();
  if (AGENT_CMD_RE.test(cmd)) return true;
  return cmd === 'node' && sig.mode === 'chat';
}

/**
 * 폴백 사다리(정본) — 위에서 아래로, 처음 결정된 칸이 답이다.
 *
 *   ①  push(agent_state)                     : 있으면 정본. state!=='gone' = 부착(idle 도 부착).
 *   —  셸 확정(pane_current_command ∈ SHELL)  : 유일한 항상-숨김 예외.
 *   ②  데몬 정규화 신호(terminal.list.agent)  : 5~9초 주기 pull. 구 데몬이면 없다(모름).
 *   ③  구 CLI 이름 패턴(tab.cmd)              : 구 CLI·gemini 호환. 최신 claude 엔 안 맞는다.
 *   ③' 제목 글리프(tab.title)                 : automatic-rename 덕에 이미 도착해 있는 신호 →
 *                                              데몬/서버 배포 0으로도 최신 claude 를 잡는다.
 *   ④  전부 없음(데몬의 부정 포함)             : **켠다.** 근거 = 위 비대칭. cmd 가 `2.1.219` 같은 미상
 *                                              문자열이거나(=CLAUDE_CODE_DISABLE_TERMINAL_TITLE 로 제목이
 *                                              영구 부재인 환경) 목록이 아직 도착하지 않은 순간(cmd 미상,
 *                                              호스트 오프라인이면 영구)에도 토글은 살아 있어야 한다.
 *                                              대가는 빈 셸 탭 옆의 다른 프로세스(vim·npm 등)에도 토글이
 *                                              뜨는 것 = 무해한 오클릭.
 *
 * ★★ 데몬의 `agent:false` 를 OFF 로 쓰지 않는 이유(2026-07-25 교차실행으로 확정 — 결함 #2):
 *   데몬 `agent-watch.agentSignalOf` 는 **두 가지 다른 사실을 같은 `false` 로 접어 보낸다**:
 *   (i) 셸 확정(진짜 부정) (ii) "부착 레코드도 없고 제목 글리프도 못 봤다" = **모름**.
 *   (ii) 에는 claude 가 멀쩡히 도는 순간이 다수 들어간다 — `/resume`·`agents` 화면, 폴더 신뢰 확인,
 *   `CLAUDE_CODE_DISABLE_TERMINAL_TITLE=1`, `showStatusInTerminalTab`(noPrefix), cursor-agent
 *   (제목 글리프 없음 + cmd=`2025.09.18-…`). 이걸 OFF 로 믿으면 **claude 가 도는 터미널에서 토글이
 *   사라진다 = 사용자 신고 증상 그 자체**다(실측: 데몬 행을 이 사다리에 먹여 13 시나리오 중 8건 OFF).
 *   (i) 은 이 사다리가 이미 위 칸(셸 확정)에서 잡는다 — 목록 행은 `agent` 와 `cmd` 를 **같은 스냅샷**에서
 *   싣기 때문에 데몬이 부정할 때 cmd 도 항상 함께 온다. 그래서 부정 칸을 지워도 잃는 OFF 가 없다.
 *   부수 효과로 앱(데몬 행)과 PC(Rust 목록 = agent 필드 구조적 부재 → 항상 '모름')의 **최종 노출이
 *   같아진다** — 같은 터미널을 두고 PC 는 보이고 폰은 숨던 비대칭이 이 한 줄로 닫힌다.
 *
 * ★ 깜빡임(요구 4) — 이 순서가 곧 안정성 보장이다:
 *   (a) ① 이 사라지는 사건(15분 스테일·채널 재접속 전량 폐기·호스트 오프라인·데몬 재기동)은 ②③③'④ 중
 *       어느 것도 건드리지 않는다. ④ 가 기본 ON 이므로 **①→② 하강 전이에서 OFF 가 나올 수 없다**
 *       (유일한 OFF 는 셸 확정 = "정말 에이전트가 없다"는 새 정보다).
 *   (b) ② 가 늦게 도착하는(구 데몬→신 데몬 배포) 상승 전이도 ON→ON 이라 무변화.
 *   (c) 셸 확정을 ① 보다 **아래**에 둔 이유도 깜빡임이다: 목록은 5~9초 스냅샷이라 claude 기동 직전/직후
 *       한 틱 동안 cmd=zsh 로 보일 수 있는데, 그때 push('working')를 셸로 덮으면 토글이 1틱 사라진다.
 *       반대 방향(에이전트 종료)은 데몬이 셸 복귀를 관찰해 2초 안에 'gone' 을 보내므로(계약 §1.3) 셸
 *       탭에 push 가 남아 있는 창은 짧고, 남더라도 "무해한 오클릭" 쪽이다.
 *   (d) sticky("한 번 본 에이전트를 기억")는 **일부러 넣지 않았다** — ④ 가 기본 ON 이므로 기억이 필요한
 *       OFF 구간이 존재하지 않는다(sticky ⊂ 기본 ON). 렌더 경로에 상태를 더하면 useSyncExternalStore
 *       getSnapshot 순수성만 깨진다.
 */
export function resolveAgentPresence(input: {
  push?: AgentPush | null;
  tab?: AgentTabSignal | null;
}): AgentPresence {
  const push = input.push || null;
  const tab = input.tab || null;
  if (push) return { on: push.state !== 'gone', from: 'push' };
  if (isShellCmd(tab && tab.cmd)) return { on: false, from: 'shell' };
  const flag = normalizeDaemonAgentFlag(tab);
  if (flag === true) return { on: true, from: 'daemon' };
  if (hasAgentCmd(tab)) return { on: true, from: 'cmd' };
  if (agentTitleStatus(tab && tab.title) != null) return { on: true, from: 'title' };
  // flag === false(데몬 부정)는 여기서 멈추지 않고 ④ 로 내려간다 — 위 ★★ 항 참조.
  return { on: true, from: 'ambiguous' };
}

/**
 * 토글 노출 최종 판정 — 유지해야 하는 기존 규칙 3개(PaneView 주석 정본)를 그대로 담는다.
 *  · 혼합 탭(IDE/프리뷰)에서는 숨김 — 요구사항 자체가 "터미널 탭에서만"(의도된 동작).
 *  · win 미확정('new')이면 숨김 — chat 스냅샷 키 (cwd,tid) 가 아직 없다.
 *  · mode==='chat' 이면 에이전트가 사라져도 유지 — TUI 로 돌아갈 길을 사용자 의사 없이 없애지 않는다.
 */
export function resolveToggleVisible(input: {
  isTerm: boolean;
  win: number | 'new' | null | undefined;
  chatMode: boolean;
  agentOn: boolean;
  chatReady?: boolean;
}): boolean {
  if (!input.isTerm) return false;
  if (typeof input.win !== 'number') return false;
  if (input.chatReady === false && !input.chatMode) return false;
  return input.agentOn || input.chatMode;
}

/** Claude/Codex는 SessionStart 전(프로젝트 신뢰 질문 포함)에는 Chat 진입을 막는다. */
export function resolveChatReady(input: {
  push?: { state?: string; agent?: string | null; sessionId?: string | null } | null;
  tab?: AgentTabSignal | null;
} | null | undefined): boolean {
  const brand = resolveAgentBrand(input);
  if (brand !== 'claude' && brand !== 'codex') return true;
  const push = input?.push || null;
  const tab = input?.tab || null;
  return !!(String(push?.sessionId || '').trim() || tab?.agentReady === true);
}

/**
 * **어떤** 에이전트인가 — 탭 좌측 로고용(2026-07-27 요청). 'claude'|'codex'|'gemini'|null.
 *  ★ PC `agent-signal.js resolveAgentBrand` 의 미러 — 사다리·경계·정규식까지 같아야 하고
 *    `codingpt_pc/test/agent-toggle.mjs` 가 이 함수 본문을 오려내 전 조합을 대조한다.
 *
 * `resolveAgentPresence`(있나?)와 **실패 비대칭이 반대**라서 일부러 분리했다:
 *  · 노출 판정은 애매하면 켠다(사라진 토글 = 기능이 인식에서 지워진다).
 *  · 로고 판정은 애매하면 **모른다고 답한다** — 모양은 사실 주장이라, codex 터미널에 claude 로고를
 *    그리면 표시 정직성 위반이다. null 이면 호출측이 기본 터미널 글리프를 쓴다.
 */
export const AGENT_BRANDS = ['claude', 'codex', 'gemini'];
const SEMVER_CMD_RE = /^\d+\.\d+\.\d+$/;

export function resolveAgentBrand(input: {
  push?: { state?: string; agent?: string | null } | null;
  tab?: AgentTabSignal | null;
} | null | undefined): string | null {
  const push = (input && input.push) || null;
  const tab = (input && input.tab) || null;
  const named = (v: unknown): string | null => {
    const s = String(v == null ? '' : v).trim().toLowerCase();
    return AGENT_BRANDS.includes(s) ? s : null;
  };
  if (push) { const n = named(push.agent); if (n) return n; }
  if (tab) {
    // 데몬이 terminal.list 에 실어 보내는 정규화 이름 — push 다음으로 정확하다.
    const dn = named(tab.agentName); if (dn) return dn;
    const n = named(tab.agent); if (n) return n;
    const c = named(tab.cmd); if (c) return c;
    const t = String(tab.title || '');
    if (t.startsWith('✳')) return 'claude';
    if (t.includes('✦') || t.includes('◇') || t.includes('✋')) return 'gemini';
    if (SEMVER_CMD_RE.test(String(tab.cmd || '').trim())) return 'claude';
  }
  return null;
}

/**
 * 탭 객체(구조 타입) — `tiling.TerminalTab` 중 이 모듈이 읽는 필드만. **import 금지 규율**(위 ★★) 때문에
 *  타입도 로컬로 둔다. TerminalTab 은 이 형태를 구조적으로 만족하므로 호출부는 그대로 넘기면 된다.
 */
export interface AgentTabLike {
  agentName?: string | null;
  agentReady?: boolean | null;
  /** 혼합 탭 구분 — 미지정 = 터미널 탭(하위호환). tiling.isTermTab 과 **같은 판정**을 아래에서 복제한다. */
  kind?: 'term' | 'ide' | 'preview';
  cmd?: string;
  title?: string;
  agent?: string | boolean | null;
  agentState?: string | null;
  mode?: 'tui' | 'chat';
}

/** 터미널(tmux window) 탭인가 — `tiling.isTermTab` 의 의도된 미러(한쪽만 고치면 판정이 갈린다). */
export function isTermTabLike(t?: AgentTabLike | null): boolean {
  return !!t && (!t.kind || t.kind === 'term');
}

/**
 * 탭 객체 → 이 판정이 쓰는 목록 신호만 추린 뷰(리컨실러가 탭에 싱크한 값 그대로).
 *
 * ★ 두 곳이 같은 재료를 봐야 한다: pane 본문(PaneView 의 chat 레이어)과 **메인 영역 헤더의 토글**
 *  (WorkspaceView — 포커스 pane 의 활성 탭을 rt.layout+focusId 로 직접 읽는다). 각자 필드를 고르면
 *  한쪽에만 새 신호가 들어와 "PC 에선 보이는데 폰 헤더에선 안 보이는" 비대칭이 다시 생긴다.
 */
export function agentSigOf(t?: AgentTabLike | null): AgentTabSignal | null {
  if (!isTermTabLike(t) || !t) return null;
  return { cmd: t.cmd, title: t.title, agent: t.agent, agentName: t.agentName, agentReady: t.agentReady, agentState: t.agentState, mode: t.mode };
}

/** 이 탭의 표시 모드 — 미지정/비터미널 탭 = 'tui'. mode==='chat' 은 에이전트가 사라져도 유지한다(§6-4 (a)). */
export function tabModeOf(t?: AgentTabLike | null): 'tui' | 'chat' {
  return isTermTabLike(t) && t?.mode === 'chat' ? 'chat' : 'tui';
}

export default {
  SHELL_CMDS, isShellCmd, agentTitleStatus, normalizeDaemonAgentFlag,
  AGENT_CMD_RE, hasAgentCmd, resolveAgentPresence, resolveToggleVisible, resolveChatReady,
  agentSigOf, tabModeOf, isTermTabLike, AGENT_BRANDS, resolveAgentBrand,
};
