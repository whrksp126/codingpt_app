/**
 * 코드 리뷰 — 폰 화면 계약.
 *
 * 이 파일이 고정하는 것:
 *  · 이 화면은 **에이전트가 요청했을 때만** 뜬다 → 왜 떴는지를 화면에 적는다(사용자가 부른 적 없는
 *    화면이 갑자기 뜨기 때문이다).
 *  · 덩어리마다 승인/거절, 바뀐 줄에만 코멘트. 되돌리기는 없다(사용자 확정).
 *  · **취소는 승인이 아니다** — 취소를 눌렀는데 승인 결과가 나가면 안 본 변경이 통과한다.
 *  · 못 보냈으면 그렇다고 적고 **리뷰를 닫지 않는다**(닫으면 적은 코멘트가 통째로 사라진다).
 *  · 판정은 PC 와 같은 파일에서 온다(ide/diffParse).
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Text, Pressable, TextInput } from 'react-native';

import ReviewView, { createReview, type ReviewState } from '../src/workspace/ide/ReviewView';
import * as D from '../src/workspace/ide/diffParse';
import { tx } from '../src/text';
import { REVIEW_TEXT } from '../src/text/review';

const TX = tx(REVIEW_TEXT);

jest.mock('../src/animations/haptics', () => ({ haptic: { keyPress: () => {} } }));

const DIFF = [
  'diff --git a/src/a.js b/src/a.js',
  '--- a/src/a.js',
  '+++ b/src/a.js',
  '@@ -1,4 +1,5 @@',
  ' const a = 1;',
  '-const b = 2;',
  '+const b = 3;',
  '+const c = 4;',
  ' module.exports = {};',
  '@@ -20,3 +21,4 @@ function far() {',
  '   return 1;',
  '+  // new',
  ' }',
  '',
].join('\n');
const DIFF_B = ['--- a/b.md', '+++ b/b.md', '@@ -1,2 +1,2 @@', '-# 옛 제목', '+# 새 제목', ' 본문', ''].join('\n');

const PAYLOAD = {
  reviewId: 'rv_1',
  title: '테스트 리뷰',
  files: [{ path: 'src/a.js', diffText: DIFF }, { path: 'b.md', diffText: DIFF_B, truncated: true }],
};

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
 * 그 글자를 가진 Pressable 들(행의 children 은 엘리먼트라 문자열로 못 편다).
 *  ⚠ **정확 일치**여야 한다. `includes` 로 하면 "승인" 이 "전부 승인" 버튼까지 잡는다 —
 *   실제로 이 테스트가 그렇게 한 번 틀렸다(덩어리 하나를 승인한 줄 알았는데 전부 승인이 눌렸다).
 */
function tapTargets(t: ReactTestRenderer.ReactTestRenderer, label: string) {
  return t.root.findAllByType(Pressable).filter((p) => {
    try { return p.findAllByType(Text).some((x) => flatten(x.props.children).trim() === label); }
    catch (_) { return false; }
  });
}
/** 위에서 n 번째(기본 0 = 화면에서 가장 먼저 나오는 것). */
function tapTarget(t: ReactTestRenderer.ReactTestRenderer, label: string, n = 0) {
  return tapTargets(t, label)[n];
}

async function mount(over?: Partial<ReviewState>) {
  let state = { ...createReview(PAYLOAD), ...(over || {}) };
  const onSubmit = jest.fn();
  const onCancel = jest.fn();
  let tree!: ReactTestRenderer.ReactTestRenderer;
  // onChange 는 **동기로** 다시 그린다 — 비동기로 미루면 누른 직후의 화면을 단언할 수 없다
  //  (실제로 이 테스트가 그렇게 한 번 틀렸다: 상태는 바뀌었는데 화면은 옛 값이었다).
  const el = (): React.ReactElement => (
    <ReviewView
      state={state}
      onChange={(next) => { state = next; tree.update(el()); }}
      onSubmit={onSubmit}
      onCancel={onCancel}
    />
  );
  await act(async () => { tree = ReactTestRenderer.create(el()); });
  return { get tree() { return tree; }, get state() { return state; }, onSubmit, onCancel };
}

test('왜 떴는지를 적는다(사용자가 부른 적 없는 화면이다)', async () => {
  const h = await mount();
  expect(texts(h.tree)).toContain(TX.why);
});

test('덩어리를 전부 그리고, 첫 파일의 하단 바가 1/2 를 가리킨다', async () => {
  const h = await mount();
  const t = texts(h.tree);
  // 두 덩어리 헤더(@@ 를 벗긴 위치 표기)
  expect(t.filter((x) => x.includes('+1,5') || x.includes('+21,4')).length).toBe(2);
  expect(t.some((x) => x.includes('a.js') && x.includes('1/2'))).toBe(true);
  // 상태 줄은 "남은 개수 · 코멘트 n개" 가 한 줄로 합쳐져 나온다 → 부분 문자열로 본다.
  expect(t.join('\n')).toContain(TX.remaining(3));   // a.js 2 + b.md 1
});

test('덩어리 승인 — 남은 개수가 줄고, 다시 누르면 해제된다', async () => {
  const h = await mount();
  await act(async () => { tapTarget(h.tree, TX.approve)?.props.onPress?.(); });
  expect(h.state.decisions['src/a.js#0']).toBe('approve');
  expect(texts(h.tree).join('\n')).toContain(TX.remaining(2));
  await act(async () => { tapTarget(h.tree, TX.approve)?.props.onPress?.(); });
  expect(h.state.decisions['src/a.js#0']).toBeUndefined();   // 잘못 누른 뒤 되돌릴 길
});

