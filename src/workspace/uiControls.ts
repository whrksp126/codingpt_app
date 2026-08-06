// uiControls.ts — ui_command 브리지 ↔ 마운트된 표면(프리뷰 WebView/IDE) 사이의 명령 채널.
//   프리뷰 url·IDE openPath 는 leaf 에 "초기값"으로만 소비되므로(마운트 후 patch 는 무시),
//   이미 떠 있는 인스턴스를 원격 조작하려면 인스턴스가 등록한 imperative 핸들을 써야 한다.
//   키 = 표면 ID(프리뷰: tid || leaf id / IDE: leaf id 또는 혼합 탭 tid — PaneView keyOf 와 동일).

export interface PreviewControl {
  load: (url: string) => void;    // 주소 로드(':5173'/포트 표기 해석 포함 — PreviewBody.load)
  reload: () => void;             // 현재 페이지 리로드(WebView.reload)
  info?: () => { url: string; title?: string; viewport?: { w: number; h: number } }; // 현재 상태 조회
  devtools?: (on?: boolean) => boolean; // 개발자도구 토글(생략=반전). 새 상태 반환
  capture?: () => Promise<unknown>;      // 세션 핸드오프: 현재 프리뷰 → 매니페스트(URL/storage/쿠키)
  restore?: (manifest: unknown) => Promise<unknown>; // 매니페스트를 이 프리뷰에 복원(쿠키 심고 로드)
  // Design Mode 요소 선택(ui.previewInspect, 라운드2 §2) — off=취소. 반환 = 모드 on 여부.
  inspect?: (off?: boolean) => boolean;
}

export interface IdeControl {
  openFile: (rel: string, line?: number) => void; // 파일 열기(+선택 라인 점프)
  closeFile?: (rel: string) => boolean;           // 열린 파일 탭 하나 닫기(있었으면 true)
  listOpenFiles?: () => { path: string; active: boolean }[]; // 지금 열린 파일 목록
  // git diff 가상 문서 열기/갱신(ui.ideDiff) — 읽기 전용, 같은 path 재호출 시 내용 갱신+포커스.
  openDiff?: (path: string, diffText: string, truncated?: boolean) => void;
  // 코드 리뷰 열기(ui.review) — 에이전트가 요청했을 때만. 결과는 화면이 review.submit 으로 따로 보낸다.
  openReview?: (payload: { reviewId: string; title?: string; files?: { path: string; diffText?: string; truncated?: boolean }[] }) => void;
}

const previewControls = new Map<string, PreviewControl>();
const ideControls = new Map<string, IdeControl>();

/** 프리뷰 인스턴스 등록 — 반환된 함수로 해제(같은 핸들일 때만 삭제해 재마운트 레이스 방지). */
export function registerPreviewControl(key: string, ctl: PreviewControl): () => void {
  previewControls.set(key, ctl);
  return () => { if (previewControls.get(key) === ctl) previewControls.delete(key); };
}
export function getPreviewControl(key: string): PreviewControl | undefined {
  return previewControls.get(key);
}

/** IDE 인스턴스 등록 — 반환된 함수로 해제. */
export function registerIdeControl(key: string, ctl: IdeControl): () => void {
  ideControls.set(key, ctl);
  return () => { if (ideControls.get(key) === ctl) ideControls.delete(key); };
}
export function getIdeControl(key: string): IdeControl | undefined {
  return ideControls.get(key);
}

// ★ TUI ↔ Chat 모드 채널(ModeControl)은 **없다.** 2026-07-27 오전에 토글을 앱 헤더(main-top)로
//  잘못 옮기면서 "버튼과 상태 변경 지점이 다른 컴포넌트" 라 필요했던 레지스트리인데, 같은 날 토글이
//  터미널 pane 본문으로 되돌아가면서(사용자 확정) pane 이 자기 `setTabMode` 를 직접 호출한다 = 채널 불필요.
//  다시 만들지 말 것: 원격(ui_command)에서 모드를 바꿀 필요가 생기면 그때 이 파일의 다른 채널들과
//  같은 규율(키 = pane id, 등록 해제는 동일 핸들 확인)로 새로 추가하면 된다.

// ── 터미널 삽입 채널(Design Mode, 라운드2 §2.4) — 마운트된 터미널 pane 의 sendKey 경로 ──
//  KeyAssist 타깃은 "키보드 포커스된 입력"만 알아서, 포커스가 없어도 "포커스(최근) 터미널 pane →
//  아무 터미널" 순서로 삽입할 대상을 고르려면 별도 레지스트리가 필요하다. 키 = pane id.
export interface TermInsert {
  insert: (text: string) => void;   // PTY stdin 삽입(TerminalWebView.sendKey — input 델타 경로와 동일)
  isFocused: () => boolean;         // 이 pane 이 현재 포커스인가
  /**
   * 지금 이 pane 의 **활성 터미널 탭이 채팅 모드**면 그 대화 키(`cwd#tid`), 아니면 null.
   *  화면에서 집어 온 것(요소 캡처·모바일 화면 캡처)을 어디에 넣을지 고르는 유일한 근거다 —
   *  채팅으로 보고 있는데 PTY 에 넣으면 **보이지도 않는 컴포저**로 들어가 사라진 것처럼 보인다.
   */
  chatKey?: () => string | null;
  /**
   * 첨부를 받기 전에 이 pane 을 **받을 수 있는 상태로** 만든다(활성 탭이 모바일 화면/IDE/프리뷰면
   *  터미널 탭으로 전환). 폰에서는 모바일 화면이 터미널 pane 의 **탭**으로 들어가므로(좁은 화면
   *  규칙) 이걸 안 하면 캡처가 눈에 안 보이는 곳으로 들어간 것처럼 보인다.
   */
  prepare?: () => void;
}

