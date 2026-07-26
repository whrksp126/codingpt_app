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
  const block = /\.pane-mode-toggle\s*\{([\s\S]*?)\}/.exec(css)?.[1] || '';
  const num = (re: RegExp, s: string) => { const m = re.exec(s); return m ? Number(m[1]) : null; };
  // ModeToggle 은 **소스 텍스트로** 읽는다 — import 하면 reanimated(ESM)까지 끌려와 이 스위트가
  //  네이티브 의존성에 묶인다(PC test/agent-toggle.mjs 가 앱 값을 정규식으로 읽는 것과 같은 이유).
  const mt = fs.readFileSync(path.resolve(__dirname, '../src/workspace/chat/ModeToggle.tsx'), 'utf8');
  const MODE_TOGGLE_TOP = num(/MODE_TOGGLE_TOP\s*=\s*(\d+)/, mt);
  const MODE_TOGGLE_RIGHT = num(/MODE_TOGGLE_RIGHT\s*=\s*(\d+)/, mt);
  const MODE_TOGGLE_IDLE_OPACITY = num(/MODE_TOGGLE_IDLE_OPACITY\s*=\s*([\d.]+)/, mt);

  it('토글 코너 오프셋(top·right)이 PC 와 같다', () => {
    expect(num(/top:\s*(\d+)px/, block)).toBe(MODE_TOGGLE_TOP);
    expect(num(/right:\s*(\d+)px/, block)).toBe(MODE_TOGGLE_RIGHT);
  });

  // ★ 수치까지 대조한다 — 토큰 **이름**만 보던 기존 핀은 앱 opacity 가 PressableScale 의 animStyle 에
  //  덮여 항상 1 로 그려지던 것을 못 잡았다(평상시 PC 0.9 / 앱 1 = 3플랫폼 동일 디자인 위반).
  it('평상시 투명도 수치가 PC .pane-mode-toggle 과 같다', () => {
    expect(num(/opacity:\s*([\d.]+)/, block)).toBe(MODE_TOGGLE_IDLE_OPACITY);
  });

  it('앱 ModeToggle 은 opacity 를 style 이 아니라 baseOpacity 로 넘긴다(animStyle 이 덮는다)', () => {
    expect(/baseOpacity=\{/.test(mt)).toBe(true);
    // style 객체 안에 opacity 를 되살리면 이 핀이 터진다.
    expect(/opacity:\s*chat\s*\?/.test(mt)).toBe(false);
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
