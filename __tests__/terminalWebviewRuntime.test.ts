import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

/**
 * 인라인 스크립트를 **실행**해서 초기화가 끝까지 가는지 본다.
 *
 * 왜 문법 검사만으론 부족한가(2026-09-06 안드로이드 실기 사고): 스크립트 전체가 하나의 try 블록이라
 * 아직 정의되지 않은 헬퍼를 초기화 도중에 부르면 문법은 멀쩡한 채 `X is not a function` 으로 떨어지고,
 * catch 가 그걸 삼켜 화면엔 빨간 "터미널 초기화 오류" 배너 한 줄만 남는다. 빌드·tsc·eslint·문법
 * 테스트가 전부 통과하고 기기에서만 죽는다. 그래서 여기서는 진짜로 돌려 보고 error post 를 금지한다.
 *
 * 스텁은 "모르는 건 조용히 받아 주는" 관대한 DOM 이다 — DOM 표면을 정확히 재현하는 게 목적이 아니라,
 * **우리 코드의 순서/정의 오류**를 드러내는 게 목적이기 때문이다.
 */
const source = fs.readFileSync(
  path.join(__dirname, '../src/components/module/ide/TerminalWebView.tsx'),
  'utf8',
);

function htmlTemplate(): string {
  const at = source.indexOf('const buildHtml =');
  const open = source.indexOf('`', at);
  const close = source.indexOf('`;', open + 1);
  return source.slice(open + 1, close);
}

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

/** 무엇을 물어도 답하는 DOM 노드. 모르는 속성은 빈 문자열, 모르는 메서드는 no-op. */
function makeNode(tag = 'div'): any {
  const style: any = new Proxy({}, { get: (t: any, k) => t[k] ?? '', set: (t: any, k, v) => ((t[k] = v), true) });
  const classes = new Set<string>();
  const base: any = {
    tagName: tag.toUpperCase(),
    style,
    dataset: {},
    classList: {
      add: (c: string) => classes.add(c),
      remove: (c: string) => classes.delete(c),
      toggle: (c: string, on?: boolean) => (on ?? !classes.has(c) ? classes.add(c) : classes.delete(c)),
      contains: (c: string) => classes.has(c),
    },
    children: [],
    textContent: '',
    innerHTML: '',
    value: '',
    clientWidth: 390,
    clientHeight: 700,
    offsetWidth: 390,
    offsetHeight: 700,
    scrollTop: 0,
    scrollHeight: 700,
    getBoundingClientRect: () => ({ x: 0, y: 0, top: 0, left: 0, right: 390, bottom: 700, width: 390, height: 700 }),
    appendChild: (c: any) => c,
    removeChild: (c: any) => c,
    insertBefore: (c: any) => c,
    setAttribute: () => {},
    removeAttribute: () => {},
    getAttribute: () => null,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
    focus: () => {},
    blur: () => {},
    click: () => {},
    scrollTo: () => {},
    remove: () => {},
    closest: () => null,
    contains: () => false,
    querySelector: (_s: string) => makeNode(),
    querySelectorAll: (_s: string) => [],
  };
  return new Proxy(base, {
    get(t: any, k: any) {
      if (k in t) return t[k];
      if (typeof k === 'symbol') return undefined;
      return () => undefined; // 모르는 메서드는 no-op — 우리 코드의 정의 오류만 남긴다
    },
    set: (t: any, k, v) => ((t[k] = v), true),
  });
}

