/**
 * 명령 팔레트 — 폰 화면 계약.
 *
 * 이 파일이 고정하는 것:
 *  · **창은 하나**다. `>` 하나로 파일 모드 ↔ 명령 모드가 갈리고, 그 외에는 같은 창·같은 조작이다.
 *  · 지금 쓸 수 없는 명령은 **감추지 않고 흐리게** 두고, 눌러도 실행되지 않는다(눌렀는데 아무
 *    일도 없는 것이 가장 나쁘다 — 그래서 이유를 같이 적는다).
 *  · 파일 목록을 읽는 중에도 **열린 탭과 명령은 이미 쓸 수 있다**(빈 화면으로 기다리게 하지 않는다).
 *  · 판정(순위·모드)은 PC 와 같은 파일에서 온다(palette/match) — 같은 글자에 두 기기가 다른
 *    순서를 내면 "내 파일이 어디 갔지"가 된다.
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Text, TextInput, Pressable } from 'react-native';

import PaletteSheet, { type PaletteSurface } from '../src/workspace/PaletteSheet';
import * as M from '../src/palette/match';
import { commandsFor } from '../src/palette/commands';
import { tx } from '../src/text';
import { PALETTE_TEXT } from '../src/text/palette';

const TX = tx(PALETTE_TEXT);

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../src/animations/haptics', () => ({ haptic: { keyPress: () => {} } }));

// jest.mock 팩토리는 호이스팅되므로 `mock` 접두사가 붙은 변수만 참조할 수 있다.
const mockFsTree = jest.fn();
jest.mock('../src/services/daemonService', () => ({
  __esModule: true,
  default: {
    fsTree: (...a: any[]) => mockFsTree(...a),
  },
}));

const FILES = [
  'src/workspace/WorkspaceView.tsx',
  'src/workspace/PaneView.tsx',
  'src/services/daemonService.ts',
  'package.json',
];
const SURFACES: PaletteSurface[] = [
  { paneId: 'p1', index: 0, kind: 'terminal', label: 'claude', active: true },
  { paneId: 'p1', index: 1, kind: 'ide', label: 'IDE' },
];

function flatten(c: any): string {
  if (c == null || c === false) return '';
  if (Array.isArray(c)) return c.map(flatten).join('');
  if (typeof c === 'object') return '';
  return String(c);
}
function texts(t: ReactTestRenderer.ReactTestRenderer): string[] {
  return t.root.findAllByType(Text).map((n) => flatten(n.props.children)).filter(Boolean);
}
/**
 * 그 글자를 품은 **가장 안쪽** Pressable. `props.children` 을 문자열로 펴 보는 방식은 못 쓴다 —
 *  행의 children 은 React 엘리먼트라 늘 빈 문자열이 되고, 그러면 배경(닫기) Pressable 이 잡혀
 *  "아무 일도 안 일어났다"가 통과해 버린다(이 테스트가 처음에 그렇게 틀렸다).
 */
function rowWith(t: ReactTestRenderer.ReactTestRenderer, label: string) {
  const hits = t.root.findAllByType(Pressable).filter((p) => {
    try { return p.findAllByType(Text).some((x) => flatten(x.props.children).includes(label)); }
    catch (_) { return false; }
  });
  return hits[hits.length - 1];
}

async function open(props: Partial<React.ComponentProps<typeof PaletteSheet>> = {}) {
  const onClose = jest.fn();
  const onOpenFile = jest.fn();
  const onRunCommand = jest.fn();
  const onActivateSurface = jest.fn();
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = ReactTestRenderer.create(
      <PaletteSheet
        visible
        onClose={onClose}
        wsPath="proj"
        host={null}
        surfaces={SURFACES}
        tid={7}
        onActivateSurface={onActivateSurface}
        onOpenFile={onOpenFile}
        onRunCommand={onRunCommand}
        isCommandAvailable={() => true}
        {...props}
      />,
    );
  });
  const type = async (v: string) => {
    await act(async () => { tree.root.findByType(TextInput).props.onChangeText(v); });
  };
  return { tree, type, onClose, onOpenFile, onRunCommand, onActivateSurface };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFsTree.mockResolvedValue({ root: 'proj', items: FILES.map((path) => ({ path, text: true })) });
});

