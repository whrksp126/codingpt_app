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

  // ── 2026-07-27 **두 번째 정정(지금의 정본)**: main-top 헤더 → 다시 터미널 pane 본문 우측 상단 ──
  //  같은 날 오전에 사용자 요구("메인 영역 기준 우측 상단")를 앱 헤더로 잘못 읽어 전역 1개로 옮겼다가
  //  사용자 확정으로 되돌렸다. 원래 의도는 **터미널 pane 본문 안**(탭바 아래, 터미널 내용 위 오버레이)이고
  //  pane 마다 자기 토글을 그린다 → 대상 폴백·포커스 이동 같은 보정 규칙이 전부 불필요해진다.
  it('앱 토글은 pane 본문 절대배치 오버레이다(코너 오프셋 + zIndex + halo)', () => {
    expect(/position:\s*'absolute'/.test(mt)).toBe(true);
    expect(num(/MODE_TOGGLE_TOP\s*=\s*(\d+)/, mt)).toBe(6);
    expect(num(/MODE_TOGGLE_RIGHT\s*=\s*(\d+)/, mt)).toBe(12);
    // 알림 오버레이(zIndex 50) 아래 / 콘텐츠 위.
    expect(num(/zIndex:\s*(\d+)/, mt)).toBe(30);
    // ★ hitSlop 이 실효를 갖기 위한 halo 패딩(래퍼 bounds 밖에서는 RN 이 hitTest 를 끝낸다).
    expect(num(/MODE_TOGGLE_HALO\s*=\s*(\d+)/, mt)).toBeGreaterThan(0);
    expect(/pointerEvents="box-none"/.test(mt)).toBe(true);
    expect(/hitSlop=\{MODE_TOGGLE_HALO\}/.test(mt)).toBe(true);
  });

  it('앱 토글은 WorkspaceView 헤더가 아니라 PaneView(그 pane)에서 렌더된다', () => {
    expect(/<ModeToggle/.test(pv)).toBe(true);
    expect(/<ModeToggle/.test(wv)).toBe(false);
    // 판정은 여전히 공용 순수 함수로만 한다(PC 와 69,300 조합 동치가 고정돼 있다).
    expect(/resolveToggleVisible\(\{ isTerm: activeIsTerm, win: activeWin, chatMode, agentOn \}\)/.test(pv)).toBe(true);
    // 승인 배너가 토글 히트영역(버튼+코너+halo)을 덮지 않게 우측 여백을 비운다.
    expect(/paddingRight:\s*showToggle\s*\?\s*MODE_TOGGLE_SIZE \+ MODE_TOGGLE_RIGHT \+ MODE_TOGGLE_HALO/.test(pv)).toBe(true);
    // 헤더 시절의 전역 단일 토글 배관은 전부 사라져야 한다(둘이 공존하면 토글이 두 개 보인다).
    expect(/pickToggleTarget/.test(wv)).toBe(false);
    expect(/getModeControl|registerModeControl/.test(wv + pv)).toBe(false);
  });

  it('PC 도 같은 라운드에 pane 내부로 되돌렸다(.pane-mode-toggle + pane.js _syncModeToggle)', () => {
    // PC 배치 정본 = pane.js 가 자기 pane 본문에 그린다. `.pane-body{position:relative}` 가 전제
    //  (없으면 오프셋 부모가 `.pane` 이 되어 top:6 이 30px 탭바 안으로 들어간다 — 실측 사고).
    expect(/\.pane-mode-toggle\s*\{/.test(css)).toBe(true);
    expect(/\.pane-body\s*\{[^}]*position:\s*relative/.test(css)).toBe(true);
    const paneJs = fs.readFileSync(path.join(SERVICE, 'codingpt_pc/src/js/pane.js'), 'utf8');
    expect(/_syncModeToggle\(/.test(paneJs)).toBe(true);
    const wvJs = fs.readFileSync(path.join(SERVICE, 'codingpt_pc/src/js/workspace-view.js'), 'utf8');
    expect(/mt-mode|buildModeToggle/.test(wvJs)).toBe(false);
  });

  // ★ 헤더 시절에 발견된 클릭 사문화(매 렌더 자식 SVG 교체 → mousedown 타깃이 mouseup 전에 소멸 →
  //   WebKit 이 click 을 디스패치하지 않는다)는 **배치와 무관한 불변식**이라 계속 고정한다.
  it('PC 토글 글리프는 바뀔 때만 재작성한다(mousedown 타깃 소멸 = 클릭 사문화 방지)', () => {
    const paneJs = fs.readFileSync(path.join(SERVICE, 'codingpt_pc/src/js/pane.js'), 'utf8');
    const at = paneJs.indexOf('_syncModeToggle(');
    const body = paneJs.slice(at, paneJs.indexOf('\n  }', at));
    expect(at).toBeGreaterThan(0);
    // 글리프 재작성은 "원하는 글리프가 지금 것과 다를 때"만 — 무조건 innerHTML 대입 금지.
    expect(/!==\s*want|want\s*!==/.test(body)).toBe(true);
    expect((body.match(/innerHTML/g) || []).length).toBeLessThanOrEqual(1);
    // 숨김은 노드 제거가 아니라 클래스/스타일로(제거도 같은 사고를 만든다).
    expect(/\.remove\(\)/.test(body)).toBe(false);
  });

  it('focusPane 은 포커스 무변화면 emit 하지 않는다(클릭마다 전체 재렌더 금지 — 1차 방어)', () => {
    const fpAt = state.indexOf('export function focusPane(');
    const fpBody = fpAt < 0 ? '' : state.slice(fpAt, state.indexOf('\n}', fpAt));
    expect(/if \(w\.focusId === paneId\) return;/.test(fpBody)).toBe(true);
  });

  // RN 에서 같은 사고는 "렌더마다 바뀌는 key(재마운트)" 로 난다 — 토글에는 key 를 주지 않는다.
  it('앱 토글에는 렌더마다 바뀌는 key 가 없다(재마운트 = 탭 사문화의 RN 판)', () => {
    const at = pv.indexOf('<ModeToggle');
    expect(at).toBeGreaterThan(0);
    expect(/key=/.test(pv.slice(at, pv.indexOf('/>', at)))).toBe(false);
  });

  it('앱 ModeToggle 은 opacity 를 style 이 아니라 baseOpacity 로 넘긴다(animStyle 이 덮는다)', () => {
    // 과거 실사고: style 의 opacity 는 PressableScale 이 뒤에 붙이는 animStyle 에 덮여 항상 1 로 그려졌다.
    expect(/baseOpacity=\{/.test(mt)).toBe(true);
    expect(/opacity:\s*chat\s*\?/.test(mt)).toBe(false);
    expect(num(/MODE_TOGGLE_IDLE_OPACITY\s*=\s*([\d.]+)/, mt)).toBeLessThan(1);
  });

  it('토글 크기는 터치 타깃(30) + 글리프는 16~19 안(헤더가 아니므로 헤더 버튼과 맞추지 않는다)', () => {
    expect(num(/MODE_TOGGLE_SIZE\s*=\s*(\d+)/, mt)).toBe(30);
    const glyph = num(/MODE_TOGGLE_GLYPH\s*=\s*(\d+)/, mt) || 0;
    expect(glyph).toBeGreaterThanOrEqual(16);
    expect(glyph).toBeLessThanOrEqual(19);
    // 30px 박스 + 1px 테두리 안에 좌우 여백이 남아야 한다(글리프가 테두리에 붙지 않게).
    expect(glyph).toBeLessThan(30 - 2 * 4);
  });

  // ★ 사용자가 "채팅 전환 토글이 없다"고 신고한 뒤 확정된 규칙 — 유휴에도 **컨트롤 형태**(테두리+배경).
  //   납작한 아이콘으로 두면 주변 버튼과 구별되지 않아 "없다"고 읽히고, 지금은 터미널 글자 위에 떠 있어
  //   배경이 불투명해야 겹쳐도 글리프가 읽힌다. 이 핀이 없으면 "토큰 통일" 리팩터가 조용히 되돌린다.
  it('토글은 유휴에도 테두리+불투명 배경이 있다(양 플랫폼)', () => {
    // 앱: 테두리는 조건부가 아니라 항상 1, 배경도 항상 elevated2(활성은 테두리 색만 accent).
    expect(/borderWidth:\s*1,\s*borderColor:\s*chat\s*\?\s*C\.accent\s*:\s*C\.borderControl/.test(mt)).toBe(true);
    expect(/backgroundColor:\s*C\.elevated2/.test(mt)).toBe(true);
    expect(/backgroundColor:\s*chat\s*\?\s*C\.elevated2\s*:\s*'transparent'/.test(mt)).toBe(false);
    // PC: `.pane-mode-toggle` 이 자체 테두리/배경을 갖고, 활성은 accent 테두리.
    const block = /\.pane-mode-toggle\s*\{([\s\S]*?)\}/.exec(css)?.[1] || '';
    expect(/border:\s*1px solid var\(--border-ctrl\)/.test(block)).toBe(true);
    expect(/background:\s*var\(--elevated2\)/.test(block)).toBe(true);
    expect(/position:\s*absolute/.test(block)).toBe(true);
    expect(/\.pane-mode-toggle\.active\s*\{[^}]*var\(--accent\)/.test(css)).toBe(true);
  });

  // 코너 오프셋은 3플랫폼 동일 디자인의 대조 값으로 되살아난다(양쪽 다 절대배치이므로 비교 가능).
  it('코너 오프셋이 앱=PC 로 같다(top 6 / right 12)', () => {
    const block = /\.pane-mode-toggle\s*\{([\s\S]*?)\}/.exec(css)?.[1] || '';
    expect(num(/top:\s*(\d+)px/, block)).toBe(num(/MODE_TOGGLE_TOP\s*=\s*(\d+)/, mt));
    expect(num(/right:\s*(\d+)px/, block)).toBe(num(/MODE_TOGGLE_RIGHT\s*=\s*(\d+)/, mt));
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
