import React, { useState } from 'react';
// RN 0.80 코어 Clipboard(deprecated이나 동작) — 신규 네이티브 의존성 추가 없이 복사 지원.
import { View, Text, ScrollView, Pressable, Platform, Clipboard } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { Copy, Check } from 'phosphor-react-native';

const MONO = Platform.OS === 'ios' ? 'Menlo' : 'monospace';

// 채팅 어시스턴트 마크다운(GitHub-flavored) 다크 테마 — 메시지마다 재생성되지 않도록 모듈 상수.
const mdStyles: any = {
  body: { color: '#E2E8F0', fontSize: 14, lineHeight: 21 },
  // 제목
  heading1: { color: '#F8FAFC', fontSize: 19, fontWeight: '800', marginTop: 6, marginBottom: 6, lineHeight: 26 },
  heading2: { color: '#F8FAFC', fontSize: 17, fontWeight: '800', marginTop: 6, marginBottom: 5, lineHeight: 24 },
  heading3: { color: '#F1F5F9', fontSize: 15.5, fontWeight: '700', marginTop: 4, marginBottom: 4, lineHeight: 22 },
  heading4: { color: '#F1F5F9', fontSize: 14.5, fontWeight: '700', marginTop: 4, marginBottom: 3 },
  heading5: { color: '#E2E8F0', fontSize: 14, fontWeight: '700' },
  heading6: { color: '#CBD5E1', fontSize: 13.5, fontWeight: '700' },
  paragraph: { marginTop: 2, marginBottom: 8, color: '#E2E8F0' },
  strong: { fontWeight: '800', color: '#F8FAFC' },
  em: { fontStyle: 'italic' },
  s: { textDecorationLine: 'line-through', color: '#94A3B8' },
  link: { color: '#60A5FA', textDecorationLine: 'underline' },
  blockquote: {
    backgroundColor: '#11151F', borderLeftWidth: 3, borderLeftColor: '#34D399',
    paddingHorizontal: 12, paddingVertical: 6, marginVertical: 6, borderRadius: 6,
  },
  bullet_list: { marginTop: 2, marginBottom: 6 },
  ordered_list: { marginTop: 2, marginBottom: 6 },
  list_item: { marginVertical: 2, color: '#E2E8F0' },
  bullet_list_icon: { color: '#34D399' },
  ordered_list_icon: { color: '#94A3B8' },
  hr: { backgroundColor: '#1C2230', height: 1, marginVertical: 10 },
  // 인라인 코드 — pill
  code_inline: {
    backgroundColor: '#11151F', color: '#FDA4AF', borderWidth: 1, borderColor: '#1C2230',
    paddingHorizontal: 5, paddingVertical: 1, borderRadius: 5, fontFamily: MONO, fontSize: 13,
  },
  // 표
  table: { borderWidth: 1, borderColor: '#1C2230', borderRadius: 8, marginVertical: 6 },
  thead: { backgroundColor: '#11151F' },
  th: { padding: 7, color: '#F1F5F9', fontWeight: '700', fontSize: 13 },
  tr: { borderBottomWidth: 1, borderColor: '#1C2230' },
  td: { padding: 7, color: '#CBD5E1', fontSize: 13 },
};

// 코드 펜스 — 다크 박스 + 언어 라벨 + 복사 + 가로 스크롤.
function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = () => {
    try { Clipboard.setString(code); setCopied(true); setTimeout(() => setCopied(false), 1400); } catch (_) { /* noop */ }
  };
  return (
    <View style={{ backgroundColor: '#0A0D14', borderWidth: 1, borderColor: '#1C2230', borderRadius: 10, marginVertical: 6, overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 12, paddingRight: 8, paddingVertical: 6, backgroundColor: '#11151F', borderBottomWidth: 1, borderBottomColor: '#1C2230' }}>
        <Text style={{ color: '#64748B', fontSize: 11, fontFamily: MONO, letterSpacing: 0.3 }}>{(lang || 'code').toLowerCase()}</Text>
        <Pressable onPress={onCopy} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 3 }}>
          {copied ? <Check size={13} color="#34D399" weight="bold" /> : <Copy size={13} color="#94A3B8" />}
          <Text style={{ color: copied ? '#34D399' : '#94A3B8', fontSize: 11, fontWeight: '600' }}>{copied ? '복사됨' : '복사'}</Text>
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: 12 }}>
        <Text selectable style={{ color: '#E2E8F0', fontSize: 12.5, lineHeight: 19, fontFamily: MONO }}>{code}</Text>
      </ScrollView>
    </View>
  );
}

const trimFence = (s: string) => (typeof s === 'string' && s.endsWith('\n') ? s.slice(0, -1) : s);

// 커스텀 렌더 룰 — fence/code_block 을 CodeBlock 으로. 모듈 상수.
const mdRules: any = {
  fence: (node: any) => <CodeBlock key={node.key} code={trimFence(node.content)} lang={node.sourceInfo} />,
  code_block: (node: any) => <CodeBlock key={node.key} code={trimFence(node.content)} lang={node.sourceInfo} />,
};

const ChatMarkdown: React.FC<{ text: string }> = ({ text }) => (
  <Markdown style={mdStyles} rules={mdRules}>{text}</Markdown>
);

export default ChatMarkdown;
