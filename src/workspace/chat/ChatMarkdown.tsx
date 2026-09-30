import React, { useMemo, useState } from 'react';
// RN 0.80 코어 Clipboard(deprecated 이나 동작) — 신규 네이티브 의존성 없이 복사 지원.
import { View, Text, ScrollView, Clipboard, Linking } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { Copy, Check } from 'phosphor-react-native';

import { v2, currentScheme } from '../../theme/v2Tokens';
import PressableScale from '../../components/ui/PressableScale';
import ChatMedia, { ChatFileChip, fetchMedia, type MediaFetcher } from './ChatMedia';
import * as i18n from '../../i18n/index.ts';

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
  // 규격(2026-09-30 §0.7): 본문 15/400 줄높이 22 · 제목 17/16/15 600 · 링크 info · 인라인 코드 elevated2 r-xs
  //  · 인용 왼쪽 2px borderControl · 표 헤어라인. 굵기는 400/500/600 만(700/800 금지).
  const F = v2.font.size;
  return {
    body: { color: C.text, fontSize: F.body, lineHeight: 22, fontFamily: v2.font.sans },
    heading1: { color: C.text, fontSize: F.h1, fontWeight: '600', marginTop: 8, marginBottom: 6, lineHeight: 24 },
    heading2: { color: C.text, fontSize: F.h2, fontWeight: '600', marginTop: 8, marginBottom: 5, lineHeight: 23 },
    heading3: { color: C.text, fontSize: F.body, fontWeight: '600', marginTop: 6, marginBottom: 4, lineHeight: 22 },
    heading4: { color: C.text, fontSize: F.body, fontWeight: '600', marginTop: 4, marginBottom: 3 },
    heading5: { color: C.text2, fontSize: F.body, fontWeight: '600' },
    heading6: { color: C.text3, fontSize: F.small, fontWeight: '600' },
    paragraph: { marginTop: 2, marginBottom: 8, color: C.text },
    strong: { fontWeight: '600', color: C.text },
    em: { fontStyle: 'italic' },
    s: { textDecorationLine: 'line-through', color: C.text3 },
    link: { color: C.info, textDecorationLine: 'underline' },
    blockquote: {
      backgroundColor: 'transparent', borderLeftWidth: 2, borderLeftColor: C.borderControl,
      paddingLeft: 12, paddingRight: 4, paddingVertical: 2, marginVertical: 6, borderRadius: 0,
    },
    bullet_list: { marginTop: 2, marginBottom: 6 },
    ordered_list: { marginTop: 2, marginBottom: 6 },
    list_item: { marginVertical: 2, color: C.text },
    bullet_list_icon: { color: C.text3 },
    ordered_list_icon: { color: C.text3 },
    hr: { backgroundColor: C.border, height: 1, marginVertical: 10 },
    code_inline: {
      backgroundColor: C.elevated2, color: C.text, borderWidth: 0,
      paddingHorizontal: 4, paddingVertical: 1, borderRadius: v2.radius.xs, fontFamily: monoFamily(), fontSize: F.small,
    },
    table: { borderWidth: 1, borderColor: C.border, borderRadius: v2.radius.md, marginVertical: 6, overflow: 'hidden' },
    thead: { backgroundColor: C.elevated },
    th: { padding: 8, color: C.text, fontWeight: '600', fontSize: F.small },
    tr: { borderBottomWidth: 1, borderColor: C.border },
    td: { padding: 8, color: C.text2, fontSize: F.small },
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
    <View style={{ backgroundColor: C.elevated, borderWidth: 1, borderColor: C.border, borderRadius: v2.radius.md, marginVertical: 6, overflow: 'hidden', maxWidth: '100%' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 12, paddingRight: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: C.border }}>
        <Text style={{ color: C.textDim, fontSize: v2.font.size.caption, fontFamily: monoFamily() }}>{(lang || 'code').toLowerCase()}</Text>
        {/* 가로 ScrollView 안이 아니라 헤더에 두어 복사 버튼이 스크롤로 밀려 사라지지 않게 + hitSlop 확보 */}
        <PressableScale onPress={onCopy} hitSlop={10} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 3 }}>
          {copied ? <Check size={13} color={C.text2} weight="bold" /> : <Copy size={13} color={C.text3} />}
          <Text style={{ color: copied ? C.text2 : C.text3, fontSize: v2.font.size.caption, fontWeight: '500' }}>{copied ? i18n.t('복사됨') : i18n.t('복사')}</Text>
        </PressableScale>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: 12 }}>
        <Text selectable style={{ color: C.text2, fontSize: v2.font.size.small, lineHeight: 19, fontFamily: monoFamily() }}>{code}</Text>
      </ScrollView>
    </View>
  );
}

