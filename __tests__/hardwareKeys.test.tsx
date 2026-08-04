/**
 * 하드웨어 키보드 라우팅 — 웹뷰 안 판정기가 `commands.ts` 와 **한 글자도 안 갈리는지** 고정한다.
 *
 * 왜 이 테스트가 필요한가: 웹뷰 안에는 import 가 없어서 조합 판정을 손으로 옮겨 놨다
 *  (palette/webviewKeys.ts 의 WEBVIEW_KEY_JS). 둘이 갈리면 증상이 조용하다 —
 *  설정 화면엔 "⌘E" 라고 멀쩡히 적혀 있는데 눌러도 아무 일도 안 일어난다.
 *  그래서 **스니펫을 실제로 실행해서** 같은 이벤트에 같은 답을 내는지 본다.
 */
import { comboFromEvent, resolveBindings, commandForCombo } from '../src/palette/commands';
import { WEBVIEW_KEY_JS, webviewKeyTableJs } from '../src/palette/webviewKeys';

type Ev = {
  code?: string; key?: string;
  metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean; shiftKey?: boolean;
};

/** 스니펫을 진짜 실행해 `window.__cptCombo` / `__cptAppKey` 를 얻는다(문자열 비교가 아니다). */
function loadSnippet(tableJs?: string) {
  const win: Record<string, unknown> = {};
  // eslint-disable-next-line no-new-func
  new Function('window', `${WEBVIEW_KEY_JS}\n${tableJs || ''}`)(win);
  return {
    combo: win.__cptCombo as (e: Ev) => string | null,
    appKey: win.__cptAppKey as (e: Ev) => string | null,
    table: () => win.__CPT_KEYS as Record<string, string>,
  };
}

/** 사람이 실제로 누르는 것들 + 판정이 흔들리기 쉬운 가장자리. */
function corpus(): Ev[] {
  const out: Ev[] = [];
  const codes = [
    'KeyA', 'KeyC', 'KeyP', 'KeyT', 'KeyE', 'KeyR', 'KeyW', 'KeyB', 'KeyU', 'KeyZ',
    'Digit1', 'Digit8', 'Digit0', 'Numpad3',
    'Comma', 'Period', 'Slash', 'Minus', 'Equal', 'Backquote', 'BracketLeft',
    'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
    'Enter', 'Escape', 'Space', 'Tab', 'Backspace', 'Delete', 'Home', 'End', 'PageUp',
    'F1', 'F5', 'F12',
    '',                        // code 를 안 주는 기기(구형 안드로이드 키보드)
    'IntlBackslash', 'Lang1',  // 표에 없는 code → key 폴백
  ];
  const mods = [
    {}, { metaKey: true }, { ctrlKey: true }, { altKey: true }, { shiftKey: true },
    { metaKey: true, shiftKey: true }, { metaKey: true, altKey: true },
    { metaKey: true, ctrlKey: true }, { ctrlKey: true, altKey: true },
    { metaKey: true, ctrlKey: true, altKey: true, shiftKey: true },
  ];
  const keyFor = (code: string) => {
    if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
    if (/^Digit([0-9])$/.test(code)) return code.slice(5);
    if (code === 'Comma') return ',';
    if (code === 'Period') return '.';
    if (code === 'Slash') return '/';
    if (code === 'Minus') return '-';
    if (code === 'Equal') return '=';
    if (code === 'Backquote') return '`';
    if (code === 'BracketLeft') return '[';
    if (code === 'Space') return ' ';
    return code;
  };
  for (const code of codes) for (const m of mods) out.push({ code, key: keyFor(code) || 'a', ...m });
  // 수식어 키 자체가 눌린 순간(둘 다 null 이어야 한다 — 아니면 ⌘ 를 누르자마자 명령이 돈다)
  for (const k of ['Shift', 'Control', 'Alt', 'Meta']) {
    out.push({ code: 'Meta' + k, key: k, metaKey: true });
  }
  // 한글 IME·조합 상태에서 오는 값들
  out.push({ code: 'KeyR', key: 'ㄱ', metaKey: true });
  out.push({ code: '', key: 'ㅏ', metaKey: true });
  out.push({ code: '', key: '가', metaKey: true });
  // ⌥ 로 글자가 바뀌는 macOS 특유의 값(code 가 진실이어야 한다)
  out.push({ code: 'KeyA', key: 'å', metaKey: true, altKey: true });
  return out;
}

