// previewSession.ts — 프리뷰 세션 핸드오프(P3)의 순수 헬퍼.
//  · 네이티브 쿠키 브리지(@react-native-cookies/cookies) — httpOnly 포함 읽기/심기.
//  · 오리진 재작성(domain/secure/path/__Host- 접두) — 논리 오리진 캡처본을 타겟 프록시 오리진으로.
//  · 매니페스트 타입. 실제 캡처/복원 오케스트레이션은 PaneView PreviewBody 컨트롤(capture/restore)에서.
//  RN Hermes 의 URL 구현이 불완전하므로 파싱은 정규식으로만 한다(new URL 회피).

export interface CookieItem {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expiresAt?: number | null; // epoch seconds. null=세션
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: string | null;
  session?: boolean;
}

export interface PreviewManifest {
  v: 1;
  kind: 'preview';
  logical: { port: number; path: string; scheme: string } | null; // 데브서버(프록시형)
  externalUrl: string | null; // 외부 사이트면 절대 URL
  host: number | null; // 데몬 runnerId(멀티 PC)
  storage: { local: Record<string, string>; session: Record<string, string> };
  cookies: CookieItem[];
  partial: boolean; // httpOnly 미승계 등
  attrsLossy: boolean; // Android 쿠키 속성 소실
}

// URL 정규식 파싱(new URL 회피). host 는 포트 제외, path 는 검색/해시 포함.
export function urlParts(url: string): { scheme: string; host: string; port: string; path: string } {
  const m = /^(https?):\/\/([^/?#]+)([^?#]*)([?#].*)?$/i.exec(url || '');
  if (!m) return { scheme: 'http', host: '', port: '', path: '/' };
  const hp = m[2];
  const ci = hp.lastIndexOf(':');
  const hasPort = ci > hp.lastIndexOf(']'); // IPv6 [..]:port 대비
  return {
    scheme: m[1].toLowerCase(),
    host: (hasPort ? hp.slice(0, ci) : hp).toLowerCase(),
    port: hasPort ? hp.slice(ci + 1) : '',
    path: (m[3] || '/') + (m[4] || ''),
  };
}

// 프록시 URL(…/api/daemon/preview/<token>/<path>) → 논리 경로(/<path>). 프록시가 아니면 그대로 경로.
export function proxyUrlToLogicalPath(fullUrl: string): string {
  const { path } = urlParts(fullUrl);
  const m = /^\/api\/daemon\/preview\/[^/]+\/(.*)$/.exec(path.replace(/[?#].*$/, ''));
  const query = (path.match(/[?#].*$/) || [''])[0];
  if (m) return '/' + m[1] + query;
  return path || '/';
}

// lazy 네이티브 쿠키 모듈 — 미설치(pod install 전)여도 다른 기능이 죽지 않게.
let _cm: any;
function cookieManager(): any | null {
  if (_cm === undefined) { try { _cm = require('@react-native-cookies/cookies').default; } catch (_) { _cm = null; } }
  return _cm ?? null;
}

// 네이티브 쿠키 읽기(useWebKit=true → iOS WKHTTPCookieStore, httpOnly 포함).
//  Android 는 name/value 만(domain/path/expires 속성 소실) → attrsLossy 표기.
export async function getNativeCookies(url: string): Promise<{ cookies: CookieItem[]; attrsLossy: boolean } | null> {
  const cm = cookieManager();
  if (!cm) return null;
  try {
    const map = await cm.get(url, true);
    const out: CookieItem[] = [];
    let lossy = false;
    for (const k of Object.keys(map || {})) {
      const c = map[k] || {};
      if (c.domain == null && c.path == null) lossy = true;
      out.push({
        name: c.name || k,
        value: c.value || '',
        domain: c.domain,
        path: c.path || '/',
        expiresAt: c.expires ? (Math.floor(Date.parse(c.expires) / 1000) || null) : null,
        secure: !!c.secure,
        httpOnly: !!c.httpOnly,
        session: !c.expires,
      });
    }
    return { cookies: out, attrsLossy: lossy };
  } catch (_) {
    return null;
  }
}

// 캡처 쿠키를 타겟 URL 오리진으로 재작성해 심는다(로드 전 호출).
export async function setNativeCookies(targetUrl: string, cookies: CookieItem[]): Promise<boolean> {
  const cm = cookieManager();
  if (!cm || !cookies || !cookies.length) return false;
  const { scheme, host } = urlParts(targetUrl);
  const isHttps = scheme === 'https';
  let okAny = false;
  for (const c of cookies) {
    let name = c.name || '';
    if (!name) continue;
    if (!isHttps && (name.startsWith('__Host-') || name.startsWith('__Secure-'))) name = name.replace(/^__(Host|Secure)-/, '');
    const cookie: Record<string, unknown> = {
      name,
      value: c.value || '',
      domain: host,
      path: '/', // 프록시 basePath 차이 흡수
      secure: isHttps ? !!c.secure : false, // http 이식 시 secure 드롭(안 그러면 미전송)
    };
    if (c.expiresAt) cookie.expires = new Date(c.expiresAt * 1000).toISOString();
    try { await cm.set(targetUrl, cookie, true); okAny = true; } catch (_) { /* 개별 실패 무시 */ }
  }
  return okAny;
}

// storage 주입 JS(eval) — 로드 후 setItem 일괄.
export function storageInjectJs(storage: PreviewManifest['storage']): string {
  const l = JSON.stringify((storage && storage.local) || {});
  const s = JSON.stringify((storage && storage.session) || {});
  return '(function(){try{var l=' + l + ';for(var k in l)localStorage.setItem(k,l[k]);}catch(e){}' +
    'try{var s=' + s + ';for(var m in s)sessionStorage.setItem(m,s[m]);}catch(e){}return "ok";})()';
}

// storage 캡처 JS(eval → 객체 반환. evalFn 이 JSON 직렬화 왕복하므로 문자열 아닌 객체를 돌려준다).
export const STORAGE_CAPTURE_JS =
  '(function(){var l={},s={};' +
  'try{for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);l[k]=localStorage.getItem(k);}}catch(e){}' +
  'try{for(var j=0;j<sessionStorage.length;j++){var m=sessionStorage.key(j);s[m]=sessionStorage.getItem(m);}}catch(e){}' +
  'return {local:l,session:s};})()';
