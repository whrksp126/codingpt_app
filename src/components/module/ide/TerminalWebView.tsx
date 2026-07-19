import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { WebView } from 'react-native-webview';
import { Clipboard } from 'react-native';
import { useDisplayScale } from '../../../utils/displayScaleSetting';

// 실시간 인터랙티브 터미널 — xterm.js + WebSocket(백엔드 PTY).
//  · 키 입력/방향키/Tab/Ctrl-C 는 xterm onData → ws(binary) → 서버 셸 stdin.
//  · 서버 셸 raw 출력(ANSI/readline/탭완성)은 ws → term.write 그대로.
//  · 리사이즈는 fit 후 {type:'resize',cols,rows} 텍스트 메시지.
// xterm 은 lessons Terminal.tsx 와 동일하게 unpkg 인라인(버전 고정). 터미널은 서버 연결 필수라 CDN 허용.

export interface TerminalHandle {
  /** PTY stdin 으로 키/바이트 전송(액세서리 키: Ctrl-C=\x03, 방향키 등) */
  sendKey: (s: string) => void;
  /** 화면에만 표시(에이전트 Bash 로그 등 — 셸 입력 아님). \n 은 \r\n 으로 정규화 */
  write: (text: string) => void;
  /** 화면 지우기 */
  clear: () => void;
  /** 컨테이너 크기 변동 시 재맞춤 */
  fit: () => void;
  /** 실물키보드 패널 모디파이어(ctrl/meta) 활성 상태 주입 — OS 키보드 글자를 제어바이트로 변환 */
  setVmods: (flags: { ctrl?: boolean; meta?: boolean }) => void;
  /** xterm 포커스 → OS 소프트 키보드 복귀 */
  focus: () => void;
  /** xterm 입력 블러 → OS 소프트 키보드 내림(특수키 패널로 전환 시) */
  blur: () => void;
}

interface Props {
  wsUrl: string;
  onReady?: () => void;
  /** 사용자가 터미널에 입력한 한 줄 명령(Enter 확정) — dev 명령 자동 미리보기 등에 사용 */
  onCommand?: (line: string) => void;
  /** 모디파이어 조합키가 실제로 실행됨 → RN 이 once 모디파이어 해제 */
  onVmodConsume?: () => void;
  /** 터미널 입력 포커스 변화(보조바 즉시 노출용) */
  onFocusChange?: (focused: boolean) => void;
  /** OSC 9/777/99 · 벨 알림 → 인앱 알림 패널/배지 */
  onNotify?: (title: string, body: string) => void;
  /** 터미널 WS (재)접속 성공 — 재접속 시 서버가 재시작됐을 수 있어 view/크기 재보정 트리거용 */
  onWsOpen?: () => void;
  // 토큰 사망 감지 — 즉시실패(3s 미만 생존) 재접속이 연속 3회면 호출. RN 이 새 토큰을 발급해야
  //  복구된다(웹뷰 내부 루프는 같은 URL 만 재시도 — back 재배포로 토큰이 증발하면 영원히 502).
  onWsDead?: () => void;
  /** 터미널 내부 터치(이미 포커스된 상태 포함) — "이 기기서 작업" 신호(크기 회수용, 1.2s 스로틀) */
  onInteract?: () => void;
}

const XTERM_VER = '5.3.0';
const FIT_VER = '0.8.0';
/** 배율 1.0 기준 터미널 폰트 크기(px) — 표시 배율 설정이 여기에 곱해진다. */
const TERM_BASE_FONT = 13;

