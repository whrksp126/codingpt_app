/**
 * 열린 포트 목록 — 폰 화면 계약.
 *
 * ★ 이 파일이 붙잡는 핵심(2026-08-04 실측): 사용자의 dev 서버(front 3400·back 5300·admin 3300)는
 *  전부 **Docker** 가 띄운다. Docker 프로세스의 작업 폴더는 워크스페이스가 아니라서 "이 워크스페이스"
 *  목록에 한 개도 안 잡힌다. 그래서 안쪽이 비면 '다른 곳'을 **접지 않고 그대로 보여주고**, 그때만
 *  이유를 한 줄 알려준다. 이걸 어기면 이 사용자에게는 목록이 늘 비어 보인다.
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Text, Pressable } from 'react-native';

import PortsSheet from '../src/workspace/PortsSheet';
import daemonService from '../src/services/daemonService';
import { tx } from '../src/text';
import { PORTS_TEXT } from '../src/text/ports';

const TX = tx(PORTS_TEXT);

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// 사용자 실측 그대로.
const DOCKER_CASE = {
  items: [],
  others: [
    { port: 3300, pid: 49438, command: 'com.docker.backend' },
    { port: 3400, pid: 49438, command: 'com.docker.backend' },
    { port: 5300, pid: 49438, command: 'com.docker.backend' },
  ],
};

function flatten(c: any): string {
  if (c == null || c === false) return '';
  if (Array.isArray(c)) return c.map(flatten).join('');
  if (typeof c === 'object') return '';
  return String(c);
}
function texts(tree: ReactTestRenderer.ReactTestRenderer): string[] {
  return tree.root.findAllByType(Text).map((n) => flatten(n.props.children)).filter(Boolean);
}
async function render(el: React.ReactElement) {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => { tree = ReactTestRenderer.create(el); });
  await act(async () => { await Promise.resolve(); });
  return tree;
}

beforeEach(() => { jest.restoreAllMocks(); });

test('Docker 케이스 — 안쪽이 비어도 목록이 보이고, 그때만 이유를 알려준다', async () => {
  jest.spyOn(daemonService, 'previewPortsDetail').mockResolvedValue(DOCKER_CASE);
  const tree = await render(
    <PortsSheet visible cwd="app" host={null} onClose={() => {}} onPick={() => {}} />,
  );
  const t = texts(tree);
  expect(t).toContain('3400');
  expect(t).toContain('5300');
  expect(t).toContain(TX.elsewhere);
  expect(t).toContain(TX.elsewhereHint);       // 안쪽이 비었을 때만 나오는 한 줄
  expect(t).not.toContain(TX.thisWorkspace);   // 빈 제목을 만들지 않는다
});

test('보통 케이스 — 두 묶음이 다 뜨고 힌트는 안 나온다(평소엔 군더더기)', async () => {
  jest.spyOn(daemonService, 'previewPortsDetail').mockResolvedValue({
    items: [{ port: 5173, command: 'node' }],
    others: [{ port: 8081, command: 'node' }],
  });
  const tree = await render(
    <PortsSheet visible cwd="app" host={null} onClose={() => {}} onPick={() => {}} />,
  );
  const t = texts(tree);
  expect(t).toContain(TX.thisWorkspace);
  expect(t).toContain(TX.elsewhere);
  expect(t).not.toContain(TX.elsewhereHint);
});

test('프로세스 이름을 같이 보여준다(번호만으로는 못 고른다)', async () => {
  jest.spyOn(daemonService, 'previewPortsDetail').mockResolvedValue(DOCKER_CASE);
  const tree = await render(
    <PortsSheet visible cwd="app" host={null} onClose={() => {}} onPick={() => {}} />,
  );
  expect(texts(tree)).toContain('com.docker.backend');
});

test('고르면 그 포트를 돌려준다', async () => {
  jest.spyOn(daemonService, 'previewPortsDetail').mockResolvedValue(DOCKER_CASE);
  const onPick = jest.fn();
  const tree = await render(
    <PortsSheet visible cwd="app" host={null} onClose={() => {}} onPick={onPick} />,
  );
  const row = tree.root.findAllByType(Pressable).find((p) =>
    p.findAllByType(Text).some((t) => flatten(t.props.children) === '3400'));
  await act(async () => { row!.props.onPress(); });
  expect(onPick).toHaveBeenCalledWith(3400);
});

test('하나도 없으면 만드는 길을 안내한다', async () => {
  jest.spyOn(daemonService, 'previewPortsDetail').mockResolvedValue({ items: [], others: [] });
  const tree = await render(
    <PortsSheet visible cwd="app" host={null} onClose={() => {}} onPick={() => {}} />,
  );
  const t = texts(tree);
  expect(t).toContain(TX.empty);
  expect(t).toContain(TX.emptyHint);
});

test('조회에 실패하면 조용히 빈 목록인 척하지 않는다', async () => {
  jest.spyOn(daemonService, 'previewPortsDetail').mockRejectedValue(new Error('PC 가 연결되어 있지 않습니다.'));
  const tree = await render(
    <PortsSheet visible cwd="app" host={null} onClose={() => {}} onPick={() => {}} />,
  );
  expect(texts(tree)).toContain('PC 가 연결되어 있지 않습니다.');
});

test('빈 웹뷰 행은 onBlank 를 줄 때만 생긴다(프리뷰 안에서는 필요 없다)', async () => {
  jest.spyOn(daemonService, 'previewPortsDetail').mockResolvedValue(DOCKER_CASE);
  const withBlank = await render(
    <PortsSheet visible cwd="app" host={null} onClose={() => {}} onPick={() => {}} onBlank={() => {}} />,
  );
  expect(texts(withBlank)).toContain(TX.blank);
  const without = await render(
    <PortsSheet visible cwd="app" host={null} onClose={() => {}} onPick={() => {}} />,
  );
  expect(texts(without)).not.toContain(TX.blank);
});

test('구 데몬이 번호만 줘도 목록이 뜬다(추가 필드는 전부 additive 였다)', async () => {
  // previewPortsDetail 이 폴백을 담당한다 — 여기서는 그 폴백 결과를 그대로 그리는지만 본다.
  jest.spyOn(daemonService, 'previewPortsDetail').mockResolvedValue({
    items: [{ port: 3000 }, { port: 4000 }], others: [],
  });
  const tree = await render(
    <PortsSheet visible cwd="app" host={null} onClose={() => {}} onPick={() => {}} />,
  );
  const t = texts(tree);
  expect(t).toContain('3000');
  expect(t).toContain('4000');
});