/** xterm 대역 — 우리 코드가 실제로 만지는 표면만 진짜처럼 굴린다. */
function makeTerminalCtor(el: any, log?: TermLog) {
  return function Terminal(this: any, opts: any) {
    if (log) log.opts.push(opts || {});
    this.options = { ...(opts || {}) };
    this.cols = 80;
    this.rows = 24;
    this.element = el;
    this.textarea = makeNode('textarea');
    this.buffer = { active: { type: 'normal', cursorX: 0, cursorY: 0, viewportY: 0, baseY: 0, length: 24, getLine: () => null } };
    this.markers = [];
    this.modes = {};
    this.open = () => {};
    this.write = (d: any, cb?: () => void) => { if (log) log.writes.push(String(d)); if (cb) cb(); };
    this.writeln = () => {};
    this.clear = () => {};
    this.reset = () => { if (log) log.resets++; };
    this.focus = () => {};
    this.blur = () => {};
    this.refresh = () => {};
    this.resize = (c: number, r: number) => { this.cols = c; this.rows = r; };
    this.scrollLines = (n: number) => { if (log) log.scrolls.push(n); };
    this.scrollToBottom = () => { if (log) log.bottoms++; };
    this.loadAddon = (a: any) => { if (a && typeof a.activate === 'function') a.activate(this); };
    this.dispose = () => {};
    this.select = () => {};
    this.getSelection = () => '';
    this.hasSelection = () => false;
    this.clearSelection = () => {};
    this.registerMarker = () => ({ dispose: () => {} });
    const on = () => ({ dispose: () => {} });
    for (const k of ['onData', 'onBinary', 'onKey', 'onResize', 'onRender', 'onScroll', 'onSelectionChange', 'onTitleChange', 'onLineFeed', 'onBell', 'onCursorMove', 'onWriteParsed']) this[k] = on;
    this.attachCustomKeyEventHandler = () => {};
    this.parser = { registerCsiHandler: () => ({ dispose: () => {} }), registerOscHandler: () => ({ dispose: () => {} }), registerEscHandler: () => ({ dispose: () => {} }) };
    this.unicode = { activeVersion: '11', versions: ['6', '11'] };
  };
}

type TermLog = { opts: any[]; writes: string[]; scrolls: number[]; resets: number; bottoms: number };

/** CPT3 프레임 조립 — 헤더 14B: 'CPT3' · ver(1) · op · seq(u32 BE) · len(u32 BE). */
function cpt3(op: number, seq: number, payload: string): ArrayBuffer {
  const body = Buffer.from(payload, 'utf8');
  const buf = Buffer.alloc(14 + body.length);
  buf.write('CPT3', 0, 'ascii');
  buf[4] = 1; buf[5] = op;
  buf.writeUInt32BE(seq, 6);
  buf.writeUInt32BE(body.length, 10);
  body.copy(buf, 14);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length) as ArrayBuffer;
}

/** 스크립트를 스텁 환경에서 끝까지 돌리고, RN 으로 나간 메시지를 돌려준다. */
function runInlineScript(body: string): { posts: any[]; bannerHtml: string; win: any; term: TermLog; sockets: any[] } {
  const posts: any[] = [];
  const term: TermLog = { opts: [], writes: [], scrolls: [], resets: 0, bottoms: 0 };
  const sockets: any[] = [];
  const termEl = makeNode();
  const nodes: Record<string, any> = {};
  const getEl = (id: string) => (nodes[id] || (nodes[id] = makeNode()));
  const doc: any = makeNode('body');
  doc.body = makeNode('body');
  doc.documentElement = makeNode('html');
  doc.getElementById = getEl;
  doc.createElement = (t: string) => makeNode(t);
  doc.querySelector = () => makeNode();
  doc.querySelectorAll = () => [];
  doc.fonts = { ready: Promise.resolve(), load: () => Promise.resolve(), check: () => true, addEventListener: () => {} };
  doc.hasFocus = () => true;
  doc.activeElement = makeNode();
  doc.visibilityState = 'visible';

  const win: any = makeNode('window');
  win.innerWidth = 390;
  win.innerHeight = 700;
  win.devicePixelRatio = 3;
  win.document = doc;
  win.getComputedStyle = () => new Proxy({}, { get: () => '0px' });
  win.requestAnimationFrame = (cb: any) => { cb(0); return 1; };
  win.cancelAnimationFrame = () => {};
  win.matchMedia = () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {} });
  win.visualViewport = { width: 390, height: 700, offsetTop: 0, scale: 1, addEventListener: () => {}, removeEventListener: () => {} };

  function FakeWebSocket(this: any) {
    this.readyState = 1;
    this.binaryType = '';
    this.sent = [];
    this.send = (d: any) => this.sent.push(d);
    this.close = () => {};
    this.addEventListener = () => {};
    sockets.push(this);
  }
  (FakeWebSocket as any).OPEN = 1;

  const rnwv = { postMessage: (s: string) => { try { posts.push(JSON.parse(s)); } catch (_) { posts.push(s); } } };
  win.ReactNativeWebView = rnwv;

  const sandbox: any = {
    window: win,
    document: doc,
    navigator: { userAgent: 'jest', platform: 'test', clipboard: { writeText: () => Promise.resolve() }, maxTouchPoints: 5 },
    location: { href: 'about:blank', search: '' },
    ReactNativeWebView: rnwv,
    Terminal: makeTerminalCtor(termEl, term),
    FitAddon: { FitAddon: function (this: any) { this.activate = () => {}; this.fit = () => {}; this.proposeDimensions = () => ({ cols: 80, rows: 24 }); this.dispose = () => {}; } },
    WebglAddon: { WebglAddon: function (this: any) { this.activate = () => {}; this.onContextLoss = () => {}; this.dispose = () => {}; } },
    CanvasAddon: { CanvasAddon: function (this: any) { this.activate = () => {}; this.dispose = () => {}; } },
    TextEncoder,
    TextDecoder,
    WebSocket: FakeWebSocket,
    setTimeout: () => 0,
    clearTimeout: () => {},
    setInterval: () => 0,
    clearInterval: () => {},
    console,
    Promise,
    atob: (s: string) => Buffer.from(s, 'base64').toString('binary'),
    btoa: (s: string) => Buffer.from(s, 'binary').toString('base64'),
  };
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  new vm.Script(body).runInContext(sandbox, { timeout: 10000 });
  return { posts, bannerHtml: String(doc.body.innerHTML || ''), win, term, sockets };
}

