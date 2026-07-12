import React from 'react';
import { View, Text, Pressable, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X, Sparkle } from 'phosphor-react-native';
import { v2 } from '../theme/v2Tokens';
import { useAgentSession } from '../contexts/AgentSessionContext';
import MessageList from '../components/agent/MessageList';
import ChatComposer from '../components/agent/ChatComposer';
import PermissionDiffModal from '../components/agent/PermissionDiffModal';

const C = v2.colors;

// AI 바텀시트 — 워크스페이스 진입 확인 후 열리는 터치 최적화 에이전트 채팅.
//   AgentSessionContext 를 그대로 소비(메시지/입력/승인). 닫아도 세션은 백그라운드 지속 → 다시 열면 이어짐.
export default function AiSheet({ visible, onClose, onOpenFile }: { visible: boolean; onClose: () => void; onOpenFile?: (rel: string) => void }) {
  const { activeWorkspace, messages, input, setInput, send, running, pendingPermission, resolvePermission } = useAgentSession();

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <SafeAreaView edges={['bottom']} style={{ height: '82%', backgroundColor: C.base, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderTopWidth: 1, borderColor: C.border, overflow: 'hidden' }}>
          {/* 헤더 */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, height: 48, borderBottomWidth: 1, borderBottomColor: C.border }}>
            <Sparkle size={18} color={C.accent} weight="fill" />
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.text, fontSize: 14, fontWeight: '700' }} numberOfLines={1}>AI 에이전트</Text>
              {activeWorkspace ? <Text style={{ color: C.textDim, fontSize: 11 }} numberOfLines={1}>{activeWorkspace.name}{running ? ' · 실행 중' : ''}</Text> : null}
            </View>
            <Pressable onPress={onClose} hitSlop={8} style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
              <X size={20} color={C.text2} />
            </Pressable>
          </View>

          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={{ flex: 1 }}>
              <MessageList messages={messages} onOpenFile={onOpenFile} bottomInset={8} />
            </View>
            <ChatComposer
              value={input}
              onChange={setInput}
              onSend={() => { const t = input.trim(); if (t) void send(t); }}
              running={running}
              placeholder="무엇을 만들까요?"
              safeBottom={false}
            />
          </KeyboardAvoidingView>
        </SafeAreaView>
      </View>

      {/* 승인 요청(파일 수정 diff) */}
      {pendingPermission ? (
        <PermissionDiffModal
          pending={pendingPermission as any}
          onApprove={() => resolvePermission('allow')}
          onReject={() => resolvePermission('deny')}
        />
      ) : null}
    </Modal>
  );
}
