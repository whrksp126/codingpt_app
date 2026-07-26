// Chat 토글 노출 판정 — 폴백 사다리 각 칸을 순수 로직으로 고정한다.
//
// 왜 필요한가: 사용자 신고는 "claude 를 돌리는데 어떨 땐 토글이 있고 어떨 땐 없다" 였고, 원인은
//  ① push(agent_state)가 비는 순간(caps 미선언·구 데몬·채널 재접속·15분 스테일·호스트 오프라인·데몬
//  재기동)에 폴백으로 내려가는데 ② 그 폴백(`/^(claude|codex|gemini)$/`)이 최신 Claude Code 에서
//  **절대 매치되지 않는다**는 것이었다(실측: cmd=`2.1.219`, title=`✳ …`). 두 실패 모두 에러·로그가
//  0건이라 테스트만이 재발을 막는다.
//
// 아래 입력값은 전부 **실측 문자열**을 쓴다 — 자기 구현으로 만든 예쁜 값을 넣으면 단위테스트는 초록인데
// 와이어에서 갈리는 과거 사고를 반복한다(agentState.test.ts 와 같은 규율).
import {
  resolveAgentPresence, resolveToggleVisible, isShellCmd, agentTitleStatus,
  normalizeDaemonAgentFlag, hasAgentCmd, SHELL_CMDS,
} from '../src/workspace/agentPresence';

// ── 실측 신호 ──
const CMD_MODERN = '2.1.219';                        // 최신 Claude Code 의 pane_current_command(실측)
const TITLE_WORKING_GLYPH = '⠹ 히어로 섹션 다듬는 중'; // 점자 스피너(claude/codex working)
const TITLE_IDLE_GLYPH = '✳ 히어로 아래에 고객 후기 섹션 추가'; // claude idle(실측)
const TITLE_SHELL = 'whrksp126@Mac-mini codingpt';   // 글리프 없는 셸 제목

describe('① push(agent_state) — 있으면 정본', () => {
  it("push 만 있으면(목록 신호 0) 켠다 — idle 도 '부착'이다", () => {
    expect(resolveAgentPresence({ push: { state: 'idle' }, tab: null })).toEqual({ on: true, from: 'push' });
    expect(resolveAgentPresence({ push: { state: 'working' }, tab: null }).on).toBe(true);
    expect(resolveAgentPresence({ push: { state: 'permission' }, tab: null }).on).toBe(true);
    expect(resolveAgentPresence({ push: { state: 'needsInput' }, tab: null }).on).toBe(true);
  });

  it("'gone' push 는 끈다(스토어는 삭제하지만 방어적으로 같은 규칙)", () => {
    expect(resolveAgentPresence({ push: { state: 'gone' }, tab: null })).toEqual({ on: false, from: 'push' });
  });

  it('목록 스냅샷이 한 틱 늦어 cmd=zsh 로 보여도 push 를 덮지 않는다(깜빡임 방지 (c))', () => {
    const r = resolveAgentPresence({ push: { state: 'working' }, tab: { cmd: 'zsh', title: TITLE_SHELL } });
    expect(r).toEqual({ on: true, from: 'push' });
  });
});