describe('terminal webview inline script — 실행', () => {
  const tpl = stripInterpolations(htmlTemplate());
  // eslint-disable-next-line no-new-func
  const html: string = new Function('return `' + tpl + '`')();
  // 엔진(<script>${XTERM_ENGINE_JS}</script>)은 보간이라 0 으로 지워졌다 — 우리 스크립트만 고른다.
  const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
    .map((m) => m[1])
    .filter((b) => b.trim().length > 200);

  it('초기화가 끝까지 간다 — error 배너가 뜨지 않는다', () => {
    expect(blocks.length).toBe(1);
    const { posts, bannerHtml } = runInlineScript(blocks[0]);
    const err = posts.find((p) => p && p.type === 'error');
    expect(err ? err.message : null).toBeNull();
    expect(bannerHtml).not.toContain('터미널 초기화 오류');
    // 여기까지 왔으면 마지막 줄(post ready)도 실행됐다는 뜻.
    expect(posts.some((p) => p && p.type === 'ready')).toBe(true);
  });

  // ★ 2026-09-10 — 과거는 라이브 버퍼 하나다. 소스 grep 이 아니라 **실제로 스크립트를 돌려**
  //  스냅샷 한 장이 과거까지 버퍼에 들어가고, 위로 스와이프가 그 버퍼를 스크롤하는지 본다.
  it('스냅샷 한 장이 과거까지 버퍼에 들어가고, 스크롤은 그 버퍼에서 일어난다', () => {
    const { win, term, sockets } = runInlineScript(blocks[0]);
    // 라이브 격자가 과거를 담을 만큼 스크롤백을 갖는다(0 이면 위로 스크롤할 것이 없다).
    expect(term.opts[0].scrollback).toBe(10000);

    win.__term_connect('ws://stub/v3');
    expect(sockets.length).toBe(1);
    const ws = sockets[0];
    ws.onopen?.({});
    // 데몬 스냅샷 모양 그대로 — ansi 는 RIS + 과거줄들 + 현재 화면(serializeRepaint 와 같은 구조).
    const ansi = '\x1bc' + ['OLD_1', 'OLD_2', 'OLD_3'].join('\r\n') + '\r\nLIVE_PROMPT';
    ws.onmessage({
      data: cpt3(2, 1, JSON.stringify({
        cols: 80, rows: 24, seq: 1, epoch: 'e1', owner: null, free: true, self: false,
        modes: {}, cursor: { x: 0, y: 0 }, ansi,
      })),
    });
    expect(term.resets).toBeGreaterThan(0);                       // 옛 화면 위에 덧쌓지 않는다
    const written = term.writes.join('');
    expect(written).toContain('OLD_1');                           // 과거가 이 버퍼로 들어왔다
    expect(written).toContain('LIVE_PROMPT');

    // 일반 셸(마우스·alt-screen 아님)에서 위로 스와이프 = 자기 버퍼 스크롤. 서버 요청은 없다.
    const sentBefore = ws.sent.length;
    win.__term_routeScroll(-5);
    expect(term.scrolls).toContain(-5);
    expect(ws.sent.slice(sentBefore).join('')).not.toContain('history');
  });
});
