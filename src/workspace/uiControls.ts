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

// ── 터미널 삽입 채널(Design Mode, 라운드2 §2.4) — 마운트된 터미널 pane 의 sendKey 경로 ──
//  KeyAssist 타깃은 "키보드 포커스된 입력"만 알아서, 포커스가 없어도 "포커스(최근) 터미널 pane →
//  아무 터미널" 순서로 삽입할 대상을 고르려면 별도 레지스트리가 필요하다. 키 = pane id.
export interface TermInsert {
  insert: (text: string) => void;   // PTY stdin 삽입(TerminalWebView.sendKey — input 델타 경로와 동일)
  isFocused: () => boolean;         // 이 pane 이 현재 포커스인가
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

/** 삽입 대상 선택 — 포커스 터미널 우선, 없으면 최근 포커스(등록) 터미널, 그것도 없으면 null. */
export function pickTermInsert(): TermInsert | null {
  let best: { ctl: TermInsert; at: number } | null = null;
  for (const e of termInserts.values()) {
    if (e.ctl.isFocused()) return e.ctl;
    if (!best || e.at > best.at) best = e;
  }
  return best ? best.ctl : null;
}