test('★ 웹뷰 판정기 = commands.comboFromEvent (같은 이벤트, 같은 답)', () => {
  const S = loadSnippet();
  const evs = corpus();
  const diffs: string[] = [];
  for (const e of evs) {
    const mine = S.combo(e);
    const theirs = comboFromEvent(e, true);   // 웹뷰 안에서 Mod 는 항상 meta
    if (mine !== theirs) diffs.push(`${JSON.stringify(e)} → 웹뷰=${mine} 표=${theirs}`);
  }
  expect(diffs).toEqual([]);
  expect(evs.length).toBeGreaterThan(300);
});

test('Ctrl·Alt 만 눌린 조합은 절대 앱으로 가지 않는다 (셸의 키다)', () => {
  const binds = resolveBindings('app', null);
  const S = loadSnippet(webviewKeyTableJs(binds));
  const stolen = corpus()
    .filter((e) => !e.metaKey)
    .map((e) => S.appKey(e))
    .filter(Boolean);
  expect(stolen).toEqual([]);
  // Ctrl-A/Ctrl-R/Ctrl-W — readline 이 쓰는 대표 키가 살아 있는지 이름으로도 못박는다.
  for (const code of ['KeyA', 'KeyR', 'KeyW', 'KeyE', 'KeyD']) {
    expect(S.appKey({ code, key: code.slice(3).toLowerCase(), ctrlKey: true })).toBeNull();
  }
});

test('표에 걸린 ⌘ 조합만 가로챈다 — 나머지 ⌘ 조합은 터미널로 흘려보낸다', () => {
  const binds = resolveBindings('app', null);
  const S = loadSnippet(webviewKeyTableJs(binds));
  // 기본 표에 있는 것
  expect(S.appKey({ code: 'KeyP', key: 'p', metaKey: true })).toBe('Mod+P');
  expect(S.appKey({ code: 'KeyT', key: 't', metaKey: true })).toBe('Mod+T');
  expect(S.appKey({ code: 'Digit3', key: '3', metaKey: true })).toBe('Mod+3');
  expect(S.appKey({ code: 'KeyE', key: 'e', metaKey: true, shiftKey: true })).toBe('Mod+Shift+E');
  // 표에 없는 ⌘ 조합 — 가로채면 터미널의 ⌘C(복사) 같은 것이 죽는다
  expect(S.appKey({ code: 'KeyC', key: 'c', metaKey: true })).toBeNull();
  expect(S.appKey({ code: 'KeyV', key: 'v', metaKey: true })).toBeNull();
  expect(S.appKey({ code: 'KeyQ', key: 'q', metaKey: true })).toBeNull();
  // 잡은 조합은 실제로 명령으로 풀려야 한다(표 → 명령 왕복)
  expect(commandForCombo(binds, S.appKey({ code: 'KeyP', key: 'p', metaKey: true }))).toBe('palette.open');
});

test('단축키를 비우면(null) 그 조합은 터미널로 돌아간다', () => {
  const binds = resolveBindings('app', { 'palette.open': null });
  const S = loadSnippet(webviewKeyTableJs(binds));
  expect(S.appKey({ code: 'KeyP', key: 'p', metaKey: true })).toBeNull();
  expect(Object.keys(S.table())).not.toContain('Mod+P');
});

test('사용자가 Ctrl 조합으로 재바인딩해도 터미널이 이긴다', () => {
  // Mod 없이 Ctrl 만 있는 조합은 표에 있어도 __cptAppKey 의 첫 관문(metaKey)에서 걸러진다.
  const binds = resolveBindings('app', { 'ws.addTerminal': 'Ctrl+T' });
  const S = loadSnippet(webviewKeyTableJs(binds));
  expect(S.appKey({ code: 'KeyT', key: 't', ctrlKey: true })).toBeNull();
});

test('앱 전용 표만 실린다 — PC 전용 명령은 폰 웹뷰로 안 간다', () => {
  const S = loadSnippet(webviewKeyTableJs(resolveBindings('app', null)));
  const ids = Object.values(S.table());
  expect(ids).toContain('palette.open');
  expect(ids).not.toContain('pane.splitRight');   // pc 전용(app:false)
  expect(ids).not.toContain('find.open');         // 폰은 트리 헤더에 검색창 상시 노출
});
