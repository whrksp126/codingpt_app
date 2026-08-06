/**
 * 라이브 영상이 **웹뷰가 뜨기 전에 온 키프레임을 잃지 않는가**.
 *
 * 2026-08-06 폰 실사고: 화면이 검은 채로 영영 안 떴다. 오류도 없고, LAN 채널은 열려 있고,
 *  조각도 초당 수십 개씩 들어오고 있었다. 원인은 웹뷰가 `hello` 를 보내기 전에 온 조각을 버리면서
 *  **config(SPS/PPS)만** 따로 보관했기 때문이다. H.264 는 config 만으로는 한 장도 못 그린다 —
 *  **키프레임(IDR)** 이 있어야 시작한다. 그런데 화면이 멈춰 있으면 scrcpy 는 다음 키프레임을
 *  한참(또는 영영) 안 보낸다. 즉 "웹뷰 뜨는 시간 vs 첫 키프레임 도착"의 **경주**에서 지면 영구 검은 화면.
 *  (그래서 어떤 날은 되고 어떤 날은 안 되는 것처럼 보였다.)
 *
 * 여기서 고정하는 계약: hello 전에 온 **키프레임과 그 뒤 조각들**은 순서대로 보관했다가 hello 직후
 *  config 다음에 그대로 다시 준다.
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Buffer } from 'buffer';

const posted: string[] = [];
jest.mock('react-native-webview', () => {
  const React2 = require('react');
  return {
    WebView: React2.forwardRef((props: any, ref: any) => {
      React2.useImperativeHandle(ref, () => ({ postMessage: (m: string) => posted.push(m) }));
      (globalThis as any).__fireMessage = (data: string) => props.onMessage({ nativeEvent: { data } });
      return null;
    }),
  };
});

import EmulatorVideo, { type EmulatorVideoHandle } from '../src/workspace/EmulatorVideo';

/** 데몬 와이어와 같은 모양: [플래그 1바이트][H.264]. 1=config · 2=키프레임 · 0=델타 */
const pkt = (flag: number, body: string) => Buffer.concat([Buffer.from([flag]), Buffer.from(body)]);

describe('웹뷰가 뜨기 전 조각', () => {
  beforeEach(() => { posted.length = 0; });

  it('★ hello 전에 온 키프레임을 잃지 않는다(잃으면 영구 검은 화면)', async () => {
    const ref = React.createRef<EmulatorVideoHandle>();
    await act(async () => { ReactTestRenderer.create(<EmulatorVideo ref={ref} url={null} onStatus={() => {}} />); });

    //  아직 hello 전 — 데몬이 meta → config → 키프레임 → 델타 순으로 보낸다.
    await act(async () => {
      ref.current!.push(Buffer.from('{"width":576,"height":1280}'), true);
      ref.current!.push(pkt(1, 'CONFIG'), false);
      ref.current!.push(pkt(2, 'KEY'), false);
      ref.current!.push(pkt(0, 'DELTA1'), false);
    });
    expect(posted).toHaveLength(0);   // 웹뷰가 아직 못 받는다

    await act(async () => { (globalThis as any).__fireMessage(JSON.stringify({ type: 'hello' })); });

    const kinds = posted.map((m) => (m[0] === 'T' ? 'meta' : Buffer.from(m.slice(1), 'base64').subarray(1).toString()));
    expect(kinds).toEqual(['meta', 'CONFIG', 'KEY', 'DELTA1']);
  });

  it('키프레임이 새로 오면 그 앞의 조각들은 버린다(오래된 GOP 를 쌓지 않는다)', async () => {
    const ref = React.createRef<EmulatorVideoHandle>();
    await act(async () => { ReactTestRenderer.create(<EmulatorVideo ref={ref} url={null} onStatus={() => {}} />); });
    await act(async () => {
      ref.current!.push(pkt(2, 'KEY1'), false);
      ref.current!.push(pkt(0, 'D1'), false);
      ref.current!.push(pkt(2, 'KEY2'), false);
      ref.current!.push(pkt(0, 'D2'), false);
    });
    await act(async () => { (globalThis as any).__fireMessage(JSON.stringify({ type: 'hello' })); });
    const kinds = posted.map((m) => Buffer.from(m.slice(1), 'base64').subarray(1).toString());
    expect(kinds).toEqual(['KEY2', 'D2']);
  });

  it('hello 뒤에는 곧바로 흘려보낸다(보관하지 않는다)', async () => {
    const ref = React.createRef<EmulatorVideoHandle>();
    await act(async () => { ReactTestRenderer.create(<EmulatorVideo ref={ref} url={null} onStatus={() => {}} />); });
    await act(async () => { (globalThis as any).__fireMessage(JSON.stringify({ type: 'hello' })); });
    posted.length = 0;
    await act(async () => { ref.current!.push(pkt(0, 'LIVE'), false); });
    expect(posted).toHaveLength(1);
    expect(Buffer.from(posted[0].slice(1), 'base64').subarray(1).toString()).toBe('LIVE');
  });
});
