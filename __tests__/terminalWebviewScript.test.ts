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

  // v3 는 원시 PTY 바이트가 그대로 오므로 1049/1000/1006 을 이 기기 xterm 이 직접 안다.
  //  서버에 modes 를 물어보던 왕복은 2026-09-06 삭제 — 되살아나지 않게 부재까지 못 박는다.
  it('스크롤 라우팅은 로컬 xterm 상태로 판정한다(서버 modes 조회 없음)', () => {
    expect(html).toMatch(/if \(__mouseActive\(\)\) \{ var mouse=__wheelScroll\(lines,x,y\)/);
    expect(html).toMatch(/if \(__alternateActive\(\)\) \{ send\(__repeat\(__arrowScroll\(lines\),lines\)\); return; \}/);
    expect(html).toContain('__canonicalScroll(lines)');
    expect(html).not.toContain("type:'modes'");
    expect(html).not.toContain('__srvModes');
    expect(html).not.toContain('__refreshModes');
  });

  it('새 snapshot 은 절대 offset 캐시를 버린다', () => {
    // v3 SNAPSHOT(op 2) 처리에서 과거 캐시를 먼저 버린다 — 안 버리면 clear 뒤 유령 과거가 보인다.
    expect(html).toMatch(/if \(f\.op === 2\) \{[\s\S]{0,400}__resetHistoryCache\(\)/);
  });

  it('v1/v2 경로는 남아 있지 않다', () => {
    // 2026-09-06 삭제(설계 §5). 프레임 매직 CPT2 판정·seq 갭 sync·스냅샷 청크 조립·부트스트랩 전부.
    expect(html).not.toContain('b[3] !== 50');           // 'CPT2' 매직
    expect(html).not.toContain("type:'sync'");
    expect(html).not.toContain('__v2Seq');
    expect(html).not.toContain('__v2HistoryBootstrap');
    expect(html).not.toContain('__canonicalModel');
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
    // ★ 축소는 CSS transform 이 아니라 **글꼴 크기**로 한다(2026-09-06 안드로이드 실기 회귀).
    //   Android WebView 는 WebGL 캔버스를 별도 하드웨어 레이어로 합성해 조상 transform 배율을
    //   먹지 않는다 — iPad 만 줄어들고 안드로이드는 원래 크기로 잘렸다.
    expect(html).toContain('term.options.fontSize = want');
    expect(html).toMatch(/term\.resize\(__grid\.cols, __grid\.rows\)/);
    expect(html).not.toMatch(/el\.style\.transform = ['"`]?scale/);
    expect(html).toContain("ws.send(JSON.stringify({ type:'claim' }))");
  });

  // ★ 순서 회귀(2026-09-06 실기): 스냅샷에서 fit 이 __setGrid 보다 먼저 돌면 __lastSent 가 서버
  //   격자로 덮여 queueResize 가 침묵한다 → 소유자 없는 터미널로 탭을 바꿔도 내 크기를 못 잡는다.
  it('v3: 스냅샷은 격자를 세운 **뒤에** 소유자 fit 을 한다', () => {
    expect(html).toMatch(/__setOwner\(m, true\); __setGrid\(m\.cols, m\.rows\); __ownerFit\(\);/);
    expect(html).toMatch(/var __ownerFit = function\(\)\{ if \(__isOwner\) \{ try \{ __fitNow\(\); queueResize\(\);/);
  });

  it('v3: 스냅샷은 입력 모드를 먼저 복원하고, 재접속은 hello{lastSeq} 로 이어받는다', () => {
    expect(html).toContain("if (md.altScreen) pre += '\\x1b[?1049h'");
    expect(html).toContain("if (md.mouseTracking) pre += '\\x1b[?1000h\\x1b[?1006h'");
    expect(html).toContain("ws.send(JSON.stringify({ type:'hello', lastSeq: __v3Seq, epoch: __v3Epoch }))");
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

describe('v3 이어받기 세대(epoch)', () => {
  const html = renderTemplate(stripInterpolations(htmlTemplate()));
  // 2026-09-06 실기 사고: 데몬 재시작으로 host 의 seq 가 0 부터 다시 세는데 뷰어는 옛 큰 seq 로
  //  hello 했다. 데몬이 "너는 최신"으로 오판해 아무것도 안 보냈고 폰·패드 화면이 영원히 멈췄다.
  it('스냅샷의 epoch 를 보관했다가 hello 에 함께 보낸다', () => {
    expect(html).toContain('__v3Epoch = m.epoch');
    const hellos = [...html.matchAll(/type:'hello'[^}]*}/g)].map((m) => m[0]);
    expect(hellos.length).toBeGreaterThan(0);
    for (const h of hellos) expect(h).toContain('epoch: __v3Epoch');
  });
});

describe('소유자 알약', () => {
  const html = renderTemplate(stripInterpolations(htmlTemplate()));
  const pane = fs.readFileSync(path.join(__dirname, '../src/workspace/PaneView.tsx'), 'utf8');

  // 알약은 WebView 밖(RN)에서 그린다 — PC 가 터미널 DOM 밖에 두는 것과 한 벌. 앱 테마·글꼴을
  //  그대로 쓰고 WebView 합성 레이어라는 변수가 사라진다.
  it('WebView 안에 알약을 그리지 않는다 — 상태만 RN 으로 올린다', () => {
    expect(html).not.toContain('id="ownerPill"');
    expect(html).toContain("post({ type:'owner'");
    expect(html).toContain('window.__term_claim');
  });

  it('알약은 RN(PaneView)이 그리고, 버튼은 claim 핸들을 부른다', () => {
    expect(pane).toContain('onOwner={setOwnerView}');
    expect(pane).toContain('termRef.current?.claim()');
    expect(pane).toContain("i18n.t('내 크기로 맞추기')");
  });
});