describe('② 데몬 정규화 신호(terminal.list) — push 가 없을 때의 1순위', () => {
  it('agent 이름 문자열만 있으면 켠다(cmd 는 버전 문자열, 제목 글리프도 없음)', () => {
    const r = resolveAgentPresence({ push: null, tab: { cmd: CMD_MODERN, title: '터미널 1', agent: 'claude' } });
    expect(r).toEqual({ on: true, from: 'daemon' });
  });

  it('agent:true / agentState 와이어값도 같은 칸으로 받는다(필드 모양 방어)', () => {
    expect(resolveAgentPresence({ push: null, tab: { cmd: CMD_MODERN, agent: true } }).from).toBe('daemon');
    expect(resolveAgentPresence({ push: null, tab: { cmd: CMD_MODERN, agentState: 'working' } }).from).toBe('daemon');
  });

  it("★ 데몬의 부정(agent:false)은 OFF 로 쓰지 않는다 — 데몬은 '모름'도 false 로 접어 보낸다", () => {
    // 배포된 데몬(pty.js:110 `agent: sig.on`)은 셸 확정과 "근거 0"을 **같은 false** 로 보낸다.
    //  "근거 0" 에는 claude 가 멀쩡히 도는 순간이 다수 들어간다(/resume 화면·제목 비활성 env·훅 미설치·
    //  데몬 재기동 직후·cursor-agent) → OFF 로 믿으면 사용자 신고 증상 그 자체가 된다.
    //  진짜 부정(셸)은 위 칸(셸 확정)이 같은 스냅샷의 cmd 로 이미 잡으므로 잃는 OFF 가 없다.
    expect(resolveAgentPresence({ push: null, tab: { cmd: 'vim', agent: false } })).toEqual({ on: true, from: 'ambiguous' });
    expect(resolveAgentPresence({ push: null, tab: { cmd: 'vim', agentState: 'gone' } })).toEqual({ on: true, from: 'ambiguous' });
    // 셸이면 데몬 부정과 무관하게 OFF(근거는 cmd) — 이 한 칸이 유일한 항상-숨김이다.
    expect(resolveAgentPresence({ push: null, tab: { cmd: 'zsh', agent: false } })).toEqual({ on: false, from: 'shell' });
  });

  it('★ 필드 부재(구 데몬/구 back)는 "아님"이 아니라 "모름" — false 로 접으면 토글이 영구 소멸한다', () => {
    expect(normalizeDaemonAgentFlag({ cmd: CMD_MODERN })).toBeNull();
    expect(normalizeDaemonAgentFlag({ cmd: CMD_MODERN, agent: null })).toBeNull();
    expect(normalizeDaemonAgentFlag({ cmd: CMD_MODERN, agent: '' })).toBeNull();
    expect(normalizeDaemonAgentFlag({ cmd: CMD_MODERN, agentState: null })).toBeNull();
    expect(normalizeDaemonAgentFlag(null)).toBeNull();
    expect(normalizeDaemonAgentFlag({ cmd: CMD_MODERN, agent: 'claude' })).toBe(true);
    expect(normalizeDaemonAgentFlag({ cmd: CMD_MODERN, agent: false })).toBe(false);
  });

  it("데몬 부정보다 제목 글리프가 먼저다 — 데몬 판정이 한 틱 늦어도 켜진 채로 남는다", () => {
    const r = resolveAgentPresence({ push: null, tab: { cmd: CMD_MODERN, title: TITLE_WORKING_GLYPH, agent: false } });
    expect(r).toEqual({ on: true, from: 'title' });
  });
});

describe('③ 구 CLI 이름 패턴(tab.cmd) — 지우면 gemini/구 CLI 가 죽는다', () => {
  it('claude/codex/gemini 이름은 그대로 인정(대소문자 무관)', () => {
    expect(resolveAgentPresence({ push: null, tab: { cmd: 'claude' } })).toEqual({ on: true, from: 'cmd' });
    expect(resolveAgentPresence({ push: null, tab: { cmd: 'Gemini' } }).from).toBe('cmd');
    expect(hasAgentCmd({ cmd: 'codex' })).toBe(true);
  });

  it("'node' 는 이미 chat 모드였던 탭에서만 인정(기존 규칙 보존)", () => {
    expect(hasAgentCmd({ cmd: 'node', mode: 'chat' })).toBe(true);
    expect(hasAgentCmd({ cmd: 'node', mode: 'tui' })).toBe(false);
  });
});

describe("③' 제목 글리프(tab.title) — 데몬/서버 배포 0으로 최신 claude 를 잡는 칸", () => {
  it('점자 스피너·✳·gemini 글리프를 데몬 titleStatus() 와 같은 규칙으로 읽는다', () => {
    expect(agentTitleStatus(TITLE_WORKING_GLYPH)).toBe('working');
    expect(agentTitleStatus(TITLE_IDLE_GLYPH)).toBe('idle');
    expect(agentTitleStatus('✋ 승인 대기')).toBe('permission');
    expect(agentTitleStatus('✦ 생각 중')).toBe('working');
    expect(agentTitleStatus('◇ 대기')).toBe('idle');
    expect(agentTitleStatus(TITLE_SHELL)).toBeNull();
    expect(agentTitleStatus('')).toBeNull();
    expect(agentTitleStatus(undefined)).toBeNull();
  });

  it('사용자 신고 케이스 정면 재현: push 없음 + cmd=2.1.219 + 제목 글리프 → 켜진다', () => {
    const r = resolveAgentPresence({ push: null, tab: { cmd: CMD_MODERN, title: TITLE_IDLE_GLYPH } });
    expect(r).toEqual({ on: true, from: 'title' });
  });
});

