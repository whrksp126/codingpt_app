import React, { useMemo, useState } from 'react';
import { View, Text, Image, ScrollView, Platform } from 'react-native';
import { WebView } from 'react-native-webview';

import { v2 } from '../../theme/v2Tokens';
import PressableScale from '../../components/ui/PressableScale';
import ChatMarkdown from '../chat/ChatMarkdown';
import { tx } from '../../text';
import { FILE_PREVIEW_TEXT } from '../../text/filePreview';
import * as PV from './previewKind';

const TX = tx(FILE_PREVIEW_TEXT);

// IDE 파일 미리보기 — 마크다운·이미지·SVG·PDF·표·JSON·오디오/비디오.
//
// PC 미러: `codingpt_pc/src/js/ide.js` 의 `_renderPreview`. 판정표(previewKind)와 문구 사전이
//  양쪽 공용이라 같은 파일은 두 기기에서 같은 방식으로 열린다.
//
// 규율:
//  · '원문 보기'는 **텍스트로 읽는 종류에만** 준다(canFallBackToText). 이미지·PDF 를 텍스트로
//    열면 깨진 글자만 쏟아진다.
//  · 못 그리는 것은 못 그린다고 말한다. 특히 **안드로이드 WebView 는 PDF 를 렌더하지 못한다** —
//    빈 화면을 주는 대신 사실대로 알리고 PC 에서 열도록 안내한다(조용한 실패 금지).
export type PreviewData = {
  kind: PV.PreviewKind;
  /** 텍스트로 읽는 종류(markdown·svg·table·json)의 내용. */
  text?: string;
  /** 바이트가 필요한 종류(image·pdf·audio·video)의 base64. */
  base64?: string;
  size?: number;
  error?: string;
};

export default function FilePreview({ path, data, onAsText }: {
  path: string;
  data: PreviewData;
  /** 원문(텍스트 에디터)으로 전환. 줄 수 있을 때만 넘어온다. */
  onAsText?: () => void;
}) {
  const C = v2.colors;
  const name = path.split('/').pop() || path;
  const canText = PV.canFallBackToText(data.kind) && !!onAsText;

  return (
    <View style={{ flex: 1, backgroundColor: C.base }}>
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 10,
        paddingHorizontal: 12, paddingVertical: 7,
        borderBottomWidth: 1, borderBottomColor: C.borderControl, backgroundColor: C.surface,
      }}>
        <Text numberOfLines={1} style={{ flex: 1, color: C.text2, fontSize: 12 }}>{name}</Text>
        {canText ? (
          <PressableScale onPress={onAsText} hitSlop={8}>
            <View style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 7, borderWidth: 1, borderColor: C.borderControl }}>
              <Text style={{ color: C.text2, fontSize: 11.5 }}>{TX.asText}</Text>
            </View>
          </PressableScale>
        ) : null}
      </View>
      <Body path={path} name={name} data={data} onAsText={onAsText} />
    </View>
  );
}

function Body({ path, name, data, onAsText }: {
  path: string; name: string; data: PreviewData; onAsText?: () => void;
}) {
  const C = v2.colors;
  const kind = data.kind;

  if (kind === 'markdown') {
    return (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14 }}>
        {/* 채팅과 같은 렌더러 — 같은 문서가 두 화면에서 다르게 보이면 안 된다. */}
        <ChatMarkdown text={data.text || ''} />
      </ScrollView>
    );
  }

  if (kind === 'svg') {
    // SVG 는 WebView 로 그린다(RN Image 는 SVG 를 못 읽는다). 한글이 든 SVG 도 안전하도록
    //  base64 가 아니라 HTML 안에 그대로 심는다.
    return (
      <WebView
        style={{ flex: 1, backgroundColor: 'transparent' }}
        originWhitelist={['*']}
        source={{ html: `<!doctype html><meta charset="utf-8"><style>
          html,body{margin:0;height:100%;display:flex;align-items:center;justify-content:center;background:transparent}
          svg{max-width:100%;max-height:100%}</style>${data.text || ''}` }}
      />
    );
  }

  if (kind === 'image') {
    return (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 12 }}>
        <Image
          source={{ uri: PV.dataUri(path, data.base64 || '') }}
          style={{ width: '100%', height: '100%' }}
          resizeMode="contain"
        />
      </ScrollView>
    );
  }

  if (kind === 'pdf') {
    // ★ 안드로이드 WebView 는 PDF 를 렌더하지 못한다(iOS WKWebView 는 된다). 빈 화면을 주는 대신
    //   사실대로 말한다 — "왜 아무것도 안 뜨지"가 가장 나쁜 결과다.
    if (Platform.OS !== 'ios') return <Note text={TX.notOnThisDevice} />;
    return (
      <WebView
        style={{ flex: 1 }}
        originWhitelist={['*']}
        source={{ uri: PV.dataUri(path, data.base64 || '') }}
      />
    );
  }

  if (kind === 'audio' || kind === 'video') {
    const tag = kind === 'audio' ? 'audio' : 'video';
    return (
      <WebView
        style={{ flex: 1, backgroundColor: 'transparent' }}
        originWhitelist={['*']}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        source={{ html: `<!doctype html><meta charset="utf-8"><style>
          html,body{margin:0;height:100%;display:flex;align-items:center;justify-content:center;background:#0b0d12}
          ${tag}{max-width:100%;max-height:100%;width:100%}</style>
          <${tag} controls src="${PV.dataUri(path, data.base64 || '')}"></${tag}>` }}
      />
    );
  }

  if (kind === 'table') {
    return <TableView text={data.text || ''} ext={PV.extOf(name)} />;
  }

  if (kind === 'json') {
    return <JsonView text={data.text || ''} />;
  }

  // unsupported — 무엇인지·얼마나 큰지 말해 주고, 그래도 열고 싶으면 열 수 있게 둔다.
  return (
    <Note
      text={(data.error || TX.unsupported) + (data.size ? ` · ${fmtBytes(data.size)}` : '')}
      action={onAsText ? { label: TX.openAsText, onPress: onAsText } : undefined}
    />
  );
}

