// appearanceSync — 모양 설정(인터페이스 글꼴/코드·터미널 글꼴/터미널 스타일) 계정 전체 동기화.
//  · 로컬 변경: 각 스토어 set → schedulePushAppearance(디바운스) → PATCH /api/daemon/me {appearance}
//    → 서버가 appearance_event 로 전 기기 팬아웃(notificationService 가 수신 → applyRemoteAppearance).
//  · 부트: bootSyncAppearance() 가 GET /api/daemon/me 로 서버 정본을 당겨와 silent 적용.
//  · 서버발 적용은 silent(재푸시 금지) — 에코 루프 방지.
import { api } from './api';
import { getUiFont, setUiFont, isValidUiFont } from './uiFontSetting';
import { getCodeFont, setCodeFont, isValidCodeFont } from './fontSetting';
import { getTermScheme, setTermScheme, isValidTermScheme } from './termSchemeSetting';

let pushTimer: ReturnType<typeof setTimeout> | null = null;

export function schedulePushAppearance() {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    // 단축키도 같은 봉투로 나간다 — 한 기기에서 바꾼 것이 다른 기기에 그대로 와야 한다.
    //  구 서버는 화이트리스트에서 이 키를 버린다(오류가 아니라 "동기화만 안 됨").
    const { overridesSnapshot } = require('../palette/shortcuts');
    void api.appearance.update({
      uiFont: getUiFont(),
      codeFont: getCodeFont(),
      termStyle: getTermScheme(),
      shortcuts: overridesSnapshot(),
    });
  }, 400);
}

/** 서버/타 기기발 적용 — 서버로 되밀지 않는다(silent). */
export function applyRemoteAppearance(a: unknown) {
  if (!a || typeof a !== 'object') return;
  const o = a as Record<string, unknown>;
  if (isValidUiFont(o.uiFont)) void setUiFont(o.uiFont, { silent: true });
  if (isValidCodeFont(o.codeFont)) void setCodeFont(o.codeFont, { silent: true });
  if (isValidTermScheme(o.termStyle)) void setTermScheme(o.termStyle, { silent: true });
  if (o.shortcuts && typeof o.shortcuts === 'object') {
    const { applyRemoteShortcuts } = require('../palette/shortcuts');
    applyRemoteShortcuts(o.shortcuts);
  }
}

/** 로그인 후 1회 — 서버 정본을 당겨와 적용(실패는 조용히, 로컬 캐시 유지). */
export async function bootSyncAppearance() {
  try {
    const r = await api.appearance.get();
    const appearance = (r as any)?.data?.appearance ?? (r as any)?.appearance;
    if (appearance) applyRemoteAppearance(appearance);
  } catch (_) { /* 오프라인 등 — 로컬 캐시 유지 */ }
}
