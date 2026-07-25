import React, { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X } from 'phosphor-react-native';

import { v2 } from '../../theme/v2Tokens';
import { collapseKeyAssist, KeyAssistOverlay } from '../keyboard/KeyAssist';
import { useWorkspaceShell } from '../../contexts/WorkspaceShellContext';
import DeviceTrustCard, { DeviceTrustWaiting } from './DeviceTrustCard';
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
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => subscribeDeviceTrustUi(() => setOpen(isDeviceTrustSheetOpen())), []);
  // 시트가 열릴 때마다 목록을 다시 당긴다(push 는 힌트, pull 이 정본 — 승인 카드와 동일 규율).
  const reload = S.reloadDeviceTrust;
  useEffect(() => { if (open) { collapseKeyAssist(); setErr(null); void reload(); } }, [open, reload]);

  const status = S.e2ee;
  const pending = S.trustRequests;
  const selfPending = status.state === 'pending' && !!status.safetyCode;

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
    catch (e: any) { setErr(e?.message || '승인을 전달하지 못했어요.'); }
    finally { setBusyId(null); }
  }, [S]);
  const deny = useCallback(async (id: string) => {
    setBusyId(id);
    setErr(null);
    try { await S.denyDeviceTrust(id); }
    catch (e: any) { setErr(e?.message || '거절을 전달하지 못했어요.'); }
    finally { setBusyId(null); }
  }, [S]);

  if (!open) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={closeDeviceTrustSheet}>
      <View style={{ flex: 1, backgroundColor: 'rgba(5,7,12,0.72)' }}>
        <Pressable style={{ flex: 1 }} onPress={closeDeviceTrustSheet} />
        <SafeAreaView edges={['bottom']} style={{ backgroundColor: C.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, borderTopWidth: 1, borderColor: C.border }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, height: 46 }}>
            <Text style={{ flex: 1, color: C.text, fontSize: 15, fontWeight: '700' }}>기기 승인</Text>
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
                busy={refreshing}
                onRefresh={() => {
                  setRefreshing(true);
                  void S.refreshE2ee().finally(() => setRefreshing(false));
                }}
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
              <Text style={{ color: C.textDim, fontSize: 12.5, padding: 12 }}>
                대기 중인 기기 승인 요청이 없어요(이미 처리됐거나 만료됐습니다).
              </Text>
            ) : null}
          </ScrollView>
        </SafeAreaView>
      </View>
      <KeyAssistOverlay inModal />
    </Modal>
  );
}
