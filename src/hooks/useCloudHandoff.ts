import { useCallback, useRef, useState } from 'react';

import daemonService from '../services/daemonService';
import { daemonProjectId, cloudCwdForWorkspace } from '../services/ideSource';
import { useIdeProject } from '../contexts/IdeProjectContext';
import type { WorkspaceMeta } from '../services/workspaceService';

// M5 Slice4 — 클라우드 러너 원탭 핸드오프 오케스트레이션.
//  핵심: 라우팅은 두 축(활성 러너 = activeRunnerId, 폴더 = 세션 projectId 의 pc:<cwd>)이라
//  핸드오프 = (1) 체크포인트로 데이터층 이동 → (2) 러너 확보/활성 전환 → (3) 반대편에 materialize → (4) 진입.
//  전역 활성 러너 모델 유지("한 번에 하나의 활성 타겟").

export type HandoffPhase = null | 'checkpoint' | 'ensure' | 'waking' | 'activate' | 'materialize' | 'enter';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 특정 러너(deviceId+kind)가 relay 에 연결될 때까지 상태 폴링(기본 45s).
async function waitRunnerConnected(runnerId: number, kind: 'local' | 'cloud', timeoutMs = 45000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const st = await daemonService.getStatus().catch(() => null);
    if (st?.runners?.some((r) => r.deviceId === runnerId && r.kind === kind)) return true;
    await sleep(1500);
  }
  return false;
}

