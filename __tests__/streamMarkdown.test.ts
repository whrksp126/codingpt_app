/**
 * 스트리밍 마크다운 분할(chat-v2-design.md §10.5).
 *
 * 고정하는 것:
 *  · **접두 안정** — 글이 뒤로만 자라면 이미 굳힌 블록은 바뀌지 않는다(그래야 memo 가 먹고, 굳혔던 글이
 *    다시 풀려 깜빡이지 않는다).
 *  · 코드 펜스 안의 빈 줄은 경계가 아니다.
 *  · 꼬리 보정은 글자를 **지우지 않는다**. 닫아 주거나 문법이 못 되게 할 뿐이다.
 */
import { splitStream, healTail, renderParts } from '../src/workspace/conv/streamMarkdown';

describe('splitStream', () => {
  test('빈 줄 경계로 굳힌다 — 마지막 블록은 꼬리', () => {
    const r = splitStream('첫 문단\n\n둘째 문단\n\n셋째 문단\n이어서 쓰는 중');
    expect(r.done).toEqual(['첫 문단', '둘째 문단']);
    expect(r.tail).toBe('셋째 문단\n이어서 쓰는 중');
    expect(r.inFence).toBe(false);
  });

  test('★ 경계는 **다음 줄이 완성된 뒤에** 정한다 — 쓰는 중인 줄로 정하면 다음 조각에서 뒤집힌다', () => {
    // 다음 줄이 아직 `-` 뿐이다: 목록이 이어지는지(같은 블록) 새 문단인지 알 수 없다 → 굳히지 않는다.
    const a = splitStream('- 하나\n\n-');
    expect(a.done).toEqual([]);
    expect(a.tail).toBe('- 하나\n\n-');
    // 줄이 완성되자 같은 목록임이 드러났다 — 앞에서 굳혔다면 여기서 풀어야 했다.
    const b = splitStream('- 하나\n\n- 둘\n\n문단\n끝');
    expect(b.done).toEqual(['- 하나\n\n- 둘']);
  });

  test('★ 코드 펜스 안의 빈 줄은 경계가 아니다', () => {
    const r = splitStream('설명\n\n```ts\nconst a = 1;\n\nconst b = 2;\n```\n\n끝');
    expect(r.done).toEqual(['설명', '```ts\nconst a = 1;\n\nconst b = 2;\n```']);
    expect(r.tail).toBe('끝');
  });

  test('열린 펜스는 꼬리에 남고 inFence', () => {
    const r = splitStream('설명\n\n```py\nprint(1)\n\nprint(');
    expect(r.done).toEqual(['설명']);
    expect(r.tail).toBe('```py\nprint(1)\n\nprint(');
    expect(r.inFence).toBe(true);
  });

  test('닫힌 코드 블록은 빈 줄을 기다리지 않고 굳는다', () => {
    const r = splitStream('```\na\n```\n다음 글');
    expect(r.done).toEqual(['```\na\n```']);
    expect(r.tail).toBe('다음 글');
  });

  test('안쪽 펜스 글자가 달라도(~~~ 안의 ```) 닫히지 않는다', () => {
    const r = splitStream('~~~\n```\n코드\n```\n\n아직 안\n');
    expect(r.inFence).toBe(true);
    expect(r.done).toEqual([]);
  });

  test('빈 줄을 사이에 둔 목록은 한 블록이다(번호가 다시 1부터 서지 않게)', () => {
    const r = splitStream('1. 하나\n\n2. 둘\n\n3. 셋\n\n맺음말\n\n끝\n.');
    expect(r.done[0]).toBe('1. 하나\n\n2. 둘\n\n3. 셋');
    expect(r.done[1]).toBe('맺음말');
  });

  test('들여 쓴 이어지는 줄은 같은 블록', () => {
    const r = splitStream('- 항목\n\n  이어지는 설명\n\n다음 문단\n\n끝\n.');
    expect(r.done[0]).toBe('- 항목\n\n  이어지는 설명');
  });

  test('★ 접두 안정 — 한 글자씩 자라는 동안 굳힌 블록은 바뀌지 않는다', () => {
    const full = [
      '# 제목', '', '첫 문단은 **굵게** 와 `코드` 를 쓴다.', '', '- 하나', '- 둘', '', '- 셋', '',
      '```js', 'const x = {', '', '  a: 1,', '};', '```', '', '| a | b |', '|---|---|', '| 1 | 2 |', '',
      '[링크](https://example.com) 끝.', '', '1. 첫째', '', '   이어짐', '2. 둘째', '', '마지막 문단',
    ].join('\n');
    let prev: string[] = [];
    for (let i = 1; i <= full.length; i++) {
      const cur = splitStream(full.slice(0, i)).done;
      // 이전에 굳힌 블록은 그대로 앞에 있어야 한다.
      expect(cur.slice(0, prev.length)).toEqual(prev);
      prev = cur;
    }
    expect(prev.length).toBeGreaterThanOrEqual(5);
  });

  test('잃는 글자가 없다 — 굳힌 블록 + 꼬리를 이으면 원문(빈 줄 제외)', () => {
    const src = '가\n\n나\n다\n\n```\n라\n\n마\n```\n\n바';
    const r = splitStream(src);
    const joined = [...r.done, r.tail].join('\n').replace(/\n+/g, '\n');
    expect(joined).toBe(src.replace(/\n+/g, '\n'));
  });

  test('CRLF 도 같은 결과', () => {
    expect(splitStream('가\r\n\r\n나\r\n\r\n다\r\n라').done).toEqual(['가', '나']);
  });

  test('빈 글', () => {
    expect(splitStream('')).toEqual({ done: [], tail: '', inFence: false });
    expect(renderParts('')).toEqual({ done: [], tail: '' });
  });
});

