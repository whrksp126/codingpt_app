// agent_state(기능3 2단계) 수신 → Chat 토글 판정 우선순위 고정 테스트.
//
// 왜 이 테스트가 필요한가: 이 판정의 두 실패는 **둘 다 조용하다**.
//  (a) push 를 못 받는데 폴백까지 없애면 → 토글이 영원히 안 뜬다(에러 0건).
//  (b) 끝난 에이전트('gone'/오프라인/스테일)의 push 를 계속 신뢰하면 → 토글이 영구히 켜진 채 굳고
//      폴백이 다시는 발동하지 않는다(계약 §1.7).
// 그래서 프레임은 **back 이 실제로 보내는 JSON 을 그대로 하드코딩**한다(계약 §1.3 ② — 자기 구현으로
// 만든 객체를 넣으면 양쪽 단위테스트가 모두 초록인데 와이어에서 갈리는 과거 사고를 반복한다).
import {
  applyAgentState, agentSnapOf, agentOnFor, resolveAgentOn, dropHost, resetAgentStates,
  agentStateSize, AGENT_STATE_STALE_MS,
} from '../src/services/agentStateStore';

// ── 계약 §1.3 ② back → 전 기기 프레임(event 부분)을 바이트 그대로 ──
//  cwd = 데몬 홈-상대경로(= WorkspaceMeta.localPath), win = tmux window index(= 데몬 tid),
//  hostDeviceId = back 이 스탬프한 conn.deviceId(= DaemonDevice.id = WorkspaceMeta.hostDeviceId).
const WORKING = JSON.parse(JSON.stringify({
  cwd: 'other/project/codingpt',
  win: 1000123,
  state: 'working',
  agent: 'claude',
  version: 42,
  at: 1753432801000,
  sessionId: '21b28dc2-0000-4000-8000-000000000000',
  source: 'hook',
  since: 1753432800000,
  hostDeviceId: 12,
  kind: 'local',
}));
const GONE = { ...WORKING, state: 'gone', version: 43, at: 1753432900000 };
const CWD = WORKING.cwd;
const WIN = WORKING.win;
const HOST = WORKING.hostDeviceId;
const T0 = 1_000_000; // 수신 시각(스토어는 데몬 시계가 아니라 이 값으로 스테일을 판정한다)

beforeEach(() => { resetAgentStates(); });

describe('폴백(오늘의 동작) — push 가 없으면 tab.cmd 판정이 그대로 산다', () => {
  it('push 0건이면 폴백 값을 그대로 돌려준다(true/false 양쪽)', () => {
    expect(agentOnFor(HOST, CWD, WIN, true, T0)).toBe(true);
    expect(agentOnFor(HOST, CWD, WIN, false, T0)).toBe(false);
    expect(agentSnapOf(HOST, CWD, WIN, T0)).toBeNull();
  });

  it("win 미확정('new' → null)이면 push 를 찾지 않고 폴백", () => {
    applyAgentState(WORKING, T0);
    expect(agentOnFor(HOST, CWD, null, false, T0)).toBe(false);
    expect(agentOnFor(HOST, CWD, null, true, T0)).toBe(true);
  });

  it('cwd 미상(localPath 없는 워크스페이스)도 폴백 — 조용한 오귀속보다 지연이 낫다', () => {
    applyAgentState(WORKING, T0);
    expect(agentOnFor(HOST, '', WIN, false, T0)).toBe(false);
    expect(agentOnFor(HOST, undefined, WIN, true, T0)).toBe(true);
  });

  it('다른 호스트(멀티 PC)의 같은 상대경로/tid 는 쓰지 않는다', () => {
    applyAgentState(WORKING, T0);
    expect(agentOnFor(HOST, CWD, WIN, false, T0)).toBe(true);
    expect(agentOnFor(99, CWD, WIN, false, T0)).toBe(false); // 다른 PC → 모름 → 폴백
  });

  it('back 이 hostDeviceId 를 안 실은 프레임은 host 무관으로 쓰인다(키 어긋남 = 조용한 무발현 방지)', () => {
    applyAgentState({ cwd: CWD, win: WIN, state: 'working', version: 1, at: 5 }, T0);
    expect(agentOnFor(HOST, CWD, WIN, false, T0)).toBe(true); // ws.hostDeviceId=12 로 조회해도 매칭
    expect(agentOnFor(null, CWD, WIN, false, T0)).toBe(true);
    expect(agentOnFor(HOST, 'other/ws', WIN, false, T0)).toBe(false); // cwd/win 은 여전히 정확 일치
  });

  // ★ 반대 방향(이게 없으면 그 워크스페이스만 기능3 이 영구 무발현이었다)
  //  back workspaceService 는 `m.hostDeviceId != null` 일 때만 hostDeviceId 를 응답에 싣는다 →
  //  필드 도입 전에 만든(또는 claimWorkspaceHost 를 안 거친) 로컬 ws 는 앱에서 host=null 로 조회한다.
  //  반면 팬아웃 프레임에는 back 이 항상 conn.deviceId 를 스탬프하므로 정확 키가 무조건 빗나간다.
  it('질의측에 host 가 없어도(ws.hostDeviceId 미기록) 스탬프된 push 를 찾는다', () => {
    applyAgentState(WORKING, T0); // 저장 키 = '12|cwd|win'
    expect(agentSnapOf(null, CWD, WIN, T0)).toMatchObject({ host: HOST, state: 'working' });
    expect(agentOnFor(null, CWD, WIN, false, T0)).toBe(true);
    expect(agentOnFor(undefined, CWD, WIN, false, T0)).toBe(true);
    // cwd/win 은 여전히 정확 일치여야 한다(남의 터미널 물기 금지)
    expect(agentOnFor(null, 'other/ws', WIN, false, T0)).toBe(false);
    expect(agentOnFor(null, CWD, WIN + 1, false, T0)).toBe(false);
    // gone 삭제·스테일 되돌림도 이 경로에서 그대로 산다
    applyAgentState(GONE, T0 + 100);
    expect(agentOnFor(null, CWD, WIN, false, T0 + 100)).toBe(false);
  });

  it('멀티 PC 에서 host 미상 질의는 가장 최근 push 를 쓴다(결정적)', () => {
    applyAgentState(WORKING, T0);
    applyAgentState({ ...WORKING, hostDeviceId: 99, state: 'permission' }, T0 + 10);
    expect(agentSnapOf(null, CWD, WIN, T0 + 10)!.host).toBe(99);
    // host 를 아는 질의는 영향받지 않는다(정확 일치 우선)
    expect(agentSnapOf(HOST, CWD, WIN, T0 + 10)!.host).toBe(HOST);
  });
});

