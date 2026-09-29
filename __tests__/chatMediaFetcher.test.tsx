/**
 * ChatMedia 바이트 출처 주입 — v1(터미널 채팅)은 그대로 `chat.file`, 채팅 v2 는 주입한 `conv.file`.
 *  · 같은 경로를 여러 칸이 동시에 그려도 요청은 하나.
 *  · 실패 사유(missing.reason)를 말한다.
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Image, Text } from 'react-native';

jest.mock('react-native-blob-util', () => ({
  __esModule: true,
  default: { fs: { dirs: { CacheDir: '/cache' }, mkdir: jest.fn(async () => {}), exists: jest.fn(async () => false), writeFile: jest.fn(async () => {}) } },
}));
jest.mock('react-native-video', () => 'Video');
const mockChatFile = jest.fn();
jest.mock('../src/services/chatService', () => ({ __esModule: true, default: { chatFile: (...a: any[]) => mockChatFile(...a) } }));

import ChatMedia from '../src/workspace/chat/ChatMedia';

async function mount(el: React.ReactElement) {
  let r!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => { r = ReactTestRenderer.create(el); });
  await act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); });
  return r;
}
const uris = (r: ReactTestRenderer.ReactTestRenderer) => r.root.findAllByType(Image).map((i) => i.props.source?.uri);

beforeEach(() => { mockChatFile.mockReset(); jest.spyOn(Image, 'getSize').mockImplementation(() => {}); });

test('★ fetcher 가 없으면 v1 그대로 chat.file(chatId·host)', async () => {
  mockChatFile.mockResolvedValue({ mediaType: 'image/png', base64: 'QUJD', bytes: 1, name: 'v1.png' });
  const r = await mount(<ChatMedia target="/h/v1.png" chatId="chat-9" host={7} />);
  expect(mockChatFile).toHaveBeenCalledWith({ chatId: 'chat-9', path: '/h/v1.png', host: 7 });
  expect(uris(r)).toContain('file:///cache/cpt-media/1-v1.png');
});

test('★ fetcher 를 주면 그것만 쓴다 — 동시에 그린 두 칸도 요청은 하나', async () => {
  const fetcher = jest.fn(async () => ({ mediaType: 'image/png', base64: 'QUJD', bytes: 2, name: 'v2.png' }));
  const r = await mount(<>
    <ChatMedia target="/h/v2.png" chatId="t1" host={7} fetcher={fetcher} />
    <ChatMedia target="/h/v2.png" chatId="t1" host={7} fetcher={fetcher} />
  </>);
  expect(mockChatFile).not.toHaveBeenCalled();
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher).toHaveBeenCalledWith('/h/v2.png');
  expect(uris(r).filter((u) => u === 'file:///cache/cpt-media/2-v2.png').length).toBe(2);
});

test('missing 이면 사유를 말한다', async () => {
  const fetcher = jest.fn(async () => ({ missing: true, reason: 'not_referenced' }));
  const r = await mount(<ChatMedia target="/h/secret.png" chatId="t2" host={7} fetcher={fetcher} />);
  expect(r.root.findAllByType(Text).some((t) => t.props.children === '이 대화에서 참조하지 않은 파일이에요')).toBe(true);
});
