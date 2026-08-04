/**
 * 저장한 명령(Quick Commands) — 폰 화면 계약.
 *
 * 이 파일이 고정하는 것(전부 사용자 확정 사양이고, 어기면 조용히 틀리는 것들이다):
 *  · target:'current' 인데 보고 있는 터미널이 없으면 **실행하지 않는다**. 조용히 새 터미널을
 *    만들어 엉뚱한 곳에서 돌리면 사용자는 왜 그랬는지 알 수 없다.
 *  · `ready:false`(터미널이 준비되기 전에 보냄)를 감추지 않는다.
 *  · ws:''(홈 루트 워크스페이스)를 그대로 전달한다 — "전역만"으로 격하되면 안 된다.
 *  · 스코프 기본값은 **이 워크스페이스 전용**(전역이 기본이면 프로젝트 명령이 사방에 샌다).
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Text, Pressable } from 'react-native';

import QuickCommandsSheet from '../src/workspace/QuickCommandsSheet';
import QuickCommandsManageSheet from '../src/workspace/QuickCommandsManageSheet';
import daemonService, { type QuickCommand } from '../src/services/daemonService';
import { tx } from '../src/text';
import { QC_TEXT } from '../src/text/quickCommands';

const TX = tx(QC_TEXT);

// SafeArea 는 네이티브 측정에 의존한다 — 테스트에서는 고정값으로 둔다(레이아웃이 아니라
//  동작을 검증하는 파일이다).
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const ITEMS: QuickCommand[] = [
  { id: 'qc_aaaaaaaaaaaa', label: '개발 서버', kind: 'shell', text: 'npm run dev', target: 'new', ws: 'app', createdAt: 1, updatedAt: 1 },
  { id: 'qc_bbbbbbbbbbbb', label: '변경사항 보기', kind: 'shell', text: 'git status', target: 'current', ws: null, createdAt: 2, updatedAt: 2 },
  { id: 'qc_cccccccccccc', label: '배포 전 점검', kind: 'agent', agent: 'claude', prompt: '점검해줘', target: 'new', ws: null, createdAt: 3, updatedAt: 3 },
];

function texts(tree: ReactTestRenderer.ReactTestRenderer): string[] {
  return tree.root.findAllByType(Text).map((n) => flatten(n.props.children)).filter(Boolean);
}
function flatten(c: any): string {
  if (c == null || c === false) return '';
  if (Array.isArray(c)) return c.map(flatten).join('');
  if (typeof c === 'object') return '';
  return String(c);
}

async function render(el: React.ReactElement) {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => { tree = ReactTestRenderer.create(el); });
  await act(async () => { await Promise.resolve(); });
  return tree;
}

/** 라벨로 눌러야 할 Pressable 을 찾는다(시트 안 행 = 라벨 Text 를 품은 Pressable). */
function pressableWith(tree: ReactTestRenderer.ReactTestRenderer, label: string) {
  return tree.root.findAllByType(Pressable).find((p) => flatten(renderChildrenText(p)).includes(label));
}
function renderChildrenText(node: any): any {
  return node.findAllByType(Text).map((t: any) => flatten(t.props.children));
}

beforeEach(() => {
  jest.restoreAllMocks();
  jest.spyOn(daemonService, 'listQuickCommands').mockResolvedValue(ITEMS);
  jest.spyOn(daemonService, 'listAllQuickCommands').mockResolvedValue({ items: ITEMS, limits: { maxItems: 100, maxLabel: 40 } });
  jest.spyOn(daemonService, 'listAgents').mockResolvedValue({
    agents: [{ id: 'claude', name: 'Claude Code', installed: true } as any], onboardedAt: null,
  });
});