describe('④ 전부 없음 — 애매하면 켠다(비대칭 원칙)', () => {
  it('cmd 가 미상 문자열이고 제목 글리프도 없으면 켠다(제목 비활성 환경/훅 미설치)', () => {
    // ★ 입력은 **배포된 데몬이 실제로 보내는 행 그대로**여야 한다 — 그 환경의 목록 행은
    //  `{cmd, name, agent:false, agentState:null}` 이다(pty.js:110 · agent-watch.agentSignalOf 의 off).
    //  agent 필드를 뺀 예쁜 입력으로만 테스트하면 "이름은 맞는데 환경을 재현하지 못한 초록"이 된다
    //  (2026-07-25 교차검증 적출 — 합성 대조는 crossImplToggle.test.ts).
    const r = resolveAgentPresence({ push: null, tab: { cmd: CMD_MODERN, title: '터미널 1', agent: false, agentState: null } });
    expect(r).toEqual({ on: true, from: 'ambiguous' });
    // 같은 환경의 다른 순간들(claude /resume·agents 화면, 폴더 신뢰 확인)도 전부 켜진 채여야 한다.
    for (const title of ['claude · resume', 'claude agents', 'codingpt-demo']) {
      expect(resolveAgentPresence({ push: null, tab: { cmd: CMD_MODERN, title, agent: false, agentState: null } }).on).toBe(true);
    }
  });

  it('목록이 아직 도착하지 않은 순간(cmd 미상, 호스트 오프라인이면 영구)도 켠다', () => {
    expect(resolveAgentPresence({ push: null, tab: {} })).toEqual({ on: true, from: 'ambiguous' });
    expect(resolveAgentPresence({ push: null, tab: null })).toEqual({ on: true, from: 'ambiguous' });
    expect(resolveAgentPresence({})).toEqual({ on: true, from: 'ambiguous' });
  });
});

describe('셸 — 유일한 항상-숨김 예외', () => {
  it('셸 확정이면 스테일 제목 글리프가 남아 있어도 끈다(에이전트 종료 후 pane_title 잔존 실측)', () => {
    const r = resolveAgentPresence({ push: null, tab: { cmd: 'zsh', title: TITLE_WORKING_GLYPH } });
    expect(r).toEqual({ on: false, from: 'shell' });
  });

  it('데몬 agent 신호가 긍정이어도 셸이면 끈다(순서: 셸 > ②③③\'④)', () => {
    expect(resolveAgentPresence({ push: null, tab: { cmd: '-bash', agent: 'claude' } }).from).toBe('shell');
  });

  it('셸 목록은 데몬 agent-watch.js SHELL_CMDS 미러 — 로그인 셸(-) 형태까지', () => {
    for (const s of ['zsh', '-zsh', 'bash', '-bash', 'sh', '-sh', 'fish', '-fish', 'login', 'tcsh', '-tcsh']) {
      expect(SHELL_CMDS.has(s)).toBe(true);
      expect(isShellCmd(` ${s} `)).toBe(true); // 목록은 trim 되지만 방어
    }
    expect(isShellCmd('vim')).toBe(false);
    expect(isShellCmd(undefined)).toBe(false);
  });
});

