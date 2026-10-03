// VmScreenHost — 에이전트 PC(VM) 의 화면 장소. 셸(RootNavigator)에 1회 마운트, vmScope.openVm(os) 로 연다.
//  PC vm-view.js 의 미러: 머리줄(이름 · 준비 상태) + 그 VM 의 화면(EmulatorBody, desktop:<os>).
//  TasksDashboardHost·AutomationsHost 의 형제 층(메인 칼럼에서 워크스페이스 위를 덮는다, 모달 아님).
import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SidebarSimple } from 'phosphor-react-native';
import { v2 } from '../theme/v2Tokens';
import IconButton from '../components/ui/IconButton';
import PressableScale from '../components/ui/PressableScale';
import { useDrawer } from '../contexts/DrawerContext';
import { useResponsive } from '../hooks/useResponsive';
import { useWorkspaceShell } from '../contexts/WorkspaceShellContext';
import { desktopAgentRpc, type VmAgentStatus } from '../services/daemonService';
import * as i18n from '../i18n/index.ts';
import EmulatorBody from './EmulatorBody';
import { useVm, vmLabel } from './vmScope';

export default function VmScreenHost() {
  const C = v2.colors;
  const vm = useVm();
  const insets = useSafeAreaInsets();
  const S = useWorkspaceShell();
  const { isWide } = useResponsive();
  const { openDrawer, dockedOpen, toggleDocked } = useDrawer();
  const host = Number(S.resolvedDeviceId()) || 0;
  const os = vm.os;
  const open = !!os && vm.screen;
  const [st, setSt] = useState<VmAgentStatus | null>(null);
  const [err, setErr] = useState('');

  // 준비 상태 — 열려 있는 동안 5초마다(켜는 중·설치 중에는 스스로 바뀐다). 옛 데몬은 조용히 빈칸.
  useEffect(() => {
    if (!open || !os || !host) return;
    let dead = false;
    const ask = () => desktopAgentRpc<VmAgentStatus>('status', host, os).then((r) => { if (!dead) { setSt(r); setErr(''); } }).catch(() => { /* 미지원 데몬 */ });
    setSt(null); ask();
    const t = setInterval(ask, 5000);
    return () => { dead = true; clearInterval(t); };
  }, [open, os, host]);

  if (!open || !os) return null;
  const job = st?.job;
  const steps: Record<string, string> = {
    boot: i18n.t('VM 을 켜는 중…'), key: i18n.t('연결을 준비하는 중…'), cli: i18n.t('에이전트를 설치하는 중… (1~2분)'),
    git: i18n.t('도구를 확인하는 중…'), tools: i18n.t('화면 도구를 넣는 중…'),
  };
  let msg = '';
  let canSetup = false;
  if (err) msg = err;
  else if (job?.running) msg = steps[job.step] || i18n.t('준비하는 중…');
  else if (job?.error) { msg = job.error; canSetup = true; }
  else if (!st) msg = '';
  else if (st.phase !== 'running') msg = i18n.t('꺼져 있어요');
  else if (!st.cli) { msg = i18n.t('이 VM 에 에이전트가 아직 없어요'); canSetup = true; }
  else if (st.loggedIn === false) msg = i18n.t('VM 안에서 한 번 로그인해 주세요 — VM 워크스페이스의 터미널에서 `claude auth login`');
  else msg = i18n.t('에이전트 준비됨');

  return (
    <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0,
      paddingTop: insets.top, paddingBottom: insets.bottom, paddingRight: insets.right, paddingLeft: isWide && dockedOpen ? 0 : insets.left,
      backgroundColor: C.surface }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingHorizontal: 6, gap: 4, borderBottomWidth: 1, borderBottomColor: C.border }}>
        {!isWide || !dockedOpen ? (
          <IconButton onPress={isWide ? toggleDocked : openDrawer} accessibilityLabel={i18n.t('사이드바')} size={38}>
            <SidebarSimple size={20} color={C.text2} />
          </IconButton>
        ) : <View style={{ width: 6 }} />}
        <View style={{ flex: 1, minWidth: 0, paddingVertical: 4 }}>
          <Text numberOfLines={1} style={{ color: C.text, fontSize: v2.font.size.h2, fontWeight: '600' }}>{vmLabel(os)}</Text>
          {msg ? <Text numberOfLines={2} style={{ color: C.textDim, fontSize: 12 }}>{msg}</Text> : null}
        </View>
        {canSetup ? (
          <PressableScale scaleTo={0.96} hitSlop={6} accessibilityRole="button"
            onPress={() => { desktopAgentRpc<VmAgentStatus>('setup', host, os).then(setSt).catch((e) => setErr(String(e?.message || e))); }}
            style={{ height: 30, paddingHorizontal: 10, borderRadius: v2.radius.sm, borderWidth: 1, borderColor: C.borderControl, alignItems: 'center', justifyContent: 'center', marginRight: 6 }}>
            <Text style={{ color: C.text2, fontSize: 12 }}>{i18n.t('에이전트 설치')}</Text>
          </PressableScale>
        ) : null}
      </View>
      <View style={{ flex: 1, backgroundColor: C.base }}>
        <EmulatorBody host={host} deviceId={`desktop:${os}`} onDeviceChange={() => { /* VM 장소는 기기를 바꾸지 않는다 */ }} active />
      </View>
    </View>
  );
}
