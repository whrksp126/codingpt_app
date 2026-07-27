// crossImplToggle.test.ts — Chat 토글 판정의 **경계 합성** 대조(데몬 → 목록 행 → 앱 사다리)와
// 앱↔PC 대칭 핀.
//
// 왜 이 파일이 따로 있는가(2026-07-25 교차검증 적출):
//  세 패키지의 스위트가 전부 초록인데 실기기에서만 토글이 사라졌다. 원인은 **아무도 데몬의 실제 목록
//  행을 클라 사다리에 먹이지 않았다**는 것이다 — 앱 단위테스트는 `agent` 필드가 아예 없는(배포된 데몬이
//  절대 만들지 않는) 입력으로 ④ ambiguous 를 박았고, PC 교차구현 테스트는 `agent` 불리언 합성을 대조
//  범위에서 명시적으로 제외했다. 그래서 여기서는 데몬 모듈을 **그대로 require 해서** 판정을 받고,
//  `pty.js listTerminals` 의 행 매핑과 앱 리컨실러의 탭 싱크를 그대로 재현해 사다리에 먹인다.
//  (데몬은 기동하지 않는다 — 이 Mac 에서 데몬 추가 기동 금지. 순수 함수만 부른다.)
//
// 형제 리포(codingpt_service)가 없는 단독 체크아웃에서는 해당 절을 건너뛴다(다른 절은 계속 돈다).
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

import { resolveAgentPresence, resolveToggleVisible, SHELL_CMDS as T_SHELLS } from '../src/workspace/agentPresence';
import * as T from '../src/workspace/tiling';

// 앱 SHELL_CMDS 를 그대로 자식 프로세스에 넘겨 데몬 판정과 대조한다(한쪽만 늘리면 판정이 갈린다).
const SHELLS = [...T_SHELLS];

const SERVICE = path.resolve(__dirname, '../../codingpt_service');
const WATCH = path.join(SERVICE, 'codingpt_daemon/packages/runner-core/agent-watch.js');
const PC_CSS = path.join(SERVICE, 'codingpt_pc/src/styles.css');
const PC_SIGNAL = path.join(SERVICE, 'codingpt_pc/src/js/agent-signal.js');
const PC_STATE = path.join(SERVICE, 'codingpt_pc/src/js/state.js');

// pty.js listTerminals 의 행 매핑(:144-148) 그대로 — 4필드는 additive.
type Row = { command: string; name: string; agent: boolean; agentName: string | null; agentState: string | null };

// 이 케이스 표가 곧 "데몬이 실제로 만들어 내는 목록 행" 의 정의역이다(실측 값 위주).
const CASES: Array<[string, string]> = [
  // claude 가 도는데 제목 글리프가 없는 순간들 — 데몬 판정이 근거 0(= agent:false)으로 내려간다.
  //  (CLAUDE_CODE_DISABLE_TERMINAL_TITLE·showStatusInTerminalTab·/resume·agents·폴더 신뢰 확인·훅 미설치)
  ['2.1.219', '터미널 1'],
  ['2.1.219', 'codingpt-demo'],
  ['2.1.219', 'claude · resume'],
  ['2.1.219', 'claude agents'],
  ['2.1.219', ''],
  // 제목 글리프가 있는 순간(데몬이 긍정을 싣는다)
  ['2.1.219', '✳ 히어로 아래에 고객 후기 섹션 추가'],
  ['2.1.219', '⠹ 작업 중'],
  // 빈 셸(유일한 항상-숨김) — 스테일 글리프가 남은 경우까지
  ['zsh', 'codingpt-demo'],
  ['zsh', '⠹ 작업 중'],
  ['-bash', 'codingpt-demo'],
  // cursor-agent [실측 cmd] — 제목 글리프 없음
  ['2025.09.18-7ae6800', 'codingpt-demo'],
];

/**
 * 데몬 판정을 **자식 Node 프로세스**에서 한 번에 받아 온다 — 이유 두 가지:
 *  ① jest 로 require 하면 리포 밖 CJS 에 babel 변환이 걸려 실행 자체가 안 된다(@babel/runtime 부재).
 *  ② 데몬 모듈은 배포되는 형태 그대로(변환 0) 돌아야 판정이 의미가 있다.
 * 데몬을 **기동하지 않는다** — 순수 함수(agentSignalOf/isAgentPane)만 부르고 즉시 끝난다.
 */