describe('깜빡임 금지 — ①→② 하강 전이에서 OFF 가 나올 수 없다', () => {
  // 같은 탭 신호를 고정한 채 push 만 사라지게 한다(15분 스테일·채널 재접속 전량 폐기·호스트 오프라인·
  //  데몬 재기동은 전부 "push 가 null 이 된다" 라는 같은 사건이다).
  const cases: Array<[string, { cmd?: string; title?: string; agent?: string | boolean | null }]> = [
    ['데몬 신호 있음', { cmd: CMD_MODERN, agent: 'claude' }],
    ['제목 글리프만', { cmd: CMD_MODERN, title: TITLE_IDLE_GLYPH }],
    ['구 CLI 이름만', { cmd: 'claude' }],
    ['아무 신호 없음', { cmd: CMD_MODERN }],
    ['목록 미도착', {}],
  ];
  for (const [label, tab] of cases) {
    it(`${label}: push 있음 → 없음 전이에서 계속 켜져 있다`, () => {
      expect(resolveAgentPresence({ push: { state: 'working' }, tab }).on).toBe(true);
      expect(resolveAgentPresence({ push: null, tab }).on).toBe(true);
    });
  }

  it('반대 방향(② → ①)도 ON→ON', () => {
    const tab = { cmd: CMD_MODERN, agent: 'claude' };
    expect(resolveAgentPresence({ push: null, tab }).on).toBe(true);
    expect(resolveAgentPresence({ push: { state: 'idle' }, tab }).on).toBe(true);
  });
});

describe('유지해야 하는 노출 규칙 3개(PaneView 정본)', () => {
  it('혼합 탭(IDE/프리뷰)에서는 에이전트가 있어도 숨김 — 의도된 동작', () => {
    expect(resolveToggleVisible({ isTerm: false, win: 1000123, chatMode: false, agentOn: true })).toBe(false);
    expect(resolveToggleVisible({ isTerm: false, win: 1000123, chatMode: true, agentOn: true })).toBe(false);
  });

  it("win 미확정('new'/미정)이면 숨김 — chat 스냅샷 키 (cwd,tid) 가 없다", () => {
    expect(resolveToggleVisible({ isTerm: true, win: 'new', chatMode: false, agentOn: true })).toBe(false);
    expect(resolveToggleVisible({ isTerm: true, win: undefined, chatMode: true, agentOn: true })).toBe(false);
    expect(resolveToggleVisible({ isTerm: true, win: null, chatMode: false, agentOn: true })).toBe(false);
  });

  it("mode==='chat' 이면 에이전트가 사라져도 유지 — TUI 로 돌아갈 길", () => {
    expect(resolveToggleVisible({ isTerm: true, win: 1000123, chatMode: true, agentOn: false })).toBe(true);
  });

  it('셸 터미널(에이전트 없음, chat 아님)은 숨김 — 사다리 결과가 그대로 반영된다', () => {
    const on = resolveAgentPresence({ push: null, tab: { cmd: 'zsh', title: TITLE_SHELL } }).on;
    expect(resolveToggleVisible({ isTerm: true, win: 1000123, chatMode: false, agentOn: on })).toBe(false);
  });

  it('claude 가 도는 터미널 탭은 신호 조합과 무관하게 항상 보인다(사용자 요구 정면)', () => {
    const tabs = [
      { cmd: CMD_MODERN, title: TITLE_IDLE_GLYPH },                    // 오늘(데몬 미배포)
      { cmd: CMD_MODERN, title: TITLE_IDLE_GLYPH, agent: 'claude' },   // 데몬 배포 후
      { cmd: 'claude' },                                               // 구 CLI
      { cmd: CMD_MODERN },                                            // 제목 비활성 환경
      // ↓ 배포된 데몬이 그 환경에서 **실제로 보내는 행**(근거 0 → agent:false). 이 두 줄이 없으면
      //  스위트는 초록인데 실기기에서만 토글이 사라진다(2026-07-25 적출).
      { cmd: CMD_MODERN, title: '터미널 1', agent: false, agentState: null },
      { cmd: CMD_MODERN, title: 'claude · resume', agent: false, agentState: null },
    ];
    for (const tab of tabs) {
      for (const push of [null, { state: 'working' as const }, { state: 'idle' as const }]) {
        const on = resolveAgentPresence({ push, tab }).on;
        expect(resolveToggleVisible({ isTerm: true, win: 1000123, chatMode: false, agentOn: on })).toBe(true);
      }
    }
  });
});
