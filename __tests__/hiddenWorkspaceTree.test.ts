import fs from 'node:fs';
import path from 'node:path';

// 숨긴 워크스페이스 트리는 **투명해야** 한다.
//
// 2026-09-06 iPad 실기: 비활성 워크스페이스를 zIndex 로 덮어 두기만 했더니, 그 안의 터미널
//  WebView 가 자기 레이어로 합성돼 활성 화면 위로 뚫고 올라왔다(소유자 알약이 탭 줄에 유령으로
//  겹침). WKWebView·WebView 앞에서 "불투명한 형제로 덮으면 가려진다"는 성립하지 않는다.
//  마운트는 유지해야 하므로(전환 시 리페인트 없음) 해법은 opacity 0 이다.
const src = fs.readFileSync(path.join(__dirname, '../src/workspace/WorkspaceView.tsx'), 'utf8');

describe('숨긴 워크스페이스 트리', () => {
  it('opacity 0 으로 레이어를 지운다 — zIndex 로 덮는 것만으론 WebView 가 뚫고 올라온다', () => {
    const at = src.indexOf('const isActive = t.id === ws.id;');
    expect(at).toBeGreaterThan(-1);
    const block = src.slice(at, at + 1600);
    expect(block).toContain('opacity: isActive ? 1 : 0');
    expect(block).toContain("pointerEvents={isActive ? 'auto' : 'none'}");
  });
});
