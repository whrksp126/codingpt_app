// 웹뷰(터미널·에디터) 안에서 눌린 하드웨어 키를 **앱이 먹을지 셸이 먹을지** 가르는 자리.
//
// 사용자 확정 규칙(2026-08-04): **⌘ = 앱 / Ctrl·Alt = 터미널.**
//  mac 터미널 관례 그대로다(iTerm·Terminal.app). Ctrl-A·Ctrl-R·Ctrl-W 같은 readline 키를 앱이
//  가로채면 터미널이 터미널이 아니게 된다 — 그래서 **수식어에 Ctrl 이나 Alt 만 있는 조합은
//  절대 가로채지 않는다.**
//
// ⚠ 여기서 `Mod` 는 **항상 meta(⌘ / Meta·Win·검색 키)** 다. `commands.ts` 의 `Mod` 는 플랫폼에 따라
//   ⌘ 또는 Ctrl 로 풀리지만, 웹뷰 안에서 그 규칙을 그대로 쓰면 안드로이드에서 `Mod+T`=Ctrl+T 가 되어
//   위 규칙과 정면으로 부딪친다(셸의 Ctrl 키를 통째로 뺏는다). 그래서 **폰·태블릿의 단축키 표는
//   Mod=meta 로 고정**한다(shortcuts.ts 의 IS_APPLE 이 앱에선 항상 true 인 이유).
//
// 왜 웹뷰 안에서 판정하나: RN 은 하드웨어 키 이벤트를 주지 않는다(네이티브 모듈 없이는). 반면
//  터미널·에디터는 WebView 라 keydown 이 그 안 JS 로 온다. 그리고 `preventDefault` 는 **동기로**
//  정해야 해서 "RN 에 물어보고 결정"이 불가능하다 → 적용 중인 조합표를 웹뷰에 미리 주입해 둔다.
//
// ⚠ 아래 스니펫은 `commands.ts` 의 `comboFromEvent(e, true)` 를 **손으로 옮긴 것**이다(웹뷰 안엔
//   import 가 없다). 둘이 갈리면 "설정엔 ⌘E 인데 눌러도 안 먹는" 유령이 된다 →
//   `__tests__/hardwareKeys.test.tsx` 가 두 구현을 같은 이벤트 코퍼스로 돌려 대조한다.
import { NAMED_KEYS, PUNCT_TO_NAME } from './commands';

/**
 * 웹뷰에 한 번 주입하는 판정기. `window.__cptAppKey(e)` 가 조합 문자열이면 앱이 가져갈 키다.
 *  표(`window.__CPT_KEYS`)는 별도로, 단축키가 바뀔 때마다 주입한다 —
 *  **HTML 문자열에 넣으면 안 된다**(터미널이 통째로 재마운트된다).
 */
export const WEBVIEW_KEY_JS = `(function(){
  var NAMED = ${JSON.stringify(NAMED_KEYS)};
  var PUNCT = ${JSON.stringify(PUNCT_TO_NAME)};
  var ORDER = ['Mod','Ctrl','Alt','Shift'];
  function canon(raw){
    var s = String(raw || '');
    if (!s) return null;
    if (Object.prototype.hasOwnProperty.call(PUNCT, s)) return PUNCT[s];
    for (var i=0;i<NAMED.length;i++){ if (NAMED[i].toLowerCase() === s.toLowerCase()) return NAMED[i]; }
    if (s.length === 1){ var c = s.toUpperCase(); return /[A-Z0-9]/.test(c) ? c : null; }
    return null;
  }
  function combo(e){
    var code = (e && e.code) ? String(e.code) : '';
    var key = null;
    if (/^Key[A-Z]$/.test(code)) key = code.slice(3);
    else if (/^Digit[0-9]$/.test(code)) key = code.slice(5);
    else if (/^Numpad[0-9]$/.test(code)) key = code.slice(6);
    else if (code && NAMED.indexOf(code) >= 0) key = code;
    else if (code === 'Minus' || code === 'Equal') key = code;
    else key = canon(e && e.key);
    if (key == null) return null;
    var k = String(e && e.key);
    if (k === 'Shift' || k === 'Control' || k === 'Alt' || k === 'Meta') return null;
    var mods = [];
    if (e && e.metaKey) mods.push('Mod');
    if (e && e.ctrlKey) mods.push('Ctrl');
    if (e && e.altKey) mods.push('Alt');
    if (e && e.shiftKey) mods.push('Shift');
    if (!mods.length && !/^F(?:[1-9]|1[0-2])$/.test(key)) return null;
    var out = [];
    for (var j=0;j<ORDER.length;j++){ if (mods.indexOf(ORDER[j]) >= 0) out.push(ORDER[j]); }
    out.push(key);
    return out.join('+');
  }
  window.__cptCombo = combo;
  if (!window.__CPT_KEYS) window.__CPT_KEYS = {};
  // ⌘(meta) 없는 조합은 **묻지도 않고** 터미널 몫이다 — 위 규칙의 유일한 관문.
  window.__cptAppKey = function(e){
    if (!e || !e.metaKey) return null;
    var c = combo(e);
    return (c && window.__CPT_KEYS[c]) ? c : null;
  };
})();`;

/**
 * 적용 중인 조합표 → 웹뷰에 주입할 갱신 스니펫.
 *  값이 `null`(단축키 없음)인 명령은 빠진다 — 표에 없는 ⌘ 조합은 터미널이 그대로 받는다
 *  (⌘ 를 통째로 삼키면 ⌘C 복사 같은 터미널 자체 기능이 죽는다).
 */
export function webviewKeyTableJs(bindings: Record<string, string | null> | null): string {
  const table: Record<string, string> = {};
  for (const id of Object.keys(bindings || {})) {
    const combo = (bindings as Record<string, string | null>)[id];
    if (typeof combo === 'string' && combo) table[combo] = id;
  }
  return `window.__CPT_KEYS = ${JSON.stringify(table)}; true;`;
}
