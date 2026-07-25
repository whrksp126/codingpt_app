// agentStateStore.ts — 데몬 agent_state push(기능3 2단계) 보관소 + Chat 토글 판정.
//
// 왜 이 설계인가:
//  · 에이전트 부착 여부의 오늘 유일한 신호는 리컨실러가 5~9s 주기로 채우는 tab.cmd(pane_current_command)다.
//    데몬은 이미 상태머신(runner-core/agent-state.js)을 갖고 있어 <1s 로 알 수 있는데, 그 값을 클라이언트로
//    보내는 배관(데몬 emit → back 팬아웃)만 비어 있었다. 이 파일은 그 push 가 도착했을 때 보관하는 절반이다.
//  · **폴백을 대체하지 않는다.** push 가 없으면(구 back·구 데몬·caps 'agentstate.v1' 미선언) 판정은
//    그대로 tab.cmd 로 떨어진다. gemini(훅 미지원)·`--settings` 직접 지정·cmux PATH 경합에서는 폴백이
//    유일한 신호이므로 폴백 제거는 곧 기능 상실이다(계약 §1.5).
//  · **모르는 상태는 "에이전트 없음"이 아니라 "폴백 사용"이다.** 그래서 이 스토어의 조회는 boolean 이 아니라
//    "스냅샷 or null" 을 돌려주고, null 일 때 호출측이 폴백을 쓴다. 여기서 false 를 돌려주면 토글이 영원히
//    안 뜨는 조용한 죽음이 된다.
//  · 반대로 스테일 push 를 영구 신뢰하면 "claude 를 끝냈는데 토글이 영구히 켜진 채" 로 굳는다(계약 §1.7).
//    그래서 (a) 'gone' 수신 → 삭제, (b) 호스트 오프라인 → 그 호스트 전량 폐기, (c) 15분 초과 → 스테일 취급,
//    (d) 알림 채널 재연결/포그라운드 복귀 → 전량 폐기(그동안의 전이를 놓쳤을 수 있다) 네 갈래로 되돌린다.
//  · React 를 import 하지 않는다(순수 모듈 스토어 + 구독). 시간은 인자로만 들어오므로 __tests__ 가
//    임계값·우선순위를 결정적으로 고정할 수 있다(lanPath.ts 관례).
//
// 와이어 키(계약 §1.2 확정): `(hostDeviceId, cwd, win)`.
//  · cwd = 데몬 홈-기준 상대경로 = 앱 `WorkspaceMeta.localPath`(workspaceService.ts:20) — 알림 cwd 매칭과 동일 값.
//  · win = tmux window index = 데몬 tid(31-bit 안정 ID, pty.js:105 `index(tid)`) = 앱 `TerminalTab.win`.
//  · hostDeviceId = back 이 스탬프하는 conn.deviceId = DaemonDevice.id = 앱 `WorkspaceMeta.hostDeviceId`
//    = runner_status.deviceId. PC 는 이 필드를 무시하고 `${cwd}|${win}` 로만 색인하지만(additive),
//    앱은 멀티 PC 에서 같은 상대경로가 두 PC 에 있을 수 있으므로 처음부터 host 를 키에 넣는다.

/** 와이어 state 도메인(계약 §1.3) — 데몬 내부 launching→idle / ended→gone 은 데몬이 접어서 보낸다. */
export type AgentWireState = 'idle' | 'working' | 'permission' | 'needsInput' | 'gone';
const WIRE_STATES = new Set<string>(['idle', 'working', 'permission', 'needsInput', 'gone']);

/** 보관 항목 — 라우팅 메타뿐이다(내용성 정보는 와이어에 애초에 실리지 않는다). */
export interface AgentSnap {
  host: number | null;
  cwd: string;
  win: number;
  agent: string;
  state: AgentWireState;
  sessionId: string | null;
  /** (cwd,win) 안에서 단조 증가. 순서 역전 방어용(계약 §1.3 — rseq 는 쓰지 않는다). */
  version: number;
  /** 데몬 Date.now() 가 아니라 **수신 시각**. 데몬↔폰 시계가 어긋나도 스테일 판정이 흔들리지 않는다. */
  at: number;
  /** 진단용 — 데몬이 준 발신 시각(있으면). */
  sentAt: number | null;
  source: string | null;
}

