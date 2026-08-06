/**
 * 화면에서 집어 온 것(프리뷰 요소 캡처 · 모바일 화면 캡처)이 **보고 있는 곳으로** 들어가는가.
 *
 * 2026-08-06 사용자 지적: 프리뷰 요소 선택은 결과를 늘 **TUI 컴포저**에만 넣었다. 그 터미널을
 *  채팅 모드로 보고 있으면 화면에 보이지도 않는 곳에 들어가서 "아무 일도 안 일어난" 것처럼 보인다.
 *  (모바일 화면 캡처 버튼을 새로 붙이면서 같은 함정을 두 벌로 늘릴 뻔했다 → 판단을 한 곳에 모았다.)
 *
 * 여기서 고정하는 계약:
 *  ① 대상 터미널은 **포커스 우선**(기존 pickTermInsert 규칙 그대로)
 *  ② 그 터미널이 채팅 모드면 **채팅 컴포저에 칩+설명**, 아니면 **TUI 에 한 줄**
 *  ③ 채팅 모드라도 그 대화의 첨부 창구가 아직 없으면(채팅 화면 미마운트) TUI 로 떨어진다 —
 *    조용히 사라지는 경로를 만들지 않는다
 *  ④ 넣을 터미널이 하나도 없으면 null(부르는 쪽이 "파일은 저장됐다"고 안내한다)
 */
import {
  registerTermInsert, registerChatAttach, chatAttachKey, insertAttachment, shq,
  type ChatAttachItem,
} from '../src/workspace/uiControls';

const ATT = { text: '[화면] Pixel 6', line: "[화면] Pixel 6 '/Users/me/.codingpt/attachments/emu-1.jpg' ", path: '/Users/me/.codingpt/attachments/emu-1.jpg' };

describe('첨부는 보고 있는 곳으로 들어간다', () => {
  it('TUI 로 보고 있으면 PTY 에 한 줄', () => {
    const lines: string[] = [];
    const off = registerTermInsert('p1', { insert: (t) => lines.push(t), isFocused: () => true, chatKey: () => null });
    expect(insertAttachment(ATT)).toBe('tui');
    expect(lines).toEqual([ATT.line]);
    off();
  });

  it('★ 채팅으로 보고 있으면 채팅 컴포저에 칩 + 설명(PTY 로 가지 않는다)', () => {
    const lines: string[] = [];
    const got: ChatAttachItem[] = [];
    const key = chatAttachKey('other/project/tokin', 7);
    const off1 = registerTermInsert('p1', { insert: (t) => lines.push(t), isFocused: () => true, chatKey: () => key });
    const off2 = registerChatAttach(key, { attach: (a) => got.push(a) });
    expect(insertAttachment(ATT)).toBe('chat');
    expect(lines).toEqual([]);                       // TUI 로는 한 글자도 안 간다
    expect(got).toHaveLength(1);
    expect(got[0].path).toBe(ATT.path);
    expect(got[0].text).toBe(ATT.text);              // 설명은 TUI 한 줄과 같은 정보
    expect(got[0].name).toBe('emu-1.jpg');
    off1(); off2();
  });

  it('채팅 모드인데 그 대화 화면이 아직 없으면 TUI 로 떨어진다(조용히 사라지지 않는다)', () => {
    const lines: string[] = [];
    const off = registerTermInsert('p1', {
      insert: (t) => lines.push(t), isFocused: () => true,
      chatKey: () => chatAttachKey('other/project/tokin', 99),   // 등록된 첨부 창구가 없다
    });
    expect(insertAttachment(ATT)).toBe('tui');
    expect(lines).toEqual([ATT.line]);
    off();
  });

  it('포커스된 터미널이 이긴다(둘 다 있어도)', () => {
    const a: string[] = []; const b: string[] = [];
    const off1 = registerTermInsert('p1', { insert: (t) => a.push(t), isFocused: () => false });
    const off2 = registerTermInsert('p2', { insert: (t) => b.push(t), isFocused: () => true });
    expect(insertAttachment(ATT)).toBe('tui');
    expect(a).toEqual([]);
    expect(b).toEqual([ATT.line]);
    off1(); off2();
  });

  it('넣을 터미널이 없으면 null — 부르는 쪽이 안내한다', () => {
    expect(insertAttachment(ATT)).toBeNull();
  });

  it("경로는 셸 안전하게 감싼다(공백·따옴표 있는 경로)", () => {
    expect(shq('/a b/c.jpg')).toBe("'/a b/c.jpg'");
    expect(shq("/a'b/c.jpg")).toBe("'/a'\\''b/c.jpg'");
  });
});