const termInserts = new Map<string, { ctl: TermInsert; at: number }>();

/** 터미널 삽입 채널 등록 — 반환된 함수로 해제(같은 핸들일 때만 삭제). */
export function registerTermInsert(key: string, ctl: TermInsert): () => void {
  termInserts.set(key, { ctl, at: Date.now() });
  return () => { if (termInserts.get(key)?.ctl === ctl) termInserts.delete(key); };
}

/** pane 포커스 시각 갱신 — "최근 포커스 터미널" 우선순위의 근거. */
export function noteTermInsertFocus(key: string): void {
  const e = termInserts.get(key);
  if (e) e.at = Date.now();
}

/** 특정 pane 의 삽입 채널 — 파일트리→그 터미널 pane 드롭 등 좌표로 대상을 특정할 때. */
export function getTermInsert(key: string): TermInsert | null {
  return termInserts.get(key)?.ctl ?? null;
}

/** 삽입 대상 선택 — 포커스 터미널 우선, 없으면 최근 포커스(등록) 터미널, 그것도 없으면 null. */
export function pickTermInsert(): TermInsert | null {
  let best: { ctl: TermInsert; at: number } | null = null;
  for (const e of termInserts.values()) {
    if (e.ctl.isFocused()) return e.ctl;
    if (!best || e.at > best.at) best = e;
  }
  return best ? best.ctl : null;
}

// ── 채팅 컴포저 첨부 채널 — "화면에서 집어 온 것"을 칩으로 넣는 길 ────────────────────────
//  왜 별도 레지스트리인가: 첨부를 만드는 쪽(프리뷰 요소 캡처·모바일 화면 캡처)은 채팅 화면이
//   어디에 있는지 모르고, 채팅 화면(ChatBody)은 자기 대화 좌표(cwd,tid)만 안다. 그 사이를 잇는다.
//  키 = `${cwd}#${tid}` — 터미널 한 개당 대화 하나(터미널 pane 이 아니라 **대화**가 단위다:
//   같은 대화를 다른 pane 으로 옮겨도 첨부가 따라간다).
export interface ChatAttachItem {
  path: string;          // 호스트 PC 절대경로(에이전트가 읽는다)
  name: string;          // 칩에 쓸 이름
  image: boolean;        // 이미지면 칩에 썸네일
  base64?: string;       // 있으면 썸네일 즉시 표시(없으면 칩만)
  text?: string;         // 칩 앞에 들어갈 설명(TUI 한 줄의 설명 부분과 같은 정보)
}
export interface ChatAttach { attach: (a: ChatAttachItem) => void }

const chatAttaches = new Map<string, ChatAttach>();

export function chatAttachKey(cwd: string, tid: number | null | undefined): string {
  return `${cwd}#${tid ?? ''}`;
}
export function registerChatAttach(key: string, c: ChatAttach): () => void {
  chatAttaches.set(key, c);
  return () => { if (chatAttaches.get(key) === c) chatAttaches.delete(key); };
}
export function getChatAttach(key: string): ChatAttach | undefined {
  return chatAttaches.get(key);
}

/**
 * 첨부 한 건을 **지금 보고 있는 방식대로** 넣는다 — PC `attach-insert.js` 와 같은 계약.
 *  채팅 모드면 칩+설명, 아니면 TUI 한 줄. 대상 터미널이 없으면 null(부르는 쪽이 안내한다).
 */
export async function insertAttachment(a: {
  text: string;        // 설명(채팅용)
  line: string;        // TUI 한 줄(설명 + 인용 경로)
  path: string;
  name?: string;
  image?: boolean;
  base64?: string;
}): Promise<'chat' | 'tui' | null> {
  const t = pickTermInsert();
  if (!t) return null;
  t.prepare?.();
  const key = t.chatKey ? t.chatKey() : null;
  //  채팅 화면은 **한 번 들어가 본 탭만** 마운트돼 있다(lazy). 방금 탭을 바꿨거나 앱을 켠 뒤
  //   한 번도 안 들어갔으면 창구가 아직 없다 — 잠깐 기다렸다가, 그래도 없으면 TUI 로 떨어진다
  //   (조용히 사라지는 경로를 만들지 않는다).
  let chat = key ? getChatAttach(key) : undefined;
  if (key && !chat) {
    for (let i = 0; i < 12 && !chat; i++) {
      await new Promise((r) => setTimeout(r, 100));
      chat = getChatAttach(key);
    }
  }
  if (chat) {
    chat.attach({
      path: a.path,
      name: a.name || a.path.split('/').pop() || a.path,
      image: a.image !== false,
      base64: a.base64,
      text: a.text,
    });
    return 'chat';
  }
  t.insert(a.line);
  return 'tui';
}

/** 셸 안전 작은따옴표 감싸기 — TUI 한 줄에 경로를 넣을 때(공백·한글 경로 안전). PC 와 같은 규칙. */
export function shq(p: string): string {
  return `'${String(p).replace(/'/g, "'\\''")}'`;
}