/** 이만큼 새 push 가 없으면 스테일 → 폴백으로 되돌린다(계약 §1.5 (c)). */
export const AGENT_STATE_STALE_MS = 15 * 60 * 1000;

const snaps = new Map<string, AgentSnap>();
const listeners = new Set<() => void>();
let version = 0; // useSyncExternalStore 용 변경 카운터

const keyOf = (host: number | null | undefined, cwd: string, win: number) => `${host ?? 0}|${cwd}|${win}`;

function emit(): void {
  version += 1;
  listeners.forEach((l) => { try { l(); } catch (_) { /* 구독자 오류가 소켓 루프를 깨지 않게 */ } });
}

/** useSyncExternalStore(subscribe, …) 용 구독. @returns 해제 함수 */
export function subscribeAgentState(l: () => void): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}
export function getAgentStateVersion(): number { return version; }

/** 데몬→back→기기 팬아웃 프레임의 event 한 건 반영. @returns 스토어가 바뀌었는지 */
export function applyAgentState(ev: any, now: number = Date.now()): boolean {
  if (!ev || typeof ev.cwd !== 'string' || typeof ev.win !== 'number' || !Number.isFinite(ev.win)) return false;
  const state = String(ev.state || '');
  if (!WIRE_STATES.has(state)) return false; // 모르는 state = 무시(구/신 데몬 혼재 안전)
  const host = typeof ev.hostDeviceId === 'number' ? ev.hostDeviceId : null;
  const k = keyOf(host, ev.cwd, ev.win);
  if (state === 'gone') {
    // 에이전트 종료 → 키 삭제. **여기서 'gone' 을 보관하면** 폴백이 다시는 발동하지 않는다(PC state.js 미러).
    if (!snaps.delete(k)) return false;
    emit();
    return true;
  }
  const ver = Number.isFinite(ev.version) ? Number(ev.version) : 0;
  const sentAt = Number.isFinite(ev.at) ? Number(ev.at) : null;
  const cur = snaps.get(k);
  //  순서 역전 방어 — version 은 (cwd,win) 안에서만 단조이고 **데몬 재기동 시 0 으로 되돌아간다**.
  //  그래서 version 만으로 버리면 재기동 후 상태가 영구히 안 들어온다 → 발신 시각까지 같이 후퇴했을
  //  때에만(= 진짜 늦게 도착한 옛 프레임) 폐기한다.
  if (cur && ver <= cur.version && sentAt != null && cur.sentAt != null && sentAt <= cur.sentAt) return false;
  snaps.set(k, {
    host,
    cwd: ev.cwd,
    win: ev.win,
    agent: typeof ev.agent === 'string' && ev.agent ? ev.agent : 'claude',
    state: state as AgentWireState,
    sessionId: typeof ev.sessionId === 'string' ? ev.sessionId : null,
    version: ver,
    at: now,
    sentAt,
    source: typeof ev.source === 'string' ? ev.source : null,
  });
  emit();
  return true;
}

/**
 * 그 호스트의 상태 전량 폐기 — runner_status.online=false 수신 시(계약 §1.5 (b)).
 *  호스트가 죽으면 마지막 push 는 "그 순간의 사진"일 뿐이라 신뢰 근거가 사라진다 → 폴백으로 되돌린다.
 */
export function dropHost(host: number): boolean {
  let changed = false;
  for (const [k, s] of snaps) if (s.host === host) { snaps.delete(k); changed = true; }
  if (changed) emit();
  return changed;
}

/**
 * 전량 폐기 — 알림 채널(WSS/SSE) 재연결·앱 포그라운드 복귀에서 호출.
 *  채널이 끊겼던 동안의 전이(특히 종료 = 'gone')를 놓쳤을 수 있으므로 보유 상태는 근거가 없다.
 *  폐기 결과는 "폴백(오늘의 동작, 5~9s 지연)" 이라 알려진 지연이고, 반대(스테일 신뢰)는 조용한 고착이다.
 */
export function resetAgentStates(): boolean {
  if (!snaps.size) return false;
  snaps.clear();
  emit();
  return true;
}

