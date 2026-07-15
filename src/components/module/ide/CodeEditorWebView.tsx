import React, { forwardRef, useImperativeHandle, useRef, useCallback, useEffect } from 'react';
import { Clipboard } from 'react-native';
import { WebView } from 'react-native-webview';
import { CM_CSS, CM_JS, SHOW_HINT_JS, SHOW_HINT_CSS, HINT_LANG_JS, JSX_MODE_JS } from './codemirrorAssets';
import type { EditorContext } from './keyContexts';
import type { SpecialKeyName, KeyboardOS } from '../../keyboard/SpecialKeyPanel';
import type { ModFlags } from '../../keyboard/modifierKeys';

// CodeMirror 를 앱 번들에 인라인 — 외부 CDN/백엔드 의존 없이 항상 렌더(오프라인 LAN 환경 대비).
// 파일 내용은 <script> 가 아니라 <textarea> 에 HTML-이스케이프해서 넣는다.
//  → 콘텐츠에 </script> 나 </textarea> 가 있어도 깨지지 않음.
// 테마는 VS Code "Dark+" 색을 흉내낸 커스텀 테마(vscode-dark).

export interface CodeEditorHandle {
  /** 텍스트 삽입. caret = 삽입 텍스트 끝에서의 커서 오프셋(음수=왼쪽). 예: '=""', -1 → ="|" */
  insertText: (text: string, caret?: number) => void;
  /** 에디터 내용을 통째로 교체(에이전트 편집 동기화). 커서 유지 시도 */
  setValue: (text: string) => void;
  /** 디버그 현재 실행 줄 하이라이트 (1-based) */
  highlightLine: (line: number) => void;
  /** 특정 (line, col) 로 커서 이동 + 스크롤 + 잠깐 강조 (1-based). 검색 결과 점프용 */
  gotoLine: (line: number, col?: number) => void;
  /** 파일 내 찾기: 매치 전부 강조 + 첫 매치로 이동. onFindCount 로 idx/total 통지 */
  find: (query: string, opts?: { caseSensitive?: boolean }) => void;
  /** 다음/이전 매치로 순환 이동 */
  findNext: () => void;
  findPrev: () => void;
  /** 현재 매치를 text 로 치환 */
  replaceCurrent: (text: string) => void;
  /** 모든 매치를 text 로 치환 */
  replaceAll: (text: string) => void;
  /** 찾기 강조 제거(바 닫을 때) */
  clearSearch: () => void;
  /** 현재 실행 줄 하이라이트 제거 */
  clearHighlight: () => void;
  /** 관리자 지정 하이라이트 구간 적용 (Monaco 1-based range, 여러 구간) */
  setHighlights: (ranges: HighlightRange[]) => void;
  /** 브레이크포인트 줄 목록 반영 (1-based) */
  setBreakpoints: (lines: number[]) => void;
  /** 자동완성 팝업 수동 호출(추천 키) */
  triggerHint: () => void;
  /** 자동완성 팝업 네비게이션: 'up'|'down'|'pick'|'close' */
  hintNav: (action: 'up' | 'down' | 'pick' | 'close') => void;
  /** 커서 이동 (소프트 키보드엔 방향키가 없음 + WebView라 OS 커서제어 불가) */
  moveCursor: (dir: 'left' | 'right' | 'up' | 'down') => void;
  /** 실물키보드 패널의 모디파이어(ctrl/alt/meta/shift) 활성 상태 주입 — OS 키보드 글자와 조합용 */
  setVmods: (flags: ModFlags) => void;
  /** 원샷 특수키(esc/tab/방향/home/end/pgup/pgdn/delete/backspace/enter)를 현재 모디파이어+OS 관례와 함께 적용 */
  applyKey: (name: SpecialKeyName, mods: ModFlags, os?: KeyboardOS) => void;
  /** 단축키 직접 실행(버튼 탭): 'undo'|'redo'|'selectAll'|'copy'|'cut'|'paste'|'save'|'dup' 또는 글자 a/z/y/c/x/v/s/d */
  runShortcut: (action: string) => void;
  /** CM 포커스 → OS 소프트 키보드 복귀 */
  focus: () => void;
  /** CM 블러 → OS 소프트 키보드 내림(특수키 패널로 전환 시) */
  blur: () => void;
  /** 특수키 패널 모드에서 inputmode=none 으로 소프트 키보드 억제 — 포커스(커서 표시)는 유지하되 OS 키보드는 안 뜸 */
  setImeSuppressed: (on: boolean) => void;
  /** OS 키보드 복귀 — blur→재포커스로 focus 이벤트를 재발생시켜 키보드를 다시 띄운다(inputmode=text 선행 필요) */
  refocusKeyboard: () => void;
}

