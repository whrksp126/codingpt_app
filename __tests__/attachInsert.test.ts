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
  it('TUI 로 보고 있으면 PTY 에 한 줄', async () => {
    const lines: string[] = [];
    const off = registerTermInsert('p1', { insert: (t) => lines.push(t), isFocused: () => true, chatKey: () => null });
    expect(await insertAttachment(ATT)).toBe('tui');
    expect(lines).toEqual([ATT.line]);
    off();
  });

  it('★ 채팅으로 보고 있으면 채팅 컴포저에 칩 + 설명(PTY 로 가지 않는다)', async () => {
    const lines: string[] = [];
    const got: ChatAttachItem[] = [];
    const key = chatAttachKey('other/project/tokin', 7);
    const off1 = registerTermInsert('p1', { insert: (t) => lines.push(t), isFocused: () => true, chatKey: () => key });
    const off2 = registerChatAttach(key, { attach: (a) => got.push(a) });
    expect(await insertAttachment(ATT)).toBe('chat');
    expect(lines).toEqual([]);                       // TUI 로는 한 글자도 안 간다
    expect(got).toHaveLength(1);
    expect(got[0].path).toBe(ATT.path);
    expect(got[0].text).toBe(ATT.text);              // 설명은 TUI 한 줄과 같은 정보
    expect(got[0].name).toBe('emu-1.jpg');
    off1(); off2();
  });

  it('채팅 모드인데 그 대화 화면이 아직 없으면 TUI 로 떨어진다(조용히 사라지지 않는다)', async () => {
    const lines: string[] = [];
    const off = registerTermInsert('p1', {
      insert: (t) => lines.push(t), isFocused: () => true,
      chatKey: () => chatAttachKey('other/project/tokin', 99),   // 등록된 첨부 창구가 없다
    });
    expect(await insertAttachment(ATT)).toBe('tui');
    expect(lines).toEqual([ATT.line]);
    off();
  });

  it('포커스된 터미널이 이긴다(둘 다 있어도)', async () => {
    const a: string[] = []; const b: string[] = [];
    const off1 = registerTermInsert('p1', { insert: (t) => a.push(t), isFocused: () => false });
    const off2 = registerTermInsert('p2', { insert: (t) => b.push(t), isFocused: () => true });
    expect(await insertAttachment(ATT)).toBe('tui');
    expect(a).toEqual([]);
    expect(b).toEqual([ATT.line]);
    off1(); off2();
  });

  it('넣을 터미널이 없으면 null — 부르는 쪽이 안내한다', async () => {
    expect(await insertAttachment(ATT)).toBeNull();
  });

  it("경로는 셸 안전하게 감싼다(공백·따옴표 있는 경로)", () => {
    expect(shq('/a b/c.jpg')).toBe("'/a b/c.jpg'");
    expect(shq("/a'b/c.jpg")).toBe("'/a'\\''b/c.jpg'");
  });

  it('★ 활성 탭이 모바일 화면이면 터미널 탭을 앞으로 끌어오고(prepare), 늦게 뜬 채팅 창구도 기다린다', async () => {
    const key = chatAttachKey('ws', 3);
    let prepared = false;
    const got: ChatAttachItem[] = [];
    const off = registerTermInsert('p1', {
      insert: () => { throw new Error('TUI 로 가면 안 된다'); },
      isFocused: () => true,
      chatKey: () => key,
      prepare: () => { prepared = true; },
    });
    //  prepare 로 탭이 바뀐 뒤에야 채팅 화면이 마운트되는 실제 순서를 흉내낸다.
    const offs: Array<() => void> = [];
    setTimeout(() => { offs.push(registerChatAttach(key, { attach: (a) => got.push(a) })); }, 250);
    expect(await insertAttachment(ATT)).toBe('chat');
    expect(prepared).toBe(true);
    expect(got).toHaveLength(1);
    off(); offs.forEach((f) => f());
  });
});

/**
 * 2026-08-06 폰 실측으로 잡은 마지막 구멍: 캡처를 눌렀더니 **"삽입할 터미널이 없어요"** 만 떴다.
 *  같은 pane 에 터미널 탭이 분명히 있는데도. 원인은 삽입 채널을 **PTY 스트림이 살아 있을 때만**
 *  등록했기 때문이다 — 모바일 화면 탭이 활성이면 그 pane 의 터미널은 아직 시작조차 안 한다.
 *  이제는 터미널 탭만 있으면 등록하고, 넣기 직전에 탭을 띄운 뒤 스트림이 붙기를 기다린다.
 */
describe('아직 안 뜬 터미널', () => {
  it('★ 탭을 띄운 뒤 스트림이 붙으면 그때 넣는다(있는 터미널을 없다고 하지 않는다)', async () => {
    const lines: string[] = [];
    let live = false;
    const off = registerTermInsert('p1', {
      insert: (t) => lines.push(t),
      isFocused: () => true,
      chatKey: () => null,
      prepare: () => { setTimeout(() => { live = true; }, 300); },  // 탭 활성화 → 스트림이 곧 붙는다
      ready: () => live,
    });
    expect(await insertAttachment(ATT)).toBe('tui');
    expect(lines).toEqual([ATT.line]);
    off();
  });

  it('끝내 안 뜨면 null — 아무 데도 안 넣는다(조용한 유실 금지)', async () => {
    const lines: string[] = [];
    const off = registerTermInsert('p1', {
      insert: (t) => lines.push(t), isFocused: () => true, chatKey: () => null, ready: () => false,
    });
    expect(await insertAttachment(ATT)).toBeNull();
    expect(lines).toEqual([]);
    off();
  });
});