test('열자마자 — 열린 탭과 파일이 화면 순서 그대로 나온다', async () => {
  const { tree } = await open();
  const t = texts(tree);
  expect(t).toContain(TX.secOpenTabs);
  expect(t).toContain('claude');
  expect(t).toContain('IDE');
  expect(t).toContain(TX.secFiles);
  expect(t).toContain('WorkspaceView.tsx');
  // 검색어가 비면 순서를 흔들지 않는다 — claude(탭 0) 가 IDE(탭 1) 보다 먼저다.
  expect(t.indexOf('claude')).toBeLessThan(t.indexOf('IDE'));
});

test('`>` 하나로 명령 모드 — 앱 명령이 나온다', async () => {
  const { tree, type } = await open();
  await type('>');
  const t = texts(tree);
  expect(t).toContain(TX.secCommands);
  expect(t).toContain(TX.cmd['ws.addTerminal']);
  // 파일은 이 모드에 없다(같은 창이지만 목록은 갈린다).
  expect(t).not.toContain('WorkspaceView.tsx');
});

test('팔레트 자신과 워크스페이스 1~8 이동은 목록에 없다', async () => {
  const { tree, type } = await open();
  await type('>');
  const t = texts(tree).join('\n');
  expect(t).not.toContain(TX.cmd['palette.open']);
  expect(t).not.toContain(TX.cmd['ws.select1']);
});

test('지금 쓸 수 없는 명령 — 감추지 않고 이유를 적는다', async () => {
  const { tree, type, onRunCommand } = await open({ isCommandAvailable: () => false });
  await type('>');
  expect(texts(tree)).toContain(TX.unavailable);
  // 눌러도 실행되지 않는다.
  const row = rowWith(tree, TX.cmd['ws.addTerminal']);
  await act(async () => { row?.props.onPress?.(); });
  expect(onRunCommand).not.toHaveBeenCalled();
});

test('파일을 고르면 열기로 넘기고 창을 닫는다', async () => {
  const { tree, type, onOpenFile, onClose } = await open();
  await type('wsv');
  const row = rowWith(tree, 'WorkspaceView.tsx');
  await act(async () => { row?.props.onPress?.(); });
  expect(onOpenFile).toHaveBeenCalledWith('src/workspace/WorkspaceView.tsx');
  expect(onClose).toHaveBeenCalled();
});

test('열린 탭을 고르면 그 탭으로 보낸다', async () => {
  const { tree, onActivateSurface } = await open();
  const row = rowWith(tree, 'claude');
  await act(async () => { row?.props.onPress?.(); });
  expect(onActivateSurface).toHaveBeenCalledWith('p1', 0);
});

test('파일 목록을 못 읽어도 명령은 쓸 수 있다(조용한 빈 화면 금지)', async () => {
  mockFsTree.mockRejectedValue(new Error('호스트가 오프라인이에요'));
  const { tree, type } = await open();
  expect(texts(tree).join('\n')).toContain('호스트가 오프라인이에요');
  await type('>');
  expect(texts(tree)).toContain(TX.cmd['ws.addTerminal']);
});

test('판정은 PC 와 같은 파일에서 온다', () => {
  // 여기서 순위 규칙을 다시 구현하지 않는다는 것 자체가 계약이다.
  expect(M.parseQuery('>x').mode).toBe(M.MODE_COMMAND);
  expect(M.parseQuery('x').mode).toBe(M.MODE_FILE);
  expect(M.rankPaths(FILES, 'wsv', 5)[0]).toBe('src/workspace/WorkspaceView.tsx');
  // 앱에 없는 명령은 앱 목록에서 빠진다.
  const ids = commandsFor('app').map((c) => c.id);
  expect(ids).not.toContain('pane.splitRight');
  expect(ids).toContain('ws.addTerminal');
});