/**
 * 조회 — 없거나 스테일이면 null(= "모름" → 호출측 폴백). 읽기 경로는 스토어를 변형하지 않는다
 *  (useSyncExternalStore getSnapshot 이 부르므로 순수해야 한다).
 *  ⚠ cwd 빈 문자열(=워크스페이스에 localPath 가 없다 = 미상)은 매칭하지 않는다. 데몬은 홈 디렉터리를
 *   `cwd:''` 로 표현할 수 있는데, 그 값을 "미상" 과 같게 취급하면 localPath 없는 워크스페이스가 남의
 *   홈 터미널 상태를 물게 된다 → 미상은 언제나 폴백이다.
 */
export function agentSnapOf(
  host: number | null | undefined,
  cwd: string | null | undefined,
  win: number | null | undefined,
  now: number = Date.now(),
): AgentSnap | null {
  if (!cwd || typeof win !== 'number' || !Number.isFinite(win)) return null;
  //  host 관용은 **양방향**이어야 한다 — 어느 한쪽만 하면 반대쪽에서 조용한 무발현이 된다.
  //   ① 저장 항목에 host 가 없다(구 back 이 hostDeviceId 를 빼먹은 프레임) → host 무관으로 한 번 더.
  //   ② 질의측에 host 가 없다(워크스페이스 메타에 hostDeviceId 가 없다 — back workspaceService 는
  //      `m.hostDeviceId != null` 일 때만 응답에 싣는다 = 필드 도입 전에 만든 로컬 ws·claimWorkspaceHost
  //      미경유 ws) → 반면 back 팬아웃은 **항상** conn.deviceId 를 스탬프하므로 정확 키가 무조건 빗나가
  //      그 워크스페이스만 영구히 tab.cmd 폴백(5~9s)에 갇힌다. PC 는 (cwd,win) 만으로 색인해 정상
  //      동작하므로 "PC 에선 즉시 뜨는데 폰에서만 안 뜬다"로 나타나고 에러·로그는 0건이다.
  //  ②의 오귀속(멀티 PC 에서 같은 상대경로) 위험은 질의측에 구분 정보가 애초에 없어 피할 수 없다 —
  //  PC 와 같은 허용된 한계다. 여러 건이면 **가장 최근 수신**을 쓴다(결정적).
  let s = snaps.get(keyOf(host, cwd, win));
  if (!s && host != null) s = snaps.get(keyOf(null, cwd, win));
  if (!s && host == null) {
    for (const v of snaps.values()) {
      if (v.cwd !== cwd || v.win !== win) continue;
      if (!s || v.at > s.at) s = v;
    }
  }
  if (!s) return null;
  if (now - s.at > AGENT_STATE_STALE_MS) return null;
  return s;
}

/**
 * 토글 노출 판정의 순수 코어 — PC `pane.js:_agentOn()` 과 **같은 순서**(계약 §1.6).
 *  1) push 가 있으면 그것이 정본: 레코드 존재 = 에이전트 부착(idle 도 부착 상태다. 종료는 'gone' 삭제로 표현된다).
 *  2) 없으면(구 back/구 데몬/스테일/호스트 오프라인) fallback = hasAgentCmd(tab.cmd).
 */
export function resolveAgentOn(snap: AgentSnap | null, fallback: boolean): boolean {
  if (snap) return snap.state !== 'gone';
  return fallback;
}

/** 1)+2) 합본 — 렌더 경로가 부르는 형태. win 미확정(null)이면 곧바로 폴백. */
export function agentOnFor(
  host: number | null | undefined,
  cwd: string | null | undefined,
  win: number | null | undefined,
  fallback: boolean,
  now: number = Date.now(),
): boolean {
  return resolveAgentOn(agentSnapOf(host, cwd, win, now), fallback);
}

/** 진단/테스트용 — 보관 건수. */
export function agentStateSize(): number { return snaps.size; }

export default {
  subscribeAgentState, getAgentStateVersion, applyAgentState, dropHost, resetAgentStates,
  agentSnapOf, resolveAgentOn, agentOnFor, agentStateSize, AGENT_STATE_STALE_MS,
};
