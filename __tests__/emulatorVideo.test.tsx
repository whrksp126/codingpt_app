/**
 * 모바일 화면 라이브 영상 — **WebView 가 보안 컨텍스트인가**.
 *
 * 2026-08-05 실측: 같은 폰에서 같은 페이지를
 *   http  로 띄우면 → `VideoDecoder` 가 undefined → 우리는 폴링으로 되돌아간다
 *   https 로 띄우면 → 즉시 디코딩(ready 624x1280)
 * WebCodecs 는 보안 컨텍스트 전용 API 이기 때문이다. `source={{html}}` 만 주면 문서 출처가
 * 불투명(opaque)해서 보안 컨텍스트가 아니다 → `baseUrl` 을 https 로 줘야 한다.
 *
 * 이 한 줄이 빠지면 **아무 오류 없이** 폰이 예전처럼 느려진다(폴백이 조용히 잘 도니까).
 * 그래서 여기서 못박는다.
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { WebView } from 'react-native-webview';

import EmulatorVideo from '../src/workspace/EmulatorVideo';

const URL = 'wss://back.example/api/daemon/emustream/tok';

const render = () => {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  act(() => { tree = ReactTestRenderer.create(<EmulatorVideo url={URL} onStatus={jest.fn()} />); });
  return tree.root.findByType(WebView).props as { source: { html: string; baseUrl?: string } };
};

describe('라이브 영상 WebView', () => {
  test('★ 보안 컨텍스트다 — baseUrl 이 https(없으면 WebCodecs 가 아예 존재하지 않는다)', () => {
    const { source } = render();
    expect(source.baseUrl).toBeTruthy();
    expect(source.baseUrl!.startsWith('https://')).toBe(true);
  });

  test('스트림 주소가 페이지에 실린다', () => {
    const { source } = render();
    expect(source.html).toContain(URL);
  });

  test('★ PC 와 같은 디코딩 계약 — 코덱·플래그·config 선행', () => {
    const { html } = render().source;
    expect(html).toContain('avc1.640028');       // PC emulator-view.js 와 같은 문자열
    expect(html).toContain('optimizeForLatency'); // 버퍼링하면 조작이 굼떠 보인다
    expect(html).toMatch(/flags & 1/);            // 1 = config(SPS/PPS)
    expect(html).toMatch(/flags & 2/);            // 2 = keyframe
    //  Annex-B 는 첫 IDR 앞에 SPS/PPS 가 있어야 한다 — 이걸 빼면 첫 키프레임을 못 푼다.
    expect(html).toMatch(/isKey && configBytes/);
    //  키프레임 전의 델타는 버린다(넣으면 디코더가 오류를 낸다).
    expect(html).toMatch(/if \(!sawKey\)/);
  });

  test('WebCodecs 가 없으면 조용히 죽지 않고 그렇다고 말한다', () => {
    const { html } = render().source;
    expect(html).toContain("type: 'unsupported'");
  });

  test('터치는 웹뷰가 아니라 RN 레이어가 받는다(제스처 판정이 두 벌이 되면 규칙이 갈라진다)', () => {
    const props = render() as unknown as { pointerEvents?: string };
    expect(props.pointerEvents).toBe('none');
  });
});