export interface HighlightRange {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

interface CodeEditorWebViewProps {
  value: string;
  language: string;
  wrap?: boolean;
  lineNumbers?: boolean;
  fontSize?: number;
  // 에디터 콘텐츠 고정 폭(px). 탐색기 등장으로 컨테이너가 좁아져도 이 폭을 유지(줄바꿈 재계산 방지),
  // 좁아진 만큼은 페이지가 가로 스크롤됨.
  editorWidth?: number;
  // 색 테마 — 기본 vscode-dark(레슨/기존 IDE), material-darker = PC 워크스페이스 IDE 와 동일 룩.
  theme?: 'vscode-dark' | 'material-darker';
  onChange: (value: string) => void;
  onReady?: () => void;
  /** 거터 클릭으로 브레이크포인트 토글 요청 (1-based line) */
  onBreakpointToggle?: (line: number) => void;
  /** 코드 선택 변경 (Agent 프롬프트 주입용). 선택 없으면 code:'' */
  onSelectionChange?: (sel: { startLine: number; endLine: number; code: string }) => void;
  /** 자동완성 팝업 열림/닫힘 (액세서리에 방향키/선택 키 노출용) */
  onHintToggle?: (open: boolean) => void;
  /** 커서 컨텍스트(스코프) 변경 — 컨텍스트 인식 보조키 세트 구동용 */
  onContextChange?: (ctx: EditorContext) => void;
  /** 에디터 단축키(ctrl+s=저장, ctrl+f=찾기) 발동 */
  onShortcut?: (action: string) => void;
  /** 파일 내 찾기 매치 카운트 변화(찾기바 표시용). idx=현재(1-based, 0=없음), total=전체 */
  onFindCount?: (info: { idx: number; total: number }) => void;
  /** 모디파이어 조합키가 실제로 실행됨 → RN 이 once 모디파이어 해제 */
  onVmodConsume?: () => void;
  /** 에디터 입력 포커스 변화(보조바 즉시 노출용) */
  onFocusChange?: (focused: boolean) => void;
  /** 에디터 내부 터치(1.2s 스로틀) — 이미 포커스된 에디터도 활성 그룹 판정에 쓸 수 있게 */
  onInteract?: () => void;
}

// CodeMirror 의 mode 옵션에 그대로 들어갈 JS 표현식 문자열을 반환(문자열 모드는 반드시 따옴표).
const modeFor = (language: string) => {
  switch ((language || '').toLowerCase()) {
    case 'html': case 'htm': return "'htmlmixed'";
    case 'css': case 'scss': case 'less': return "'css'";
    case 'javascript': case 'js': case 'mjs': case 'cjs': return "'javascript'";
    case 'jsx': case 'tsx': return "'jsx'"; // React — jsx 모드(xml+javascript)
    case 'typescript': case 'ts': return '{name:"javascript",typescript:true}';
    case 'json': return '{name:"javascript",json:true}';
    case 'python': case 'py': return "'python'";
    case 'xml': case 'svg': return "'xml'";
    default: return 'null';
  }
};

const escapeHtml = (s: string) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// VS Code Dark+ 색상 테마 (CodeMirror 토큰 클래스 매핑)
const VSCODE_THEME_CSS = `
  /* 가로/세로 스크롤은 오직 .CodeMirror-scroll 안에서만 — body 가 스크롤되면 줄 번호 거터가 페이지째 밀린다. */
  html, body { margin:0; padding:0; background:#1E1E1E; height:100%; overflow:hidden; }
  .CodeMirror {
    height:100%; font-size:14px; line-height:1.5;
    font-family: Menlo, Monaco, Consolas, "Courier New", monospace;
  }
  /* 가로 스크롤은 이 .CodeMirror-scroll 안에서만 일어나고(페이지 width 고정 안 함), 줄 번호 거터는 아래 position:sticky 로 고정. */
  .CodeMirror-scroll { overscroll-behavior: contain; }
  .cm-s-vscode-dark.CodeMirror { background:#1E1E1E; color:#D4D4D4; }
  /* CM 자체 거터는 "공간 확보 + 클릭 좌표"용으로만 두고, 배경/글자를 transparent 로 안 보이게 한다.
     (opacity:0 은 스크롤 리페인트 중 한 프레임 깜빡일 수 있어 transparent 로 처리 — 공간(너비)은 유지됨)
     실제 줄 번호는 JS 가 만든 고정 오버레이(.CodeMirror 밖)로 표시 → 가로 스크롤이 줄 번호에 절대 안 닿음. */
  .cm-s-vscode-dark .CodeMirror-gutters { background:transparent !important; border:none; }
  .cm-s-vscode-dark .CodeMirror-gutter { background:transparent !important; }
  .cm-s-vscode-dark .CodeMirror-linenumber { color:transparent !important; }
  .cm-s-vscode-dark .CodeMirror-cursor { border-left:1px solid #AEAFAD; }
  /* 롱프레스 시 안드로이드 네이티브 콜아웃/선택메뉴(붙여넣기·모두선택) 억제 — 선택은 우리가 직접 처리 */
  .CodeMirror { -webkit-touch-callout:none; }
  .cm-s-vscode-dark .CodeMirror-lines, .cm-s-vscode-dark .CodeMirror-code { -webkit-user-select:none; user-select:none; }
  .cm-s-vscode-dark .CodeMirror-selected { background:#264F78; }
  .cm-s-vscode-dark.CodeMirror-focused .CodeMirror-selected { background:#264F78; }
  .cm-s-vscode-dark .CodeMirror-activeline-background { background:#2A2A2A; }
  .cm-s-vscode-dark .cm-comment { color:#6A9955; }
  .cm-s-vscode-dark .cm-string, .cm-s-vscode-dark .cm-string-2 { color:#CE9178; }
  .cm-s-vscode-dark .cm-number { color:#B5CEA8; }
  .cm-s-vscode-dark .cm-keyword { color:#569CD6; }
  .cm-s-vscode-dark .cm-atom { color:#569CD6; }
  .cm-s-vscode-dark .cm-def { color:#DCDCAA; }
  .cm-s-vscode-dark .cm-variable { color:#9CDCFE; }
  .cm-s-vscode-dark .cm-variable-2 { color:#9CDCFE; }
  .cm-s-vscode-dark .cm-variable-3, .cm-s-vscode-dark .cm-type { color:#4EC9B0; }
  .cm-s-vscode-dark .cm-property { color:#9CDCFE; }
  .cm-s-vscode-dark .cm-operator { color:#D4D4D4; }
  .cm-s-vscode-dark .cm-meta { color:#9CDCFE; }
  .cm-s-vscode-dark .cm-qualifier { color:#D7BA7D; }
  .cm-s-vscode-dark .cm-builtin { color:#4EC9B0; }
  .cm-s-vscode-dark .cm-bracket { color:#FFD700; }
  .cm-s-vscode-dark .cm-tag { color:#569CD6; }
  .cm-s-vscode-dark .cm-attribute { color:#9CDCFE; }
  .cm-s-vscode-dark .cm-string.cm-attribute { color:#CE9178; }
  .cm-s-vscode-dark .cm-header { color:#569CD6; }
  .cm-s-vscode-dark .cm-link { color:#CE9178; }
  /* 닫는 태그 불일치 등은 빨간 에러로 두지 않고 일반 태그색으로(VS Code 처럼) */
  .cm-s-vscode-dark .cm-error { color:#569CD6; background:transparent; }
  .cm-s-vscode-dark .CodeMirror-matchingbracket { color:#FFD700 !important; text-decoration:underline; }
  /* 디버그 현재 실행 줄 / 관리자 지정 하이라이트 구간 */
  .cm-s-vscode-dark .cpt-debug-line { background:#3A3000 !important; }
  .cm-s-vscode-dark .cpt-goto-line { background:#264F78 !important; transition:background .3s; }
  .cm-s-vscode-dark .cpt-hl-range { background:rgba(250,204,21,0.22); border-radius:2px; }
  /* 파일 내 찾기/바꾸기 매치 강조(전체=흐림, 현재=진함+외곽선) */
  .cm-s-vscode-dark .cpt-find-match { background:rgba(234,179,8,0.28); }
  .cm-s-vscode-dark .cpt-find-current { background:rgba(234,179,8,0.55); outline:1px solid #EAB308; }
  #err { color:#F87171; font-family:monospace; font-size:12px; padding:12px; white-space:pre-wrap; }
  /* 자동완성(show-hint) 팝업 — VS Code Dark 톤 */
  .CodeMirror-hints { background:#252526; border:1px solid #454545; border-radius:5px; box-shadow:0 2px 10px rgba(0,0,0,0.45); font-family:Menlo,Monaco,Consolas,monospace; font-size:13px; padding:2px; max-height:16em; z-index:50; }
  .CodeMirror-hint { color:#D4D4D4; padding:3px 10px; border-radius:3px; }
  li.CodeMirror-hint-active { background:#094771; color:#FFFFFF; }
`;

// PC 워크스페이스 IDE 와 동일 룩 — material-darker 토큰색(PC vendor css 동일값) + PC 오버라이드
//  (.ide-editor .CodeMirror { background: var(--base=#0a0d14) }, 거터 배경 동일·보더 없음).
//  거터 숨김/찾기/디버그 기능 클래스는 vscode-dark 와 동일하게 재선언(테마 클래스가 달라서 필요).
const MATERIAL_DARKER_CSS = `
  .cm-s-material-darker.CodeMirror { background:#0a0d14; color:#EEFFFF; }
  .cm-s-material-darker .CodeMirror-gutters { background:transparent !important; border:none; }
  .cm-s-material-darker .CodeMirror-gutter { background:transparent !important; }
  .cm-s-material-darker .CodeMirror-linenumber { color:transparent !important; }
  .cm-s-material-darker .CodeMirror-cursor { border-left:1px solid #FFCC00; }
  .cm-s-material-darker div.CodeMirror-selected { background:rgba(97,97,97,0.2); }
  .cm-s-material-darker.CodeMirror-focused div.CodeMirror-selected { background:rgba(97,97,97,0.2); }
  .cm-s-material-darker .CodeMirror-activeline-background { background:rgba(0,0,0,0.5); }
  .cm-s-material-darker .CodeMirror-lines, .cm-s-material-darker .CodeMirror-code { -webkit-user-select:none; user-select:none; }
  .cm-s-material-darker .cm-keyword { color:#C792EA; }
  .cm-s-material-darker .cm-operator { color:#89DDFF; }
  .cm-s-material-darker .cm-variable-2 { color:#EEFFFF; }
  .cm-s-material-darker .cm-builtin { color:#FFCB6B; }
  .cm-s-material-darker .cm-atom { color:#F78C6C; }
  .cm-s-material-darker .cm-number { color:#FF5370; }
  .cm-s-material-darker .cm-def { color:#82AAFF; }
  .cm-s-material-darker .cm-string { color:#C3E88D; }
  .cm-s-material-darker .cm-string-2 { color:#f07178; }
  .cm-s-material-darker .cm-comment { color:#545454; }
  .cm-s-material-darker .cm-variable { color:#f07178; }
  .cm-s-material-darker .cm-tag { color:#FF5370; }
  .cm-s-material-darker .cm-meta { color:#FFCB6B; }
  .cm-s-material-darker .cm-attribute { color:#C792EA; }
  .cm-s-material-darker .cm-property { color:#C792EA; }
  .cm-s-material-darker .cm-qualifier { color:#DECB6B; }
  .cm-s-material-darker .cm-variable-3, .cm-s-material-darker .cm-type { color:#DECB6B; }
  .cm-s-material-darker .cm-error { color:#fff; background-color:#FF5370; }
  .cm-s-material-darker .CodeMirror-matchingbracket { text-decoration:underline; color:white !important; }
  .cm-s-material-darker .cpt-debug-line { background:#3A3000 !important; }
  .cm-s-material-darker .cpt-goto-line { background:#264F78 !important; transition:background .3s; }
  .cm-s-material-darker .cpt-hl-range { background:rgba(250,204,21,0.22); border-radius:2px; }
  .cm-s-material-darker .cpt-find-match { background:rgba(199,139,30,0.30); }
  .cm-s-material-darker .cpt-find-current { background:rgba(199,139,30,0.62); outline:1px solid #EAB308; }
`;

const buildHtml = (value: string, language: string, wrap: boolean, lineNumbers: boolean, fontSize: number, editorWidth: number, theme: string) => {
  const mode = modeFor(language);
  const bg = theme === 'material-darker' ? '#0a0d14' : '#1E1E1E';
  const widthCss = editorWidth && editorWidth > 0
    ? `.CodeMirror { width:${editorWidth}px; } body { min-width:${editorWidth}px; }`
    : '';
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <style>${CM_CSS}</style>
  <style>${SHOW_HINT_CSS}</style>
  <script>${CM_JS}</script>
  <script>${JSX_MODE_JS}</script>
  <script>${SHOW_HINT_JS}</script>
  <script>${HINT_LANG_JS}</script>
  <style>${VSCODE_THEME_CSS}</style>
  <style>${MATERIAL_DARKER_CSS}</style>
  <style>html, body { background:${bg}; } .CodeMirror { font-size:${fontSize}px; } ${widthCss}</style>
</head>
<body>
  <textarea id="ed">${escapeHtml(value)}</textarea>
  <div id="err"></div>
  <script>
    var post = function(obj){ try { window.ReactNativeWebView.postMessage(JSON.stringify(obj)); } catch(e){} };
    try {
      if (typeof CodeMirror === 'undefined') throw new Error('CodeMirror 로드 실패');
      var cm = CodeMirror.fromTextArea(document.getElementById('ed'), {
        mode: ${mode},
        theme: '${theme}',
        lineNumbers: ${lineNumbers ? 'true' : 'false'},
        lineWrapping: ${wrap ? 'true' : 'false'},
        fixedGutter: true,
        viewportMargin: Infinity,
        autofocus: false,
        inputStyle: 'textarea', // 모바일 기본 contenteditable 은 IME 조합으로 자동완성 트리거가 어긋남 → textarea 고정
      });
      // 소프트 키보드 예측/자동수정 끄기 — 조합 상태로 글자가 붙잡혀 힌트 트리거/팝업이 깨지는 것 방지.
      try {
        var __cmIn = cm.getInputField ? cm.getInputField() : null;
        if (__cmIn && __cmIn.setAttribute) {
          __cmIn.setAttribute('autocorrect', 'off');
          __cmIn.setAttribute('autocapitalize', 'off');
          __cmIn.setAttribute('autocomplete', 'off');
          __cmIn.setAttribute('spellcheck', 'false');
        }
      } catch(e){}
      // ── 줄 번호 영역과 코드 영역을 구조적으로 분리 (VS Code 처럼) ──
      // CM 은 .CodeMirror-scroll 하나로 가로/세로를 모두 스크롤해서, 그 안의 거터는 가로 스크롤에 딸려 밀린다.
      // CM 거터는 "공간 확보 + 클릭 좌표"용으로만 두고 opacity:0 으로 숨긴 뒤(CSS),
      // 줄 번호는 .CodeMirror-scroll 밖(.CodeMirror)에 내가 직접 그린 고정 오버레이로 표시한다.
      // → 가로 스크롤이 오버레이에 구조적으로 닿지 않아 절대 안 밀린다. 세로만 translateY 로 동기화.
      var __cmEl = cm.getWrapperElement();      // .CodeMirror (가로 스크롤 안 함)
      var __scroller = cm.getScrollerElement();  // .CodeMirror-scroll (가로/세로 스크롤)
      var __og = document.createElement('div');  // 오버레이 거터(고정)
      __og.style.cssText = 'position:absolute;left:0;top:0;bottom:0;overflow:hidden;background:${bg};z-index:10;pointer-events:none;';
      var __ogIn = document.createElement('div'); // 줄 번호들(세로 스크롤만 translateY)
      __ogIn.style.cssText = 'position:absolute;left:0;top:0;width:100%;';
      __og.appendChild(__ogIn);
      __cmEl.appendChild(__og);

      // 디버그 상태: 현재 실행 줄(1-based), 브레이크포인트 집합
      var __activeLine = -1;
      var __bp = {};
      var __hlHandle = null; // addLineClass 적용된 현재 줄(제거용)

      var __gutW = function(){ var g = __cmEl.querySelector('.CodeMirror-gutters'); return g ? g.offsetWidth : 0; };
      var __renderNums = function(){
        try {
          if (!cm.getOption('lineNumbers')) { __og.style.display = 'none'; return; }
          __og.style.display = 'block';
          var w = __gutW(); __og.style.width = (w > 0 ? w : 36) + 'px';
          var lh = cm.defaultTextHeight();
          var fs = getComputedStyle(__cmEl).fontSize;   // .CodeMirror 의 실제 font-size
          var n = cm.lineCount(), html = '';
          for (var i = 0; i < n; i++) {
            var top = cm.heightAtLine(i, 'local');
            var ln = i + 1;
            var isActive = (ln === __activeLine);
            var isBp = !!__bp[ln];
            html += '<div style="position:absolute;top:' + top + 'px;right:6px;left:0;height:' + lh + 'px;line-height:' + lh + 'px;font-family:Menlo,Monaco,Consolas,monospace;font-size:' + fs + ';">';
            if (isBp) html += '<span style="position:absolute;left:3px;top:50%;transform:translateY(-50%);width:8px;height:8px;border-radius:50%;background:#E51400;"></span>';
            // 현재 실행 줄: 숫자 대신 화살표만(겹침 방지). 그 외 줄: 숫자.
            if (isActive) html += '<span style="position:absolute;right:5px;color:#FFCB6B;">▶</span>';
            else html += '<span style="position:absolute;right:6px;color:${theme === 'material-darker' ? '#545454' : '#858585'};">' + ln + '</span>';
            html += '</div>';
          }
          __ogIn.innerHTML = html;
        } catch (e2) { /* 오버레이 실패해도 에디터는 유지 */ }
      };
      var __graf = null;
      var __syncV = function(){ __graf = null; __ogIn.style.transform = 'translateY(' + (-__scroller.scrollTop) + 'px)'; };
      var __onScroll = function(){ if (__graf == null) __graf = requestAnimationFrame(__syncV); };
      __scroller.addEventListener('scroll', __onScroll, { passive: true });
      __renderNums(); __syncV();

      var t = null;
      cm.on('changes', function(){ __renderNums(); __syncV(); });
      cm.on('change', function(){
        if (t) clearTimeout(t);
        t = setTimeout(function(){ post({ type:'change', value: cm.getValue() }); }, 150);
      });
      window.__ide_insert = function(text, caret){
        cm.replaceSelection(text);
        // caret = 삽입 텍스트 끝에서의 오프셋(음수=왼쪽). 예: '=""' + caret:-1 → ="|"
        if (typeof caret === 'number' && caret !== 0) { var c0 = cm.getCursor(); cm.setCursor(CodeMirror.Pos(c0.line, c0.ch + caret)); }
        cm.focus();
        try { if (typeof __emitCtx === 'function') __emitCtx(); } catch(e){}
      };
      // 커서 이동(방향키 대체). 셀렉션 있으면 해제하고 이동.
      window.__ide_move = function(dir){
        try {
          var cmd = dir === 'left' ? 'goCharLeft' : dir === 'right' ? 'goCharRight' : dir === 'up' ? 'goLineUp' : 'goLineDown';
          cm.execCommand(cmd); cm.focus();
          if (typeof __emitCtx === 'function') __emitCtx();
        } catch(e){}
      };
      // ── 실물키보드 특수키 패널 연동: 모디파이어(vmod)/포커스/특수키/조합 ──
      var __vmods = { ctrl:false, alt:false, meta:false, shift:false };
      window.__ide_setVmods = function(m){ __vmods = m || { ctrl:false, alt:false, meta:false, shift:false }; };
      window.__ide_focus = function(){ try { cm.focus(); } catch(e){} };
      window.__ide_blur = function(){ try { var i = cm.getInputField && cm.getInputField(); if (i && i.blur) i.blur(); } catch(e){} };
      // 특수키 패널 모드: 숨은 입력창의 inputmode 를 none 으로 → cm.focus() 로 포커스(커서 표시)해도 OS 키보드가
      //  안 뜬다. 패널 키(엔터/방향 등)로 편집해도 키보드가 튀어나와 패널이 닫히는 문제를 막는다. 복귀 시 text 로.
      //  (순수 setter — 포커스/키보드는 건드리지 않는다. IDE 진입/백 등 리셋 경로에서 키보드가 안 뜨게.)
      window.__ide_setImeSuppressed = function(on){ try { var i = cm.getInputField && cm.getInputField(); if (i) i.setAttribute('inputmode', on ? 'none' : 'text'); } catch(e){} };
      // OS 키보드 복귀 전용: 이미 포커스된 입력창은 inputmode 만 text 로 바꿔선 키보드가 안 뜨므로 blur→재포커스로
      //  focus 이벤트를 재발생시켜 키보드를 다시 띄운다. (closeKbPanel 에서만 호출)
      window.__ide_refocusKeyboard = function(){ try { var i = cm.getInputField && cm.getInputField(); if (i) i.blur(); setTimeout(function(){ try { cm.focus(); } catch(e){} }, 0); } catch(e){} };
      // 원샷 특수키(esc/tab/방향/home/end/pgup/pgdn/delete/backspace/enter) — 모디파이어(mods)+OS 관례 반영.
      //  OS별 화살표 네비게이션 규약: Mac = ⌥(alt) 단어 / ⌘(meta) 줄·문서 ; Win = Ctrl 단어(+Home/End·PgUp/PgDn).
      //  once 해제는 RN 이 담당.
      window.__ide_key = function(name, m, os){
        try {
          m = m || {}; var isMac = os === 'mac';
          var word = isMac ? !!m.alt : !!(m.ctrl || m.alt); // Win 은 Ctrl 이 단어 이동
          var line = isMac && !!m.meta;                     // Mac ⌘ = 줄/문서 이동
          var doc = !!(m.ctrl || m.meta);                   // Home/End 문서 이동(양 OS 공통)
          var ext = !!m.shift;
          if (name === 'Escape') { var ca = cm.state.completionActive; if (ca && ca.close) ca.close(); else cm.execCommand('singleSelection'); cm.focus(); return; }
          if (name === 'Tab') { if (m.shift) cm.execCommand('indentLess'); else if (cm.somethingSelected()) cm.execCommand('indentMore'); else cm.execCommand('insertSoftTab'); cm.focus(); return; }
          if (name === 'Enter') { cm.execCommand('newlineAndIndent'); cm.focus(); return; }
          if (name === 'Backspace') { cm.execCommand(word ? 'delGroupBefore' : 'delCharBefore'); cm.focus(); return; }
          if (name === 'Delete') { cm.execCommand(word ? 'delGroupAfter' : 'delCharAfter'); cm.focus(); return; }
          var cmd = null;
          if (name === 'ArrowLeft') cmd = line ? 'goLineStartSmart' : (word ? 'goGroupLeft' : 'goCharLeft');
          else if (name === 'ArrowRight') cmd = line ? 'goLineEnd' : (word ? 'goGroupRight' : 'goCharRight');
          else if (name === 'ArrowUp') cmd = line ? 'goDocStart' : 'goLineUp';
          else if (name === 'ArrowDown') cmd = line ? 'goDocEnd' : 'goLineDown';
          else if (name === 'Home') cmd = doc ? 'goDocStart' : 'goLineStartSmart';
          else if (name === 'End') cmd = doc ? 'goDocEnd' : 'goLineEnd';
          else if (name === 'PageUp') cmd = 'goPageUp';
          else if (name === 'PageDown') cmd = 'goPageDown';
          if (cmd) {
            if (ext && cm.setExtending) cm.setExtending(true);
            cm.execCommand(cmd);
            if (ext && cm.setExtending) cm.setExtending(false);
            cm.focus(); if (typeof __emitCtx === 'function') __emitCtx();
          }
        } catch(e){}
      };
      // 모디파이어(ctrl/alt/meta) + 글자 → 단축키. OS 키보드 타이핑을 beforeChange 로 가로챈다(Android IME 안전).
      var __dupLine = function(){ try { var c = cm.getCursor(); var s = cm.getLine(c.line); cm.replaceRange(s + '\\n', CodeMirror.Pos(c.line, 0)); cm.setCursor(CodeMirror.Pos(c.line + 1, c.ch)); } catch(e){} };
      // 복사/잘라내기/붙여넣기 — data: origin WebView 은 navigator.clipboard 가 없음 → RN 네이티브 클립보드로 라우팅.
      //  copy/cut: 선택 텍스트를 RN 에 post → RN 이 Clipboard.setString. cut 은 여기서 선택 제거.
      //  paste: RN 에 요청 post → RN 이 Clipboard.getString → __ide_insert 로 주입.
      var __clip = function(cut){
        try {
          var sel = cm.getSelection(); if (!sel) return;
          post({ type:'clip', op:'write', text: sel });
          if (cut) cm.replaceSelection('');
          cm.focus();
        } catch(e){}
      };
      var __paste = function(){ try { post({ type:'clip', op:'read' }); } catch(e){} };
      // 단축키 실행(글자→명령 매핑). 버튼 탭 및 조합키 가로채기가 공용으로 사용.
      //  action = 단축키 글자(a/z/y/c/x/v/s/d) 또는 이름.
      window.__ide_shortcut = function(action){
        try {
          var a = (action || '').toLowerCase();
          if (a === 'a' || a === 'selectall') cm.execCommand('selectAll');
          else if (a === 'z' || a === 'undo') cm.execCommand('undo');
          else if (a === 'y' || a === 'redo') cm.execCommand('redo');
          else if (a === 's' || a === 'save') post({ type:'shortcut', action:'save' });
          else if (a === 'f' || a === 'find') post({ type:'shortcut', action:'find' });
          else if (a === 'd' || a === 'dup') __dupLine();
          else if (a === 'c' || a === 'copy') __clip(false);
          else if (a === 'x' || a === 'cut') __clip(true);
          else if (a === 'v' || a === 'paste') __paste();
          cm.focus();
        } catch(e){}
      };
      // ── 실제 조합키 가로채기(터미널과 동일 원리) ──
      // 특수키 패널에서 Ctrl/⌘ 를 잠근 뒤 OS 키보드로 글자를 치면 → 그 글자를 "단축키"로 실행.
      // CM 의 beforeChange(문서 레벨)는 삼성 IME 단어조합(removed=["asdf"])에 오염되므로 쓰지 않고,
      // 터미널처럼 CM 의 숨은 textarea 의 input 델타를 캡처 단계에서 직접 가로챈다(조합 안전).
      var __cmIn2 = (cm.getInputField && cm.getInputField()) || null;
      var __cmBuf = '';
      var __cmActive = function(){ return !!(__vmods && (__vmods.ctrl || __vmods.meta)); };
      var __resetCmIn = function(){
        __cmBuf = '';
        try { if (__cmIn2) __cmIn2.value = ''; } catch(e){}
        // CM 이 뒤늦게 poll 로 textarea 를 읽어 글자를 삽입하지 않도록 내부 입력상태 리셋.
        try { if (cm.display && cm.display.input && cm.display.input.reset) cm.display.input.reset(); } catch(e){}
        // reset() 은 선택이 있으면 textarea 에 선택 전체를 넣으므로, 델타 기준선을 그 값에 맞춰 스냅샷(스테일 방지).
        try { if (__cmIn2) __cmBuf = (__cmIn2.value || ''); } catch(e){}
      };
      var __chordAt = 0; // 직전 chord 시각 — 조합 꼬리(뒤따르는 IME input) 억제용
      // 글자 하나를 현재 모디파이어와 함께 단축키로 실행. 실행 후 RN 에 once 모디파이어 해제 통지.
      var __runVmodChord = function(ch){
        var c = (ch || '').toLowerCase();
        if (!/[a-z]/.test(c)) return;
        if (c === 'z' && __vmods.shift) window.__ide_shortcut('y'); // ⌘⇧Z = redo
        else window.__ide_shortcut(c);
        __chordAt = Date.now();
        post({ type:'vmodConsume' });
      };
      if (__cmIn2) {
        // modifier 활성 중엔 CM 이 IME 조합 처리에 진입하지 못하게 composition 이벤트를 캡처 단계에서 차단.
        //  (조합 중 CM 명령 실행 시 CM 의 composition 처리기가 명령/선택을 되돌리는 문제 방지)
        ['compositionstart','compositionupdate','compositionend'].forEach(function(evt){
          __cmIn2.addEventListener(evt, function(e){ if (__cmActive()) { e.stopImmediatePropagation(); } }, true);
        });
        // 하드웨어 키보드: 실제 Ctrl/⌘ 가 눌린 keydown 은 즉시 처리(패널 잠금 없이도 동작).
        //  소프트키보드(패널 vmod)는 keyCode 229/조합이라 keydown 이 아니라 아래 input 경로로 처리
        //  → 여기서 vmod 를 보지 않아 keydown+input 이중 실행이 원천 방지됨(터미널과 동일 구조).
        __cmIn2.addEventListener('keydown', function(e){
          if (!(e.ctrlKey || e.metaKey)) return;
          if (e.key && e.key.length === 1 && /[a-zA-Z]/.test(e.key)) {
            e.preventDefault(); e.stopImmediatePropagation();
            if (e.key.toLowerCase() === 'z' && e.shiftKey) window.__ide_shortcut('y');
            else window.__ide_shortcut(e.key);
            post({ type:'vmodConsume' });
            __resetCmIn();
          }
        }, true);
        // 비조합 입력(insertText): 취소 가능 → preventDefault 로 가장 깔끔하게 처리.
        __cmIn2.addEventListener('beforeinput', function(e){
          if (!__cmActive()) return;
          if (e.inputType === 'insertText' && e.data && e.data.length === 1 && /[a-zA-Z]/.test(e.data)) {
            e.preventDefault(); e.stopImmediatePropagation();
            __runVmodChord(e.data); __resetCmIn();
          }
        }, true);
        // 조합 입력 포함 폴백: textarea 값의 증가분(tail)만 보고 단축키로 처리(삼성 IME 안전).
        __cmIn2.addEventListener('input', function(e){
          if (!__cmActive()) { __cmBuf = (__cmIn2.value || ''); return; }
          e.stopImmediatePropagation();                 // CM 이 같은 입력을 문서에 반영하지 못하게
          // 직전 chord 의 조합 꼬리(IME 가 뒤늦게 보내는 input)는 무시 — ⌘A 선택이 곧바로 풀리는 것 방지.
          if (Date.now() - __chordAt < 220) { __resetCmIn(); return; }
          var v = __cmIn2.value || '';
          var i = 0, n = Math.min(v.length, __cmBuf.length);
          while (i < n && v.charAt(i) === __cmBuf.charAt(i)) i++;
          var tail = v.slice(i);
          if (tail.length >= 1) {
            var ch = tail.charAt(tail.length - 1);
            if (/[a-zA-Z]/.test(ch)) { __runVmodChord(ch); }
          }
          __resetCmIn();
        }, true);
      }
      // vmod 가 켜지는 순간 델타 기준선을 현재 textarea 로 스냅샷(스테일 방지).
      var __ide_setVmods_inner = window.__ide_setVmods;
      window.__ide_setVmods = function(m){
        __ide_setVmods_inner(m);
        try { if (__cmIn2 && __cmActive()) __cmBuf = (__cmIn2.value || ''); } catch(e){}
      };
      // 에이전트 편집 동기화: 내용 통째 교체(커서/스크롤 유지 시도). change 이벤트는 동일값이라 무한루프 없음.
      window.__ide_setValue = function(text){
        try {
          if (cm.getValue() === text) return;
          var pos = cm.getCursor();
          var sc = __scroller.scrollTop;
          cm.setValue(text);
          try { cm.setCursor(pos); } catch(e){}
          try { __scroller.scrollTop = sc; } catch(e){}
          __renderNums(); __syncV();
        } catch(e){}
      };
      window.__ide_setWrap = function(w){ cm.setOption('lineWrapping', !!w); setTimeout(function(){ __renderNums(); __syncV(); }, 0); };
      window.__ide_setLineNumbers = function(b){ cm.setOption('lineNumbers', !!b); setTimeout(function(){ __renderNums(); __syncV(); }, 0); };
      window.__ide_setFont = function(px){ var el=document.querySelector('.CodeMirror'); if(el){ el.style.fontSize = px + 'px'; } cm.refresh(); setTimeout(function(){ __renderNums(); __syncV(); }, 0); };

      // ── 디버그/하이라이트 브리지 ──
      var __hlMarks = []; // setHighlights 로 만든 markText 핸들들(다음 set/clear 시 해제)
      var __clearHl = function(){ for (var i=0;i<__hlMarks.length;i++){ try { __hlMarks[i].clear(); } catch(e){} } __hlMarks = []; };
      // 현재 실행 줄 하이라이트(1-based). 에디터 배경 + 거터 화살표/색.
      window.__ide_highlightLine = function(n){
        try {
          if (__hlHandle != null) { try { cm.removeLineClass(__hlHandle,'background','cpt-debug-line'); } catch(e){} }
          __activeLine = n;
          if (n >= 1 && n <= cm.lineCount()) {
            __hlHandle = cm.addLineClass(n-1,'background','cpt-debug-line');
            cm.scrollIntoView({ line: n-1, ch: 0 }, 80);
          } else { __hlHandle = null; }
          __renderNums(); __syncV();
        } catch(e){}
      };
      window.__ide_clearHighlight = function(){
        try {
          if (__hlHandle != null) { try { cm.removeLineClass(__hlHandle,'background','cpt-debug-line'); } catch(e){} }
          __hlHandle = null; __activeLine = -1; __renderNums(); __syncV();
        } catch(e){}
      };
      // 검색 결과 등에서 특정 (line, col) 로 커서 이동 + 스크롤 + 잠깐 줄 강조(키보드는 안 띄움).
      window.__ide_gotoLine = function(line, col){
        try {
          var ln = (line|0) - 1; if (ln < 0) ln = 0; if (ln > cm.lineCount()-1) ln = cm.lineCount()-1;
          var ch = (col|0) > 0 ? (col|0) - 1 : 0;
          cm.setCursor({ line: ln, ch: ch });
          cm.scrollIntoView({ line: ln, ch: ch }, 120);
          var h = cm.addLineClass(ln, 'background', 'cpt-goto-line');
          setTimeout(function(){ try { cm.removeLineClass(h, 'background', 'cpt-goto-line'); } catch(e){} }, 1300);
          __renderNums(); __syncV();
        } catch(e){}
      };
      // ── 파일 내 찾기/바꾸기(에디터 로컬) — searchcursor 애드온 없이 라인스캔 + markText 로 직접 구현 ──
      //  프로젝트 검색(데몬 grep)과 별개. 소스(cloud/daemon) 무관하게 현재 파일 안에서 동작.
      var __findMarks = [];        // 전체 매치(현재 제외) 강조 핸들
      var __findCurMark = null;    // 현재 매치 강조 핸들
      var __findMatches = [];      // [{from:{line,ch}, to:{line,ch}}]
      var __findIdx = -1, __findQ = '', __findCase = false;
      var __clearFindMarks = function(){
        for (var i=0;i<__findMarks.length;i++){ try { __findMarks[i].clear(); } catch(e){} }
        __findMarks = [];
        if (__findCurMark){ try { __findCurMark.clear(); } catch(e){} __findCurMark = null; }
      };
      var __postFind = function(){ post({ type:'find', idx: __findMatches.length ? __findIdx + 1 : 0, total: __findMatches.length }); };
      // 문서 전체를 라인별로 스캔해 리터럴 매치 위치 수집(대소문자 옵션).
      var __scanMatches = function(q, cs){
        var res = [];
        if (!q) return res;
        var needle = cs ? q : q.toLowerCase();
        var n = cm.lineCount();
        for (var ln=0; ln<n; ln++){
          var line = cm.getLine(ln) || '';
          var hay = cs ? line : line.toLowerCase();
          var from = 0, pos;
          while ((pos = hay.indexOf(needle, from)) !== -1){
            res.push({ from:{ line:ln, ch:pos }, to:{ line:ln, ch:pos + q.length } });
            from = pos + (needle.length || 1);
            if (res.length > 5000) return res;   // 폭주 방지
          }
        }
        return res;
      };
      var __renderFindMarks = function(){
        __clearFindMarks();
        for (var i=0;i<__findMatches.length;i++){
          if (i === __findIdx) continue;   // 현재 매치는 아래에서 별도 강조
          try { __findMarks.push(cm.markText(__findMatches[i].from, __findMatches[i].to, { className:'cpt-find-match' })); } catch(e){}
        }
        if (__findIdx >= 0 && __findIdx < __findMatches.length){
          var c = __findMatches[__findIdx];
          try { __findCurMark = cm.markText(c.from, c.to, { className:'cpt-find-current' }); } catch(e){}
          // 커서/스크롤만 이동 — setSelection(선택) 대신 setCursor 로 커스텀 선택툴바가 안 뜨게. focus() 도 안 함
          //  (RN 검색바 입력 유지, OS 키보드 안 튐). 치환은 __findMatches 좌표를 직접 쓰므로 선택 불필요.
          try { cm.setCursor(c.from); cm.scrollIntoView({ from:c.from, to:c.to }, 120); } catch(e){}
        }
      };
      window.__ide_find = function(query, opts){
        try {
          __findQ = query || ''; __findCase = !!(opts && opts.caseSensitive);
          __findMatches = __scanMatches(__findQ, __findCase);
          __findIdx = __findMatches.length ? 0 : -1;
          __renderFindMarks(); __postFind();
        } catch(e){}
      };
      window.__ide_findNext = function(){
        try { if (!__findMatches.length) return; __findIdx = (__findIdx + 1) % __findMatches.length; __renderFindMarks(); __postFind(); } catch(e){}
      };
      window.__ide_findPrev = function(){
        try { if (!__findMatches.length) return; __findIdx = (__findIdx - 1 + __findMatches.length) % __findMatches.length; __renderFindMarks(); __postFind(); } catch(e){}
      };
      window.__ide_replaceCurrent = function(text){
        try {
          if (__findIdx < 0 || __findIdx >= __findMatches.length) return;
          var m = __findMatches[__findIdx], keep = __findIdx;
          cm.replaceRange(text || '', m.from, m.to);
          __findMatches = __scanMatches(__findQ, __findCase);   // 좌표 재계산
          __findIdx = __findMatches.length ? Math.min(keep, __findMatches.length - 1) : -1;
          __renderFindMarks(); __postFind();
        } catch(e){}
      };
      window.__ide_replaceAll = function(text){
        try {
          if (!__findMatches.length) return;
          var rep = text || '';
          cm.operation(function(){                              // 뒤에서 앞으로 → 앞 매치 좌표 불변, undo 1스텝
            for (var i=__findMatches.length-1; i>=0; i--){ cm.replaceRange(rep, __findMatches[i].from, __findMatches[i].to); }
          });
          __findMatches = __scanMatches(__findQ, __findCase);   // rep 에 needle 있을 수 있어 재스캔
          __findIdx = __findMatches.length ? 0 : -1;
          __renderFindMarks(); __postFind();
        } catch(e){}
      };
      window.__ide_clearSearch = function(){
        try { __clearFindMarks(); __findMatches = []; __findIdx = -1; __findQ = ''; __postFind(); } catch(e){}
      };
      // 관리자 지정 하이라이트 구간 적용. ranges: [{startLine,startColumn,endLine,endColumn}] (1-based, Monaco 규약).
      window.__ide_setHighlights = function(ranges){
        try {
          __clearHl();
          var arr = ranges || [];
          for (var i=0;i<arr.length;i++) {
            var r = arr[i];
            var m = cm.markText(
              { line: (r.startLine|0)-1, ch: (r.startColumn|0)-1 },
              { line: (r.endLine|0)-1,   ch: (r.endColumn|0)-1 },
              { className: 'cpt-hl-range' }
            );
            __hlMarks.push(m);
          }
          if (arr.length) cm.scrollIntoView({ line: (arr[0].startLine|0)-1, ch: 0 }, 120);
        } catch(e){}
      };
      window.__ide_setBreakpoints = function(lines){
        try { __bp = {}; (lines||[]).forEach(function(l){ __bp[l] = true; }); __renderNums(); __syncV(); } catch(e){}
      };
      // 거터 클릭 → 브레이크포인트 토글 요청(상위 RN 이 집합 관리 후 setBreakpoints 로 반영)
      cm.on('gutterClick', function(c, line){ post({ type:'breakpointToggle', line: line + 1 }); });

      // ── 선택 범위 → RN (Agent "들어가는 선": 선택 코드 프롬프트 주입) ──
      var __selT = null, __lastSel = '';
      var __emitSel = function(){
        try {
          if (cm.somethingSelected()) {
            var r = cm.listSelections()[0];
            var a = r.anchor, h = r.head;
            var s = (a.line < h.line || (a.line === h.line && a.ch <= h.ch)) ? a : h;
            var e = (s === a) ? h : a;
            post({ type:'selection', startLine: s.line + 1, endLine: e.line + 1, code: cm.getSelection() });
            __lastSel = '1';
          } else if (__lastSel) {
            post({ type:'selection', startLine: 0, endLine: 0, code: '' });
            __lastSel = '';
          }
        } catch(e){}
      };
      cm.on('cursorActivity', function(){ if (__selT) clearTimeout(__selT); __selT = setTimeout(__emitSel, 120); });

      // ── 자동완성(show-hint): 언어 키워드 + 현재 파일 식별자 ──
      var __kw = {
        javascript: ['const','let','var','function','return','if','else','for','while','do','switch','case','break','continue','class','extends','new','this','super','import','export','default','from','async','await','try','catch','finally','throw','typeof','instanceof','yield','static','null','undefined','true','false','console','document','window','Math','JSON','Object','Array','String','Number','Boolean','Promise','setTimeout','setInterval','addEventListener','querySelector','getElementById'],
        python: ['def','return','if','elif','else','for','while','break','continue','class','import','from','as','pass','lambda','try','except','finally','raise','with','yield','global','nonlocal','True','False','None','and','or','not','in','is','print','len','range','int','str','float','list','dict','set','tuple','self','async','await','enumerate','zip','map','filter'],
        htmlmixed: ['html','head','body','div','span','class','id','style','script','link','meta','title','href','src','button','input','form','label','section','header','footer','nav','main','article','aside','ul','ol','li','table','tr','td','th','img','video','audio','canvas','svg','width','height','alt','type','value','placeholder'],
        css: ['color','background','background-color','margin','margin-top','margin-bottom','padding','border','border-radius','width','height','display','flex','grid','position','absolute','relative','fixed','top','left','right','bottom','font-size','font-weight','font-family','line-height','text-align','justify-content','align-items','flex-direction','gap','box-shadow','transition','transform','opacity','z-index','overflow','cursor','content'],
        java: ['public','private','protected','class','interface','extends','implements','static','final','void','int','long','double','float','boolean','char','byte','short','String','new','return','if','else','for','while','do','switch','case','default','break','continue','try','catch','finally','throw','throws','import','package','this','super','null','true','false','abstract','synchronized','volatile','transient','instanceof','enum','System','out','println','print','List','Map','Set','ArrayList','HashMap','Integer','Long','Double','Boolean','Object','Override','Exception','length','equals','toString'],
      };
      // typescript 는 javascript 키워드 + 타입 키워드 보강
      __kw.typescript = (__kw.javascript || []).concat(['interface','type','enum','namespace','declare','implements','readonly','abstract','public','private','protected','keyof','as','satisfies','unknown','never','any','void','number','string','boolean']);
      // c / cpp 는 CM 모드가 없어(plaintext) 식별자만 떴음 → 키워드 목록 보강.
      __kw.c = ['#include','#define','#ifdef','#ifndef','#endif','int','char','float','double','void','long','short','unsigned','signed','struct','union','enum','typedef','const','static','extern','register','volatile','return','if','else','for','while','do','switch','case','default','break','continue','goto','sizeof','printf','scanf','malloc','calloc','realloc','free','NULL','main','FILE','fopen','fclose','fprintf','fscanf','strlen','strcpy','strncpy','strcmp','strcat','memcpy','memset'];
      __kw.cpp = (__kw.c || []).concat(['class','public','private','protected','virtual','override','final','template','typename','namespace','using','new','delete','this','nullptr','bool','true','false','try','catch','throw','std','string','vector','map','unordered_map','set','pair','cout','cin','cerr','endl','auto','constexpr','inline','friend','operator','explicit','mutable','static_cast','dynamic_cast','reinterpret_cast','const_cast','shared_ptr','unique_ptr','make_shared','make_unique']);
      var __modeName = function(){ var m = cm.getOption('mode'); if (!m) return ''; return (typeof m === 'string') ? m : (m.name || ''); };
      // 파일 언어(확장자 기반) 정규화 — CM 모드가 plaintext(java/ts 등)여도 키워드 선택 가능.
      var __rawLang = ${JSON.stringify((language || '').toLowerCase())};
      var __normLang = function(l){
        l = (l || '').toLowerCase();
        if (l==='js'||l==='jsx'||l==='mjs'||l==='cjs'||l==='javascript') return 'javascript';
        if (l==='ts'||l==='tsx'||l==='typescript') return 'typescript';
        if (l==='py'||l==='python') return 'python';
        if (l==='htm'||l==='html'||l==='htmlmixed') return 'htmlmixed';
        if (l==='css'||l==='scss'||l==='less') return 'css';
        if (l==='java') return 'java';
        if (l==='c'||l==='h') return 'c';
        if (l==='cpp'||l==='cc'||l==='cxx'||l==='c++'||l==='hpp') return 'cpp';
        return l;
      };
      var __langKey = function(){ return __normLang(__rawLang) || __modeName(); };
      // 현재 파일 식별자 수집(prefix 필터). 모든 언어 공통.
      var __collectWords = function(cmi, prefix, exclude){
        var text = cmi.getValue(), re = /[A-Za-z_$][\\w$]*/g, m, cnt = 0, seen = {}, out = [];
        while ((m = re.exec(text)) && cnt < 8000) { cnt++;
          var w = m[0];
          if (w.length > 1 && w !== exclude && !seen[w] && (!prefix || w.slice(0, prefix.length) === prefix)) { seen[w] = 1; out.push(w); }
        }
        return out;
      };
      // 언어 디스패치 힌트: 내장 의미힌트(JS 전역·멤버 / HTML 태그·속성 / CSS 속성·값) + 키워드 + 파일 식별자.
      var __smartHint = function(cmi){
        var cur = cmi.getCursor(), tok = cmi.getTokenAt(cur);
        var key = __langKey();          // 키워드 선택(확장자 기반)
        var realMode = __modeName();    // 내장 의미힌트는 실제 CM 모드 기준
        var H = (CodeMirror && CodeMirror.hint) || {};
        var bh = null;
        if (realMode === 'javascript' || realMode === 'jsx') bh = H.javascript;
        else if (realMode === 'htmlmixed' || realMode === 'xml') bh = H.html || H.xml;
        else if (realMode === 'css') bh = H.css;
        var typed = tok.string.slice(0, cur.ch - tok.start);
        if (!/^[A-Za-z_$][\\w$]*$/.test(typed)) typed = '';
        var before = cmi.getRange(CodeMirror.Pos(cur.line, 0), cur);
        var isMember = /[A-Za-z0-9_$\\)\\]]\\s*\\.[A-Za-z_$]*$/.test(before); // obj. 또는 obj.par
        // 문자열/주석(정규식 포함: string-2) 안에서는 키워드·식별자 머지 억제 — 노이즈 방지.
        var inStrCom = /\\bstring\\b|\\bcomment\\b/.test(tok.type || '');
        var base = null;
        if (bh) { try { base = bh(cmi, { completeSingle: false }); } catch(e){ base = null; } }
        // 멤버 접근(. 뒤): 내장 의미힌트(멤버)만 — 파일 단어로 오염하지 않음. 문자열 안이면 끔.
        if (isMember) { if (inStrCom) return null; return (base && base.list && base.list.length) ? base : null; }
        // HTML/CSS: 내장(태그/속성/값) 우선, 비면 키워드+단어 폴백.
        if ((realMode === 'htmlmixed' || realMode === 'xml' || realMode === 'css') && base && base.list && base.list.length) return base;
        // 문자열/주석 안: 내장도 없으면 아무것도 띄우지 않음(키워드 스팸 방지).
        if (inStrCom) return null;
        // 일반 식별자: 내장(전역) + 언어 키워드 + 파일 식별자 머지.
        var start = cur.ch - typed.length;
        var seen = {}, list = [];
        var push = function(w){ var t = (typeof w === 'string') ? w : (w.text || w.displayText || ''); if (!t || seen[t]) return; seen[t] = 1; list.push(w); };
        if (base && base.list) { for (var i = 0; i < base.list.length; i++) push(base.list[i]); }
        var kws = __kw[key] || [];
        for (var k = 0; k < kws.length; k++) { if (!typed || kws[k].slice(0, typed.length) === typed) push(kws[k]); }
        var words = __collectWords(cmi, typed, typed);
        for (var j = 0; j < words.length; j++) push(words[j]);
        if (!list.length) return null;
        list.sort(function(a, b){ var sa = (typeof a==='string')?a:(a.text||''); var sb = (typeof b==='string')?b:(b.text||''); return sa.length - sb.length || (sa < sb ? -1 : 1); });
        if (list.length > 60) list = list.slice(0, 60);
        return { list: list, from: CodeMirror.Pos(cur.line, start), to: cur };
      };
      var __doHint = function(){
        try {
          cm.showHint({ hint: __smartHint, completeSingle: false, alignWithWord: true, closeOnUnfocus: false });
          var c = cm.state.completionActive;
          if (c) { post({ type:'hint', open: true }); if (c.on) c.on('close', function(){ post({ type:'hint', open: false }); }); }
        } catch(e){}
      };
      // 타이핑 중 자동 트리거 — 단어 2글자 이상 또는 '.'(멤버 접근) 입력 시.
      cm.on('inputRead', function(_c, ch){
        try {
          if (!ch || !ch.text) return;
          var s = ch.text.join('');
          if (cm.state.completionActive) return;
          // 문자열/주석 안에서는 자동 트리거 안 함(. 멤버 포함) — 노이즈 억제.
          var __t0 = cm.getTokenAt(cm.getCursor());
          if (/\\bstring\\b|\\bcomment\\b/.test(__t0.type || '')) return;
          if (s === '.') { __doHint(); return; }
          if (!/[A-Za-z0-9_$]/.test(s)) return;
          var cur = cm.getCursor(), tok = cm.getTokenAt(cur);
          var w = tok.string.slice(0, cur.ch - tok.start);
          if (/^[A-Za-z_$][\\w$]*$/.test(w) && w.length >= 2) __doHint();
        } catch(e){}
      });
      window.__ide_triggerHint = function(){ __doHint(); };
      // 자동완성 팝업 네비게이션(액세서리 키 → 방향키/선택/닫기). 팝업 없으면 false.
      window.__ide_hintNav = function(action){
        try {
          var ca = cm.state.completionActive;
          if (!ca) return false;
          var w = ca.widget; // 방향키 이동/선택은 widget 에 있음(Completion 객체엔 없음)
          if (action === 'up') { if (w) w.changeActive(w.selectedHint - 1); }
          else if (action === 'down') { if (w) w.changeActive(w.selectedHint + 1); }
          else if (action === 'pick') { if (w && w.pick) w.pick(); else if (ca.pick) ca.pick(); }
          else if (action === 'close') { if (ca.close) ca.close(); }
          return true;
        } catch(e){ return false; }
      };