function daemonProbe(): { rows: Row[]; shellsAllFalse: boolean } {
  const script = `
    const W = require(${JSON.stringify(WATCH)});
    const cases = ${JSON.stringify(CASES)};
    const rows = cases.map(([cmd, title], i) => {
      const s = W.agentSignalOf('ns--t-' + (1000001 + i), cmd, title) || {};
      // pty.js listTerminals(:144-148) 의 행 매핑 그대로
      return { command: String(cmd || '').trim(), name: title,
               agent: !!s.on, agentName: s.agent || null, agentState: s.state || null };
    });
    const shells = ${JSON.stringify(SHELLS)};
    const shellsAllFalse = shells.every((c) => W.isAgentPane(c, 'working', true) === false);
    process.stdout.write(JSON.stringify({ rows, shellsAllFalse }));
  `;
  return JSON.parse(execFileSync(process.execPath, ['-e', script], { encoding: 'utf8' }));
}
// 앱 리컨실러(WorkspaceShellContext.tsx:204-209)가 탭에 싱크하는 모양 그대로.
const tabOf = (w: Row) => ({
  cmd: w.command, title: w.name,
  agent: w.agent === undefined ? undefined : w.agent,
  agentState: typeof w.agentState === 'string' ? w.agentState : undefined,
});

const haveDaemon = fs.existsSync(WATCH);
const d = haveDaemon ? describe : describe.skip;

d('데몬 실물 판정 → terminal.list 행 → 앱 사다리 (경계 합성)', () => {
  const probe = haveDaemon ? daemonProbe() : { rows: [] as Row[], shellsAllFalse: false };
  const at = (cmd: string, title: string) => {
    const row = probe.rows.find((r) => r.command === cmd.trim() && r.name === title);
    if (!row) throw new Error(`케이스 표에 없는 조합: ${cmd} / ${title}`);
    return { row, presence: resolveAgentPresence({ push: null, tab: tabOf(row) }) };
  };

  // ★ claude 가 도는 순간들 — 제목 글리프가 없어 데몬 판정이 `agent:false` 로 내려가는 경우가 핵심이다.
  it('claude 가 도는데 근거가 0 인 순간(데몬이 agent:false 를 싣는다)에도 토글은 켜져 있다', () => {
    for (const title of ['터미널 1', 'codingpt-demo', 'claude · resume', 'claude agents', '']) {
      const { row, presence } = at('2.1.219', title);
      // 데몬이 정말 부정을 싣고 있음을 먼저 단언한다(= 배포된 데몬이 만드는 입력임을 증명).
      expect({ title, agent: row.agent, agentState: row.agentState }).toEqual({ title, agent: false, agentState: null });
      expect({ title, ...presence }).toEqual({ title, on: true, from: 'ambiguous' });
    }
  });

  it('제목 글리프가 있으면 데몬이 긍정을 실어 보내고 사다리는 ② 칸에서 켠다', () => {
    expect(at('2.1.219', '✳ 히어로 아래에 고객 후기 섹션 추가').presence).toEqual({ on: true, from: 'daemon' });
    expect(at('2.1.219', '⠹ 작업 중').presence).toEqual({ on: true, from: 'daemon' });
  });

  it('빈 셸은 데몬·클라 양쪽이 OFF(스테일 글리프가 남아 있어도) — 직전 라운드 blocker', () => {
    expect(at('zsh', 'codingpt-demo').presence).toEqual({ on: false, from: 'shell' });
    expect(at('zsh', '⠹ 작업 중').presence).toEqual({ on: false, from: 'shell' });
    expect(at('-bash', 'codingpt-demo').presence).toEqual({ on: false, from: 'shell' });
  });

  it('cursor-agent(제목 글리프 없음 + 버전 문자열 cmd)도 켜진 채로 남는다', () => {
    expect(at('2025.09.18-7ae6800', 'codingpt-demo').presence.on).toBe(true);
  });

  it('최종 노출까지 합성 — claude 가 도는 터미널 탭은 목록이 어떤 값으로 와도 보인다', () => {
    for (const title of ['터미널 1', '✳ 히어로 아래에 고객 후기 섹션 추가', 'claude · resume']) {
      const on = at('2.1.219', title).presence.on;
      expect(resolveToggleVisible({ isTerm: true, win: 1000123, chatMode: false, agentOn: on })).toBe(true);
    }
  });

  it('데몬도 셸이면 어떤 제목/과거 신호가 있어도 false — 셸 목록 동치', () => {
    expect(probe.shellsAllFalse).toBe(true);
    for (const c of SHELLS) expect(T_SHELLS.has(c)).toBe(true);
  });
});

