import { useCallback, useEffect, useRef } from 'react';
import daemonService from '../services/daemonService';
import { getAutoCheckpointEnabled, useAutoCheckpointEnabled } from '../utils/autoCheckpointSetting';

// 자동 체크포인트(M4-2 · 계약 §6.3) — 데몬 워크스페이스에서 세 시점에 체크포인트를 찍는다:
//   · 턴 종료(turn_end): 에이전트 done 이벤트
//   · 주기(periodic): ~30s
//   · 전환 직전(handoff): 활성 워크스페이스가 바뀌기 직전(effect cleanup)
//  변경이 없으면 데몬이 트리 비교로 skip 하므로, 트리거는 단순 발사(중복은 데몬이 흡수).
//  wsId=null(비-데몬/미활성)이면 아무 것도 하지 않는다.
const PERIODIC_MS = 30_000;
const MIN_INTERVAL_MS = 8_000; // 턴종료+주기 겹칠 때 과호출 방지(전환직전은 예외로 강제).

export function useDaemonAutoCheckpoint(wsId: string | null, cwd?: string | null) {
  const wsRef = useRef<string | null>(wsId);
  const cwdRef = useRef<string | null>(cwd ?? null);
  const inFlightRef = useRef(false);
  const lastAtRef = useRef(0);
  const enabled = useAutoCheckpointEnabled(); // 설정(기본 끔) — 꺼져 있으면 전 트리거 무시
  useEffect(() => { wsRef.current = wsId; }, [wsId]);
  useEffect(() => { cwdRef.current = cwd ?? null; }, [cwd]);

  const run = useCallback(async (reason: string, force = false) => {
    if (!getAutoCheckpointEnabled()) return;
    const id = wsRef.current;
    if (!id) return;
    const now = Date.now();
    if (!force && now - lastAtRef.current < MIN_INTERVAL_MS) return;
    if (inFlightRef.current) return;
    inFlightRef.current = true; lastAtRef.current = now;
    // cwd 오버라이드 — 활성=클라우드면 슬러그(/workspace/<슬러그>). undefined 면 백엔드가 localPath 사용.
    //  background=true — 결과 미사용, 대형 번들 동기 대기(CF 524) 회피.
    try { await daemonService.syncCheckpoint(id, reason, cwdRef.current || undefined, true); }
    catch (_) { /* 오프라인/일시오류는 조용히 — 다음 트리거가 재시도 */ }
    finally { inFlightRef.current = false; }
  }, []);

  // 주기 타이머 — 데몬 워크스페이스가 활성이고 설정이 켜져 있는 동안만.
  useEffect(() => {
    if (!wsId || !enabled) return;
    const t = setInterval(() => { void run('periodic'); }, PERIODIC_MS);
    return () => clearInterval(t);
  }, [wsId, enabled, run]);

  // 전환 직전 — 이 wsId 가 바뀌거나 해제되기 직전(cleanup) 강제 체크포인트(다른 러너로 넘기기 전 최신 스냅샷).
  useEffect(() => {
    if (!wsId || !enabled) return;
    const leaving = wsId;
    const leavingCwd = cwdRef.current || undefined;
    return () => {
      if (!getAutoCheckpointEnabled()) return; // cleanup 시점 재확인(설정을 끄고 나가는 경우)
      void daemonService.syncCheckpoint(leaving, 'handoff', leavingCwd, true).catch(() => { /* noop */ });
    };
  }, [wsId, enabled]);

  // 턴 종료 트리거 — done 이벤트에서 호출.
  const onTurnEnd = useCallback(() => { void run('turn_end'); }, [run]);
  return { onTurnEnd };
}

export default useDaemonAutoCheckpoint;
