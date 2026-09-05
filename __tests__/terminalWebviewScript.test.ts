import fs from 'node:fs';
import path from 'node:path';

// TerminalWebView 의 화면 로직은 전부 문자열 템플릿 안의 인라인 <script> 다. 타입체커도 eslint 도
// 이 안을 못 본다 — 괄호 하나가 깨져도 빌드는 통과하고 **기기에서 터미널만 빈 화면**이 된다.
// 그래서 (1) 템플릿을 꺼내 실제 파서에 태워 문법을 검증하고 (2) 서버 정본 계약을 문자열로 고정한다.
const source = fs.readFileSync(
  path.join(__dirname, '../src/components/module/ide/TerminalWebView.tsx'),
  'utf8',
);

/** buildHtml 의 템플릿 리터럴 본문(백틱 사이)만 꺼낸다. */
function htmlTemplate(): string {
  const at = source.indexOf('const buildHtml =');
  expect(at).toBeGreaterThan(-1);
  const open = source.indexOf('`', at);
  const close = source.indexOf('`;', open + 1);
  expect(close).toBeGreaterThan(open);
  return source.slice(open + 1, close);
}

/**
 * `${…}` 보간을 중립 토큰 0 으로 치환 — 중첩 중괄호를 세며 지운다(정규식으론 못 지운다).
 * 빈 문자열이 아니라 0 인 이유: 보간이 fontFamily: "${…}" 처럼 **따옴표 안**에도 있어
 * 빈 문자열을 넣으면 따옴표 4개가 되어 가짜 SyntaxError 가 난다.
 */
function stripInterpolations(tpl: string): string {
  let out = '';
  for (let i = 0; i < tpl.length; i++) {
    if (tpl[i] === '$' && tpl[i + 1] === '{') {
      let depth = 1;
      let j = i + 2;
      for (; j < tpl.length && depth > 0; j++) {
        if (tpl[j] === '{') depth++;
        else if (tpl[j] === '}') depth--;
      }
      out += '0';
      i = j - 1;
      continue;
    }
    out += tpl[i];
  }
  return out;
}

/**
 * 템플릿 리터럴이 **평가된 뒤**의 문자열 = 실제로 WebView 에 들어가는 HTML.
 * 소스 그대로 검사하면 `\r\n` 같은 한 겹 부족한 이스케이프를 놓친다 — 그건 평가 시 진짜 개행이
 * 되어 인라인 스크립트의 문자열 리터럴을 끊는다(2026-09-04 실사고: 터미널이 통째로 빈 화면).
 */
function renderTemplate(tpl: string): string {
  // 보간은 이미 제거됐고 백틱도 없다 — 이스케이프만 실제로 처리시킨다.
  // eslint-disable-next-line no-new-func
  return new Function('return `' + tpl + '`')();
}

