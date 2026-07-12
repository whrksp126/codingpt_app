import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Modal } from 'react-native';
import { Sparkle } from 'phosphor-react-native';
import { v2 } from '../theme/v2Tokens';
import { useWorkspaceShell } from '../contexts/WorkspaceShellContext';
import { useAgentSession, ActiveWorkspace } from '../contexts/AgentSessionContext';
import { projectIdForWorkspace } from '../services/ideSource';
import AiSheet from './AiSheet';

const C = v2.colors;

// AiController — PC 는 터미널에서 claude 를 직접 실행하지만, 모바일은 터치 최적화 하이브리드:
//   워크스페이스 열 때마다 "기본 에이전트를 실행할까요?" 확인 → 예 → 구조화 RPC 세션 시작 + 바텀시트.
//   시트를 닫아도 세션은 백그라운드 지속(승인 대기 시 자동으로 다시 열림). FAB 로 언제든 재오픈.
export default function AiController() {
  const S = useWorkspaceShell();
  const { newSession, activeSessionId, pendingPermission } = useAgentSession();
  const ws = S.activeWs();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const prevActiveRef = useRef<string | null>(null);
  const startingRef = useRef(false);

  const toActiveWs = useCallback((w: NonNullable<typeof ws>): ActiveWorkspace => {
    const local = S.isLocal(w);
    return local
      ? { id: projectIdForWorkspace(w), name: w.name, kind: 'project', wsId: w.id, runnerKind: 'local' }
      : { id: w.id, name: w.name, kind: 'project' };
  }, [S]);

  const startSession = useCallback(async () => {
    if (!ws || startingRef.current) return;
    startingRef.current = true;
    try {
      await newSession(toActiveWs(ws));
      setSheetOpen(true);
    } catch (_) { /* noop */ } finally { startingRef.current = false; }
  }, [ws, newSession, toActiveWs]);

  // 워크스페이스가 바뀔 때마다(매번) 실행 확인.
  useEffect(() => {
    const id = S.activeWsId;
    if (id && id !== prevActiveRef.current) {
      prevActiveRef.current = id;
      setPromptOpen(true);
    }
    if (!id) prevActiveRef.current = null;
  }, [S.activeWsId]);

  // 승인 요청이 오면(백그라운드 진행 중) 시트를 자동으로 열어 놓치지 않게.
  useEffect(() => { if (pendingPermission) setSheetOpen(true); }, [pendingPermission]);

  if (!ws) return null;

  const openOrStart = () => { if (activeSessionId) setSheetOpen(true); else void startSession(); };

  return (
    <>
      {/* FAB — 언제든 AI 열기/시작 */}
      {!sheetOpen ? (
        <Pressable
          onPress={openOrStart}
          style={{ position: 'absolute', right: 16, bottom: 24, width: 52, height: 52, borderRadius: 26, backgroundColor: C.cta, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 5 }}
        >
          <Sparkle size={24} color="#fff" weight="fill" />
          {activeSessionId ? <View style={{ position: 'absolute', top: 6, right: 6, width: 9, height: 9, borderRadius: 5, backgroundColor: C.accent, borderWidth: 1.5, borderColor: C.cta }} /> : null}
        </Pressable>
      ) : null}

      <AiSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} />

      {/* 진입 확인 프롬프트 */}
      <Modal visible={promptOpen} transparent animationType="fade" onRequestClose={() => setPromptOpen(false)}>
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