describe('push 우선 — 서버 상태가 있으면 그것이 정본', () => {
  it('working 프레임 1건으로 폴백 false 를 뒤집는다(감지 5~9s → <1s)', () => {
    expect(applyAgentState(WORKING, T0)).toBe(true);
    expect(agentOnFor(HOST, CWD, WIN, false, T0)).toBe(true);
    const s = agentSnapOf(HOST, CWD, WIN, T0);
    expect(s).toMatchObject({ host: 12, cwd: CWD, win: WIN, state: 'working', agent: 'claude', version: 42 });
    expect(s!.at).toBe(T0);            // 스테일 기준 = 수신 시각
    expect(s!.sentAt).toBe(1753432801000); // 데몬 시계는 진단용으로만 보관
  });

  it("idle 도 '부착'이다 — 종료는 오직 gone 으로 표현된다(PC pane.js _agentOn 미러)", () => {
    applyAgentState({ ...WORKING, state: 'idle', version: 43 }, T0);
    expect(agentOnFor(HOST, CWD, WIN, false, T0)).toBe(true);
  });

  it('permission/needsInput 도 부착으로 본다', () => {
    applyAgentState({ ...WORKING, state: 'permission', version: 44 }, T0);
    expect(agentOnFor(HOST, CWD, WIN, false, T0)).toBe(true);
    applyAgentState({ ...WORKING, state: 'needsInput', version: 45 }, T0);
    expect(agentOnFor(HOST, CWD, WIN, false, T0)).toBe(true);
  });
});

