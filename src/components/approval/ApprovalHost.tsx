import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X } from 'phosphor-react-native';

import { v2 } from '../../theme/v2Tokens';
import { KeyAssistOverlay, collapseKeyAssist } from '../keyboard/KeyAssist';
import { useWorkspaceShell } from '../../contexts/WorkspaceShellContext';
import ApprovalCard from './ApprovalCard';
import { closeApprovalCard, getOpenApprovalId, subscribeApprovalUi } from './approvalUi';

// 승인 카드 전체 모달 — 알림 배너 탭/딥링크(codingpt://approval/<id>) 진입점.
//  셸에 1회만 마운트한다(NotificationsPanel 과 동일 관례). 화면 안 도크는 QuestionDock(터미널 탭 스코프).
//
// Modal 안에서는 KeyAssist 오버레이를 따로 깔아야 보조바/특수키 패널이 보인다(자유 입력용) —
//  RN Modal 은 별도 뷰 계층이라 셸에 깔린 오버레이가 올라오지 않는다(기존 규율).
export default function ApprovalHost() {
  const C = v2.colors;
  const S = useWorkspaceShell();
  const [id, setId] = useState<string | null>(getOpenApprovalId());

  useEffect(() => subscribeApprovalUi(() => setId(getOpenApprovalId())), []);
  useEffect(() => { if (id) collapseKeyAssist(); }, [id]);

  const approval = id ? S.approvals.find((a) => a.id === id) : undefined;
  // 열려 있는데 목록에서 사라졌다 = 다른 기기/PC 가 먼저 응답했거나 만료 → 모달을 닫는다.
  useEffect(() => {
    if (id && !approval) {
      const t = setTimeout(() => { if (!S.approvals.some((a) => a.id === id)) closeApprovalCard(); }, 1200);
      return () => clearTimeout(t);
    }
  }, [id, approval, S.approvals]);

  if (!id) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={closeApprovalCard}>
      <View style={{ flex: 1, backgroundColor: 'rgba(5,7,12,0.72)' }}>
        <Pressable style={{ flex: 1 }} onPress={closeApprovalCard} />
        <SafeAreaView edges={['bottom']} style={{ backgroundColor: C.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, borderTopWidth: 1, borderColor: C.border }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, height: 46 }}>
            <Text style={{ flex: 1, color: C.text, fontSize: 15, fontWeight: '700' }}>승인 요청</Text>
            <Pressable onPress={closeApprovalCard} hitSlop={10}>
              <X size={18} color={C.text3} />
            </Pressable>
          </View>
          <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={{ padding: 12, paddingTop: 0 }} keyboardShouldPersistTaps="handled">
            {approval ? (
              <ApprovalCard
                approval={approval}
                busy={!!approval.claimed}
                onRespond={(d, o) => {
                  void S.respondApproval(approval.id, d, o).finally(() => closeApprovalCard());
                }}
                onDismiss={closeApprovalCard}
              />
            ) : (
              <Text style={{ color: C.textDim, fontSize: 12.5, padding: 12 }}>
                이 승인 요청은 이미 처리됐거나 만료됐어요.
              </Text>
            )}
          </ScrollView>
        </SafeAreaView>
      </View>
      <KeyAssistOverlay inModal />
    </Modal>
  );
}
