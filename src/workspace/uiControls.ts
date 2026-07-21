// uiControls.ts — ui_command 브리지 ↔ 마운트된 표면(프리뷰 WebView/IDE) 사이의 명령 채널.
//   프리뷰 url·IDE openPath 는 leaf 에 "초기값"으로만 소비되므로(마운트 후 patch 는 무시),
//   이미 떠 있는 인스턴스를 원격 조작하려면 인스턴스가 등록한 imperative 핸들을 써야 한다.
//   키 = 표면 ID(프리뷰: tid || leaf id / IDE: leaf id 또는 혼합 탭 tid — PaneView keyOf 와 동일).

export interface PreviewControl {
  load: (url: string) => void;    // 주소 로드(':5173'/포트 표기 해석 포함 — PreviewBody.load)
  reload: () => void;             // 현재 페이지 리로드(WebView.reload)
  info?: () => { url: string; title?: string; viewport?: { w: number; h: number } }; // 현재 상태 조회
  devtools?: (on?: boolean) => boolean; // 개발자도구 토글(생략=반전). 새 상태 반환
}

export interface IdeControl {
  openFile: (rel: string, line?: number) => void; // 파일 열기(+선택 라인 점프)
  closeFile?: (rel: string) => boolean;           // 열린 파일 탭 하나 닫기(있었으면 true)
  listOpenFiles?: () => { path: string; active: boolean }[]; // 지금 열린 파일 목록
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
