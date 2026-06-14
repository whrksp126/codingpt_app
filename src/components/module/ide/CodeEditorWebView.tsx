import React, { forwardRef, useImperativeHandle, useRef, useCallback, useEffect } from 'react';
import { WebView } from 'react-native-webview';
import { CM_CSS, CM_JS } from './codemirrorAssets';

// CodeMirror 를 앱 번들에 인라인 — 외부 CDN/백엔드 의존 없이 항상 렌더(오프라인 LAN 환경 대비).
// 파일 내용은 <script> 가 아니라 <textarea> 에 HTML-이스케이프해서 넣는다.
//  → 콘텐츠에 </script> 나 </textarea> 가 있어도 깨지지 않음.
// 테마는 VS Code "Dark+" 색을 흉내낸 커스텀 테마(vscode-dark).

export interface CodeEditorHandle {
  insertText: (text: string) => void;
  /** 에디터 내용을 통째로 교체(에이전트 편집 동기화). 커서 유지 시도 */
  setValue: (text: string) => void;
  /** 디버그 현재 실행 줄 하이라이트 (1-based) */
  highlightLine: (line: number) => void;
  /** 현재 실행 줄 하이라이트 제거 */
  clearHighlight: () => void;
  /** 관리자 지정 하이라이트 구간 적용 (Monaco 1-based range, 여러 구간) */
  setHighlights: (ranges: HighlightRange[]) => void;
  /** 브레이크포인트 줄 목록 반영 (1-based) */
  setBreakpoints: (lines: number[]) => void;
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
  onChange: (value: string) => void;
  onReady?: () => void;
  /** 거터 클릭으로 브레이크포인트 토글 요청 (1-based line) */
  onBreakpointToggle?: (line: number) => void;
  /** 코드 선택 변경 (Agent 프롬프트 주입용). 선택 없으면 code:'' */
  onSelectionChange?: (sel: { startLine: number; endLine: number; code: string }) => void;
}

// CodeMirror 의 mode 옵션에 그대로 들어갈 JS 표현식 문자열을 반환(문자열 모드는 반드시 따옴표).
const modeFor = (language: string) => {
  switch ((language || '').toLowerCase()) {
    case 'html': return "'htmlmixed'";
    case 'css': return "'css'";
    case 'javascript': case 'js': return "'javascript'";
    case 'json': return '{name:"javascript",json:true}';
    case 'python': case 'py': return "'python'";
    case 'xml': return "'xml'";
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
  .cm-s-vscode-dark .cpt-hl-range { background:rgba(250,204,21,0.22); border-radius:2px; }
  #err { color:#F87171; font-family:monospace; font-size:12px; padding:12px; white-space:pre-wrap; }
`;

const buildHtml = (value: string, language: string, wrap: boolean, lineNumbers: boolean, fontSize: number, editorWidth: number) => {
  const mode = modeFor(language);
  const widthCss = editorWidth && editorWidth > 0
    ? `.CodeMirror { width:${editorWidth}px; } body { min-width:${editorWidth}px; }`
    : '';
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <style>${CM_CSS}</style>
  <script>${CM_JS}</script>
  <style>${VSCODE_THEME_CSS}</style>
  <style>.CodeMirror { font-size:${fontSize}px; } ${widthCss}</style>
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
        theme: 'vscode-dark',
        lineNumbers: ${lineNumbers ? 'true' : 'false'},
        lineWrapping: ${wrap ? 'true' : 'false'},
        fixedGutter: true,
        viewportMargin: Infinity,
        autofocus: false,
      });
      // ── 줄 번호 영역과 코드 영역을 구조적으로 분리 (VS Code 처럼) ──
      // CM 은 .CodeMirror-scroll 하나로 가로/세로를 모두 스크롤해서, 그 안의 거터는 가로 스크롤에 딸려 밀린다.
      // CM 거터는 "공간 확보 + 클릭 좌표"용으로만 두고 opacity:0 으로 숨긴 뒤(CSS),
      // 줄 번호는 .CodeMirror-scroll 밖(.CodeMirror)에 내가 직접 그린 고정 오버레이로 표시한다.
      // → 가로 스크롤이 오버레이에 구조적으로 닿지 않아 절대 안 밀린다. 세로만 translateY 로 동기화.
      var __cmEl = cm.getWrapperElement();      // .CodeMirror (가로 스크롤 안 함)
      var __scroller = cm.getScrollerElement();  // .CodeMirror-scroll (가로/세로 스크롤)
      var __og = document.createElement('div');  // 오버레이 거터(고정)
      __og.style.cssText = 'position:absolute;left:0;top:0;bottom:0;overflow:hidden;background:#1E1E1E;z-index:10;pointer-events:none;';
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
            else html += '<span style="position:absolute;right:6px;color:#858585;">' + ln + '</span>';
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
      window.__ide_insert = function(text){ cm.replaceSelection(text); cm.focus(); };
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

      post({ type:'ready' });
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
  ({ value, language, wrap = true, lineNumbers = true, fontSize = 14, editorWidth = 0, onChange, onReady, onBreakpointToggle, onSelectionChange }, ref) => {
    const webRef = useRef<WebView>(null);
    // HTML 은 마운트 시 1회만 생성 — 매 렌더마다 source 가 바뀌면 WebView 가 계속 reload 되어
    // CodeMirror 초기화 전에 textarea 만 보이게 된다. 파일 전환은 상위 key={activePath} 로 remount.
    const htmlRef = useRef<string | null>(null);
    if (htmlRef.current === null) htmlRef.current = buildHtml(value, language, wrap, lineNumbers, fontSize, editorWidth);

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
      insertText: (text: string) => {
        const js = `window.__ide_insert && window.__ide_insert(${JSON.stringify(text)}); true;`;
        webRef.current?.injectJavaScript(js);
      },
      setValue: (text: string) => {
        webRef.current?.injectJavaScript(`window.__ide_setValue && window.__ide_setValue(${JSON.stringify(text)}); true;`);
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
    }), []);

    const onMessage = useCallback((e: any) => {
      try {
        const msg = JSON.parse(e.nativeEvent.data);
        if (msg.type === 'change') onChange(msg.value);
        else if (msg.type === 'ready') onReady?.();
        else if (msg.type === 'breakpointToggle') onBreakpointToggle?.(msg.line);
        else if (msg.type === 'selection') onSelectionChange?.({ startLine: msg.startLine, endLine: msg.endLine, code: msg.code });
        else if (msg.type === 'error') console.warn('[CodeEditor]', msg.message);
      } catch (_) { /* noop */ }
    }, [onChange, onReady, onBreakpointToggle, onSelectionChange]);

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