const havePc = fs.existsSync(PC_CSS) && fs.existsSync(PC_SIGNAL) && fs.existsSync(PC_STATE);
const p = havePc ? describe : describe.skip;

p('앱 ↔ PC 대칭 핀(소스 수준)', () => {
  const css = havePc ? fs.readFileSync(PC_CSS, 'utf8') : '';
  const signal = havePc ? fs.readFileSync(PC_SIGNAL, 'utf8') : '';
  const state = havePc ? fs.readFileSync(PC_STATE, 'utf8') : '';
  const num = (re: RegExp, s: string) => { const m = re.exec(s); return m ? Number(m[1]) : null; };
  // ModeToggle 은 **소스 텍스트로** 읽는다 — import 하면 reanimated(ESM)까지 끌려와 이 스위트가
  //  네이티브 의존성에 묶인다(PC test/agent-toggle.mjs 가 앱 값을 정규식으로 읽는 것과 같은 이유).
  const mt = fs.readFileSync(path.resolve(__dirname, '../src/workspace/chat/ModeToggle.tsx'), 'utf8');
  const wv = fs.readFileSync(path.resolve(__dirname, '../src/workspace/WorkspaceView.tsx'), 'utf8');
  const pv = fs.readFileSync(path.resolve(__dirname, '../src/workspace/PaneView.tsx'), 'utf8');

  // ── 2026-07-27 배치 변경(사용자 확정): pane 오버레이 → main-top 헤더 우측 ──
  //  ★ 예전 핀(코너 오프셋 top/right 를 PC `.pane-mode-toggle` 과 대조)은 **없어진 셀렉터**를 읽고 있었고
  //   양쪽 다 null 이 되어 "초록인데 아무것도 검증하지 않는" 상태가 됐다(정규식 핀의 고질병) → 폐기하고
  //   지금의 불변식으로 대체한다: 양 플랫폼 다 절대배치가 아니고, 헤더에서 렌더된다.
  it('앱 토글은 절대배치 오버레이가 아니다(헤더 인라인 버튼)', () => {
    expect(/position:\s*'absolute'/.test(mt)).toBe(false);
    // 선언이 없어야 한다(주석의 "폐기했다" 언급은 허용).
    expect(/MODE_TOGGLE_(TOP|RIGHT)\s*=/.test(mt)).toBe(false);
  });

  it('앱 토글은 PaneView 가 아니라 WorkspaceView(main-top)에서 렌더된다', () => {
    expect(/<ModeToggle/.test(pv)).toBe(false);
    expect(/<ModeToggle/.test(wv)).toBe(true);
    // 승인 배너의 "토글 자리 비우기"(paddingRight 52)도 함께 사라져야 한다 — 남으면 빈 여백만 생긴다.
    expect(/paddingRight:\s*showToggle/.test(pv)).toBe(false);
  });

  it('PC 도 같은 라운드에 헤더로 옮겼다(.mt-mode + buildModeToggle/syncModeToggle)', () => {
    expect(/\.mt-mode\s*\{/.test(css)).toBe(true);
    expect(/\.pane-mode-toggle/.test(css)).toBe(false);
    const wvJs = fs.readFileSync(path.join(SERVICE, 'codingpt_pc/src/js/workspace-view.js'), 'utf8');
    expect(/function buildModeToggle\(/.test(wvJs)).toBe(true);
    expect(/export function syncModeToggle\(/.test(wvJs)).toBe(true);
  });

  it('양쪽 다 "포커스 pane 이 대상이 아니면 다른 터미널 pane" 폴백을 갖는다(토글 소멸 방지)', () => {
    const wvJs = fs.readFileSync(path.join(SERVICE, 'codingpt_pc/src/js/workspace-view.js'), 'utf8');
    // PC: 대상 선택 함수가 포커스 pane 을 먼저 보고, 없으면 panes 를 훑어 첫 대상을 고른다.
    expect(/function modeToggleTarget\(/.test(wvJs)).toBe(true);
    expect(/for \(const \[, p\] of panes\)[\s\S]{0,160}viaFallback: true/.test(wvJs)).toBe(true);
    // 앱: 포커스 후보가 없으면 레이아웃을 훑어 첫 대상을 고른다(pickToggleTarget).
    expect(/function pickToggleTarget/.test(wv)).toBe(true);
    expect(/T\.eachLeaf\([\s\S]{0,120}consider\(l\)/.test(wv)).toBe(true);
  });

  // ★ 실제로 있었던 결함(PC): 그리기는 "포커스 pane 이 OFF 면 폴백", 클릭은 "포커스 pane 이 **없을 때만**
  //   폴백" 이라 서로 다른 pane 을 골랐다 → 포커스가 셸 터미널이고 옆 pane 에서 claude 가 도는 상황에서
  //   **버튼은 옆 pane 상태를 보여주면서 클릭은 포커스 pane 을 토글**했다. 둘 다 "정상 동작"이라
  //   에러·로그가 0건이다. 그리기와 클릭이 같은 함수로 대상을 고르는지 양쪽에서 고정한다.
  it('그리기와 클릭이 같은 함수로 대상을 고른다(표시된 상태와 조작 대상 불일치 방지)', () => {
    const wvJs = fs.readFileSync(path.join(SERVICE, 'codingpt_pc/src/js/workspace-view.js'), 'utf8');
    const clickAt = wvJs.indexOf('b.addEventListener("click"');
    const clickBody = wvJs.slice(clickAt, wvJs.indexOf('});', clickAt));
    expect(/modeToggleTarget\(\)/.test(clickBody)).toBe(true);
    expect(/panes\.get\(rt\.focusId\)/.test(clickBody)).toBe(false); // 독자 해석 금지
    const syncAt = wvJs.indexOf('export function syncModeToggle()');
    expect(/modeToggleTarget\(\)/.test(wvJs.slice(syncAt, wvJs.indexOf('\n}', syncAt)))).toBe(true);
    // 앱은 표시(useSyncExternalStore)와 클릭(onToggleMode) 둘 다 pickToggleTarget 을 부른다.
    expect((wv.match(/pickToggleTarget\(rtRef\.current, wsRef\.current\)/g) || []).length).toBe(2);
  });

  // 폴백으로 비포커스 pane 을 조작하게 되면 **그 pane 으로 포커스를 옮긴다** — 안 옮기면 터미널 pane 이
  //  둘일 때 "왜 딴 쪽이 채팅으로 바뀌었지?" 가 된다(에러 0건의 조용한 혼란).
  it('폴백 조작 시 그 pane 으로 포커스를 옮긴다(양쪽 동일)', () => {
    const wvJs = fs.readFileSync(path.join(SERVICE, 'codingpt_pc/src/js/workspace-view.js'), 'utf8');
    expect(/viaFallback\)\s*S\.focusPane\(/.test(wvJs)).toBe(true);
    expect(/viaFallback\)\s*SRef\.current\.focusPane\(/.test(wv)).toBe(true);
  });

  it('앱 ModeToggle 은 opacity 를 style 이 아니라 baseOpacity 로 넘긴다(animStyle 이 덮는다)', () => {
    // 과거 실사고: style 의 opacity 는 PressableScale 이 뒤에 붙이는 animStyle 에 덮여 항상 1 로 그려졌다.
    expect(/baseOpacity=\{/.test(mt)).toBe(true);
    expect(/opacity:\s*chat\s*\?/.test(mt)).toBe(false);
    expect(num(/MODE_TOGGLE_IDLE_OPACITY\s*=\s*([\d.]+)/, mt)).toBeLessThan(1);
  });

  it('토글 글리프 크기 = 같은 헤더 추가 버튼(MtBtn)과 같은 값(줄 정렬 — 플랫폼별로 다른 것이 정상)', () => {
    const glyph = num(/MODE_TOGGLE_GLYPH\s*=\s*(\d+)/, mt);
    // WorkspaceView 의 추가 버튼 3개는 모두 같은 size 로 그린다.
    const adds = (wv.match(/<(TerminalWindow|Code|Globe) size=\{(\d+)\}/g) || [])
      .map((s) => Number(/(\d+)/.exec(s.replace(/^<\w+ size=\{/, ''))?.[1]));
    expect(adds.length).toBe(3);
    expect(new Set(adds).size).toBe(1);
    expect(glyph).toBe(adds[0]);
  });

  // ★ 사용자가 "채팅 전환 토글이 없다"고 신고했는데 실제로는 헤더에 있었다 — 옆의 추가 버튼 3개와
  //   **같은 납작한 아이콘**이라 4번째 추가 버튼으로 읽힌 것이다(추가=행동 / 토글=상태). 그래서
  //   "유휴에도 테두리+배경이 있는 컨트롤 형태 + 추가 버튼군과 구분선" 을 양 플랫폼에서 고정한다.
  //   이 핀이 없으면 "토큰 통일" 리팩터가 조용히 납작한 상태로 되돌린다(에러 0건, 기능은 동작).
  it('토글은 유휴에도 테두리+배경이 있어 추가 버튼과 구별된다(양 플랫폼)', () => {
    // 앱: 테두리는 조건부가 아니라 항상 1, 배경도 항상 elevated2(활성은 테두리 색만 accent).
    expect(/borderWidth:\s*1,\s*borderColor:\s*chat\s*\?\s*C\.accent\s*:\s*C\.borderControl/.test(mt)).toBe(true);
    expect(/backgroundColor:\s*C\.elevated2/.test(mt)).toBe(true);
    expect(/backgroundColor:\s*chat\s*\?\s*C\.elevated2\s*:\s*'transparent'/.test(mt)).toBe(false);
    // PC: `.mt-mode` 가 자체 테두리/배경을 갖고, 추가 버튼군과 사이에 1px 구분선(::before)이 있다.
    const css = fs.readFileSync(path.join(SERVICE, 'codingpt_pc/src/styles.css'), 'utf8');
    const block = /\.mt-mode\s*\{([\s\S]*?)\}/.exec(css)?.[1] || '';
    expect(/border:\s*1px solid var\(--border-ctrl\)/.test(block)).toBe(true);
    expect(/background:\s*var\(--elevated2\)/.test(block)).toBe(true);
    expect(/\.mt-mode::before\s*\{[^}]*background:\s*var\(--border\)/.test(css)).toBe(true);
    expect(/\.mt-mode\.active\s*\{[^}]*border-color:\s*var\(--accent\)/.test(css)).toBe(true);
  });

  // 앱 헤더에도 추가 버튼군과 토글 사이에 구분선이 있어야 한다(PC ::before 와 같은 역할).
  it('앱 헤더도 추가 버튼군과 토글 사이에 구분선을 둔다', () => {
    const at = wv.indexOf('<ModeToggle');
    expect(at).toBeGreaterThan(0);
    expect(/width:\s*1,\s*height:\s*20,\s*backgroundColor:\s*C\.border/.test(wv.slice(Math.max(0, at - 400), at))).toBe(true);
  });

  it('PC 사다리도 데몬 부정을 OFF 로 쓰지 않는다(한쪽만 고치면 같은 터미널에 두 그림)', () => {
    expect(/from:\s*"daemon-none"/.test(signal)).toBe(false);
    expect(/④ 로 내려간다|데몬 부정/.test(signal)).toBe(true);
  });

  it('양쪽 다 휘발 판정 신호를 영속하지 않는다(PC stripVolatile ↔ 앱 T.stripVolatile)', () => {
    expect(/export function stripVolatile/.test(state)).toBe(true);
    expect(/stripVolatile\(w\.layout\)/.test(state)).toBe(true);
    const ctx = fs.readFileSync(path.resolve(__dirname, '../src/contexts/WorkspaceShellContext.tsx'), 'utf8');
    expect(/T\.stripVolatile\(rt\.layout\)/.test(ctx)).toBe(true);
  });
});

describe('영속 레이아웃에서 휘발 판정 신호를 뺀다(T.stripVolatile)', () => {
  const tree = {
    id: 'root', dir: 'h' as const, ratio: 0.5,
    first: {
      id: 'a', kind: 'terminal' as const, active: 0,
      tabs: [{ win: 7, title: '✳ 작업', cmd: '2.1.219', agent: false, agentState: 'gone', miss: 1, mode: 'chat' as const, chatDraft: '초안' }],
    },
    second: { id: 'b', kind: 'preview' as const, url: 'http://x' },
  };

  it('agent·agentState·miss 가 빠지고 이름/cmd/mode/초안은 유지된다', () => {
    const out = T.stripVolatile(tree as any) as any;
    expect(out.first.tabs[0]).toEqual({ win: 7, title: '✳ 작업', cmd: '2.1.219', mode: 'chat', chatDraft: '초안' });
  });

  it('원본 트리는 변형되지 않는다(라이브 상태 보호)', () => {
    T.stripVolatile(tree as any);
    expect((tree.first.tabs[0] as any).agent).toBe(false);
  });

  it('터미널이 아닌 leaf 는 그대로', () => {
    const out = T.stripVolatile(tree as any) as any;
    expect(out.second).toEqual(tree.second);
  });

  it('복원된 스테일 agent:false 가 사다리를 지배하지 않는다(저장→복원 왕복)', () => {
    const saved = JSON.parse(JSON.stringify({ layout: T.stripVolatile(tree as any) }));
    const tab = saved.layout.first.tabs[0];
    // 앱 재시작 첫 렌더(목록 미도착·호스트 오프라인) — 토글은 켜져 있어야 한다.
    expect(resolveAgentPresence({ push: null, tab }).on).toBe(true);
  });
});