function Note({ text, action }: { text: string; action?: { label: string; onPress: () => void } }) {
  const C = v2.colors;
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 }}>
      <Text style={{ color: C.textDim, fontSize: 13, lineHeight: 20, textAlign: 'center' }}>{text}</Text>
      {action ? (
        <PressableScale onPress={action.onPress}>
          <View style={{ paddingHorizontal: 16, paddingVertical: 9, borderRadius: 8, borderWidth: 1, borderColor: C.borderControl, backgroundColor: C.elevated2 }}>
            <Text style={{ color: C.text, fontSize: 13 }}>{action.label}</Text>
          </View>
        </PressableScale>
      ) : null}
    </View>
  );
}

/** CSV/TSV → 표. 가로로도 스크롤한다(열이 많으면 잘려서 아무 의미가 없다). */
function TableView({ text, ext }: { text: string; ext: string }) {
  const C = v2.colors;
  const { rows, truncated } = useMemo(() => PV.parseTable(text, ext), [text, ext]);
  const cols = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const width = Math.max(cols * 132, 320);
  return (
    <ScrollView style={{ flex: 1 }} horizontal>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12, width }}>
        {rows.map((r, ri) => (
          <View key={ri} style={{ flexDirection: 'row' }}>
            {Array.from({ length: cols }).map((_, ci) => (
              <View key={ci} style={{
                flex: 1, minWidth: 120, paddingHorizontal: 8, paddingVertical: 6,
                borderWidth: 0.5, borderColor: C.borderControl,
                backgroundColor: ri === 0 ? C.elevated2 : 'transparent',
              }}>
                <Text numberOfLines={2} style={{ color: ri === 0 ? C.text : C.text2, fontSize: 11.5, fontWeight: ri === 0 ? '600' : '400' }}>
                  {r[ci] ?? ''}
                </Text>
              </View>
            ))}
          </View>
        ))}
        {truncated ? <Text style={{ color: C.textDim, fontSize: 11.5, paddingTop: 10 }}>{TX.tableTruncated}</Text> : null}
      </ScrollView>
    </ScrollView>
  );
}

/** JSON → 접이식 트리. 깊은 문서가 열자마자 수천 줄이 되지 않게 3단계까지만 펼친다. */
function JsonView({ text }: { text: string }) {
  const C = v2.colors;
  const parsed = useMemo(() => {
    try { return { ok: true as const, value: JSON.parse(text) }; }
    catch { return { ok: false as const }; }
  }, [text]);
  if (!parsed.ok) return <Note text={TX.badJson} />;
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12 }} horizontal={false}>
      <ScrollView horizontal>
        <View><JsonNode value={parsed.value} depth={0} /></View>
      </ScrollView>
    </ScrollView>
  );
}

function JsonNode({ value, name, depth }: { value: any; name?: string | number; depth: number }) {
  const C = v2.colors;
  const isObj = value && typeof value === 'object';
  const [open, setOpen] = useState(depth < 3);
  const mono = Platform.OS === 'ios' ? 'Menlo' : 'monospace';
  const label = name != null ? String(name) : null;

  if (!isObj) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, paddingVertical: 1 }}>
        {label != null ? <Text style={{ color: C.text, fontSize: 12, fontFamily: mono }}>{label}:</Text> : null}
        <Text style={{ color: C.text2, fontSize: 12, fontFamily: mono }}>{JSON.stringify(value)}</Text>
      </View>
    );
  }
  const arr = Array.isArray(value);
  const entries: [string | number, any][] = arr
    ? (value as any[]).map((v, i) => [i, v])
    : Object.entries(value);
  return (
    <View>
      <PressableScale onPress={() => setOpen((v) => !v)} hitSlop={4}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, paddingVertical: 1 }}>
          <Text style={{ color: C.textDim, fontSize: 11, width: 12, fontFamily: mono }}>{open ? '▾' : '▸'}</Text>
          {label != null ? <Text style={{ color: C.text, fontSize: 12, fontFamily: mono }}>{label}:</Text> : null}
          <Text style={{ color: C.textDim, fontSize: 12, fontFamily: mono }}>
            {arr ? '[' : '{'}{entries.length}{arr ? ']' : '}'}
          </Text>
        </View>
      </PressableScale>
      {open ? (
        <View style={{ paddingLeft: 14, borderLeftWidth: 1, borderLeftColor: C.borderControl, marginLeft: 5 }}>
          {entries.map(([k, v]) => <JsonNode key={String(k)} name={k} value={v} depth={depth + 1} />)}
        </View>
      ) : null}
    </View>
  );
}

function fmtBytes(n: number) {
  if (n >= 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + 'MB';
  if (n >= 1024) return Math.round(n / 1024) + 'KB';
  return n + 'B';
}