describe('실행 시트', () => {
  test('저장한 명령이 목록으로 나오고, 어디서 도는지도 같이 보인다', async () => {
    const tree = await render(
      <QuickCommandsSheet visible ws="app" host={null} tid={7} onClose={() => {}} onManage={() => {}} />,
    );
    const t = texts(tree);
    expect(t).toContain(TX.title);
    expect(t).toContain('개발 서버');
    expect(t).toContain('배포 전 점검');
    // 눌러 보기 전에 "새 터미널 / 지금 터미널"을 알 수 있어야 한다.
    expect(t).toContain(TX.targetNew);
    expect(t).toContain(TX.targetCurrent);
  });

  test("ws:''(홈 루트)를 그대로 넘긴다 — '전역만'으로 격하되지 않는다", async () => {
    await render(<QuickCommandsSheet visible ws="" host={null} tid={1} onClose={() => {}} onManage={() => {}} />);
    expect(daemonService.listQuickCommands).toHaveBeenCalledWith('', null);
  });

  test('보고 있는 터미널이 없으면 current 항목을 실행하지 않고 안내한다', async () => {
    const run = jest.spyOn(daemonService, 'runQuickCommand');
    const tree = await render(
      <QuickCommandsSheet visible ws="app" host={null} tid={null} onClose={() => {}} onManage={() => {}} />,
    );
    await act(async () => { pressableWith(tree, '변경사항 보기')!.props.onPress(); });
    expect(run).not.toHaveBeenCalled();
    expect(texts(tree)).toContain(TX.needTerminal);
  });

  test('new 항목은 보고 있는 터미널이 없어도 실행된다(tid 를 안 싣는다)', async () => {
    const run = jest.spyOn(daemonService, 'runQuickCommand').mockResolvedValue({ ok: true, index: 9, ready: true });
    const tree = await render(
      <QuickCommandsSheet visible ws="app" host={null} tid={null} onClose={() => {}} onManage={() => {}} />,
    );
    await act(async () => { await pressableWith(tree, '개발 서버')!.props.onPress(); });
    expect(run).toHaveBeenCalledWith('qc_aaaaaaaaaaaa', 'app', null, null);
  });

  test('current 항목은 보고 있는 터미널 id 를 싣는다', async () => {
    const run = jest.spyOn(daemonService, 'runQuickCommand').mockResolvedValue({ ok: true, index: 7, ready: true });
    const tree = await render(
      <QuickCommandsSheet visible ws="app" host={null} tid={7} onClose={() => {}} onManage={() => {}} />,
    );
    await act(async () => { await pressableWith(tree, '변경사항 보기')!.props.onPress(); });
    expect(run).toHaveBeenCalledWith('qc_bbbbbbbbbbbb', 'app', 7, null);
  });

  test('준비 전에 보냈으면 알리고 시트를 닫지 않는다', async () => {
    jest.spyOn(daemonService, 'runQuickCommand').mockResolvedValue({ ok: true, index: 9, ready: false });
    const onClose = jest.fn();
    const tree = await render(
      <QuickCommandsSheet visible ws="app" host={null} tid={7} onClose={onClose} onManage={() => {}} />,
    );
    await act(async () => { await pressableWith(tree, '개발 서버')!.props.onPress(); });
    expect(texts(tree)).toContain(TX.notReady);
    expect(onClose).not.toHaveBeenCalled();
  });

  test('다른 게 돌고 있으면 그렇게 알린다', async () => {
    jest.spyOn(daemonService, 'runQuickCommand').mockResolvedValue({ ok: true, busy: true });
    const tree = await render(
      <QuickCommandsSheet visible ws="app" host={null} tid={7} onClose={() => {}} onManage={() => {}} />,
    );
    await act(async () => { await pressableWith(tree, '개발 서버')!.props.onPress(); });
    expect(texts(tree)).toContain(TX.busy);
  });

  test('정상 실행이면 시트를 닫는다', async () => {
    jest.spyOn(daemonService, 'runQuickCommand').mockResolvedValue({ ok: true, index: 9, ready: true });
    const onClose = jest.fn();
    const tree = await render(
      <QuickCommandsSheet visible ws="app" host={null} tid={7} onClose={onClose} onManage={() => {}} />,
    );
    await act(async () => { await pressableWith(tree, '개발 서버')!.props.onPress(); });
    expect(onClose).toHaveBeenCalled();
  });

  test('하나도 없으면 만드는 길을 안내한다', async () => {
    jest.spyOn(daemonService, 'listQuickCommands').mockResolvedValue([]);
    const tree = await render(
      <QuickCommandsSheet visible ws="app" host={null} tid={7} onClose={() => {}} onManage={() => {}} />,
    );
    const t = texts(tree);
    expect(t).toContain(TX.empty);
    expect(t).toContain(TX.emptyHint);
  });
});

describe('관리 시트', () => {
  test('스코프·종류·실행 위치를 행마다 보여준다', async () => {
    const tree = await render(<QuickCommandsManageSheet visible ws="app" host={null} onClose={() => {}} />);
    const joined = texts(tree).join('\n');
    expect(joined).toContain(TX.kindShell);
    expect(joined).toContain(TX.kindAgent);
    expect(joined).toContain(TX.scopeGlobal);
    expect(joined).toContain(TX.scopeWs);
  });

  test('새로 만들 때 스코프 기본값은 이 워크스페이스 전용이다', async () => {
    const save = jest.spyOn(daemonService, 'saveQuickCommand').mockResolvedValue({ item: ITEMS[0], items: ITEMS });
    const tree = await render(<QuickCommandsManageSheet visible ws="app" host={null} onClose={() => {}} />);
    await act(async () => { pressableWith(tree, TX.add)!.props.onPress(); });
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await pressableWith(tree, TX.save)!.props.onPress(); });
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ ws: 'app', kind: 'shell', target: 'new' }), null);
  });

  test('전역으로 바꾸면 ws 를 null 로 보낸다(빈 문자열로 뭉개지 않는다)', async () => {
    const save = jest.spyOn(daemonService, 'saveQuickCommand').mockResolvedValue({ item: ITEMS[0], items: ITEMS });
    const tree = await render(<QuickCommandsManageSheet visible ws="" host={null} onClose={() => {}} />);
    await act(async () => { pressableWith(tree, TX.add)!.props.onPress(); });
    await act(async () => { await Promise.resolve(); });
    await act(async () => { pressableWith(tree, TX.scopeGlobal)!.props.onPress(); });
    await act(async () => { await pressableWith(tree, TX.save)!.props.onPress(); });
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ ws: null }), null);
  });

  test("홈 루트 워크스페이스면 ws:'' 로 저장한다(전역과 구분)", async () => {
    const save = jest.spyOn(daemonService, 'saveQuickCommand').mockResolvedValue({ item: ITEMS[0], items: ITEMS });
    const tree = await render(<QuickCommandsManageSheet visible ws="" host={null} onClose={() => {}} />);
    await act(async () => { pressableWith(tree, TX.add)!.props.onPress(); });
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await pressableWith(tree, TX.save)!.props.onPress(); });
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ ws: '' }), null);
  });
});