describe('healTail — 미완 블록의 꼬리 보정', () => {
  test('열린 코드 펜스는 닫는다(여는 표식과 같은 글자·길이)', () => {
    expect(healTail('```ts\nconst a', true)).toBe('```ts\nconst a\n```');
    expect(healTail('~~~~\nx\n', true)).toBe('~~~~\nx\n~~~~');
  });

  test('짝 없는 굵게·기울임·취소선을 닫는다', () => {
    expect(healTail('이건 **굵은 글', false)).toBe('이건 **굵은 글**');
    expect(healTail('이건 *기울인', false)).toBe('이건 *기울인*');
    expect(healTail('이건 ~~지운', false)).toBe('이건 ~~지운~~');
    expect(healTail('앞 __밑줄', false)).toBe('앞 __밑줄__');
  });

  test('닫는 표식은 끝 공백 **앞**에 붙는다(공백 뒤에 붙으면 강조가 아니다)', () => {
    expect(healTail('**굵게 ', false)).toBe('**굵게** ');
  });

  test('표식만 막 온 상태는 글자로 돌린다(빈 강조 금지)', () => {
    expect(healTail('앞 **', false)).toBe('앞 \\*\\*');
    expect(healTail('앞 *', false)).toBe('앞 \\*');
  });

  test('짝 없는 백틱을 닫는다 — 그 안의 별표는 문법이 아니다', () => {
    expect(healTail('`a * b', false)).toBe('`a * b`');
    expect(healTail('이미 `닫힌` 코드', false)).toBe('이미 `닫힌` 코드');
  });

  test('목록 표식의 별표는 강조가 아니다', () => {
    expect(healTail('* 항목 하나', false)).toBe('* 항목 하나');
    expect(healTail('* 항목 **굵', false)).toBe('* 항목 **굵**');
  });

  test('쓰다 만 링크·이미지는 글자 그대로 둔다', () => {
    expect(healTail('여기 [라벨](https://exa', false)).toBe('여기 \\[라벨\\](https://exa');
    expect(healTail('여기 [라', false)).toBe('여기 \\[라');
    expect(healTail('그림 ![대체](a/b', false)).toBe('그림 !\\[대체\\](a/b');
    // 다 온 링크는 건드리지 않는다.
    expect(healTail('여기 [라벨](https://example.com) 끝', false)).toBe('여기 [라벨](https://example.com) 끝');
  });

  test('표는 구분선이 오기 전까지 일반 글자', () => {
    expect(healTail('| a | b |', false)).toBe('\\| a \\| b \\|');
    expect(healTail('| a | b |\n|--', false)).toBe('\\| a \\| b \\|\n\\|--');
    // 구분선이 오면 표다.
    expect(healTail('| a | b |\n|---|---|', false)).toBe('| a | b |\n|---|---|');
    expect(healTail('| a | b |\n|---|---|\n| 1 |', false)).toBe('| a | b |\n|---|---|\n| 1 |');
  });

  test('보정은 마지막 블록에만 — 앞 블록은 그대로', () => {
    expect(healTail('앞 문단 *별 하나\n\n뒤 **굵', false)).toBe('앞 문단 *별 하나\n\n뒤 **굵**');
  });

  test('★ 글자를 지우지 않는다 — 보정 결과에서 덧붙인 표식·역슬래시를 빼면 원문', () => {
    for (const src of ['**a', '*a', '`a', '[a](b', '| a |', 'a **', '~~a', '평범한 글']) {
      const healed = healTail(src, false);
      const strip = (s: string) => s.replace(/[\\*`~_]/g, '');
      expect(strip(healed)).toBe(strip(src));
    }
  });

  test('★ 자라는 동안 보정 결과가 예외 없이 나온다(모든 접두)', () => {
    const full = '글 **굵게** 와 *기울임* 그리고 `코드` [링크](http://x.y) ![그림](a.png)\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n```sh\nls -la\n```\n끝';
    for (let i = 0; i <= full.length; i++) {
      const p = renderParts(full.slice(0, i));
      expect(typeof p.tail).toBe('string');
      expect(Array.isArray(p.done)).toBe(true);
    }
  });
});