const buildHtml = (wsUrl: string, fontPx: number) => `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/xterm@${XTERM_VER}/css/xterm.css" />
  <!-- CJK 모노스페이스 웹폰트 — 시스템 폰트(Menlo 등)엔 한글 글리프가 없어 빈칸 렌더됨.
       Nanum Gothic Coding(한글 고정폭)을 폴백으로 로드해 한글도 정상 표시. -->
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Nanum+Gothic+Coding&display=swap" />
  <script src="https://unpkg.com/xterm@${XTERM_VER}/lib/xterm.js"></script>
  <script src="https://unpkg.com/xterm-addon-fit@${FIT_VER}/lib/xterm-addon-fit.js"></script>
  <!-- GPU 렌더러 — 기본 DOM 렌더러는 구형 기기에서 타이핑 에코 표시가 눈에 띄게 느리다.
       WebGL → Canvas → DOM 순 폴백(로드/활성 실패는 조용히 다음 단계). -->
  <script src="https://unpkg.com/xterm-addon-webgl@0.16.0/lib/xterm-addon-webgl.js"></script>
  <script src="https://unpkg.com/xterm-addon-canvas@0.5.0/lib/xterm-addon-canvas.js"></script>
  <style>
    html, body { margin:0; padding:0; height:100%; background:#0A0D14; overflow:hidden; }
    #t { position:absolute; inset:0; padding:6px; }
    /* 네이티브 롱프레스 텍스트선택/붙여넣기 메뉴 억제 — 우리 롱프레스 선택과 충돌. 입력은 helper
       textarea 가 별도로 처리하므로 캔버스/뷰포트의 네이티브 콜아웃만 끈다. */
    #t, .xterm, .xterm-viewport, .xterm-screen { -webkit-user-select:none; user-select:none; -webkit-touch-callout:none; }
    .xterm-viewport::-webkit-scrollbar { width:8px; }
    .xterm-viewport::-webkit-scrollbar-thumb { background:#2A2F3A; border-radius:4px; }
  </style>
</head>
<body>
  <div id="t"></div>
  <!-- 롱프레스 선택 중 안내(기본 숨김). 복사/붙여넣기는 특수키 패널의 ⌘C/⌘V 로 수행(PC 동일). -->
  <div id="selhint" style="position:absolute;top:8px;left:50%;transform:translateX(-50%);z-index:99998;display:none;font:600 12px -apple-system,system-ui,sans-serif;color:#34D399;background:rgba(17,22,32,0.96);border:1px solid #2A2F3A;border-radius:8px;padding:6px 12px;">선택 중… 드래그로 조절 · ⌘C 복사</div>
  <script>
    var post = function(o){ try { window.ReactNativeWebView.postMessage(JSON.stringify(o)); } catch(e){} };
    try {
      var term = new Terminal({
        // CJK 폴백 폰트 추가 — Menlo/Monaco 엔 한글 글리프가 없어 빈칸으로 렌더됨.
        //  iOS='Apple SD Gothic Neo', Android='Noto Sans (Mono) CJK KR' 로 폴백 → 한글 정상 표시.
        cursorBlink: false, fontSize: ${fontPx},
        // 'Nanum Gothic Coding'(한글+Latin 고정폭)을 맨 앞에 — xterm 은 primary 폰트로만 렌더(per-glyph 폴백 X)라
        //  Menlo 를 앞에 두면 한글이 빈칸이 된다. Latin 도 이 폰트로 그려짐(고정폭 유지).
        fontFamily: "'Nanum Gothic Coding', Menlo, Monaco, Consolas, monospace",
        scrollback: 3000, convertEol: false,
        theme: { background:'#0A0D14', foreground:'#E2E8F0', cursor:'#34D399', selectionBackground:'#264F78' }
      });
      var fit = new FitAddon.FitAddon();
      term.loadAddon(fit);
      term.open(document.getElementById('t'));
      try { fit.fit(); } catch(e){}
      // GPU 렌더러 활성 — 키 입력 에코가 화면에 찍히는 속도(렌더 지연)를 크게 줄인다.
      //  WebGL 컨텍스트 유실 시 Canvas 로 강등, 둘 다 실패하면 DOM 렌더러 유지.
      var __useCanvas = function(){
        try { var c = new CanvasAddon.CanvasAddon(); term.loadAddon(c); console.log('[term] renderer=canvas'); return true; }
        catch(e){ console.log('[term] renderer=dom'); return false; }
      };
      try {
        var __gl = new WebglAddon.WebglAddon();
        __gl.onContextLoss(function(){ try { __gl.dispose(); } catch(e){} __useCanvas(); });
        term.loadAddon(__gl);
        console.log('[term] renderer=webgl');
      } catch(e) { __useCanvas(); }
      // 웹폰트(Nanum Gothic Coding) 로드 완료 후 재렌더 — 로드 전엔 한글이 빈칸으로 그려지므로.
      try {
        if (document.fonts && document.fonts.load) {
          document.fonts.load("13px 'Nanum Gothic Coding'").catch(function(){});
          document.fonts.ready.then(function(){ try {
            // xterm 은 open() 시점의 폰트로 글자폭을 캐시한다. 웹폰트가 그 뒤 로드되면
            //  fontFamily 를 재할당해 강제 재측정시켜야 한글(Nanum)로 다시 그려진다.
            term.options.fontFamily = 'monospace';
            term.options.fontFamily = "'Nanum Gothic Coding', Menlo, Monaco, Consolas, monospace";
            fit.fit(); term.refresh(0, term.rows - 1);
          } catch(e){} });
        }
      } catch(e){}
      // 소프트 키보드 예측/자동수정 끄기(가능한 키보드 한정).
      var __ta = document.querySelector('.xterm-helper-textarea');
      if (__ta) {
        __ta.setAttribute('autocorrect', 'off');
        __ta.setAttribute('autocapitalize', 'off');
        __ta.setAttribute('autocomplete', 'off');
        __ta.setAttribute('spellcheck', 'false');
        __ta.setAttribute('enterkeyhint', 'send');
        // 포커스 즉시 RN 통지 → 보조바를 keyboardDidShow(느림) 전에 미리 노출.
        __ta.addEventListener('focus', function(){ post({ type:'focus', focused:true }); });
        // xterm 은 blur 시 textarea.value 를 비운다 — 미러(__sentBuf)도 함께 비워야
        //  복귀 후 첫 입력의 델타가 "옛 텍스트 길이만큼 백스페이스"를 쏘지 않는다.
        __ta.addEventListener('blur', function(){ try { __commitComp(); __resetBuf(); } catch(e){} post({ type:'focus', focused:false }); });
      }
      term.focus();
      // 터미널 내부 터치 = "이 기기서 작업" 신호 — 이미 포커스된 상태면 focus 이벤트가 다시 안 떠서
      //  크기 회수(select)가 안 나가므로, 터치 자체를 RN 에 통지(1.2s 스로틀로 브리지/RPC 폭주 방지).
      var __lastTouch = 0;
      document.addEventListener('touchstart', function(){
        var n = Date.now();
        if (n - __lastTouch > 1200) { __lastTouch = n; post({ type:'interact' }); }
      }, true);
      // OSC 알림(iTerm 9 / 777 notify;title;body / 99) + 벨 → RN 으로 통지(인앱 알림 패널·배지).
      try {
        term.parser.registerOscHandler(9, function(d){ post({ type:'notify', title:'', body:String(d) }); return true; });
        term.parser.registerOscHandler(777, function(d){ var p=String(d).split(';'); if(p[0]==='notify') post({ type:'notify', title:p[1]||'', body:p.slice(2).join(';') }); return true; });
        term.parser.registerOscHandler(99, function(d){ post({ type:'notify', title:'', body:String(d).replace(/^.*?;/,'') }); return true; });
        if (term.onBell) term.onBell(function(){ post({ type:'notify', title:'', body:'알림' }); });
      } catch(e){}
      // 앱의 마우스 트래킹(스크롤 캡처) 모드 추적 — claude 같은 alt-screen TUI 는 대화 스크롤을
      //  "마우스 휠"로 받는다(모드 1000/1002/1003 DECSET). 모드가 켜졌는지 알아야 터치 스와이프를
      //  휠로 변환할지(TUI) 네이티브 스크롤백 스크롤에 맡길지(일반 셸) 구분한다. registerCsiHandler 는
      //  false 를 반환해 xterm 기본 처리도 그대로 태운다(모드 자체는 xterm 이 적용).
      var __mouseOn = false;
      try {
        term.parser.registerCsiHandler({ prefix:'?', final:'h' }, function(params){
          for (var i=0;i<params.length;i++){ var p=params[i]; if(p===1000||p===1002||p===1003){ __mouseOn = true; } }
          return false;
        });
        term.parser.registerCsiHandler({ prefix:'?', final:'l' }, function(params){
          for (var i=0;i<params.length;i++){ var p=params[i]; if(p===1000||p===1002||p===1003){ __mouseOn = false; } }
          return false;
        });
      } catch(e){}
      // 마우스 모드 활성 여부 — xterm 5.3 의 term.modes 우선, 없으면 위 플래그 폴백.
      var __mouseActive = function(){
        try { if (term.modes && typeof term.modes.mouseTrackingMode === 'string') return term.modes.mouseTrackingMode !== 'none'; } catch(e){}
        return __mouseOn;
      };
      var enc = new TextEncoder();
      var WS_URL = ${JSON.stringify(wsUrl)};
      var ws = null;
      var __keepalive = null, __reconnTimer = null, __retryDelay = 1000, __firstConn = true;
      var __lastSentC = 0, __lastSentR = 0, __rzTimer = null;
      var sendResize = function(){ try { if (ws && ws.readyState === 1) { __lastSentC = term.cols; __lastSentR = term.rows; ws.send(JSON.stringify({ type:'resize', cols: term.cols, rows: term.rows })); } } catch(e){} };
      // fit 기반 리사이즈 전송은 400ms 디바운스 + 동일 크기 스킵 — 웹뷰 간 포커스 이동으로 소프트
      //  키보드가 잠깐 내려갔다 올라오면 grow→shrink 가 연달아 오는데, 크기 변경마다 셸이(SIGWINCH)
      //  프롬프트를 새 줄에 다시 찍어 스크롤백에 쌓였다(실측: 높이 플립 10회 = 프롬프트 12줄).
      //  정착된 크기가 직전 전송과 같으면 아예 보내지 않는다. 로컬 fit(화면 맞춤)은 즉시라 시각 지연 없음.
      var queueResize = function(){
        if (__rzTimer) clearTimeout(__rzTimer);
        __rzTimer = setTimeout(function(){
          __rzTimer = null;
          if (term.cols === __lastSentC && term.rows === __lastSentR) return;
          sendResize();
        }, 400);
      };
      var connect = function(){
        try { ws = new WebSocket(WS_URL); } catch(e){ return; }
        ws.binaryType = 'arraybuffer';
        var __openAt = Date.now();
        ws.onopen = function(){
          __openAt = Date.now();
          post({ type:'wsopen' });
          __retryDelay = 1000;
          if (!__firstConn) { try { term.write('\\r\\n\\x1b[90m[재연결됨]\\x1b[0m\\r\\n'); } catch(e){} }
          __firstConn = false;
          sendResize();
          // Keepalive — Cloudflare 는 ping/pong 을 유휴로 볼 수 있어, 25초마다 데이터 프레임(resize)으로 연결 유지.
          if (__keepalive) clearInterval(__keepalive);
          __keepalive = setInterval(function(){ if (ws && ws.readyState === 1) { sendResize(); post({ type:'ka' }); } }, 25000);
        };
        ws.onmessage = function(e){ try { if (typeof e.data === 'string') term.write(e.data); else term.write(new Uint8Array(e.data)); } catch(err){} };
        ws.onclose = function(ev){
          post({ type:'wsclose', code: ev && ev.code, reason: (ev && ev.reason) || '', clean: !!(ev && ev.wasClean), aliveMs: Date.now() - __openAt });
          if (__keepalive) { clearInterval(__keepalive); __keepalive = null; }
          // 자동 재연결 — 같은 토큰(TTL 1h) 으로 재접속해 "세션 종료" 없이 유지. (새 셸이라 cwd 는 프로젝트 루트로)
          //  즉시 실패(3초 미만 생존 = 서버측 스폰 실패 등)가 반복되면 백오프 상한을 30초로 올려
          //  재접속 폭주가 데몬 자원(pty)을 갉아먹지 않게 한다.
          if (__reconnTimer) clearTimeout(__reconnTimer);
          __reconnTimer = setTimeout(connect, __retryDelay);
          var __cap = (Date.now() - __openAt < 3000) ? 30000 : 10000;
          __retryDelay = Math.min(__retryDelay * 2, __cap);
        };
        ws.onerror = function(){ post({ type:'wserror' }); try { ws.close(); } catch(e){} };
      };
      connect();
      var send = function(s){ try { if (ws && ws.readyState === 1) { ws.send(enc.encode(String(s))); } } catch(e){} };
      // === 입력을 우리가 단독 처리(xterm 기본 전송은 전부 차단) — 모바일 IME 중복/충돌 방지 ===
      //  document 캡처 단계에서 가로채 stopImmediatePropagation 으로 xterm 의 textarea 핸들러를 막는다.
      //  (캡처는 target(텍스트영역)보다 먼저 실행 → xterm 이 같은 키/입력을 또 보내는 중복을 원천 차단)
      //  · 특수키(Enter/Tab/방향키/Backspace/Ctrl-x): keydown 에서 시퀀스 직접 전송 + preventDefault
      //  · 텍스트(조합 포함): input 의 증가분(delta)만 즉시 전송 → 예측 입력 켜둬도 한 글자씩 실시간
      //  · 조합 중 백스페이스/자동수정(앞글자 변경): 공통 접두사 이후를 \\x7f 로 지우고 새 꼬리 전송
      var __sentBuf = '';
      // 실물키보드 특수키 패널: ctrl 잠금 상태 — OS 키보드로 친 글자를 제어바이트로 변환.
      //  meta(⌘)는 터미널 제어키가 아니므로 무시(⌘ 잠근 채 터미널 오면 입력이 다 컨트롤문자로 바뀌는 버그 방지).
      var __vmods = { ctrl:false, meta:false };
      window.__term_setVmods = function(m){ __vmods = { ctrl: !!(m && m.ctrl), meta: !!(m && m.meta) }; };
      // 복사/붙여넣기 — 터미널 레벨 동작(셸로 보내지 않음). ⌘C=선택 복사, ⌘V=클립보드 붙여넣기, ⌘A=전체선택.
      var __doCopy = function(){ try { var t = term.getSelection(); if (t) post({ type:'clipboard', text: t }); } catch(e){} };
      var __doPaste = function(){ post({ type:'paste-request' }); };   // RN 이 네이티브 클립보드 읽어 __term_paste 로 주입
      var __doSelectAll = function(){ try { term.selectAll(); } catch(e){} };
      // RN → 붙여넣기: bracketed paste 모드면 마커로 감싸 앱(claude 등)이 리터럴로 받게(자동실행 방지).
      window.__term_paste = function(s){ try { var txt = String(s == null ? '' : s); if (!txt) return; var bp = false; try { bp = !!(term.modes && term.modes.bracketedPasteMode); } catch(e){} send(bp ? ('\\x1b[200~' + txt + '\\x1b[201~') : txt); } catch(e){} };
      window.__term_focus = function(){ try { term.focus(); } catch(e){} };
      window.__term_blur = function(){ try { if (__ta && __ta.blur) __ta.blur(); if (term.blur) term.blur(); } catch(e){} };
      // 현재 입력 라인 추정(명령 감지용) — Enter 시 onCommand 로 보고, 백스페이스/Ctrl-C 로 보정.
      var __line = '';
      var __resetBuf = function(){ __sentBuf = ''; if (__ta) { try { __ta.value = ''; } catch(e){} } };
      var SEQ = {
        'Enter':'\\r', 'Tab':'\\t', 'Backspace':'\\x7f', 'Escape':'\\x1b', 'Delete':'\\x1b[3~',
        'ArrowUp':'\\x1b[A', 'ArrowDown':'\\x1b[B', 'ArrowRight':'\\x1b[C', 'ArrowLeft':'\\x1b[D',
        'Home':'\\x1b[H', 'End':'\\x1b[F'
      };
      var __isTermTarget = function(t){ return !__ta || t === __ta || t === document.body || t === document; };
      // iOS(WKWebView)는 일반 ASCII 글자를 칠 때 helper textarea 에 'input' 이벤트를 안 냄(keydown 만 옴)
      //  → 아래 input 델타 로직이 안 돌아 글자가 전송 안 됨. iOS 는 keydown 에서 직접 보낸다.
      //  (한글 등 조합 문자는 keydown key 가 non-ASCII 로 오고 iOS 가 input insertText/deleteContentBackward
      //   로 조합을 처리하므로 여기서 보내지 않고 그대로 input 핸들러에 맡긴다.)
      var __isIOS = /iP(ad|hone|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

      // ── 한글 조합기(자모 → 음절) ──
      //  iOS(실물/맥 키보드)는 한글 자모를 조합 없이 낱자(keydown)로 흘려보내 'ㄱㅏㄴㅏㄷㅏ' 처럼 찍힌다.
      //  표준 2벌식 오토마타로 음절('가나다')을 조합한다. 조합 중 음절은 백스페이스-치환으로 갱신.
      var HG = (function(){
        var CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
        var JUNG = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
        var JONG = ['','ㄱ','ㄲ','ㄳ','ㄴ','ㄵ','ㄶ','ㄷ','ㄹ','ㄺ','ㄻ','ㄼ','ㄽ','ㄾ','ㄿ','ㅀ','ㅁ','ㅂ','ㅄ','ㅅ','ㅆ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
        var choI={}, jungI={}, jongI={};
        for (var a=0;a<CHO.length;a++) choI[CHO.charAt(a)]=a;
        for (var b=0;b<JUNG.length;b++) jungI[JUNG.charAt(b)]=b;
        for (var c=0;c<JONG.length;c++) if (JONG[c]) jongI[JONG[c]]=c;
        var vowel = { '8,0':9,'8,1':10,'8,20':11,'13,4':14,'13,5':15,'13,20':16,'18,20':19 }; // 겹모음
        var jcomb = { '1,ㅅ':3,'4,ㅈ':5,'4,ㅎ':6,'8,ㄱ':9,'8,ㅁ':10,'8,ㅂ':11,'8,ㅅ':12,'8,ㅌ':13,'8,ㅍ':14,'8,ㅎ':15,'17,ㅅ':18 }; // 겹받침 합치기
        var jsplit = { '3':['ㄱ','ㅅ'],'5':['ㄴ','ㅈ'],'6':['ㄴ','ㅎ'],'9':['ㄹ','ㄱ'],'10':['ㄹ','ㅁ'],'11':['ㄹ','ㅂ'],'12':['ㄹ','ㅅ'],'13':['ㄹ','ㅌ'],'14':['ㄹ','ㅍ'],'15':['ㄹ','ㅎ'],'18':['ㅂ','ㅅ'] }; // 겹받침 쪼개기
        var cho=-1, jung=-1, jong=0;
        function cur(){
          if (cho>=0 && jung>=0) return String.fromCharCode(0xAC00 + (cho*21+jung)*28 + jong);
          if (cho>=0) return CHO.charAt(cho);
          if (jung>=0) return JUNG.charAt(jung);
          return '';
        }
        function reset(){ cho=-1; jung=-1; jong=0; }
        function isJamo(ch){ return choI[ch]!==undefined || jungI[ch]!==undefined; }
        function feed(ch){
          var flush='';
          if (jungI[ch]!==undefined){                    // 모음
            var v=jungI[ch];
            if (cho>=0 && jung<0 && jong===0){ jung=v; }
            else if (cho>=0 && jung>=0 && jong===0){
              var cm=vowel[jung+','+v];
              if (cm!==undefined){ jung=cm; } else { flush=cur(); cho=-1; jung=v; jong=0; }
            }
            else if (cho>=0 && jung>=0 && jong!==0){       // 받침이 다음 초성으로 이동
              var sp=jsplit[String(jong)], movedCh, rem;
              if (sp){ rem=jongI[sp[0]]; movedCh=sp[1]; } else { rem=0; movedCh=JONG[jong]; }
              jong=rem; flush=cur();
              cho=choI[movedCh]; jung=v; jong=0;
            }
            else if (jung>=0){
              var cm2=vowel[jung+','+v];
              if (cm2!==undefined){ jung=cm2; } else { flush=cur(); cho=-1; jung=v; jong=0; }
            }
            else { jung=v; }
          }
          else if (choI[ch]!==undefined){                // 자음
            var cc2=choI[ch], jg=jongI[ch];
            if (cho<0 && jung<0){ cho=cc2; }
            else if (cho>=0 && jung<0){ flush=cur(); cho=cc2; jung=-1; jong=0; }
            else if (cho>=0 && jung>=0 && jong===0){
              if (jg!==undefined){ jong=jg; } else { flush=cur(); cho=cc2; jung=-1; jong=0; }
            }
            else if (cho>=0 && jung>=0 && jong!==0){
              var jc=jcomb[jong+','+ch];
              if (jc!==undefined){ jong=jc; } else { flush=cur(); cho=cc2; jung=-1; jong=0; }
            }
            else if (cho<0 && jung>=0){ flush=cur(); cho=cc2; jung=-1; jong=0; }
            else { cho=cc2; }
          }
          return { flush: flush, marked: cur() };
        }
        return { feed:feed, reset:reset, isJamo:isJamo };
      })();
      // 현재 화면에 떠 있는(지울 수 있는) 조합 음절.
      var __compMarked = '';
      function __eraseMarked(){ for (var q=0;q<__compMarked.length;q++){ send('\\x7f'); } if (__compMarked){ __line=__line.slice(0, Math.max(0, __line.length - __compMarked.length)); } }
      function __applyComp(res){ __eraseMarked(); var out=res.flush+res.marked; if (out){ send(out); __line+=out; } __compMarked=res.marked; }
      function __commitComp(){ HG.reset(); __compMarked=''; }   // 조합 확정(화면 유지, 상태만 리셋)

      document.addEventListener('keydown', function(e){
        if (!__isTermTarget(e.target)) return;
        // ⌘(meta) + 글자 → 터미널 명령(복사/붙여넣기/전체선택) — 셸로 안 보냄(실물 키보드).
        if (e.metaKey && !e.ctrlKey && e.key && e.key.length === 1) {
          var mk = e.key.toLowerCase();
          if (mk === 'c') { __doCopy(); e.preventDefault(); e.stopImmediatePropagation(); return; }
          if (mk === 'v') { __doPaste(); e.preventDefault(); e.stopImmediatePropagation(); return; }
          if (mk === 'a') { __doSelectAll(); e.preventDefault(); e.stopImmediatePropagation(); return; }
        }
        // Ctrl + 글자 → 제어문자(Ctrl-C=\x03 등)
        if (e.ctrlKey && e.key && e.key.length === 1) {
          var cc = e.key.toLowerCase().charCodeAt(0);
          if (cc >= 97 && cc <= 122) { __commitComp(); send(String.fromCharCode(cc - 96)); __resetBuf(); __line = ''; e.preventDefault(); e.stopImmediatePropagation(); return; }
        }
        var seq = SEQ[e.key];
        if (e.key === 'Tab' && e.shiftKey) seq = '\\x1b[Z';   // 역탭(CSI Z) — Claude Code 모드 전환 등
        if (seq) {
          __commitComp();
          send(seq); __resetBuf();
          if (e.key === 'Enter') { var __c = __line.trim(); __line = ''; if (__c) post({ type:'command', line: __c }); }
          else if (e.key === 'Backspace') { __line = __line.slice(0, -1); }
          e.preventDefault(); e.stopImmediatePropagation(); return;
        }
        // iOS: input 이벤트가 안 오는 인쇄가능 글자는 여기서 직접 처리.
        //  · 한글 자모 → 조합기(HG)로 음절 조합
        //  · ASCII·완성형 한글·기타 non-ASCII → 조합 확정 후 그대로 전송
        //  조합 중(isComposing)·조합키(keyCode 229)는 제외 → 소프트 키보드 조합은 아래 input 이 처리.
        if (__isIOS && !e.isComposing && e.keyCode !== 229 && e.key && e.key.length === 1) {
          if (HG.isJamo(e.key)) { __applyComp(HG.feed(e.key)); e.preventDefault(); e.stopImmediatePropagation(); return; }
          var kc0 = e.key.charCodeAt(0);
          if (kc0 >= 0x20 && kc0 !== 0x7f) { __commitComp(); send(e.key); __line += e.key; __resetBuf(); e.preventDefault(); e.stopImmediatePropagation(); return; }
        }
        // 일반 글자 keydown 은 안드로이드에서 keyCode 229(조합) 로만 오므로 무시 — 아래 input 이 처리.
      }, true);
      document.addEventListener('input', function(e){
        if (!__isTermTarget(e.target)) return;
        e.stopImmediatePropagation();                 // xterm 이 같은 입력을 또 보내지 못하게
        var v = (__ta && __ta.value) || '';
        if (v === __sentBuf) return;
        var i = 0, n = Math.min(v.length, __sentBuf.length);
        while (i < n && v.charAt(i) === __sentBuf.charAt(i)) i++;
        var __tail = v.slice(i);
        // 패널에서 ⌘(meta) 를 잠근 뒤 OS 키보드로 글자 1개 → 터미널 명령. c=복사 v=붙여넣기 a=전체선택.
        //  그 외 ⌘+글자는 글자 미입력(⌘는 명령 모디파이어). 처리 후 once 모디파이어 해제 통지.
        if (__vmods.meta && __tail.length === 1) {
          var __mk = __tail.toLowerCase();
          if (__mk === 'c') __doCopy(); else if (__mk === 'v') __doPaste(); else if (__mk === 'a') __doSelectAll();
          __resetBuf(); post({ type:'vmodConsume' }); return;
        }
        // 패널에서 ctrl 을 잠근 뒤 OS 키보드로 글자 1개를 치면 → 제어바이트(Ctrl-C=\x03 등)로 변환.
        if (__vmods.ctrl && __tail.length === 1) {
          var __cc = __tail.toLowerCase().charCodeAt(0);
          if (__cc >= 97 && __cc <= 122) { send(String.fromCharCode(__cc - 96)); __resetBuf(); __line = ''; post({ type:'vmodConsume' }); return; }
        }
        for (var k = __sentBuf.length; k > i; k--) { send('\\x7f'); __line = __line.slice(0, -1); } // 바뀐/지운 뒷부분 제거
        if (v.length > i) { send(v.slice(i)); __line += v.slice(i); }                               // 새로 추가된 꼬리 전송
        __sentBuf = v;
      }, true);
      document.addEventListener('compositionend', function(e){
        if (!__isTermTarget(e.target)) return;
        e.stopImmediatePropagation();
        __resetBuf();                                 // 단어 확정 후 버퍼 리셋(다음 입력은 새로 시작)
      }, true);
      document.addEventListener('compositionstart', function(e){
        if (!__isTermTarget(e.target)) return;
        e.stopImmediatePropagation();
      }, true);
      // 스크롤 처리(2모드):
      //  · 일반 셸 = xterm 네이티브 터치 스크롤(스크롤백은 메인 버퍼에 쌓임) — 아무것도 안 함.
      //  · TUI(claude 등, 마우스 트래킹 ON) = alt-screen 이라 xterm 스크롤백이 비어 네이티브 스크롤이
      //    무의미하다. 앱은 대화 스크롤을 "마우스 휠"로 받으므로, 터치 스와이프를 휠 SGR(1006)로 변환해
      //    전송한다. 예전엔 이걸 무조건 주입해 copy-mode/경계 누수가 났으므로 __mouseActive() 로 게이팅.
      //    자연 방향: 손가락 아래로(dy>0) = 이전 대화(위, 휠 up=btn64), 위로 = 최신(아래, 휠 down=btn65).
      // 터치 → 셀 좌표(마우스 SGR 리포트용). 뷰포트 기준이 아니라 term.element 기준 상대좌표로
      //  환산해야(#t 패딩·오프셋 보정) 클릭이 정확한 셀에 떨어진다("Jump to bottom" 같은 1줄 타깃).
      var __cell = function(x, y){
        var r = (term.element && term.element.getBoundingClientRect) ? term.element.getBoundingClientRect() : { left:0, top:0, width:0, height:0 };
        var cw = (term.cols && r.width) ? (r.width / term.cols) : 8;
        var ch = (term.rows && r.height) ? (r.height / term.rows) : 16;
        return {
          col: Math.max(1, Math.min(term.cols || 80, Math.ceil(((x - r.left) || 1) / (cw || 8)))),
          row: Math.max(1, Math.min(term.rows || 24, Math.ceil(((y - r.top) || 1) / (ch || 16))))
        };
      };
      var __sendWheel = function(dir, x, y){ var c = __cell(x, y); send('\\x1b[<' + (dir < 0 ? 64 : 65) + ';' + c.col + ';' + c.row + 'M'); }; // 64=up(older) 65=down(newer)
      var __sendClick = function(x, y){ var c = __cell(x, y); send('\\x1b[<0;' + c.col + ';' + c.row + 'M'); send('\\x1b[<0;' + c.col + ';' + c.row + 'm'); }; // btn0 press+release
      // ── 롱프레스 텍스트 선택(모드 무관) ─────────────────────────────────
      //  길게 누르면 선택 시작 → 드래그로 범위 조절 → 손 떼면 하이라이트 유지. 복사는 ⌘C(특수키 패널).
      //  xterm 공개 API: 같은 줄=정밀(select), 여러 줄=줄 단위(selectLines).
      var __selhint = document.getElementById('selhint');
      var __selecting = false, __selAnchor = null;
      var __absRow = function(cellRow){ var vy = 0; try { vy = term.buffer.active.viewportY || 0; } catch(e){} return vy + (cellRow - 1); };
      var __applySel = function(a, b){
        try {
          var r0 = __absRow(a.row), r1 = __absRow(b.row);
          if (r0 === r1) { var c0 = Math.min(a.col, b.col) - 1, c1 = Math.max(a.col, b.col); term.select(Math.max(0, c0), r0, Math.max(1, c1 - c0)); }
          else { term.selectLines(Math.min(r0, r1), Math.max(r0, r1)); }
        } catch(e){}
      };
      var __hasSel = function(){ try { return !!term.getSelection(); } catch(e){ return false; } };
      var __clearSel = function(){ try { term.clearSelection(); } catch(e){} __selhint.style.display = 'none'; __selecting = false; };
      // 스와이프 = 휠. 성능: 매 touchmove 마다 즉시 휠을 쏘면 빠른 스와이프가 원격 claude 에 휠 폭주를
      //  일으켜(라운드트립마다 전체 재그리기) 버벅인다. rAF 로 프레임당 최대 MAXN notch 만 합쳐 전송.
      var WHEEL_STEP_PX = 20, WHEEL_MAX_PER_FRAME = 5, LONGPRESS_MS = 380, MOVE_TOL = 12;
      var __swActive = false, __swMoved = false, __swT0 = 0;
      var __swX0 = 0, __swY0 = 0, __swPrevY = 0, __swAcc = 0, __swLX = 0, __swLY = 0, __rafOn = false, __lpTimer = null;
      var __clearLp = function(){ if (__lpTimer) { clearTimeout(__lpTimer); __lpTimer = null; } };
      var __flushWheel = function(){
        __rafOn = false;
        var n = 0;
        while (Math.abs(__swAcc) >= WHEEL_STEP_PX && n < WHEEL_MAX_PER_FRAME) {
          if (__swAcc > 0) { __sendWheel(-1, __swLX, __swLY); __swAcc -= WHEEL_STEP_PX; }  // 손가락 아래로 = older(위)
          else { __sendWheel(1, __swLX, __swLY); __swAcc += WHEEL_STEP_PX; }
          n++;
        }
        if (Math.abs(__swAcc) >= WHEEL_STEP_PX * 8) __swAcc = 0; // 과한 잔량은 폐기(폭주 방지)
      };
      var __tEl = document.getElementById('t');
      // 네이티브 컨텍스트(붙여넣기) 메뉴 억제 — 롱프레스 선택과 충돌 방지.
      document.addEventListener('contextmenu', function(e){ try { e.preventDefault(); } catch(_){} }, false);
      __tEl.addEventListener('touchstart', function(e){
        if (!e.touches || e.touches.length !== 1) { __swActive = false; __clearLp(); return; }
        if (__hasSel()) __clearSel();                          // 선택 있으면 터치로 해제(PC 동일)
        var x = e.touches[0].clientX, y = e.touches[0].clientY;
        __swActive = true; __swMoved = false; __swT0 = Date.now();
        __swX0 = __swLX = x; __swY0 = __swPrevY = __swLY = y; __swAcc = 0;
        __selecting = false; __selAnchor = null;
        __clearLp();
        __lpTimer = setTimeout(function(){                     // 안 움직이고 유지 → 선택 시작
          __lpTimer = null;
          if (!__swActive || __swMoved) return;
          // helper textarea 를 blur — 포커스된 편집영역의 네이티브 '붙여넣기' 메뉴(롱프레스)가 뜨는 걸 막는다.
          //  (Android 롱프레스 임계 ~500ms 보다 먼저 380ms 에 blur → 메뉴 미출현. 이후 탭으로 재포커스)
          try { if (__ta && __ta.blur) __ta.blur(); } catch(e){}
          __selecting = true; __selAnchor = __cell(__swLX, __swLY);
          try { term.clearSelection(); } catch(e){}
          __applySel(__selAnchor, __selAnchor);
          __selhint.style.display = 'block';
        }, LONGPRESS_MS);
      }, { passive:false });
      __tEl.addEventListener('touchmove', function(e){
        if (!__swActive || !e.touches || e.touches.length !== 1) return;
        var y = e.touches[0].clientY, x = e.touches[0].clientX;
        __swLX = x; __swLY = y;
        if (!__swMoved && (Math.abs(y - __swY0) > MOVE_TOL || Math.abs(x - __swX0) > MOVE_TOL)) __swMoved = true;
        if (__selecting) { e.preventDefault(); __applySel(__selAnchor, __cell(x, y)); return; }  // 드래그로 선택 범위 조절
        if (__swMoved) __clearLp();                            // 움직임 = 스크롤 → 롱프레스 취소
        if (!__mouseActive()) return;                          // 일반 셸 = 네이티브 스크롤
        __swAcc += (y - __swPrevY); __swPrevY = y;
        if (Math.abs(__swAcc) >= WHEEL_STEP_PX) {
          e.preventDefault();
          if (!__rafOn) { __rafOn = true; requestAnimationFrame(__flushWheel); }
        }
      }, { passive:false });
      __tEl.addEventListener('touchend', function(){
        var was = __swActive; __swActive = false; __clearLp();
        if (__selecting) { __selecting = false; __selhint.style.display = 'none'; return; }   // 선택 유지(하이라이트) → ⌘C 로 복사
        // 탭(이동 거의 없음 + 짧게) = claude 클릭 UI("Jump to bottom" 등) 실행 → 마우스 클릭 리포트.
        if (was && __mouseActive() && !__swMoved && (Date.now() - __swT0) <= 500) __sendClick(__swLX, __swLY);
      }, { passive:false });
      __tEl.addEventListener('touchcancel', function(){ __swActive = false; __clearLp(); if (__selecting) { __selecting = false; __selhint.style.display = 'none'; } }, { passive:false });
      window.addEventListener('resize', function(){ try { fit.fit(); queueResize(); } catch(e){} });
      // RN → WebView 브리지
      window.__term_send = function(s){ send(s); };
      window.__term_write = function(s){ try { term.write(String(s).replace(/\\r?\\n/g, '\\r\\n')); } catch(e){} };
      window.__term_clear = function(){ try { term.clear(); } catch(e){} };
      window.__term_fit = function(){ try { fit.fit(); queueResize(); } catch(e){} };
      // 표시 배율(기기 로컬 설정) — 폰트 크기 변경 후 fit 재실행 → cols/rows 재계산 → 기존 경로로 리사이즈 전송.
      window.__term_setFontSize = function(px){ try { if (term.options.fontSize !== px) { term.options.fontSize = px; fit.fit(); queueResize(); } } catch(e){} };
      post({ type:'ready' });
    } catch (e) {
      document.body.innerHTML = '<div style="color:#F87171;font-family:monospace;font-size:12px;padding:12px;">터미널 초기화 오류: ' + (e && e.message ? e.message : e) + '</div>';
      post({ type:'error', message: String(e && e.message ? e.message : e) });
    }
  </script>
</body>
</html>`;

