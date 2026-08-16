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
});
