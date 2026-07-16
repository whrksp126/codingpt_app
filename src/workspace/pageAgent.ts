// pageAgent.ts — 프리뷰 WebView 페이지에 주입되는 자동화 에이전트(문자열 소스, IIFE).
//   browser.* 명령(snapshot/click/type/fill/eval/wait/get)의 페이지 측 구현.
//   진입은 window.__cptAgentRun(id, method, argsJson) 하나(주입 호출 단순화) — 결과는
//   window.ReactNativeWebView.postMessage({__cptAgentOut:{id, ok, result|error}}) 로 회신.
//   멱등 가드: 이미 설치돼 있으면 재주입해도 no-op(RN 측이 매 호출 주입해도 안전).
//   RN 측 짝: services/previewAutomation.ts(레지스트리·오리진 가드) + PaneView PreviewBody(주입/매칭).
export const PAGE_AGENT_JS = `(function(){
if (window.__cptAgentRun) return;

// ── 공통 유틸 ──
// 가시성 필터 — 렌더 크기 0 / display:none / visibility:hidden 요소 제외.
function isVisible(el){
  var r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return false;
  var st = window.getComputedStyle(el);
  return st.display !== 'none' && st.visibility !== 'hidden';
}
// target 해석 — 'eN'(스냅샷 ref) 이면 data-cpt-ref 조회, 아니면 CSS selector.
function findEl(target){
  var t = String(target == null ? '' : target);
  if (/^e[0-9]+$/.test(t)) return document.querySelector('[data-cpt-ref="' + t + '"]');
  try { return document.querySelector(t); } catch (e) { return null; }
}
function mustEl(target){
  var el = findEl(target);
  if (!el) throw new Error('요소를 찾을 수 없어요: ' + String(target));
  return el;
}
// 네이티브 value setter — React 등 프레임워크가 변경을 감지하도록 프로토타입 setter 로 대입.
function setNativeValue(el, v){
  var proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
    : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype
    : HTMLInputElement.prototype;
  var d = Object.getOwnPropertyDescriptor(proto, 'value');
  if (d && d.set) d.set.call(el, v); else el.value = v;
}
function fireInput(el, withChange){
  el.dispatchEvent(new Event('input', { bubbles: true }));
  if (withChange) el.dispatchEvent(new Event('change', { bubbles: true }));
}
function isTextInput(el){
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
}
function isEditable(el){
  return el.isContentEditable || el.hasAttribute('contenteditable');
}

// ── snapshot — 인터랙티브 요소 수집 + data-cpt-ref 부여(재스냅샷 시 재부여) ──
var PICK = 'a,button,input,select,textarea,[role=button],[role=link],[role=checkbox],[role=radio],[role=textbox],[role=combobox],[role=listbox],[role=menuitem],[role=option],[role=switch],[role=tab],[role=slider],[role=searchbox],[onclick],[contenteditable]';
function roleOf(el){
  var r = el.getAttribute('role');
  if (r) return r;
  var tag = el.tagName.toLowerCase();
  if (tag === 'a') return 'link';
  if (tag === 'button') return 'button';
  if (tag === 'select') return 'combobox';
  if (tag === 'textarea') return 'textbox';
  if (tag === 'input') {
    var ty = (el.getAttribute('type') || 'text').toLowerCase();
    if (ty === 'checkbox' || ty === 'radio') return ty;
    if (ty === 'button' || ty === 'submit' || ty === 'reset') return 'button';
    return 'textbox';
  }
  if (isEditable(el)) return 'textbox';
  return 'generic';
}
// name = aria-label || placeholder || innerText(80자 절삭) || alt || title.
function nameOf(el){
  var n = el.getAttribute('aria-label') || el.getAttribute('placeholder') || '';
  if (!n) n = (el.innerText || '').replace(/\\s+/g, ' ').trim();
  if (!n) n = el.getAttribute('alt') || el.getAttribute('title') || '';
  return n.length > 80 ? n.slice(0, 80) : n;
}
function snapshot(args){
  var compact = !!(args && args.compact);
  // 이전 ref 전부 제거 후 재부여 — ref 가 항상 최신 화면과 일치.
  var olds = document.querySelectorAll('[data-cpt-ref]');
  for (var i = 0; i < olds.length; i++) olds[i].removeAttribute('data-cpt-ref');
  var els = document.querySelectorAll(PICK);
  var refs = [];
  var seq = 0;
  for (var j = 0; j < els.length; j++) {
    var el = els[j];
    if (!isVisible(el)) continue;
    var ref = 'e' + (++seq);
    el.setAttribute('data-cpt-ref', ref);
    var item = { ref: ref, role: roleOf(el), tag: el.tagName.toLowerCase(), name: nameOf(el) };
    if (isTextInput(el) || el instanceof HTMLSelectElement) item.value = el.value;
    if (el instanceof HTMLAnchorElement && el.href) item.href = el.href;
    if (!compact) {
      var r = el.getBoundingClientRect();
      item.rect = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    }
    refs.push(item);
  }
  return { url: location.href, title: document.title || '', refs: refs };
}

// ── click / type / fill ──
function click(args){
  var el = mustEl(args.target);
  try { el.focus(); } catch (e) {}
  el.click();
  return { clicked: true };
}
// type — 기존 값 유지하며 문자 append(input 이벤트 디스패치).
function typeFn(args){
  var el = mustEl(args.target);
  var text = String(args.text == null ? '' : args.text);
  try { el.focus(); } catch (e) {}
  if (isTextInput(el)) {
    setNativeValue(el, el.value + text);
    fireInput(el, false);
  } else if (isEditable(el)) {
    el.textContent = (el.textContent || '') + text;
    fireInput(el, false);
  } else {
    throw new Error('입력 가능한 요소가 아니에요: ' + el.tagName.toLowerCase());
  }
  return { typed: true };
}
// fill — 값 대체(빈 value = 클리어). 네이티브 setter + input/change 디스패치.
function fill(args){
  var el = mustEl(args.target);
  var value = String(args.value == null ? '' : args.value);
  try { el.focus(); } catch (e) {}
  if (isTextInput(el) || el instanceof HTMLSelectElement) {
    setNativeValue(el, value);
    fireInput(el, true);
  } else if (isEditable(el)) {
    el.textContent = value;
    fireInput(el, false);
  } else {
    throw new Error('입력 가능한 요소가 아니에요: ' + el.tagName.toLowerCase());
  }
  return { filled: true };
}

// ── eval — 오리진 가드는 RN 측(previewAutomation)에서 통과된 경우에만 여기까지 온다 ──
function evalFn(args){
  var r = (0, eval)(String(args.js == null ? '' : args.js));
  if (r === undefined) return null;
  // JSON 직렬화 가능하면 그대로, 아니면 String() 폴백.
  try { var s = JSON.stringify(r); return s === undefined ? String(r) : JSON.parse(s); }
  catch (e) { return String(r); }
}

// ── wait — 조건(selector/텍스트 존재) 폴링. 유일한 비동기(Promise) 명령 ──
function waitFn(args){
  var selector = args && args.selector ? String(args.selector) : null;
  var text = args && args.text ? String(args.text) : null;
  // 기본 10s, 상한 25s(RN 측 30s 타임아웃보다 짧게 — 결과 {found:false} 가 반드시 회신되게).
  var timeout = Math.min(Math.max(Number(args && args.timeoutMs) || 10000, 100), 25000);
  var deadline = Date.now() + timeout;
  function check(){
    try {
      if (selector) {
        var el = document.querySelector(selector);
        if (!el) return false;
        if (text) return (el.innerText || el.textContent || '').indexOf(text) >= 0;
        return true;
      }
      if (text) return ((document.body && document.body.innerText) || '').indexOf(text) >= 0;
      return true; // 조건 없음 = 즉시 충족
    } catch (e) { return false; }
  }
  return new Promise(function(resolve){
    if (check()) { resolve({ found: true }); return; }
    var iv = setInterval(function(){
      if (check()) { clearInterval(iv); resolve({ found: true }); }
      else if (Date.now() >= deadline) { clearInterval(iv); resolve({ found: false }); }
    }, 250);
  });
}

// ── get — url/title/text/html 조회(text/html 은 selector 범위, 100KB 절삭) ──
var GET_MAX = 100 * 1024;
function getFn(args){
  var what = String((args && args.what) || 'url');
  if (what === 'url') return { url: location.href };
  if (what === 'title') return { title: document.title || '' };
  var root = args && args.selector ? document.querySelector(String(args.selector)) : document.body;
  if (!root) throw new Error('요소를 찾을 수 없어요: ' + String(args && args.selector));
  if (what === 'text') {
    var t = root.innerText || root.textContent || '';
    return { text: t.length > GET_MAX ? t.slice(0, GET_MAX) : t };
  }
  if (what === 'html') {
    var h = root.outerHTML || '';
    return { html: h.length > GET_MAX ? h.slice(0, GET_MAX) : h };
  }
  throw new Error('지원하지 않는 what: ' + what);
}

// ── 진입점 — RN 이 __cptAgentRun(id, method, argsJson) 하나만 호출 ──
var api = { snapshot: snapshot, click: click, type: typeFn, fill: fill, eval: evalFn, get: getFn };
window.__cptAgentRun = function(id, method, argsJson){
  function send(ok, payload){
    try {
      window.ReactNativeWebView.postMessage(JSON.stringify({ __cptAgentOut: {
        id: id, ok: ok,
        result: ok ? payload : undefined,
        error: ok ? undefined : String(payload && payload.message ? payload.message : payload),
      } }));
    } catch (e) {}
  }
  var args = {};
  try { args = argsJson ? JSON.parse(argsJson) : {}; } catch (e) {}
  try {
    if (method === 'wait') { waitFn(args).then(function(r){ send(true, r); }); return; }
    var fn = api[method];
    if (!fn) { send(false, '지원하지 않는 메서드: ' + method); return; }
    send(true, fn(args));
  } catch (e) { send(false, e); }
};
})();true;`;