describe('terminal webview inline script', () => {
  const html = renderTemplate(stripInterpolations(htmlTemplate()));

  it('인라인 스크립트가 문법적으로 유효하다', () => {
    const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    expect(blocks.length).toBeGreaterThan(0);
    for (const body of blocks) {
      if (!body.trim()) continue;
      // 실행하지 않는다 — 생성자가 파싱만 하고 던지는 SyntaxError 를 잡는 것이 목적.
      expect(() => new Function(body)).not.toThrow();
    }
  });

  it('과거 화면도 라이브와 같은 xterm 으로 그린다(단색 div 회귀 금지)', () => {
    expect(html).toContain('__histTerm=new Terminal(');
    // 오버레이는 페이지를 통째로 갈아끼운다 — WebGL 캔버스는 덧그리기 잔상이 남으므로 DOM 렌더러.
    expect(html).not.toContain('__histTerm.loadAddon');
    expect(html).toContain('v.refresh(0, v.rows-1)');
    expect(html).toContain('scrollback:10000');   // 오버레이가 자체 스크롤백을 갖는다
    expect(html).toContain("typeof row.ansi==='string'");
    // 평문 렌더는 오버레이 xterm 이 못 뜬 경우의 **폴백 안에서만** 허용한다(정상 경로 회귀 금지).
    expect(html).toMatch(/if\(!v\)\{[\s\S]{0,260}__histEl\.textContent=/);
  });

  it('과거를 보는 동안 라이브 격자를 숨긴다(투명 캔버스 비침 회귀)', () => {
    expect(html).toContain('body.hist-on #t { display:none; }');
    expect(html).toContain("document.body.classList.add('hist-on')");
    expect(html).toContain("document.body.classList.remove('hist-on')");
  });

  it('오버레이 xterm 은 보이게 만든 뒤 open 한다(흰 화면 회귀)', () => {
    // display:none 인 요소에 open 하면 글자 크기를 0 으로 재서 빈 화면이 된다(Android 실기 실측).
    // __showHistory() 가 먼저 display:block 을 세우고, __writeHistory() 가 그다음에 open 한다.
    expect(html).toMatch(/__showHistory=function\(\)\{[\s\S]{0,200}__histEl\.style\.display='block'/);
    expect(html).toMatch(/__showHistory\(\);[\s\S]{0,120}__writeHistory\(/);
    expect(html).toContain("__histEl.querySelector('.xterm-rows')");
  });

  it('스크롤 라우팅은 서버 VT 모드를 우선한다', () => {
    expect(html).toContain("ws.send(JSON.stringify({type:'modes'}))");
    expect(html).toMatch(/var mouseOn = fresh \? !!__srvModes\.mouseTracking : __mouseActive\(\)/);
    expect(html).toMatch(/var altOn\s+= fresh \? !!__srvModes\.altScreen\s+: __alternateActive\(\)/);
  });

  it('새 snapshot 은 절대 offset 캐시를 버린다', () => {
    expect(html).toMatch(/__v2Snapshot = true[\s\S]{0,120}__resetHistoryCache\(\)/);
  });

  it('과거는 한 번만 써 넣고 그다음은 xterm 자체 스크롤로 움직인다', () => {
    // 스텝마다 페이지를 다시 그리면 Android WebView 부분 무효화로 바뀐 글자에 잔상이 남는다.
    expect(html).toContain('v.scrollLines(n)');
    expect(html).toContain('__histWritten=__histTotal');
    // 진입은 캐시를 믿지 않고 항상 새로 물어본다(clear 뒤 유령 과거 방지) — 받아 둔 구간만 그린다.
    expect(html).toMatch(/if\(n>0\) return;[\s\S]{0,300}?__histWantScroll\+=n; __requestHistory\(null\); return;/);
    expect(html).toContain('__histLoadedFrom=Infinity');
    expect(html).toContain('__histWantScroll');   // 첫 페이지 대기 중 스크롤은 0 센티넬 없이 누적
  });

  it('맨 아래로 돌아오면 라이브 화면으로 복귀한다', () => {
    expect(html).toMatch(/n>0 && Number\(b\.viewportY\)>=Number\(b\.baseY\)[\s\S]{0,40}__hideHistory\(\)/);
  });

  it('v3: 크기는 소유자만 주장하고, 비소유자는 소유자 격자를 축소해 본다', () => {
    expect(html).toMatch(/var sendResize = function\(\)\{ if \(__v3 && !__isOwner && !__ownerFree\) return;/);
    expect(html).toMatch(/if \(__v3 && __grid && !__isOwner && !__ownerFree\) \{[\s\S]{0,200}?__applyScale\(\);\s+return;/);
    expect(html).toContain("el.style.transform = k < 1 ? 'scale(' + k.toFixed(4) + ')' : ''");
    expect(html).toContain("ws.send(JSON.stringify({ type:'claim' }))");
  });

  it('v3: 스냅샷은 입력 모드를 먼저 복원하고, 재접속은 hello{lastSeq} 로 이어받는다', () => {
    expect(html).toContain("if (md.altScreen) pre += '\\x1b[?1049h'");
    expect(html).toContain("if (md.mouseTracking) pre += '\\x1b[?1000h\\x1b[?1006h'");
    expect(html).toContain("ws.send(JSON.stringify({ type:'hello', lastSeq: __v3Seq }))");
    expect(html).toContain('if (__v3) return;   // v3: 모드는 로컬 xterm 이 안다');
  });

  it('릴리스에 개발용 계측이 남아 있지 않다', () => {
    expect(html).not.toContain('native-scroll');
    expect(html).not.toContain('__term_history_last');
    expect(html).not.toContain("event:'snapshot-applied'");
    expect(source).not.toContain('[TermTouch]');
    expect(source).not.toContain('[TermHistory]');
  });
});

describe('터미널 숨은 입력(TextInput)', () => {
  // 2026-09-06 iPad 실기: Enter 한 번에 입력이 죽었다. 단일행 TextInput 의 RN 기본값이
  //  "제출하면 blur" 라서다. 물리 키보드에선 키보드가 내려가는 표시조차 없어 "키가 안 먹는다"로만 보인다.
  it('Enter 로 blur 되지 않는다 — 명령마다 입력이 죽으면 안 된다', () => {
    // 숨은 입력(1x1, opacity 0.01)을 만드는 JSX 블록만 잘라서 본다.
    const at = source.indexOf('ref={nativeInputRef}');
    expect(at).toBeGreaterThan(-1);
    const block = source.slice(at, source.indexOf('/>', at));
    expect(block).toContain('multiline={false}');
    expect(block).toMatch(/submitBehavior="submit"|blurOnSubmit=\{false\}/);
  });
});
