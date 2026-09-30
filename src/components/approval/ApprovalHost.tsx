import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { X } from 'phosphor-react-native';

import { v2 } from '../../theme/v2Tokens';
import { collapseKeyAssist } from '../keyboard/KeyAssist';
import Sheet from '../ui/Sheet';
import IconButton from '../ui/IconButton';
import { useWorkspaceShell } from '../../contexts/WorkspaceShellContext';
import ApprovalCard from './ApprovalCard';
import { closeApprovalCard, getOpenApprovalId, subscribeApprovalUi } from './approvalUi';
import * as i18n from '../../i18n/index.ts';
import { useOverlayLayer, type OverlayLayer } from '../modalLayer';

// 승인 카드 전체 모달 — 알림 배너 탭/딥링크(codingpt://approval/<id>) 진입점.
//  셸에 1회만 마운트한다(NotificationsPanel 과 동일 관례). 화면 안 도크는 QuestionDock(터미널 탭 스코프).
//
// Modal 안에서는 KeyAssist 오버레이를 따로 깔아야 보조바/특수키 패널이 보인다(자유 입력용) —
//  RN Modal 은 별도 뷰 계층이라 셸에 깔린 오버레이가 올라오지 않는다(기존 규율). Sheet 가 자동으로 깐다.
export default function ApprovalHost({ layer = 'root' }: { layer?: OverlayLayer } = {}) {
  const C = v2.colors;
  const S = useWorkspaceShell();
  const [id, setId] = useState<string | null>(getOpenApprovalId());
  // 작업 현황판이 떠 있으면 그 Modal 안의 인스턴스가 그린다(iOS 형제 모달 present 거부 — modalLayer.ts).
  const cur = useOverlayLayer();

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

  // 닫힘 애니메이션 동안에도 카드가 비지 않게 마지막 요청을 붙들어 둔다.
  const lastRef = useRef(approval);
  if (approval) lastRef.current = approval;
  const shown = approval || (id ? undefined : lastRef.current);

  // 다른 층(작업 현황판 Modal 안)의 인스턴스가 그리는 중 — 여기서는 아무것도 그리지 않는다(한 번에 한 곳).
  if (cur !== layer) return null;

  // 바텀시트 정본(Sheet): 스크림 fade + spring 슬라이드 + 그래버 + 드래그 닫기 + KeyAssistOverlay 자동 마운트.
  //  Sheet 도 RN Modal 하나라 modalLayer 규칙(층 판정)은 위에서 그대로 지켜진다.
  return (
    <Sheet
      visible={!!id}
      onClose={closeApprovalCard}
      maxHeightPct={0.9}
      paddingHorizontal={12}
      header={(
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingBottom: 8 }}>
          <Text accessibilityRole="header" style={{ flex: 1, color: C.text, fontSize: v2.font.size.h2, fontWeight: '600', fontFamily: v2.font.sans }}>{i18n.t('승인 요청')}</Text>
          <IconButton icon={X} onPress={closeApprovalCard} accessibilityLabel={i18n.t('닫기')} />
        </View>
      )}
    >
      <ScrollView style={{ maxHeight: 520 }} keyboardShouldPersistTaps="handled">
        {shown ? (
          <ApprovalCard
            approval={shown}
            busy={!!shown.claimed}
            onRespond={(d, o) => {
              void S.respondApproval(shown.id, d, o).finally(() => closeApprovalCard());
            }}
            onDismiss={closeApprovalCard}
          />
        ) : (
          <Text style={{ color: C.textDim, fontSize: v2.font.size.small, padding: 12 }}>
            {i18n.t('이 승인 요청은 이미 처리됐거나 만료됐어요.')}
          </Text>
        )}
      </ScrollView>
    </Sheet>
  );
}
