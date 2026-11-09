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

  // 키보드가 오르내릴 때의 계약(2026-11-10 개정) — 소유자·비소유자 모두 **행 수를 고정**하고 시프트로 하단을 보인다.
  //  소유자가 키보드에 맞춰 rows 를 줄이면 claude(Ink) 입력 영역이 터미널 높이를 넘어 매 키마다 프레임 사본이
  //  스크롤백에 쌓였다(키보드를 내리면 프롬프트가 증식해 보이던 버그). 키보드 중엔 fit 도 건너뛴다.
  it('키보드가 떠 있는 동안은 소유자도 격자를 유지한다', () => {
    expect(source).toContain('if (!force && sameWidth && h < __viewportH - 40) {');
    expect(source).not.toContain('sameWidth && !__isOwner && h < __viewportH - 40');
    expect(source).toContain('if (__keyboardViewportActive && Math.abs(window.innerWidth - __viewportW) < 2) { __applyScale(); return; }');
    expect(source).toContain('term.rows * cell.h - Math.max(1, h - 12)');
    expect(source).toContain('__setKeyboardShift(need)');
    expect(source).toMatch(
      /window\.addEventListener\("resize"[\s\S]*?if \(__fitViewport\(false\)\) queueResize\(\)/,
    );
    // 소유권을 가져오는 순간 뷰어 시절 시프트를 걷어낸다(남아 있으면 화면이 위로 밀린 채 굳는다).
    expect(source).toContain('var __dropKeyboardShift = function()');
    expect(source).toMatch(/__isOwner = true; __syncOwnerUi\(\); __applyScale\(\);\s*\n\s*__dropKeyboardShift\(\);/);
  });

  // 버전 불일치는 "PC 가 꺼졌나?" 와 다른 실패다 — 재시도해도 절대 안 열린다.
  //  CPT3 프레임을 한 번도 못 받고 평문 안내만 받은 채 닫히면 재연결을 걸지 않고 사유를 RN 으로 올린다.
  it('버전 불일치면 재연결을 멈추고 사유를 올린다', () => {
    expect(source).toContain("post({ type:'incompat', notice: __rawNotice })");
    expect(source).toContain("if (!__gotV3Frame && __rawNotice) { post({ type:'incompat', notice: __rawNotice }); return; }");
    // 재연결 타이머보다 **먼저** 반환해야 루프가 실제로 끊긴다.
    const stop = source.indexOf("post({ type:'incompat'");
    const retry = source.indexOf('__reconnTimer = setTimeout(connect, __retryDelay)');
    expect(stop).toBeGreaterThan(-1);
    expect(retry).toBeGreaterThan(stop);
  });

  it('스크롤은 TUI 모드에서만 휠/방향키로 나가고, 일반 셸에서는 자기 버퍼(과거 포함)로 간다', () => {
    expect(source).toContain("term.buffer.active.type === 'alternate'");
    expect(source).toContain('term.scrollLines(lines)');    // 과거도 이 버퍼 안에 있다(스냅샷 ansi)
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
    // 과거 페이징(type:'history' + #historyViewport)도 2026-09-10 삭제 — 스냅샷 ansi 가 과거를
    //  통째로 실어 오므로 라이브 버퍼 하나가 정본이다.
    expect(source).not.toContain("type:'history'");
    expect(source).not.toContain('id="historyViewport"');
    expect(source).not.toContain('__canonicalScroll');
  });
});