export function useCloudHandoff() {
  const { setActiveWorkspace } = useIdeProject();
  const [phase, setPhase] = useState<HandoffPhase>(null);
  const [message, setMessage] = useState('');
  // 핸드오프 후 클라우드 러너가 로그아웃 상태면 로그인 시트를 띄우도록 신호(runnerId 지정 로그인).
  const [pendingCloudLogin, setPendingCloudLogin] = useState<{ runnerId: number } | null>(null);
  const clearCloudLogin = useCallback(() => setPendingCloudLogin(null), []);
  const busyRef = useRef(false);

  // 로컬 워크스페이스 → 클라우드 러너로 이어가기.
  //  opts.skipCheckpoint: PC 오프라인(체크포인트 불가) → 마지막 저장 시점(manifest.head)으로 복원.
  const handoffToCloud = useCallback(async (ws: WorkspaceMeta, opts?: { skipCheckpoint?: boolean }): Promise<string | null> => {
    if (busyRef.current) return null;
    busyRef.current = true;
    try {
      // 1. 현재 상태 스냅샷(온라인일 때만).
      if (!opts?.skipCheckpoint) {
        setPhase('checkpoint'); setMessage('현재 상태 저장 중…');
        await daemonService.syncCheckpoint(ws.id, 'handoff').catch(() => { /* 스냅샷 실패해도 최신 head 로 진행 */ });
      }
      // 2. 이미 연결된 클라우드 러너가 있으면 재사용, 없으면 ensure(프로비저닝+컨테이너 기동/동면 깨우기).
      //  dataPresent=클라우드 볼륨에 코드가 이미 있음(재사용 or 동면 복귀) → materialize 생략(중복/충돌 방지).
      setPhase('ensure'); setMessage('클라우드 준비 중…');
      const st = await daemonService.getStatus().catch(() => null);
      let runnerId = st?.runners?.find((r) => r.kind === 'cloud')?.deviceId;
      // 클라우드 러너 제공 잠정 중단(cloudEnabled=false) — 새 러너 확보(ensure)로 못 들어간다.
      //  이미 연결된 클라우드 러너가 있으면 재사용은 허용(로컬 복귀 handoffToLocal 은 항상 허용).
      if (!runnerId && st?.cloudEnabled !== true) {
        throw new Error('클라우드 러너 제공이 잠정 중단되어 있어요. 내 PC를 연결해 작업해 주세요.');
      }
      let dataPresent = false;
      if (!runnerId) {
        const e = await daemonService.ensureCloudRunner(ws.id);
        runnerId = e.runnerId;
        dataPresent = !!e.wasDormant; // 동면 복귀 = 볼륨에 코드·크레덴셜 잔존(콜드스타트)
        if (e.needsManualRun) setMessage('개발용: 컨테이너 수동 기동 대기 중…');
      } else {
        dataPresent = true; // 이미 연결된 클라우드 러너 = /workspace 볼륨에 코드 존재
      }
      // 3. 러너 연결 대기.
      setPhase('waking'); setMessage(dataPresent ? '환경 깨우는 중…' : '클라우드 준비 중…');
      const ok = await waitRunnerConnected(runnerId, 'cloud');
      if (!ok) throw new Error('클라우드 러너 연결 시간이 초과됐어요.');
      // 4. 활성 러너 = 클라우드.
      setPhase('activate');
      await daemonService.activateRunner({ kind: 'cloud' });
      // 5. 최초 이동만 체크포인트 복원(materialize). 동면 복귀/재사용은 볼륨에 코드가 있어 생략.
      const cwd = cloudCwdForWorkspace(ws);
      if (!dataPresent) {
        setPhase('materialize'); setMessage('작업 폴더 복원 중…');
        const r = await daemonService.syncMaterialize(ws.id, { targetCwd: cwd });
        if (r.conflict) throw new Error('동기화 충돌이 있어요 — 잠시 후 파일을 선택해 해결해 주세요.');
      }
      // 6. 진입(활성=cloud, projectId=pc:<슬러그>). IDE 오픈은 호출부가 반환 projectId 로 결정.
      setPhase('enter');
      const pid = daemonProjectId(cwd);
      setActiveWorkspace({ id: pid, name: ws.name, kind: 'project', wsId: ws.id, runnerKind: 'cloud' });
      // 7. 클라우드 러너가 아직 로그아웃이면(프레시 컨테이너) 로그인 시트 유도.
      const ls = await daemonService.agentLoginStatus({ runnerId }).catch(() => ({ loggedIn: true }));
      if (!ls.loggedIn) setPendingCloudLogin({ runnerId });
      return pid;
    } finally {
      busyRef.current = false; setPhase(null); setMessage('');
    }
  }, [setActiveWorkspace]);

  // 클라우드 → 내 PC(로컬)로 복귀. cloudCwd=지금 클라우드에서 열려있는 폴더(pc:<cwd> 의 cwd).
  const handoffToLocal = useCallback(async (ws: { id: string; name: string; localPath: string }, cloudCwd: string): Promise<string | null> => {
    if (busyRef.current) return null;
    busyRef.current = true;
    try {
      // 1. 클라우드 실폴더에서 스냅샷(cwd 오버라이드).
      setPhase('checkpoint'); setMessage('클라우드 상태 저장 중…');
      await daemonService.syncCheckpoint(ws.id, 'handoff', cloudCwd).catch(() => { /* noop */ });
      // 2. 활성 러너 = 로컬(연결돼 있어야).
      setPhase('activate');
      await daemonService.activateRunner({ kind: 'local' });
      // 3. 내 PC 원폴더에 복원.
      setPhase('materialize'); setMessage('내 PC로 복원 중…');
      const r = await daemonService.syncMaterialize(ws.id, { targetCwd: ws.localPath });
      if (r.conflict) throw new Error('동기화 충돌이 있어요 — 잠시 후 파일을 선택해 해결해 주세요.');
      // 4. 진입(활성=local). IDE 오픈은 호출부가 반환 projectId 로 결정.
      setPhase('enter');
      const pid = daemonProjectId(ws.localPath);
      setActiveWorkspace({ id: pid, name: ws.name, kind: 'project', wsId: ws.id, runnerKind: 'local' });
      return pid;
    } finally {
      busyRef.current = false; setPhase(null); setMessage('');
    }
  }, [setActiveWorkspace]);

  return { phase, message, handoffToCloud, handoffToLocal, pendingCloudLogin, clearCloudLogin };
}

export default useCloudHandoff;
