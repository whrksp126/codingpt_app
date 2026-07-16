import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import daemonService, { DaemonStatus, DaemonRunner } from '../services/daemonService';

// BYO-PC 컴퓨트 연결 상태 — "내 PC(데몬)"와 "가상 서버(클라우드)" 두 축.
//  · localOnline : 사용자 PC 의 codingpt_daemon 이 지금 붙어 있는가.
//  · hasDevice   : 페어링된 기기가 있는가(오프라인이라도).
//  · cloudOnline : 백엔드(가상 서버)에 도달 가능한가 — getStatus 성공을 프로브로 사용.
// 화면이 포커스된 동안만 폴링(탭 이탈 시 정지).
export interface ComputeStatus {
  daemon: DaemonStatus | null;
  localOnline: boolean;
  hasDevice: boolean;
  cloudOnline: boolean;
  loading: boolean;
  refresh: () => void;
  // M5 Slice4 — 연결된 러너(local+cloud) 및 현재 활성 러너 종류.
  runners: DaemonRunner[];
  localRunner: DaemonRunner | null;
  cloudRunner: DaemonRunner | null;
  hasCloudRunner: boolean;
  activeRunnerKind: 'local' | 'cloud' | null;
  // 클라우드 러너 제공 여부(백엔드 CLOUD_RUNNER_ENABLED). false 면 클라우드 생성/전환 진입점 숨김.
  //  이미 클라우드가 활성/연결인 상태의 표시·로컬 복귀는 이 값과 무관하게 유지.
  cloudEnabled: boolean;
}

export function useDaemonStatus(pollMs = 8000): ComputeStatus {
  const [daemon, setDaemon] = useState<DaemonStatus | null>(null);
  const [cloudOnline, setCloudOnline] = useState(true);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(() => {
    daemonService.getStatus()
      .then((s) => { setDaemon(s); setCloudOnline(true); })
      .catch(() => { setCloudOnline(false); })
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(useCallback(() => {
    refresh();
    timerRef.current = setInterval(refresh, pollMs);
    return () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };
  }, [refresh, pollMs]));

  const hasDevice = !!(daemon?.current || daemon?.devices?.length);
  const runners = daemon?.runners || [];
  const localRunner = runners.find((r) => r.kind === 'local') || null;
  const cloudRunner = runners.find((r) => r.kind === 'cloud') || null;
  const activeRunnerKind = runners.find((r) => r.active)?.kind ?? null;
  return {
    daemon, localOnline: !!daemon?.online, hasDevice, cloudOnline, loading, refresh,
    runners, localRunner, cloudRunner, hasCloudRunner: !!cloudRunner, activeRunnerKind,
    cloudEnabled: daemon?.cloudEnabled === true,
  };
}

export default useDaemonStatus;
