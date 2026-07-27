import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X } from 'phosphor-react-native';

import { v2 } from '../../theme/v2Tokens';
import { collapseKeyAssist, KeyAssistOverlay } from '../keyboard/KeyAssist';
import { useWorkspaceShell } from '../../contexts/WorkspaceShellContext';
import DeviceTrustCard, { DeviceTrustWaiting } from './DeviceTrustCard';
import COPY from './e2eeCopy';
import { closeDeviceTrustSheet, isDeviceTrustSheetOpen, subscribeDeviceTrustUi } from './e2eeUi';

// 기기 승인 시트 — 셸에 1회만 마운트(ApprovalHost 관례 미러).
//  진입: 알림(kind='device_approval') 탭 · device_approval_event(request) 팬아웃 · 설정 화면.
//
// 두 역할을 한 화면에서 처리한다(새 컴포넌트 최소화):
//  ① 승인자 = 대기 중인 다른 기기 목록(확인 숫자 + 승인/거절)
//  ② 요청자 = 이 기기가 pending 일 때 자기 확인 숫자 + 대기 안내
//
// 하나가 처리하면 나머지 기기의 카드는 서버 resolved 팬아웃 + 알림 읽음(크로스기기 dismiss)으로
//  자동 회수된다 — 여기서는 목록에서 사라지면 시트를 닫는 것만 담당한다.
export default function DeviceTrustHost() {
  const C = v2.colors;
  const S = useWorkspaceShell();
  const [open, setOpen] = useState(isDeviceTrustSheetOpen());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => subscribeDeviceTrustUi(() => setOpen(isDeviceTrustSheetOpen())), []);
  // 시트가 열릴 때마다 목록을 다시 당긴다(push 는 힌트, pull 이 정본 — 승인 카드와 동일 규율).
  const reload = S.reloadDeviceTrust;
  useEffect(() => { if (open) { collapseKeyAssist(); setErr(null); void reload(); } }, [open, reload]);

  const status = S.e2ee;
  //  ★ 2026-07-28: **승인할 수 있는 요청만** 그린다. 실사고 = 폰이 '새 기기 승인 · Android' 카드를
  //   보고 있었는데 그것은 자기 자신의 옛 enrollment 였다(재설치·계정 전환으로 신원키가 갈라지면 같은
  //   기기가 두 항목이 된다). 서버 approve 는 승인자가 trusted 여야 하므로 눌러도 403 이다 →
  //   ① 열쇠가 없는 기기(=ready 아님)에는 요청을 아예 그리지 않는다(여기) ② 자기 ikX 요청은 목록에서
  //   제외한다(services/e2ee.ts decoratePending — 거기가 자기 공개키를 아는 유일한 곳이다).
  //   서버(deviceTrustService.listPending)도 같은 두 규칙을 건다(이중 방어).
  const canApprove = status.ready;
  const pending = useMemo(
    () => (canApprove ? S.trustRequests : []),
    [canApprove, S.trustRequests],
  );
  // 안전 코드가 아직 없어도(파생 기준 미상) 대기 화면은 그린다 — 대기 화면 전용 경고
  //  (`COPY.wait.noSafety` = 누르지 말아야 할 곳까지 명시)를 직접 표시한다. 과거처럼 코드가 없으면
  //  화면을 통째로 숨기면 사용자는 "왜 아무것도 안 뜨나" 만 보고 상태를 알 수 없었다.
  const selfPending = status.state === 'pending';

  // 처리할 것이 아무것도 남지 않으면 시트를 닫는다(다른 기기가 먼저 눌렀거나 만료).
  useEffect(() => {
    if (!open) return;
    if (pending.length === 0 && !selfPending) {
      const t = setTimeout(() => closeDeviceTrustSheet(), 900);
      return () => clearTimeout(t);
    }
  }, [open, pending.length, selfPending]);

  const approve = useCallback(async (id: string, ikX: string) => {
    setBusyId(id);
    setErr(null);
    try { await S.approveDeviceTrust(id, ikX); }
    catch (e: any) { setErr(e?.message || COPY.err.approve); }
    finally { setBusyId(null); }
  }, [S]);
  const deny = useCallback(async (id: string) => {
    setBusyId(id);
    setErr(null);
    try { await S.denyDeviceTrust(id); }
    catch (e: any) { setErr(e?.message || COPY.err.deny); }
    finally { setBusyId(null); }
  }, [S]);

  if (!open) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={closeDeviceTrustSheet}>
      <View style={{ flex: 1, backgroundColor: 'rgba(5,7,12,0.72)' }}>
        <Pressable style={{ flex: 1 }} onPress={closeDeviceTrustSheet} />
        <SafeAreaView edges={['bottom']} style={{ backgroundColor: C.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, borderTopWidth: 1, borderColor: C.border }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, height: 46 }}>
            <Text style={{ flex: 1, color: C.text, fontSize: 15, fontWeight: '700' }}>{COPY.sheet.title}</Text>
            <Pressable onPress={closeDeviceTrustSheet} hitSlop={10}>
              <X size={18} color={C.text3} />
            </Pressable>
          </View>
          <ScrollView style={{ maxHeight: 560 }} contentContainerStyle={{ padding: 12, paddingTop: 0, gap: 10 }} keyboardShouldPersistTaps="handled">
            {err ? (
              <View style={{ borderWidth: 1, borderColor: C.error, borderRadius: v2.radius.sm, padding: 10 }}>
                <Text style={{ color: C.error, fontSize: 12 }}>{err}</Text>
              </View>
            ) : null}

            {selfPending ? (
              <DeviceTrustWaiting
                safety={status.safetyCode || ''}
                code={status.verifyCode || ''}
                onLater={closeDeviceTrustSheet}
              />
            ) : null}

            {pending.map((d) => (
              <DeviceTrustCard
                key={d.enrollmentId}
                device={d}
                busy={busyId === d.enrollmentId}
                onApprove={() => void approve(d.enrollmentId, d.ikX)}
                onDeny={() => void deny(d.enrollmentId)}
              />
            ))}

            {pending.length === 0 && !selfPending ? (
              <Text style={{ color: C.textDim, fontSize: 12.5, padding: 12 }}>{COPY.sheet.empty}</Text>
            ) : null}
          </ScrollView>
        </SafeAreaView>
      </View>
      <KeyAssistOverlay inModal />
    </Modal>
  );
}
