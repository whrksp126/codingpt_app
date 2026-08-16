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

  it('follows the shared shell cursor before sending local input', () => {
    expect(source).toMatch(
      /var send = function\(s\)[\s\S]*?term\.scrollToBottom\(\);[\s\S]*?ws\.send\(/,
    );
  });

  it('does not resize the shared PTY when only keyboard-visible rows shrink', () => {
    expect(source).toContain('var keyboardRowsOnly = term.cols === __lastSentC && term.rows < __lastSentR');
    expect(source).toContain('if (keyboardRowsOnly) return;');
    expect(source).toContain('window.__term_setKeyboardVisible');
  });
});
