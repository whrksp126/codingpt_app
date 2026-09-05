import fs from 'node:fs';
import path from 'node:path';

describe('terminal keepalive protocol', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../src/components/module/ide/TerminalWebView.tsx'),
    'utf8',
  );

  it('keeps the socket alive without reclaiming the shared terminal size', () => {
    expect(source).toContain("ws.send(JSON.stringify({ type:'keepalive' }))");
    expect(source).not.toMatch(/setInterval\(function\(\)\{[^}]*sendResize\(\)/);
  });

  it('keeps the same 10k canonical scrollback range as the PC terminal', () => {
    expect(source).toContain('scrollback: 10000');
    expect(source).not.toContain('scrollback: 3000');
  });

  it('bundles one xterm 6 engine for both mobile platforms', () => {
    expect(source).toContain("from './terminalWebViewEngine.generated'");
    expect(source).not.toContain('unpkg.com/xterm');
    expect(source).not.toContain('CanvasAddon');
  });

  it('follows the shared shell cursor before sending local input', () => {
    expect(source).toMatch(
      /var send = function\(s\)[\s\S]*?term\.scrollToBottom\(\);[\s\S]*?ws\.send\(/,
    );
  });

  it('keeps terminal rows stable while a keyboard only changes viewport height', () => {
    expect(source).toContain('sameWidth && h < __viewportH - 40');
    expect(source).toContain('term.rows * cell.h - Math.max(1, h - 12)');
    expect(source).toContain('__setKeyboardShift(need)');
    expect(source).toMatch(
      /window\.addEventListener\("resize"[\s\S]*?if \(__fitViewport\(false\)\) queueResize\(\)/,
    );
  });

  it('스크롤은 TUI 모드에서만 휠/방향키로 나가고, 일반 셸에서는 서버 과거로 간다', () => {
    expect(source).toContain("term.buffer.active.type === 'alternate'");
    expect(source).toContain('__canonicalScroll(lines)');   // 과거는 서버(HISTORY_PAGE)가 정본
    expect(source).not.toContain("target.dispatchEvent(new WheelEvent('wheel'");
    expect(source).toContain('applicationCursorKeysMode');
    expect(source).toContain('__sgrMouse');
    expect(source).toContain('__pixelMouse');
    expect(source).toContain('__routeScrollLines(dir, __swLX, __swLY)');
    expect(source).toContain('#t .xterm-helper-textarea { touch-action:none !important; }');
    expect(source).toContain('.xterm-scrollable-element { overflow-y:hidden !important; }');
    expect(source).toContain('.xterm-scrollbar { display:none !important; }');
    expect(source).toMatch(/touchmove'[\s\S]*?e\.preventDefault\(\);[\s\S]*?var y = e\.touches/);
    expect(source).toMatch(/__tEl\.addEventListener\('touchstart'[\s\S]*?capture:true, passive:false/);
    expect(source).toMatch(/__tEl\.addEventListener\('touchend'[\s\S]*?capture:true, passive:false/);
    expect(source).not.toContain('__tuiHint');
    expect(source).not.toContain('__term_agentScroll');
    expect(source).toContain('onTouchMove={nativeTouchMove}');
    expect(source).not.toContain('PanResponder');
    expect(source).toContain('window.__term_routeScroll');
    expect(source).toContain('nestedScrollEnabled');
    expect(source).not.toContain('__keyboardReveal');
    expect(source).toContain('surface.style.transform');
    expect(source).toContain("post({ type:'request-native-keyboard' })");
    expect(source).toContain("else if (msg.type === 'request-native-keyboard') focusNativeInput()");
    expect(source).toContain('setTimeout(() => nativeInputRef.current?.focus(), 30)');
    expect(source).toContain('window.__term_native_input');
  });

  it('CPT3 만 해독한다 — v1/v2 프레임 경로는 없다', () => {
    // 매직 'CPT3' = 67 80 84 51. v2(…51→50)·seq 갭 sync·스냅샷 청크 조립은 2026-09-06 삭제.
    expect(source).toContain('b[0] !== 67 || b[1] !== 80 || b[2] !== 84 || b[3] !== 51');
    expect(source).not.toContain('b[3] !== 50');
    expect(source).not.toContain("type:'sync'");
    expect(source).not.toContain('__v2Snapshot');
    expect(source).toContain("type:'history'");
    expect(source).toContain('id="historyViewport"');
    expect(source).toContain('__canonicalScroll(lines)');
    expect(source).toContain('__histRows=new Map()');
  });
});
