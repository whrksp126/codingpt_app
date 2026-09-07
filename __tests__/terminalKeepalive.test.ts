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

  // 키보드가 오르내릴 때의 계약(2026-09-07 개정) —
  //  · 비소유자: 남의 격자를 못 건드리므로 행 수는 그대로 두고 시프트로 하단만 보이게 한다.
  //  · 소유자("내 크기로 맞추기"를 누른 기기 또는 아무도 안 잡은 상태): **격자를 다시 맞춘다**.
  //    안 그러면 보이는 영역보다 격자가 커서 화면 위쪽이 키보드 밖으로 밀려 안 보인다(실사용 보고).
  it('비소유자만 행 수를 고정하고, 소유자는 키보드에 맞춰 격자를 다시 잡는다', () => {
    expect(source).toContain('sameWidth && !__isOwner && h < __viewportH - 40');
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
