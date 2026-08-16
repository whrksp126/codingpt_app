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

  it('keeps terminal rows stable while a keyboard only changes viewport height', () => {
    expect(source).toContain('sameWidth && h < __viewportH - 40');
    expect(source).toContain('(cy + 2) * cell.h');
    expect(source).toContain('__setKeyboardShift(need)');
    expect(source).toMatch(
      /window\.addEventListener\("resize"[\s\S]*?if \(__fitViewport\(false\)\) queueResize\(\)/,
    );
  });
});
