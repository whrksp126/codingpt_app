import React, { useEffect, useRef } from 'react';
import { View, Text, Pressable, Modal } from 'react-native';
import { Sparkle } from 'phosphor-react-native';
import { v2 } from '../theme/v2Tokens';
import { useWorkspaceShell } from '../contexts/WorkspaceShellContext';
import { useAgentSession } from '../contexts/AgentSessionContext';
import { useAiControl, AI_HYBRID_HIDDEN } from '../contexts/AiControlContext';
import AiSheet from './AiSheet';

const C = v2.colors;

// AiController — PC 는 터미널에서 claude 를 직접 실행하지만, 모바일은 터치 최적화 하이브리드:
//   워크스페이스 열 때마다 "기본 에이전트를 실행할까요?" 확인 → 예 → 구조화 RPC 세션 시작 + 바텀시트.
//   시트를 닫아도 세션은 백그라운드 지속(승인 대기 시 자동으로 다시 열림).
//   실행 트리거(버튼)는 각 터미널 pane 헤더로 이동했다(AiControlContext 공유). 여기선 시트/프롬프트만 렌더.
export default function AiController() {
  const S = useWorkspaceShell();
  const { pendingPermission } = useAgentSession();
  const { sheetOpen, setSheetOpen, promptOpen, setPromptOpen, startSession } = useAiControl();
  const ws = S.activeWs();

  const prevActiveRef = useRef<string | null>(null);

  // 워크스페이스가 바뀔 때마다(매번) 실행 확인. (AI 하이브리드 숨김 시엔 표시하지 않음)
  useEffect(() => {
    if (AI_HYBRID_HIDDEN) return;
    const id = S.activeWsId;
    if (id && id !== prevActiveRef.current) {
      prevActiveRef.current = id;
      setPromptOpen(true);
    }
    if (!id) prevActiveRef.current = null;
  }, [S.activeWsId, setPromptOpen]);

  // 승인 요청이 오면(백그라운드 진행 중) 시트를 자동으로 열어 놓치지 않게.
  useEffect(() => { if (pendingPermission) setSheetOpen(true); }, [pendingPermission, setSheetOpen]);

  if (!ws || AI_HYBRID_HIDDEN) return null;

  return (
    <>
      <AiSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} />

      {/* 진입 확인 프롬프트 */}
      <Modal visible={promptOpen} transparent animationType="fade" supportedOrientations={['portrait', 'portrait-upside-down', 'landscape', 'landscape-left', 'landscape-right']} onRequestClose={() => setPromptOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 24 }} onPress={() => setPromptOpen(false)}>
          <Pressable style={{ width: '100%', maxWidth: 320, backgroundColor: C.elevated, borderRadius: v2.radius.lg, borderWidth: 1, borderColor: C.border, padding: 20, gap: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Sparkle size={20} color={C.accent} weight="fill" />
              <Text style={{ color: C.text, fontSize: 15, fontWeight: '700' }}>AI 에이전트 실행</Text>
            </View>
            <Text style={{ color: C.text2, fontSize: 13, lineHeight: 19 }}>
              이 워크스페이스에서 Claude를 실행할까요?{'\n'}이후 승인·대화는 터치 모드로 처리됩니다.
            </Text>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
              <Pressable onPress={() => setPromptOpen(false)} style={{ paddingHorizontal: 16, paddingVertical: 9 }}>
                <Text style={{ color: C.textDim, fontSize: 13 }}>나중에</Text>
              </Pressable>
              <Pressable onPress={() => { setPromptOpen(false); void startSession(); }} style={{ paddingHorizontal: 18, paddingVertical: 9, backgroundColor: C.cta, borderRadius: 8 }}>
                <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>실행</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
