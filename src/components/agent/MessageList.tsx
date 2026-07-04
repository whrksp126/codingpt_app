import React, { useEffect, useRef } from 'react';
import { View, Text, Pressable, ScrollView, Platform } from 'react-native';
import { AgentMsg } from '../../types/agentSession';
import ChatMarkdown from './ChatMarkdown';

// 에이전트 채팅 메시지 목록 — 메인 채팅·IDE 공용 렌더(버블/thinking/툴 카드).
// (MobileIDE AgentPanel 의 메시지 렌더를 추출.)

const baseOf = (p: string) => (p.includes('/') ? p.slice(p.lastIndexOf('/') + 1) : p);

const toolLabel = (m: Extract<AgentMsg, { role: 'tool' }>): string => {
  if (m.tool === 'Bash') return `$ ${m.command || ''}`;
  if (m.tool === 'Write') return `파일 생성 · ${m.relPath || ''}`;
  if (m.tool === 'Edit' || m.tool === 'MultiEdit') return `파일 수정 · ${m.relPath || ''}`;
  if (m.tool === 'Read') return `읽기 · ${m.relPath || ''}`;
  return m.relPath ? `${m.tool} · ${m.relPath}` : m.tool;
};

interface Props {
  messages: AgentMsg[];
  onOpenFile?: (relPath: string) => void;
  contentPadding?: number;
  bottomInset?: number;   // 하단 컴포저가 오버레이될 때 마지막 메시지가 가리지 않도록
}

const MessageList: React.FC<Props> = ({ messages, onOpenFile, contentPadding = 14, bottomInset = 0 }) => {
  const scrollRef = useRef<ScrollView>(null);
  // 스트리밍 중에는 토큰마다 messages 가 바뀐다. 매번 애니메이션 스크롤하면 애니메이션이
  // 겹쳐 잰크가 생기고, 긴 대화를 처음 열 때도 끝까지 애니메이션하느라 느리다 → 즉시 점프.
  useEffect(() => {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: false }));
  }, [messages]);
  const mono = Platform.OS === 'ios' ? 'Menlo' : 'monospace';

  return (
    <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: contentPadding, paddingTop: contentPadding, paddingBottom: contentPadding + bottomInset, gap: 10 }} keyboardShouldPersistTaps="handled">
      {messages.map((m) => {
        if (m.role === 'user') {
          return (
            <View key={m.id} style={{ alignSelf: 'flex-end', maxWidth: '88%', backgroundColor: '#1D4ED8', borderRadius: 14, borderTopRightRadius: 4, paddingHorizontal: 12, paddingVertical: 9 }}>
              <Text style={{ color: '#fff', fontSize: 14, lineHeight: 20 }}>{m.text}</Text>
            </View>
          );
        }
        if (m.role === 'assistant') {
          // 모바일 화면을 최대한 채우도록 가로 폭 제한 없이 표시(우측 여백 제거).
          return (
            <View key={m.id} style={{ alignSelf: 'stretch' }}>
              <ChatMarkdown text={m.text} />
            </View>
          );
        }
        if (m.role === 'thinking') {
          return (
            <Text key={m.id} style={{ color: '#475569', fontSize: 12, fontStyle: 'italic', alignSelf: 'flex-start', maxWidth: '92%' }} numberOfLines={2}>
              💭 {m.text}
            </Text>
          );
        }
        // tool
        const tappable = !!m.relPath;
        const statusColor = m.ok === undefined ? '#64748B' : m.ok ? '#34D399' : '#F87171';
        const statusMark = m.ok === undefined ? '…' : m.ok ? '✓' : '✕';
        return (
          <Pressable
            key={m.id}
            disabled={!tappable || !onOpenFile}
            onPress={() => m.relPath && onOpenFile?.(m.relPath)}
            style={{ alignSelf: 'flex-start', maxWidth: '92%', backgroundColor: '#11151F', borderWidth: 1, borderColor: '#1C2230', borderRadius: 10, paddingHorizontal: 11, paddingVertical: 8 }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ color: statusColor, fontSize: 12 }}>{statusMark}</Text>
              <Text style={{ color: '#CBD5E1', fontSize: 12.5, fontFamily: mono, flexShrink: 1 }} numberOfLines={1}>{toolLabel(m)}</Text>
              {tappable && onOpenFile && <Text style={{ color: '#60A5FA', fontSize: 11 }}>열기 ›</Text>}
            </View>
            {m.tool === 'Bash' && m.output ? (
              <Text style={{ color: '#94A3B8', fontSize: 11.5, fontFamily: mono, marginTop: 5 }} numberOfLines={6}>
                {m.output.replace(/\n$/, '')}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
};

export { baseOf };
export default MessageList;
