import React, { useMemo, useState } from 'react';
// RN 0.80 코어 Clipboard(deprecated 이나 동작) — 신규 네이티브 의존성 없이 복사 지원.
import { View, Text, ScrollView, Clipboard } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { Copy, Check } from 'phosphor-react-native';

import { v2 } from '../../theme/v2Tokens';
import PressableScale from '../../components/ui/PressableScale';

// 어시스턴트 마크다운 — react-native-markdown-display(package.json 기설치, 신규 의존성 0).
//
// ★ 삭제본(components/agent/ChatMarkdown.tsx, git 1d631c9^)의 스타일 맵을 그대로 이식하되 두 곳을 고쳤다:
//   ① 하드코딩 다크 색 → v2 토큰(라이트 모드 대응. 삭제본은 다크 전용이라 라이트에서 글자가 안 보였다)
//   ② 모듈 상수 mdStyles → **렌더 시점 생성**(v2Colors 는 제자리 교체 객체라 모듈 로드 시 굳히면
//      테마 전환이 안 먹는다 — v2Tokens.ts:82-85 규칙)
//
// 신택스 하이라이트는 v1 제외(§6-3 (a) 권장안): 언어 라벨 + mono + 가로 스크롤 + 복사로 대체.
//  3플랫폼 디자인 패리티를 지키는 대신 색은 포기한다(PC 에 하이라이터가 없다).

// 코드 폰트는 플랫폼 mono 를 쓴다 — 설정(fontSetting)의 코드 글꼴은 웹폰트(base64 @font-face)라
//  WebView 안에서만 유효하고 RN Text 에는 적용할 수 없다.
const monoFamily = () => v2.font.mono as string;

function buildStyles(C: typeof v2.colors) {
  return {
    body: { color: C.text2, fontSize: 14, lineHeight: 21 },
    heading1: { color: C.text, fontSize: 19, fontWeight: '800', marginTop: 6, marginBottom: 6, lineHeight: 26 },
    heading2: { color: C.text, fontSize: 17, fontWeight: '800', marginTop: 6, marginBottom: 5, lineHeight: 24 },
    heading3: { color: C.text, fontSize: 15.5, fontWeight: '700', marginTop: 4, marginBottom: 4, lineHeight: 22 },
    heading4: { color: C.text, fontSize: 14.5, fontWeight: '700', marginTop: 4, marginBottom: 3 },
    heading5: { color: C.text2, fontSize: 14, fontWeight: '700' },
    heading6: { color: C.text3, fontSize: 13.5, fontWeight: '700' },
    paragraph: { marginTop: 2, marginBottom: 8, color: C.text2 },
    strong: { fontWeight: '800', color: C.text },
    em: { fontStyle: 'italic' },
    s: { textDecorationLine: 'line-through', color: C.text3 },
    link: { color: C.info, textDecorationLine: 'underline' },
    blockquote: {
      backgroundColor: C.elevated, borderLeftWidth: 3, borderLeftColor: C.borderControl,
      paddingHorizontal: 12, paddingVertical: 6, marginVertical: 6, borderRadius: v2.radius.sm,
    },
    bullet_list: { marginTop: 2, marginBottom: 6 },
    ordered_list: { marginTop: 2, marginBottom: 6 },
    list_item: { marginVertical: 2, color: C.text2 },
    bullet_list_icon: { color: C.text3 },
    ordered_list_icon: { color: C.text3 },
    hr: { backgroundColor: C.border, height: 1, marginVertical: 10 },
    code_inline: {
      backgroundColor: C.elevated, color: C.warn, borderWidth: 1, borderColor: C.border,
      paddingHorizontal: 5, paddingVertical: 1, borderRadius: 5, fontFamily: monoFamily(), fontSize: 13,
    },
    table: { borderWidth: 1, borderColor: C.border, borderRadius: 8, marginVertical: 6 },
    thead: { backgroundColor: C.elevated },
    th: { padding: 7, color: C.text, fontWeight: '700', fontSize: 13 },
    tr: { borderBottomWidth: 1, borderColor: C.border },
    td: { padding: 7, color: C.text2, fontSize: 13 },
  } as any;
}

/** 코드 펜스 — 박스 + 언어 라벨 + 복사 + 가로 스크롤(pane 폭을 절대 넘지 않게 max 100%). */
export function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const C = v2.colors;
  const [copied, setCopied] = useState(false);
  const onCopy = () => {
    try { Clipboard.setString(code); setCopied(true); setTimeout(() => setCopied(false), 1400); } catch (_) { /* noop */ }
  };
  return (
    <View style={{ backgroundColor: C.base, borderWidth: 1, borderColor: C.border, borderRadius: v2.radius.md, marginVertical: 6, overflow: 'hidden', maxWidth: '100%' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 12, paddingRight: 8, paddingVertical: 6, backgroundColor: C.elevated, borderBottomWidth: 1, borderBottomColor: C.border }}>
        <Text style={{ color: C.textDim, fontSize: 11, fontFamily: monoFamily(), letterSpacing: 0.3 }}>{(lang || 'code').toLowerCase()}</Text>
        {/* 가로 ScrollView 안이 아니라 헤더에 두어 복사 버튼이 스크롤로 밀려 사라지지 않게 + hitSlop 확보 */}
        <PressableScale onPress={onCopy} hitSlop={10} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 3 }}>
          {copied ? <Check size={13} color={C.text2} weight="bold" /> : <Copy size={13} color={C.text3} />}
          <Text style={{ color: copied ? C.text2 : C.text3, fontSize: 11, fontWeight: '600' }}>{copied ? '복사됨' : '복사'}</Text>
        </PressableScale>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: 12 }}>
        <Text selectable style={{ color: C.text2, fontSize: 12.5, lineHeight: 19, fontFamily: monoFamily() }}>{code}</Text>
      </ScrollView>
    </View>
  );
}

const trimFence = (s: string) => (typeof s === 'string' && s.endsWith('\n') ? s.slice(0, -1) : s);

const ChatMarkdown: React.FC<{ text: string }> = ({ text }) => {
  const C = v2.colors;
  // 렌더 시점에 조립한다(모듈 상수로 굳히면 라이트 전환이 안 먹는다 — v2Colors 는 제자리 교체 객체).
  //  테마 전환은 셸 리마운트(App.tsx Main key=resolvedScheme)라 이 memo 도 새로 만들어진다.
  const styles = useMemo(() => buildStyles(C), [C]);
  const rules = useMemo(() => ({
    fence: (node: any) => <CodeBlock key={node.key} code={trimFence(node.content)} lang={node.sourceInfo} />,
    code_block: (node: any) => <CodeBlock key={node.key} code={trimFence(node.content)} lang={node.sourceInfo} />,
  }), []);
  return <Markdown style={styles} rules={rules as any}>{text}</Markdown>;
};

export default ChatMarkdown;