const TerminalWebView = forwardRef<TerminalHandle, Props>(({ wsUrl, onReady, onCommand, onVmodConsume, onFocusChange, onNotify, onWsOpen, onWsDead, onInteract }, ref) => {
  const webRef = useRef<WebView>(null);
  const deadRef = useRef(0); // 즉시실패 재접속 연속 카운트(onWsDead 판정)
  // 기기별 표시 배율 — 폰트 크기(기본 13px)에 곱해 적용. 변경 시 remount 없이 injectJavaScript 로 즉시 반영.
  const displayScale = useDisplayScale();
  const fontPx = Math.max(8, Math.round(TERM_BASE_FONT * displayScale * 2) / 2);
  const fontPxRef = useRef(fontPx);
  fontPxRef.current = fontPx;
  // wsUrl 이 바뀌면(토큰 재발급) WebView 를 새 HTML 로 재마운트. (배율은 재마운트 사유 아님 — 주입으로 갱신)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const html = useMemo(() => buildHtml(wsUrl, fontPxRef.current), [wsUrl]);
  useEffect(() => {
    webRef.current?.injectJavaScript(`window.__term_setFontSize && window.__term_setFontSize(${fontPx}); true;`);
  }, [fontPx]);

  useImperativeHandle(ref, () => ({
    sendKey: (s: string) => { webRef.current?.injectJavaScript(`window.__term_send && window.__term_send(${JSON.stringify(s)}); true;`); },
    write: (text: string) => { webRef.current?.injectJavaScript(`window.__term_write && window.__term_write(${JSON.stringify(text)}); true;`); },
    clear: () => { webRef.current?.injectJavaScript('window.__term_clear && window.__term_clear(); true;'); },
    fit: () => { webRef.current?.injectJavaScript('window.__term_fit && window.__term_fit(); true;'); },
    setVmods: (flags) => { webRef.current?.injectJavaScript(`window.__term_setVmods && window.__term_setVmods(${JSON.stringify(flags || {})}); true;`); },
    focus: () => { webRef.current?.injectJavaScript('window.__term_focus && window.__term_focus(); true;'); },
    blur: () => { webRef.current?.injectJavaScript('window.__term_blur && window.__term_blur(); true;'); },
  }), []);

  const onMessage = useCallback((e: any) => {
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg.type === 'ready') {
        // HTML 은 마운트 시점 배율로 구워짐 — 그 사이 저장값 로드/변경이 있었을 수 있어 ready 때 재적용.
        webRef.current?.injectJavaScript(`window.__term_setFontSize && window.__term_setFontSize(${fontPxRef.current}); true;`);
        onReady?.();
      }
      else if (msg.type === 'command') onCommand?.(String(msg.line || ''));
      else if (msg.type === 'vmodConsume') onVmodConsume?.();
      else if (msg.type === 'clipboard') { try { Clipboard.setString(String(msg.text ?? '')); } catch (_) { /* noop */ } }
      else if (msg.type === 'paste-request') {
        // ⌘V — 네이티브 클립보드를 읽어 WebView 로 주입(터미널 stdin 으로 전송). data: origin WebView 엔 클립보드 없음.
        try { Promise.resolve(Clipboard.getString()).then((text) => { webRef.current?.injectJavaScript(`window.__term_paste && window.__term_paste(${JSON.stringify(String(text || ''))}); true;`); }).catch(() => { /* noop */ }); } catch (_) { /* noop */ }
      }
      else if (msg.type === 'notify') onNotify?.(String(msg.title || ''), String(msg.body || ''));
      else if (msg.type === 'focus') onFocusChange?.(!!msg.focused);
      else if (msg.type === 'interact') onInteract?.();
      else if (msg.type === 'error') console.warn('[Terminal]', msg.message);
      else if (msg.type === 'wsopen') { deadRef.current = 0; onWsOpen?.(); console.warn('[TermWS]', JSON.stringify(msg)); }
      else if (msg.type === 'wsclose') {
        console.warn('[TermWS]', JSON.stringify(msg));
        // 즉시실패 연속 카운트 — 3회면 토큰이 죽은 것(만료/서버 재배포). 정상 수명 후 끊김은 리셋.
        if (typeof msg.aliveMs === 'number' && msg.aliveMs < 3000) {
          deadRef.current += 1;
          if (deadRef.current >= 3) { deadRef.current = 0; onWsDead?.(); }
        } else deadRef.current = 0;
      }
      else if (msg.type === 'wserror' || msg.type === 'ka' || msg.type === 'termdbg') console.warn('[TermWS]', JSON.stringify(msg));
    } catch (_) { /* noop */ }
  }, [onReady, onCommand, onVmodConsume, onFocusChange, onNotify, onWsOpen, onWsDead, onInteract]);

  return (
    <WebView
      ref={webRef}
      originWhitelist={['*']}
      source={{ html }}
      onMessage={onMessage}
      keyboardDisplayRequiresUserAction={false}
      hideKeyboardAccessoryView
      androidLayerType="hardware"
      overScrollMode="never"
      style={{ flex: 1, backgroundColor: '#0A0D14' }}
    />
  );
});

TerminalWebView.displayName = 'TerminalWebView';
export default TerminalWebView;
