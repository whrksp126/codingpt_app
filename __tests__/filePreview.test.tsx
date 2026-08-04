/**
 * 파일 미리보기 — 폰 화면 계약.
 *
 * 이 파일이 고정하는 것:
 *  · '원문 보기'는 **텍스트로 읽는 종류에만** 준다. 이미지·PDF 를 텍스트로 열면 깨진 글자뿐이다.
 *  · 못 그리는 것은 **못 그린다고 말한다**. 특히 안드로이드 WebView 는 PDF 를 렌더하지 못하는데,
 *    빈 화면을 주면 "왜 아무것도 안 뜨지"가 된다.
 *  · 판정표는 PC 와 같은 파일에서 온다(previewKind) — 같은 파일이 기기마다 다르게 열리면 안 된다.
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Text, Image, Platform } from 'react-native';
import { WebView } from 'react-native-webview';

import FilePreview from '../src/workspace/ide/FilePreview';
import * as PV from '../src/workspace/ide/previewKind';
import { tx } from '../src/text';
import { FILE_PREVIEW_TEXT } from '../src/text/filePreview';

const TX = tx(FILE_PREVIEW_TEXT);

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('react-native-webview', () => ({ WebView: 'WebView' }));

function flatten(c: any): string {
  if (c == null || c === false) return '';
  if (Array.isArray(c)) return c.map(flatten).join('');
  if (typeof c === 'object') return '';
  return String(c);
}
function texts(t: ReactTestRenderer.ReactTestRenderer): string[] {
  return t.root.findAllByType(Text).map((n) => flatten(n.props.children)).filter(Boolean);
}
async function render(el: React.ReactElement) {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => { tree = ReactTestRenderer.create(el); });
  return tree;
}

test('마크다운 — 원문 보기를 준다', async () => {
  const tree = await render(
    <FilePreview path="a/README.md" data={{ kind: 'markdown', text: '# 제목' }} onAsText={() => {}} />,
  );
  expect(texts(tree)).toContain(TX.asText);
  expect(texts(tree)).toContain('README.md');
});

test('이미지 — 원문 보기를 주지 않는다(깨진 글자뿐)', async () => {
  const tree = await render(
    <FilePreview path="a/shot.png" data={{ kind: 'image', base64: 'AAAA' }} onAsText={() => {}} />,
  );
  expect(texts(tree)).not.toContain(TX.asText);
  const img = tree.root.findAllByType(Image)[0];
  expect(img.props.source.uri).toMatch(/^data:image\/png;base64,/);
});

test('표 — 값 안의 쉼표가 열을 어긋내지 않는다', async () => {
  const tree = await render(
    <FilePreview path="a/data.csv" data={{ kind: 'table', text: 'name,memo\nfront,"Docker, local"' }} />,
  );
  const t = texts(tree);
  expect(t).toContain('Docker, local');   // 한 칸으로
  expect(t).toContain('name');
});

test('JSON — 트리로 그리고, 깨진 JSON 은 사실대로 말한다', async () => {
  const good = await render(
    <FilePreview path="a/package.json" data={{ kind: 'json', text: '{"name":"cpt","deps":{"react":"19"}}' }} />,
  );
  expect(texts(good)).toContain('name:');
  const bad = await render(
    <FilePreview path="a/broken.json" data={{ kind: 'json', text: '{oops' }} />,
  );
  expect(texts(bad)).toContain(TX.badJson);
});

test('모르는 형식 — 무엇인지·얼마나 큰지 말하고 텍스트로 열 길을 남긴다', async () => {
  const onAsText = jest.fn();
  const tree = await render(
    <FilePreview path="a/bundle.zip" data={{ kind: 'unsupported', size: 2 * 1024 * 1024 }} onAsText={onAsText} />,
  );
  const joined = texts(tree).join('\n');
  expect(joined).toContain(TX.unsupported);
  expect(joined).toContain('2.0MB');
  expect(texts(tree)).toContain(TX.openAsText);
});

test('안드로이드 PDF — 빈 화면 대신 못 연다고 말한다', async () => {
  const orig = Platform.OS;
  Object.defineProperty(Platform, 'OS', { get: () => 'android', configurable: true });
  const tree = await render(<FilePreview path="a/spec.pdf" data={{ kind: 'pdf', base64: 'AAAA' }} />);
  expect(texts(tree)).toContain(TX.notOnThisDevice);
  expect(tree.root.findAllByType(WebView as any).length).toBe(0);
  Object.defineProperty(Platform, 'OS', { get: () => orig, configurable: true });
});

test('iOS PDF — WebView 로 그린다(WKWebView 는 PDF 를 렌더한다)', async () => {
  const orig = Platform.OS;
  Object.defineProperty(Platform, 'OS', { get: () => 'ios', configurable: true });
  const tree = await render(<FilePreview path="a/spec.pdf" data={{ kind: 'pdf', base64: 'AAAA' }} />);
  const wv = tree.root.findAllByType(WebView as any);
  expect(wv.length).toBe(1);
  expect((wv[0].props as any).source.uri).toMatch(/^data:application\/pdf;base64,/);
  Object.defineProperty(Platform, 'OS', { get: () => orig, configurable: true });
});

test('SVG — 한글이 들어가도 안전하게(HTML 에 그대로 심는다)', async () => {
  const tree = await render(
    <FilePreview path="a/logo.svg" data={{ kind: 'svg', text: '<svg><text>한글</text></svg>' }} onAsText={() => {}} />,
  );
  const wv = tree.root.findAllByType(WebView as any)[0];
  expect((wv.props as any).source.html).toContain('한글');
  expect(texts(tree)).toContain(TX.asText);   // svg 는 코드로도 볼 수 있다
});

test('판정표가 PC 와 같은 파일에서 온다', () => {
  // 여기서 previewKind 를 다시 구현하지 않는다는 것 자체가 계약이다.
  expect(PV.previewKind('a.md')).toBe('markdown');
  expect(PV.previewKind('a.tsx')).toBe('text');
  expect(PV.canFallBackToText('image')).toBe(false);
});
