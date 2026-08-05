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

/**
 * LAN 직결 경로 — 프레임이 **RN 을 거쳐** 웹뷰로 들어온다.
 *
 * 2026-08-05 실측(사용자 지적 "PC 반응은 즉시인데 안드로이드에 보이는 게 느리다"):
 *   릴레이(폰→CF→홈서버→CF→PC) 310~420 ms  ·  LAN 직결(폰→PC) 96~109 ms
 * 여기서 못박는 것은 그 경로의 **깨지기 쉬운 두 지점**이다.
 */
describe('LAN 직결 프레임 주입', () => {
  //  WebView 는 호스트 문자열로 목킹돼 있어 ref 인스턴스가 없다 → createNodeMock 으로 만들어 준다.
  const renderRef = () => {
    const ref = React.createRef<any>();
    const posted: string[] = [];
    let tree!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      tree = ReactTestRenderer.create(
        <EmulatorVideo ref={ref} url={null} onStatus={jest.fn()} />,
        { createNodeMock: (el) => (el.type === 'WebView' ? { postMessage: (s: string) => posted.push(s) } : null) },
      );
    });
    return { ref, web: tree.root.findByType(WebView), posted };
  };

  test('url 이 없으면 웹뷰가 WS 를 열지 않는다(두 갈래가 겹치면 디코더 상태가 섞인다)', () => {
    const { web } = renderRef();
    const html = (web.props as any).source.html as string;
    expect(html).toContain('var URL_ = ""');
    expect(html).toMatch(/if \(URL_\) \{/);
  });

  test('★ hello 전에 온 config 를 보관했다가 다시 준다(놓치면 다음 키프레임까지 검은 화면)', () => {
    const { ref, web, posted } = renderRef();
    const config = Buffer.from([1, 0x67, 0x42]);   // 플래그 1 = config
    const delta = Buffer.from([0, 0x41, 0xbb]);
    act(() => { ref.current.push(config, false); ref.current.push(delta, false); });
    expect(posted).toHaveLength(0);                // 아직 안 붙었다 — 아무것도 안 보낸다

    act(() => { (web.props as any).onMessage({ nativeEvent: { data: JSON.stringify({ type: 'hello' }) } }); });
    expect(posted).toEqual([`B${config.toString('base64')}`]);   // ★ config 만 되살아난다

    act(() => { ref.current.push(delta, false); });
    expect(posted[1]).toBe(`B${delta.toString('base64')}`);
  });

  test('meta(텍스트)도 보관됐다가 hello 뒤에 간다 — 좌표계를 모르면 입력이 어긋난다', () => {
    const { ref, web, posted } = renderRef();
    act(() => { ref.current.push(Buffer.from(JSON.stringify({ type: 'meta', width: 576, height: 1280 })), true); });
    act(() => { (web.props as any).onMessage({ nativeEvent: { data: JSON.stringify({ type: 'hello' }) } }); });
    expect(posted[0]).toBe('T{"type":"meta","width":576,"height":1280}');
  });

  test('hello 는 상태 콜백으로 새지 않는다(화면이 이걸 오류로 오해하면 폴링으로 떨어진다)', () => {
    const onStatus = jest.fn();
    let tree!: ReactTestRenderer.ReactTestRenderer;
    act(() => { tree = ReactTestRenderer.create(<EmulatorVideo url={null} onStatus={onStatus} />); });
    const web = tree.root.findByType(WebView);
    act(() => { (web.props as any).onMessage({ nativeEvent: { data: JSON.stringify({ type: 'hello' }) } }); });
    expect(onStatus).not.toHaveBeenCalled();
  });

  test('안드로이드(document)와 iOS(window) 양쪽에서 프레임을 받는다', () => {
    const { web } = renderRef();
    const html = (web.props as any).source.html as string;
    expect(html).toContain("document.addEventListener('message', fromHost)");
    expect(html).toContain("window.addEventListener('message', fromHost)");
  });

  test('저지연 캔버스 힌트를 쓴다(합성기 큐를 한 프레임 건너뛴다)', () => {
    const { web } = renderRef();
    expect((web.props as any).source.html).toContain('desynchronized: true');
  });
});

/**
 * ★ 2026-08-05 실사고: 바이트가 오고 있는데도 12초 뒤 "화면이 오지 않아요" 로 폴링에 떨어졌다.
 *  포기 타이머를 **풀 수 있는** 프레임에서만 껐기 때문이다 — 키프레임을 기다리는 동안(늦게 들어온
 *  시청자는 그럴 수 있다) 멀쩡한 스트림을 버렸다. 도착 자체로 타이머를 끈다.
 */
test('★ 프레임이 도착하면 아직 못 풀어도 포기 타이머를 끈다', () => {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  act(() => { tree = ReactTestRenderer.create(<EmulatorVideo url={null} onStatus={jest.fn()} />); });
  const body = (tree.root.findByType(WebView).props as { source: { html: string } }).source.html;
  const at = body.indexOf('function onBinary');
  const head = body.slice(at, body.indexOf('var isKey', at));
  expect(head).toContain('clearTimeout(giveUp)');   // config/키프레임 판정보다 **먼저**
});

/**
 * ★ 2026-08-05 실사고: EmulatorVideo 가 Buffer 를 **import 하지 않고** 썼다. RN 에는 전역 Buffer 가
 *  없어서 push() 가 매 프레임 ReferenceError 를 던졌고, lanLink 의 onData try/catch 가 그걸 삼켜
 *  "프레임이 안 온다" 로 보였다(실제로는 초당 30장 도착). 타입 검사는 @types/node 의 전역 Buffer
 *  선언 때문에 통과했다 — 그래서 **실행**으로 못박는다.
 */
test('★ push 는 던지지 않는다(전역 Buffer 에 기대지 않는다)', () => {
  const ref = React.createRef<any>();
  const posted: string[] = [];
  act(() => {
    ReactTestRenderer.create(
      <EmulatorVideo ref={ref} url={null} onStatus={jest.fn()} />,
      { createNodeMock: (el) => (el.type === 'WebView' ? { postMessage: (s: string) => posted.push(s) } : null) },
    );
  });
  const frame = Buffer.from([2, 0x65, 0xaa]);
  const meta = Buffer.from('{"type":"meta"}');
  //  ★ jest 는 node 라서 전역 Buffer 가 있다 — 그대로 두면 RN 환경을 재현하지 못하고 이 테스트가
  //   헛돈다(실제로 그렇게 통과하는 걸 확인하고 이 블록을 넣었다). 잠깐 지우고 부른다.
  const g = globalThis as { Buffer?: unknown };
  const saved = g.Buffer;
  delete g.Buffer;
  try {
    expect(() => ref.current.push(frame, false)).not.toThrow();
    expect(() => ref.current.push(meta, true)).not.toThrow();
  } finally { g.Buffer = saved; }
});