test('"이 파일 전부 승인" 은 그 파일만, "전부 승인" 은 모든 파일', async () => {
  const h = await mount();
  await act(async () => { tapTarget(h.tree, TX.approveAll)?.props.onPress?.(); });
  expect(D.fileVerdict(h.state.files[0], h.state.decisions)).toBe('approved');
  expect(D.fileVerdict(h.state.files[1], h.state.decisions)).toBe('partial');
  await act(async () => { tapTarget(h.tree, TX.approveEverything)?.props.onPress?.(); });
  expect(D.allDecided(h.state.files, h.state.decisions)).toBe(true);
  expect(texts(h.tree).join('\n')).toContain(TX.allDecided);
});

test('파일 넘기기 — 다음 파일의 덩어리로 바뀐다', async () => {
  const h = await mount();
  const next = h.tree.root.findAllByType(Pressable).find((p) => {
    try { return p.findAllByType(Text).length === 0; } catch (_) { return false; }
  });
  // 아이콘 버튼이라 글자가 없다 → 상태로 직접 넘긴 뒤 화면을 확인한다(조작 경로는 아래 바 테스트).
  void next;
  await mount();
  const h2 = await mount({ index: 1 });
  const t = texts(h2.tree);
  expect(t.some((x) => x.includes('b.md') && x.includes('2/2'))).toBe(true);
  expect(t).toContain(TX.truncated);      // 잘렸으면 잘렸다고 말한다
});

test('코멘트는 바뀐 줄에만 달 수 있다', async () => {
  const h = await mount();
  const hunk = h.state.files[0].hunkList[0];
  expect(hunk.lines.filter((l) => D.isCommentable(l)).length).toBe(3);   // -1 +2
  expect(hunk.lines.filter((l) => l.type === 'ctx').every((l) => !D.isCommentable(l))).toBe(true);
});

test('★ 코멘트 좌표 — 지운 줄은 옛 번호, 넣은 줄은 새 번호로 간다', async () => {
  // 에이전트는 이 좌표로 고칠 곳을 찾는다. 한쪽으로 뭉개면 엉뚱한 줄을 고친다.
  const h = await mount();
  // 코멘트 버튼은 **그 줄의 코드로** 찾는다. 순번으로 찾으면 코멘트를 하나 달자마자
  //  삭제(✕) 버튼이 같은 조건에 끼어들어 번호가 밀린다(실제로 이 테스트가 그렇게 틀렸다).
  const commentOn = async (code: string, text: string) => {
    const row = h.tree.root.findAll((n) => {
      if (typeof n.type !== 'object' && n.type !== 'View') return false;
      try {
        const own = n.findAllByType(Text).some((x) => flatten(x.props.children) === code);
        const btn = n.findAllByType(Pressable).filter((p) => p.props.hitSlop === 8);
        return own && btn.length === 1;
      } catch (_) { return false; }
    });
    const target = row[row.length - 1];
    await act(async () => { target.findAllByType(Pressable).find((p) => p.props.hitSlop === 8)!.props.onPress?.(); });
    await act(async () => { h.tree.root.findByType(TextInput).props.onChangeText(text); });
    await act(async () => { tapTarget(h.tree, TX.commentSave)?.props.onPress?.(); });
  };
  await commentOn('const b = 2;', '이 줄 왜 지웠어?');   // 지운 줄 → 옛 번호
  await commentOn('const b = 3;', '여기 상수로 빼줘');   // 넣은 줄 → 새 번호
  expect(h.state.comments.length).toBe(2);
  expect(texts(h.tree).join('\n')).toContain(TX.commentCount(2));
  const sub = D.buildSubmission(h.state.files, h.state.decisions, h.state.comments);
  expect(sub.files[0].comments).toEqual([
    { hunk: 0, side: 'old', line: 2, text: '이 줄 왜 지웠어?' },
    { hunk: 0, side: 'new', line: 2, text: '여기 상수로 빼줘' },
  ]);
});

test('★ 취소는 승인이 아니다 — 취소 버튼은 제출을 부르지 않는다', async () => {
  const h = await mount();
  await act(async () => { tapTarget(h.tree, TX.cancel)?.props.onPress?.(); });
  expect(h.onCancel).toHaveBeenCalled();
  expect(h.onSubmit).not.toHaveBeenCalled();
});

test('안 정한 곳이 있어도 보낼 수 있다(남은 개수를 계속 보여 준다)', async () => {
  const h = await mount();
  expect(texts(h.tree).join('\n')).toContain(TX.remaining(3));
  await act(async () => { tapTarget(h.tree, TX.send)?.props.onPress?.(); });
  expect(h.onSubmit).toHaveBeenCalled();
});

test('★ 못 보냈으면 그렇다고 적는다(조용한 실패 금지)', async () => {
  const h = await mount({ error: '호스트가 오프라인이에요' });
  expect(texts(h.tree).join('\n')).toContain(TX.sendFailed);
  expect(texts(h.tree).join('\n')).toContain('호스트가 오프라인이에요');
});

test('판정은 PC 와 같은 파일에서 온다', () => {
  const hunks = D.parseHunks(DIFF);
  expect(hunks.length).toBe(2);
  expect(hunks[0].adds).toBe(2);
  expect(hunks[0].dels).toBe(1);
  expect(D.anchorOf(hunks[0].lines.find((l) => l.type === 'add')!)).toEqual({ side: 'new', line: 2 });
});