describe('되돌림 4갈래 — 여기서 실수하면 토글이 영구 고착한다', () => {
  it("(a) gone 수신 = 키 삭제 → 폴백 복귀(gone 을 '보관'하면 폴백이 다시는 안 돈다)", () => {
    applyAgentState(WORKING, T0);
    expect(applyAgentState(GONE, T0 + 100)).toBe(true);
    expect(agentStateSize()).toBe(0);
    expect(agentOnFor(HOST, CWD, WIN, false, T0 + 100)).toBe(false);
    expect(agentOnFor(HOST, CWD, WIN, true, T0 + 100)).toBe(true); // 폴백이 다시 정본
  });

  it('(b) 호스트 오프라인(runner_status.online=false) → 그 호스트 전량 폐기, 다른 호스트는 보존', () => {
    applyAgentState(WORKING, T0);
    applyAgentState({ ...WORKING, hostDeviceId: 99 }, T0);
    expect(dropHost(12)).toBe(true);
    expect(agentOnFor(12, CWD, WIN, false, T0)).toBe(false);
    expect(agentOnFor(99, CWD, WIN, false, T0)).toBe(true);
  });

  it('(c) 15분 초과 = 스테일 → 폴백. 경계값 고정(정확히 15분은 아직 유효)', () => {
    applyAgentState(WORKING, T0);
    expect(agentOnFor(HOST, CWD, WIN, false, T0 + AGENT_STATE_STALE_MS)).toBe(true);
    expect(agentOnFor(HOST, CWD, WIN, false, T0 + AGENT_STATE_STALE_MS + 1)).toBe(false);
    expect(agentOnFor(HOST, CWD, WIN, true, T0 + AGENT_STATE_STALE_MS + 1)).toBe(true);
    // 조회는 스토어를 변형하지 않는다(useSyncExternalStore getSnapshot 안전) — 새 push 로 즉시 되살아난다.
    applyAgentState({ ...WORKING, version: 43 }, T0 + AGENT_STATE_STALE_MS + 2);
    expect(agentOnFor(HOST, CWD, WIN, false, T0 + AGENT_STATE_STALE_MS + 2)).toBe(true);
  });

  it('(d) 채널 재연결/포그라운드 복귀 = 전량 폐기 → 폴백', () => {
    applyAgentState(WORKING, T0);
    expect(resetAgentStates()).toBe(true);
    expect(agentStateSize()).toBe(0);
    expect(agentOnFor(HOST, CWD, WIN, false, T0)).toBe(false);
  });
});

describe('프레임 검증 — 어긋난 어휘/필드는 조용히 무시(폴백 유지)', () => {
  it("데몬이 변환을 빼먹어 'ended' 를 그대로 보내면 무시한다(부착으로 오인 금지)", () => {
    expect(applyAgentState({ ...WORKING, state: 'ended' }, T0)).toBe(false);
    expect(agentOnFor(HOST, CWD, WIN, false, T0)).toBe(false);
  });

  it('필수 필드(cwd:string, win:number) 결여/타입 불일치는 무시', () => {
    expect(applyAgentState({ win: WIN, state: 'working' }, T0)).toBe(false);
    expect(applyAgentState({ cwd: CWD, win: String(WIN), state: 'working' }, T0)).toBe(false);
    expect(applyAgentState({ cwd: CWD, win: NaN, state: 'working' }, T0)).toBe(false);
    expect(applyAgentState(null, T0)).toBe(false);
    expect(agentStateSize()).toBe(0);
  });

  it('agent 누락은 claude 로 채운다(라벨용) — 프레임을 버리지 않는다', () => {
    applyAgentState({ cwd: CWD, win: WIN, state: 'working', hostDeviceId: HOST }, T0);
    expect(agentSnapOf(HOST, CWD, WIN, T0)!.agent).toBe('claude');
  });
});

describe('순서 역전 방어 — version + 발신시각 둘 다 후퇴할 때만 폐기', () => {
  it('늦게 도착한 옛 프레임(v41@t1)은 v42@t2 를 덮지 않는다', () => {
    applyAgentState({ ...WORKING, state: 'working', version: 42, at: 2000 }, T0);
    expect(applyAgentState({ ...WORKING, state: 'idle', version: 41, at: 1000 }, T0 + 1)).toBe(false);
    expect(agentSnapOf(HOST, CWD, WIN, T0)!.state).toBe('working');
  });

  it('데몬 재기동(version 0 으로 리셋)은 수용한다 — 안 그러면 상태가 영구히 안 들어온다', () => {
    applyAgentState({ ...WORKING, state: 'working', version: 42, at: 2000 }, T0);
    expect(applyAgentState({ ...WORKING, state: 'idle', version: 0, at: 9000 }, T0 + 1)).toBe(true);
    expect(agentSnapOf(HOST, CWD, WIN, T0 + 1)!.state).toBe('idle');
  });
});

describe('resolveAgentOn — 순수 우선순위 코어', () => {
  it('스냅샷 없음 = 폴백, 있음 = 스냅샷(PC _agentOn 과 같은 순서)', () => {
    expect(resolveAgentOn(null, true)).toBe(true);
    expect(resolveAgentOn(null, false)).toBe(false);
    const snap = { host: HOST, cwd: CWD, win: WIN, agent: 'claude', state: 'idle' as const, sessionId: null, version: 1, at: T0, sentAt: null, source: null };
    expect(resolveAgentOn(snap, false)).toBe(true);
    expect(resolveAgentOn({ ...snap, state: 'gone' as const }, false)).toBe(false); // 방어적: 보관되면 안 되는 값
  });
});
