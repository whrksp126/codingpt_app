// 이 화면이 실제로 실행할 수 있는 ui_command 이름 목록 — ui_hello 로 신고한다.
//
// 왜 필요한가(2026-08-01 적출):
//  서버는 명령을 보낼 화면을 고를 때 "방금 만진 기기" 만 봤고, **그 기기가 그 명령을 할 줄 아는지는
//  확인하지 않았다.** 그래서 폰(구버전)을 잠깐 본 뒤 AI 가 새 명령을 실행하면 그게 폰으로 라우팅돼
//  "지원하지 않는 명령" 으로 조용히 실패한다 — 사용자에겐 "폰을 켜두면 PC 기능이 안 되는"
//  비결정적 버그로 보인다. 목록을 신고하면 서버가 할 줄 아는 화면으로만 보낸다.
//
// ⚠ UiCommandBridge 의 switch 와 **같은 커밋에서만** 바꾼다("구현한 것만 신고" 규약).
//   여기에 없는 이름을 신고하면 서버가 그 화면을 골라 보내고 실패한다(조용한 유실의 재발).
export const UI_COMMAND_NAMES: string[] = [
  'pool.changed', 'status.changed',
  'wsSelect', 'newPane', 'focusPane', 'closeSurface', 'setRatio',
  'layoutSplit', 'layoutTree',
  'ideOpen', 'ideClose', 'ideCloseFile', 'ideList', 'ideDiff',
  'previewOpen', 'previewClose', 'previewNavigate', 'previewReload', 'previewInfo',
  'previewInspect', 'previewDevtools', 'previewHandoff',
  'surfaceCapture',
  // 프리뷰 브라우저 자동화(browser.*) — 접두사 하나로 계열 전체를 신고한다.
  'browser.*',
];