      // ── 컨텍스트 분류기: 커서 스코프(태그 안/속성값/CSS값/JS인자 …)를 RN 으로 ──
      // 신뢰 높은 신호(tok.type)를 1차, CM 내부 state(lexical/context)는 보강. 전부 try/catch + unknown 폴백.
      var __classifyContext = function(){
        try {
          var cur = cm.getCursor();
          var tok = cm.getTokenAt(cur, true) || {};
          var modeAt = cm.getModeAt(cur);
          var inner = (modeAt && modeAt.name) || __modeName() || 'plaintext';
          var tt = (tok && tok.type) || '';
          var before = cm.getRange(CodeMirror.Pos(cur.line, 0), cur);
          var mode = (inner === 'xml' || inner === 'htmlmixed') ? 'xml'
            : (inner === 'css') ? 'css'
            : (inner === 'javascript' || inner === 'jsx') ? 'javascript'
            : (inner === 'python') ? 'python'
            : (inner === 'json') ? 'json' : 'plaintext';
          var im = null; try { im = CodeMirror.innerMode(cm.getMode(), tok.state); } catch(e){}
          var st = im && im.state;
          var out = { mode: mode, scope: 'unknown', tokenType: tt || null };

          if (mode === 'xml') {
            var openTag = ''; try { var cn = st && st.context; if (cn && cn.tagName) openTag = cn.tagName; } catch(e){}
            if (openTag) { out.tagName = openTag; out.closeTag = '</' + openTag + '>'; }
            if (/<\\/[A-Za-z0-9-]*$/.test(before)) out.scope = 'before-close';
            else if (tt === 'tag' || /<[A-Za-z0-9-]*$/.test(before)) out.scope = 'tag-open';
            else if (tt === 'string') out.scope = 'attr-value';
            else if (tt === 'attribute') out.scope = 'attr-name';
            else { var inTag = false; try { inTag = !!(st && st.tagName); } catch(e){} out.scope = inTag ? 'inside-tag' : 'tag-content'; }
          } else if (mode === 'css') {
            if (tt === 'string') out.scope = 'css-string';
            else {
              var seg = before.replace(/\\/\\*[^]*?\\*\\//g, '');
              var lastSep = Math.max(seg.lastIndexOf('{'), seg.lastIndexOf('}'), seg.lastIndexOf(';'));
              var afterSep = seg.slice(lastSep + 1);
              var inBlock = seg.lastIndexOf('{') > seg.lastIndexOf('}');
              if (!inBlock) out.scope = 'selector';
              else if (afterSep.indexOf(':') >= 0) out.scope = 'value';
              else out.scope = 'property-name';
            }
          } else if (mode === 'javascript') {
            if (tt === 'comment') out.scope = 'comment';
            else if (tt === 'string') out.scope = 'string';
            else if (tt === 'string-2') { out.scope = (((before.match(/\`/g) || []).length) % 2 === 1) ? 'template-literal' : 'regex'; }
            else if (/[A-Za-z0-9_$\\)\\]]\\s*\\.[A-Za-z_$]*$/.test(before)) out.scope = 'member-access';
            else {
              var lex = null; try { lex = st && st.lexical; } catch(e){}
              if (/(\\(|,|=|\\[|:|return)\\s*\\{[^{}]*$/.test(before)) out.scope = 'object-literal';
              else if ((lex && lex.type === ')') || /\\([^()]*$/.test(before)) out.scope = 'call-args';
              else out.scope = 'statement';
            }
          } else if (mode === 'python') {
            if (tt === 'comment') out.scope = 'comment';
            else if (tt === 'string') out.scope = 'string';
            else out.scope = 'statement';
          }
          return out;
        } catch(e) { return { mode: 'plaintext', scope: 'unknown', tokenType: null }; }
      };
      var __ctxT = null, __lastCtxKey = '';
      var __emitCtx = function(){
        try {
          var c = __classifyContext();
          var key = c.mode + '|' + c.scope + '|' + (c.tokenType || '') + '|' + (c.closeTag || '');
          if (key === __lastCtxKey) return;        // 컨텍스트 범주가 실제로 바뀔 때만 post (바 깜빡임/브리지 트래픽 방지)
          __lastCtxKey = key;
          post({ type:'ctx', mode:c.mode, scope:c.scope, tokenType:c.tokenType, tagName:c.tagName, closeTag:c.closeTag });
        } catch(e){}
      };
      cm.on('cursorActivity', function(){ if (__ctxT) clearTimeout(__ctxT); __ctxT = setTimeout(__emitCtx, 100); });

      // 포커스 즉시 RN 에 통지 → 보조바를 keyboardDidShow(느림) 전에 미리 노출(등장 지연 체감 제거).
      cm.on('focus', function(){ post({ type:'focus', focused:true }); });
      cm.on('blur', function(){ post({ type:'focus', focused:false }); });
      // 내부 터치 알림(1.2s 스로틀) — 이미 포커스된 에디터는 focus 이벤트가 다시 안 떠서,
      //  터치 자체로 "이 그룹이 활성"임을 RN 에 알린다(터미널 웹뷰와 동일 패턴).
      var __lastIx = 0;
      document.addEventListener('touchstart', function(){
        var t = Date.now();
        if (t - __lastIx > 1200) { __lastIx = t; post({ type:'interact' }); }
      }, true);

      // ── 커스텀 선택 핸들(모바일 네이티브 물방울 흉내) ──
      // CM textarea 모드는 선택을 직접 그려 OS 네이티브 핸들이 안 붙는다 → 우리가 드래그 핸들을 그린다.
      // 물방울 2개(선택 시작=꼭짓점 top-right / 끝=꼭짓점 top-left)를 position:fixed 로 그리고,
      // 터치 드래그 → coordsChar('window') → setSelection 으로 선택 확장/축소. 가장자리에선 자동 스크롤.
      (function(){
        try {
          var HS = 22, HIT = 40;      // 물방울 지름 / 터치 타깃
          var TOUCH_Y = 24;           // 손가락은 핸들 아래에 있으므로 실제 타깃은 그만큼 위
          var mkHandle = function(side){
            var box = document.createElement('div');
            box.style.cssText = 'position:fixed;left:0;top:0;width:' + HIT + 'px;height:' + HIT + 'px;z-index:60;display:none;touch-action:none;';
            var dot = document.createElement('div');
            var radius = side === 'start' ? '50% 0 50% 50%' : '0 50% 50% 50%'; // 꼭짓점: start=우상, end=좌상
            var corner = side === 'start' ? 'right:0;' : 'left:0;';
            dot.style.cssText = 'position:absolute;top:0;' + corner + 'width:' + HS + 'px;height:' + HS + 'px;background:#3B82F6;border:1px solid #1E40AF;border-radius:' + radius + ';box-shadow:0 1px 3px rgba(0,0,0,0.4);';
            box.appendChild(dot);
            document.body.appendChild(box);
            return box;
          };
          var hStart = mkHandle('start'), hEnd = mkHandle('end');

          // ── 선택 액션 툴바(복사/잘라내기/붙여넣기/전체선택) ── 네이티브 텍스트 선택 메뉴 대체.
          var menu = document.createElement('div');
          menu.style.cssText = 'position:fixed;z-index:70;display:none;flex-direction:row;align-items:center;background:#2B2F3A;border:1px solid #454B5A;border-radius:9px;box-shadow:0 3px 14px rgba(0,0,0,0.55);padding:3px;';
          var mkBtn = function(label, fn){
            var b = document.createElement('div');
            b.textContent = label;
            b.style.cssText = 'color:#E8EAED;font-family:-apple-system,Roboto,sans-serif;font-size:13px;font-weight:600;padding:8px 13px;border-radius:6px;white-space:nowrap;';
            b.addEventListener('touchstart', function(e){ e.stopPropagation(); }, { passive: true });
            b.addEventListener('touchend', function(e){ e.preventDefault(); e.stopPropagation(); try { fn(); } catch(err){} }, { passive: false });
            return b;
          };
          var sep = function(){ var s = document.createElement('div'); s.style.cssText = 'width:1px;height:20px;background:#454B5A;margin:0 1px;'; return s; };
          var hideMenu = function(){ menu.style.display = 'none'; };
          menu.appendChild(mkBtn('잘라내기', function(){ __clip(true); hideMenu(); place(); }));
          menu.appendChild(sep());
          menu.appendChild(mkBtn('복사', function(){ __clip(false); hideMenu(); }));
          menu.appendChild(sep());
          menu.appendChild(mkBtn('붙여넣기', function(){ __paste(); hideMenu(); }));
          menu.appendChild(sep());
          menu.appendChild(mkBtn('전체선택', function(){ cm.execCommand('selectAll'); cm.focus(); place(); }));
          document.body.appendChild(menu);
          var placeMenu = function(dragging){
            try {
              if (dragging || !cm.somethingSelected()) { menu.style.display = 'none'; return; }
              var r = cm.listSelections()[0]; var cf = cm.cursorCoords(r.from(), 'window');
              var rect = __cmEl.getBoundingClientRect();
              menu.style.display = 'flex';
              var mw = menu.offsetWidth, mh = menu.offsetHeight;
              var x = cf.left - mw / 2;
              x = Math.max(rect.left + 4, Math.min(x, rect.right - mw - 4));
              var y = cf.top - mh - 8;                                  // 선택 시작 위쪽
              if (y < rect.top + 4) y = cm.cursorCoords(r.to(), 'window').bottom + 34; // 공간 없으면 아래(핸들 피해)
              menu.style.left = x + 'px'; menu.style.top = y + 'px';
            } catch(e){}
          };

          var place = function(){
            try {
              if (!cm.somethingSelected()) { hStart.style.display = 'none'; hEnd.style.display = 'none'; hideMenu(); return; }
              var r = cm.listSelections()[0]; var from = r.from(), to = r.to();
              var cf = cm.cursorCoords(from, 'window'), ct = cm.cursorCoords(to, 'window');
              var rect = __cmEl.getBoundingClientRect();
              var vis = function(c){ return c.bottom > rect.top + 2 && c.top < rect.bottom - 2 && c.left >= rect.left - 2 && c.left <= rect.right + 2; };
              // start: dot 의 top-right 꼭짓점을 (cf.left, cf.bottom) 에 → box.left=cf.left-HIT, box.top=cf.bottom
              hStart.style.left = (cf.left - HIT) + 'px'; hStart.style.top = cf.bottom + 'px';
              hStart.style.display = vis(cf) ? 'block' : 'none';
              // end: dot 의 top-left 꼭짓점을 (ct.left, ct.bottom) 에 → box.left=ct.left, box.top=ct.bottom
              hEnd.style.left = ct.left + 'px'; hEnd.style.top = ct.bottom + 'px';
              hEnd.style.display = vis(ct) ? 'block' : 'none';
              placeMenu(!!drag);                                        // 드래그 중엔 숨김
            } catch(e){}
          };
          var drag = null, lastXY = null, scrollTimer = null;
          var moveTo = function(x, y){
            lastXY = { x: x, y: y };
            try { var pos = cm.coordsChar({ left: x, top: y - TOUCH_Y }, 'window'); cm.setSelection(drag.anchor, pos); place(); } catch(e){}
          };
          var edgeScroll = function(){
            if (!drag || !lastXY) return;
            var rect = __cmEl.getBoundingClientRect(), d = 0;
            if (lastXY.y < rect.top + 52) d = -16; else if (lastXY.y > rect.bottom - 52) d = 16;
            if (d) { __scroller.scrollTop += d; moveTo(lastXY.x, lastXY.y); }
          };
          var beginDrag = function(side, e){
            try {
              var r = cm.listSelections()[0];
              drag = { anchor: side === 'start' ? r.to() : r.from() }; // 반대쪽 끝 고정
              if (scrollTimer) clearInterval(scrollTimer);
              scrollTimer = setInterval(edgeScroll, 32);
              e.preventDefault(); e.stopPropagation();
            } catch(err){}
          };
          var endDrag = function(){ drag = null; lastXY = null; if (scrollTimer) { clearInterval(scrollTimer); scrollTimer = null; } place(); };
          hStart.addEventListener('touchstart', function(e){ beginDrag('start', e); }, { passive: false });
          hEnd.addEventListener('touchstart', function(e){ beginDrag('end', e); }, { passive: false });
          document.addEventListener('touchmove', function(e){ if (drag) { var t = e.touches[0]; moveTo(t.clientX, t.clientY); e.preventDefault(); } }, { passive: false });
          document.addEventListener('touchend', function(){ if (drag) endDrag(); }, { passive: false });
          document.addEventListener('touchcancel', function(){ if (drag) endDrag(); }, { passive: false });
          cm.on('cursorActivity', place);
          cm.on('scroll', place);
          cm.on('changes', place);
          window.addEventListener('resize', place);

          // ── 롱프레스 → 단어 선택(네이티브 모바일 흉내) ──
          // 손가락을 ~400ms 고정하면 그 위치의 단어를 findWordAt 로 선택 → 커스텀 핸들 등장.
          var lpTimer = null, lpXY = null;
          var cancelLp = function(){ if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } };
          __scroller.addEventListener('touchstart', function(e){
            if (drag) return;                                   // 핸들 드래그 중이면 무시
            if (!e.touches || e.touches.length !== 1) { cancelLp(); return; }
            var t = e.touches[0]; lpXY = { x: t.clientX, y: t.clientY };
            cancelLp();
            lpTimer = setTimeout(function(){
              lpTimer = null;
              try {
                if (tpStart) tpStart.lp = true; // 롱프레스(단어선택) 발동 — 탭 커서 배치는 양보
                var pos = cm.coordsChar({ left: lpXY.x, top: lpXY.y }, 'window');
                var w = cm.findWordAt(pos);
                if (w) { cm.setSelection(w.anchor, w.head); cm.focus(); place(); }
              } catch(err){}
            }, 400);
          }, { passive: true });
          __scroller.addEventListener('touchmove', function(e){
            if (!lpXY || !e.touches || !e.touches[0]) return;
            var t = e.touches[0];
            if (Math.abs(t.clientX - lpXY.x) > 10 || Math.abs(t.clientY - lpXY.y) > 10) cancelLp();
          }, { passive: true });
          __scroller.addEventListener('touchend', cancelLp, { passive: true });
          __scroller.addEventListener('touchcancel', cancelLp, { passive: true });
          document.addEventListener('contextmenu', function(e){ e.preventDefault(); }, false);

          // ── 탭 → 커서 배치 보강 ──
          // CM5 는 touchmove 가 1회라도 오면 탭을 무시하고(activeTouch.moved), 300ms 넘은 탭도 무시한다.
          // 손가락 탭은 접촉면 때문에 미세 move 가 흔하고 살짝 느린 탭도 많아 → "탭해도 커서가 안
          // 움직이는" 간헐 무반응의 근원. slop 12px 안에서 끝난 탭은 시간과 무관하게 우리가 직접 커서를
          // 놓는다(같은 좌표라 CM 자체 성공과 중복 무해). 예외 2가지만 양보:
          //  · 롱프레스(400ms) 단어선택이 발동한 터치(tp.lp)
          //  · 같은 자리(30px) 320ms 내 재탭 = 더블탭 — CM 단어선택 존중. 다른 위치의 빠른 연속 탭은 커서 이동.
          var tpStart = null, tpLast = { t: 0, x: -9999, y: -9999 };
          __scroller.addEventListener('touchstart', function(e){
            if (drag || !e.touches || e.touches.length !== 1) { tpStart = null; return; }
            var t = e.touches[0];
            tpStart = { x: t.clientX, y: t.clientY, moved: false, lp: false };
          }, { passive: true });
          __scroller.addEventListener('touchmove', function(e){
            if (!tpStart || !e.touches || !e.touches[0]) return;
            var t = e.touches[0];
            if (Math.abs(t.clientX - tpStart.x) > 12 || Math.abs(t.clientY - tpStart.y) > 12) tpStart.moved = true;
          }, { passive: true });
          __scroller.addEventListener('touchend', function(){
            var tp = tpStart; tpStart = null;
            if (!tp || tp.moved || tp.lp || drag) return;
            var now = Date.now();
            var isDoubleTap = (now - tpLast.t < 320) && Math.abs(tp.x - tpLast.x) < 30 && Math.abs(tp.y - tpLast.y) < 30;
            tpLast = { t: now, x: tp.x, y: tp.y };
            if (isDoubleTap) return;
            try {
              var pos = cm.coordsChar({ left: tp.x, top: tp.y }, 'window');
              cm.setCursor(pos); cm.focus();
            } catch(err){}
          }, { passive: true });

          place();
        } catch(e){}
      })();

      post({ type:'ready' });
      __emitCtx();
    } catch (e) {
      var ta = document.getElementById('ed'); if (ta) ta.style.display='none';
      document.getElementById('err').textContent = '에디터 초기화 오류: ' + (e && e.message ? e.message : e);
      post({ type:'error', message: String(e && e.message ? e.message : e) });
    }
  </script>
</body>
</html>`;
};

const CodeEditorWebView = forwardRef<CodeEditorHandle, CodeEditorWebViewProps>(
  ({ value, language, wrap = true, lineNumbers = true, fontSize = 14, editorWidth = 0, theme = 'vscode-dark', onChange, onReady, onBreakpointToggle, onSelectionChange, onHintToggle, onContextChange, onShortcut, onFindCount, onVmodConsume, onFocusChange, onInteract }, ref) => {
    const webRef = useRef<WebView>(null);
    // HTML 은 마운트 시 1회만 생성 — 매 렌더마다 source 가 바뀌면 WebView 가 계속 reload 되어
    // CodeMirror 초기화 전에 textarea 만 보이게 된다. 파일 전환은 상위 key={activePath} 로 remount.
    const htmlRef = useRef<string | null>(null);
    if (htmlRef.current === null) htmlRef.current = buildHtml(value, language, wrap, lineNumbers, fontSize, editorWidth, theme);

    // 설정 변경은 reload 없이 즉시 반영
    useEffect(() => {
      webRef.current?.injectJavaScript(`window.__ide_setWrap && window.__ide_setWrap(${wrap ? 'true' : 'false'}); true;`);
    }, [wrap]);
    useEffect(() => {
      webRef.current?.injectJavaScript(`window.__ide_setLineNumbers && window.__ide_setLineNumbers(${lineNumbers ? 'true' : 'false'}); true;`);
    }, [lineNumbers]);
    useEffect(() => {
      webRef.current?.injectJavaScript(`window.__ide_setFont && window.__ide_setFont(${fontSize}); true;`);
    }, [fontSize]);

    useImperativeHandle(ref, () => ({
      insertText: (text: string, caret?: number) => {
        const c = typeof caret === 'number' ? caret : 'null';
        const js = `window.__ide_insert && window.__ide_insert(${JSON.stringify(text)}, ${c}); true;`;
        webRef.current?.injectJavaScript(js);
      },
      setValue: (text: string) => {
        webRef.current?.injectJavaScript(`window.__ide_setValue && window.__ide_setValue(${JSON.stringify(text)}); true;`);
      },
      gotoLine: (line: number, col?: number) => {
        webRef.current?.injectJavaScript(`window.__ide_gotoLine && window.__ide_gotoLine(${line | 0}, ${col ? (col | 0) : 0}); true;`);
      },
      find: (query: string, opts?: { caseSensitive?: boolean }) => {
        webRef.current?.injectJavaScript(`window.__ide_find && window.__ide_find(${JSON.stringify(query || '')}, ${JSON.stringify(opts || {})}); true;`);
      },
      findNext: () => {
        webRef.current?.injectJavaScript('window.__ide_findNext && window.__ide_findNext(); true;');
      },
      findPrev: () => {
        webRef.current?.injectJavaScript('window.__ide_findPrev && window.__ide_findPrev(); true;');
      },
      replaceCurrent: (text: string) => {
        webRef.current?.injectJavaScript(`window.__ide_replaceCurrent && window.__ide_replaceCurrent(${JSON.stringify(text ?? '')}); true;`);
      },
      replaceAll: (text: string) => {
        webRef.current?.injectJavaScript(`window.__ide_replaceAll && window.__ide_replaceAll(${JSON.stringify(text ?? '')}); true;`);
      },
      clearSearch: () => {
        webRef.current?.injectJavaScript('window.__ide_clearSearch && window.__ide_clearSearch(); true;');
      },
      highlightLine: (line: number) => {
        webRef.current?.injectJavaScript(`window.__ide_highlightLine && window.__ide_highlightLine(${line | 0}); true;`);
      },
      clearHighlight: () => {
        webRef.current?.injectJavaScript(`window.__ide_clearHighlight && window.__ide_clearHighlight(); true;`);
      },
      setHighlights: (ranges: HighlightRange[]) => {
        webRef.current?.injectJavaScript(`window.__ide_setHighlights && window.__ide_setHighlights(${JSON.stringify(ranges || [])}); true;`);
      },
      setBreakpoints: (lines: number[]) => {
        webRef.current?.injectJavaScript(`window.__ide_setBreakpoints && window.__ide_setBreakpoints(${JSON.stringify(lines || [])}); true;`);
      },
      triggerHint: () => {
        webRef.current?.injectJavaScript('window.__ide_triggerHint && window.__ide_triggerHint(); true;');
      },
      hintNav: (action) => {
        webRef.current?.injectJavaScript(`window.__ide_hintNav && window.__ide_hintNav(${JSON.stringify(action)}); true;`);
      },
      moveCursor: (dir) => {
        webRef.current?.injectJavaScript(`window.__ide_move && window.__ide_move(${JSON.stringify(dir)}); true;`);
      },
      setVmods: (flags) => {
        webRef.current?.injectJavaScript(`window.__ide_setVmods && window.__ide_setVmods(${JSON.stringify(flags || {})}); true;`);
      },
      applyKey: (name, mods, os) => {
        webRef.current?.injectJavaScript(`window.__ide_key && window.__ide_key(${JSON.stringify(name)}, ${JSON.stringify(mods || {})}, ${JSON.stringify(os || 'win')}); true;`);
      },
      runShortcut: (action) => {
        webRef.current?.injectJavaScript(`window.__ide_shortcut && window.__ide_shortcut(${JSON.stringify(action)}); true;`);
      },
      focus: () => {
        webRef.current?.injectJavaScript('window.__ide_focus && window.__ide_focus(); true;');
      },
      blur: () => {
        webRef.current?.injectJavaScript('window.__ide_blur && window.__ide_blur(); true;');
      },
      setImeSuppressed: (on) => {
        webRef.current?.injectJavaScript(`window.__ide_setImeSuppressed && window.__ide_setImeSuppressed(${on ? 'true' : 'false'}); true;`);
      },
      refocusKeyboard: () => {
        webRef.current?.injectJavaScript('window.__ide_refocusKeyboard && window.__ide_refocusKeyboard(); true;');
      },
    }), []);

    const onMessage = useCallback((e: any) => {
      try {
        const msg = JSON.parse(e.nativeEvent.data);
        if (msg.type === 'change') onChange(msg.value);
        else if (msg.type === 'ready') onReady?.();
        else if (msg.type === 'breakpointToggle') onBreakpointToggle?.(msg.line);
        else if (msg.type === 'selection') onSelectionChange?.({ startLine: msg.startLine, endLine: msg.endLine, code: msg.code });
        else if (msg.type === 'error') console.warn('[CodeEditor]', msg.message);
        else if (msg.type === 'hint') onHintToggle?.(!!msg.open);
        else if (msg.type === 'ctx') onContextChange?.({ mode: msg.mode, scope: msg.scope, tokenType: msg.tokenType ?? null, tagName: msg.tagName, closeTag: msg.closeTag });
        else if (msg.type === 'shortcut') onShortcut?.(msg.action);
        else if (msg.type === 'find') onFindCount?.({ idx: msg.idx | 0, total: msg.total | 0 });
        else if (msg.type === 'clip') {
          // WebView(data: origin)엔 클립보드가 없어 RN 네이티브 Clipboard 로 라우팅.
          if (msg.op === 'write') { try { Clipboard.setString(String(msg.text ?? '')); } catch (_) { /* noop */ } }
          else if (msg.op === 'read') {
            Promise.resolve(Clipboard.getString()).then((t) => {
              if (t) webRef.current?.injectJavaScript(`window.__ide_insert && window.__ide_insert(${JSON.stringify(t)}); true;`);
            }).catch(() => { /* noop */ });
          }
        }
        else if (msg.type === 'vmodConsume') onVmodConsume?.();
        else if (msg.type === 'focus') onFocusChange?.(!!msg.focused);
        else if (msg.type === 'interact') onInteract?.();
      } catch (_) { /* noop */ }
    }, [onChange, onReady, onBreakpointToggle, onSelectionChange, onHintToggle, onContextChange, onShortcut, onFindCount, onVmodConsume, onFocusChange, onInteract]);

    return (
      <WebView
        ref={webRef}
        originWhitelist={['*']}
        source={{ html: htmlRef.current }}
        onMessage={onMessage}
        // 부드러운 스크롤을 위해 하드웨어 가속(software layer 제거)
        overScrollMode="always"
        nestedScrollEnabled
        keyboardDisplayRequiresUserAction={false}
        hideKeyboardAccessoryView
        style={{ flex: 1, backgroundColor: '#1E1E1E' }}
      />
    );
  },
);

CodeEditorWebView.displayName = 'CodeEditorWebView';
export default CodeEditorWebView;
