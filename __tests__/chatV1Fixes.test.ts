/**
 * v1 채팅에서 확인된 결함 — 다시 생기지 않게 고정한다.
 *  ① 고아 첨부 토큰을 **한국어 낱말로만** 걷었다 → 다른 언어 사용자의 빈 토큰이 그대로 에이전트에게 갔다.
 *  ② 받아쓰기 로케일이 'ko-KR' 로 굳어 있었다 → 앱 언어를 따른다.
 *  ③ 질문 답 전송 실패를 삼켜 쓴 글이 사라졌다 → 실패하면 입력칸에 되돌린다.
 */
import fs from 'node:fs';
import path from 'node:path';
import * as i18n from '../src/i18n/index';
import { attachToken, orphanTokenRe, resolveAttachTokens, type AttachEntry } from '../src/workspace/chat/composer';
import { attachWordsAll, attachWordsNow } from '../src/workspace/chat/attachWords';

afterEach(() => i18n.setLangRuntime('ko'));

describe('① 고아 첨부 토큰 — 모든 언어', () => {
  test.each(i18n.LANGS)('★ %s 로 만든 토큰도 걷힌다', (lang) => {
    i18n.setLangRuntime(lang);
    const photo = attachToken(2, true, attachWordsNow());
    const file = attachToken(3, false, attachWordsNow());
    // 앱 언어를 바꾼 뒤(=복원된 초안)에도 걷혀야 한다 → 걷을 때는 다른 언어로 본다.
    i18n.setLangRuntime(lang === 'ko' ? 'en' : 'ko');
    expect(resolveAttachTokens(`이것 ${photo} 과 ${file} 을 봐`, [], attachWordsAll())).toBe('이것 과 을 봐');
  });

  test('낱말을 안 넘기면 한국어 원문만 걷는다(기본값 — PC 와 같은 규칙)', () => {
    expect(resolveAttachTokens('a [사진 1] b [Photo 2] c', [])).toBe('a b [Photo 2] c');
    expect(attachToken(4, true)).toBe('[사진 4]');
    expect(attachToken(5, false)).toBe('[파일 5]');
  });

  test('★ composer.ts 는 import 를 갖지 않는다 — PC 대조 테스트가 이 파일을 그대로 실행한다', () => {
    const src = fs.readFileSync(path.join(__dirname, '../src/workspace/chat/composer.ts'), 'utf8');
    expect(/^\s*import[\s{*]/m.test(src)).toBe(false);
    // PC 테스트(codingpt_pc/test/chat-composer.mjs)가 보는 글자 — 고아 토큰 기본식.
    expect(src).toContain('(?:사진|파일)');
  });

  test('짝이 있는 토큰은 인용 경로로 바뀐다(언어와 무관)', () => {
    i18n.setLangRuntime('en');
    const reg: AttachEntry[] = [{ token: attachToken(1, true, attachWordsNow()), path: "/tmp/a'b.png", name: 'a.png', image: true }];
    expect(reg[0].token).not.toBe('[사진 1]');
    expect(resolveAttachTokens(`see ${reg[0].token} now`, reg)).toBe("see '/tmp/a'\\''b.png' now");
  });

  test('토큰처럼 생겼지만 우리 낱말이 아닌 것은 건드리지 않는다', () => {
    expect(resolveAttachTokens('배열 [index 1] 과 [TODO 3]', [], attachWordsAll())).toBe('배열 [index 1] 과 [TODO 3]');
    expect('x [사진 12] y'.replace(orphanTokenRe(), '')).toBe('x  y');
  });

  test('낱말에 정규식 글자가 있어도 식이 깨지지 않는다', () => {
    expect(() => orphanTokenRe(['a.b', 'c(d', 'e|f', '[g]'])).not.toThrow();
    expect('[a.b 1] [axb 1]'.replace(orphanTokenRe(['a.b']), '')).toBe(' [axb 1]');
    for (const w of attachWordsAll()) expect(`[${w} 7]`.replace(orphanTokenRe(attachWordsAll()), '')).toBe('');
  });
});

describe('② 받아쓰기 로케일', () => {
  test.each([['ko', 'ko-KR'], ['en', 'en-US'], ['ja', 'ja-JP'], ['zh-CN', 'zh-CN'], ['es', 'es-ES'], ['de', 'de-DE'], ['fr', 'fr-FR']] as const)('%s → %s', (lang, want) => {
    i18n.setLangRuntime(lang);
    expect(i18n.speechLocale()).toBe(want);
  });

  test('훅이 로케일을 굳혀 두지 않는다', () => {
    // 받아쓰기 훅의 정본은 컴포저 파일에 있다(hooks/useMicDictation.ts 는 다시 내보낼 뿐).
    const src = fs.readFileSync(path.join(__dirname, '../src/workspace/chat/ChatComposer.tsx'), 'utf8');
    expect(src).not.toMatch(/locale:\s*'ko-KR'/);
    expect(src).toContain('locale: i18n.speechLocale()');
  });
});

describe('③ 질문 답 전송 실패 — 초안 복구', () => {
  const src = fs.readFileSync(path.join(__dirname, '../src/workspace/chat/ChatBody.tsx'), 'utf8');
  test('실패를 빈 catch 로 삼키지 않는다', () => {
    expect(src).not.toContain("/* 실패는 카드가 남아 재시도 가능 */");
    expect(src).not.toContain("/* 카드가 남아 재시도 가능 */");
    expect((src.match(/restoreDraft\(text\)/g) || []).length).toBe(2);
  });
});

test('variants — 원문 + 모든 언어 표기(중복 없음)', () => {
  const v = i18n.variants('사진');
  expect(v[0]).toBe('사진');
  expect(new Set(v).size).toBe(v.length);
  expect(v.length).toBeGreaterThan(1);
  expect(i18n.variants('사전에 없는 문장')).toEqual(['사전에 없는 문장']);
});