const trimFence = (s: string) => (typeof s === 'string' && s.endsWith('\n') ? s.slice(0, -1) : s);

/**
 * 어시스턴트 마크다운.
 *  media = 대화가 참조한 파일을 실제로 띄우기 위한 문맥(chatId/host) + 크게 보기 콜백.
 *   없으면 이미지도 칩으로만 그린다(문맥 없이 바이트를 받을 수 없다 — 조용히 빈 자리 금지).
 */
const ChatMarkdown: React.FC<{
  text: string;
  media?: {
    chatId: string | null; host: number | null;
    onPreview?: (a: { uri: string; mediaType: string; name: string }) => void;
    /** 바이트를 받는 길 — 없으면 v1 의 chat.file. 채팅 v2 는 conv.file 을 준다. */
    fetcher?: MediaFetcher;
  };
  onOpenFile?: (p: string) => void;
}> = ({ text, media, onOpenFile }) => {
  const C = v2.colors;
  // 렌더 시점에 조립한다(모듈 상수로 굳히면 라이트 전환이 안 먹는다 — v2Colors 는 제자리 교체 객체).
  //  C 는 같은 참조라 의존성이 될 수 없다 → 스킴·글꼴을 키로 다시 만든다(셸은 리마운트하지 않는다).
  const resolvedScheme = currentScheme(); // 렌더 시점 스킴(프로바이더 밖 렌더에서도 안전)
  const fontFamily = v2.font.sans;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const styles = useMemo(() => buildStyles(C), [resolvedScheme, fontFamily]);
  const rules = useMemo(() => ({
    fence: (node: any) => <CodeBlock key={node.key} code={trimFence(node.content)} lang={node.sourceInfo} />,
    code_block: (node: any) => <CodeBlock key={node.key} code={trimFence(node.content)} lang={node.sourceInfo} />,
    // `![라벨](경로)` — 마크다운의 "그려라" 문법 → 실제 미디어(PC chat-view `_hydrateMedia` 미러).
    image: (node: any) => (
      <ChatMedia
        key={node.key}
        alt={node.attributes?.alt || ''}
        target={node.attributes?.src || ''}
        chatId={media?.chatId ?? null}
        host={media?.host ?? null}
        onPress={media?.onPreview}
        fetcher={media?.fetcher}
      />
    ),
    // `[라벨](경로)` — 파일 경로면 칩(자동 로드 안 함). http/https 는 기본 링크 동작 유지.
    link: (node: any, children: any, parent: any, styles: any) => {
      const href = String(node.attributes?.href || '');
      if (!href || /^(https?:|mailto:)/i.test(href)) {
        return <Text key={node.key} style={styles.link} onPress={() => { try { Linking.openURL(href); } catch (_) { /* noop */ } }}>{children}</Text>;
      }
      const label = (node.children || []).map((c: any) => c.content).join('') || href;
      return (
        <ChatFileChip
          key={node.key}
          label={label}
          target={href}
          onPress={(ref) => {
            // 이미지 칩 — 바이트를 받을 길이 있으면 그 자리에서 크게 본다(IDE 로 이미지를 열면 글자 깨짐이 보인다).
            const f = media?.fetcher;
            if (ref.kind === 'image' && f && media?.onPreview && media.chatId) {
              const pv = media.onPreview;
              void fetchMedia(`${media.chatId}|${ref.target}`, ref.target, f, ref.name).then((r) => {
                if ('fail' in r) onOpenFile?.(ref.target);
                else pv({ uri: r.uri, mediaType: r.mediaType, name: ref.name });
              });
              return;
            }
            onOpenFile?.(ref.target);
          }}
        />
      );
    },
  }), [media, onOpenFile]);
  return <Markdown style={styles} rules={rules as any}>{text}</Markdown>;
};

export default ChatMarkdown;
