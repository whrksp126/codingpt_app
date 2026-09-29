// 작업 리뷰 코멘트 직렬화(설계 §8.5) — 에이전트 터미널에 들어가는 평문이라 문법이 곧 계약이다.
//  PC diff-parse.js 와 글자까지 같아야 한다 → 공유 픽스처 review-comments-01.json 도 대조한다.
import { serializeReviewComments, buildSubmission, REVIEW_COMMENTS_MAX_BYTES } from '../src/workspace/ide/diffParse';
import { loadFixture, fixtureTest } from './fixtures';

const utf8 = (s: string) => Buffer.byteLength(s, 'utf8');

describe('serializeReviewComments — 문법', () => {
  test('빈 제출 → 빈 문자열(버튼 비활성)', () => {
    expect(serializeReviewComments({ comments: [], decisions: {}, note: '' }, { title: 'T' })).toBe('');
    expect(serializeReviewComments({ comments: [], decisions: { 'a.ts#0': 'approve' }, note: '   ' }, { title: 'T' })).toBe('');
    expect(serializeReviewComments(null, { title: 'T' })).toBe('');
  });

  test('코멘트 줄: 경로 오름차순 → 헝크 → 입력 순, old 표기, 개행은 공백', () => {
    const out = serializeReviewComments({
      comments: [
        { path: 'src/b.ts', hunk: 0, side: 'new', line: 10, text: '둘째 파일' },
        { path: 'src/a.ts', hunk: 1, side: 'new', line: 30, text: '뒤 헝크' },
        { path: 'src/a.ts', hunk: 0, side: 'old', line: 4, text: '지운 줄\n다시 생각' },
        { path: 'src/a.ts', hunk: 0, side: 'new', line: 5, text: '같은 헝크 둘째\r\n줄' },
      ],
      decisions: {},
      note: '',
    }, { title: '로그인 폼' });
    expect(out).toBe([
      '리뷰 코멘트 (로그인 폼)',
      '- src/a.ts:4(old) 지운 줄 다시 생각',
      '- src/a.ts:5 같은 헝크 둘째 줄',
      '- src/a.ts:30 뒤 헝크',
      '- src/b.ts:10 둘째 파일',
    ].join('\n'));
  });

  test('거절 헝크: 코멘트 줄마다 [reject], 코멘트 없는 거절은 따로 한 줄, 메모는 마지막', () => {
    const out = serializeReviewComments({
      comments: [
        { path: 'x.ts', hunk: 2, side: 'new', line: null, text: '이 덩어리 전체' },
        { path: 'x.ts', hunk: 2, side: 'new', line: 12, text: '여기도' },
      ],
      decisions: { 'x.ts#2': 'reject', 'x.ts#0': 'approve', 'w.ts#3': 'reject', 'x.ts#1': 'reject' },
      note: '  테스트도 추가해 주세요 ',
    }, { title: 'T' });
    expect(out).toBe([
      '리뷰 코멘트 (T)',
      '- x.ts hunk 2 [reject] 이 덩어리 전체',
      '- x.ts:12 [reject] 여기도',
      '- w.ts hunk 3 [reject]',
      '- x.ts hunk 1 [reject]',
      '전체 메모: 테스트도 추가해 주세요',
    ].join('\n'));
  });

  test("경로에 '#' 가 있어도 마지막 '#' 로 헝크를 자른다", () => {
    expect(serializeReviewComments({ comments: [], decisions: { 'docs/#1 notes.md#4': 'reject' }, note: '' }, { title: 'T' }))
      .toBe('리뷰 코멘트 (T)\n- docs/#1 notes.md hunk 4 [reject]');
  });

  test('메모만 있어도 보낸다', () => {
    expect(serializeReviewComments({ comments: [], decisions: {}, note: '전체적으로 좋아요' }, { title: 'T' }))
      .toBe('리뷰 코멘트 (T)\n전체 메모: 전체적으로 좋아요');
  });

  test('buildSubmission() 결과 모양도 같은 출력', () => {
    const files = [{ path: 'a.ts', hunks: 2 }];
    const decisions = { 'a.ts#1': 'reject' as const };
    const comments = [{ path: 'a.ts', hunk: 0, side: 'new' as const, line: 3, text: 'hi' }];
    const a = serializeReviewComments({ comments, decisions, note: 'n' }, { title: 'T' });
    const b = serializeReviewComments(buildSubmission(files, decisions, comments, 'n') as any, { title: 'T' });
    expect(b).toBe(a);
  });

  test('UTF-8 30000 바이트 상한 — 줄 경계에서 자르고 `… (잘림)` 을 붙인다', () => {
    const comments = Array.from({ length: 2000 }, (_, i) => ({ path: 'big.ts', hunk: 0, side: 'new' as const, line: i + 1, text: '한글코멘트'.repeat(3) }));
    const out = serializeReviewComments({ comments, decisions: {}, note: '' }, { title: 'T' });
    expect(utf8(out)).toBeLessThanOrEqual(REVIEW_COMMENTS_MAX_BYTES);
    const lines = out.split('\n');
    expect(lines[lines.length - 1]).toBe('… (잘림)');
    expect(lines[0]).toBe('리뷰 코멘트 (T)');
    expect(lines[lines.length - 2]).toMatch(/^- big\.ts:\d+ /);
  });
});

// ── 공유 픽스처(PC 와 대조) — 모양: { cases: [{ name, input, opts:{title}, expect }] } ──
describe('공유 픽스처 review-comments-01.json', () => {
  fixtureTest('PC diff-parse.js 와 같은 출력', () => {
    const fx = loadFixture<any>('review-comments-01.json');
    expect(fx).toBeTruthy();
    const cases: any[] = Array.isArray(fx) ? fx : fx.cases || [];
    expect(cases.length).toBeGreaterThanOrEqual(6);
    for (const c of cases) {
      const title = c.title ?? c.opts?.title ?? '';
      const got = serializeReviewComments(c.input ?? c.submission, { title });
      if (c.expectMeta) {
        // 거대한 입력은 결과 대신 모양을 대조한다(줄 수·마지막 줄·끝에서 둘째 줄 접두·바이트).
        const lines = got.split('\n');
        const m = c.expectMeta;
        expect([c.name, lines.length, lines[lines.length - 1], lines[lines.length - 2].startsWith(m.secondLastPrefix), utf8(got)])
          .toEqual([c.name, m.lines, m.lastLine, true, m.bytes]);
      } else {
        expect([c.name || '', got]).toEqual([c.name || '', c.expect ?? c.output ?? c.expected]);
      }
    }
  });
});
