import React, { useEffect, useSyncExternalStore } from 'react';

import ConvBody, { type ConvBodyProps } from './ConvBody';
import convService from '../../services/convService';
import { useUser } from '../../contexts/UserContext';
import { useWorkspaceShell } from '../../contexts/WorkspaceShellContext';
import type { WorkspaceMeta } from '../../services/workspaceService';

// 채팅 표면 — 독립 pane 과 혼합 탭이 **같은 본문**을 쓰게 하는 얇은 껍데기.
//  여기서 정하는 것은 "이 워크스페이스의 PC 가 채팅을 할 수 있는가"와 "누구의 캐시인가" 둘뿐이다.
//  탭/pane 에 값을 쓰는 길(onPatch)은 부르는 쪽이 준다 — 탭은 tabs 배열을, pane 은 leaf 를 고친다.

export default function ChatSurface({
  ws, threadId, title, draft, active, onPatch, onFocusExisting, onOpenFile, onOpenTerminal,
}: {
  ws: WorkspaceMeta;
  threadId: string | null;
  title: string;
  draft: string;
  active: boolean;
  onPatch: ConvBodyProps['onPatch'];
  onFocusExisting?: ConvBodyProps['onFocusExisting'];
  onOpenFile?: (rel: string) => void;
  onOpenTerminal?: (agent: string, args: string[]) => void;
}) {
  const host = ws.hostDeviceId ?? null;
  const { user } = useUser();
  // caps 는 GET /status 한 벌을 기능들이 같이 쓴다. 아직 한 번도 안 받았으면 받아 온다(모름 → 막지 않는다).
  const supported = useSyncExternalStore(convService.subscribeHostCaps, () => convService.hostSupportsConv(host));
  useEffect(() => { if (!convService.capsLoaded()) void convService.refreshHostCaps(); }, []);
  const launchArgsOk = useSyncExternalStore(convService.subscribeHostCaps, convService.serverForwardsLaunchArgs);
  // PC 가 다시 켜지면 caps 가 바뀌었을 수 있다(그 사이 PC 앱을 업데이트했다).
  const online = (ws.hostOnline ?? true) !== false;
  useEffect(() => { if (online) void convService.refreshHostCaps(); }, [online]);
  // 이 대화를 **보고 있다** = 그 대화의 알림은 읽은 것이다(터미널 탭을 실제로 봤을 때 읽음 처리하는 것과 같은 규칙).
  //  안 하면 채팅에서 승인까지 끝냈는데도 탭의 점과 알림 배지가 남는다.
  const { notifications, markNotifRead } = useWorkspaceShell();
  useEffect(() => {
    if (!active || !threadId) return;
    const ids = notifications.filter((n) => !n.read && n.threadId === threadId).map((n) => n.id);
    if (ids.length) markNotifRead(ids);
  }, [active, threadId, notifications, markNotifRead]);
  return (
    <ConvBody
      cwd={ws.localPath || ''}
      host={host}
      hostOnline={online}
      supported={supported}
      account={(user as { id?: string | number } | null)?.id ?? null}
      wsName={ws.name}
      threadId={threadId}
      title={title}
      initialDraft={draft}
      active={active}
      onPatch={onPatch}
      onFocusExisting={onFocusExisting}
      onOpenFile={onOpenFile}
      // 터미널에서 이어가기 — 서버가 실행 인자를 데몬까지 넘겨 줄 때만 입구를 연다. 안 넘기는 서버에서는
      //  `--resume <id>` 가 떨어져 나가 **새 대화**가 실행된다(이어 가는 줄 알았는데 빈 대화 — 조용한 오동작).
      onOpenTerminal={launchArgsOk ? onOpenTerminal : undefined}
    />
  );
}
