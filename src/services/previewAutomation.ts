// previewAutomation.ts — browser.* 자동화 명령 ↔ 마운트된 프리뷰 인스턴스(PreviewBody) 채널.
//   uiControls(load/reload) 와 동일한 레지스트리 패턴 — 키 = 표면 ID(tid || leaf id, PaneView keyOf 미러).
//   페이지 조작(snapshot/click/type/fill/eval/wait/get)은 run 이 pageAgent(주입 JS)에 위임하고,
//   screenshot 만 RN 측(react-native-view-shot captureRef)이라 별도 함수로 둔다.
import { BACK_URL } from '../utils/service';

export interface PreviewAutomation {
  /** pageAgent 명령 실행 — method: snapshot|click|type|fill|eval|wait|get. 결과 = 페이지 회신 result. */
  run: (method: string, args: Record<string, unknown>) => Promise<unknown>;
  /** 프리뷰 WebView 컨테이너 캡처(JPEG base64, 긴 변 1200px) — RN 측 captureRef. */
  screenshot: () => Promise<{ format: 'jpeg'; base64: string }>;
}

const automations = new Map<string, PreviewAutomation>();

/** 프리뷰 자동화 인스턴스 등록 — 반환된 함수로 해제(같은 핸들일 때만 삭제해 재마운트 레이스 방지). */
export function registerAutomation(key: string, ctl: PreviewAutomation): () => void {
  automations.set(key, ctl);
  return () => { if (automations.get(key) === ctl) automations.delete(key); };
}
export function getAutomation(key: string): PreviewAutomation | undefined {
  return automations.get(key);
}

/** 페이지 상태를 바꾸는 명령 — 허용 오리진에서만 실행(snapshot/get/wait/screenshot 은 예외). */
export const AUTOMATION_MUTATING = new Set(['eval', 'click', 'type', 'fill', 'press']);

/** 오리진 가드 — localhost/127.0.0.1 또는 데몬 프리뷰 프록시(back 도메인)만 자동 조작 허용. */
export function isAutomationAllowedOrigin(url: string): boolean {
  if (!url) return false;
  if (/^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)([:/?#]|$)/i.test(url)) return true;
  // 원격 데브서버는 back 도메인 경유(buildDaemonPreviewUrl → BACK_URL/api/daemon/preview/...) —
  //  호스트가 back 도메인과 같으면 프록시된 로컬 개발 서버로 본다.
  const hostOf = (u: string) => u.replace(/^https?:\/\//i, '').replace(/[/?#].*$/, '').toLowerCase();
  try { return hostOf(url) === hostOf(BACK_URL); } catch (_) { return false; }
}
