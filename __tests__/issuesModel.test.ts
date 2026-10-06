// 이슈 화면의 순수 판정(issuesModel.ts) — 걸러 보기·묶기·정렬은 PC issues-model.js 와 같은 규칙, 본문 편집 도우미는 폰 전용.
import { filterIssues, groupByStatus, sortTable, sourceOptions, openCount, toggleLinePrefix, toggleWrap, insertBlock, STATUSES } from '../src/workspace/issues/issuesModel';

const mk = (id: string, status: string, o: any = {}) => ({ id, number: o.n || 1, key: '#' + (o.n || 1), title: o.title || id, status, priority: o.pri || 'none', labels: o.labels || [], cwd: o.cwd || 'a', source: { provider: o.src || 'codingpt' }, updatedAt: o.at || 0 });
const L = [mk('a', 'todo', { pri: 'low', at: 5 }), mk('b', 'todo', { pri: 'urgent', at: 1 }), mk('c', 'in_progress', { src: 'github', cwd: 'b', labels: ['bug'] }), mk('d', 'done', { at: 9 }), mk('e', 'in_review', { title: '로그인 리다이렉트' })];

test('걸러 보기 · 묶기 · 정렬(PC 와 같은 결과)', () => {
  expect(filterIssues(L, {}).map((x) => x.id).join('')).toBe('abce');
  expect(filterIssues(L, { done: true, source: 'github' }).map((x) => x.id).join('')).toBe('c');
  expect(filterIssues(L, { cwd: 'b' }).length).toBe(1);
  expect(filterIssues(L, { q: '리다이' }).map((x) => x.id).join('')).toBe('e');
  expect(filterIssues(L, { q: 'BUG' }).map((x) => x.id).join('')).toBe('c');
  expect(groupByStatus(filterIssues(L, { done: true })).map((g) => [g.status, g.items.map((x) => x.id).join('')])).toEqual([['in_progress', 'c'], ['in_review', 'e'], ['todo', 'ba'], ['done', 'd']]);
  expect(groupByStatus([], { order: STATUSES, keepEmpty: true }).length).toBe(4);
  expect(sortTable(L, 'priority', 1)[0].id).toBe('b');
  expect(sortTable(L, 'updatedAt', -1)[0].id).toBe('d');
  expect(sourceOptions(L, [{ provider: 'github' }])).toEqual(['all', 'codingpt', 'github']);
  expect(openCount(L)).toBe(4);
});

test('줄 앞 표시 — 붙이고, 다시 누르면 떼고, 다른 표시는 갈아 끼운다', () => {
  const t0 = 'first\nsecond\nthird';
  const a = toggleLinePrefix(t0, { start: 8, end: 8 }, '- ');
  expect(a.text).toBe('first\n- second\nthird');
  expect(a.sel).toEqual({ start: 10, end: 10 });
  expect(toggleLinePrefix(a.text, a.sel, '- ').text).toBe(t0);
  expect(toggleLinePrefix(a.text, a.sel, '## ').text).toBe('first\n## second\nthird');
  expect(toggleLinePrefix(t0, { start: 0, end: t0.length }, '1. ').text).toBe('1. first\n2. second\n3. third');
  expect(toggleLinePrefix('', { start: 0, end: 0 }, '- [ ] ').text).toBe('- [ ] ');
});

test('감싸기 — 고른 글을 감싸고, 이미 감싸져 있으면 푼다', () => {
  const a = toggleWrap('make bold now', { start: 5, end: 9 }, '**');
  expect(a.text).toBe('make **bold** now');
  expect(a.sel).toEqual({ start: 7, end: 11 });
  expect(toggleWrap(a.text, a.sel, '**')).toEqual({ text: 'make bold now', sel: { start: 5, end: 9 } });
  expect(toggleWrap('ab', { start: 1, end: 1 }, '`')).toEqual({ text: 'a``b', sel: { start: 2, end: 2 } });
});

test('블록 넣기 — 앞뒤 줄바꿈을 맞춘다', () => {
  expect(insertBlock('abc', { start: 3, end: 3 }, '---').text).toBe('abc\n---\n');
  expect(insertBlock('ab\ncd', { start: 3, end: 3 }, '![x](att:1)').text).toBe('ab\n![x](att:1)\ncd');
  const r = insertBlock('', { start: 0, end: 0 }, '```\n\n```');
  expect(r.text).toBe('```\n\n```\n');
  expect(r.sel.start).toBe(r.text.length);
});
